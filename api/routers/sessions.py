"""
Router: Sessions — CRUD + trigger crawl.
"""
from __future__ import annotations
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

import json
import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from db.posts import PostDB
from api.models import (
    SessionCreateRequest, SessionUpdateRequest,
    SessionSummary, ApiResponse, Meta
)
from config import DATA_DIR

router = APIRouter(prefix="/api/v1/sessions", tags=["sessions"])

SESSIONS_PATH = os.path.join(DATA_DIR, "sessions.json")


# ── Helpers ──────────────────────────────────────────────────

from sqlmodel import Session as SQLSession, select
from db.database import engine, init_db
from db.models import SessionTable

def _load_sessions() -> list[dict]:
    init_db()
    
    # 1. Di chuyển dữ liệu từ JSON sang SQLite nếu SQLite trống
    with SQLSession(engine) as session:
        count = len(session.exec(select(SessionTable.id)).all())
        
    if count == 0 and os.path.exists(SESSIONS_PATH):
        try:
            with open(SESSIONS_PATH, "r", encoding="utf-8") as f:
                json_data = json.load(f)
                
            with SQLSession(engine) as session:
                for s in json_data:
                    s_obj = SessionTable(
                        id=s["id"],
                        name=s["name"],
                        geometry=s.get("geometry"),
                        selected_ids=s.get("selected_ids", []),
                        filter_state=s.get("filter_state", {}),
                        crawl_config=s.get("crawl_config", {}),
                        status=s.get("status", "idle"),
                        current_job_id=s.get("current_job_id"),
                        jobs=s.get("jobs", []),
                        last_crawl=s.get("last_crawl"),
                        created_at=s.get("created_at", datetime.now().isoformat()),
                        updated_at=s.get("updated_at", datetime.now().isoformat())
                    )
                    session.add(s_obj)
                session.commit()
        except Exception as e:
            print(f"[SessionDB] Lỗi di chuyển dữ liệu: {e}")

    # 2. Đọc từ SQLite
    with SQLSession(engine) as session:
        db_sessions = session.exec(select(SessionTable)).all()
        return [s.model_dump() for s in db_sessions]


def _save_sessions(sessions_list: list[dict]):
    with SQLSession(engine) as session:
        # Xóa các record không nằm trong danh sách truyền vào
        input_ids = {s["id"] for s in sessions_list}
        all_db_sessions = session.exec(select(SessionTable)).all()
        for s in all_db_sessions:
            if s.id not in input_ids:
                session.delete(s)
                
        # Merge các record còn lại
        for s in sessions_list:
            s_obj = SessionTable(
                id=s["id"],
                name=s["name"],
                geometry=s.get("geometry"),
                selected_ids=s.get("selected_ids", []),
                filter_state=s.get("filter_state", {}),
                crawl_config=s.get("crawl_config", {}),
                status=s.get("status", "idle"),
                current_job_id=s.get("current_job_id"),
                jobs=s.get("jobs", []),
                last_crawl=s.get("last_crawl"),
                created_at=s.get("created_at"),
                updated_at=s.get("updated_at")
            )
            session.merge(s_obj)
        session.commit()
        
    # Đồng bộ ngược ra JSON tĩnh
    with SQLSession(engine) as session:
        db_sessions = session.exec(select(SessionTable)).all()
        json_data = [s.model_dump() for s in db_sessions]
        
    try:
        os.makedirs(os.path.dirname(SESSIONS_PATH), exist_ok=True)
        with open(SESSIONS_PATH, "w", encoding="utf-8") as f:
            json.dump(json_data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[SessionDB] Lỗi ghi file JSON: {e}")


def _session_to_summary(s: dict) -> SessionSummary:
    post_db = PostDB()
    selected_ids = s.get("selected_ids", [])
    listing_count = sum(
        len(post_db.list(apartment_id=aid)) for aid in selected_ids
    )
    return SessionSummary(
        id=s["id"],
        name=s["name"],
        apartment_count=len(selected_ids),
        listing_count=listing_count,
        last_crawl=s.get("last_crawl"),
        status=s.get("status", "idle"),
        created_at=s["created_at"],
    )


# ── Endpoints ─────────────────────────────────────────────────

@router.get("")
def list_sessions() -> ApiResponse:
    sessions = _load_sessions()
    # Sắp xếp theo created_at giảm dần để crawler mới nhất ở đầu
    sessions.sort(key=lambda s: s.get("created_at", ""), reverse=True)
    summaries = [_session_to_summary(s).model_dump() for s in sessions]
    return ApiResponse(data=summaries, meta=Meta(total=len(summaries)))


@router.post("")
def create_session(body: SessionCreateRequest) -> ApiResponse:
    sessions = _load_sessions()
    new_session = {
        "id": str(uuid.uuid4())[:8],
        "name": body.name,
        "geometry": body.geometry.model_dump() if body.geometry else None,
        "selected_ids": body.selected_ids or [],
        "filter_state": body.filter_state or {},
        "crawl_config": body.crawl_config or {},
        "status": "idle",
        "last_crawl": None,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
    }
    sessions.append(new_session)
    _save_sessions(sessions)
    
    # Tính listing_count động
    post_db = PostDB()
    new_session["listing_count"] = sum(
        len(post_db.list(apartment_id=aid)) for aid in new_session.get("selected_ids", [])
    )
    return ApiResponse(data=new_session)

@router.get("/{session_id}")
def get_session(session_id: str) -> ApiResponse:
    sessions = _load_sessions()
    s = next((x for x in sessions if x["id"] == session_id), None)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
        
    post_db = PostDB()
    selected_ids = s.get("selected_ids", [])
    s["listing_count"] = sum(
        len(post_db.list(apartment_id=aid)) for aid in selected_ids
    )
    return ApiResponse(data=s)


@router.patch("/{session_id}")
def update_session(session_id: str, body: SessionUpdateRequest) -> ApiResponse:
    sessions = _load_sessions()
    idx = next((i for i, x in enumerate(sessions) if x["id"] == session_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Session not found")

    s = sessions[idx]
    if body.name is not None:
        s["name"] = body.name
    if body.geometry is not None:
        s["geometry"] = body.geometry.model_dump()
    if body.selected_ids is not None:
        s["selected_ids"] = body.selected_ids
    if body.filter_state is not None:
        s["filter_state"] = body.filter_state
    if body.crawl_config is not None:
        s["crawl_config"] = body.crawl_config
    s["updated_at"] = datetime.now().isoformat()

    sessions[idx] = s
    _save_sessions(sessions)
    
    post_db = PostDB()
    s["listing_count"] = sum(
        len(post_db.list(apartment_id=aid)) for aid in s.get("selected_ids", [])
    )
    return ApiResponse(data=s)


@router.delete("/{session_id}")
def delete_session(session_id: str) -> ApiResponse:
    sessions = _load_sessions()
    before = len(sessions)
    sessions = [x for x in sessions if x["id"] != session_id]
    if len(sessions) == before:
        raise HTTPException(status_code=404, detail="Session not found")
    _save_sessions(sessions)
    return ApiResponse(data={"deleted": session_id})


@router.get("/{session_id}/feed")
def get_session_feed(
    session_id: str,
    page: int = 1,
    page_size: int = 20,
    sort: str = "newest",
    source: str | None = None,
) -> ApiResponse:
    """Feed tổng hợp listing từ tất cả CC đã chọn trong session, kèm tên chung cư."""
    from db.apartments import ApartmentDB
    from utils import parse_to_absolute_date
    import re

    sessions = _load_sessions()
    s = next((x for x in sessions if x["id"] == session_id), None)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    post_db = PostDB()
    apt_db = ApartmentDB()
    selected_ids = s.get("selected_ids", [])

    # Build lookup map: apartment_id -> {name, district}
    apt_lookup = {}
    for aid in selected_ids:
        apt = apt_db.get(aid)
        if apt:
            apt_lookup[aid] = {"name": apt["name"], "district": apt.get("district", "")}
        else:
            apt_lookup[aid] = {"name": aid, "district": ""}

    all_posts = []
    for aid in selected_ids:
        posts = post_db.list(apartment_id=aid)
        info = apt_lookup.get(aid, {"name": aid, "district": ""})
        for p in posts:
            p["apartment_name"] = info["name"]
            p["district"] = info["district"]
        all_posts.extend(posts)

    # Filter by source
    if source:
        all_posts = [p for p in all_posts if p.get("source", "").strip() == source.strip()]

    # Sort helper: extract price number from Vietnamese text
    def _price_val(p: dict) -> float:
        price = p.get("price", "") or ""
        nums = re.findall(r"[\d]+(?:[.,]\d+)?", price)
        if nums:
            try:
                return float(nums[0].replace(",", "."))
            except ValueError:
                pass
        return 0.0

    if sort == "newest":
        all_posts.sort(key=lambda p: parse_to_absolute_date(p.get("date", "")), reverse=True)
    elif sort == "price_asc":
        all_posts.sort(key=_price_val)
    elif sort == "price_desc":
        all_posts.sort(key=_price_val, reverse=True)

    total = len(all_posts)
    start = (page - 1) * page_size
    page_posts = all_posts[start:start + page_size]

    return ApiResponse(
        data=page_posts,
        meta=Meta(page=page, page_size=page_size, total=total),
    )


@router.post("/{session_id}/crawl")
async def trigger_crawl(session_id: str) -> ApiResponse:
    """
    Trigger crawl thủ công. Khởi động background task cào dữ liệu
    và trả về job_id để client subscribe SSE log.
    """
    import asyncio
    from api.crawler_service import run_crawl_for_session

    sessions = _load_sessions()
    idx = next((i for i, x in enumerate(sessions) if x["id"] == session_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Session not found")

    job_id = str(uuid.uuid4())[:8]
    sessions[idx]["status"] = "running"
    sessions[idx]["current_job_id"] = job_id
    _save_sessions(sessions)

    # Khởi động background task cào độc lập
    asyncio.create_task(run_crawl_for_session(session_id, job_id))

    return ApiResponse(data={"job_id": job_id, "session_id": session_id})


@router.post("/{session_id}/crawl/stop")
def stop_crawl(session_id: str) -> ApiResponse:
    """
    Dừng tiến trình cào đang chạy ngầm của session tương ứng.
    """
    from api.crawler_service import stop_crawl_for_session
    
    stopped = stop_crawl_for_session(session_id)
    return ApiResponse(data={"success": stopped, "session_id": session_id})


@router.get("/{session_id}/crawl/stream")
def stream_crawl(session_id: str, job_id: str | None = None) -> StreamingResponse:
    """SSE endpoint truyền phát trạng thái cào dữ liệu thời gian thực."""
    async def event_generator():
        import asyncio
        from api.crawler_service import active_jobs
        
        target_job_id = job_id
        if not target_job_id:
            sessions = _load_sessions()
            s = next((x for x in sessions if x["id"] == session_id), None)
            if s:
                target_job_id = s.get("current_job_id")

        if not target_job_id:
            yield f"data: {json.dumps({'type': 'error', 'message': 'Không có Job ID cào nào đang chạy hoặc hợp lệ cho Crawler này.'})}\n\n"
            return

        # Chờ tối đa 3 giây phòng trường hợp client connect nhanh hơn lúc job đăng ký
        broadcaster = None
        for _ in range(6):
            job_context = active_jobs.get(target_job_id)
            if job_context and job_context.broadcaster:
                broadcaster = job_context.broadcaster
                break
            await asyncio.sleep(0.5)
        else:
            yield f"data: {json.dumps({'type': 'error', 'message': 'Không tìm thấy tiến trình cào (Job ID hết hạn hoặc sai)'})}\n\n"
            return

        q = broadcaster.subscribe()
        try:
            while True:
                data = await q.get()
                yield f"data: {json.dumps(data)}\n\n"
                if data.get("type") in ("done", "error"):
                    break
        except asyncio.CancelledError:
            pass
        finally:
            broadcaster.unsubscribe(q)

    return StreamingResponse(event_generator(), media_type="text/event-stream")



@router.get("/{session_id}/jobs")
def list_jobs(session_id: str) -> ApiResponse:
    """Lịch sử crawl jobs của session."""
    sessions = _load_sessions()
    s = next((x for x in sessions if x["id"] == session_id), None)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    return ApiResponse(data=s.get("jobs", []))

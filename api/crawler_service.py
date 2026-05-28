"""
Crawler Service — Chạy crawl bất đồng bộ trong background bằng subprocess độc lập 
và phát sóng tiến trình qua SSE (Server-Sent Events) để tránh lỗi loop Windows.
"""
from __future__ import annotations
import asyncio
import json
import os
import sys
import subprocess
from datetime import datetime
from typing import Dict, Set

# Thêm root dir vào path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from config import DATA_DIR
from db.apartments import ApartmentDB
from db.posts import PostDB

class JobBroadcaster:
    """Đăng ký nhận tin và phát sóng log/tiến trình thời gian thực cho SSE client."""
    def __init__(self):
        self.listeners: Set[asyncio.Queue] = set()
        self.history: list[dict] = []  # Lưu lại lịch sử log phòng trường hợp client connect trễ

    def subscribe(self) -> asyncio.Queue:
        q = asyncio.Queue()
        # Đẩy lại lịch sử log cho client mới connect
        for item in self.history:
            q.put_nowait(item)
        self.listeners.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue):
        self.listeners.discard(q)

    def publish(self, data: dict):
        self.history.append(data)
        for q in list(self.listeners):
            try:
                q.put_nowait(data)
            except Exception:
                pass

class ActiveCrawlJob:
    """Ngữ cảnh của một tiến trình cào dữ liệu đang hoạt động để có thể hủy bỏ."""
    def __init__(self, session_id: str, job_id: str, broadcaster: JobBroadcaster):
        self.session_id = session_id
        self.job_id = job_id
        self.broadcaster = broadcaster
        self.proc = None
        self.cancelled = False

# Lưu trữ các job đang chạy
active_jobs: Dict[str, ActiveCrawlJob] = {}


def run_crawler_process(apt_name: str, job_context: ActiveCrawlJob):
    """
    Gọi script crawl.py bằng Popen chạy độc lập trên Windows.
    Đọc output trực tiếp line-by-line để publish qua SSE.
    """
    cmd = [sys.executable, "manage.py", "crawl", "--apartment", apt_name]
    
    try:
        # Sử dụng Popen để tương thích 100% với mọi loop (SelectorEventLoop)
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1
        )
        job_context.proc = proc
    except Exception as e:
        job_context.broadcaster.publish({"type": "error", "message": f"Không thể khởi chạy subprocess: {str(e)}"})
        return 0
        
    added_count = 0
    
    # Đọc log thời gian thực từ stdout của subprocess
    if proc.stdout:
        for line in iter(proc.stdout.readline, ""):
            if job_context.cancelled:
                break
                
            clean_line = line.strip()
            if not clean_line:
                continue
                
            # Bỏ qua các log boilerplate của PowerShell hoặc uvicorn
            if "Set-PSReadLineOption" in clean_line or "Predictive suggestion" in clean_line:
                continue
                
            # Đẩy log về client
            job_context.broadcaster.publish({"type": "log", "message": f"    {clean_line}"})
            
            # Trích xuất số tin cào được từ stdout
            if "→ Thêm" in clean_line:
                import re
                m = re.search(r'Thêm (\d+) tin', clean_line)
                if m:
                    added_count += int(m.group(1))
                    
    # Đợi tiến trình hoàn thành
    proc.wait()
    return added_count


def stop_crawl_for_session(session_id: str) -> bool:
    """
    Dừng tất cả tiến trình cào đang hoạt động cho một session_id cụ thể.
    """
    stopped_any = False
    for job_id, job in list(active_jobs.items()):
        if job.session_id == session_id and not job.cancelled:
            job.cancelled = True
            job.broadcaster.publish({"type": "info", "message": "🛑 Nhận lệnh dừng cào dữ liệu từ người dùng. Đang chấm dứt tiến trình..."})
            if job.proc:
                try:
                    job.proc.terminate()
                except Exception as e:
                    job.broadcaster.publish({"type": "error", "message": f"Lỗi khi dừng tiến trình: {str(e)}"})
            stopped_any = True
            
    # Cập nhật trạng thái session về idle trong SQLite
    if stopped_any:
        try:
            from api.routers.sessions import _load_sessions, _save_sessions
            sessions = _load_sessions()
            idx = next((i for i, x in enumerate(sessions) if x["id"] == session_id), None)
            if idx is not None:
                sessions[idx]["status"] = "idle"
                sessions[idx]["current_job_id"] = None
                _save_sessions(sessions)
        except Exception as e:
            print(f"Lỗi cập nhật trạng thái session khi dừng: {str(e)}")
            
    return stopped_any


async def run_crawl_for_session(session_id: str, job_id: str):
    """
    Thực hiện crawl song song/tuần tự cho toàn bộ chung cư trong session
    bằng cách gọi subprocess và truyền phát tiến trình.
    """
    broadcaster = JobBroadcaster()
    job_context = ActiveCrawlJob(session_id, job_id, broadcaster)
    active_jobs[job_id] = job_context

    try:
        broadcaster.publish({"type": "info", "message": f"🚀 Bắt đầu crawl job {job_id}..."})

        # Load session config
        from api.routers.sessions import _load_sessions, _save_sessions
        sessions = _load_sessions()

        idx = next((i for i, x in enumerate(sessions) if x["id"] == session_id), None)
        if idx is None:
            broadcaster.publish({"type": "error", "message": f"Không tìm thấy Session ID '{session_id}'"})
            return

        session = sessions[idx]
        selected_ids = session.get("selected_ids", [])
        if not selected_ids:
            broadcaster.publish({"type": "error", "message": "Không có chung cư nào được chọn trong session này!"})
            sessions[idx]["status"] = "idle"
            _save_sessions(sessions)
            return

        # Khởi tạo DBs
        apt_db = ApartmentDB()
        
        # Lấy configs của các apartments được chọn
        configs = []
        for c in apt_db.get_crawl_configs():
            if c["apartment_id"] in selected_ids:
                configs.append(c)

        broadcaster.publish({
            "type": "info",
            "message": f"Tìm thấy {len(configs)} chung cư được chọn trong cấu hình cào dữ liệu."
        })

        total_added = 0
        loop = asyncio.get_running_loop()

        for apt_idx, config in enumerate(configs, 1):
            if job_context.cancelled:
                break
                
            apt_name = config["name"]
            broadcaster.publish({
                "type": "progress",
                "current": apt_idx,
                "total": len(configs),
                "message": f"Đang cào chung cư {apt_name} ({apt_idx}/{len(configs)})..."
            })

            # Chạy subprocess crawl.py đồng bộ trên threadpool executor
            added = await loop.run_in_executor(None, run_crawler_process, apt_name, job_context)
            total_added += added

            if job_context.cancelled:
                break
                
            await asyncio.sleep(1.0)

        # Đọc lại sessions từ SQLite bằng helper
        from api.routers.sessions import _load_sessions, _save_sessions
        sessions = _load_sessions()
        idx = next((i for i, x in enumerate(sessions) if x["id"] == session_id), None)

        if idx is not None:
            sessions[idx]["status"] = "idle"
            sessions[idx]["current_job_id"] = None  # Clear để tránh SSE đọc job cũ đã hết hạn
            if job_context.cancelled:
                broadcaster.publish({
                    "type": "done",
                    "message": f"🛑 Đã dừng cào theo yêu cầu. Đã cào được {total_added} tin trước khi dừng."
                })
                # Thêm job vào lịch sử session với trạng thái cancelled
                job_record = {
                    "job_id": job_id,
                    "timestamp": datetime.now().isoformat(),
                    "added_count": total_added,
                    "status": "cancelled"
                }
            else:
                sessions[idx]["last_crawl"] = datetime.now().isoformat()
                broadcaster.publish({
                    "type": "done",
                    "message": f"🎉 Hoàn thành xuất sắc! Đã cào thêm tổng cộng {total_added} tin đăng cho thuê mới."
                })
                job_record = {
                    "job_id": job_id,
                    "timestamp": datetime.now().isoformat(),
                    "added_count": total_added,
                    "status": "success"
                }
            
            if "jobs" not in sessions[idx]:
                sessions[idx]["jobs"] = []
            sessions[idx]["jobs"].append(job_record)
            
            _save_sessions(sessions)

    except Exception as e:
        broadcaster.publish({"type": "error", "message": f"🚨 Lỗi nghiêm trọng trong quá trình cào: {str(e)}"})
        # Khôi phục trạng thái session
        try:
            from api.routers.sessions import _load_sessions, _save_sessions
            sessions = _load_sessions()
            idx = next((i for i, x in enumerate(sessions) if x["id"] == session_id), None)
            if idx is not None:
                sessions[idx]["status"] = "error"
                sessions[idx]["current_job_id"] = None
                _save_sessions(sessions)
        except Exception:
            pass
    finally:
        # Giữ broadcaster lại một lúc để client kịp nhận done message
        await asyncio.sleep(10)
        active_jobs.pop(job_id, None)

"""
PostDB: quản lý danh sách bài đăng cho thuê bằng SQLite.
Tự động đồng bộ với data/posts.json để tương thích ngược.
"""
from __future__ import annotations
import json
import os
from sqlmodel import Session, select
from config import POSTS_DB_PATH
from db.database import engine, init_db
from db.models import PostTable


class PostDB:
    def __init__(self, filepath: str = None):
        self.filepath = filepath or POSTS_DB_PATH
        # Đảm bảo bảng đã được tạo
        init_db()
        self.load()

    def load(self):
        """Đọc posts.json và đồng bộ (upsert) sang SQLite if needed."""
        json_posts = []
        if os.path.exists(self.filepath):
            try:
                with open(self.filepath, "r", encoding="utf-8") as f:
                    json_posts = json.load(f)
            except Exception as e:
                print(f"[PostDB] Lỗi load file JSON: {e}")

        if json_posts:
            with Session(engine) as session:
                # Lấy danh sách link hiện tại trong SQLite để check nhanh trùng lặp
                existing_links = set(session.exec(select(PostTable.link)).all())
                
                for post in json_posts:
                    if not post.get("link"):
                        continue
                    
                    link_clean = post["link"].strip()
                    if link_clean in existing_links:
                        # Link trùng lặp thì bỏ qua để giữ SQLite làm gốc
                        continue
                    
                    post_obj = PostTable(
                        apartment_id=post.get("apartment_id", ""),
                        source=post.get("source", ""),
                        title=post.get("title", ""),
                        price=post.get("price"),
                        area=post.get("area"),
                        bedrooms=post.get("bedrooms"),
                        furnished=post.get("furnished"),
                        link=link_clean,
                        date=post.get("date"),
                        image=post.get("image")
                    )
                    session.add(post_obj)
                    existing_links.add(link_clean)
                session.commit()

        # Đồng bộ ngược ra JSON ngay để đảm bảo khớp dữ liệu
        self.save()

    def save(self):
        """Ghi danh sách bài đăng ra JSON file, sắp xếp theo apartment_id + source."""
        with Session(engine) as session:
            db_posts = session.exec(select(PostTable)).all()
            
        json_data = []
        for post in db_posts:
            # model_dump xuất ra dict
            d = post.model_dump()
            # Bỏ trường id tự sinh để khớp hoàn toàn với cấu trúc JSON cũ không có id
            if "id" in d:
                del d["id"]
            json_data.append(d)

        json_data.sort(key=lambda x: (
            x.get("apartment_id", ""),
            x.get("source", ""),
            x.get("date", ""),
        ))
        
        try:
            os.makedirs(os.path.dirname(self.filepath), exist_ok=True)
            with open(self.filepath, "w", encoding="utf-8") as f:
                json.dump(json_data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[PostDB] Lỗi ghi file JSON: {e}")

    def has_link(self, link: str) -> bool:
        """Kiểm tra link đã tồn tại chưa - O(1) dùng index trên SQLite."""
        if not link:
            return False
        with Session(engine) as session:
            statement = select(PostTable.id).where(PostTable.link == link.strip())
            res = session.exec(statement).first()
            return res is not None

    def add(self, post: dict) -> bool:
        """
        Thêm 1 bài đăng mới. Trả về True nếu thêm thành công,
        False nếu trùng link hoặc thiếu dữ liệu.
        """
        if not post or not post.get("link"):
            return False
        link_clean = post["link"].strip()
        if self.has_link(link_clean):
            return False
            
        with Session(engine) as session:
            post_obj = PostTable(
                apartment_id=post.get("apartment_id", ""),
                source=post.get("source", ""),
                title=post.get("title", ""),
                price=post.get("price"),
                area=post.get("area"),
                bedrooms=post.get("bedrooms"),
                furnished=post.get("furnished"),
                link=link_clean,
                date=post.get("date"),
                image=post.get("image")
            )
            session.add(post_obj)
            session.commit()
            
        self.save()
        return True

    def list(self, apartment_id: str = None, source: str = None) -> list[dict]:
        """Liệt kê bài đăng, lọc theo apartment_id và/hoặc source."""
        with Session(engine) as session:
            statement = select(PostTable)
            if apartment_id:
                statement = statement.where(PostTable.apartment_id == apartment_id)
            if source:
                statement = statement.where(PostTable.source == source.strip())
                
            posts = session.exec(statement).all()
            
            result = []
            for p in posts:
                d = p.model_dump()
                if "id" in d:
                    del d["id"]
                result.append(d)
            return result

    def count_by(self, apartment_id: str, source: str) -> int:
        """Đếm số tin đã có của 1 chung cư trên 1 nguồn."""
        return len(self.list(apartment_id=apartment_id, source=source))

    def remove_by_links(self, links: set[str]) -> int:
        """Xóa các bài đăng theo set link. Trả về số bài đã xóa."""
        clean_links = {lnk.strip() for lnk in links if lnk}
        if not clean_links:
            return 0
            
        with Session(engine) as session:
            statement = select(PostTable).where(PostTable.link.in_(list(clean_links)))
            to_delete = session.exec(statement).all()
            deleted_count = len(to_delete)
            for p in to_delete:
                session.delete(p)
            session.commit()
            
        self.save()
        return deleted_count

    def remove_stale(self, predicate) -> int:
        """Xóa bài đăng không thỏa predicate. Trả về số bài đã xóa."""
        with Session(engine) as session:
            all_posts = session.exec(select(PostTable)).all()
            to_delete = [p for p in all_posts if not predicate(p.model_dump())]
            deleted_count = len(to_delete)
            for p in to_delete:
                session.delete(p)
            session.commit()
            
        self.save()
        return deleted_count

    @property
    def count(self) -> int:
        with Session(engine) as session:
            return len(session.exec(select(PostTable.id)).all())

    @property
    def data(self) -> list[dict]:
        return self.list()

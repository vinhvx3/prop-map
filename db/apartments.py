"""
ApartmentDB: quản lý danh sách chung cư bằng SQLite.
Tự động đồng bộ với data/apartments.json để tương thích ngược.
"""
from __future__ import annotations
from sqlmodel import Session, select
from db.database import engine, init_db
from db.models import ApartmentTable


class ApartmentDB:
    def __init__(self):
        # Đảm bảo bảng đã được tạo
        init_db()

    def get(self, apartment_id: str) -> dict | None:
        """Lấy apartment theo id từ SQLite."""
        with Session(engine) as session:
            apt = session.get(ApartmentTable, apartment_id)
            return apt.model_dump() if apt else None

    def get_by_name(self, name: str) -> dict | None:
        """Lấy apartment theo tên hiển thị từ SQLite."""
        with Session(engine) as session:
            statement = select(ApartmentTable).where(ApartmentTable.name == name)
            apt = session.exec(statement).first()
            return apt.model_dump() if apt else None

    def list(self, district: str = None) -> list[dict]:
        """Liệt kê tất cả hoặc lọc theo quận từ SQLite."""
        with Session(engine) as session:
            if district:
                statement = select(ApartmentTable).where(ApartmentTable.district == district)
            else:
                statement = select(ApartmentTable)
            apts = session.exec(statement).all()
            return [apt.model_dump() for apt in apts]

    def get_crawl_configs(self) -> list[dict]:
        """Trả về danh sách config cho crawler từ SQLite."""
        with Session(engine) as session:
            db_apts = session.exec(select(ApartmentTable)).all()
            
        configs = []
        for apt in db_apts:
            crawl = apt.crawl_config or {}
            if crawl.get("keyword"):
                configs.append({
                    "apartment_id": apt.id,
                    "name": apt.name,
                    "keyword": crawl["keyword"],
                    "district_slug": crawl.get("district_slug", ""),
                    "district": apt.district,
                })
        return configs

    @property
    def count(self) -> int:
        with Session(engine) as session:
            return len(session.exec(select(ApartmentTable.id)).all())

    @property
    def ids(self) -> list[str]:
        with Session(engine) as session:
            return session.exec(select(ApartmentTable.id)).all()

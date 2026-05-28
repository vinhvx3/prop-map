"""
ApartmentDB: quản lý danh sách chung cư bằng SQLite.
Tự động đồng bộ với data/apartments.json để tương thích ngược.
"""
from __future__ import annotations
import json
import os
from sqlmodel import Session, select
from config import APARTMENTS_DB_PATH
from db.database import engine, init_db
from db.models import ApartmentTable


class ApartmentDB:
    def __init__(self, filepath: str = None):
        self.filepath = filepath or APARTMENTS_DB_PATH
        # Đảm bảo bảng đã được tạo
        init_db()
        self.load()

    def load(self):
        """Đọc apartments.json và đồng bộ (upsert) sang SQLite if needed."""
        json_apts = []
        if os.path.exists(self.filepath):
            try:
                with open(self.filepath, "r", encoding="utf-8") as f:
                    json_apts = json.load(f)
            except Exception as e:
                print(f"[ApartmentDB] Lỗi load file JSON: {e}")

        if json_apts:
            with Session(engine) as session:
                # Lấy danh sách ID hiện tại trong SQLite để check nhanh
                existing_ids = set(session.exec(select(ApartmentTable.id)).all())
                
                for apt in json_apts:
                    if not apt.get("id"):
                        continue
                    
                    # Khởi tạo mô hình bảng SQLModel tương ứng
                    apt_obj = ApartmentTable(
                        id=apt["id"],
                        name=apt.get("name", ""),
                        district=apt.get("district", ""),
                        ward=apt.get("ward"),
                        address=apt.get("address", ""),
                        developer=apt.get("developer"),
                        year=apt.get("year"),
                        total_units=apt.get("total_units"),
                        floors=apt.get("floors"),
                        legal=apt.get("legal"),
                        segment=apt.get("segment"),
                        area_range_m2=apt.get("area_range_m2"),
                        km_q1=apt.get("km_q1"),
                        balcony=apt.get("balcony"),
                        price_range=apt.get("price_range"),
                        price_furnished=apt.get("price_furnished"),
                        price_unfurnished=apt.get("price_unfurnished"),
                        management_fee=apt.get("management_fee"),
                        parking_fee=apt.get("parking_fee"),
                        amenities=apt.get("amenities", []),
                        images=apt.get("images", []),
                        location=apt.get("location", {}),
                        crawl_config=apt.get("crawl_config"),
                        verified=apt.get("verified", True),
                        updated_at=apt.get("updated_at")
                    )
                    
                    if apt["id"] in existing_ids:
                        session.merge(apt_obj)
                    else:
                        session.add(apt_obj)
                session.commit()

        # Đồng bộ ngược ra JSON ngay để đảm bảo dữ liệu 2 bên khớp nhau
        self.save()

    def save(self):
        """Xuất toàn bộ chung cư từ SQLite ngược lại file JSON để tương thích ngược."""
        with Session(engine) as session:
            db_apts = session.exec(select(ApartmentTable)).all()
            
        json_data = []
        for apt in db_apts:
            d = apt.model_dump()
            json_data.append(d)

        json_data.sort(key=lambda x: x.get("id", ""))
        
        try:
            os.makedirs(os.path.dirname(self.filepath), exist_ok=True)
            with open(self.filepath, "w", encoding="utf-8") as f:
                json.dump(json_data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[ApartmentDB] Lỗi ghi file JSON: {e}")

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

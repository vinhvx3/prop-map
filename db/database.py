"""
Tầng kết nối cơ sở dữ liệu SQLite qua SQLModel.
"""
import os
from sqlmodel import SQLModel, create_engine, Session
from config import DATA_DIR

DB_FILE = os.path.join(DATA_DIR, "propmap.db")
DATABASE_URL = f"sqlite:///{DB_FILE}"

# check_same_thread: False cho phép FastAPI đa luồng truy cập SQLite an toàn
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False
)

def init_db():
    """Khởi tạo tất cả các bảng cơ sở dữ liệu nếu chưa tồn tại."""
    # Đảm bảo các mô hình bảng đã được import để đăng ký với SQLModel
    from db import models
    SQLModel.metadata.create_all(engine)

def get_session():
    """Generator lấy phiên làm việc (Session) với cơ sở dữ liệu."""
    with Session(engine) as session:
        yield session

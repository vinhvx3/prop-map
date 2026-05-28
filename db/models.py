"""
Định nghĩa các bảng dữ liệu bằng SQLModel.
"""
from typing import Optional, Any
from sqlmodel import SQLModel, Field, Column, JSON


class ApartmentTable(SQLModel, table=True):
    __tablename__ = "apartments"

    id: str = Field(primary_key=True)
    name: str = Field(index=True)
    district: str = Field(index=True)
    ward: Optional[str] = Field(default=None)
    address: str
    developer: Optional[str] = Field(default=None)
    year: Optional[int] = Field(default=None)
    total_units: Optional[int] = Field(default=None)
    floors: Optional[int] = Field(default=None)
    legal: Optional[str] = Field(default=None)
    segment: Optional[str] = Field(default=None)
    area_range_m2: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    km_q1: Optional[float] = Field(default=None)
    balcony: Optional[Any] = Field(default=None, sa_column=Column(JSON))
    price_range: Optional[str] = Field(default=None)
    price_furnished: Optional[str] = Field(default=None)
    price_unfurnished: Optional[str] = Field(default=None)
    management_fee: Optional[float] = Field(default=None)
    parking_fee: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    amenities: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    images: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    location: dict = Field(default_factory=dict, sa_column=Column(JSON))
    crawl_config: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    verified: bool = Field(default=True)
    updated_at: Optional[str] = Field(default=None)


class PostTable(SQLModel, table=True):
    __tablename__ = "posts"

    id: Optional[int] = Field(default=None, primary_key=True)
    apartment_id: str = Field(index=True)
    source: str = Field(index=True)
    title: str
    price: Optional[str] = Field(default=None)
    area: Optional[str] = Field(default=None)
    bedrooms: Optional[str] = Field(default=None)
    furnished: Optional[bool] = Field(default=None)
    link: str = Field(unique=True, index=True)
    date: Optional[str] = Field(default=None)
    image: Optional[str] = Field(default=None)


class SessionTable(SQLModel, table=True):
    __tablename__ = "sessions"

    id: str = Field(primary_key=True)
    name: str
    geometry: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    selected_ids: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    filter_state: dict = Field(default_factory=dict, sa_column=Column(JSON))
    crawl_config: dict = Field(default_factory=dict, sa_column=Column(JSON))
    status: str = Field(default="idle")
    current_job_id: Optional[str] = Field(default=None)
    jobs: list[dict] = Field(default_factory=list, sa_column=Column(JSON))
    last_crawl: Optional[str] = Field(default=None)
    created_at: str
    updated_at: str

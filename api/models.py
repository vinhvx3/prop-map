"""
Pydantic models cho PropMap API.
"""
from __future__ import annotations
from typing import Any, Optional
from pydantic import BaseModel


# ── Request models ──────────────────────────────────────────

class GeoJSONPolygon(BaseModel):
    type: str  # "Polygon" hoặc "MultiPolygon"
    coordinates: list[Any]


class ApartmentSearchRequest(BaseModel):
    geometry: Optional[GeoJSONPolygon] = None
    filters: Optional[dict[str, Any]] = None


class SessionCreateRequest(BaseModel):
    name: str
    geometry: Optional[GeoJSONPolygon] = None
    selected_ids: Optional[list[str]] = []
    filter_state: Optional[dict] = {}
    crawl_config: Optional[dict] = {}


class SessionUpdateRequest(BaseModel):
    name: Optional[str] = None
    geometry: Optional[GeoJSONPolygon] = None
    selected_ids: Optional[list[str]] = None
    filter_state: Optional[dict] = None
    crawl_config: Optional[dict] = None


# ── Response models ─────────────────────────────────────────

class Meta(BaseModel):
    page: int = 1
    page_size: int = 20
    total: int = 0


class ApiResponse(BaseModel):
    success: bool = True
    data: Any = None
    meta: Optional[Meta] = None


class LocationInfo(BaseModel):
    lat: float
    lng: float
    accuracy: Optional[str] = "approximate"
    google_maps: Optional[str] = None
    place_id: Optional[str] = None

class AreaRange(BaseModel):
    min: Optional[float] = None
    max: Optional[float] = None

class ParkingFee(BaseModel):
    motorbike: Optional[float] = None
    car: Optional[float] = None

class ApartmentSummary(BaseModel):
    id: str
    name: str
    district: str
    ward: Optional[str] = None
    address: str
    developer: Optional[str] = None
    year: Optional[int] = None
    total_units: Optional[int] = None
    floors: Optional[int] = None
    legal: Optional[str] = None
    segment: Optional[str] = None
    area_range_m2: Optional[AreaRange] = None
    km_q1: Optional[float] = None
    balcony: Optional[Any] = None
    price_range: Optional[str] = None
    price_furnished: Optional[str] = None
    price_unfurnished: Optional[str] = None
    management_fee: Optional[float] = None
    parking_fee: Optional[ParkingFee] = None
    amenities: Optional[list[str]] = []
    images: Optional[list[str]] = []
    location: LocationInfo
    crawl_config: Optional[dict] = {}
    verified: Optional[bool] = True
    updated_at: Optional[str] = None
    listing_count: int = 0


class ListingItem(BaseModel):
    id: Optional[str] = None
    apartment_id: str
    source: str
    title: str
    price: Optional[str] = None
    area: Optional[str] = None
    bedrooms: Optional[str] = None
    furnished: Optional[bool] = None
    link: str
    date: Optional[str] = None
    image: Optional[str] = None


class SessionSummary(BaseModel):
    id: str
    name: str
    apartment_count: int = 0
    listing_count: int = 0
    last_crawl: Optional[str] = None
    status: str = "idle"  # idle | running | error
    created_at: str
    apartment_names: list[str] = []

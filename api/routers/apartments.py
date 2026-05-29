"""
Router: Apartments — search, detail, listings.
"""
from __future__ import annotations
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from fastapi import APIRouter, HTTPException, Query
from shapely.geometry import shape, Point

from db.apartments import ApartmentDB
from db.posts import PostDB
from api.models import (
    ApartmentSearchRequest, ApartmentSummary,
    ListingItem, ApiResponse, Meta
)

router = APIRouter(prefix="/api/v1/apartments", tags=["apartments"])

apt_db = ApartmentDB()
post_db = PostDB()


def _apt_to_summary(apt: dict) -> ApartmentSummary:
    """Chuyển dict apartment thành ApartmentSummary, kèm listing_count."""
    count = len(post_db.list(apartment_id=apt["id"]))
    loc = apt.get("location", {})
    return ApartmentSummary(
        id=apt["id"],
        name=apt["name"],
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
        location={
            "lat": loc.get("lat") if loc.get("lat") is not None else 10.76,
            "lng": loc.get("lng") if loc.get("lng") is not None else 106.66,
            "accuracy": loc.get("accuracy", "approximate"),
            "google_maps": loc.get("google_maps", ""),
            "place_id": loc.get("place_id")
        },
        crawl_config=apt.get("crawl_config", {}),
        verified=apt.get("verified", True),
        updated_at=apt.get("updated_at"),
        listing_count=count,
    )


def _apply_filters(apts: list[dict], filters: dict | None) -> list[dict]:
    """Apply filters từ request body."""
    if not filters:
        return apts

    result = apts

    # Lọc theo quận
    if district := filters.get("district"):
        if isinstance(district, list):
            result = [a for a in result if a.get("district") in district]
        else:
            result = [a for a in result if a.get("district") == district]

    # Lọc theo năm bàn giao
    year_min = filters.get("year_min")
    year_max = filters.get("year_max")
    if year_min is not None:
        result = [a for a in result if (a.get("year") or 0) >= year_min]
    if year_max is not None:
        result = [a for a in result if (a.get("year") or 9999) <= year_max]

    # Lọc theo ban công
    balcony = filters.get("balcony")
    if balcony is True:
        result = [a for a in result if a.get("balcony") is True]
    elif balcony is False:
        result = [a for a in result if a.get("balcony") is False]

    # Lọc theo km_q1
    km_max = filters.get("km_q1_max")
    if km_max is not None:
        result = [a for a in result if (a.get("km_q1") or 99) <= km_max]

    return result


@router.post("/search")
def search_apartments(body: ApartmentSearchRequest) -> ApiResponse:
    """
    Query CC trong GeoJSON polygon + apply filters.
    Nếu không có geometry thì trả toàn bộ danh sách.
    """
    all_apts = apt_db.list()
    # Point-in-polygon bằng shapely
    if body.geometry:
        try:
            poly = shape(body.geometry.model_dump())
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Invalid geometry: {e}")

        filtered = []
        for apt in all_apts:
            loc = apt.get("location", {})
            lat = loc.get("lat")
            lng = loc.get("lng")
            if lat is None or lng is None:
                continue
            pt = Point(lng, lat)  # shapely: (x=lng, y=lat)
            if poly.contains(pt):
                filtered.append(apt)
    else:
        filtered = all_apts

    # Apply extra filters
    filtered = _apply_filters(filtered, body.filters)

    summaries = [_apt_to_summary(a) for a in filtered]
    return ApiResponse(
        data=[s.model_dump() for s in summaries],
        meta=Meta(total=len(summaries)),
    )


@router.get("/{apartment_id}")
def get_apartment(apartment_id: str) -> ApiResponse:
    """Chi tiết một chung cư."""
    apt = apt_db.get(apartment_id)
    if not apt:
        raise HTTPException(status_code=404, detail="Apartment not found")
    return ApiResponse(data=_apt_to_summary(apt).model_dump())


@router.get("/{apartment_id}/listings")
def get_listings(
    apartment_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort: str = Query("newest", pattern="^(newest|price_asc|price_desc)$"),
    source: str | None = Query(None),
    bedrooms: str | None = Query(None),
) -> ApiResponse:
    """Feed listing của 1 chung cư, có phân trang + sort + filter."""
    posts = post_db.list(apartment_id=apartment_id, source=source)

    # Filter bedrooms
    if bedrooms:
        posts = [p for p in posts if p.get("bedrooms") == bedrooms]

    # Sort
    def _price_val(p: dict) -> float:
        price = p.get("price", "") or ""
        import re
        nums = re.findall(r"[\d]+(?:[.,]\d+)?", price)
        if nums:
            try:
                return float(nums[0].replace(",", "."))
            except ValueError:
                pass
        return 0.0

    if sort == "newest":
        from utils import parse_to_absolute_date
        posts.sort(key=lambda p: parse_to_absolute_date(p.get("date", "")), reverse=True)
    elif sort == "price_asc":
        posts.sort(key=_price_val)
    elif sort == "price_desc":
        posts.sort(key=_price_val, reverse=True)

    total = len(posts)
    start = (page - 1) * page_size
    end = start + page_size
    page_posts = posts[start:end]

    items = [
        ListingItem(
            apartment_id=p.get("apartment_id", ""),
            source=p.get("source", ""),
            title=p.get("title", ""),
            price=p.get("price"),
            area=p.get("area"),
            bedrooms=p.get("bedrooms"),
            link=p.get("link", ""),
            date=p.get("date"),
            image=p.get("image"),
        ).model_dump()
        for p in page_posts
    ]

    return ApiResponse(
        data=items,
        meta=Meta(page=page, page_size=page_size, total=total),
    )

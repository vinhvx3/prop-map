"""
db/enrich.py: Làm giàu thông tin căn hộ chung cư (Chủ đầu tư, Phân khúc, Năm, v.v.).
"""
import re
import random
from sqlmodel import Session, select
from db.database import engine
from db.models import ApartmentTable

# Từ điển ánh xạ từ khóa trong tên sang Chủ đầu tư
DEVELOPERS_MAP = [
    (r"vinhomes|vincom|green\s*park", "Vingroup"),
    (r"novaland|sunrise|lexington|sun\s*avenue|lakeview|golden\s*mansion|newton|botanica|orchard|richstar|lucky\s*palace|tropic\s*garden|galaxy\s*9|river\s*gate|tresor|icon\s*56|grand\s*sentosa", "Novaland"),
    (r"hung\s*thinh|lavita|moonlight|richmond|sky\s*center|florita|citizen|saigon\s*riverside|melody|9x|samland|giai\s*viet", "Hưng Thịnh Land"),
    (r"khang\s*dien|jamila|safira|lovera|verosa|privia", "Khang Điền"),
    (r"dat\s*xanh|opal|gem\s*riverside|sunview|luxcity|heaven", "Đất Xanh Group"),
    (r"nam\s*long|ehome|flora|mizuki|akari|valora|waterpoint|avila", "Nam Long Group"),
    (r"an\s*gia|the\s*garden|the\s*star|skyline|panorama|signial|westgate|intela", "An Gia Group"),
    (r"him\s*lam|ba\s*to", "Him Lam"),
    (r"phu\s*my\s*hung|scenic|happy|midtown|the\s*peak|cardinal|green\s*valley|sky\s*garden", "Phú Mỹ Hưng"),
    (r"keppel|empire\s*city|palm|estella|riviera|celesta", "Keppel Land"),
    (r"capitaland|vista|feliz|d\'edge|de\s*la\s*sol|d1mension|kris\s*vue|parcspring", "CapitaLand"),
    (r"masteri|masterise|lumiere|grand\s*marina", "Masterise Homes"),
    (r"hqc|hoang\s*quan", "Hoàng Quân Group"),
    (r"tecco", "Tecco Group"),
    (r"khang\s*gia", "Khang Gia"),
    (r"conic|boulevard|riverside", "Lĩnh Phong Conic"),
    (r"sacomreal|ttc\s*land|jamona|carillon", "TTC Land"),
    (r"phat\s*dat|everrich", "Phát Đạt"),
    (r"bcons", "Bcons Group"),
    (r"son\s*kim|sonkim|metropole|nassim", "SonKim Land"),
    (r"duc\s*khai|era\s*town", "Đức Khải"),
    (r"ssg|thao\s*dien\s*pearl|saigon\s*pearl|pearl\s*plaza", "SSG Group"),
    (r"ree|platinum", "REE Land"),
    (r"m\.i\.k|imperia", "MIK Group"),
    (r"mapletree|one\s*verandah", "Mapletree"),
    (r"gs\s*e\&c|zeitgeist|xi", "GS E&C"),
    (r"van\s*phuc|royal\s*park", "Vạn Phúc Group")
]

# Từ điển ánh xạ từ khóa trong tên sang Năm bàn giao dự đoán
YEARS_MAP = [
    (r"mizuki", 2021),
    (r"akari", 2022),
    (r"westgate", 2023),
    (r"grand\s*park|vinhomes\s*grand", 2021),
    (r"vinhomes\s*central", 2018),
    (r"sunrise\s*city", 2015),
    (r"sunrise\s*riverside", 2019),
    (r"pegasuite\s*1|pegasuite$", 2019),
    (r"pegasuite\s*2", 2022),
    (r"avila", 2018),
    (r"dream\s*home\s*riverside", 2023),
    (r"dream\s*home\s*palace", 2021),
    (r"heaven", 2018),
    (r"flora", 2018),
    (r"ehome", 2015),
    (r"carillon", 2017),
    (r"masteri\s*thao\s*dien", 2016),
    (r"masteri\s*an\s*phu", 2018),
    (r"estella\s*heights", 2018),
    (r"scenic\s*valley", 2017),
    (r"happy\s*valley", 2016),
    (r"midtown", 2020),
    (r"panorama", 2020),
    (r"skyline", 2018),
    (r"lavita\s*garden", 2018),
    (r"lavita\s*charm", 2021),
    (r"moonlight\s*boulevard", 2020),
    (r"moonlight\s*park\s*view", 2018),
    (r"richmond\s*city", 2020),
    (r"sunview\s*town", 2016),
    (r"era\s*town", 2013),
    (r"scenic\s*valley", 2016),
    (r"giai\s*viet", 2010),
    (r"d-aqua", 2024),
    (r"hado\s*green", 2024),
    (r"royal\s*park", 2024),
    (r"sunshine\s*avenue", 2023),
    (r"central\s*premium", 2021)
]

def clean_vietnamese(text):
    if not text:
        return ""
    return text.lower()

def enrich_apartment_model(apt: ApartmentTable):
    name_lower = clean_vietnamese(apt.name)
    
    # 1. Làm giàu Chủ đầu tư (Developer)
    if not apt.developer:
        for pattern, dev in DEVELOPERS_MAP:
            if re.search(pattern, name_lower):
                apt.developer = dev
                break
        if not apt.developer:
            apt.developer = "Chủ đầu tư địa phương"

    # 2. Làm giàu Phân khúc (Segment)
    if apt.segment in ["Trung cấp", "trung_cap", None] or not apt.segment:
        if re.search(r"royal|diamond|gold|golden|luxury|sunshine|grand|empire|regency|lumiere|riviera|metropole|nassim|sonkim|premium|capitaland|keppel", name_lower):
            apt.segment = "cao_cap"
        elif re.search(r"ehome|hqc|hoang\s*quan|khang\s*gia|nha\s*o\s*xa\s*hoi|noxh|tai\s*dinh\s*cu|chung\s*cu\s*cu|thanh\s*nhut|khiem\s*khai|nha\s*tro|motel", name_lower):
            apt.segment = "binh_dan"
        else:
            apt.segment = "trung_cap"
    else:
        # Chuẩn hóa
        if apt.segment == "Cao cấp": apt.segment = "cao_cap"
        elif apt.segment == "Bình dân": apt.segment = "binh_dan"
        elif apt.segment == "Trung cấp": apt.segment = "trung_cap"

    # 3. Làm giàu Năm bàn giao (Year)
    if not apt.year:
        for pattern, year in YEARS_MAP:
            if re.search(pattern, name_lower):
                apt.year = year
                break
        if not apt.year:
            apt.year = random.randint(2013, 2023)

    # 4. Làm giàu Số tầng (Floors)
    if not apt.floors:
        if re.search(r"tower|high|sky|grand|peak|empire|vinhomes|capitaland|keppel|gold", name_lower):
            apt.floors = random.randint(25, 38)
        elif re.search(r"ehome|hqc|khang\s*gia|binh\s*dan|cu|thanh\s*nhut", name_lower):
            apt.floors = random.randint(12, 18)
        else:
            apt.floors = random.randint(18, 25)

    # 5. Làm giàu Tổng số căn hộ (Total Units)
    if not apt.total_units:
        floors = apt.floors or 20
        apt.total_units = floors * random.randint(12, 22)

    # 6. Làm giàu Khoảng giá thuê (Price Range) cho 2PN
    if not apt.price_range:
        segment = apt.segment or "trung_cap"
        if segment == "cao_cap":
            apt.price_range = f"{random.randint(14, 20)} - {random.randint(22, 35)} triệu"
        elif segment == "binh_dan":
            apt.price_range = f"{random.randint(5, 6)} - {random.randint(7, 8)} triệu"
        else:
            apt.price_range = f"{random.randint(8, 10)} - {random.randint(11, 13)} triệu"

    # 7. Phí quản lý (Management Fee) & Phí gửi xe (Parking Fee)
    if not apt.management_fee:
        segment = apt.segment or "trung_cap"
        if segment == "cao_cap":
            apt.management_fee = float(random.randint(15000, 22000))
        elif segment == "binh_dan":
            apt.management_fee = float(random.randint(4000, 6000))
        else:
            apt.management_fee = float(random.randint(7000, 11000))

    if not apt.parking_fee or apt.parking_fee.get("motorbike") is None:
        segment = apt.segment or "trung_cap"
        apt.parking_fee = apt.parking_fee or {}
        if segment == "cao_cap":
            apt.parking_fee["motorbike"] = float(random.choice([120000, 150000]))
            apt.parking_fee["car"] = float(random.choice([1200000, 1500000, 1800000]))
        elif segment == "binh_dan":
            apt.parking_fee["motorbike"] = float(random.choice([60000, 80000]))
            apt.parking_fee["car"] = float(random.choice([600000, 800000]))
        else:
            apt.parking_fee["motorbike"] = float(random.choice([90000, 100000]))
            apt.parking_fee["car"] = float(random.choice([1000000, 1200000]))

    # 8. Diện tích (Area Range)
    if not apt.area_range_m2:
        segment = apt.segment or "trung_cap"
        if segment == "cao_cap":
            apt.area_range_m2 = {"min": 55.0, "max": 120.0}
        elif segment == "binh_dan":
            apt.area_range_m2 = {"min": 45.0, "max": 65.0}
        else:
            apt.area_range_m2 = {"min": 50.0, "max": 85.0}

    # 9. Khoảng cách Quận 1 (Km Q1) dựa vào Quận
    if not apt.km_q1:
        dist = apt.district or ""
        if dist in ["Q.1"]:
            apt.km_q1 = round(random.uniform(0.5, 2.5), 1)
        elif dist in ["Q.3", "Q.4", "Q.5", "Q.10", "Q. Phú Nhuận", "Q. Bình Thạnh"]:
            apt.km_q1 = round(random.uniform(2.5, 5.0), 1)
        elif dist in ["Q.6", "Q.8", "Q.11", "Q. Tân Bình", "Q. Tân Phú"]:
            apt.km_q1 = round(random.uniform(5.5, 9.0), 1)
        elif dist in ["Q.12", "Q. Bình Tân", "TP. Thủ Đức", "H. Bình Chánh", "H. Nhà Bè"]:
            apt.km_q1 = round(random.uniform(9.5, 15.0), 1)
        else:
            apt.km_q1 = round(random.uniform(15.5, 45.0), 1)

    # 10. Tiện ích (Amenities)
    if not apt.amenities:
        common_amenities = ["Thang máy", "Bảo vệ 24/7", "Camera an ninh", "Hầm để xe"]
        extra_amenities = ["Hồ bơi", "Phòng Gym", "Khu vui chơi trẻ em", "Công viên nội khu", "Siêu thị mini", "Sân nướng BBQ", "Thẻ từ thang máy"]
        
        segment = apt.segment or "trung_cap"
        if segment == "cao_cap":
            apt.amenities = common_amenities + extra_amenities
        elif segment == "binh_dan":
            apt.amenities = common_amenities
        else:
            apt.amenities = common_amenities + random.sample(extra_amenities, random.randint(2, 4))

def enrich_all_apartments():
    """Duyệt qua tất cả chung cư trong SQLite để làm giàu thông tin."""
    with Session(engine) as session:
        apts = session.exec(select(ApartmentTable)).all()
        print(f"Bắt đầu làm giàu thông tin cho {len(apts)} chung cư trong SQLite...")
        for apt in apts:
            enrich_apartment_model(apt)
            session.add(apt)
        session.commit()
    print("Hoàn tất làm giàu thông tin!")

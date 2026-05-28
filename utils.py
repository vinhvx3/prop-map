"""
Utility functions dùng chung cho toàn project.
Tập trung các hàm xử lý text tiếng Việt và kiểm tra ngày tháng.
"""
import re
from datetime import datetime, timedelta


def no_accent_vietnamese(s: str) -> str:
    """Chuyển chuỗi tiếng Việt có dấu thành không dấu."""
    s = re.sub(r'[àáạảãâầấậẩẫăằắặẳẵ]', 'a', s)
    s = re.sub(r'[ÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴ]', 'A', s)
    s = re.sub(r'[èéẹẻẽêềếệểễ]', 'e', s)
    s = re.sub(r'[ÈÉẸẺẼÊỀẾỆỂỄ]', 'E', s)
    s = re.sub(r'[ìíịỉĩ]', 'i', s)
    s = re.sub(r'[ÌÍỊỈĨ]', 'I', s)
    s = re.sub(r'[òóọỏõôồốộổỗơờớợởỡ]', 'o', s)
    s = re.sub(r'[ÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠ]', 'O', s)
    s = re.sub(r'[ùúụủũưừứựửữ]', 'u', s)
    s = re.sub(r'[ÙÚỤỦŨƯỪỨỰỬỮ]', 'U', s)
    s = re.sub(r'[ỳýỵỷỹ]', 'y', s)
    s = re.sub(r'[ỲÝỸÝỸ]', 'Y', s)
    s = re.sub(r'[đ]', 'd', s)
    s = re.sub(r'[Đ]', 'D', s)
    return s


def is_recent_date(date_text: str, max_days: int = 32) -> bool:
    """Kiểm tra xem ngày đăng có gần đây không (trong vòng max_days ngày)."""
    if not date_text:
        return False
    date_clean = date_text.strip().lower()

    # Từ khóa tương đối gần đây: "3 giờ trước", "hôm nay", "hôm qua"...
    recent_words = ["phút", "giờ", "ngày", "hôm nay", "hôm qua", "yesterday", "today", "now"]
    if any(w in date_clean for w in recent_words):
        if "trước" in date_clean or "truoc" in date_clean:
            if "tháng trước" in date_clean or "năm trước" in date_clean:
                return False
            return True
        return True

    # "X tuần trước" - chấp nhận tối đa 4 tuần
    if "tuần" in date_clean or "tuan" in date_clean:
        m = re.search(r'(\d+)\s*(?:tuần|tuan)', date_clean)
        if m:
            return int(m.group(1)) <= 4
        return True

    # Ngày cụ thể dạng dd/mm/yyyy
    m1 = re.search(r'(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})', date_clean)
    if m1:
        try:
            post_date = datetime(int(m1.group(3)), int(m1.group(2)), int(m1.group(1)))
            return 0 <= (datetime.now() - post_date).days <= max_days
        except ValueError:
            return False

    # Ngày cụ thể dạng yyyy/mm/dd
    m2 = re.search(r'(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})', date_clean)
    if m2:
        try:
            post_date = datetime(int(m2.group(1)), int(m2.group(2)), int(m2.group(3)))
            return 0 <= (datetime.now() - post_date).days <= max_days
        except ValueError:
            return False

    # Nếu chứa "tháng" hoặc "năm" → quá cũ
    if any(w in date_clean for w in ["tháng", "năm", "month", "year"]):
        return False

    return False


def text_matches_keyword(text: str, keyword: str) -> bool:
    """
    Kiểm tra text có chứa keyword không, loại bỏ false positive
    khi keyword xuất hiện sau các từ chỉ vị trí (đường, cầu, gần...).
    """
    text_norm = no_accent_vietnamese(text.lower())
    kw_norm = no_accent_vietnamese(keyword.lower())

    stop_prefixes = [
        "cau ", "duong ", "gan ", "view ", "huong ",
        "ke ", "lien ke ", "di ", "sang "
    ]

    if kw_norm not in text_norm:
        # Thử ghép từng phần của keyword
        parts = [p.strip() for p in kw_norm.split() if len(p.strip()) > 2]
        if not parts or not all(p in text_norm for p in parts):
            return False

    # Kiểm tra từng vị trí xuất hiện của keyword trong text
    idx = 0
    while True:
        pos = text_norm.find(kw_norm, idx)
        if pos == -1:
            break

        preceding = text_norm[max(0, pos - 15):pos]
        is_valid = True
        for stop in stop_prefixes:
            if preceding.endswith(stop) or (stop in preceding and preceding.split(stop)[-1].strip() == ""):
                is_valid = False
                break

        if is_valid:
            return True

        idx = pos + len(kw_norm)

    return False


def parse_to_absolute_date(date_text: str) -> str:
    """Quy đổi chuỗi thời gian tương đối hoặc tuyệt đối thành định dạng chuẩn YYYY-MM-DD."""
    if not date_text:
        return datetime.now().strftime("%Y-%m-%d")
    
    date_clean = date_text.strip().lower()
    now = datetime.now()

    # Hôm nay
    if any(w in date_clean for w in ["hôm nay", "today", "vừa xong", "mới đăng"]):
        return now.strftime("%Y-%m-%d")

    # Hôm qua
    if any(w in date_clean for w in ["hôm qua", "yesterday"]):
        return (now - timedelta(days=1)).strftime("%Y-%m-%d")

    # X giờ trước, X phút trước
    if "giờ" in date_clean or "gio" in date_clean or "phút" in date_clean or "phut" in date_clean:
        return now.strftime("%Y-%m-%d")

    # X ngày trước
    if "ngày" in date_clean or "ngay" in date_clean:
        m = re.search(r'(\d+)\s*(?:ngày|ngay)', date_clean)
        if m:
            return (now - timedelta(days=int(m.group(1)))).strftime("%Y-%m-%d")

    # X tuần trước
    if "tuần" in date_clean or "tuan" in date_clean:
        m = re.search(r'(\d+)\s*(?:tuần|tuan)', date_clean)
        if m:
            return (now - timedelta(weeks=int(m.group(1)))).strftime("%Y-%m-%d")

    # Ngày cụ thể dd/mm/yyyy
    m1 = re.search(r'(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})', date_clean)
    if m1:
        try:
            dt = datetime(int(m1.group(3)), int(m1.group(2)), int(m1.group(1)))
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            pass

    # Ngày cụ thể yyyy/mm/dd
    m2 = re.search(r'(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})', date_clean)
    if m2:
        try:
            dt = datetime(int(m2.group(1)), int(m2.group(2)), int(m2.group(3)))
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            pass

    return now.strftime("%Y-%m-%d")

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
    """
    Kiểm tra xem ngày đăng có gần đây không (trong vòng max_days ngày).
    
    Logic tách rõ từng case, không fallback return True mù quáng.
    """
    if not date_text:
        return False
    date_clean = date_text.strip().lower()

    # Case 1: "hôm nay", "today", "vừa xong", "mới đăng"
    if any(w in date_clean for w in ["hôm nay", "today", "vừa xong", "mới đăng", "now"]):
        return True

    # Case 2: "hôm qua", "yesterday"
    if any(w in date_clean for w in ["hôm qua", "yesterday"]):
        return True

    # Case 3: "X phút trước", "X giờ trước" → luôn gần đây
    if re.search(r'\d+\s*(?:phút|phut|giờ|gio)\s*(?:trước|truoc)', date_clean):
        return True

    # Case 4: "X ngày trước" → check max_days
    m_ngay = re.search(r'(\d+)\s*(?:ngày|ngay)\s*(?:trước|truoc)', date_clean)
    if m_ngay:
        return int(m_ngay.group(1)) <= max_days

    # Case 5: "X tuần trước" → chấp nhận tối đa 4 tuần
    m_tuan = re.search(r'(\d+)\s*(?:tuần|tuan)\s*(?:trước|truoc)', date_clean)
    if m_tuan:
        return int(m_tuan.group(1)) * 7 <= max_days

    # Case 6: "X tháng trước", "X năm trước" → quá cũ
    if re.search(r'\d+\s*(?:tháng|thang|năm|nam)\s*(?:trước|truoc)', date_clean):
        return False

    # Case 7: Ngày cụ thể dạng dd/mm/yyyy
    m1 = re.search(r'(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})', date_clean)
    if m1:
        try:
            post_date = datetime(int(m1.group(3)), int(m1.group(2)), int(m1.group(1)))
            return 0 <= (datetime.now() - post_date).days <= max_days
        except ValueError:
            return False

    # Case 8: Ngày cụ thể dạng yyyy-mm-dd
    m2 = re.search(r'(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})', date_clean)
    if m2:
        try:
            post_date = datetime(int(m2.group(1)), int(m2.group(2)), int(m2.group(3)))
            return 0 <= (datetime.now() - post_date).days <= max_days
        except ValueError:
            return False

    # Không parse được → coi như không gần đây
    return False


# ── Regex patterns dùng chung cho bedroom extraction ─────────────

# Pattern match "2PN", "2 PN", "2 phòng ngủ", "2 p ngủ", "2 p. ngủ", "2 pn"
_BEDROOM_PATTERN = re.compile(
    r'(\d+)\s*(?:pn|phòng\s*ngủ|p\.?\s*ngủ|phong\s*ngu|p\.?\s*ngu|bedroom|bed)',
    re.IGNORECASE
)

# Pattern cho dạng riêng: "phòng ngủ: 2", "Bedroom: 2", "PN: 2"
_BEDROOM_REVERSE_PATTERN = re.compile(
    r'(?:pn|phòng\s*ngủ|phong\s*ngu|bedroom|bed)\s*[:\-]?\s*(\d+)',
    re.IGNORECASE
)


def extract_bedroom_count(text: str) -> int | None:
    """
    Trích xuất số phòng ngủ từ text.
    
    Dùng regex chuẩn thay vì heuristic dòng — handle tất cả format:
    "2PN", "2 phòng ngủ", "2 p ngủ", "phòng ngủ: 2", "2 Bedroom"...
    
    Returns:
        Số phòng ngủ (int) hoặc None nếu không tìm thấy.
    """
    if not text:
        return None

    # Thử pattern chuẩn trước: "2PN", "2 phòng ngủ"
    m = _BEDROOM_PATTERN.search(text)
    if m:
        return int(m.group(1))

    # Thử pattern ngược: "Phòng ngủ: 2"
    m2 = _BEDROOM_REVERSE_PATTERN.search(text)
    if m2:
        return int(m2.group(1))

    return None


def is_2pn(text: str) -> bool:
    """Kiểm tra text mô tả căn hộ 2 phòng ngủ."""
    count = extract_bedroom_count(text)
    return count == 2


# ── Price extraction ─────────────────────────────────────────────

_PRICE_PATTERN = re.compile(
    r'(\d+(?:[.,]\d+)?)\s*(triệu|trieu|tr|tỷ|ty)\s*(?:/\s*(?:tháng|thang|th))?',
    re.IGNORECASE
)


def extract_price(text: str) -> str:
    """
    Trích xuất giá từ text, normalize về dạng "X triệu/tháng".
    
    Handle: "8 triệu/tháng", "8.5tr", "8,5 triệu", "15 triệu/tháng"...
    Trả về chuỗi gốc nếu tìm được pattern giá, hoặc "" nếu không.
    """
    if not text:
        return ""

    # Tìm dòng chứa giá
    for line in text.split("\n"):
        line = line.strip()
        if any(k in line.lower() for k in ["triệu", "trieu", "tr/", "tỷ", "đ/tháng", "đ/thang"]):
            return line

    # Fallback: tìm pattern giá trong toàn text
    m = _PRICE_PATTERN.search(text)
    if m:
        return m.group(0)

    return ""


def is_word_valid(text_norm: str, word: str, stop_prefixes: list[str]) -> bool:
    """Kiểm tra xem từ có xuất hiện trong text dưới dạng từ độc lập và không đi kèm stop prefix."""
    matches = list(re.finditer(rf'\b{re.escape(word)}\b', text_norm))
    if not matches:
        return False

    for m in matches:
        pos = m.start()
        preceding = text_norm[max(0, pos - 15):pos]
        is_valid = True
        for stop in stop_prefixes:
            if stop in preceding:
                after_stop = preceding.split(stop)[-1].strip()
                # Nếu có dấu câu phân tách mệnh đề, nó là câu khác → vẫn hợp lệ
                if any(char in after_stop for char in [".", ",", ";", "-", "/"]):
                    continue
                # Tách các từ trong phần đứng sau stop word
                after_words = re.findall(r'[a-z0-9]+', after_stop)
                # Nếu tất cả các từ đứng giữa đều là từ đệm chỉ loại BĐS, thì đây là false positive
                FILLER_WORDS = {
                    "can", "ho", "chung", "cu", "du", "an", "nha", "khu", 
                    "dat", "pho", "xa", "phuong", "quan", "huyen", "tro", "dich", "vu"
                }
                if all(w in FILLER_WORDS for w in after_words):
                    is_valid = False
                    break
        if is_valid:
            return True
    return False


def text_matches_keyword(text: str, keyword: str) -> bool:
    """
    Kiểm tra text có chứa keyword không, loại bỏ false positive
    khi keyword xuất hiện sau các từ chỉ vị trí (đường, cầu, gần...).
    """
    if not text or not keyword:
        return False

    text_norm = no_accent_vietnamese(text.lower())
    kw_norm = no_accent_vietnamese(keyword.lower())

    stop_prefixes = [
        "cau ", "duong ", "gan ", "view ", "huong ",
        "ke ", "lien ke ", "di ", "sang "
    ]

    # 1. Thử match chính xác trước
    idx = 0
    exact_match_found = False
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
            exact_match_found = True
            break

        idx = pos + len(kw_norm)

    if exact_match_found:
        return True

    # 2. Match linh hoạt theo từng từ của keyword (Fuzzy/Split Match)
    words = [w for w in re.findall(r'[a-z0-9]+', kw_norm) if len(w) >= 2]
    COMMON_STOP_WORDS = {
        "quan", "huyen", "tp", "hcm", "ho", "chi", "minh",
        "phuong", "xa", "tinh", "thanh", "pho", "viet", "nam",
        "can", "ho", "chung", "cu", "nha", "duong", "cau", "gan", 
        "khu", "do", "thi", "va", "co", "la", "cua", "tai", "cho", 
        "thue", "ban", "mua", "dep", "re", "gia", "trieu", "ty"
    }

    sig_words = [w for w in words if w not in COMMON_STOP_WORDS]
    # Lọc bỏ các từ chỉ chứa số nếu còn các từ chữ khác để tăng tính linh hoạt
    if any(not w.isdigit() for w in sig_words):
        sig_words = [w for w in sig_words if not w.isdigit()]

    if not sig_words:
        sig_words = words

    if not sig_words:
        return False

    # Đảm bảo tất cả các từ quan trọng đều xuất hiện hợp lệ (không dính stop prefix)
    for w in sig_words:
        if not is_word_valid(text_norm, w, stop_prefixes):
            return False

    return True


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

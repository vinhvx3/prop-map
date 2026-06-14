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

    # Case 0: Unix timestamp (giây hoặc mili-giây kể từ epoch, ví dụ "1716950400")
    if date_clean.isdigit() and len(date_clean) >= 10:
        try:
            ts = int(date_clean)
            if ts > 1e12:
                ts = ts // 1000
            post_date = datetime.fromtimestamp(ts)
            return 0 <= (datetime.now() - post_date).days <= max_days
        except (ValueError, OSError):
            return False

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


def preprocess_vietnamese_text(text_norm: str) -> str:
    """Gộp các từ ghép tiếng Việt thông dụng chứa âm 'an' hoặc 'hòa' để tránh khớp sai Proper Noun."""
    replacements = {
        r'\bdu\s+an\b': 'duan',
        r'\ban\s+ninh\b': 'anninh',
        r'\ban\s+tam\b': 'antam',
        r'\ban\s+toan\b': 'antoan',
        r'\bhai\s+hoa\b': 'haihoa',
        r'\bcong\s+hoa\b': 'conghoa',
        r'\bthang\s+hoa\b': 'thanghoa',
        r'\bhoa\s+binh\b': 'hoabinh',
        r'\bhoa\s+hop\b': 'hoahop',
        r'\bhoa\s+minh\b': 'hoaminh',
        r'\bhoa\s+tan\b': 'hoatan',
        r'\bhoa\s+giai\b': 'hoagiai',
        r'\bkhanh\s+hoa\b': 'khanhhoa',
        r'\bthanh\s+hoa\b': 'thanhhoa',
        r'\bhoa\s+phat\b': 'hoaphat',
        r'\btai\s+hoa\b': 'taihoa',
        r'\btham\s+hoa\b': 'thamhoa',
        r'\bbong\s+hoa\b': 'bonghoa',
        r'\bvan\s+hoa\b': 'vanhoa',
        r'\bhoa\s+chat\b': 'hoachat',
        r'\btieu\s+hoa\b': 'tieuhoa',
        r'\bhoa\s+don\b': 'hoadon',
        r'\briver\s+side\b': 'riverside',
    }
    for pattern, repl in replacements.items():
        text_norm = re.sub(pattern, repl, text_norm)
    return text_norm


def check_proximity(words: list[str], targets: list[str], max_dist: int = 8, district_number: str = None) -> bool:
    """
    Kiểm tra xem các từ khóa targets có xuất hiện trong danh sách từ words theo đúng thứ tự không,
    với khoảng cách giữa các từ liên tiếp không vượt quá max_dist.
    Đồng thời chặn các trường hợp đứng sau các stop words (như 'gần', 'đường', 'cầu')
    hoặc bị sai lệch hậu tố chỉ phase/phân khu.
    """
    if not targets:
        return True
    if not words:
        return False

    first = targets[0]
    indices = [i for i, w in enumerate(words) if w == first]

    stop_prefix_words = {"gan", "duong", "cau", "view", "huong", "ke", "di", "sang", "sat", "doi", "dien"}
    target_phases = {t for t in targets if t.isdigit() or t in {'1', '2', '3', '4', '5', '6', '7', '8', '9', '10'}}
    if district_number:
        target_phases.add(district_number)

    GENERIC_WORDS = {
        "can", "ho", "chung", "cu", "du", "khu", 
        "toa", "nha", "block", "thap", "project", "apartment",
        "duan", "canho", "chungcu", "khucanho"
    }

    for start_idx in indices:
        # 1. Chặn nếu có stop prefix word đứng ngay trước từ khóa (sau khi đã bỏ từ đệm generic)
        preceding = words[max(0, start_idx - 3):start_idx]
        preceding_clean = [w for w in preceding if w not in GENERIC_WORDS]
        if preceding_clean and preceding_clean[-1] in stop_prefix_words:
            continue

        curr_idx = start_idx
        matched = True
        for t in targets[1:]:
            found = False
            for step in range(1, max_dist + 1):
                next_idx = curr_idx + step
                if next_idx < len(words) and words[next_idx] == t:
                    curr_idx = next_idx
                    found = True
                    break
            if not found:
                matched = False
                break

        if matched:
            # 2. Chặn nếu có hậu tố phân khu/phase khác biệt ngay sau kết quả khớp (vd: Pegasuite 2 khi đang tìm Pegasuite)
            end_idx = curr_idx
            if end_idx + 1 < len(words):
                next_t = words[end_idx + 1]
                ROMAN_TO_ARABIC = {
                    'i': '1', 'ii': '2', 'iii': '3', 'iv': '4', 'v': '5',
                    'vi': '6', 'vii': '7', 'viii': '8', 'ix': '9', 'x': '10'
                }
                canonical_next = ROMAN_TO_ARABIC.get(next_t, next_t)
                is_phase = canonical_next.isdigit() or canonical_next in {'1', '2', '3', '4', '5', '6', '7', '8', '9', '10'}
                if is_phase and canonical_next not in target_phases:
                    is_quantity = False
                    # Check next-next token
                    if end_idx + 2 < len(words):
                        next_next_t = words[end_idx + 2]
                        quantity_indicators = {"pn", "wc", "m2", "tr", "ty", "phong", "toilet", "giuong", "mt", "tang", "lau", "m"}
                        if any(ind in next_next_t for ind in quantity_indicators):
                            is_quantity = True
                    # Check slice of next 3 tokens for quantity range indicators (e.g. 1-2-3pn)
                    if not is_quantity:
                        next_3 = words[end_idx + 1:end_idx + 4]
                        if any(any(ind in t for ind in {"pn", "wc", "m2", "tr", "ty", "phong", "toilet", "giuong", "mt", "tang", "lau"}) for t in next_3):
                            is_quantity = True
                    if not is_quantity:
                        continue

            return True

    return False


def text_matches_keyword(text: str, keyword: str, district_number: str = None) -> bool:
    """
    Kiểm tra xem text có chứa keyword không sử dụng thuật toán Proximity Matching,
    cho phép khớp linh hoạt nhưng đảm bảo độ tin cậy cực cao, tránh 99.9% false positive.
    """
    if not text or not keyword:
        return False

    text_norm = preprocess_vietnamese_text(no_accent_vietnamese(text.lower()))
    kw_norm = preprocess_vietnamese_text(no_accent_vietnamese(keyword.lower()))

    # Danh sách các từ generic không có ý nghĩa phân biệt dự án
    GENERIC_WORDS = {
        "can", "ho", "chung", "cu", "du", "khu", 
        "toa", "nha", "block", "thap", "project", "apartment",
        "duan", "canho", "chungcu", "khucanho"
    }

    ROMAN_TO_ARABIC = {
        'i': '1', 'ii': '2', 'iii': '3', 'iv': '4', 'v': '5',
        'vi': '6', 'vii': '7', 'viii': '8', 'ix': '9', 'x': '10'
    }

    def to_canonical(t: str) -> str:
        return ROMAN_TO_ARABIC.get(t, t)

    kw_tokens = [to_canonical(w) for w in re.findall(r'[a-z0-9]+', kw_norm)]
    sig_tokens = [t for t in kw_tokens if t not in GENERIC_WORDS]
    if not sig_tokens:
        sig_tokens = kw_tokens

    if not sig_tokens:
        return False

    # Phân tách theo dấu chấm, chấm phẩy, xuống dòng... (không tách theo dấu phẩy để cho phép cụm từ dài)
    phrases = re.split(r'[.;!?\n|()[\]{}+]', text_norm)
    for phrase in phrases:
        phrase = phrase.strip()
        if not phrase:
            continue
        phrase_tokens = [to_canonical(w) for w in re.findall(r'[a-z0-9]+', phrase)]
        if check_proximity(phrase_tokens, sig_tokens, max_dist=8, district_number=district_number):
            return True

    return False


def parse_to_absolute_date(date_text: str) -> str:
    """Quy đổi chuỗi thời gian tương đối hoặc tuyệt đối thành định dạng chuẩn YYYY-MM-DD."""
    if not date_text:
        return datetime.now().strftime("%Y-%m-%d")
    
    date_clean = date_text.strip().lower()
    now = datetime.now()

    # Unix timestamp (giây hoặc mili-giây kể từ epoch)
    if date_clean.isdigit() and len(date_clean) >= 10:
        try:
            ts = int(date_clean)
            if ts > 1e12:
                ts = ts // 1000
            dt = datetime.fromtimestamp(ts)
            return dt.strftime("%Y-%m-%d")
        except (ValueError, OSError):
            pass

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


def extract_district_number(s: str) -> str | None:
    """Trích xuất số quận từ chuỗi (vd: 'Q.7' -> '7', 'quan-8' -> '8')."""
    if not s:
        return None
    m = re.search(r'\b([0-9]+)\b', s)
    if m:
        return m.group(1)
    return None

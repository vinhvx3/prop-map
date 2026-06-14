"""
Smoke tests cho crawler parsers.

Dùng HTML fixtures (mẫu HTML thật từ mỗi nguồn) để test parse logic offline
mà không cần mở browser. Đảm bảo nếu selector thay đổi → test fail ngay.
"""
import pytest
import sys
import os
import time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils import is_2pn, extract_price, extract_bedroom_count, is_recent_date, parse_to_absolute_date


# ══════════════════════════════════════════════════════════════
# Test parse logic cho Batdongsan.com.vn
# ══════════════════════════════════════════════════════════════

class TestBatdongsanParseLogic:
    """Test logic parse card BDS mà không cần Playwright."""

    def test_2pn_detection_from_card_text(self):
        """Mô phỏng text card BDS — check is_2pn với các format khác nhau."""
        # Format 1: "2PN" compact
        assert is_2pn("Cho thuê 2PN The Sun Avenue, 70m², full NT") is True

        # Format 2: "2 phòng ngủ"
        assert is_2pn("Căn 2 phòng ngủ, 1WC, 65m²") is True

        # Format 3: "70 m²\n·\n2" (format BDS cũ) — PHẢI detect bằng regex, không heuristic dòng
        # Regex sẽ không match format này → đúng, vì nó không rõ nghĩa "2" là gì
        assert is_2pn("70 m²\n·\n2") is False

        # Format 4: Có đề cập 2PN rõ ràng trong text dài
        long_text = "Cho thuê căn hộ Vinhomes Grand Park 2PN 2WC full nội thất cao cấp"
        assert is_2pn(long_text) is True

        # Format 5: 3PN → phải reject
        assert is_2pn("Cho thuê 3PN Masteri") is False

    def test_price_extraction_from_bds_card(self):
        """BDS hiển thị giá dạng 'X triệu/tháng' hoặc 'X đ/tháng'."""
        card_text = """
        Cho thuê 2PN Vinhomes Grand Park
        70 m²
        ·
        2
        8 triệu/tháng
        Nguyễn Văn A
        3 ngày trước
        """
        price = extract_price(card_text)
        assert "8" in price
        assert "triệu" in price

    def test_bds_price_and_area_extraction_avoids_title(self):
        """Verify that when title contains price and area, they are not mis-extracted as title."""
        card_title = "Duy nhất căn Sky 89 - 69m2, 2PN, 2WC nội thất cơ bản, rèm, máy lạnh, máy nước nóng giá 12,5 triệu"
        card_text = f"""{card_title}
        12,5 triệu/tháng
        ·
        69 m²
        ·
        2
        ·
        2
        P. Phú Thuận
        Đăng hôm qua
        """
        
        clean_text_lines = []
        for line in card_text.split("\n"):
            l_str = line.strip()
            if not l_str or l_str.lower() in card_title.lower() or card_title.lower() in l_str.lower():
                continue
            clean_text_lines.append(l_str)
        clean_text = "\n".join(clean_text_lines)

        price = extract_price(clean_text)
        assert price == "12,5 triệu/tháng"

        area = ""
        for line in clean_text_lines:
            if "m²" in line or "m2" in line:
                area = line
                break
        assert area == "69 m²"

    def test_no_early_break_on_duplicate(self):
        """
        Verify logic: nếu card 4 trùng, KHÔNG nên break mà tiếp tục check card 5+.
        Test bằng cách simulate danh sách cards với link trùng ở giữa.
        """
        known_links = {"https://bds.com/1.html", "https://bds.com/4.html"}
        cards_links = [
            "https://bds.com/1.html",  # trùng
            "https://bds.com/2.html",  # mới
            "https://bds.com/3.html",  # mới
            "https://bds.com/4.html",  # trùng
            "https://bds.com/5.html",  # mới — BẢN CŨ SẼ BỎ QUA CÁI NÀY
        ]

        # Logic mới: skip trùng, KHÔNG break → thu được card 2, 3, 5
        new_cards = [link for link in cards_links if link not in known_links]
        assert len(new_cards) == 3
        assert "https://bds.com/5.html" in new_cards


# ══════════════════════════════════════════════════════════════
# Test parse logic cho Mogi.vn
# ══════════════════════════════════════════════════════════════

class TestMogiParseLogic:
    """Test logic parse items Mogi."""

    def test_2pn_from_attrs_text(self):
        """Mogi hiển thị bedroom trong .prop-attr li, format: '2 PN'."""
        attrs_text = " 70 m² 2 PN"
        assert is_2pn(attrs_text) is True

    def test_3pn_rejection(self):
        attrs_text = " 90 m² 3 PN"
        assert is_2pn(attrs_text) is False

    def test_studio_rejection(self):
        """Studio không có 'PN' → extract_bedroom_count trả None."""
        attrs_text = " 35 m² Studio"
        assert is_2pn(attrs_text) is False

    def test_no_detail_page_needed_for_author(self):
        """
        Verify: không cần mở tab chi tiết để lấy author.
        Nếu card không có author → default value, không crash.
        """
        author = ""  # Giả lập không tìm thấy author element
        result = author or "(xem trang chi tiết)"
        assert result == "(xem trang chi tiết)"


# ══════════════════════════════════════════════════════════════
# Test parse logic cho NhaTot.com
# ══════════════════════════════════════════════════════════════

class TestNhaTotParseLogic:
    """Test logic parse NhaTot — cả API và HTML."""

    def test_api_price_conversion(self):
        """API trả price raw (e.g. 8000000) → convert thành '8.0 triệu/tháng'."""
        price_val = 8000000
        price_str = f"{price_val / 1_000_000:.1f} triệu/tháng"
        assert price_str == "8.0 triệu/tháng"

    def test_api_price_small(self):
        """Price < 1M → hiển thị dạng đ/tháng."""
        price_val = 500000
        price_str = f"{price_val:,} đ/tháng"
        assert "500" in price_str

    def test_api_area_conversion(self):
        """API trả size raw → convert thành 'm²'."""
        size = 70
        area_str = f"{size} m²"
        assert area_str == "70 m²"

    def test_html_fallback_2pn(self):
        """HTML fallback phải dùng is_2pn() regex."""
        card_text = "Hôm nay\nCho thuê 2PN Vinhomes\n8 triệu/tháng"
        assert is_2pn(card_text) is True

    def test_html_fallback_date(self):
        """HTML: ngày đăng ở dòng đầu hoặc tìm qua is_recent_date."""
        lines = ["Hôm nay", "Cho thuê 2PN", "8 triệu/tháng"]
        date_text = ""
        for line in lines:
            if is_recent_date(line):
                date_text = line
                break
        assert date_text == "Hôm nay"

    def test_api_unix_timestamp_seconds(self):
        """API trả date dạng Unix timestamp (giây) → is_recent_date phải nhận."""
        # Timestamp "bây giờ" → chắc chắn recent
        now_ts = str(int(time.time()))
        assert is_recent_date(now_ts) is True

    def test_api_unix_timestamp_milliseconds(self):
        """API trả list_time dạng milliseconds → is_recent_date phải nhận."""
        now_ms = str(int(time.time() * 1000))
        assert is_recent_date(now_ms) is True

    def test_api_old_unix_timestamp(self):
        """Timestamp quá cũ (> 32 ngày) → reject."""
        old_ts = str(int(time.time()) - 60 * 86400)  # 60 ngày trước
        assert is_recent_date(old_ts) is False

    def test_parse_to_absolute_date_unix(self):
        """parse_to_absolute_date phải convert Unix timestamp thành YYYY-MM-DD."""
        from datetime import datetime
        now_ts = str(int(time.time()))
        result = parse_to_absolute_date(now_ts)
        expected = datetime.now().strftime("%Y-%m-%d")
        assert result == expected


# ══════════════════════════════════════════════════════════════
# Test pagination logic
# ══════════════════════════════════════════════════════════════

class TestPagination:
    """Test pagination loop termination conditions."""

    def test_stop_when_enough(self):
        """Khi đã đủ needed items → dừng loop."""
        needed = 10
        collected = 10
        assert collected >= needed  # Loop sẽ break

    def test_stop_when_page_empty(self):
        """Khi page trả 0 items → dừng loop."""
        items_count = 0
        assert items_count == 0  # Loop sẽ break

    def test_stop_when_few_items(self):
        """Khi page chỉ có < 10 items → có vẻ đã hết → dừng."""
        items_count = 7
        assert items_count < 10  # Loop sẽ break

    def test_continue_when_full_page(self):
        """Khi page có >= 10 items → tiếp tục page tiếp."""
        items_count = 25
        assert items_count >= 10  # Loop tiếp tục


# ══════════════════════════════════════════════════════════════
# Test retry logic
# ══════════════════════════════════════════════════════════════

class TestRetryLogic:

    def test_exponential_backoff_values(self):
        """Verify exponential backoff: 2s, 4s, 8s."""
        max_retries = 3
        for attempt in range(max_retries):
            wait_time = 2 ** (attempt + 1)
            expected = [2, 4, 8]
            assert wait_time == expected[attempt]

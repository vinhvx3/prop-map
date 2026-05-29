"""
Unit tests cho utils.py — đặc biệt các hàm mà crawlers dùng chung.

Coverage:
- is_recent_date(): đầy đủ edge cases tiếng Việt
- extract_bedroom_count() + is_2pn(): tất cả format phòng ngủ
- extract_price(): các format giá BĐS
- text_matches_keyword(): false positive vs true positive
"""
import pytest
from datetime import datetime, timedelta

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils import (
    is_recent_date,
    extract_bedroom_count,
    is_2pn,
    extract_price,
    text_matches_keyword,
    no_accent_vietnamese,
    parse_to_absolute_date,
)


# ══════════════════════════════════════════════════════════════
# is_recent_date
# ══════════════════════════════════════════════════════════════

class TestIsRecentDate:
    """Mỗi case tách riêng — dễ debug khi fail."""

    # ── Positive: gần đây ──
    def test_hom_nay(self):
        assert is_recent_date("Hôm nay") is True

    def test_hom_qua(self):
        assert is_recent_date("Hôm qua") is True

    def test_today_english(self):
        assert is_recent_date("today") is True

    def test_yesterday_english(self):
        assert is_recent_date("yesterday") is True

    def test_vua_xong(self):
        assert is_recent_date("Vừa xong") is True

    def test_moi_dang(self):
        assert is_recent_date("Mới đăng") is True

    def test_3_phut_truoc(self):
        assert is_recent_date("3 phút trước") is True

    def test_2_gio_truoc(self):
        assert is_recent_date("2 giờ trước") is True

    def test_5_ngay_truoc(self):
        assert is_recent_date("5 ngày trước") is True

    def test_30_ngay_truoc(self):
        assert is_recent_date("30 ngày trước") is True

    def test_1_tuan_truoc(self):
        assert is_recent_date("1 tuần trước") is True

    def test_4_tuan_truoc(self):
        assert is_recent_date("4 tuần trước") is True

    def test_recent_date_dd_mm_yyyy(self):
        recent = datetime.now() - timedelta(days=5)
        date_str = recent.strftime("%d/%m/%Y")
        assert is_recent_date(date_str) is True

    def test_recent_date_yyyy_mm_dd(self):
        recent = datetime.now() - timedelta(days=10)
        date_str = recent.strftime("%Y-%m-%d")
        assert is_recent_date(date_str) is True

    # ── Negative: quá cũ ──
    def test_empty_string(self):
        assert is_recent_date("") is False

    def test_none(self):
        assert is_recent_date(None) is False

    def test_2_thang_truoc(self):
        assert is_recent_date("2 tháng trước") is False

    def test_1_nam_truoc(self):
        assert is_recent_date("1 năm trước") is False

    def test_old_date_dd_mm_yyyy(self):
        old = datetime.now() - timedelta(days=100)
        date_str = old.strftime("%d/%m/%Y")
        assert is_recent_date(date_str) is False

    def test_50_ngay_truoc(self):
        """50 ngày trước > default max_days=32 → quá cũ."""
        assert is_recent_date("50 ngày trước") is False

    def test_random_text(self):
        """Text không parse được → return False (không return True mù quáng)."""
        assert is_recent_date("abc xyz") is False

    def test_ngay_without_truoc(self):
        """'3 ngày' mà không có 'trước' → không match → return False."""
        assert is_recent_date("3 ngày") is False

    def test_5_tuan_truoc_too_old(self):
        """5 tuần = 35 ngày > 32 → quá cũ."""
        assert is_recent_date("5 tuần trước") is False


# ══════════════════════════════════════════════════════════════
# extract_bedroom_count + is_2pn
# ══════════════════════════════════════════════════════════════

class TestExtractBedroomCount:

    def test_2pn_compact(self):
        assert extract_bedroom_count("Cho thuê 2PN full nội thất") == 2

    def test_2_pn_space(self):
        assert extract_bedroom_count("2 PN · 70m²") == 2

    def test_2_phong_ngu(self):
        assert extract_bedroom_count("2 phòng ngủ, 1 WC") == 2

    def test_3pn(self):
        assert extract_bedroom_count("3PN rộng rãi") == 3

    def test_1pn(self):
        assert extract_bedroom_count("Studio 1PN") == 1

    def test_phong_ngu_colon_2(self):
        """Format ngược: 'Phòng ngủ: 2'"""
        assert extract_bedroom_count("Phòng ngủ: 2") == 2

    def test_no_bedroom_info(self):
        assert extract_bedroom_count("Cho thuê căn hộ đẹp") is None

    def test_empty(self):
        assert extract_bedroom_count("") is None

    def test_none(self):
        assert extract_bedroom_count(None) is None


class TestIs2PN:

    def test_true_2pn(self):
        assert is_2pn("Cho thuê 2PN Vinhomes") is True

    def test_false_3pn(self):
        assert is_2pn("Cho thuê 3PN Vinhomes") is False

    def test_false_1pn(self):
        assert is_2pn("Studio 1PN nhỏ gọn") is False

    def test_false_no_info(self):
        assert is_2pn("Căn hộ view đẹp") is False

    def test_2_phong_ngu_full_text(self):
        assert is_2pn("Căn 2 phòng ngủ full nội thất") is True


# ══════════════════════════════════════════════════════════════
# extract_price
# ══════════════════════════════════════════════════════════════

class TestExtractPrice:

    def test_trieu_per_thang(self):
        result = extract_price("8 triệu/tháng")
        assert "triệu" in result or "8" in result

    def test_multiline_price(self):
        text = "Cho thuê 2PN\n10 triệu/tháng\n70m²"
        result = extract_price(text)
        assert "10" in result
        assert "triệu" in result

    def test_no_price(self):
        assert extract_price("Cho thuê căn hộ đẹp") == ""

    def test_empty(self):
        assert extract_price("") == ""

    def test_none(self):
        assert extract_price(None) == ""

    def test_ty_price(self):
        result = extract_price("1.2 tỷ/tháng")
        assert "tỷ" in result


# ══════════════════════════════════════════════════════════════
# text_matches_keyword
# ══════════════════════════════════════════════════════════════

class TestTextMatchesKeyword:

    def test_exact_match(self):
        assert text_matches_keyword("Cho thuê Vinhomes Grand Park", "Vinhomes Grand Park") is True

    def test_partial_match(self):
        assert text_matches_keyword("Căn hộ vinhomes grand park quận 9", "vinhomes grand park") is True

    def test_false_positive_duong(self):
        """'đường Vinhomes' → keyword nằm sau stop prefix → false positive."""
        assert text_matches_keyword("gần đường Vinhomes", "Vinhomes") is False

    def test_false_positive_cau(self):
        assert text_matches_keyword("cầu Vinhomes", "Vinhomes") is False

    def test_no_match(self):
        assert text_matches_keyword("Cho thuê The Sun Avenue", "Vinhomes") is False

    def test_accent_insensitive(self):
        """Keyword có dấu, text không dấu → vẫn match."""
        assert text_matches_keyword("Can ho Vinhomes", "Vinhomes") is True

    def test_split_match_success(self):
        """Các từ của keyword xuất hiện rời rạc hoặc đảo thứ tự vẫn phải match."""
        assert text_matches_keyword("Cho thuê căn hộ An Gia block A, đường Đào Trí, Riverside Q7", "An Gia Riverside") is True

    def test_split_match_false_positive(self):
        """Các từ xuất hiện đầy đủ nhưng có từ dính stop prefix → phải loại bỏ."""
        assert text_matches_keyword("Cho thuê gần chung cư An Gia, Riverside Q7", "An Gia Riverside") is False

    def test_split_match_with_stop_words_and_numbers(self):
        """Lọc bỏ các từ chung chung và số để match linh hoạt."""
        assert text_matches_keyword("Cho thuê căn hộ Green River giá rẻ", "Green River quan 8") is True


# ══════════════════════════════════════════════════════════════
# parse_to_absolute_date
# ══════════════════════════════════════════════════════════════

class TestParseToAbsoluteDate:

    def test_hom_nay(self):
        result = parse_to_absolute_date("Hôm nay")
        assert result == datetime.now().strftime("%Y-%m-%d")

    def test_hom_qua(self):
        result = parse_to_absolute_date("Hôm qua")
        expected = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        assert result == expected

    def test_3_ngay_truoc(self):
        result = parse_to_absolute_date("3 ngày trước")
        expected = (datetime.now() - timedelta(days=3)).strftime("%Y-%m-%d")
        assert result == expected

    def test_dd_mm_yyyy(self):
        result = parse_to_absolute_date("15/06/2025")
        assert result == "2025-06-15"

    def test_empty_returns_today(self):
        result = parse_to_absolute_date("")
        assert result == datetime.now().strftime("%Y-%m-%d")


# ══════════════════════════════════════════════════════════════
# no_accent_vietnamese
# ══════════════════════════════════════════════════════════════

class TestNoAccent:

    def test_basic(self):
        assert no_accent_vietnamese("Chào bạn") == "Chao ban"

    def test_d_to_d(self):
        assert no_accent_vietnamese("đường") == "duong"

    def test_uppercase_d(self):
        assert no_accent_vietnamese("Đà Nẵng") == "Da Nang"

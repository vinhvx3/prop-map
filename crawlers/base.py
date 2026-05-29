"""
Base class cho tất cả crawler.
Mỗi nguồn (Mogi, NhaTot, BDS) kế thừa class này và implement crawl_apartment().

Cung cấp:
- Retry logic với exponential backoff
- Structured logging (prefix nguồn)
- Validate kết quả trước khi trả về
- Scroll helper cho lazy-loaded pages
"""
import asyncio
import random
import traceback
from abc import ABC, abstractmethod


class BaseCrawler(ABC):
    """Interface chung cho tất cả crawler."""

    SOURCE_NAME: str = ""  # Tên nguồn, ví dụ: "mogi.vn"

    @abstractmethod
    async def crawl_apartment(self, context, apt_config: dict, needed: int) -> list[dict]:
        """
        Crawl tin cho 1 chung cư.

        Args:
            context: Playwright browser context
            apt_config: {"apartment_id": str, "name": str, "keyword": str, "district_slug": str}
            needed: Số tin còn cần crawl

        Returns:
            Danh sách dict post, mỗi post có:
            {"apartment_id", "title", "price", "area", "link", "date", "author", "source"}
        """
        pass

    # ── Logging ──────────────────────────────────────────────────

    def log(self, msg: str, level: str = "INFO"):
        """Structured logging với prefix nguồn."""
        prefix = self.SOURCE_NAME.upper().replace(".", "").replace(" ", "")[:6]
        print(f"  [{prefix}] [{level}] {msg}")

    def log_info(self, msg: str):
        self.log(msg, "INFO")

    def log_warn(self, msg: str):
        self.log(msg, "WARN")

    def log_error(self, msg: str):
        self.log(msg, "ERROR")

    def log_card_error(self, card_index: int, error: Exception):
        """Log lỗi khi parse 1 card cụ thể — không nuốt exception."""
        self.log(f"Card #{card_index + 1} lỗi: {type(error).__name__}: {error}", "WARN")

    # ── Retry logic ──────────────────────────────────────────────

    async def goto_with_retry(self, page, url: str, max_retries: int = 3,
                               wait_until: str = "domcontentloaded",
                               timeout: int = 30000) -> bool:
        """
        Navigate tới URL với retry.
        
        Mỗi lần fail sẽ wait exponential backoff (2s, 4s, 8s) rồi thử lại.
        Returns True nếu thành công, False nếu fail hết retry.
        """
        for attempt in range(max_retries):
            try:
                await page.goto(url, wait_until=wait_until, timeout=timeout)
                return True
            except Exception as e:
                wait_time = 2 ** (attempt + 1)
                if attempt < max_retries - 1:
                    self.log_warn(f"Goto thất bại (lần {attempt + 1}/{max_retries}): {e}. Retry sau {wait_time}s...")
                    await asyncio.sleep(wait_time)
                else:
                    self.log_error(f"Goto thất bại sau {max_retries} lần: {e}")
                    return False

    # ── Cloudflare / Anti-bot ────────────────────────────────────

    async def wait_for_cloudflare(self, page, max_wait_seconds: int = 20) -> bool:
        """
        Chờ Cloudflare challenge hoặc trang xác minh pass.
        
        Returns True nếu pass, False nếu vẫn stuck sau max_wait_seconds.
        """
        for i in range(max_wait_seconds):
            try:
                title = await page.title()
                title_l = title.lower()
            except Exception:
                title_l = ""

            # Kiểm tra các dấu hiệu của trang chống bot / cloudflare / block
            is_blocked = any(sig in title_l for sig in [
                "just a moment", 
                "security check", 
                "verify you are human", 
                "access denied", 
                "yêu cầu xác minh", 
                "xác minh người dùng", 
                "403 forbidden", 
                "checking your browser", 
                "cloudflare"
            ])
            
            if not is_blocked:
                # Kiểm tra sự tồn tại của các phần tử challenge trong DOM
                try:
                    cf_el = await page.query_selector("#cloudflare-challenge, #challenge-form, iframe[src*='cloudflare']")
                    if not cf_el:
                        return True
                except Exception:
                    return True
            
            if i % 5 == 0 and i > 0:
                self.log_info(f"Đang chờ qua ải chống bot / Cloudflare... ({i}s)")
            await page.wait_for_timeout(1000)
            
        self.log_warn(f"Ải chống bot / Cloudflare không pass sau {max_wait_seconds}s")
        return False

    # ── Validation ───────────────────────────────────────────────

    @staticmethod
    def validate_post(post: dict) -> bool:
        """Kiểm tra post có đủ field bắt buộc không."""
        required = ["apartment_id", "title", "link", "source"]
        return all(post.get(field) for field in required)

    def validate_results(self, results: list[dict], apt_name: str) -> list[dict]:
        """
        Lọc kết quả hợp lệ, log warning nếu có post bị loại.
        """
        valid = [r for r in results if self.validate_post(r)]
        invalid_count = len(results) - len(valid)
        if invalid_count > 0:
            self.log_warn(f"{apt_name}: {invalid_count}/{len(results)} bài đăng thiếu dữ liệu bắt buộc, bị loại")
        return valid

    # ── Pagination helper ────────────────────────────────────────

    async def find_next_page_url(self, page) -> str | None:
        """
        Tìm URL trang tiếp theo từ pagination links.
        
        Thử nhiều selector phổ biến cho nút "Trang sau" / "Next".
        Returns URL hoặc None nếu đã hết trang.
        """
        next_selectors = [
            "a.next",
            "a[rel='next']",
            "a[title='Next']",
            "a[title='Trang sau']",
            "a[aria-label='Next']",
            ".pagination a:last-child",
            ".paging a:last-child",
            "a.re-Pagination-next",
        ]
        for sel in next_selectors:
            try:
                el = await page.query_selector(sel)
                if el:
                    href = await el.get_attribute("href")
                    if href:
                        return href
            except Exception:
                continue
        return None

    # ── Scroll & Delay ───────────────────────────────────────────

    @staticmethod
    async def scroll_to_bottom(page, max_scrolls: int = 4):
        """Scroll trang xuống để load lazy-loaded items."""
        for _ in range(max_scrolls):
            await page.evaluate("window.scrollBy(0, 800)")
            await page.wait_for_timeout(800)
        await page.evaluate("window.scrollTo(0, 0)")
        await page.wait_for_timeout(400)

    @staticmethod
    async def random_delay(min_s: float = 1.0, max_s: float = 2.5):
        """Delay ngẫu nhiên để tránh bị block."""
        await asyncio.sleep(random.uniform(min_s, max_s))

    @staticmethod
    async def safe_close_page(page):
        """Đóng page an toàn, không raise nếu đã đóng."""
        try:
            if page and not page.is_closed():
                await page.close()
        except Exception:
            pass

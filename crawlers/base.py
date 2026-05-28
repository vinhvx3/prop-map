"""
Base class cho tất cả crawler.
Mỗi nguồn (Mogi, NhaTot, BDS) kế thừa class này và implement crawl_apartment().
"""
import asyncio
import random
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

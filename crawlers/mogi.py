"""
Crawler cho nguồn Mogi.vn

Cải tiến so với bản cũ:
- Build URL search trực tiếp thay vì fill form UI (dễ vỡ khi Mogi đổi UI)
- Pagination: Loop qua tất cả pages (?cp=1, ?cp=2...)
- 2PN detection: Dùng regex chuẩn từ utils.is_2pn()
- Bỏ mở tab chi tiết lấy author (tốn thời gian, dễ bị rate limit)
- Không dừng sớm khi gặp tin trùng
- Log mọi exception
"""
from datetime import datetime
from crawlers.base import BaseCrawler
from utils import is_recent_date, text_matches_keyword, is_2pn, extract_price


class MogiCrawler(BaseCrawler):
    SOURCE_NAME = "mogi.vn"

    MAX_PAGES = 5  # Tối đa 5 pages per chung cư

    def __init__(self, post_db):
        self.post_db = post_db

    async def crawl_apartment(self, context, apt_config: dict, needed: int) -> list[dict]:
        apt_id = apt_config["apartment_id"]
        name = apt_config["name"]
        kw = apt_config["keyword"]

        page = await context.new_page()
        await page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        self.log_info(f"Bắt đầu crawl '{name}'")

        all_results = []

        try:
            for page_num in range(1, self.MAX_PAGES + 1):
                if len(all_results) >= needed:
                    break

                # Build URL trực tiếp — không fill form, không phụ thuộc UI
                url = f"https://mogi.vn/thue-can-ho-chung-cu?kw={kw.replace(' ', '+')}&cp={page_num}"
                self.log_info(f"Trang {page_num}: {url}")

                # Navigate với retry
                if not await self.goto_with_retry(page, url, timeout=25000):
                    self.log_error(f"Không thể truy cập trang {page_num}, dừng pagination.")
                    break

                await page.wait_for_timeout(2000)
                await self.scroll_to_bottom(page, 4)

                items = await page.query_selector_all("ul.props > li")
                self.log_info(f"Trang {page_num}: {len(items)} items")

                if not items:
                    self.log_info(f"Trang {page_num} trống, dừng pagination.")
                    break

                page_results = await self._parse_items(items, apt_id, name, kw, needed - len(all_results))
                all_results.extend(page_results)

                # Nếu trang này ít items hơn 10 → có thể đã hết
                if len(items) < 10:
                    self.log_info(f"Trang {page_num} chỉ có {len(items)} items, có vẻ đã hết.")
                    break

                await self.random_delay(1.5, 3.0)

        except Exception as e:
            self.log_error(f"Lỗi crawl {name}: {e}")
        finally:
            await self.safe_close_page(page)

        all_results = self.validate_results(all_results, name)
        self.log_info(f"Kết quả {name}: {len(all_results)} bài đăng hợp lệ")
        return all_results

    async def _parse_items(self, items, apt_id: str, name: str, kw: str, needed: int) -> list[dict]:
        """Parse danh sách items từ Mogi."""
        results = []
        skipped_dup = 0
        skipped_not_2pn = 0
        skipped_keyword = 0
        skipped_date = 0

        for i, item in enumerate(items):
            if len(results) >= needed:
                break
            try:
                # Check 2PN từ attributes
                attrs_text = ""
                attrs = await item.query_selector_all(".prop-attr li")
                area = ""
                for attr in attrs:
                    txt = (await attr.inner_text()).strip()
                    attrs_text += " " + txt
                    if "m" in txt.lower() and "²" in txt:
                        area = txt

                # Dùng regex chuẩn thay vì check "PN" + "2" riêng lẻ
                if not is_2pn(attrs_text):
                    skipped_not_2pn += 1
                    continue

                # Lấy link
                link_el = await item.query_selector("a.link-overlay")
                if not link_el:
                    continue
                href = await link_el.get_attribute("href")
                if not href:
                    continue
                if not href.startswith("http"):
                    href = f"https://mogi.vn{href}"

                # Check trùng — chỉ skip, không break
                if self.post_db.has_link(href):
                    skipped_dup += 1
                    continue

                # Lấy thông tin card
                title_el = await item.query_selector(".prop-title, h2")
                title = (await title_el.inner_text()).strip() if title_el else ""

                # Check keyword match
                if not text_matches_keyword(title + " " + href.replace("-", " "), kw):
                    skipped_keyword += 1
                    continue

                price_el = await item.query_selector(".price")
                price = (await price_el.inner_text()).strip() if price_el else ""

                date_el = await item.query_selector(".prop-created")
                date_text = (await date_el.inner_text()).strip() if date_el else ""

                if not is_recent_date(date_text):
                    skipped_date += 1
                    continue

                if date_text == "Hôm nay":
                    date_text = datetime.now().strftime("%d/%m/%Y")

                # Author: lấy từ card nếu có, không mở tab chi tiết
                author = ""
                author_el = await item.query_selector(".agent-name, .poster-name, .prop-agent-name")
                if author_el:
                    author = (await author_el.inner_text()).strip()

                results.append({
                    "apartment_id": apt_id,
                    "title": title,
                    "price": price,
                    "area": area,
                    "link": href,
                    "date": date_text,
                    "author": author or "(xem trang chi tiết)",
                    "source": self.SOURCE_NAME,
                })
                self.log_info(f"[{len(results)}] {title[:50]}... | {price}")

            except Exception as e:
                self.log_card_error(i, e)
                continue

        if skipped_dup or skipped_not_2pn or skipped_keyword or skipped_date:
            self.log_info(
                f"Skipped: {skipped_dup} trùng, {skipped_not_2pn} không 2PN, "
                f"{skipped_keyword} sai keyword, {skipped_date} quá cũ"
            )

        return results

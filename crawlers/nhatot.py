"""
Crawler cho nguồn Nhatot.com

Cải tiến so với bản cũ:
- PRIMARY: Gọi API JSON gateway (nhanh 10x, data sạch, filter 2PN sẵn)
- FALLBACK: Crawl HTML nếu API bị chặn
- Pagination: API param o=0, o=50, o=100...
- 2PN: Filter trực tiếp bằng API param beds=2
- Không dừng sớm khi gặp tin trùng
"""
import json
from crawlers.base import BaseCrawler
from utils import is_recent_date, text_matches_keyword, is_2pn, extract_price


class NhaTotCrawler(BaseCrawler):
    SOURCE_NAME = "nhatot.com"

    # API gateway endpoint — unofficial nhưng stable
    API_BASE = "https://gateway.chotot.com/v1/public/ad-listing"
    API_LIMIT = 50  # Items per page
    MAX_PAGES = 5

    def __init__(self, post_db):
        self.post_db = post_db

    async def crawl_apartment(self, context, apt_config: dict, needed: int) -> list[dict]:
        apt_id = apt_config["apartment_id"]
        name = apt_config["name"]
        kw = apt_config["keyword"]

        self.log_info(f"Bắt đầu crawl '{name}'")

        # Thử API trước, fallback HTML nếu fail
        results = await self._crawl_via_api(context, apt_config, needed)
        if results is None:
            self.log_warn(f"API fail cho {name}, fallback sang HTML crawl")
            results = await self._crawl_via_html(context, apt_config, needed)

        results = self.validate_results(results, name)
        self.log_info(f"Kết quả {name}: {len(results)} bài đăng hợp lệ")
        return results

    # ── API JSON Method ──────────────────────────────────────────

    async def _crawl_via_api(self, context, apt_config: dict, needed: int) -> list[dict] | None:
        """
        Gọi API JSON gateway.
        
        Returns list[dict] nếu thành công, None nếu API bị chặn/fail.
        """
        apt_id = apt_config["apartment_id"]
        kw = apt_config["keyword"]

        page = await context.new_page()
        all_results = []

        try:
            for page_num in range(self.MAX_PAGES):
                if len(all_results) >= needed:
                    break

                offset = page_num * self.API_LIMIT
                # cg=1010 = Căn hộ/Chung cư, st=u = Cho thuê, beds=2 = 2 phòng ngủ
                api_url = (
                    f"{self.API_BASE}?cg=1010&st=u&limit={self.API_LIMIT}"
                    f"&o={offset}&q={kw.replace(' ', '+')}&beds=2"
                    f"&region_v2=13000"  # HCM
                )

                self.log_info(f"API page {page_num + 1}: offset={offset}")

                if not await self.goto_with_retry(page, api_url, timeout=15000):
                    return None  # API không truy cập được → fallback HTML

                # Đọc JSON response
                try:
                    body = await page.inner_text("body")
                    data = json.loads(body)
                except Exception:
                    self.log_warn("Không parse được JSON response")
                    return None  # Có thể bị redirect/block → fallback HTML

                ads = data.get("ads", [])
                if not ads:
                    self.log_info(f"API page {page_num + 1} trống, dừng pagination.")
                    break

                self.log_info(f"API page {page_num + 1}: {len(ads)} ads")

                for ad in ads:
                    if len(all_results) >= needed:
                        break

                    link = f"https://www.nhatot.com/{ad.get('list_id', '')}.htm"
                    if self.post_db.has_link(link):
                        continue

                    # Filter keyword
                    subject = ad.get("subject", "")
                    if not text_matches_keyword(subject + " " + ad.get("body", ""), kw):
                        continue

                    # Date check
                    date_text = ad.get("date", "")
                    if date_text and not is_recent_date(date_text):
                        continue

                    # Extract fields
                    price_str = ""
                    price_val = ad.get("price")
                    if price_val:
                        if price_val >= 1_000_000:
                            price_str = f"{price_val / 1_000_000:.1f} triệu/tháng"
                        else:
                            price_str = f"{price_val:,} đ/tháng"

                    area_str = ""
                    area_val = ad.get("size")
                    if area_val:
                        area_str = f"{area_val} m²"

                    all_results.append({
                        "apartment_id": apt_id,
                        "title": subject[:120],
                        "price": price_str,
                        "area": area_str,
                        "link": link,
                        "date": date_text,
                        "author": ad.get("account_name", "Nha Tot User"),
                        "source": self.SOURCE_NAME,
                    })
                    self.log_info(f"[{len(all_results)}] {subject[:50]}... | {price_str}")

                # Check nếu đã hết data
                total = data.get("total", 0)
                if offset + self.API_LIMIT >= total:
                    break

                await self.random_delay(0.5, 1.5)

        except Exception as e:
            self.log_error(f"API error: {e}")
            return None
        finally:
            await self.safe_close_page(page)

        return all_results

    # ── HTML Fallback Method ─────────────────────────────────────

    async def _crawl_via_html(self, context, apt_config: dict, needed: int) -> list[dict]:
        """Fallback: crawl HTML nếu API bị chặn."""
        apt_id = apt_config["apartment_id"]
        name = apt_config["name"]
        kw = apt_config["keyword"]

        page = await context.new_page()
        await page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")

        all_results = []

        try:
            for page_num in range(1, self.MAX_PAGES + 1):
                if len(all_results) >= needed:
                    break

                url = f"https://www.nhatot.com/thue-can-ho-chung-cu-tp-ho-chi-minh?q={kw.replace(' ', '+')}&page={page_num}"
                self.log_info(f"HTML trang {page_num}: {url}")

                if not await self.goto_with_retry(page, url, timeout=25000):
                    break

                try:
                    await page.wait_for_selector("a[href*='.htm'][href*='thue-can-ho-chung-cu']", timeout=10000)
                except Exception:
                    pass

                await page.wait_for_timeout(2000)
                await self.scroll_to_bottom(page, 3)

                cards = await page.query_selector_all("a[href*='.htm'][href*='thue-can-ho-chung-cu']")
                self.log_info(f"HTML trang {page_num}: {len(cards)} cards")

                if not cards:
                    break

                page_results = await self._parse_html_cards(cards, apt_id, kw, needed - len(all_results))
                all_results.extend(page_results)

                if len(cards) < 10:
                    break

                await self.random_delay(1.5, 3.0)

        except Exception as e:
            self.log_error(f"HTML crawl lỗi {name}: {e}")
        finally:
            await self.safe_close_page(page)

        return all_results

    async def _parse_html_cards(self, cards, apt_id: str, kw: str, needed: int) -> list[dict]:
        """Parse cards HTML (fallback method)."""
        results = []

        for i, card in enumerate(cards):
            if len(results) >= needed:
                break
            try:
                href = await card.get_attribute("href")
                if not href:
                    continue
                if not href.startswith("http"):
                    href = f"https://www.nhatot.com{href}"

                if self.post_db.has_link(href):
                    continue

                text = (await card.inner_text()).strip()
                lines = [line.strip() for line in text.split("\n") if line.strip()]
                if not lines:
                    continue

                # Check 2PN bằng regex
                if not is_2pn(text):
                    continue

                # Title: tìm dòng dài nhất có keyword
                title = ""
                for line in lines:
                    if text_matches_keyword(line + " " + href.replace("-", " "), kw):
                        title = line
                        break
                if not title:
                    title = lines[0] if lines else ""

                if not text_matches_keyword(title + " " + href.replace("-", " "), kw):
                    continue

                # Giá và diện tích
                price = extract_price(text)
                area = ""
                for line in lines:
                    if "m²" in line:
                        area = line
                        break

                # Người đăng
                author = ""
                for li, line in enumerate(lines):
                    if "tin đăng" in line.lower() and li > 0:
                        author = lines[li - 1]
                        break

                # Ngày đăng
                date_text = ""
                for line in lines:
                    if is_recent_date(line):
                        date_text = line
                        break
                if not date_text:
                    date_text = lines[0] if lines else ""
                    if not is_recent_date(date_text):
                        continue

                results.append({
                    "apartment_id": apt_id,
                    "title": title[:120],
                    "price": price,
                    "area": area,
                    "link": href,
                    "date": date_text,
                    "author": author or "Nha Tot User",
                    "source": self.SOURCE_NAME,
                })
                self.log_info(f"[{len(results)}] {title[:50]}... | {price}")

            except Exception as e:
                self.log_card_error(i, e)
                continue

        return results

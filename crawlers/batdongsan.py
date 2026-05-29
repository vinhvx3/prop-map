"""
Crawler cho nguồn Batdongsan.com.vn

Cải tiến so với bản cũ:
- Pagination: Loop qua tất cả pages thay vì chỉ page 1
- 2PN detection: Dùng regex chuẩn từ utils.is_2pn() thay vì heuristic dòng
- Không dừng sớm khi gặp tin trùng (vì BDS sort theo VIP/boost, không theo thời gian)
- Log mọi exception với card index
- Retry page load với exponential backoff
- Cloudflare bypass cải tiến
"""
from crawlers.base import BaseCrawler
from utils import is_recent_date, text_matches_keyword, is_2pn, extract_price


class BatdongsanCrawler(BaseCrawler):
    SOURCE_NAME = "batdongsan.com.vn"

    MAX_PAGES = 5  # Tối đa 5 pages per chung cư

    def __init__(self, post_db):
        self.post_db = post_db

    async def crawl_apartment(self, context, apt_config: dict, needed: int) -> list[dict]:
        apt_id = apt_config["apartment_id"]
        name = apt_config["name"]
        kw = apt_config["keyword"]
        district = apt_config.get("district_slug", "quan-8")

        page = await context.new_page()
        await page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        self.log_info(f"Bắt đầu crawl '{name}'")

        all_results = []

        try:
            for page_num in range(1, self.MAX_PAGES + 1):
                if len(all_results) >= needed:
                    break

                # Build URL có pagination
                url = f"https://batdongsan.com.vn/cho-thue-can-ho-chung-cu-{district}?keyword={kw.replace(' ', '+')}"
                if page_num > 1:
                    url += f"&page={page_num}"

                self.log_info(f"Trang {page_num}: {url}")

                # Navigate với retry
                if not await self.goto_with_retry(page, url):
                    self.log_error(f"Không thể truy cập trang {page_num}, dừng pagination.")
                    break

                # Chờ Cloudflare
                if not await self.wait_for_cloudflare(page):
                    self.log_warn(f"Cloudflare block ở trang {page_num}, thử trang tiếp...")
                    continue

                # Chờ content load
                try:
                    await page.wait_for_selector(".js__card", timeout=12000)
                except Exception:
                    if page_num == 1:
                        self.log_warn(f"Không tìm thấy .js__card cho {name} — selector có thể đã thay đổi")
                    else:
                        self.log_info(f"Trang {page_num} không có kết quả, dừng pagination.")
                    break

                cards = await page.query_selector_all(".js__card")
                self.log_info(f"Trang {page_num}: {len(cards)} cards")

                if not cards:
                    break

                page_results = await self._parse_cards(cards, apt_id, name, kw, needed - len(all_results))
                all_results.extend(page_results)

                # Nếu trang này ít card hơn 10 → có thể đã hết
                if len(cards) < 10:
                    self.log_info(f"Trang {page_num} chỉ có {len(cards)} cards, có vẻ đã hết.")
                    break

                # Delay giữa các pages
                await self.random_delay(1.5, 3.0)

        except Exception as e:
            self.log_error(f"Lỗi crawl {name}: {e}")
        finally:
            await self.safe_close_page(page)

        # Validate kết quả
        all_results = self.validate_results(all_results, name)
        self.log_info(f"Kết quả {name}: {len(all_results)} bài đăng hợp lệ")
        return all_results

    async def _parse_cards(self, cards, apt_id: str, name: str, kw: str, needed: int) -> list[dict]:
        """Parse danh sách cards thành posts. Không break sớm khi gặp trùng."""
        results = []
        skipped_dup = 0
        skipped_not_2pn = 0
        skipped_keyword = 0
        skipped_date = 0

        for i, card in enumerate(cards):
            if len(results) >= needed:
                break
            try:
                # Lấy link
                link_el = await card.query_selector("a[class*='product-link']")
                if not link_el:
                    link_el = await card.query_selector("a")
                if not link_el:
                    continue

                href = await link_el.get_attribute("href")
                if not href:
                    continue
                if not href.startswith("http"):
                    href = f"https://batdongsan.com.vn{href}"

                # Check trùng — chỉ skip, KHÔNG break
                if self.post_db.has_link(href):
                    skipped_dup += 1
                    continue

                # Lấy toàn bộ text của card
                text = await card.inner_text()
                card_title = (await link_el.inner_text()).strip()

                # Check keyword match
                if not text_matches_keyword(card_title + " " + href.replace("-", " "), kw):
                    skipped_keyword += 1
                    continue

                # Check 2PN bằng regex chuẩn
                if not is_2pn(text):
                    skipped_not_2pn += 1
                    continue

                # Giá
                price = extract_price(text)

                # Diện tích
                area = ""
                lines = [l.strip() for l in text.split("\n") if l.strip()]
                for line in lines:
                    if "m²" in line or "m2" in line:
                        area = line
                        break

                # Title: ưu tiên attribute "title", fallback inner text
                real_title = await link_el.get_attribute("title")
                if not real_title:
                    real_title = card_title
                    if real_title.isdigit() and len(lines) > 1:
                        real_title = lines[1]

                # Làm sạch real_title khỏi chuỗi chống bot và các kí tự thừa
                if real_title:
                    real_title = real_title.replace("batdongsan.com.vn", "").strip()
                    real_title = " ".join(real_title.split())

                # Ngày đăng + người đăng
                date_text = ""
                author = ""
                
                # Thử lấy tên người đăng qua selector CSS để tránh dính honeypot text
                author_el = await card.query_selector(".re__card-contact-name, .re__card-contact, .product-contact-name, .contact-name")
                if author_el:
                    author = (await author_el.inner_text()).strip()
                    if author:
                        author = author.replace("batdongsan.com.vn", "").strip()

                for li, line in enumerate(lines):
                    if any(k in line.lower() for k in ["ngày trước", "tuần trước", "tháng trước",
                                                         "hôm qua", "hôm nay", "đăng ",
                                                         "giờ trước", "phút trước"]):
                        date_text = line.replace("batdongsan.com.vn", "").strip()
                        if not author and li - 1 >= 0:
                            val = lines[li-1].replace("\u200e", "").replace("batdongsan.com.vn", "").strip()
                            # Loại bỏ trường hợp lấy nhầm title trùng làm author (honeypot text)
                            if val and len(val) < 50 and not (real_title and val.lower() in real_title.lower()):
                                author = val
                        break

                if not is_recent_date(date_text):
                    skipped_date += 1
                    continue

                results.append({
                    "apartment_id": apt_id,
                    "title": real_title[:120],
                    "price": price,
                    "area": area,
                    "link": href,
                    "date": date_text,
                    "author": author or "BDS Agent",
                    "source": self.SOURCE_NAME,
                })
                self.log_info(f"[{len(results)}] {real_title[:50]}... | {price}")

            except Exception as e:
                self.log_card_error(i, e)
                continue

        # Log thống kê skip
        if skipped_dup or skipped_not_2pn or skipped_keyword or skipped_date:
            self.log_info(
                f"Skipped: {skipped_dup} trùng, {skipped_not_2pn} không 2PN, "
                f"{skipped_keyword} sai keyword, {skipped_date} quá cũ"
            )

        return results

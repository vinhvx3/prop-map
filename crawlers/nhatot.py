"""
Crawler cho nguồn Nhatot.com
"""
from crawlers.base import BaseCrawler
from utils import is_recent_date, text_matches_keyword


class NhaTotCrawler(BaseCrawler):
    SOURCE_NAME = "nhatot.com"

    def __init__(self, post_db):
        self.post_db = post_db

    async def crawl_apartment(self, context, apt_config: dict, needed: int) -> list[dict]:
        apt_id = apt_config["apartment_id"]
        name = apt_config["name"]
        kw = apt_config["keyword"]

        page = await context.new_page()
        await page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        print(f"  [NhaTot] Đang truy cập NhaTot...")

        try:
            url = f"https://www.nhatot.com/thue-can-ho-chung-cu-tp-ho-chi-minh?q={kw.replace(' ', '+')}"
            await page.goto(url, wait_until="domcontentloaded", timeout=25000)

            try:
                await page.wait_for_selector("a[href*='.htm'][href*='thue-can-ho-chung-cu']", timeout=10000)
            except Exception:
                pass

            await page.wait_for_timeout(2000)
            await self.scroll_to_bottom(page, 2)

            cards = await page.query_selector_all("a[href*='.htm'][href*='thue-can-ho-chung-cu']")
            print(f"  [NhaTot] Tìm thấy {len(cards)} items")

            results = []
            count = 0

            for i, card in enumerate(cards):
                if count >= needed:
                    break
                try:
                    href = await card.get_attribute("href")
                    if not href:
                        continue
                    if not href.startswith("http"):
                        href = f"https://www.nhatot.com{href}"

                    if self.post_db.has_link(href):
                        if i >= 3:
                            print(f"    [NhaTot] Gặp tin trùng tại vị trí {i+1}, dừng.")
                            break
                        continue

                    text = (await card.inner_text()).strip()
                    lines = [line.strip() for line in text.split("\n") if line.strip()]
                    if not lines:
                        continue

                    # Tìm dòng chứa "PN"
                    pn_idx = -1
                    for li, line in enumerate(lines):
                        if "PN" in line:
                            pn_idx = li
                            break

                    if pn_idx == -1 or "2" not in lines[pn_idx]:
                        continue

                    # Tiêu đề = dòng ngay trước "PN"
                    title_idx = pn_idx - 1 if pn_idx > 0 else -1
                    title = lines[title_idx] if title_idx >= 0 else ""

                    if not text_matches_keyword(title + " " + href.replace("-", " "), kw):
                        continue

                    # Giá và diện tích
                    price = ""
                    area = ""
                    for li, line in enumerate(lines):
                        if li == title_idx:
                            continue
                        if any(k in line for k in ["triệu", "tỷ", "đ/tháng"]) or line.endswith("đ"):
                            if not price:
                                price = line
                        if "m²" in line:
                            area = line

                    # Người đăng
                    author = ""
                    for li, line in enumerate(lines):
                        if "tin đăng" in line and li > 0:
                            author = lines[li - 1]
                            break

                    # Ngày đăng = dòng đầu tiên
                    date_text = lines[0]
                    if not is_recent_date(date_text):
                        continue

                    results.append({
                        "apartment_id": apt_id,
                        "title": title,
                        "price": price,
                        "area": area,
                        "link": href,
                        "date": date_text,
                        "author": author or "Nha Tot User",
                        "source": self.SOURCE_NAME,
                    })
                    count += 1
                    print(f"    [NhaTot] [{count}] {title[:40]}... | {price}")

                except Exception:
                    continue

            await page.close()
            return results

        except Exception as e:
            print(f"  [NhaTot] Lỗi crawl {name}: {e}")
            try:
                await page.close()
            except Exception:
                pass
            return []

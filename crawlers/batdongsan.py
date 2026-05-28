"""
Crawler cho nguồn Batdongsan.com.vn
"""
from crawlers.base import BaseCrawler
from utils import is_recent_date, text_matches_keyword


class BatdongsanCrawler(BaseCrawler):
    SOURCE_NAME = "batdongsan.com.vn"

    def __init__(self, post_db):
        self.post_db = post_db

    async def crawl_apartment(self, context, apt_config: dict, needed: int) -> list[dict]:
        apt_id = apt_config["apartment_id"]
        name = apt_config["name"]
        kw = apt_config["keyword"]
        district = apt_config.get("district_slug", "quan-8")

        page = await context.new_page()
        await page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        print(f"  [BDS] Đang truy cập Batdongsan.com.vn...")

        try:
            url = f"https://batdongsan.com.vn/cho-thue-can-ho-chung-cu-{district}?keyword={kw.replace(' ', '+')}"
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)

            # Chờ Cloudflare pass
            for _ in range(12):
                title = await page.title()
                if "Just a moment" not in title:
                    break
                await page.wait_for_timeout(1000)

            try:
                await page.wait_for_selector(".js__card", timeout=12000)
            except Exception:
                print(f"  [BDS] Không tìm thấy .js__card cho {name}")
                await page.close()
                return []

            cards = await page.query_selector_all(".js__card")
            print(f"  [BDS] Tìm thấy {len(cards)} items")

            results = []
            count = 0

            for i, card in enumerate(cards):
                if count >= needed:
                    break
                try:
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

                    if self.post_db.has_link(href):
                        if i >= 3:
                            print(f"    [BDS] Gặp tin trùng tại vị trí {i+1}, dừng.")
                            break
                        continue

                    card_title = (await link_el.inner_text()).strip()
                    if not text_matches_keyword(card_title + " " + href.replace("-", " "), kw):
                        continue

                    text = await card.inner_text()
                    lines = [l.strip() for l in text.split("\n") if l.strip()]

                    # Kiểm tra 2PN
                    is_2pn = False
                    for kw_2pn in ["2pn", "2 pn", "2 phòng ngủ", "2 p ngủ"]:
                        if kw_2pn in text.lower():
                            is_2pn = True
                            break
                    for li, line in enumerate(lines):
                        if ("m²" in line or "m2" in line) and li + 2 < len(lines):
                            if lines[li+1] == "·" and lines[li+2] == "2":
                                is_2pn = True
                                break

                    if not is_2pn:
                        continue

                    # Giá
                    price = ""
                    for line in lines:
                        if any(k in line.lower() for k in ["triệu/tháng", "tỷ/tháng", "đ/tháng"]):
                            price = line
                            break

                    # Diện tích
                    area = ""
                    for line in lines:
                        if "m²" in line or "m2" in line:
                            area = line
                            break

                    # Ngày đăng + người đăng
                    date_text = ""
                    author = ""
                    for li, line in enumerate(lines):
                        if any(k in line.lower() for k in ["ngày trước", "tuần trước", "tháng trước", "hôm qua", "hôm nay", "đăng "]):
                            date_text = line
                            if li - 1 >= 0:
                                author = lines[li-1].replace("\u200e", "").strip()
                            break

                    if not is_recent_date(date_text):
                        continue

                    # Lấy title từ attribute nếu có
                    real_title = await link_el.get_attribute("title")
                    if not real_title:
                        real_title = lines[0]
                        if real_title.isdigit() and len(lines) > 1:
                            real_title = lines[1]

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
                    count += 1
                    print(f"    [BDS] [{count}] {real_title[:40]}... | {price}")

                except Exception:
                    continue

            await page.close()
            return results

        except Exception as e:
            print(f"  [BDS] Lỗi crawl {name}: {e}")
            try:
                await page.close()
            except Exception:
                pass
            return []

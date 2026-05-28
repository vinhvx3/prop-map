"""
Crawler cho nguồn Mogi.vn
"""
from datetime import datetime
from crawlers.base import BaseCrawler
from utils import is_recent_date, text_matches_keyword


class MogiCrawler(BaseCrawler):
    SOURCE_NAME = "mogi.vn"

    def __init__(self, post_db):
        self.post_db = post_db

    async def crawl_apartment(self, context, apt_config: dict, needed: int) -> list[dict]:
        apt_id = apt_config["apartment_id"]
        name = apt_config["name"]
        kw = apt_config["keyword"]

        page = await context.new_page()
        await page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        print(f"  [Mogi] Đang truy cập Mogi...")

        try:
            await page.goto("https://mogi.vn/thue-can-ho-chung-cu", wait_until="domcontentloaded", timeout=25000)
            await page.wait_for_timeout(1500)

            search_input = await page.query_selector("input[placeholder*='Từ khóa']")
            if not search_input:
                print("  [Mogi] Không tìm thấy ô search")
                await page.close()
                return []

            print(f"  [Mogi] Tìm kiếm '{kw}'...")
            await search_input.fill(kw)
            await page.wait_for_timeout(800)
            await page.keyboard.press("Enter")
            await page.wait_for_timeout(4500)

            current_url = page.url
            if current_url.strip("/").endswith("thue-can-ho-chung-cu"):
                print("  [Mogi] Không redirect được, bỏ qua.")
                await page.close()
                return []

            await self.scroll_to_bottom(page, 4)
            items = await page.query_selector_all("ul.props > li")
            print(f"  [Mogi] Tìm thấy {len(items)} items")

            results = []
            count = 0

            for i, item in enumerate(items):
                if count >= needed:
                    break
                try:
                    # Kiểm tra 2PN
                    attrs = await item.query_selector_all(".prop-attr li")
                    is_2pn = False
                    area = ""
                    for attr in attrs:
                        txt = (await attr.inner_text()).strip()
                        if "m" in txt.lower():
                            area = txt
                        if "PN" in txt and "2" in txt:
                            is_2pn = True

                    if not is_2pn:
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

                    if self.post_db.has_link(href):
                        if i >= 3:
                            print(f"    [Mogi] Gặp tin trùng tại vị trí {i+1}, dừng.")
                            break
                        continue

                    # Lấy thông tin card
                    title_el = await item.query_selector(".prop-title, h2")
                    title = (await title_el.inner_text()).strip() if title_el else ""

                    price_el = await item.query_selector(".price")
                    price = (await price_el.inner_text()).strip() if price_el else ""

                    date_el = await item.query_selector(".prop-created")
                    date_text = (await date_el.inner_text()).strip() if date_el else ""

                    if not is_recent_date(date_text):
                        continue

                    if date_text == "Hôm nay":
                        date_text = datetime.now().strftime("%d/%m/%Y")

                    # Lấy tên người đăng từ trang chi tiết
                    author = ""
                    try:
                        detail = await page.context.new_page()
                        await detail.goto(href, wait_until="domcontentloaded", timeout=20000)
                        await detail.wait_for_timeout(1500)

                        for sel in [".agent-name", ".info-name a", ".info-name",
                                    "[class*='contact'] .name", ".agent-info .name", ".poster-name"]:
                            a_el = await detail.query_selector(sel)
                            if a_el:
                                author = (await a_el.inner_text()).strip()
                                if author:
                                    break
                        await detail.close()
                    except Exception:
                        try:
                            await detail.close()
                        except Exception:
                            pass

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
                    count += 1
                    print(f"    [Mogi] [{count}] {title[:40]}... | {price}")
                    await self.random_delay(1.0, 2.0)

                except Exception:
                    continue

            await page.close()
            return results

        except Exception as e:
            print(f"  [Mogi] Lỗi crawl {name}: {e}")
            try:
                await page.close()
            except Exception:
                pass
            return []

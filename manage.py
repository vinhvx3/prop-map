"""
manage.py: Công cụ dòng lệnh hợp nhất cho dự án PropMap.
Kích hoạt các tác vụ crawl, enrich, clean và export dữ liệu.

Sử dụng:
  python manage.py crawl [--apartment "Tên_Chung_Cư"] [--source nguồn_tin]
  python manage.py enrich
  python manage.py clean
  python manage.py export [--excel]
"""
import sys
import os
import argparse
import asyncio
import io

# Đảm bảo console xuất tiếng Việt chuẩn xác
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# Thêm thư mục hiện tại vào PYTHONPATH
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


# ── Subcommand: CRAWL ─────────────────────────────────────────

async def run_crawl(apartment_filter: str = None, source_filter: str = None):
    """Thực thi tiến trình cào dữ liệu qua Playwright."""
    from playwright.async_api import async_playwright
    from config import BROWSER_HEADLESS, BROWSER_SLOW_MO, BROWSER_USER_AGENT
    from db import ApartmentDB, PostDB
    from crawlers import MogiCrawler, NhaTotCrawler, BatdongsanCrawler, BaseCrawler

    apt_db = ApartmentDB()
    post_db = PostDB()
    
    all_crawlers = [
        ("mogi", MogiCrawler(post_db)),
        ("nhatot", NhaTotCrawler(post_db)),
        ("bds", BatdongsanCrawler(post_db)),
    ]
    
    if source_filter:
        crawlers = [c for key, c in all_crawlers if key == source_filter.strip().lower()]
    else:
        crawlers = [c for _, c in all_crawlers]

    configs = apt_db.get_crawl_configs()
    if apartment_filter:
        configs = [c for c in configs if apartment_filter.lower() in c["name"].lower()]
        if not configs:
            print(f"[Crawl] Không tìm thấy chung cư nào phù hợp với từ khóa: '{apartment_filter}'")
            return

    print("=" * 60)
    print(f"CRAWL {len(configs)} CHUNG CƯ × {len(crawlers)} NGUỒN TIN")
    print("=" * 60)

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=BROWSER_HEADLESS,
            slow_mo=BROWSER_SLOW_MO,
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = await browser.new_context(
            viewport={"width": 1366, "height": 900},
            user_agent=BROWSER_USER_AGENT,
            locale="vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
            timezone_id="Asia/Ho_Chi_Minh",
        )

        for idx, config in enumerate(configs, 1):
            apt_name = config["name"]
            tasks = []
            for crawler in crawlers:
                tasks.append(crawler.crawl_apartment(context, config, 9999))
                print(f"  - {crawler.SOURCE_NAME}: Đăng ký cào tin mới không giới hạn")

            print(f"\n[{idx}/{len(configs)}] [CRAWLING] {apt_name}")
            results = await asyncio.gather(*tasks)

            added = 0
            for res_list in results:
                for post in res_list:
                    if post_db.add(post):
                        added += 1

            if added > 0:
                post_db.save()
                print(f"  → Thêm thành công {added} bài đăng mới. Tổng: {post_db.count}")
            else:
                print(f"  → Không phát hiện bài đăng mới.")

            await BaseCrawler.random_delay(1.5, 3.0)

        await browser.close()

    # Xuất bản dữ liệu dashboard tức thì
    from export import export_data_js
    export_data_js()


# ── Subcommand: ENRICH ────────────────────────────────────────

def run_enrich():
    """Làm giàu thông tin bất động sản."""
    from db.enrich import enrich_all_apartments
    from db import ApartmentDB
    
    enrich_all_apartments()
    # Kích hoạt ghi file để đồng bộ JSON
    ApartmentDB().save()


# ── Subcommand: CLEAN ─────────────────────────────────────────

def run_clean():
    """Dọn dẹp bài đăng đã cũ/hết hạn."""
    from db import PostDB
    from datetime import datetime, timedelta
    from config import CRAWL_MAX_STALE_DAYS

    post_db = PostDB()
    cutoff_date = datetime.now() - timedelta(days=CRAWL_MAX_STALE_DAYS)
    
    def is_fresh(post):
        d_str = post.get("date")
        if not d_str:
            return True
        try:
            dt = datetime.fromisoformat(d_str.replace("Z", ""))
            return dt >= cutoff_date
        except ValueError:
            return True

    removed = post_db.remove_stale(is_fresh)
    print(f"Đã dọn dẹp {removed} bài đăng đã hết hạn (quá {CRAWL_MAX_STALE_DAYS} ngày).")
    print(f"Hiện đang lưu trữ: {post_db.count} bài đăng sạch.")


# ── Subcommand: EXPORT ────────────────────────────────────────

def run_export(excel: bool = False):
    """Đồng bộ hóa dữ liệu frontend và xuất báo cáo Excel."""
    from export import export_data_js, export_excel
    
    export_data_js()
    if excel:
        export_excel()


# ── Main Entrypoint ───────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="PropMap CLI Tool — Bộ điều khiển quản lý và vận hành cơ sở dữ liệu chung cư.",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    subparsers = parser.add_subparsers(dest="command", required=True, help="Các lệnh con điều hành")

    # Command: crawl
    crawl_parser = subparsers.add_parser("crawl", help="Thu thập tin rao bất động sản tự động")
    crawl_parser.add_argument("--apartment", type=str, help="Cào tin riêng cho 1 chung cư theo tên")
    crawl_parser.add_argument("--source", type=str, choices=["mogi", "nhatot", "bds"], help="Lọc theo nguồn tin rao")

    # Command: enrich
    subparsers.add_parser("enrich", help="Thực hiện chuẩn hóa dữ liệu phân khúc, tiện ích, chủ đầu tư")

    # Command: clean
    subparsers.add_parser("clean", help="Dọn dẹp bài đăng đã cũ quá thời hạn quy định")

    # Command: export
    export_parser = subparsers.add_parser("export", help="Đồng bộ hóa dữ liệu dashboard và báo cáo")
    export_parser.add_argument("--excel", action="store_true", help="Kèm theo xuất báo cáo Microsoft Excel")

    args = parser.parse_args()

    if args.command == "crawl":
        asyncio.run(run_crawl(args.apartment, args.source))
    elif args.command == "enrich":
        run_enrich()
    elif args.command == "clean":
        run_clean()
    elif args.command == "export":
        run_export(args.excel)


if __name__ == "__main__":
    main()

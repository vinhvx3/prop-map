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
    from config import BROWSER_HEADLESS, BROWSER_SLOW_MO, BROWSER_USER_AGENT, CRAWL_TARGET_PER_SOURCE
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
    print(f"Target: tối đa {CRAWL_TARGET_PER_SOURCE} tin/nguồn/chung cư")
    print("=" * 60)

    # Thống kê health check
    health_report = {}

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=BROWSER_HEADLESS,
            slow_mo=BROWSER_SLOW_MO,
            args=["--disable-blink-features=AutomationControlled"],
        )

        for idx, config in enumerate(configs, 1):
            apt_name = config["name"]
            print(f"\n[{idx}/{len(configs)}] [CRAWLING] {apt_name}")

            total_added_for_apt = 0

            # Chạy tuần tự — mỗi crawler dùng context riêng
            for crawler in crawlers:
                source_name = crawler.SOURCE_NAME
                print(f"\n  ── {source_name} ──")

                # Mỗi crawler tạo context mới → tránh shared cookies/state
                context = await browser.new_context(
                    viewport={"width": 1366, "height": 900},
                    user_agent=BROWSER_USER_AGENT,
                    locale="vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
                    timezone_id="Asia/Ho_Chi_Minh",
                )

                try:
                    results = await crawler.crawl_apartment(context, config, CRAWL_TARGET_PER_SOURCE)

                    added = 0
                    for post in results:
                        if post_db.add(post):
                            added += 1

                    total_added_for_apt += added

                    # Health check tracking
                    key = source_name
                    if key not in health_report:
                        health_report[key] = {"success": 0, "empty": 0, "total_posts": 0}
                    health_report[key]["total_posts"] += added
                    if len(results) > 0:
                        health_report[key]["success"] += 1
                    else:
                        health_report[key]["empty"] += 1

                    print(f"  → {source_name}: +{added} bài mới (crawl được {len(results)})")

                except Exception as e:
                    print(f"  → {source_name}: LỖI — {e}")
                    key = source_name
                    if key not in health_report:
                        health_report[key] = {"success": 0, "empty": 0, "total_posts": 0}
                    health_report[key]["empty"] += 1
                finally:
                    await context.close()

            print(f"\n  ═══ Tổng {apt_name}: +{total_added_for_apt} bài mới. DB: {post_db.count} bài")
            await BaseCrawler.random_delay(1.5, 3.0)

        await browser.close()

    # ── Health Check Report ──
    print("\n" + "=" * 60)
    print("HEALTH CHECK REPORT")
    print("=" * 60)
    has_warning = False
    for source, stats in health_report.items():
        total_runs = stats["success"] + stats["empty"]
        empty_rate = stats["empty"] / total_runs * 100 if total_runs > 0 else 0
        status = "✅" if empty_rate < 50 else "⚠️"
        if empty_rate >= 50:
            has_warning = True
        print(f"  {status} {source}: {stats['total_posts']} bài mới | "
              f"{stats['success']}/{total_runs} chung cư có kết quả | "
              f"{empty_rate:.0f}% empty rate")

    if has_warning:
        print("\n  ⚠️  CÓ NGUỒN TRỐNG >50% — có thể selector đã thay đổi hoặc bị block!")
        print("  → Chạy lại với --source để debug từng nguồn riêng.")
    print()

    # Dữ liệu được lưu trữ trực tiếp vào SQLite DB thời gian thực, không cần xuất dữ liệu tĩnh
    print("  [OK] Đã lưu dữ liệu bài đăng mới trực tiếp vào SQLite DB.")


# ── Subcommand: ENRICH ────────────────────────────────────────

def run_enrich():
    """Làm giàu thông tin bất động sản."""
    from db.enrich import enrich_all_apartments
    
    enrich_all_apartments()


# ── Subcommand: CLEAN ─────────────────────────────────────────

def run_clean():
    """Dọn dẹp bài đăng đã cũ/hết hạn và các bài đăng sai lệch (mismatched/orphan)."""
    from db import PostDB, ApartmentDB
    from datetime import datetime, timedelta
    from config import CRAWL_MAX_STALE_DAYS
    from utils import text_matches_keyword

    post_db = PostDB()
    apt_db = ApartmentDB()
    
    # 1. Dọn dẹp tin hết hạn
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

    removed_stale = post_db.remove_stale(is_fresh)
    
    # 2. Dọn dẹp tin sai lệch từ khóa / chung cư mồ côi
    apts = apt_db.list()
    apt_map = {a["id"]: a for a in apts}
    
    to_delete_links = []
    for post in post_db.list():
        aid = post.get("apartment_id")
        if not aid or aid not in apt_map:
            to_delete_links.append(post["link"])
            continue
            
        apt = apt_map[aid]
        kw = apt.get("crawl_config", {}).get("keyword") if apt.get("crawl_config") else None
        if not kw:
            to_delete_links.append(post["link"])
            continue
            
        title_href = post["title"] + " " + post["link"].replace("-", " ")
        if not text_matches_keyword(title_href, kw):
            to_delete_links.append(post["link"])
            
    removed_mismatched = 0
    if to_delete_links:
        removed_mismatched = post_db.remove_by_links(set(to_delete_links))
        
    print(f"Đã dọn dẹp {removed_stale} bài đăng đã hết hạn (quá {CRAWL_MAX_STALE_DAYS} ngày).")
    print(f"Đã dọn dẹp {removed_mismatched} bài đăng sai lệch từ khóa (mismatched) hoặc mồ côi (orphan).")
    print(f"Hiện đang lưu trữ: {post_db.count} bài đăng sạch.")


# ── Subcommand: EXPORT ────────────────────────────────────────

def run_export(excel: bool = False):
    """Xuất báo cáo Excel tổng hợp dữ liệu chung cư và bài đăng."""
    from export import export_excel
    
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
    export_parser = subparsers.add_parser("export", help="Xuất dữ liệu ra báo cáo Excel")
    export_parser.add_argument("--excel", action="store_true", help="Xuất báo cáo Microsoft Excel (mặc định)")

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

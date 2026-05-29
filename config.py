"""
Config chung cho project Do Nothing.
"""
import os

# Đường dẫn gốc
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")


# Export paths
EXCEL_PATH = os.path.join(DATA_DIR, "report.xlsx")

# Crawl settings
CRAWL_TARGET_PER_SOURCE = 10  # Số tin tối đa crawl mỗi chung cư mỗi nguồn
CRAWL_MAX_STALE_DAYS = 30     # Tin cũ hơn X ngày bị bỏ qua

# Browser settings
BROWSER_HEADLESS = False
BROWSER_SLOW_MO = 100
BROWSER_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/125.0.0.0 Safari/537.36"
)

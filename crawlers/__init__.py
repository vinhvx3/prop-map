from crawlers.base import BaseCrawler
from crawlers.mogi import MogiCrawler
from crawlers.nhatot import NhaTotCrawler
from crawlers.batdongsan import BatdongsanCrawler

ALL_CRAWLERS = [MogiCrawler, NhaTotCrawler, BatdongsanCrawler]

__all__ = ["BaseCrawler", "MogiCrawler", "NhaTotCrawler", "BatdongsanCrawler", "ALL_CRAWLERS"]

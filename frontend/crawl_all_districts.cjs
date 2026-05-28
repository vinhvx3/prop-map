/**
 * Crawl Google Maps cho tất cả các quận huyện còn lại tại TP.HCM.
 * Chạy song song nhiều worker bằng Playwright để tối ưu thời gian.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DISTRICTS = [
  { name: 'Quận 1', code: 'Q.1' },
  { name: 'Quận 3', code: 'Q.3' },
  { name: 'Quận 4', code: 'Q.4' },
  { name: 'Quận 5', code: 'Q.5' },
  { name: 'Quận 6', code: 'Q.6' },
  { name: 'Quận 10', code: 'Q.10' },
  { name: 'Quận 11', code: 'Q.11' },
  { name: 'Quận 12', code: 'Q.12' },
  { name: 'Quận Bình Tân', code: 'Q. Bình Tân' },
  { name: 'Quận Bình Thạnh', code: 'Q. Bình Thạnh' },
  { name: 'Quận Gò Vấp', code: 'Q. Gò Vấp' },
  { name: 'Quận Phú Nhuận', code: 'Q. Phú Nhuận' },
  { name: 'Quận Tân Bình', code: 'Q. Tân Bình' },
  { name: 'Quận Tân Phú', code: 'Q. Tân Phú' },
  { name: 'TP. Thủ Đức', code: 'TP. Thủ Đức' },
  { name: 'Huyện Bình Chánh', code: 'H. Bình Chánh' },
  { name: 'Huyện Hóc Môn', code: 'H. Hóc Môn' },
  { name: 'Huyện Nhà Bè', code: 'H. Nhà Bè' },
  { name: 'Huyện Củ Chi', code: 'H. Củ Chi' },
  { name: 'Huyện Cần Giờ', code: 'H. Cần Giờ' }
];

// Tạo các search queries cho mỗi quận
const searchTasks = [];
for (const dist of DISTRICTS) {
  searchTasks.push({
    district: dist.name,
    code: dist.code,
    query: `chung cư ${dist.name} TP HCM`
  });
  searchTasks.push({
    district: dist.name,
    code: dist.code,
    query: `căn hộ ${dist.name} Hồ Chí Minh`
  });
}

// Từ khóa loại trừ tiếng Việt để lọc nhiễu ngay khi cào
const EXCLUDE_KEYWORDS = [
  'văn phòng', 'công ty', 'chợ', 'trường', 'nhà sách', 'nha khoa', 'phòng khám',
  'ủy ban', 'công an', 'nhà thuốc', 'siêu thị', 'trụ sở', 'chi nhánh', 'giao dịch',
  'quán', 'cà phê', 'cafe', 'bán lẻ', 'dịch vụ', 'vui chơi', 'khu công nghiệp',
  'ký túc xá', 'khách sạn', 'hotel', 'homestay', 'nhà nghỉ', 'phòng trọ', 'nhà thuê',
  'môi giới', 'bất động sản', 'ký gửi', 'ký gửi nhà đất', 'chụp hình'
];

async function searchGoogleMaps(page, task, workerId) {
  const results = [];
  const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(task.query)}`;
  
  console.log(`[Worker ${workerId}][SEARCH] '${task.query}'...`);
  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForTimeout(2000);

    const sidebar = '[role="feed"]';
    try {
      await page.waitForSelector(sidebar, { timeout: 6000 });
      
      let prevCount = 0;
      // Scroll khoảng 10 lần để lấy tối đa các kết quả phổ biến nhất của quận
      for (let i = 0; i < 10; i++) {
        const items = await page.$$(sidebar + ' > div[jsaction]');
        if (items.length === prevCount && i > 2) break;
        prevCount = items.length;
        
        await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (el) el.scrollBy(0, 1000);
        }, sidebar);
        await page.waitForTimeout(1000);
        
        const endText = await page.evaluate(() => {
          return document.body.innerText.includes("You've reached the end") ||
                 document.body.innerText.includes("Đã đến cuối");
        });
        if (endText) break;
      }

      // Trích xuất các liên kết địa điểm
      const extracted = await page.$$eval(
        '[role="feed"] a[href*="maps/place"]',
        els => els.map(el => {
          const href = el.href || '';
          const nameEl = el.querySelector('[aria-label]') || el;
          const ariaLabel = nameEl.getAttribute('aria-label') || '';
          const text = ariaLabel || el.innerText || '';
          return { name: text.split('\n')[0].trim(), link: href };
        }).filter(x => x.name && x.name.length > 2)
      );

      // Lọc nhanh theo bộ lọc tiếng Việt loại trừ nhiễu
      for (const item of extracted) {
        const lowerName = item.name.toLowerCase();
        const isNoise = EXCLUDE_KEYWORDS.some(k => lowerName.includes(k));
        if (!isNoise) {
          results.push({
            name: item.name,
            link: item.link,
            district_code: task.code,
            district_name: task.district
          });
        }
      }
      console.log(`[Worker ${workerId}]  -> Found ${results.length} valid items for '${task.query}'`);
    } catch (e) {
      // Trường hợp Google Maps redirect thẳng vào 1 địa điểm duy nhất (độ khớp tuyệt đối hoặc chỉ có 1 kết quả)
      const currentUrl = page.url();
      if (currentUrl.includes('/maps/place/')) {
        const title = await page.title();
        const cleanedTitle = title.split(' - Google Maps')[0].trim();
        const lowerTitle = cleanedTitle.toLowerCase();
        const isNoise = EXCLUDE_KEYWORDS.some(k => lowerTitle.includes(k));
        if (!isNoise) {
          results.push({
            name: cleanedTitle,
            link: currentUrl,
            district_code: task.code,
            district_name: task.district
          });
          console.log(`[Worker ${workerId}]  -> Redirected to single place: ${cleanedTitle}`);
        }
      } else {
        console.log(`[Worker ${workerId}]  -> Sidebar selector not found for '${task.query}' (No results)`);
      }
    }
  } catch (err) {
    console.error(`[Worker ${workerId}]  -> Error querying '${task.query}': ${err.message}`);
  }
  return results;
}

async function main() {
  console.log(`Bắt đầu cào dữ liệu Google Maps cho 19 quận huyện còn lại...`);
  console.log(`Tổng số tác vụ tìm kiếm: ${searchTasks.length}`);

  const browser = await chromium.launch({ headless: true });
  
  const CONCURRENCY = 4;
  const allResults = [];
  
  const workers = Array.from({ length: CONCURRENCY }, async (_, workerId) => {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
      locale: 'vi-VN',
    });
    const page = await context.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'vi-VN,vi;q=0.9' });
    
    // Tối ưu tốc độ tải trang bằng cách chặn ảnh và media
    await page.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (type === 'image' || type === 'media' || type === 'font') {
        route.abort();
      } else {
        route.continue();
      }
    });

    while (searchTasks.length > 0) {
      const task = searchTasks.shift();
      if (!task) break;
      
      const results = await searchGoogleMaps(page, task, workerId);
      allResults.push(...results);
      await page.waitForTimeout(1000);
    }
    
    await page.close();
    await context.close();
  });

  await Promise.all(workers);
  await browser.close();

  // Chuẩn hóa và lọc trùng lặp
  const seen = new Set();
  const uniqueResults = [];
  
  for (const item of allResults) {
    // Normalization key
    const key = item.name.toLowerCase()
      .replace(/[àáâãäåạảắằặẳẵấầậẩẫăâ]/g, 'a')
      .replace(/[èéêëẹẻếềệểễ]/g, 'e')
      .replace(/[ìíîïịỉĩ]/g, 'i')
      .replace(/[òóôõöøọỏốồộổỗớờợởỡơô]/g, 'o')
      .replace(/[ùúûüụủứừựửữưú]/g, 'u')
      .replace(/[ýÿỵỷỹ]/g, 'y')
      .replace(/đ/g, 'd')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!seen.has(key) && key.length > 3) {
      seen.add(key);
      uniqueResults.push(item);
    }
  }

  console.log(`\n=================== HOÀN THÀNH CRAWL ===================`);
  console.log(`Tổng số kết quả thô: ${allResults.length}`);
  console.log(`Số lượng chung cư duy nhất sau khi lọc trùng và nhiễu: ${uniqueResults.length}`);

  const OUTPUT_PATH = path.join(__dirname, '..', 'all_districts_gmaps_results.json');
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ total: uniqueResults.length, items: uniqueResults }, null, 2), 'utf-8');
  console.log(`Đã lưu kết quả thành công vào file: ${OUTPUT_PATH}`);
}

main().catch(console.error);

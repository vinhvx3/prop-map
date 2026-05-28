/**
 * Crawl Google Maps để lấy danh sách chung cư Quận 8 thực tế.
 * Tìm kiếm nhiều keyword khác nhau để cover hết.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SEARCHES = [
  'chung cư quận 8 TP HCM',
  'căn hộ quận 8 Hồ Chí Minh',
  'apartment quan 8 Ho Chi Minh',
  'chung cư Võ Văn Kiệt quận 8',
  'chung cư Tạ Quang Bửu quận 8',
  'chung cư Phạm Thế Hiển quận 8',
  'chung cư Cao Lỗ quận 8',
  'chung cư Bến Bình Đông quận 8',
  'chung cư Phạm Đức Sơn quận 8',
];

async function searchGoogleMaps(page, query) {
  const results = [];
  const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
  
  console.log(`\n[SEARCH] ${query}`);
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Scroll sidebar để load hết kết quả
  const sidebar = '[role="feed"]';
  try {
    await page.waitForSelector(sidebar, { timeout: 8000 });
    
    let prevCount = 0;
    for (let i = 0; i < 15; i++) {
      const items = await page.$$(sidebar + ' > div[jsaction]');
      if (items.length === prevCount && i > 3) break;
      prevCount = items.length;
      
      // Scroll xuống trong sidebar
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el) el.scrollBy(0, 800);
      }, sidebar);
      await page.waitForTimeout(1200);
      
      // Check nếu đã hết ("You've reached the end")
      const endText = await page.evaluate(() => {
        return document.body.innerText.includes("You've reached the end") ||
               document.body.innerText.includes("Đã đến cuối");
      });
      if (endText) break;
    }

    // Extract tất cả kết quả
    const extracted = await page.$$eval(
      '[role="feed"] a[href*="maps/place"]',
      els => els.map(el => {
        const href = el.href || '';
        const nameEl = el.querySelector('[aria-label]') || el;
        const ariaLabel = nameEl.getAttribute('aria-label') || '';
        // Lấy tên từ aria-label hoặc text
        const text = ariaLabel || el.innerText || '';
        return { name: text.split('\n')[0].trim(), link: href };
      }).filter(x => x.name && x.name.length > 2)
    );
    results.push(...extracted);
    console.log(`  -> Found ${extracted.length} items`);
  } catch (e) {
    console.log(`  -> Error: ${e.message}`);
  }
  
  return results;
}

async function main() {
  const browser = await chromium.launch({ headless: false }); // headless=false để bypass bot detection tốt hơn
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'vi-VN',
  });
  
  const page = await context.newPage();
  
  // Set Vietnamese language
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'vi-VN,vi;q=0.9' });
  
  const allRaw = [];
  
  for (const query of SEARCHES) {
    const results = await searchGoogleMaps(page, query);
    allRaw.push(...results);
    await page.waitForTimeout(2000);
  }
  
  await browser.close();
  
  // Dedup by normalized name
  const seen = new Set();
  const unique = [];
  for (const item of allRaw) {
    const key = item.name.toLowerCase()
      .replace(/[àáâãäå]/g, 'a').replace(/[èéêë]/g, 'e')
      .replace(/[ìíîï]/g, 'i').replace(/[òóôõöø]/g, 'o')
      .replace(/[ùúûü]/g, 'u').replace(/[ýÿ]/g, 'y')
      .replace(/đ/g, 'd')
      .replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    if (!seen.has(key) && key.length > 3) {
      seen.add(key);
      unique.push(item);
    }
  }
  
  // Filter chỉ giữ lại những cái có vẻ là chung cư Q8
  const Q8_KEYWORDS = ['quận 8', 'quan 8', 'q.8', 'q8', 'phường', 'ward',
    'võ văn kiệt', 'vo van kiet', 'tạ quang bửu', 'ta quang buu',
    'phạm thế hiển', 'cao lỗ', 'bến bình đông', 'phạm đức sơn',
    'hoàng diệu', 'trịnh quang nghị', 'lê quang kim', 'nguyễn văn linh'];
  
  // Load current DB để so sánh
  const APTS_PATH = path.join(__dirname, '..', 'data', 'apartments.json');
  const currentApts = JSON.parse(fs.readFileSync(APTS_PATH, 'utf-8'));
  const currentQ8 = currentApts.filter(a => a.district === 'Q.8').map(a => a.name.toLowerCase());
  
  console.log('\n========= KẾT QUẢ =========');
  console.log(`Total raw results: ${allRaw.length}`);
  console.log(`Unique: ${unique.length}`);
  
  // In danh sách đầy đủ
  console.log('\n--- Tất cả unique results từ Google Maps ---');
  unique.forEach((item, i) => {
    const inDb = currentQ8.some(n => {
      const norm = n.replace(/[àáâã]/g, 'a');
      const itemNorm = item.name.toLowerCase().replace(/[àáâã]/g, 'a');
      return itemNorm.includes(norm.split(' ')[0]) || norm.includes(itemNorm.split(' ')[0]);
    });
    console.log(`${i+1}. [${inDb ? 'DB' : 'NEW'}] ${item.name}`);
  });
  
  // Lưu kết quả
  fs.writeFileSync(
    path.join(__dirname, '..', 'q8_gmaps_results.json'),
    JSON.stringify({ total: unique.length, items: unique, raw_count: allRaw.length }, null, 2),
    'utf-8'
  );
  console.log('\nSaved to q8_gmaps_results.json');
}

main().catch(console.error);

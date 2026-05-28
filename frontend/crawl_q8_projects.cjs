const { chromium } = require('playwright');
const fs = require('fs');

const SOURCES = [
  {
    name: 'rever',
    url: 'https://rever.vn/du-an/can-ho-chung-cu/quan-8',
    scrape: async (page) => {
      const results = [];
      try {
        await page.goto('https://rever.vn/du-an/can-ho-chung-cu/quan-8', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);
        // Scroll để load hết
        for (let i = 0; i < 5; i++) {
          await page.evaluate(() => window.scrollBy(0, 1200));
          await page.waitForTimeout(1000);
        }
        const items = await page.$$eval(
          '[class*="project-card"], [class*="ProjectCard"], [class*="project_card"], .project-item, [data-testid*="project"]',
          els => els.map(el => ({
            name: el.querySelector('h2,h3,[class*="title"],[class*="name"]')?.innerText?.trim() || '',
            address: el.querySelector('[class*="address"],[class*="location"]')?.innerText?.trim() || '',
            link: el.querySelector('a')?.href || '',
          })).filter(x => x.name)
        );
        results.push(...items);
      } catch (e) {
        console.log('Rever error:', e.message);
      }
      return results;
    }
  }
];

async function crawlBatDongSan(page) {
  const results = [];
  // Try multiple pages
  for (let p = 1; p <= 5; p++) {
    const url = `https://batdongsan.com.vn/nha-dat/du-an-can-ho-chung-cu-quan-8?page=${p}`;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      // Wait for Cloudflare
      for (let i = 0; i < 15; i++) {
        const title = await page.title();
        if (!title.includes('Just a moment')) break;
        await page.waitForTimeout(1000);
      }
      await page.waitForTimeout(2000);
      const title = await page.title();
      console.log(`  Page ${p} title: ${title}`);

      const items = await page.$$eval(
        '.js__card, [class*="product-item"], [class*="project-card"]',
        els => els.map(el => {
          const nameEl = el.querySelector('h2,h3,[class*="title"],[class*="name"],a');
          const addressEl = el.querySelector('[class*="address"],[class*="location"],[class*="subtitle"]');
          const linkEl = el.querySelector('a');
          return {
            name: nameEl?.innerText?.trim() || '',
            address: addressEl?.innerText?.trim() || '',
            link: linkEl?.href || '',
          };
        }).filter(x => x.name && x.name.length > 3)
      );
      console.log(`  BDS page ${p}: found ${items.length} items`);
      results.push(...items);
      if (items.length === 0) break;
    } catch (e) {
      console.log(`BDS page ${p} error:`, e.message);
      break;
    }
  }
  return results;
}

async function crawlNhaTot(page) {
  const results = [];
  try {
    await page.goto('https://www.nha.vn/can-ho-chung-cu/quan-8/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, 1200));
      await page.waitForTimeout(800);
    }
    const items = await page.$$eval(
      'article, [class*="project"], [class*="card"]',
      els => els.map(el => ({
        name: el.querySelector('h2,h3,h4,[class*="title"],[class*="name"]')?.innerText?.trim() || '',
        address: el.querySelector('[class*="address"],[class*="location"],[class*="place"]')?.innerText?.trim() || '',
        link: el.querySelector('a')?.href || '',
      })).filter(x => x.name && x.name.length > 3)
    );
    console.log(`  NhaVn: found ${items.length} items`);
    results.push(...items);
  } catch (e) {
    console.log('NhaVn error:', e.message);
  }
  return results;
}

async function crawlAnGia(page) {
  // angialand.com.vn list Q8
  const results = [];
  try {
    await page.goto('https://angialand.com.vn/du-an-can-ho-quan-8/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, 1200));
      await page.waitForTimeout(800);
    }
    const items = await page.$$eval(
      'article, [class*="project"], [class*="card"], [class*="item"]',
      els => els.map(el => ({
        name: el.querySelector('h2,h3,h4,[class*="title"],[class*="name"]')?.innerText?.trim() || '',
        address: el.querySelector('[class*="address"],[class*="location"],[class*="place"]')?.innerText?.trim() || '',
        link: el.querySelector('a')?.href || '',
      })).filter(x => x.name && x.name.length > 3)
    );
    console.log(`  AnGia: found ${items.length} items`);
    results.push(...items);
  } catch (e) {
    console.log('AnGia error:', e.message);
  }
  return results;
}

async function crawlDuAnChungCu(page) {
  const results = [];
  try {
    await page.goto('https://duanchungcutphcm.com/quan-8/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => window.scrollBy(0, 1200));
      await page.waitForTimeout(600);
    }
    const items = await page.$$eval(
      'article, [class*="project"], [class*="card"], [class*="item"], h2 a, h3 a',
      els => els.map(el => {
        if (el.tagName === 'A') {
          return { name: el.innerText.trim(), address: '', link: el.href };
        }
        return {
          name: el.querySelector('h2,h3,h4,a[title]')?.innerText?.trim() || '',
          address: el.querySelector('[class*="address"],[class*="location"]')?.innerText?.trim() || '',
          link: el.querySelector('a')?.href || '',
        };
      }).filter(x => x.name && x.name.length > 3)
    );
    console.log(`  DuAnChungCu: found ${items.length} items`);
    results.push(...items);
  } catch (e) {
    console.log('DuAnChungCu error:', e.message);
  }
  return results;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });

  const allResults = {};

  // BatDongSan
  console.log('\n=== Crawling BatDongSan ===');
  const page1 = await context.newPage();
  allResults.batdongsan = await crawlBatDongSan(page1);
  await page1.close();

  // NhaVn
  console.log('\n=== Crawling Nha.vn ===');
  const page2 = await context.newPage();
  allResults.nhavn = await crawlNhaTot(page2);
  await page2.close();

  // DuAnChungCu
  console.log('\n=== Crawling DuAnChungCuTPHCM ===');
  const page3 = await context.newPage();
  allResults.duanchungcu = await crawlDuAnChungCu(page3);
  await page3.close();

  // AnGia
  console.log('\n=== Crawling AnGia ===');
  const page4 = await context.newPage();
  allResults.angia = await crawlAnGia(page4);
  await page4.close();

  await browser.close();

  // Merge + dedup by name
  const seen = new Set();
  const merged = [];
  for (const [src, items] of Object.entries(allResults)) {
    for (const item of items) {
      const key = item.name.toLowerCase().replace(/\s+/g, ' ').trim();
      if (!seen.has(key) && key.length > 3) {
        seen.add(key);
        merged.push({ ...item, source: src });
      }
    }
  }

  console.log(`\n=== TONG HOP: ${merged.length} du an duy nhat ===`);
  merged.forEach((m, i) => console.log(`${i+1}. [${m.source}] ${m.name} | ${m.address}`));

  fs.writeFileSync('q8_projects_raw.json', JSON.stringify({ raw: allResults, merged }, null, 2), 'utf-8');
  console.log('\nDa luu vao q8_projects_raw.json');
}

main().catch(console.error);

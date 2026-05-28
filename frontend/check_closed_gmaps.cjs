const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const APARTMENTS_PATH = path.join(__dirname, '..', 'data', 'apartments.json');

async function checkClosed() {
  console.log('Reading apartments.json...');
  const apartments = JSON.parse(fs.readFileSync(APARTMENTS_PATH, 'utf-8'));
  console.log(`Loaded ${apartments.length} apartments.`);

  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  
  const CONCURRENCY = 6;
  const queue = [...apartments];
  const closedIds = [];
  let processed = 0;
  
  const workers = Array.from({ length: CONCURRENCY }, async (_, workerId) => {
    const page = await browser.newPage();
    // Block heavy media
    await page.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (type === 'image' || type === 'media' || type === 'font') {
        route.abort();
      } else {
        route.continue();
      }
    });

    while (queue.length > 0) {
      const apt = queue.shift();
      if (!apt) break;

      const name = apt.name;
      const gmaps_url = apt.location ? apt.location.google_maps : null;

      processed++;
      const currentIdx = processed;

      if (!gmaps_url || !gmaps_url.includes('google.com/maps')) {
        console.log(`[Worker ${workerId}][${currentIdx}/${apartments.length}] Skipping '${name}' (no valid gmaps link)`);
        continue;
      }

      console.log(`[Worker ${workerId}][${currentIdx}/${apartments.length}] Checking status for '${name}'...`);

      try {
        await page.goto(gmaps_url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        
        // Wait 3 seconds for dynamic content
        await page.waitForTimeout(3000);

        // Extract body text and check for closed keywords
        const pageText = await page.evaluate(() => {
          return document.body ? document.body.innerText : '';
        });

        const isClosed = 
          pageText.includes('Đã đóng cửa vĩnh viễn') || 
          pageText.includes('Permanently closed') ||
          pageText.includes('Đóng cửa tạm thời') ||
          pageText.includes('Temporarily closed');

        if (isClosed) {
          closedIds.push(apt.id);
          console.log(`  -> CLOSED DETECTED: '${name}'`);
        } else {
          // console.log(`  -> Active`);
        }
      } catch (e) {
        console.error(`  -> ERROR checking '${name}': ${e.message}`);
      }
    }
    await page.close();
  });

  await Promise.all(workers);
  await browser.close();

  console.log(`\nDetected ${closedIds.length} closed apartments:`, closedIds);
  
  if (closedIds.length > 0) {
    const filteredApts = apartments.filter(apt => !closedIds.includes(apt.id));
    console.log(`Saving ${filteredApts.length} remaining apartments to apartments.json...`);
    fs.writeFileSync(APARTMENTS_PATH, JSON.stringify(filteredApts, null, 2), 'utf-8');
    console.log('Saved successfully.');
  } else {
    console.log('No closed apartments found to delete.');
  }
}

checkClosed().catch(console.error);

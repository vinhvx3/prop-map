const { chromium } = require('playwright');

async function run() {
  console.log('Launching browser...');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true
  });

  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });

  console.log('Navigating to http://localhost:5173...');
  try {
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 });
  } catch (e) {
    console.error('Failed to load page. Retrying...');
    await page.waitForTimeout(2000);
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 });
  }

  // Chá» 5 giÃ¢y Äá» toÃ n bá» apartments vÃ  markers ÄÆ°á»£c Leaflet load vÃ  hiá»n thá» hoÃ n toÃ n trÃªn báº£n Äá»
  console.log('Waiting for apartments markers to load...');
  await page.waitForTimeout(5000);

  // Chá»¥p áº£nh mÃ n hÃ¬nh toÃ n cáº£nh báº£n Äá»
  const screenshotPath = 'screenshot_all_apartments.png';
  await page.screenshot({ path: screenshotPath });
  console.log(`Captured screenshot of all apartments at: ${screenshotPath}`);

  await browser.close();
  console.log('Playwright screenshot test completed.');
}

run().catch(console.error);

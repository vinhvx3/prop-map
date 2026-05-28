const { chromium } = require('playwright');

async function run() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const query = "Topaz Elite Quận 8";
  const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
  
  console.log(`Navigating to ${searchUrl}...`);
  await page.goto(searchUrl, { waitUntil: 'load', timeout: 30000 });
  
  console.log('Waiting for URL redirect...');
  try {
    await page.waitForURL(url => url.toString().includes('/maps/place/'), { timeout: 15000 });
    const resolvedUrl = page.url();
    console.log(`Successfully resolved! URL: ${resolvedUrl}`);
  } catch (e) {
    console.log('URL did not redirect to /maps/place/ within timeout. Current URL:', page.url());
  }
  
  await browser.close();
}

run().catch(console.error);

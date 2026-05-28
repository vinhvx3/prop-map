const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const APARTMENTS_PATH = path.join(__dirname, '..', 'data', 'apartments.json');

async function resolveAll() {
  console.log('Reading apartments.json...');
  const apartments = JSON.parse(fs.readFileSync(APARTMENTS_PATH, 'utf-8'));
  console.log(`Loaded ${apartments.length} apartments.`);

  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  
  // Set up parallel workers
  const CONCURRENCY = 6;
  const queue = apartments.filter(a => !a.location || !a.location.lat || a.location.accuracy === "pending");
  console.log(`Resolving ${queue.length} apartments with missing coordinates...`);
  let processed = 0;
  let resolved = 0;
  
  const workers = Array.from({ length: CONCURRENCY }, async (_, workerId) => {
    const page = await browser.newPage();
    // Block images and stylesheets to speed up loading
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
      const district = (apt.district || 'Quáº­n 7').replace('Q.', 'Quáº­n ');
      const query = `${name} ${district}, Ho Chi Minh City`;
      const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;

      processed++;
      const currentIdx = processed;
      console.log(`[Worker ${workerId}][${currentIdx}/${apartments.length}] Resolving '${name}'...`);

      try {
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
        
        // Wait up to 5 seconds for page load / redirect
        let resolvedUrl = null;
        for (let i = 0; i < 10; i++) {
          const currentUrl = page.url();
          if (currentUrl.includes('/maps/place/')) {
            resolvedUrl = currentUrl;
            break;
          }
          await page.waitForTimeout(500);
        }

        // If not redirected, try to find a link inside search results
        if (!resolvedUrl) {
          const firstLink = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            const placeLink = links.find(a => a.href && a.href.includes('/maps/place/'));
            return placeLink ? placeLink.href : null;
          });
          if (firstLink) {
            resolvedUrl = firstLink;
          }
        }

        if (resolvedUrl) {
          // Remove query params like entry=ttu to keep it clean
          const cleanUrl = resolvedUrl.split('?')[0];
          apt.location = apt.location || {};
          apt.location.google_maps = cleanUrl;
          
          // Also try to extract place_id from url
          // e.g., 1s0x31752f08518e38f1:0xbe2509121a97d91e
          const placeIdMatch = resolvedUrl.match(/1s(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)/);
          if (placeIdMatch) {
            apt.location.place_id = placeIdMatch[1];
          }
          
          resolved++;
          console.log(`  -> SUCCESS: ${cleanUrl}`);
        } else {
          console.log(`  -> KEEP SEARCH LINK: ${apt.location.google_maps}`);
        }
      } catch (e) {
        console.error(`  -> ERROR resolving '${name}': ${e.message}`);
      }
    }
    await page.close();
  });

  await Promise.all(workers);
  await browser.close();

  console.log(`Saving apartments.json... Resolved ${resolved}/${apartments.length} links.`);
  fs.writeFileSync(APARTMENTS_PATH, JSON.stringify(apartments, null, 2), 'utf-8');
  console.log('Done!');
}

resolveAll().catch(console.error);


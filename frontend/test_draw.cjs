const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function run() {
  console.log('Launching browser...');
  const browser = await chromium.launch({
    channel: 'chrome', // Use local Google Chrome
    headless: false
  });

  const page = await browser.newPage();
  
  // Set viewport
  await page.setViewportSize({ width: 1280, height: 720 });

  // Listen to console logs
  page.on('console', msg => {
    console.log(`[BROWSER LOG] ${msg.type()}: ${msg.text()}`);
  });

  // Listen to page errors
  page.on('pageerror', err => {
    console.error('[BROWSER ERROR]', err);
  });

  console.log('Navigating to http://localhost:5173...');
  try {
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 });
  } catch (e) {
    console.error('Failed to load page. Retrying in 2 seconds...');
    await new Promise(r => setTimeout(r, 2000));
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 });
  }

  console.log('Waiting for map to load...');
  await page.waitForSelector('#main-map', { timeout: 10000 });
  
  // Capture initial screenshot
  await page.screenshot({ path: 'screenshot_1_init.png' });
  console.log('Captured initial screenshot.');

  // Check if Leaflet Draw rectangle button exists
  const rectButton = page.locator('.test-btn-rectangle');
  if (await rectButton.count() > 0) {
    console.log('Found rectangle draw button. Clicking it...');
    await rectButton.click();
    
    // Wait a bit
    await page.waitForTimeout(500);

    // Let's drag on the map to draw a rectangle
    console.log('Dragging on the map to draw...');
    const mapBoundingBox = await page.locator('#main-map').boundingBox();
    console.log('Map bounding box:', mapBoundingBox);

    if (mapBoundingBox) {
      const startX = mapBoundingBox.x + mapBoundingBox.width / 2 - 100;
      const startY = mapBoundingBox.y + mapBoundingBox.height / 2 - 100;
      const endX = mapBoundingBox.x + mapBoundingBox.width / 2 + 100;
      const endY = mapBoundingBox.y + mapBoundingBox.height / 2 + 100;

      // Perform drag action
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.screenshot({ path: 'screenshot_2_dragging.png' });
      await page.mouse.move(endX, endY, { steps: 10 });
      await page.screenshot({ path: 'screenshot_3_moved.png' });
      await page.mouse.up();

      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'screenshot_4_after_draw.png' });
      console.log('Finished draw drag sequence.');

      // Clear the shape by reloading the page to get a clean canvas
      console.log('Reloading page for polygon test...');
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForSelector('#main-map', { timeout: 10000 });

      // Draw a Polygon
      const polyButton = page.locator('.test-btn-polygon');
      if (await polyButton.count() > 0) {
        console.log('Found polygon draw button. Clicking it...');
        await polyButton.click();
        await page.waitForTimeout(500);

        console.log('Clicking points to draw a polygon...');
        const mapBox = await page.locator('#main-map').boundingBox();
        if (mapBox) {
          const centerX = mapBox.x + mapBox.width / 2;
          const centerY = mapBox.y + mapBox.height / 2;

          const p1 = { x: centerX - 50, y: centerY - 50 };
          const p2 = { x: centerX + 100, y: centerY - 50 };
          const p3 = { x: centerX + 50, y: centerY + 100 };
          const p4 = { x: centerX - 100, y: centerY + 50 };

          await page.mouse.click(p1.x, p1.y);
          await page.waitForTimeout(300);
          await page.mouse.click(p2.x, p2.y);
          await page.waitForTimeout(300);
          await page.mouse.click(p3.x, p3.y);
          await page.waitForTimeout(300);
          await page.mouse.click(p4.x, p4.y);
          await page.waitForTimeout(300);
          // Click first point again to close polygon
          await page.mouse.click(p1.x, p1.y);

          await page.waitForTimeout(1000);
          await page.screenshot({ path: 'screenshot_5_after_polygon.png' });
          console.log('Finished polygon draw sequence.');

          // Reload page for circle test
          console.log('Reloading page for circle test...');
          await page.reload({ waitUntil: 'networkidle' });
          await page.waitForSelector('#main-map', { timeout: 10000 });

          // Draw a Circle
          const circleButton = page.locator('.test-btn-circle');
          if (await circleButton.count() > 0) {
            console.log('Found circle draw button. Clicking it...');
            await circleButton.click();
            await page.waitForTimeout(500);

            console.log('Dragging on the map to draw a circle...');
            const mapBoxCircle = await page.locator('#main-map').boundingBox();
            if (mapBoxCircle) {
              const startXCircle = mapBoxCircle.x + mapBoxCircle.width / 2;
              const startYCircle = mapBoxCircle.y + mapBoxCircle.height / 2;
              const endXCircle = startXCircle + 120;
              const endYCircle = startYCircle + 120;

              await page.mouse.move(startXCircle, startYCircle);
              await page.mouse.down();
              await page.mouse.move(endXCircle, endYCircle, { steps: 10 });
              await page.mouse.up();

              await page.waitForTimeout(1000);
              await page.screenshot({ path: 'screenshot_6_after_circle.png' });
              console.log('Finished circle draw sequence.');
            }
          }
        }
      }
    }
  } else {
    console.error('Rectangle draw button NOT found!');
  }

  // Check if any error log was written
  if (fs.existsSync('../frontend_errors.log')) {
    console.log('--- CONTENT OF frontend_errors.log ---');
    console.log(fs.readFileSync('../frontend_errors.log', 'utf-8'));
    console.log('--------------------------------------');
  }

  await browser.close();
  console.log('Test completed.');
}

run().catch(console.error);

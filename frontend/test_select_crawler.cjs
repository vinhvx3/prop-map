const { chromium } = require('playwright');
const fs = require('fs');

async function run() {
  console.log('Launching browser...');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false
  });

  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });

  page.on('console', msg => {
    console.log(`[BROWSER LOG] ${msg.type()}: ${msg.text()}`);
  });

  page.on('pageerror', err => {
    console.error('[BROWSER ERROR]', err);
  });

  console.log('Navigating to http://localhost:5173...');
  try {
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 });
  } catch (e) {
    console.error('Failed to load page. Retrying...');
    await page.waitForTimeout(2000);
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 });
  }

  console.log('Waiting for session selector button...');
  const selectorBtn = page.locator('#session-selector');
  await selectorBtn.waitFor({ state: 'visible', timeout: 10000 });

  // Take screenshot before clicking selector
  await page.screenshot({ path: 'screenshot_select_1_before_click.png' });
  console.log('Captured screenshot before clicking selector.');

  console.log('Clicking the session selector button...');
  await selectorBtn.click();

  console.log('Waiting for the session modal to open...');
  const modalOverlay = page.locator('.modal-overlay');
  await modalOverlay.waitFor({ state: 'visible', timeout: 5000 });

  const modal = page.locator('#session-modal');
  await modal.waitFor({ state: 'visible', timeout: 5000 });

  // Take screenshot of the modal dialog
  await page.screenshot({ path: 'screenshot_select_2_modal_open.png' });
  console.log('Captured screenshot of modal dialog.');

  console.log('Locating crawler cards...');
  const cardLocator = page.locator('.session-card');
  const count = await cardLocator.count();
  console.log(`Found ${count} crawler card(s) in list.`);

  if (count > 0) {
    const firstCard = cardLocator.first();
    const firstCardText = await firstCard.locator('.session-card-name').textContent();
    console.log(`First crawler name in list: "${firstCardText}"`);

    console.log('Clicking the first crawler card to select it...');
    await firstCard.click();

    console.log('Waiting for the modal to close...');
    await modalOverlay.waitFor({ state: 'hidden', timeout: 5000 });

    console.log('Waiting for session selection to update in TopBar...');
    await page.waitForFunction(
      (expectedText) => {
        const text = document.querySelector('#session-selector span:nth-child(2)').textContent;
        return text && text !== 'Chọn Crawler...' && text.trim() === expectedText.trim();
      },
      firstCardText,
      { timeout: 5000 }
    );

    // Wait a brief moment for Leaflet layers to load/zoom
    await page.waitForTimeout(2000);

    // Take screenshot after selecting session
    await page.screenshot({ path: 'screenshot_select_3_selected.png' });
    console.log('Captured screenshot after successful crawler selection.');
  } else {
    console.log('No crawler sessions found in list. Creating a new one instead...');
    
    // Switch to create view
    const createBtn = page.locator('#btn-create-session');
    await createBtn.click();

    console.log('Typing name for new crawler...');
    const nameInput = page.locator('#session-name-input');
    await nameInput.type('Crawler Test Playwright');

    // Confirm create
    const confirmBtn = page.locator('#btn-confirm-create');
    await confirmBtn.click();

    console.log('Waiting for the modal to close after creation...');
    await modalOverlay.waitFor({ state: 'hidden', timeout: 5000 });

    // Wait a brief moment
    await page.waitForTimeout(2000);

    // Take screenshot
    await page.screenshot({ path: 'screenshot_select_3_created.png' });
    console.log('Captured screenshot after successful crawler creation.');
  }

  await browser.close();
  console.log('Playwright selection test completed successfully.');
}

run().catch(console.error);

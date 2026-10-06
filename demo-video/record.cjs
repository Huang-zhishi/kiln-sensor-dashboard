// Playwright 录屏：打开 demo.html，按总时长录制，产出 raw.webm
// 环境变量：PW_MODULE / DEMO_HTML / RAW_OUT / TOTAL_SEC
const fs = require('fs');
const path = require('path');

(async () => {
  const { chromium } = require(process.env.PW_MODULE);
  const total = parseFloat(process.env.TOTAL_SEC);
  const demoHtml = process.env.DEMO_HTML;
  const rawOut = process.env.RAW_OUT;
  const dir = path.dirname(rawOut);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const browser = await chromium.launch({
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--force-color-profile=srgb',
      '--font-render-hinting=none',
      '--hide-scrollbars',
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    recordVideo: { dir, size: { width: 1920, height: 1080 } },
  });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.error('PAGE ERROR:', m.text()); });
  page.on('pageerror', (e) => console.error('PAGE EXCEPTION:', e.message));

  await page.goto('file://' + demoHtml, { waitUntil: 'load' });
  await page.waitForTimeout(Math.round(total * 1000 + 1500));

  const video = page.video();
  await page.close();
  await context.close();
  const src = await video.path();
  await browser.close();

  if (fs.existsSync(rawOut)) fs.unlinkSync(rawOut);
  fs.renameSync(src, rawOut);
  console.log('recorded ->', rawOut);
})().catch((e) => { console.error(e); process.exit(1); });

import { chromium } from 'playwright';

const baseUrl = process.env.JZONE_BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const pageErrors = [];

page.on('pageerror', (error) => pageErrors.push(error.message));

try {
  await page.addInitScript(() => {
    try {
      Object.defineProperty(globalThis.crypto, 'randomUUID', {
        value: undefined,
        configurable: true,
      });
    } catch {
      Object.defineProperty(Crypto.prototype, 'randomUUID', {
        value: undefined,
        configurable: true,
      });
    }
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('#root').waitFor({ state: 'attached', timeout: 10_000 });
  await page.waitForFunction(() => (document.querySelector('#root')?.childElementCount ?? 0) > 0, null, {
    timeout: 10_000,
  });

  const compatibilityError = pageErrors.find((message) => /randomUUID/i.test(message));
  if (compatibilityError) throw new Error(`页面仍依赖 crypto.randomUUID：${compatibilityError}`);

  console.log(JSON.stringify({ mounted: true, pageErrors }, null, 2));
} finally {
  await browser.close();
}

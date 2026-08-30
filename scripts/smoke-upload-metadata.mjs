import { chromium } from 'playwright';

const baseUrl = process.env.JZONE_BASE_URL || 'http://localhost:3000';
const email = process.env.JZONE_TEST_EMAIL;
const password = process.env.JZONE_TEST_PASSWORD;
const realM4aPath = process.env.JZONE_TEST_M4A || 'E:/Tencent Files/0601不能说的秘密！.m4a';

if (!email || !password) throw new Error('Missing JZONE_TEST_EMAIL or JZONE_TEST_PASSWORD');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const writeUint32 = (buffer, offset, value) => {
  buffer[offset] = (value >>> 24) & 0xff;
  buffer[offset + 1] = (value >>> 16) & 0xff;
  buffer[offset + 2] = (value >>> 8) & 0xff;
  buffer[offset + 3] = value & 0xff;
};

const makeDatedM4aMetadata = () => {
  const bytes = new Uint8Array(64);
  writeUint32(bytes, 0, 24);
  bytes.set([0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20], 4);
  writeUint32(bytes, 24, 40);
  bytes.set([0x6d, 0x76, 0x68, 0x64], 28);
  bytes[32] = 0;
  const unixSeconds = Math.floor(Date.UTC(2024, 5, 1) / 1000);
  writeUint32(bytes, 36, unixSeconds + 2_082_844_800);
  writeUint32(bytes, 44, unixSeconds + 2_082_844_800);
  writeUint32(bytes, 52, 1000);
  writeUint32(bytes, 56, 1000);
  return Buffer.from(bytes);
};

const browser = await chromium.launch({ headless: process.env.JZONE_HEADFUL !== '1' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.addInitScript(() => localStorage.setItem('jzone.pwaInstallDismissedAt', String(Date.now())));

const login = async () => {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  if (await page.getByTestId('bottom-nav-home').isVisible().catch(() => false)) return;
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(password);
  await page.getByTestId('auth-submit').click();
  await page.getByTestId('bottom-nav-home').waitFor({ state: 'visible', timeout: 30000 });
};

try {
  await login();
  await page.getByTestId('bottom-nav-upload').click();
  const picker = page.locator('#audio-upload-page');
  if (!await picker.isVisible().catch(() => false)) {
    const reset = page.getByRole('button', { name: '弃置并重新选择' });
    if (await reset.isVisible().catch(() => false)) await reset.click();
  }
  await picker.waitFor({ state: 'attached', timeout: 10000 });

  await picker.setInputFiles(realM4aPath);
  await page.getByText('正在编辑').waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(3000);
  assert(await page.getByText('正在编辑').isVisible(), '真实 M4A 进入编辑后被意外打回文件选择页');
  const sizeText = await page.locator('p.font-mono').filter({ hasText: 'MB' }).first().textContent();
  assert(sizeText && sizeText !== '0.00 MB', `真实 M4A 文件大小异常：${sizeText}`);

  await page.getByRole('button', { name: '弃置并重新选择' }).click();
  await page.locator('#audio-upload-page').waitFor({ state: 'attached' });
  await page.locator('#audio-upload-page').setInputFiles({
    name: 'metadata-date-test.m4a',
    mimeType: 'audio/mp4',
    buffer: makeDatedM4aMetadata(),
  });
  await page.getByText('正在编辑').waitFor({ state: 'visible', timeout: 10000 });
  await page.getByRole('button', { name: '更多', exact: true }).click();
  const recordedAt = page.getByTestId('upload-recorded-at');
  await recordedAt.waitFor({ state: 'visible', timeout: 5000 });
  assert(await recordedAt.inputValue() === '2024-06-01', `录制日期没有写入独立字段：${await recordedAt.inputValue()}`);

  console.log(JSON.stringify({ ok: true, realM4aSize: sizeText, recordedAt: '2024-06-01' }, null, 2));
} finally {
  await browser.close();
}

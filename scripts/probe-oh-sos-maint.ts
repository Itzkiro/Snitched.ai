import { chromium } from 'playwright';
import * as fs from 'fs';
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 900 },
  });
  const page = await ctx.newPage();
  await page.goto('https://data.ohiosos.gov/portal/campaign-finance', { waitUntil: 'networkidle', timeout: 45000 });
  const link = page.locator('a', { hasText: /candidate files/i }).first();
  await link.click();
  // Generous wait for CF challenge to clear
  await page.waitForTimeout(15000);
  console.log('Final title:', await page.title());
  console.log('Final URL  :', page.url());
  // Dump visible text body
  const text = await page.evaluate(() => (document.body?.innerText || '').slice(0, 2000));
  console.log('--- Body text (first 2KB) ---');
  console.log(text);
  await page.screenshot({ path: '/tmp/oh-sos-maint.png', fullPage: true });
  fs.writeFileSync('/tmp/oh-sos-maint.html', await page.content());
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

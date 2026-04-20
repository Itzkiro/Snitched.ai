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

  // Try the Simple Search "Search" button
  const popupP = ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null);
  await page.locator('button:has-text("Search"), .search-btn').first().click();
  const popup = await popupP;
  const work = popup || page;
  await work.waitForTimeout(20000);
  console.log('Title:', await work.title());
  console.log('URL  :', work.url());
  const text = await work.evaluate(() => (document.body?.innerText || '').slice(0, 1500));
  console.log('--- BODY ---'); console.log(text);
  await work.screenshot({ path: '/tmp/oh-sos-search.png', fullPage: true });
  fs.writeFileSync('/tmp/oh-sos-search.html', await work.content());
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

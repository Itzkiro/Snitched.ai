import { chromium } from 'playwright';
import * as fs from 'fs';

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 900 },
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  const page = await ctx.newPage();
  await page.goto('https://data.ohiosos.gov/portal/campaign-finance', { waitUntil: 'networkidle', timeout: 45000 });

  // Click Candidate Files
  const link = page.locator('a', { hasText: /candidate files/i }).first();
  const popupP = ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null);
  await link.click();
  const popup = await popupP;
  const work = popup || page;
  await work.waitForLoadState('domcontentloaded', { timeout: 45000 });
  await work.waitForTimeout(5000);
  console.log('URL:', work.url());
  console.log('Title:', await work.title());

  // Dump ALL form elements
  const formEls = await work.evaluate(() => {
    const out: unknown[] = [];
    for (const el of Array.from(document.querySelectorAll('input, select, textarea, button, a[href*="p="]'))) {
      const e = el as HTMLInputElement;
      out.push({
        tag: el.tagName,
        id: el.id,
        name: e.name,
        type: e.type,
        placeholder: e.placeholder || '',
        text: (el.textContent || '').trim().slice(0, 80),
        href: (el as HTMLAnchorElement).href,
      });
    }
    return out;
  });
  console.log('\n--- Form elements on Candidate Files page ---');
  for (const el of formEls as Array<{ tag: string; id: string; name: string; type: string; placeholder: string; text: string; href: string }>) {
    if (el.tag === 'BUTTON' || el.tag === 'INPUT' || el.tag === 'SELECT' || (el.tag === 'A' && el.href && /search|candidate|committee|contrib/i.test(el.href + el.text))) {
      console.log(' ', el);
    }
  }

  // Save full page content
  fs.writeFileSync('/tmp/candidate-files.html', await work.content());
  await work.screenshot({ path: '/tmp/candidate-files.png', fullPage: true });
  console.log('\nSaved /tmp/candidate-files.{html,png}');
  await work.waitForTimeout(2000);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

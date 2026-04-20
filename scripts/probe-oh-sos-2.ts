import { chromium } from 'playwright';
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' });
  const page = await ctx.newPage();
  for (const url of [
    'https://www.ohiosos.gov/campaign-finance/',
    'https://www6.ohiosos.gov/ords/f?p=CFDISCLOSURE:1',
    'https://www6.ohiosos.gov/ords/f?p=CFDISCLOSURE:73:::NO::P73_CANDIDATE_NAME:Vivek',
  ]) {
    try {
      const r = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      console.log(url, '->', r?.status(), '|', await page.title());
      const links = await page.evaluate(() => Array.from(document.querySelectorAll('a')).map(a => `${(a.textContent || '').trim().slice(0, 80)} -> ${(a as HTMLAnchorElement).href}`).filter(l => /candidate|search|cfdisclosure|committee|finance|disclosure/i.test(l)).slice(0, 15));
      for (const l of links) console.log('  ·', l);
    } catch (e) {
      console.log(url, 'ERR', (e as Error).message);
    }
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

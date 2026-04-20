import { chromium } from 'playwright';
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' });
  const page = await ctx.newPage();

  // Capture all network requests so we can see the JSON/XHR endpoints behind the SPA
  const apiCalls: { url: string; method: string; status: number; ctype: string }[] = [];
  page.on('response', async resp => {
    const url = resp.url();
    if (/data\.ohiosos\.gov|portal/i.test(url) && !/\.(png|jpg|svg|css|woff|ico|js)(\?|$)/i.test(url)) {
      apiCalls.push({ url, method: resp.request().method(), status: resp.status(), ctype: resp.headers()['content-type'] || '' });
    }
  });

  const r = await page.goto('https://data.ohiosos.gov/portal/campaign-finance', { waitUntil: 'networkidle', timeout: 45000 });
  console.log('Landing ->', r?.status(), '|', await page.title());

  // Look for a search box and try to type "Vivek Ramaswamy"
  const inputs = await page.evaluate(() => Array.from(document.querySelectorAll('input,select,textarea')).map(el => ({
    tag: el.tagName, type: (el as HTMLInputElement).type, name: (el as HTMLInputElement).name, id: el.id, placeholder: (el as HTMLInputElement).placeholder, label: (el.closest('label')?.textContent || '').trim().slice(0, 80)
  })));
  console.log('Inputs:'); for (const i of inputs.slice(0, 20)) console.log(' ', JSON.stringify(i));

  // Capture obvious search-form action/buttons
  const buttons = await page.evaluate(() => Array.from(document.querySelectorAll('button,a[role="button"]')).map(b => ({ text: (b.textContent || '').trim().slice(0, 60), id: b.id, cls: b.className })).slice(0, 20));
  console.log('Buttons:'); for (const b of buttons) console.log(' ', JSON.stringify(b));

  // Page metadata: links with "candidate" and routes
  const navLinks = await page.evaluate(() => Array.from(document.querySelectorAll('a')).map(a => ({ t: (a.textContent || '').trim().slice(0, 60), h: (a as HTMLAnchorElement).href })).filter(l => /candidate|search|advanced/i.test(l.t)).slice(0, 15));
  console.log('Nav links:'); for (const l of navLinks) console.log(' ', JSON.stringify(l));

  console.log('\n--- Network calls (JSON/HTML) ---');
  for (const c of apiCalls) console.log(' ', c.method, c.status, c.ctype.split(';')[0], c.url);

  // Save artifacts
  await page.screenshot({ path: '/tmp/oh-sos-portal.png', fullPage: true });
  require('fs').writeFileSync('/tmp/oh-sos-portal.html', await page.content());
  console.log('Saved /tmp/oh-sos-portal.{png,html}');

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

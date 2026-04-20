#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Headless probe of OH SOS CFDISCLOSURE portal — confirms whether the 403
 * "maintenance" we see from `fetch` is actually a Cloudflare bot challenge
 * that a real browser can pass.
 *
 * Usage: npx tsx scripts/probe-oh-sos.ts "Vivek Ramaswamy"
 */

import { chromium } from 'playwright';

const candidate = process.argv[2] || 'Vivek Ramaswamy';
const COMMITTEE_URL = `https://www6.ohiosos.gov/ords/f?p=CFDISCLOSURE:73:::NO:73:P73_CANDIDATE_NAME:${encodeURIComponent(candidate)}`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
  });
  const page = await ctx.newPage();
  console.log(`Loading: ${COMMITTEE_URL}`);
  const resp = await page.goto(COMMITTEE_URL, { waitUntil: 'networkidle', timeout: 60_000 });
  console.log(`Status: ${resp?.status()}`);
  // Wait a bit for any CF challenge or APEX render
  await page.waitForTimeout(3000);

  const title = await page.title();
  console.log(`Title: ${title}`);

  const tableCount = await page.locator('table').count();
  console.log(`Tables on page: ${tableCount}`);

  // Look for the report table and dump rows
  const rows = await page.evaluate(() => {
    const out: string[][] = [];
    const tables = Array.from(document.querySelectorAll('table'));
    for (const t of tables) {
      for (const tr of Array.from(t.querySelectorAll('tr'))) {
        const cells = Array.from(tr.querySelectorAll('th,td')).map(c => (c.textContent || '').trim());
        if (cells.some(Boolean)) out.push(cells);
      }
    }
    return out;
  });
  console.log(`Total table rows: ${rows.length}`);
  for (const r of rows.slice(0, 25)) console.log('  |', r.join(' | '));

  // Save artifacts for inspection
  await page.screenshot({ path: '/tmp/oh-sos-probe.png', fullPage: true });
  const html = await page.content();
  require('fs').writeFileSync('/tmp/oh-sos-probe.html', html);
  console.log('Saved /tmp/oh-sos-probe.png and /tmp/oh-sos-probe.html');

  await browser.close();
})().catch(err => { console.error(err); process.exit(1); });

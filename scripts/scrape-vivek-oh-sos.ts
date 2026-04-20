#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * One-off Playwright pull of Vivek Ramaswamy's OH SOS campaign-finance data.
 *
 * Background:
 *   The HTTP scraper in sync-oh-state-finance.ts hits the legacy
 *   https://www6.ohiosos.gov/ords/f?p=CFDISCLOSURE:73 deep-link, which now
 *   returns Cloudflare 403 because the new portal at
 *   https://data.ohiosos.gov/portal/campaign-finance issues an APEX session
 *   token before the candidate-files page is reachable.
 *
 * This script walks the new flow with a real browser:
 *   1. Open the data portal landing page (Cloudflare passes for a real UA).
 *   2. Click "Candidate Files" — APEX assigns a session id and lands on the
 *      CFDISCLOSURE candidate search.
 *   3. Type the candidate name, submit, parse the result table.
 *
 * Output: prints summary + JSON to stdout. Does NOT write to DB.
 */

import { chromium, type Page } from 'playwright';
import * as fs from 'fs';

const CANDIDATE = process.argv[2] || 'Vivek Ramaswamy';
const PORTAL_URL = 'https://data.ohiosos.gov/portal/campaign-finance';
const HEADLESS = !process.argv.includes('--headed');

interface ScrapedRow { columns: string[]; }

async function dumpTables(page: Page): Promise<ScrapedRow[]> {
  return page.evaluate(() => {
    const out: { columns: string[] }[] = [];
    const tables = Array.from(document.querySelectorAll('table'));
    for (const t of tables) {
      for (const tr of Array.from(t.querySelectorAll('tr'))) {
        const cells = Array.from(tr.querySelectorAll('th,td')).map(c => (c.textContent || '').replace(/\s+/g, ' ').trim());
        if (cells.some(Boolean)) out.push({ columns: cells });
      }
    }
    return out;
  });
}

(async () => {
  // Anti-detection launch args — hide webdriver flag and automation fingerprints
  // that Cloudflare uses to flag headless browsers.
  const browser = await chromium.launch({
    headless: HEADLESS,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--no-sandbox',
    ],
  });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 900 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    extraHTTPHeaders: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Ch-Ua': '"Chromium";v="130", "Not_A Brand";v="99"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"macOS"',
    },
  });
  // Strip the `navigator.webdriver` flag that CF checks for headless detection.
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    // Fake a realistic Chrome object
    // @ts-ignore
    window.chrome = window.chrome || { runtime: {} };
    // Fake plugins length (headless returns 0)
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  });
  const page = await ctx.newPage();

  console.log(`[1/4] Opening data portal: ${PORTAL_URL}`);
  await page.goto(PORTAL_URL, { waitUntil: 'networkidle', timeout: 45000 });
  console.log(`      Title: ${await page.title()}`);

  // The "Candidate Files" link opens with the right type filter already set.
  // Click it (vs deep-linking) so the APEX session token is fresh.
  console.log(`[2/4] Clicking Candidate Files link...`);
  const link = page.locator('a', { hasText: /candidate files/i }).first();
  // Some APEX links open same-tab; some open in popup. Handle both.
  const popupPromise = ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null);
  await link.click();
  const popup = await popupPromise;
  const work = popup || page;
  await work.waitForLoadState('domcontentloaded', { timeout: 45000 });
  // Wait out Cloudflare's "Just a moment..." JS challenge — title changes to the
  // real APEX page title once the challenge solves (or the form appears).
  console.log(`      Initial title: ${await work.title()} | URL: ${work.url()}`);
  await work.waitForFunction(
    () => !/just a moment/i.test(document.title) && document.querySelector('input[type="text"], input[type="search"]') !== null,
    { timeout: 60000, polling: 1000 },
  ).catch(() => { /* fall through to log + diagnostic */ });
  await work.waitForTimeout(1500);
  console.log(`      After CF wait: ${await work.title()} | URL: ${work.url()}`);

  // Find a candidate-name input. APEX names items P73_*; placeholder/label may say "Last Name" or "Candidate Name".
  console.log(`[3/4] Filling search form for "${CANDIDATE}"...`);
  const inputs = await work.$$eval('input', els => els.map(el => ({
    name: (el as HTMLInputElement).name,
    id: el.id,
    type: (el as HTMLInputElement).type,
    placeholder: (el as HTMLInputElement).placeholder || '',
    label: (el.closest('.t-Form-fieldContainer')?.querySelector('label')?.textContent || '').trim(),
  })));
  console.log('      Available inputs:');
  for (const i of inputs.filter(x => /text|search/i.test(x.type) || x.id.startsWith('P73_'))) {
    console.log('        ', JSON.stringify(i));
  }

  // Strategy: try last name first. Vivek's last name is "Ramaswamy" — very unique.
  const [last, ...firstParts] = CANDIDATE.split(' ').reverse();
  const first = firstParts.reverse().join(' ');
  // Try common APEX item ids: P73_LAST_NAME, P73_NAME, P73_CANDIDATE_NAME
  const lastNameSel = await work.evaluate(() => {
    const candidates = ['#P73_LAST_NAME', '#P73_CAND_LAST_NAME', '#P73_LASTNAME', '#P73_NAME', '#P73_CANDIDATE_NAME'];
    for (const sel of candidates) if (document.querySelector(sel)) return sel;
    // Fallback: first text input under the search region
    const first = document.querySelector<HTMLInputElement>('input[type="text"]');
    return first ? `#${first.id}` : null;
  });
  if (!lastNameSel) throw new Error('No usable text input found on candidate search page');
  console.log(`      Using selector: ${lastNameSel} ← "${last}"`);
  await work.fill(lastNameSel, last);

  // Submit — try button first, then Enter.
  const searchBtn = await work.$('button:has-text("Search"), input[value="Search"], a:has-text("Search")');
  if (searchBtn) {
    await Promise.all([
      work.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {}),
      searchBtn.click(),
    ]);
  } else {
    await work.press(lastNameSel, 'Enter');
    await work.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  }
  await work.waitForTimeout(2000);

  console.log(`[4/4] Parsing results...`);
  const rows = await dumpTables(work);
  console.log(`      Total table rows: ${rows.length}`);

  // Filter rows that mention "Ramaswamy" (case-insensitive) — drops chrome rows.
  const matches = rows.filter(r => r.columns.some(c => /ramaswamy/i.test(c) || new RegExp(first, 'i').test(c)));
  console.log(`      Matching "${CANDIDATE}" rows: ${matches.length}`);
  for (const m of matches.slice(0, 10)) console.log('        |', m.columns.join(' | '));

  // Save artifacts
  const screenshot = '/tmp/vivek-oh-sos.png';
  const html = '/tmp/vivek-oh-sos.html';
  const json = '/tmp/vivek-oh-sos.json';
  await work.screenshot({ path: screenshot, fullPage: true });
  fs.writeFileSync(html, await work.content());
  fs.writeFileSync(json, JSON.stringify({ candidate: CANDIDATE, totalRows: rows.length, matches }, null, 2));
  console.log(`      Saved ${screenshot}, ${html}, ${json}`);

  await browser.close();
})().catch(err => { console.error('FATAL:', err); process.exit(1); });

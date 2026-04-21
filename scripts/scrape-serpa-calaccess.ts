#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * HEADFUL Playwright scrape of David Serpa's CA Treasurer campaign finance
 * from cal-access.sos.ca.gov. Launches a visible browser window so the user
 * can solve any Incapsula challenge. Once the candidate list loads the
 * script extracts Serpa's detail page and totals.
 *
 * Workflow:
 *   1. Launch headful Chrome
 *   2. Navigate to TREASURER section of candidate list
 *   3. Wait up to 180s for the page to load (human solves challenge)
 *   4. Find "SERPA" in the Treasurer candidates
 *   5. Navigate to his detail page
 *   6. Extract total contributions + committee name + filings list
 *   7. Write to data-ingestion/serpa-calaccess.json + patch DB
 *
 * Usage: npx tsx scripts/scrape-serpa-calaccess.ts
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

const BIOGUIDE = 'ca-treasurer-2026-david-serpa';
const OUT = path.join(__dirname, '..', 'data-ingestion', 'serpa-calaccess.json');

async function main(): Promise<void> {
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--window-size=1400,900'],
  });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1400, height: 900 },
  });
  const page = await ctx.newPage();

  console.log('Opening cal-access candidate list — if you see an Incapsula challenge, solve it now.');
  console.log('Script will wait up to 3 minutes for the page to load...');
  await page.goto('https://cal-access.sos.ca.gov/Campaign/Candidates/', { timeout: 30000, waitUntil: 'domcontentloaded' });

  // Poll for the real content (candidate detail links)
  let html = '';
  const started = Date.now();
  while (Date.now() - started < 180_000) {
    html = await page.content();
    if (html.length > 10000 && /Detail\.aspx\?id=/.test(html)) break;
    await page.waitForTimeout(5000);
    console.log(`  waiting... (len=${html.length})`);
  }
  if (!/Detail\.aspx\?id=/.test(html)) {
    console.error('\nCandidate list never loaded — aborting. Try running again once the browser is past the Incapsula challenge.');
    await browser.close();
    process.exit(1);
  }
  console.log(`✓ Candidate list loaded (html len ${html.length})`);

  // Extract candidate links via DOM (robust to weird HTML formatting)
  const all: Array<{ href: string; name: string }> = await page.$$eval(
    'a[href*="Detail.aspx?id="]',
    (as) => as.map(a => ({ href: (a as HTMLAnchorElement).href, name: (a.textContent || '').trim() })),
  );
  const serpa = all.filter(a => /SERPA/i.test(a.name));
  console.log(`Total candidate links: ${all.length}  |  Serpa matches: ${serpa.length}`);
  for (const s of serpa) console.log(`  ${s.name}  →  ${s.href}`);
  if (serpa.length === 0) {
    // Sometimes the candidate list has an anchor where the name is inside children (not direct textContent)
    // Dump all TREASURER-section names for debugging
    const tSection = html.indexOf('TREASURER');
    if (tSection > -1) {
      const chunk = html.slice(tSection, tSection + 3000).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      console.log('\nTREASURER section content:', chunk.slice(0, 1500));
    }
  }

  if (serpa.length === 0) {
    console.error('No SERPA in candidate list — may not be a filed candidate yet.');
    await browser.close();
    process.exit(0);
  }

  // Try the first Serpa match (there should only be one for CA Treasurer)
  const target = serpa[0];
  const detailUrl = target.href.startsWith('http') ? target.href : `https://cal-access.sos.ca.gov${target.href.startsWith('/') ? '' : '/Campaign/Candidates/'}${target.href}`;
  console.log(`\nNavigating to detail page: ${detailUrl}`);
  await page.goto(detailUrl, { timeout: 30000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const detail = await page.content();

  // Extract totals — cal-access detail pages have a table with "Contributions:"
  const totalMatch = detail.match(/Total Contributions[\s\S]{0,200}?\$\s*([\d,]+\.?\d*)/i)
    || detail.match(/Contributions:[\s\S]{0,200}?\$\s*([\d,]+\.?\d*)/i);
  const total = totalMatch ? parseFloat(totalMatch[1].replace(/,/g, '')) : 0;
  console.log(`Total contributions: $${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);

  // Extract committee name(s)
  const committeeRe = /Committee(?:s)?\s*:?\s*<[^>]*>([^<]+)</gi;
  const committees: string[] = [];
  while ((m = committeeRe.exec(detail)) !== null) {
    const nm = m[1].trim();
    if (nm.length > 3 && !committees.includes(nm)) committees.push(nm);
  }

  // Look for filings table with amounts
  const filingRe = /<td[^>]*>\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*<\/td>[\s\S]*?<td[^>]*>\s*\$\s*([\d,]+\.\d{2})\s*<\/td>/gi;
  const filings: Array<{ date: string; amount: number }> = [];
  while ((m = filingRe.exec(detail)) !== null) {
    filings.push({ date: m[1], amount: parseFloat(m[2].replace(/,/g, '')) });
  }

  const payload = {
    bioguide: BIOGUIDE,
    source: 'cal-access.sos.ca.gov',
    detail_url: detailUrl,
    candidate_name: target.name,
    total_contributions: total,
    committees,
    filings_sample: filings.slice(0, 20),
    scraped_at: new Date().toISOString(),
  };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log(`\nWrote ${OUT}`);

  // Patch DB
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (url && key) {
    const s = createClient(url, key);
    await s.from('politicians').update({
      total_funds: total,
      data_source: 'cal-access.sos.ca.gov',
    }).eq('bioguide_id', BIOGUIDE);
    console.log(`✓ DB patched: total_funds = $${total.toLocaleString()}`);
  }
  await page.waitForTimeout(5000);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });

#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * HEADLESS Playwright with playwright-extra + stealth plugin — pulls Vivek's
 * 2026 OH SOS itemized individual contributions.
 *
 * Why stealth plugin: raw headless Playwright gets blocked by Cloudflare on
 * `www6.ohiosos.gov/ords/f?p=CFDISCLOSURE:73`. The stealth plugin (ported
 * from puppeteer-extra-plugin-stealth) applies ~15 evasions:
 *   chrome.runtime, navigator.webdriver, navigator.languages, navigator.plugins,
 *   navigator.permissions, navigator.vendor, window.outerdimensions,
 *   WebGL vendor/renderer, iframe contentWindow, media codecs, etc.
 *
 * Output: data-ingestion/vivek-oh-sos-itemized.json (FEC-Schedule-A-shaped)
 *
 * Usage:
 *   npx tsx scripts/scrape-vivek-oh-sos-stealth.ts
 *   npx tsx scripts/scrape-vivek-oh-sos-stealth.ts --headed     # fallback
 *   npx tsx scripts/scrape-vivek-oh-sos-stealth.ts --use-cache  # skip download
 */

import { chromium } from 'playwright-extra';
import type { Download } from 'playwright';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';
import * as path from 'path';
import { Transform } from 'stream';
import * as readline from 'readline';

chromium.use(StealthPlugin());

const PORTAL_URL = 'https://data.ohiosos.gov/portal/campaign-finance';
const DOWNLOAD_DIR = '/tmp/oh-sos-bulk';
const OUT_PATH = path.join(__dirname, '..', 'data-ingestion', 'vivek-oh-sos-itemized.json');

const HEADLESS = !process.argv.includes('--headed');
const USE_CACHE = process.argv.includes('--use-cache');

const FILES = [
  { label: 'Active Candidate List', id: '120', file: 'active-candidates.csv' },
  { label: 'Contributions 2025', id: '6130', file: 'contribs-2025.csv' },
];
const VIVEK_RE = /VIVEK|RAMASW/i;

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

function normalizeLineEndings(): Transform {
  return new Transform({
    transform(chunk, _enc, cb) { cb(null, chunk.toString().replace(/\r/g, '\n')); },
  });
}
function parseCsvLine(line: string): string[] {
  const out: string[] = []; let cur = ''; let inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ',' && !inQuote) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur); return out.map(s => s.trim());
}
const parseMoney = (s: string) => {
  const n = Number(String(s).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

// ---------------------------------------------------------------------------
// Download with stealth
// ---------------------------------------------------------------------------

async function downloadFiles(): Promise<boolean> {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  console.log(`[1/3] Launching ${HEADLESS ? 'HEADLESS' : 'HEADED'} with stealth plugin...`);

  const browser = await chromium.launch({
    headless: HEADLESS,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
  });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 900 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    acceptDownloads: true,
  });
  const page = await ctx.newPage();

  let downloadsSucceeded = 0;
  try {
    console.log(`      Opening portal: ${PORTAL_URL}`);
    await page.goto(PORTAL_URL, { waitUntil: 'networkidle', timeout: 60000 });
    console.log(`      Portal title: ${await page.title()}`);

    console.log('[2/3] Navigating to Candidate Files (APEX session)...');
    const popupP = ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null);
    await page.locator('a', { hasText: /candidate files/i }).first().click();
    const popup = await popupP;
    const work = popup || page;

    await work.waitForLoadState('domcontentloaded', { timeout: 45000 });

    // Wait through Cloudflare JS challenge — stealth plugin should let us pass.
    console.log(`      Initial: ${await work.title()}`);
    let lastTitle = await work.title();
    for (let i = 0; i < 60; i++) {
      await work.waitForTimeout(1500);
      const t = await work.title();
      const hasFileInputs = await work.locator(`a[href*="P72_GETID:120"]`).count() > 0;
      if (t !== lastTitle) { console.log(`      @${i * 1.5}s title: ${t}`); lastTitle = t; }
      if (hasFileInputs) { console.log(`      ✓ Candidate Files page rendered at ${(i + 1) * 1.5}s`); break; }
    }

    for (const f of FILES) {
      const outPath = path.join(DOWNLOAD_DIR, f.file);
      const sel = `a[href*="P72_GETID:${f.id}"]`;
      const exists = await work.locator(sel).count();
      if (!exists) { console.warn(`      ⚠ ${f.label}: no link matches ${sel}`); continue; }
      console.log(`      Downloading ${f.label} (P72_GETID:${f.id})...`);
      const downloadP = work.waitForEvent('download', { timeout: 120_000 });
      await work.click(sel);
      try {
        const dl: Download = await downloadP;
        await dl.saveAs(outPath);
        const size = fs.statSync(outPath).size;
        console.log(`      ✓ ${outPath} (${(size / 1024).toFixed(0)} KB)`);
        downloadsSucceeded++;
        await work.waitForTimeout(2000);
      } catch (e) {
        console.warn(`      ⚠ ${f.label} download failed: ${(e as Error).message}`);
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`      ${downloadsSucceeded}/${FILES.length} files downloaded`);
  return downloadsSucceeded > 0;
}

// ---------------------------------------------------------------------------
// Parse itemized individuals
// ---------------------------------------------------------------------------

interface ItemizedRow {
  entity_type: 'IND';
  contributor_first_name: string;
  contributor_last_name: string;
  contributor_state: string;
  contributor_city: string;
  contributor_zip: string;
  contributor_employer: string;
  contribution_receipt_amount: number;
  contribution_receipt_date: string;
  committee_name: string;
}

async function discoverCommittees(): Promise<Set<string>> {
  const committees = new Set<string>();
  const activeCsv = path.join(DOWNLOAD_DIR, 'active-candidates.csv');
  if (!fs.existsSync(activeCsv)) return committees;
  const rl = readline.createInterface({ input: fs.createReadStream(activeCsv).pipe(normalizeLineEndings()) });
  let headers: string[] | null = null;
  for await (const raw of rl) {
    const line = raw.trim(); if (!line) continue;
    const cells = parseCsvLine(line);
    if (!headers) { headers = cells.map(s => s.toUpperCase().replace(/"/g, '')); continue; }
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cells[i] || ''; });
    const full = `${row['CANDIDATE_FIRST_NAME']} ${row['CANDIDATE_LAST_NAME']}`.trim();
    if (VIVEK_RE.test(full)) {
      const cm = (row['COM_NAME'] || '').trim();
      if (cm) { committees.add(cm.toUpperCase()); console.log(`  ${full} → committee: ${cm}`); }
    }
  }
  return committees;
}

async function parseItemized(committees: Set<string>): Promise<ItemizedRow[]> {
  const out: ItemizedRow[] = [];
  const contribCsv = path.join(DOWNLOAD_DIR, 'contribs-2025.csv');
  if (!fs.existsSync(contribCsv)) { console.warn('  contribs-2025.csv not found'); return out; }
  const rl = readline.createInterface({ input: fs.createReadStream(contribCsv).pipe(normalizeLineEndings()) });
  let headers: string[] | null = null;
  const h: Record<string, number> = {};
  let scanned = 0;
  for await (const raw of rl) {
    scanned++;
    const line = raw.trim(); if (!line) continue;
    const cells = parseCsvLine(line);
    if (!headers) {
      headers = cells.map(s => s.toUpperCase().replace(/"/g, ''));
      for (const k of ['COM_NAME', 'CANDIDATE_LAST_NAME', 'FIRST_NAME', 'LAST_NAME', 'NON_INDIVIDUAL', 'CITY', 'STATE', 'ZIP', 'AMOUNT', 'FILE_DATE', 'EMP_OCCUPATION', 'PAC_REG_NO']) {
        h[k] = headers.indexOf(k);
      }
      continue;
    }
    const cm = (cells[h.COM_NAME] || '').toUpperCase();
    const candLast = (cells[h.CANDIDATE_LAST_NAME] || '').toUpperCase();
    if (!VIVEK_RE.test(cm) && !VIVEK_RE.test(candLast) && !committees.has(cm)) continue;
    const nonIndiv = (cells[h.NON_INDIVIDUAL] || '').trim();
    const pacReg = (cells[h.PAC_REG_NO] || '').trim();
    if (nonIndiv || pacReg) continue;
    const first = (cells[h.FIRST_NAME] || '').trim();
    const last = (cells[h.LAST_NAME] || '').trim();
    if (!first || !last) continue;
    const amt = parseMoney(cells[h.AMOUNT] || '0');
    if (amt <= 0) continue;
    out.push({
      entity_type: 'IND',
      contributor_first_name: first,
      contributor_last_name: last,
      contributor_state: (cells[h.STATE] || '').trim(),
      contributor_city: (cells[h.CITY] || '').trim(),
      contributor_zip: (cells[h.ZIP] || '').trim(),
      contributor_employer: (cells[h.EMP_OCCUPATION] || '').trim(),
      contribution_receipt_amount: amt,
      contribution_receipt_date: (cells[h.FILE_DATE] || '').trim(),
      committee_name: cells[h.COM_NAME] || '',
    });
  }
  console.log(`  Scanned ${scanned.toLocaleString()} rows → ${out.length} individual contribs`);
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('='.repeat(80));
  console.log('  OH SOS scrape — playwright-extra stealth plugin');
  console.log('='.repeat(80));

  if (!USE_CACHE) {
    const ok = await downloadFiles();
    if (!ok) {
      console.warn('\nDownload failed. Using cached /tmp/oh-sos-bulk/ if present.');
    }
  } else {
    console.log('Skipping download (--use-cache)');
  }

  console.log('\n[3/3] Parsing committees + itemized contribs...');
  const committees = await discoverCommittees();
  console.log(`  ${committees.size} Vivek committees`);
  if (committees.size === 0) { console.error('No committees found'); process.exit(1); }
  const rows = await parseItemized(committees);

  fs.writeFileSync(OUT_PATH, JSON.stringify(rows, null, 2));
  const total = rows.reduce((s, r) => s + r.contribution_receipt_amount, 0);
  console.log(`\n✓ ${rows.length} rows → ${OUT_PATH}`);
  console.log(`  Total: $${total.toLocaleString()}`);
  console.log(`  Unique last names: ${new Set(rows.map(r => r.contributor_last_name.toUpperCase())).size}`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });

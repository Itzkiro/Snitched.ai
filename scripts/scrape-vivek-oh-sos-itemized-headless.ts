#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * HEADLESS Playwright pull of Vivek Ramaswamy's OH SOS itemized individual
 * contributions — emits per-row JSON suitable for cross-reference against
 * the pro-Israel master registry.
 *
 * Replaces the FEC 2024 presidential proxy with his real 2026 OH-gov donors.
 *
 * Strategy:
 *   1. Launch Chromium headless with aggressive stealth (webdriver-off,
 *      realistic UA, plugin+language spoofing, Sec-Ch-Ua headers).
 *   2. Navigate data.ohiosos.gov portal → Candidate Files (APEX session token
 *      attached on click).
 *   3. Download Active Candidate List (120) + Contributions 2025 (6130).
 *   4. Stream-parse contributions CSV, filter to rows where COM_NAME or
 *      CANDIDATE_LAST_NAME match /VIVEK|RAMASW/i.
 *   5. Write individuals to data-ingestion/vivek-oh-sos-itemized.json in the
 *      same shape as FEC Schedule A rows so flag-vivek-* script can consume.
 *
 * Fallback: --headed flag if Cloudflare continues to reject headless.
 *
 * Usage:
 *   npx tsx scripts/scrape-vivek-oh-sos-itemized-headless.ts
 *   npx tsx scripts/scrape-vivek-oh-sos-itemized-headless.ts --headed
 */

import { chromium, type Download } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { Transform } from 'stream';
import * as readline from 'readline';

const PORTAL_URL = 'https://data.ohiosos.gov/portal/campaign-finance';
const DOWNLOAD_DIR = '/tmp/oh-sos-bulk';
const OUT_PATH = path.join(__dirname, '..', 'data-ingestion', 'vivek-oh-sos-itemized.json');

const HEADLESS = !process.argv.includes('--headed');

const FILES = [
  { label: 'Active Candidate List', id: '120', file: 'active-candidates.csv' },
  { label: 'Candidate Contributions 2025', id: '6130', file: 'contribs-2025.csv' },
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
  const out: string[] = [];
  let cur = ''; let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ',' && !inQuote) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}
const parseMoney = (s: string) => {
  const n = Number(String(s).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

// ---------------------------------------------------------------------------
// Headless download with stealth
// ---------------------------------------------------------------------------

async function downloadFiles(): Promise<void> {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  console.log(`[1/3] Launching ${HEADLESS ? 'headless' : 'headed'} Chrome${HEADLESS ? ' with stealth' : ''}...`);
  const browser = await chromium.launch({
    headless: HEADLESS,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
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
    extraHTTPHeaders: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Ch-Ua': '"Chromium";v="130", "Not_A Brand";v="99"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"macOS"',
    },
  });
  // Stealth: hide webdriver flag, fake plugins/languages, add chrome runtime
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    // @ts-ignore
    window.chrome = window.chrome || { runtime: {} };
    Object.defineProperty(navigator, 'plugins', {
      get: () => [{ name: 'Chrome PDF Plugin' }, { name: 'Chrome PDF Viewer' }, { name: 'Native Client' }, { name: 'WebKit built-in PDF' }, { name: 'Microsoft Edge PDF Viewer' }],
    });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    // Permissions query should not say "prompt" for notifications when screen-grabbed
    const origQuery = navigator.permissions?.query?.bind(navigator.permissions);
    if (origQuery) {
      // @ts-ignore
      navigator.permissions.query = (params: any) =>
        params?.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission === 'denied' ? 'denied' : 'granted' } as PermissionStatus)
          : origQuery(params);
    }
  });
  const page = await ctx.newPage();

  console.log(`      Opening portal: ${PORTAL_URL}`);
  await page.goto(PORTAL_URL, { waitUntil: 'networkidle', timeout: 60000 });
  let title = await page.title();
  console.log(`      Portal title: ${title}`);
  if (/just a moment|cloudflare|attention required|access denied/i.test(title)) {
    console.warn('      ⚠ Cloudflare challenge detected on landing page');
    // Wait for challenge to auto-solve
    await page.waitForFunction(() => !/just a moment|cloudflare/i.test(document.title), { timeout: 45000 }).catch(() => {});
    title = await page.title();
    console.log(`      After wait: ${title}`);
  }

  // Click Candidate Files — APEX assigns a session token on this click.
  console.log('[2/3] Navigating to Candidate Files...');
  const popupP = ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null);
  await page.locator('a', { hasText: /candidate files/i }).first().click();
  const popup = await popupP;
  const work = popup || page;
  await work.waitForLoadState('domcontentloaded', { timeout: 45000 });
  // Wait out Cloudflare JS challenge on candidate files page
  await work.waitForFunction(
    () => !/just a moment/i.test(document.title),
    { timeout: 60000, polling: 1000 },
  ).catch(() => {});
  await work.waitForTimeout(3000);
  console.log(`      Files page: ${await work.title()} | ${work.url()}`);

  for (const f of FILES) {
    const outPath = path.join(DOWNLOAD_DIR, f.file);
    console.log(`      Downloading ${f.label} (P72_GETID:${f.id})...`);
    const sel = `a[href*="P72_GETID:${f.id}"]`;
    const exists = await work.locator(sel).count();
    if (!exists) { console.warn(`      ⚠ no link matches ${sel} — skipping`); continue; }
    const downloadP = work.waitForEvent('download', { timeout: 120_000 });
    await work.click(sel);
    const dl: Download = await downloadP;
    await dl.saveAs(outPath);
    const size = fs.statSync(outPath).size;
    console.log(`      Saved ${outPath} (${(size / 1024).toFixed(0)} KB)`);
    await work.waitForTimeout(1500);
  }

  await browser.close();
}

// ---------------------------------------------------------------------------
// Parse & emit itemized individuals
// ---------------------------------------------------------------------------

interface VivekIndividualRow {
  // Shape mirrors FEC Schedule A so flag-vivek script can consume both
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

async function discoverVivekCommittees(): Promise<Set<string>> {
  const committees = new Set<string>();
  const activeCsv = path.join(DOWNLOAD_DIR, 'active-candidates.csv');
  if (!fs.existsSync(activeCsv)) {
    console.warn(`  ⚠ ${activeCsv} missing — cannot discover committees`);
    return committees;
  }
  const rl = readline.createInterface({ input: fs.createReadStream(activeCsv).pipe(normalizeLineEndings()) });
  let headers: string[] | null = null;
  for await (const raw of rl) {
    const line = raw.trim(); if (!line) continue;
    const cells = parseCsvLine(line);
    if (!headers) { headers = cells.map(s => s.toUpperCase().replace(/"/g, '')); continue; }
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cells[i] || ''; });
    const fullName = `${row['CANDIDATE_FIRST_NAME']} ${row['CANDIDATE_LAST_NAME']}`.trim();
    if (VIVEK_RE.test(fullName)) {
      const cm = (row['COM_NAME'] || '').trim();
      if (cm) { committees.add(cm.toUpperCase()); console.log(`  ${fullName} → committee: ${cm} (${row['OFFICE']}, district ${row['DISTRICT']})`); }
    }
  }
  return committees;
}

async function parseItemizedIndividuals(committees: Set<string>): Promise<VivekIndividualRow[]> {
  const out: VivekIndividualRow[] = [];
  const contribCsv = path.join(DOWNLOAD_DIR, 'contribs-2025.csv');
  if (!fs.existsSync(contribCsv)) {
    console.warn(`  ⚠ ${contribCsv} missing`);
    return out;
  }
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
      for (const k of ['COM_NAME', 'CANDIDATE_LAST_NAME', 'FIRST_NAME', 'MIDDLE_NAME', 'LAST_NAME', 'NON_INDIVIDUAL', 'ADDRESS', 'CITY', 'STATE', 'ZIP', 'AMOUNT', 'FILE_DATE', 'EMP_OCCUPATION', 'PAC_REG_NO']) {
        h[k] = headers.indexOf(k);
      }
      continue;
    }
    const cm = (cells[h.COM_NAME] || '').toUpperCase();
    const candLast = (cells[h.CANDIDATE_LAST_NAME] || '').toUpperCase();
    if (!VIVEK_RE.test(cm) && !VIVEK_RE.test(candLast) && !committees.has(cm)) continue;
    // Individual filter: NON_INDIVIDUAL blank AND no PAC_REG_NO
    const nonIndiv = (cells[h.NON_INDIVIDUAL] || '').trim();
    const pacReg = (cells[h.PAC_REG_NO] || '').trim();
    if (nonIndiv || pacReg) continue; // skip PAC/org rows
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
  console.log(`  Scanned ${scanned.toLocaleString()} rows → ${out.length} individual contributions to Vivek committees`);
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('='.repeat(80));
  console.log('  OH SOS Playwright pull — Vivek Ramaswamy itemized individuals');
  console.log('='.repeat(80));
  console.log('');

  try {
    await downloadFiles();
  } catch (e) {
    console.error('Download failed:', (e as Error).message);
    if (HEADLESS) console.error('Retry with --headed if Cloudflare blocked headless.');
    process.exit(1);
  }

  console.log('\n[3/3] Parsing committees + itemized contribs...');
  const committees = await discoverVivekCommittees();
  console.log(`  ${committees.size} Vivek committees found`);
  if (committees.size === 0) { console.error('No Vivek committees found — abort'); process.exit(1); }

  const rows = await parseItemizedIndividuals(committees);
  fs.writeFileSync(OUT_PATH, JSON.stringify(rows, null, 2));
  console.log(`\n✓ Wrote ${rows.length} itemized individual rows → ${OUT_PATH}`);
  const total = rows.reduce((s, r) => s + r.contribution_receipt_amount, 0);
  console.log(`  Total $: $${total.toLocaleString()}`);
  console.log(`  Unique last names: ${new Set(rows.map(r => r.contributor_last_name.toUpperCase())).size}`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });

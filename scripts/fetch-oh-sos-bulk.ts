#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Pull the latest OH SOS Candidate Files bulk CSVs and refresh Vivek
 * Ramaswamy's finance fields.
 *
 * Strategy:
 *   1. Headed Chromium (Cloudflare accepts real-Chrome fingerprint; headless
 *      is always challenged on this origin).
 *   2. Navigate data.ohiosos.gov portal → Candidate Files (session token
 *      attached automatically by APEX).
 *   3. Download: Active Candidate List (120), Cover Pages (123),
 *      Contributions 2025 (6130), Expenditures 2025 (6131).
 *   4. Stream-parse the 94MB contributions CSV with readline (don't load
 *      into memory); filter rows where receiving committee contains
 *      "RAMASWAMY" / "VIVEK".
 *   5. Aggregate top5_donors, contribution_breakdown, AIPAC/Israel lobby
 *      classification; write to DB.
 *
 * Usage:
 *   npx tsx scripts/fetch-oh-sos-bulk.ts --dry-run
 *   npx tsx scripts/fetch-oh-sos-bulk.ts --write
 */

import { chromium, type Download } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { Transform } from 'stream';
import * as readline from 'readline';

/** OH SOS CSVs use Mac `\r` line endings (not \n). Transform replaces \r with \n
 *  so readline's default splitter works. Safe even on \r\n files (extra \n ignored). */
function normalizeLineEndings(): Transform {
  return new Transform({
    transform(chunk, _enc, cb) { cb(null, chunk.toString().replace(/\r/g, '\n')); },
  });
}

const BIOGUIDE_ID = 'oh-gov-2026-vivek-ramaswamy';
const PORTAL_URL = 'https://data.ohiosos.gov/portal/campaign-finance';
const DOWNLOAD_DIR = '/tmp/oh-sos-bulk';

// Files we want — (label, P72_GETID, localFilename)
const FILES = [
  { label: 'Active Candidate List',  id: '120',  file: 'active-candidates.csv' },
  { label: 'Candidate Cover Pages',  id: '123',  file: 'cover-pages.csv' },
  { label: 'Candidate Contributions--2025', id: '6130', file: 'contribs-2025.csv' },
  { label: 'Candidate Expenditures--2025',  id: '6131', file: 'expenditures-2025.csv' },
];

// Regex for Vivek-related names in both "Committee" / "Candidate" fields,
// catching OH SOS typo variants seen in April export.
const VIVEK_RE = /VIVEK|RAMASW/i;

const ISRAEL_LOBBY_NAMES = [
  'AIPAC', 'AMERICAN ISRAEL', 'DEMOCRATIC MAJORITY FOR ISRAEL', 'DMFI',
  'UNITED DEMOCRACY PROJECT', 'PRO-ISRAEL', 'NORPAC', 'JACPAC',
  'REPUBLICAN JEWISH', 'CHRISTIANS UNITED FOR ISRAEL', 'ZIONIST',
];
const isIsraelLobby = (name: string) => {
  const n = name.toUpperCase();
  return ISRAEL_LOBBY_NAMES.some(nd => n.includes(nd));
};
const isAipac = (n: string) => /AIPAC|AMERICAN ISRAEL/i.test(n);

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

async function downloadFiles(): Promise<void> {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  console.log('[1/3] Launching headed Chrome to bypass Cloudflare...');
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 900 },
    timezoneId: 'America/New_York',
    acceptDownloads: true,
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  const page = await ctx.newPage();
  await page.goto(PORTAL_URL, { waitUntil: 'networkidle', timeout: 45000 });
  console.log('      Portal loaded:', await page.title());

  // Click Candidate Files — APEX assigns a session token on this click.
  const popupP = ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null);
  await page.locator('a', { hasText: /candidate files/i }).first().click();
  const popup = await popupP;
  const work = popup || page;
  await work.waitForLoadState('domcontentloaded', { timeout: 45000 });
  await work.waitForTimeout(4000);
  console.log('      Candidate Files page:', await work.title());

  for (const f of FILES) {
    const outPath = path.join(DOWNLOAD_DIR, f.file);
    console.log(`\n[2/3] Downloading: ${f.label} (${f.file})`);
    const downloadP = work.waitForEvent('download', { timeout: 120_000 });
    // Find and click the Download anchor by P72_GETID param.
    const sel = `a[href*="P72_GETID:${f.id}"]`;
    await work.click(sel);
    const dl: Download = await downloadP;
    await dl.saveAs(outPath);
    const size = fs.statSync(outPath).size;
    console.log(`      Saved ${outPath} (${(size / 1024).toFixed(0)} KB)`);
    // Small pause so APEX doesn't rate-limit
    await work.waitForTimeout(1500);
  }

  await browser.close();
}

async function aggregateVivek(): Promise<{
  vivekCommittees: Set<string>;
  contribSignals: {
    total: number;
    count: number;
    byDonor: Map<string, { name: string; amount: number; type: string; is_israel_lobby: boolean }>;
    aipac: number;
    israelLobby: number;
    israelLobbyPacs: number;
    individuals: number;
    pacs: number;
    corporate: number;
  };
  coverTotals: Record<string, number>;
}> {
  const vivekCommittees = new Set<string>();
  const coverTotals: Record<string, number> = {};

  // ----- Active Candidate List: find committee names linked to Vivek -----
  // Columns: COM_NAME, MASTER_KEY, COM_ADDRESS, ..., CANDIDATE_FIRST_NAME, CANDIDATE_LAST_NAME, OFFICE, DISTRICT
  {
    const rl = readline.createInterface({ input: fs.createReadStream(path.join(DOWNLOAD_DIR, 'active-candidates.csv')).pipe(normalizeLineEndings()) });
    let headers: string[] | null = null;
    for await (const raw of rl) {
      const line = raw.trim();
      if (!line) continue;
      const cells = parseCsvLine(line);
      if (!headers) { headers = cells.map(s => s.toUpperCase().replace(/"/g, '')); continue; }
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = cells[i] || ''; });
      const fullName = `${row['CANDIDATE_FIRST_NAME']} ${row['CANDIDATE_LAST_NAME']}`.trim();
      if (VIVEK_RE.test(fullName)) {
        const cm = (row['COM_NAME'] || '').trim();
        if (cm) vivekCommittees.add(cm.toUpperCase());
        console.log(`  [CAND LIST] ${fullName} → ${cm} (${row['OFFICE']}, district ${row['DISTRICT']})`);
      }
    }
  }

  // ----- Cover Pages: pull aggregate totals for Vivek committees -----
  // Columns: COM_NAME, MASTER_KEY, CANDIDATE_FIRST_NAME, CANDIDATE_LAST_NAME, RPT_YEAR,
  //          TOTAL_CONTRIBUTIONS, TOTAL_FUNDS, ...
  {
    const rl = readline.createInterface({ input: fs.createReadStream(path.join(DOWNLOAD_DIR, 'cover-pages.csv')).pipe(normalizeLineEndings()) });
    let headers: string[] | null = null;
    for await (const raw of rl) {
      const line = raw.trim();
      if (!line) continue;
      const cells = parseCsvLine(line);
      if (!headers) { headers = cells.map(s => s.toUpperCase().replace(/"/g, '')); continue; }
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = cells[i] || ''; });
      const cm = (row['COM_NAME'] || '').toUpperCase();
      const candBlob = `${row['CANDIDATE_FIRST_NAME']} ${row['CANDIDATE_LAST_NAME']}`;
      if (!cm) continue;
      // Only include recent cycles (2024, 2025, 2026) to avoid historic committees
      const year = Number(row['RPT_YEAR'] || '0');
      if (year < 2024) continue;
      if (VIVEK_RE.test(cm) || VIVEK_RE.test(candBlob) || vivekCommittees.has(cm)) {
        vivekCommittees.add(cm);
        const total = parseMoney(row['TOTAL_CONTRIBUTIONS'] || '0');
        coverTotals[cm] = (coverTotals[cm] || 0) + total;
      }
    }
  }
  console.log(`\n  Vivek committees discovered: ${[...vivekCommittees].length}`);
  for (const c of vivekCommittees) console.log(`    - ${c}  (total=$${(coverTotals[c] || 0).toLocaleString()})`);

  // ----- Contributions 2025: stream-parse, aggregate Vivek committee rows -----
  console.log(`\n[3/3] Stream-parsing contribs-2025.csv...`);
  const contribSignals = {
    total: 0, count: 0,
    byDonor: new Map<string, { name: string; amount: number; type: string; is_israel_lobby: boolean }>(),
    aipac: 0, israelLobby: 0, israelLobbyPacs: 0,
    individuals: 0, pacs: 0, corporate: 0,
  };

  // Contribs cols: COM_NAME, MASTER_KEY, REPORT_DESCRIPTION, RPT_YEAR, REPORT_KEY,
  //   SHORT_DESCRIPTION, FIRST_NAME, MIDDLE_NAME, LAST_NAME, SUFFIX_NAME,
  //   NON_INDIVIDUAL, PAC_REG_NO, ADDRESS, CITY, STATE, ZIP, FILE_DATE, AMOUNT,
  //   EVENT_DATE, EMP_OCCUPATION, INKIND_DESCRIPTION, OTHER_INCOME_TYPE,
  //   RCV_EVENT, CANDIDATE_FIRST_NAME, CANDIDATE_LAST_NAME, OFFICE, DISTRICT, PARTY
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(DOWNLOAD_DIR, 'contribs-2025.csv')).pipe(normalizeLineEndings()) });
  let headers: string[] | null = null;
  let comNameIdx = -1;
  let candLastIdx = -1;
  let matchCount = 0;
  let totalRows = 0;
  for await (const raw of rl) {
    totalRows++;
    const line = raw.trim();
    if (!line) continue;
    const cells = parseCsvLine(line);
    if (!headers) {
      headers = cells.map(s => s.toUpperCase().replace(/"/g, ''));
      comNameIdx = headers.indexOf('COM_NAME');
      candLastIdx = headers.indexOf('CANDIDATE_LAST_NAME');
      continue;
    }
    const cm = (cells[comNameIdx] || '').toUpperCase();
    const candLast = (cells[candLastIdx] || '').toUpperCase();
    // Fast reject: match either by committee or by candidate last name
    if (!VIVEK_RE.test(cm) && !VIVEK_RE.test(candLast) && !vivekCommittees.has(cm)) continue;
    matchCount++;
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cells[i] || ''; });
    const amt = parseMoney(row['AMOUNT'] || '0');
    // Donor name: NON_INDIVIDUAL takes priority; else FIRST + LAST
    const nonIndiv = (row['NON_INDIVIDUAL'] || '').trim();
    const indiv = `${row['FIRST_NAME'] || ''} ${row['MIDDLE_NAME'] || ''} ${row['LAST_NAME'] || ''}`.replace(/\s+/g, ' ').trim();
    const donor = nonIndiv || indiv;
    if (!donor || amt <= 0) continue;

    // Type classification — NON_INDIVIDUAL + PAC_REG_NO signal PAC/Corp vs Individual
    const pacReg = (row['PAC_REG_NO'] || '').trim();
    const nameUpper = donor.toUpperCase();
    let type: 'Individual' | 'PAC' | 'Corporate' | 'Other' = 'Individual';
    if (nonIndiv) {
      if (/PAC\b|POLITICAL ACTION|COMMITTEE/i.test(nonIndiv) || pacReg) type = 'PAC';
      else if (/CORP|INC\b|LLC|CO\.|COMPANY|ASSOC|LTD/i.test(nameUpper)) type = 'Corporate';
      else type = 'Other';
    } else {
      type = 'Individual';
    }

    const isIsr = isIsraelLobby(donor);
    const key = donor.toUpperCase();
    if (!contribSignals.byDonor.has(key)) {
      contribSignals.byDonor.set(key, { name: donor, amount: 0, type, is_israel_lobby: isIsr });
    }
    const agg = contribSignals.byDonor.get(key)!;
    agg.amount += amt;
    contribSignals.total += amt;
    contribSignals.count += 1;
    if (type === 'PAC') contribSignals.pacs += amt;
    else if (type === 'Individual') contribSignals.individuals += amt;
    else if (type === 'Corporate') contribSignals.corporate += amt;
    if (isIsr) {
      contribSignals.israelLobby += amt;
      if (type === 'PAC') contribSignals.israelLobbyPacs += amt;
      if (isAipac(donor)) contribSignals.aipac += amt;
    }
  }
  console.log(`      Scanned ${totalRows.toLocaleString()} rows, matched ${matchCount} Vivek contribs`);
  console.log(`      Total itemized to Vivek committees: $${contribSignals.total.toLocaleString()}`);
  console.log(`      Unique donors: ${contribSignals.byDonor.size}`);

  return { vivekCommittees, contribSignals, coverTotals };
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run') || !argv.includes('--write');
  const skipDownload = argv.includes('--skip-download') && fs.existsSync(path.join(DOWNLOAD_DIR, 'contribs-2025.csv'));

  console.log('='.repeat(70));
  console.log(`  OH SOS BULK PULL: Vivek Ramaswamy (${BIOGUIDE_ID})`);
  console.log('='.repeat(70));
  console.log(dryRun ? '  [DRY RUN]\n' : '  [LIVE]\n');

  if (!skipDownload) {
    await downloadFiles();
  } else {
    console.log('[1-2/3] Skipping download (--skip-download, files already present)');
  }

  const { vivekCommittees, contribSignals, coverTotals } = await aggregateVivek();

  // Build top5 donors
  const top5 = [...contribSignals.byDonor.values()]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map(d => ({ name: d.name, amount: Math.round(d.amount * 100) / 100, type: d.type, is_israel_lobby: d.is_israel_lobby }));

  console.log('\nTop 5 donors:');
  for (const d of top5) console.log(`  - ${d.name} | ${d.type} | $${d.amount.toLocaleString()}${d.is_israel_lobby ? ' [ISRAEL LOBBY]' : ''}`);

  const coverAggregate = Object.values(coverTotals).reduce((s, n) => s + n, 0);
  console.log(`\nCover-page aggregate (all Vivek committees): $${coverAggregate.toLocaleString()}`);
  console.log(`Breakdown from contribs 2025:`);
  console.log(`  Individuals: $${contribSignals.individuals.toLocaleString()}`);
  console.log(`  PACs:        $${contribSignals.pacs.toLocaleString()}`);
  console.log(`  Corporate:   $${contribSignals.corporate.toLocaleString()}`);
  console.log(`  AIPAC:       $${contribSignals.aipac.toLocaleString()}`);
  console.log(`  Israel Lobby total: $${contribSignals.israelLobby.toLocaleString()}`);

  if (dryRun) {
    console.log('\n[DRY RUN] Skipping DB write. Re-run with --write to persist.');
    return;
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('ERROR: SUPABASE env missing'); process.exit(1);
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const newBreakdown = {
    aipac: contribSignals.aipac,
    otherPACs: Math.max(0, contribSignals.pacs - contribSignals.aipac),
    individuals: contribSignals.individuals,
    corporate: contribSignals.corporate,
  };

  const updates: Record<string, unknown> = {
    top5_donors: top5,
    contribution_breakdown: newBreakdown,
    aipac_funding: contribSignals.aipac,
    israel_lobby_total: contribSignals.israelLobby,
    israel_lobby_breakdown: { total: contribSignals.israelLobby, pacs: contribSignals.israelLobbyPacs, ie: 0, bundlers: 0 },
    data_source: 'oh_sos_bulk_2025',
    updated_at: new Date().toISOString(),
  };
  // Use OH SOS cover-page total as authoritative total_funds.
  if (coverAggregate > 0) updates.total_funds = coverAggregate;

  const { error } = await sb.from('politicians').update(updates).eq('bioguide_id', BIOGUIDE_ID);
  if (error) { console.error('DB write failed:', error.message); process.exit(1); }
  console.log('\n✓ DB updated with fresh OH SOS data.');
}

main().catch(e => { console.error(e); process.exit(1); });

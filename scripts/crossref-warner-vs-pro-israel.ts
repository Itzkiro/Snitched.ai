#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Cross-reference Senator Mark Warner's (D-VA) individual itemized donors
 * against the full 49-year pro-Israel PAC donor registry (1978-2026).
 *
 * Warner FEC candidate ID: S6VA00093
 * Principal committee:     C00438713 (FRIENDS OF MARK WARNER)
 *
 * Cycles analyzed: 2020, 2022, 2024, 2026.
 * Itemized individuals only (is_individual=true, min_amount=$500).
 *
 * Dedupe key = LASTNAME|FIRST_INITIAL|STATE (employer dropped for higher match).
 *
 * Usage:  npx tsx scripts/crossref-warner-vs-pro-israel.ts
 *
 * Output: data/crossref-warner-vs-pro-israel.csv
 */

import * as fs from 'fs';
import * as path from 'path';

const FEC = 'https://api.open.fec.gov/v1';
const KEY = process.env.FEC_API_KEY || '';
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const OUT_CSV = path.join(DATA_DIR, 'crossref-warner-vs-pro-israel.csv');

const WARNER_CANDIDATE_ID = 'S6VA00093';
const WARNER_COMMITTEE_ID = 'C00438713';
const CYCLES = [2008, 2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024, 2026];
const MIN_AMOUNT = 200;
const PER_PAGE = 100;
const PACE_MS = 4000; // 4s between pages (well under 1K/hr FEC limit)

interface LifetimeDonor {
  name: string;
  state: string;
  employer: string;
  lifetime_total: number;
  pacs: Set<string>;
  years: Set<string>;
  contribution_count: number;
}

interface WarnerDonor {
  name: string;
  state: string;
  employer: string;
  occupation: string;
  to_warner: number;
  count: number;
  cycles: Set<number>;
}

interface FecScheduleARow {
  contributor_name?: string;
  contributor_first_name?: string;
  contributor_last_name?: string;
  contributor_city?: string;
  contributor_state?: string;
  contributor_employer?: string;
  contributor_occupation?: string;
  contribution_receipt_amount?: number;
  contribution_receipt_date?: string;
  is_individual?: boolean;
  entity_type?: string;
}

interface FecResponse {
  results?: FecScheduleARow[];
  pagination?: {
    pages: number;
    page: number;
    count: number;
    last_indexes?: Record<string, string | number>;
  };
}

/** Normalize donor to key = LASTNAME|FIRST_INITIAL|STATE (no employer). */
function donorKey(name: string, state: string): string {
  const clean = name.toUpperCase().replace(/[^\w,. ]/g, '').trim();
  const m = clean.match(/^([A-Z-]+)\s*,?\s*([A-Z])/);
  const last = m?.[1] ?? clean.split(/[ ,]/)[0] ?? '';
  const firstInitial = m?.[2] ?? clean.replace(/.*[ ,]\s*/, '')[0] ?? '';
  return `${last}|${firstInitial}|${state}`;
}

/** Registry CSVs are keyed by LAST|F|STATE|EMPLOYER — strip employer to get lifetime key. */
function stripEmployerFromKey(key: string): string {
  const parts = key.split('|');
  if (parts.length >= 3) return `${parts[0]}|${parts[1]}|${parts[2]}`;
  return key;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function escapeCsv(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function fec(endpoint: string, params: Record<string, string | number | boolean>): Promise<FecResponse> {
  const u = new URL(FEC + endpoint);
  u.searchParams.set('api_key', KEY);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  for (let attempt = 1; attempt <= 5; attempt++) {
    const r = await fetch(u.toString());
    if (r.ok) return await r.json() as FecResponse;
    if (r.status === 429 || r.status >= 500) {
      const waitMs = Math.min(60_000, 2_000 * Math.pow(2, attempt - 1));
      console.warn(`\n    [rate-limit/server-err ${r.status}] attempt ${attempt}/5, sleeping ${waitMs / 1000}s...`);
      await sleep(waitMs);
      continue;
    }
    console.warn(`\n    [fec HTTP ${r.status}] ${u.pathname}`);
    return { results: [], pagination: { pages: 0, page: 0, count: 0 } };
  }
  console.warn(`\n    [fec giving up after 5 retries] ${u.pathname}`);
  return { results: [], pagination: { pages: 0, page: 0, count: 0 } };
}

async function loadLifetimeRegistry(): Promise<Map<string, LifetimeDonor>> {
  const registry = new Map<string, LifetimeDonor>();
  const files = fs.readdirSync(DATA_DIR)
    .filter(f => /^pro-israel-donors-\d{4}\.csv$/.test(f))
    .sort();
  console.log(`[1/4] Aggregating ${files.length} pro-Israel donor CSVs (1978-2026)...`);

  for (const f of files) {
    const year = f.match(/\d{4}/)![0];
    const txt = fs.readFileSync(path.join(DATA_DIR, f), 'utf8');
    const lines = txt.split('\n').filter(Boolean);
    if (!lines.length) continue;
    const header = parseCsvLine(lines.shift()!);
    const idx = {
      key: header.indexOf('donor_key'),
      name: header.indexOf('donor_name'),
      state: header.indexOf('state'),
      employer: header.indexOf('employer'),
      total: header.indexOf('total_given'),
      count: header.indexOf('contribution_count'),
      pacs: header.indexOf('pacs_given_to'),
    };
    for (const line of lines) {
      const cells = parseCsvLine(line);
      const rawKey = cells[idx.key] || '';
      if (!rawKey) continue;
      const lifetimeKey = stripEmployerFromKey(rawKey);
      const amt = Number(cells[idx.total]) || 0;
      if (!registry.has(lifetimeKey)) {
        registry.set(lifetimeKey, {
          name: cells[idx.name],
          state: cells[idx.state],
          employer: cells[idx.employer],
          lifetime_total: 0,
          pacs: new Set<string>(),
          years: new Set<string>(),
          contribution_count: 0,
        });
      }
      const d = registry.get(lifetimeKey)!;
      d.lifetime_total += amt;
      d.contribution_count += Number(cells[idx.count]) || 0;
      d.years.add(year);
      for (const pac of (cells[idx.pacs] || '').split(';').map(s => s.trim()).filter(Boolean)) {
        d.pacs.add(pac);
      }
    }
  }
  console.log(`      loaded ${registry.size.toLocaleString()} unique lifetime pro-Israel donors (employer dropped from key)\n`);
  return registry;
}

async function fetchWarnerCycle(cycle: number, donors: Map<string, WarnerDonor>): Promise<number> {
  let totalRaised = 0;
  let page = 1;
  let lastIdx: Record<string, string | number> | undefined;
  console.log(`\n[cycle ${cycle}] fetching Schedule A individual itemized donors (>=\$${MIN_AMOUNT})...`);

  while (true) {
    const params: Record<string, string | number | boolean> = {
      committee_id: WARNER_COMMITTEE_ID,
      two_year_transaction_period: cycle,
      is_individual: true,
      min_amount: MIN_AMOUNT,
      per_page: PER_PAGE,
      sort: '-contribution_receipt_date',
    };
    if (lastIdx) {
      for (const [k, v] of Object.entries(lastIdx)) params[k] = v;
    }
    const data = await fec('/schedules/schedule_a/', params);
    const results = data.results || [];
    if (!results.length) break;

    for (const r of results) {
      const amt = r.contribution_receipt_amount || 0;
      if (amt < MIN_AMOUNT) continue;
      const name = (r.contributor_name || '').trim();
      if (!name) continue;
      const state = (r.contributor_state || '').toUpperCase().trim();
      const employer = (r.contributor_employer || '').trim();
      const occupation = (r.contributor_occupation || '').trim();
      const key = donorKey(name, state);
      if (!donors.has(key)) {
        donors.set(key, {
          name,
          state,
          employer,
          occupation,
          to_warner: 0,
          count: 0,
          cycles: new Set<number>(),
        });
      }
      const d = donors.get(key)!;
      d.to_warner += amt;
      d.count += 1;
      d.cycles.add(cycle);
      totalRaised += amt;
    }

    const pag = data.pagination;
    if (!pag || results.length < PER_PAGE) break;
    if (!pag.last_indexes) break;
    lastIdx = pag.last_indexes;
    process.stdout.write(`    page ${page} done — running total: \$${totalRaised.toLocaleString()} / ${donors.size.toLocaleString()} unique donors\r`);
    page++;
    if (page > 600) {
      console.warn(`\n    [!] cycle ${cycle}: stopped at ${page} pages (safety cap)`);
      break;
    }
    await sleep(PACE_MS);
  }
  console.log(`\n    cycle ${cycle} complete — \$${totalRaised.toLocaleString()} across ${page} pages`);
  return totalRaised;
}

interface Match {
  warner: WarnerDonor;
  registry: LifetimeDonor;
  key: string;
}

function renderMarkdownTable(matches: Match[], limit: number): string {
  const lines: string[] = [];
  lines.push('| # | Donor | State | $ to Warner | Lifetime Pro-Israel | Years Active | Cycles | PACs |');
  lines.push('|---|-------|-------|-------------|---------------------|--------------|--------|------|');
  matches.slice(0, limit).forEach((m, i) => {
    const years = [...m.registry.years].sort();
    const yearRange = years.length > 1 ? `${years[0]}–${years[years.length - 1]}` : (years[0] || '');
    const cycles = [...m.warner.cycles].sort().join(', ');
    const pacs = [...m.registry.pacs].slice(0, 3).join('; ').slice(0, 80);
    lines.push([
      String(i + 1),
      m.warner.name.slice(0, 40),
      m.warner.state || '?',
      `$${m.warner.to_warner.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
      `$${m.registry.lifetime_total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
      yearRange,
      cycles,
      pacs,
    ].map(s => s.replace(/\|/g, '\\|')).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  });
  return lines.join('\n');
}

function writeCsv(matches: Match[]): void {
  const header = ['rank', 'donor_name', 'state', 'employer', 'occupation',
    'to_warner', 'warner_contrib_count', 'warner_cycles',
    'pro_israel_lifetime', 'pro_israel_years', 'pro_israel_contrib_count', 'pacs'];
  const rows = [header.join(',')];
  matches.forEach((m, i) => {
    const years = [...m.registry.years].sort();
    const yearRange = years.length > 1 ? `${years[0]}-${years[years.length - 1]}` : (years[0] || '');
    const pacs = [...m.registry.pacs].join('; ');
    const cycles = [...m.warner.cycles].sort().join(';');
    rows.push([
      String(i + 1),
      escapeCsv(m.warner.name),
      escapeCsv(m.warner.state),
      escapeCsv(m.warner.employer),
      escapeCsv(m.warner.occupation),
      m.warner.to_warner.toFixed(2),
      String(m.warner.count),
      escapeCsv(cycles),
      m.registry.lifetime_total.toFixed(2),
      escapeCsv(yearRange),
      String(m.registry.contribution_count),
      escapeCsv(pacs),
    ].join(','));
  });
  fs.writeFileSync(OUT_CSV, rows.join('\n'));
}

async function main(): Promise<void> {
  if (!KEY) { console.error('FEC_API_KEY not set'); process.exit(1); }

  console.log('='.repeat(80));
  console.log('  WARNER (D-VA) vs PRO-ISRAEL REGISTRY — cross-reference');
  console.log('='.repeat(80));
  console.log(`  Candidate:  ${WARNER_CANDIDATE_ID} (Senator Mark Warner)`);
  console.log(`  Committee:  ${WARNER_COMMITTEE_ID} (FRIENDS OF MARK WARNER)`);
  console.log(`  Cycles:     ${CYCLES.join(', ')}`);
  console.log(`  Min amount: $${MIN_AMOUNT}+`);
  console.log(`  Pace:       ${PACE_MS}ms between pages (FEC 1K/hr limit)`);
  console.log(`  Output:     ${OUT_CSV}\n`);

  const registry = await loadLifetimeRegistry();

  console.log(`[2/4] Fetching Warner's individual itemized donors across ${CYCLES.length} cycles...`);
  const warnerDonors = new Map<string, WarnerDonor>();
  let grandTotal = 0;
  for (const cycle of CYCLES) {
    grandTotal += await fetchWarnerCycle(cycle, warnerDonors);
  }
  console.log(`\n      Warner raised $${grandTotal.toLocaleString()} from ${warnerDonors.size.toLocaleString()} unique individuals (>=\$${MIN_AMOUNT}, cycles ${CYCLES[0]}-${CYCLES[CYCLES.length - 1]})\n`);

  console.log('[3/4] Cross-referencing Warner donors against pro-Israel registry...');
  const matches: Match[] = [];
  for (const [key, d] of warnerDonors) {
    const hit = registry.get(key);
    if (hit) matches.push({ warner: d, registry: hit, key });
  }
  matches.sort((a, b) => b.warner.to_warner - a.warner.to_warner);
  console.log(`      ${matches.length.toLocaleString()} matched donors\n`);

  // Aggregate stats
  const totalToWarner = matches.reduce((s, m) => s + m.warner.to_warner, 0);
  const totalLifetime = matches.reduce((s, m) => s + m.registry.lifetime_total, 0);
  const matchRate = (matches.length / warnerDonors.size) * 100;

  // Standout mega-donors: lifetime pro-Israel > $10K AND gave Warner max-level
  // Warner individual federal max per cycle (2024) is $3,300; consider $3K+ as "max-ish"
  const megaDonors = matches.filter(m => m.registry.lifetime_total > 10_000 && m.warner.to_warner >= 3_000);

  console.log('[4/4] Writing CSV and rendering report...\n');
  writeCsv(matches);

  console.log('='.repeat(80));
  console.log('  SUMMARY');
  console.log('='.repeat(80));
  console.log(`  Warner total itemized individual donors (cycles ${CYCLES.join(',')}): ${warnerDonors.size.toLocaleString()}`);
  console.log(`  Matched in pro-Israel registry:                                  ${matches.length.toLocaleString()} (${matchRate.toFixed(2)}%)`);
  console.log(`  $ from matched donors to Warner:                                 $${totalToWarner.toLocaleString()}`);
  console.log(`  Sum lifetime pro-Israel giving of same donors:                   $${totalLifetime.toLocaleString()}`);
  console.log(`  Standout mega-donors (pro-Israel lifetime > $10K AND >= $3K to Warner): ${megaDonors.length}`);
  console.log();

  console.log('## TOP 40 MATCHED DONORS (markdown)\n');
  console.log(renderMarkdownTable(matches, 40));
  console.log();

  if (megaDonors.length) {
    console.log('\n## STANDOUT MEGA-DONORS (pro-Israel lifetime > $10K AND >= $3K to Warner)\n');
    console.log(renderMarkdownTable(megaDonors.sort((a, b) => b.registry.lifetime_total - a.registry.lifetime_total), Math.min(40, megaDonors.length)));
    console.log();
  }

  console.log(`  CSV written: ${OUT_CSV} (${matches.length} rows)`);
}

main().catch(e => { console.error(e); process.exit(1); });

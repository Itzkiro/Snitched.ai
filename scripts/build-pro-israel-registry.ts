#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Pull all itemized contributions to a curated list of pro-Israel PACs from
 * FEC Schedule A, aggregate by donor, and emit a CSV registry per calendar year.
 *
 * Usage:
 *   npx tsx scripts/build-pro-israel-registry.ts --year 2026
 *   npx tsx scripts/build-pro-israel-registry.ts --year 2025
 *   npx tsx scripts/build-pro-israel-registry.ts --year 2024
 *
 * Output: /Users/kirolosabdalla/Snitched.ai/data/pro-israel-donors-YYYY.csv
 *
 * Dedupe key: LAST, FIRST_INITIAL + STATE + EMPLOYER (normalized).
 * Threshold:  $200+ per contribution (FEC itemization standard).
 * Pace:       300ms between pages (~3 req/sec, well under 1K/hr FEC limit).
 */

import * as fs from 'fs';
import * as path from 'path';

interface PacEntry { id: string; name: string; registered: number; status: string; }
interface DonorRow {
  key: string;                         // dedupe key
  name: string;                        // full name as reported
  state: string;
  city: string;
  employer: string;
  occupation: string;
  total_given: number;
  contribution_count: number;
  pacs_given_to: Set<string>;
  first_date: string;
  last_date: string;
}

const FEC = 'https://api.open.fec.gov/v1';
const KEY = process.env.FEC_API_KEY || '';
const PAC_LIST: PacEntry[] = JSON.parse(fs.readFileSync(path.join(__dirname, 'pro-israel-pacs.json'), 'utf8'));
const OUT_DIR = path.resolve(__dirname, '..', 'data');
const MIN_CONTRIB = 200;
// FEC rate limit: 1000 req/hr ≈ 1 per 3.6s. Stay conservatively under with 4s pace.
const PACE_MS = 4000;

function argYear(): number {
  const i = process.argv.indexOf('--year');
  if (i < 0) { console.error('--year YYYY required'); process.exit(1); }
  const y = Number(process.argv[i + 1]);
  if (!Number.isFinite(y)) { console.error('bad --year value'); process.exit(1); }
  return y;
}

/** Normalize donor into a dedupe key. */
function donorKey(name: string, state: string, employer: string): string {
  const clean = name.toUpperCase().replace(/[^\w,. ]/g, '').trim();
  const m = clean.match(/^([A-Z-]+)\s*,?\s*([A-Z])/); // LAST, F or LASTF
  const last = m?.[1] ?? clean.split(/[ ,]/)[0] ?? '';
  const firstInitial = m?.[2] ?? clean.replace(/.*[ ,]\s*/, '')[0] ?? '';
  const emp = employer.toUpperCase().replace(/[^\w ]/g, '').slice(0, 20).trim();
  return `${last}|${firstInitial}|${state}|${emp}`;
}

async function fec(path: string, params: Record<string, string | number | boolean> = {}): Promise<{ results?: unknown[]; pagination?: { pages: number; page: number; count: number; last_indexes?: Record<string, string | number> } }> {
  const u = new URL(FEC + path);
  u.searchParams.set('api_key', KEY);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  // Retry with exponential backoff on rate-limit (429) or transient errors.
  for (let attempt = 1; attempt <= 5; attempt++) {
    const r = await fetch(u.toString());
    if (r.ok) return await r.json();
    if (r.status === 429 || r.status >= 500) {
      const waitMs = Math.min(60_000, 2_000 * Math.pow(2, attempt - 1));
      console.warn(`\n    [rate-limit/server-err ${r.status}] attempt ${attempt}/5, sleeping ${waitMs/1000}s...`);
      await new Promise(res => setTimeout(res, waitMs));
      continue;
    }
    console.warn(`\n    [fec HTTP ${r.status}] ${u.pathname}`);
    return { results: [], pagination: { pages: 0, page: 0, count: 0 } };
  }
  console.warn(`\n    [fec giving up after 5 retries] ${u.pathname}`);
  return { results: [], pagination: { pages: 0, page: 0, count: 0 } };
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

interface ContribRow {
  contributor_name?: string;
  contributor_city?: string;
  contributor_state?: string;
  contributor_employer?: string;
  contributor_occupation?: string;
  contribution_receipt_amount?: number;
  contribution_receipt_date?: string;
}

async function fetchPacContribs(pac: PacEntry, year: number, registry: Map<string, DonorRow>): Promise<number> {
  const minDate = `${year}-01-01`;
  const maxDate = `${year}-12-31`;
  let page = 1;
  let total = 0;
  let lastIdx: Record<string, string | number> | undefined;

  while (true) {
    const params: Record<string, string | number | boolean> = {
      committee_id: pac.id,
      per_page: 100,
      // Sort by date descending — required for stable cursor pagination with
      // last_indexes. Amount-based sort breaks on ties.
      sort: '-contribution_receipt_date',
      min_date: minDate,
      max_date: maxDate,
      min_amount: MIN_CONTRIB,
    };
    // FEC's pagination.last_indexes returns keys like { last_contribution_receipt_date, last_index }
    // already prefixed — pass through as-is (earlier code double-prefixed which broke the cursor).
    if (lastIdx) {
      for (const [k, v] of Object.entries(lastIdx)) params[k] = v;
    }
    const data = await fec('/schedules/schedule_a/', params);
    const results = (data.results || []) as ContribRow[];
    if (!results.length) break;
    for (const r of results) {
      const amt = r.contribution_receipt_amount || 0;
      if (amt < MIN_CONTRIB) continue;
      const name = (r.contributor_name || '').trim();
      if (!name) continue;
      const state = (r.contributor_state || '').toUpperCase().trim();
      const city = (r.contributor_city || '').trim();
      const employer = (r.contributor_employer || '').trim();
      const occupation = (r.contributor_occupation || '').trim();
      const date = (r.contribution_receipt_date || '').slice(0, 10);
      const key = donorKey(name, state, employer);
      if (!registry.has(key)) {
        registry.set(key, {
          key, name, state, city, employer, occupation,
          total_given: 0, contribution_count: 0,
          pacs_given_to: new Set(),
          first_date: date, last_date: date,
        });
      }
      const d = registry.get(key)!;
      d.total_given += amt;
      d.contribution_count += 1;
      d.pacs_given_to.add(pac.name);
      if (date && (!d.first_date || date < d.first_date)) d.first_date = date;
      if (date && (!d.last_date || date > d.last_date))   d.last_date = date;
      total += amt;
    }
    const pag = data.pagination;
    if (!pag || results.length < 100) break;
    if (!pag.last_indexes) break;
    lastIdx = pag.last_indexes;
    page++;
    if (page > 600) { console.warn(`    [!] ${pac.name}: stopped at ${page} pages (safety cap)`); break; }
    await sleep(PACE_MS);
  }
  return total;
}

function escapeCsv(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function main() {
  const year = argYear();
  if (!KEY) { console.error('FEC_API_KEY not set'); process.exit(1); }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `pro-israel-donors-${year}.csv`);

  console.log('='.repeat(70));
  console.log(`  PRO-ISRAEL DONOR REGISTRY — calendar year ${year}`);
  console.log('='.repeat(70));
  console.log(`  PACs:      ${PAC_LIST.length}`);
  console.log(`  Threshold: \$${MIN_CONTRIB}+ per contribution`);
  console.log(`  Pace:      ${PACE_MS}ms between pages`);
  console.log(`  Output:    ${outPath}\n`);

  const registry = new Map<string, DonorRow>();
  const pacTotals: Array<{ name: string; total: number; unique_donors: number }> = [];

  for (let i = 0; i < PAC_LIST.length; i++) {
    const pac = PAC_LIST[i];
    const before = registry.size;
    process.stdout.write(`[${(i + 1).toString().padStart(2)}/${PAC_LIST.length}] ${pac.name.padEnd(52).slice(0, 52)} (${pac.id})... `);
    let total = 0;
    try {
      total = await fetchPacContribs(pac, year, registry);
    } catch (e) {
      console.log(`ERR ${(e as Error).message}`);
      continue;
    }
    const added = registry.size - before;
    pacTotals.push({ name: pac.name, total, unique_donors: added });
    console.log(`\$${total.toLocaleString().padStart(14)} | +${added} donors`);
  }

  // Write CSV
  const rows = [...registry.values()].sort((a, b) => b.total_given - a.total_given);
  const header = ['donor_key', 'donor_name', 'state', 'city', 'employer', 'occupation',
    'total_given', 'contribution_count', 'pacs_given_to', 'first_contrib_date', 'last_contrib_date'];
  const lines = [header.join(',')];
  for (const d of rows) {
    lines.push([
      escapeCsv(d.key),
      escapeCsv(d.name),
      escapeCsv(d.state),
      escapeCsv(d.city),
      escapeCsv(d.employer),
      escapeCsv(d.occupation),
      d.total_given.toFixed(2),
      String(d.contribution_count),
      escapeCsv([...d.pacs_given_to].join('; ')),
      d.first_date,
      d.last_date,
    ].join(','));
  }
  fs.writeFileSync(outPath, lines.join('\n'));

  console.log('\n' + '='.repeat(70));
  console.log(`  DONE — ${year}`);
  console.log('='.repeat(70));
  console.log(`  Unique donors:     ${registry.size.toLocaleString()}`);
  console.log(`  Total raised:      \$${pacTotals.reduce((s, p) => s + p.total, 0).toLocaleString()}`);
  console.log(`  CSV written:       ${outPath}`);
  console.log(`  CSV size:          ${(fs.statSync(outPath).size / 1024).toFixed(0)} KB`);
  console.log(`\n  Top 10 PACs by raised (${year}):`);
  for (const p of pacTotals.sort((a, b) => b.total - a.total).slice(0, 10)) {
    console.log(`    \$${p.total.toLocaleString().padStart(14)} | +${p.unique_donors.toString().padStart(5)} donors | ${p.name}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });

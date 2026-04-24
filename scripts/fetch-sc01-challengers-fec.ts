#!/usr/bin/env npx tsx
/**
 * Pull FEC Schedule A itemized contributions (individuals + non-individuals)
 * for 4 Republican SC-01 (US House) challengers.
 *
 * Output: data-ingestion/{key}-fec-{cycle}-itemized.json
 *   - plain array of raw FEC Schedule A row objects (matches the shape
 *     flag-bundlers-batch.ts consumes via loadContribs()).
 *
 * Skips cycles whose output files already exist and are non-empty.
 *
 * Rate limits: 400ms between pages, 30s sleep on 429.
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

const FEC = process.env.FEC_API_KEY || '';
if (!FEC) throw new Error('FEC_API_KEY missing');

interface CandidateSpec {
  key: string;
  name: string;
  candidateId: string;
  committeeId: string;
  cycles: number[];
}

const CANDIDATES: CandidateSpec[] = [
  { key: 'dykes',   name: 'Tyler Dykes',  candidateId: 'H6SC01318', committeeId: 'C00927608', cycles: [2026] },
  { key: 'sanford', name: 'Mark Sanford', candidateId: 'H4SC01073', committeeId: 'C00285254', cycles: [2022, 2024, 2026] },
  { key: 'pelbath', name: 'Alex Pelbath', candidateId: 'H6SC01268', committeeId: 'C00917062', cycles: [2026] },
  { key: 'smith',   name: 'Mark Smith',   candidateId: 'H6SC01250', committeeId: 'C00915991', cycles: [2026] },
];

const OUT_DIR = path.join(__dirname, '..', 'data-ingestion');

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

interface FecResponse<T> {
  results?: T[];
  pagination?: { last_indexes?: Record<string, unknown> | null };
}

async function fec<T>(
  endpoint: string,
  params: Record<string, string | number>,
): Promise<FecResponse<T>> {
  const url = new URL(`https://api.open.fec.gov/v1${endpoint}`);
  url.searchParams.set('api_key', FEC);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString());
  if (res.status === 429) {
    await sleep(30_000);
    return fec<T>(endpoint, params);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '?');
    throw new Error(`FEC ${endpoint} ${res.status}: ${body}`);
  }
  return (await res.json()) as FecResponse<T>;
}

async function pullAll(
  committeeId: string,
  cycle: number,
  isIndividual: boolean,
): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = [];
  let lastIdx: unknown;
  let lastAmt: unknown;
  for (let page = 0; page < 200; page++) {
    const params: Record<string, string | number> = {
      committee_id: committeeId,
      two_year_transaction_period: cycle,
      is_individual: isIndividual ? 'true' : 'false',
      per_page: 100,
      sort: '-contribution_receipt_amount',
    };
    if (lastIdx !== undefined) params.last_index = String(lastIdx);
    if (lastAmt !== undefined) params.last_contribution_receipt_amount = String(lastAmt);
    const resp = await fec<Record<string, unknown>>('/schedules/schedule_a/', params);
    const batch = resp.results || [];
    rows.push(...batch);
    const last = resp.pagination?.last_indexes;
    if (!last || batch.length < 100) break;
    lastIdx = last.last_index;
    lastAmt = last.last_contribution_receipt_amount;
    await sleep(400);
  }
  return rows;
}

interface CycleStats {
  key: string;
  name: string;
  cycle: number;
  indRows: number;
  pacRows: number;
  total: number;
  skipped: boolean;
  outPath: string;
}

function sumAmount(rows: Array<Record<string, unknown>>): number {
  let s = 0;
  for (const r of rows) {
    const a = r.contribution_receipt_amount;
    if (typeof a === 'number') s += a;
    else if (typeof a === 'string') {
      const n = Number(a);
      if (Number.isFinite(n)) s += n;
    }
  }
  return s;
}

function isNonEmpty(p: string): boolean {
  try {
    const st = fs.statSync(p);
    if (!st.isFile() || st.size < 10) return false;
    const content = fs.readFileSync(p, 'utf8').trim();
    if (!content || content === '[]') return false;
    const parsed = JSON.parse(content) as unknown;
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('='.repeat(80));
  console.log('  SC-01 CHALLENGERS: FEC Schedule A pull');
  console.log('='.repeat(80));

  const stats: CycleStats[] = [];
  const writtenFiles: string[] = [];

  for (const c of CANDIDATES) {
    console.log(`\n--- ${c.name} (${c.key}) — committee ${c.committeeId} ---`);
    for (const cy of c.cycles) {
      const outPath = path.join(OUT_DIR, `${c.key}-fec-${cy}-itemized.json`);

      if (isNonEmpty(outPath)) {
        const existing = JSON.parse(fs.readFileSync(outPath, 'utf8')) as Array<Record<string, unknown>>;
        const indRows = existing.filter(r => r.entity_type === 'IND').length;
        const pacRows = existing.length - indRows;
        const total = sumAmount(existing);
        console.log(`  [skip] ${cy}: cached (${existing.length} rows, $${total.toLocaleString()})`);
        stats.push({ key: c.key, name: c.name, cycle: cy, indRows, pacRows, total, skipped: true, outPath });
        continue;
      }

      console.log(`  ${cy}: pulling individuals...`);
      const inds = await pullAll(c.committeeId, cy, true);
      console.log(`    ${inds.length} individual rows`);
      await sleep(400);

      console.log(`  ${cy}: pulling non-individuals (PACs)...`);
      const pacs = await pullAll(c.committeeId, cy, false);
      console.log(`    ${pacs.length} non-individual rows`);

      const all = [...inds, ...pacs];
      fs.writeFileSync(outPath, JSON.stringify(all, null, 2));
      const total = sumAmount(all);
      console.log(`    wrote ${outPath} (${all.length} rows, $${total.toLocaleString()})`);
      writtenFiles.push(outPath);
      stats.push({ key: c.key, name: c.name, cycle: cy, indRows: inds.length, pacRows: pacs.length, total, skipped: false, outPath });

      await sleep(400);
    }
  }

  // Summary table
  console.log('\n' + '='.repeat(80));
  console.log('  SUMMARY');
  console.log('='.repeat(80));
  const header = ['candidate', 'cycle', 'ind rows', 'PAC rows', 'total receipts', 'status'];
  console.log(
    header[0].padEnd(16) + ' | ' +
    header[1].padEnd(5) + ' | ' +
    header[2].padStart(9) + ' | ' +
    header[3].padStart(9) + ' | ' +
    header[4].padStart(16) + ' | ' +
    header[5],
  );
  console.log('-'.repeat(80));
  for (const s of stats) {
    console.log(
      s.name.padEnd(16) + ' | ' +
      String(s.cycle).padEnd(5) + ' | ' +
      String(s.indRows).padStart(9) + ' | ' +
      String(s.pacRows).padStart(9) + ' | ' +
      `$${s.total.toLocaleString()}`.padStart(16) + ' | ' +
      (s.skipped ? 'cached' : 'pulled'),
    );
  }

  console.log('\nFiles:');
  for (const s of stats) console.log(`  ${s.outPath}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

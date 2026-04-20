#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Generic FEC Schedule A (individual itemized contributions ≥$200) fetcher.
 *
 * Usage:
 *   npx tsx scripts/fetch-fec-schedule-a.ts <committee_id> <out_json> [cycle]
 *
 * Example:
 *   npx tsx scripts/fetch-fec-schedule-a.ts C00509729 \
 *     data-ingestion/massie-fec-2026-itemized.json 2026
 */

import * as fs from 'fs';

const FEC_API_KEY = process.env.FEC_API_KEY || '';
if (!FEC_API_KEY) { console.error('FEC_API_KEY missing'); process.exit(1); }

const [committeeId, outPath, cycleArg] = process.argv.slice(2);
if (!committeeId || !outPath) {
  console.error('Usage: fetch-fec-schedule-a.ts <committee_id> <out_json> [cycle]');
  process.exit(1);
}
const cycle = cycleArg ? Number(cycleArg) : 2026;

interface Row {
  entity_type: string | null;
  contributor_name: string | null;
  contributor_first_name: string | null;
  contributor_last_name: string | null;
  contributor_city: string | null;
  contributor_state: string | null;
  contributor_zip: string | null;
  contributor_employer: string | null;
  contributor_occupation: string | null;
  contribution_receipt_amount: number | null;
  contribution_receipt_date: string | null;
}
interface Resp {
  pagination: { count: number; pages: number; last_indexes: Record<string, string | number> | null };
  results: Row[];
}

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }

async function main() {
  console.log(`FEC Schedule A pull: committee=${committeeId}, cycle=${cycle}, min_amount=$200`);
  const all: Row[] = [];
  let lastIndex: string | null = null;
  let lastDate: string | null = null;
  let page = 0;

  while (true) {
    const u = new URL('https://api.open.fec.gov/v1/schedules/schedule_a/');
    u.searchParams.set('api_key', FEC_API_KEY);
    u.searchParams.set('committee_id', committeeId);
    u.searchParams.set('two_year_transaction_period', String(cycle));
    u.searchParams.set('min_amount', '200');
    u.searchParams.set('per_page', '100');
    u.searchParams.set('sort', '-contribution_receipt_date');
    if (lastIndex) u.searchParams.set('last_index', lastIndex);
    if (lastDate) u.searchParams.set('last_contribution_receipt_date', lastDate);

    const res = await fetch(u.toString());
    if (res.status === 429) { console.warn('rate-limited, sleeping 60s'); await sleep(60_000); continue; }
    if (!res.ok) { console.error(`FEC error ${res.status}`); break; }
    const data = await res.json() as Resp;
    const rows = data.results || [];
    if (rows.length === 0) break;
    all.push(...rows);
    page++;
    const li = data.pagination?.last_indexes;
    if (!li || !li.last_index) break;
    lastIndex = String(li.last_index);
    lastDate = li.last_contribution_receipt_date ? String(li.last_contribution_receipt_date) : null;
    if (page % 10 === 0) console.log(`  ${all.length} / ~${data.pagination?.count}`);
    await sleep(150);
  }

  fs.writeFileSync(outPath, JSON.stringify(all, null, 2));
  console.log(`✓ ${all.length} rows → ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });

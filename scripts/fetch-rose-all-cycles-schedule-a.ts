#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Pull John Rose's federal House Schedule A individual contributions
 * across ALL four cycles he has served (2020, 2022, 2024, 2026).
 *
 * Committee: C00652743 (JOHN ROSE FOR TENNESSEE)
 *
 * Saves the aggregated-by-donor version to:
 *   data/rose-federal-individual-donors-aggregated.json
 *
 * (Raw per-row cycle dumps are kept in memory only to avoid a very large
 * on-disk file. The aggregated file is small and committable.)
 *
 * Rate limit: 400ms between pages, 30s on 429.
 */
import * as fs from 'fs';
import * as path from 'path';

const FEC = process.env.FEC_API_KEY || '';
if (!FEC) {
  console.error('FEC_API_KEY missing');
  process.exit(1);
}

const COMMITTEE_ID = 'C00652743';
const CYCLES = [2020, 2022, 2024, 2026] as const;
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'rose-federal-individual-donors-aggregated.json');

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
  two_year_transaction_period: number | null;
}

interface Resp {
  pagination: {
    count: number;
    pages: number;
    last_indexes: Record<string, string | number> | null;
  };
  results: Row[];
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function pullCycle(cycle: number): Promise<Row[]> {
  console.log(`\n--- cycle ${cycle} ---`);
  const rows: Row[] = [];
  let lastIndex: string | null = null;
  let lastDate: string | null = null;
  let page = 0;
  for (;;) {
    const u = new URL('https://api.open.fec.gov/v1/schedules/schedule_a/');
    u.searchParams.set('api_key', FEC);
    u.searchParams.set('committee_id', COMMITTEE_ID);
    u.searchParams.set('two_year_transaction_period', String(cycle));
    u.searchParams.set('is_individual', 'true');
    u.searchParams.set('per_page', '100');
    u.searchParams.set('sort', '-contribution_receipt_date');
    if (lastIndex) u.searchParams.set('last_index', lastIndex);
    if (lastDate) u.searchParams.set('last_contribution_receipt_date', lastDate);

    const res = await fetch(u.toString());
    if (res.status === 429) {
      console.warn('  rate-limited, sleeping 30s');
      await sleep(30_000);
      continue;
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => '?');
      console.error(`  FEC ${res.status}: ${txt.slice(0, 200)}`);
      break;
    }
    const data = (await res.json()) as Resp;
    const batch = data.results || [];
    rows.push(...batch);
    page++;
    const li = data.pagination?.last_indexes;
    if (!batch.length || !li || !li.last_index) {
      console.log(
        `  page ${page}: ${batch.length} rows, total ${rows.length} / ~${data.pagination?.count} (done)`,
      );
      break;
    }
    lastIndex = String(li.last_index);
    lastDate = li.last_contribution_receipt_date
      ? String(li.last_contribution_receipt_date)
      : null;
    if (page % 10 === 0)
      console.log(`  page ${page}: ${rows.length} / ~${data.pagination?.count}`);
    await sleep(400);
  }
  return rows;
}

function norm(s: string | null | undefined): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[.,'"()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripSuffix(s: string): string {
  return s
    .replace(/\b(JR|SR|II|III|IV|V|MD|DO|PHD|ESQ|CPA)\b\.?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface AggDonor {
  last: string;
  first: string;
  state: string;
  city: string;
  employer: string;
  occupation: string;
  total_to_rose: number;
  by_cycle: Record<string, number>;
  contrib_count: number;
}

function aggregate(allCycles: Record<string, Row[]>): {
  donors: AggDonor[];
  totals: {
    total_itemized_receipts: number;
    total_rows: number;
    by_cycle: Record<string, { rows: number; total: number }>;
  };
} {
  const byKey = new Map<string, AggDonor>();
  let totalRows = 0;
  let totalAmt = 0;
  const byCycle: Record<string, { rows: number; total: number }> = {};

  for (const [cycle, rows] of Object.entries(allCycles)) {
    byCycle[cycle] = { rows: 0, total: 0 };
    for (const r of rows) {
      const last = norm(stripSuffix(r.contributor_last_name || ''));
      const firstFull = norm(stripSuffix(r.contributor_first_name || ''));
      const first = firstFull.split(/\s+/)[0] || '';
      const state = norm(r.contributor_state);
      const amt = Number(r.contribution_receipt_amount) || 0;
      if (!last || !first) continue;
      totalRows++;
      totalAmt += amt;
      byCycle[cycle].rows++;
      byCycle[cycle].total += amt;
      const key = `${last}|${first}|${state}`;
      let cur = byKey.get(key);
      if (!cur) {
        cur = {
          last,
          first,
          state,
          city: norm(r.contributor_city),
          employer: norm(r.contributor_employer),
          occupation: norm(r.contributor_occupation),
          total_to_rose: 0,
          by_cycle: {},
          contrib_count: 0,
        };
        byKey.set(key, cur);
      }
      cur.total_to_rose += amt;
      cur.by_cycle[cycle] = (cur.by_cycle[cycle] || 0) + amt;
      cur.contrib_count += 1;
      if (!cur.employer && r.contributor_employer)
        cur.employer = norm(r.contributor_employer);
      if (!cur.occupation && r.contributor_occupation)
        cur.occupation = norm(r.contributor_occupation);
    }
  }

  const donors = [...byKey.values()].sort(
    (a, b) => b.total_to_rose - a.total_to_rose,
  );
  return {
    donors,
    totals: {
      total_itemized_receipts: Math.round(totalAmt * 100) / 100,
      total_rows: totalRows,
      by_cycle: byCycle,
    },
  };
}

async function main(): Promise<void> {
  console.log(`=== Rose federal Schedule A (${COMMITTEE_ID}) all cycles ===`);
  const raw: Record<string, Row[]> = {};
  for (const c of CYCLES) {
    const rows = await pullCycle(c);
    raw[String(c)] = rows;
  }

  console.log(`\nAggregating...`);
  const agg = aggregate(raw);
  console.log(`  unique donors: ${agg.donors.length}`);
  console.log(
    `  total rows: ${agg.totals.total_rows}  total $: ${agg.totals.total_itemized_receipts.toLocaleString()}`,
  );
  for (const [c, v] of Object.entries(agg.totals.by_cycle)) {
    console.log(`    cycle ${c}: ${v.rows} rows / $${v.total.toLocaleString()}`);
  }

  const payload = {
    committee_id: COMMITTEE_ID,
    candidate_id: 'H8TN06094',
    cycles: CYCLES,
    fetched_at: new Date().toISOString(),
    totals: agg.totals,
    donors: agg.donors,
  };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log(`\nWrote ${OUT}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

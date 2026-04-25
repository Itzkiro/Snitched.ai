#!/usr/bin/env npx tsx
/**
 * Pull Schedule A individual contributions for the 4 FL-07 (US House) 2026
 * candidates across all cycles they have served / are filing.
 *
 *   - Cory Mills (R, incumbent):    C00774943 (2022, 2024, 2026)
 *   - Marialana Kinter (D):         C00903633 (2026 only)
 *   - Michael Johnson (R):          C00876557 (2024, 2026)
 *   - Sarah Ulrich (R):             C00927210 (2026 only)
 *
 * Saves aggregated-by-donor JSON per candidate to:
 *   data/<slug>-federal-individual-donors-aggregated.json
 *
 * Usage:
 *   npx tsx scripts/fetch-fl07-all-cycles-schedule-a.ts             # all 4
 *   npx tsx scripts/fetch-fl07-all-cycles-schedule-a.ts mills       # one
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

const FEC = process.env.FEC_API_KEY || '';
if (!FEC) {
  console.error('FEC_API_KEY missing');
  process.exit(1);
}

interface CandSpec {
  slug: string;
  candidate_id: string;
  committee_id: string;
  cycles: number[];
  out_filename: string;
}

const CANDS: CandSpec[] = [
  {
    slug: 'mills',
    candidate_id: 'H2FL07156',
    committee_id: 'C00774943',
    cycles: [2022, 2024, 2026],
    out_filename: 'mills-federal-individual-donors-aggregated.json',
  },
  {
    slug: 'kinter',
    candidate_id: 'H6FL07165',
    committee_id: 'C00903633',
    cycles: [2026],
    out_filename: 'kinter-federal-individual-donors-aggregated.json',
  },
  {
    slug: 'johnson-fl07',
    candidate_id: 'H4FL07152',
    committee_id: 'C00876557',
    cycles: [2024, 2026],
    out_filename: 'johnson-fl07-federal-individual-donors-aggregated.json',
  },
  {
    slug: 'ulrich-fl07',
    candidate_id: 'H6FL07223',
    committee_id: 'C00927210',
    cycles: [2026],
    out_filename: 'ulrich-fl07-federal-individual-donors-aggregated.json',
  },
];

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

interface Row {
  entity_type: string | null;
  committee_id?: string | null;
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

async function pullCycle(committeeId: string, cycle: number): Promise<Row[]> {
  console.log(`  --- cmte ${committeeId}  cycle ${cycle} ---`);
  const rows: Row[] = [];
  let lastIndex: string | null = null;
  let lastDate: string | null = null;
  let page = 0;
  for (;;) {
    const u = new URL('https://api.open.fec.gov/v1/schedules/schedule_a/');
    u.searchParams.set('api_key', FEC);
    u.searchParams.set('committee_id', committeeId);
    u.searchParams.set('two_year_transaction_period', String(cycle));
    u.searchParams.set('is_individual', 'true');
    u.searchParams.set('per_page', '100');
    u.searchParams.set('sort', '-contribution_receipt_date');
    if (lastIndex) u.searchParams.set('last_index', lastIndex);
    if (lastDate) u.searchParams.set('last_contribution_receipt_date', lastDate);

    const res = await fetch(u.toString());
    if (res.status === 429) {
      console.warn('    rate-limited, sleeping 30s');
      await sleep(30_000);
      continue;
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => '?');
      console.error(`    FEC ${res.status}: ${txt.slice(0, 200)}`);
      break;
    }
    const data = (await res.json()) as Resp;
    const batch = data.results || [];
    for (const r of batch) r.committee_id = committeeId;
    rows.push(...batch);
    page++;
    const li = data.pagination?.last_indexes;
    if (!batch.length || !li || !li.last_index) {
      console.log(
        `    page ${page}: ${batch.length} rows, total ${rows.length} / ~${data.pagination?.count} (done)`,
      );
      break;
    }
    lastIndex = String(li.last_index);
    lastDate = li.last_contribution_receipt_date
      ? String(li.last_contribution_receipt_date)
      : null;
    if (page % 10 === 0)
      console.log(`    page ${page}: ${rows.length} / ~${data.pagination?.count}`);
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
  total_to_candidate: number;
  by_cycle: Record<string, number>;
  by_committee: Record<string, number>;
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
    byCycle[cycle] = byCycle[cycle] || { rows: 0, total: 0 };
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
          total_to_candidate: 0,
          by_cycle: {},
          by_committee: {},
          contrib_count: 0,
        };
        byKey.set(key, cur);
      }
      cur.total_to_candidate += amt;
      cur.by_cycle[cycle] = (cur.by_cycle[cycle] || 0) + amt;
      const cmte = r.committee_id || '';
      if (cmte) cur.by_committee[cmte] = (cur.by_committee[cmte] || 0) + amt;
      cur.contrib_count += 1;
      if (!cur.employer && r.contributor_employer)
        cur.employer = norm(r.contributor_employer);
      if (!cur.occupation && r.contributor_occupation)
        cur.occupation = norm(r.contributor_occupation);
    }
  }

  const donors = [...byKey.values()].sort(
    (a, b) => b.total_to_candidate - a.total_to_candidate,
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

async function fetchOne(c: CandSpec): Promise<void> {
  console.log(`\n=== ${c.slug} (${c.candidate_id} / ${c.committee_id}) ===`);
  const raw: Record<string, Row[]> = {};
  for (const cyc of c.cycles) {
    const rows = await pullCycle(c.committee_id, cyc);
    raw[String(cyc)] = (raw[String(cyc)] || []).concat(rows);
  }
  console.log(`  Aggregating...`);
  const agg = aggregate(raw);
  console.log(`    unique donors: ${agg.donors.length}`);
  console.log(
    `    total rows: ${agg.totals.total_rows}  total $: ${agg.totals.total_itemized_receipts.toLocaleString()}`,
  );
  for (const [cyc, v] of Object.entries(agg.totals.by_cycle).sort()) {
    console.log(`      cycle ${cyc}: ${v.rows} rows / $${v.total.toLocaleString()}`);
  }
  const payload = {
    committee_ids: [c.committee_id],
    candidate_id: c.candidate_id,
    cycles: c.cycles,
    fetched_at: new Date().toISOString(),
    totals: agg.totals,
    donors: agg.donors,
  };
  const out = path.join(DATA_DIR, c.out_filename);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(`  Wrote ${out}`);
}

async function main(): Promise<void> {
  const onlySlug = process.argv[2];
  console.log('=== FL-07 federal Schedule A (all cycles) ===');
  for (const c of CANDS) {
    if (onlySlug && c.slug !== onlySlug) continue;
    try {
      await fetchOne(c);
    } catch (e) {
      console.error(`ERROR ${c.slug}:`, e);
    }
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

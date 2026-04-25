#!/usr/bin/env npx tsx
/**
 * CORRECTED pro-Israel PAC capture audit for Rep. John Rose (R-TN-06).
 *
 * Background — what the earlier audit got wrong
 * ---------------------------------------------
 * scripts/audit-rose.ts used
 *   GET /schedules/schedule_a/?committee_id=ROSE&contributor_committee_id=AIPAC_PAC&...
 * to look for pro-Israel PAC contributions INTO Rose's committee. The FEC API
 * silently ignores contributor_committee_id on Schedule A and returns the full
 * Schedule A set unfiltered, which then gets filtered client-side by a name
 * regex. That's why the prior run reported "$0 from all pro-Israel PACs" —
 * the filter was broken, not the capture.
 *
 * Correct method — what this script does
 * --------------------------------------
 *   For every committee ID in the pro-Israel PAC superset (union of
 *   data-ingestion/israel-lobby-pacs.csv + scripts/pro-israel-pacs.json +
 *   lib/fec-client.ts ISRAEL_LOBBY_COMMITTEE_IDS):
 *
 *     GET /schedules/schedule_b/
 *         ?committee_id=<PAC>              # the disburser
 *         &recipient_committee_id=C00652743 # Rose's principal cmte
 *         &per_page=100                    # paginate via last_indexes
 *
 *   This surfaces (a) direct committee-to-committee transfers and (b) the
 *   individually-memoed earmark rows where pro-Israel donors wrote checks to
 *   the PAC designated for Rose's cmte (bundler mechanism).
 *
 *   Additionally, for known pro-Israel super PACs (UDP, Pro-Israel America
 *   Action Fund, etc.) we pull Schedule E (Independent Expenditures) filtered
 *   by candidate_id=H8TN06094.
 *
 * Rate limit policy: 400ms between requests, 30s backoff on 429.
 *
 * Writes:
 *   data/rose-pac-disbursement-audit.json
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

const FEC = process.env.FEC_API_KEY || '';
if (!FEC) throw new Error('FEC_API_KEY missing');

const CANDIDATE_ID = 'H8TN06094';
const ROSE_PRINCIPAL_CMTE = 'C00652743';

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const INGEST_DIR = path.join(ROOT, 'data-ingestion');
const OUT_PATH = path.join(DATA_DIR, 'rose-pac-disbursement-audit.json');
const BLACKBURN_CROSSREF_PATH = path.join(DATA_DIR, 'blackburn-tn-gov-cross-ref-2026.json');

// Known pro-Israel super PACs / IE vehicles — pull Schedule E for each
const PRO_ISRAEL_SUPER_PACS: Record<string, string> = {
  C00766368: 'United Democracy Project (UDP) — AIPAC Super PAC',
  C00791699: 'United Democracy Project (UDP) — alt ID',
  C00799031: 'United Democracy Project (UDP) — alt ID',
  C00803833: 'United Democracy Project (UDP)',
  C00740936: 'Pro-Israel America Action Fund',
  C00687657: 'American Pro-Israel PAC',
  C90019431: 'Pro-Israel America Inc',
  C90022864: 'DMFI IE',
  C90014747: 'NJDC IE',
  C90012063: 'RJC IE',
  C30001374: 'RJC Electioneering',
  C00878801: 'Preserve America PAC (Miriam Adelson)',
  C00756882: 'Preserve America PAC (Sheldon Adelson) — terminated',
};

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

interface FecResp<T> {
  results?: T[];
  pagination?: { last_indexes?: Record<string, unknown> | null; pages?: number; count?: number };
}

async function fec<T>(
  endpoint: string,
  params: Record<string, string | number>,
): Promise<FecResp<T>> {
  const url = new URL(`https://api.open.fec.gov/v1${endpoint}`);
  url.searchParams.set('api_key', FEC);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString());
  if (res.status === 429) {
    await sleep(30_000);
    return fec(endpoint, params);
  }
  if (!res.ok) {
    throw new Error(
      `FEC ${endpoint} ${res.status}: ${await res.text().catch(() => '?')}`,
    );
  }
  return res.json() as Promise<FecResp<T>>;
}

interface ScheduleBRow {
  committee_id?: string;
  committee_name?: string;
  recipient_committee_id?: string;
  recipient_name?: string;
  disbursement_amount?: number;
  disbursement_date?: string;
  disbursement_description?: string;
  disbursement_purpose_category?: string;
  memo_text?: string;
  memoed_subtotal?: boolean;
  two_year_transaction_period?: number;
  back_reference_schedule_name?: string;
}

interface ScheduleERow {
  committee_id?: string;
  committee_name?: string;
  candidate_id?: string;
  candidate_name?: string;
  support_oppose_indicator?: string;
  expenditure_amount?: number;
  expenditure_date?: string;
  expenditure_description?: string;
  purpose_category?: string;
  payee_name?: string;
}

async function pullScheduleBDisbursements(
  disburserCommitteeId: string,
  recipientCommitteeId: string,
): Promise<ScheduleBRow[]> {
  const rows: ScheduleBRow[] = [];
  let lastIdx: unknown;
  let lastAmt: unknown;
  let lastDate: unknown;
  for (let page = 0; page < 50; page++) {
    const params: Record<string, string | number> = {
      committee_id: disburserCommitteeId,
      recipient_committee_id: recipientCommitteeId,
      per_page: 100,
      sort: '-disbursement_date',
    };
    if (lastIdx !== undefined) params.last_index = String(lastIdx);
    if (lastAmt !== undefined) params.last_disbursement_amount = String(lastAmt);
    if (lastDate !== undefined) params.last_disbursement_date = String(lastDate);
    const resp = await fec<ScheduleBRow>('/schedules/schedule_b/', params);
    const batch = resp.results || [];
    rows.push(...batch);
    const last = resp.pagination?.last_indexes;
    if (!last || batch.length < 100) break;
    lastIdx = last.last_index;
    lastAmt = last.last_disbursement_amount;
    lastDate = last.last_disbursement_date;
    await sleep(400);
  }
  return rows;
}

async function pullScheduleEForCandidate(
  spenderCommitteeId: string,
  candidateId: string,
): Promise<ScheduleERow[]> {
  const rows: ScheduleERow[] = [];
  let lastIdx: unknown;
  let lastAmt: unknown;
  for (let page = 0; page < 20; page++) {
    const params: Record<string, string | number> = {
      committee_id: spenderCommitteeId,
      candidate_id: candidateId,
      per_page: 100,
      sort: '-expenditure_amount',
    };
    if (lastIdx !== undefined) params.last_index = String(lastIdx);
    if (lastAmt !== undefined) params.last_expenditure_amount = String(lastAmt);
    const resp = await fec<ScheduleERow>('/schedules/schedule_e/', params);
    const batch = resp.results || [];
    rows.push(...batch);
    const last = resp.pagination?.last_indexes;
    if (!last || batch.length < 100) break;
    lastIdx = last.last_index;
    lastAmt = last.last_expenditure_amount;
    await sleep(400);
  }
  return rows;
}

interface PacMeta {
  id: string;
  name: string;
}

function loadProIsraelPacSuperset(): PacMeta[] {
  const byId = new Map<string, string>();

  // 1. israel-lobby-pacs.csv
  const csv = path.join(INGEST_DIR, 'israel-lobby-pacs.csv');
  if (fs.existsSync(csv)) {
    const lines = fs.readFileSync(csv, 'utf8').split(/\r?\n/);
    lines.shift();
    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split(',');
      const id = (parts[0] || '').trim();
      const name = (parts[2] || parts[1] || '').trim();
      if (id) byId.set(id, name);
    }
  }

  // 2. scripts/pro-israel-pacs.json
  const json = path.join(ROOT, 'scripts', 'pro-israel-pacs.json');
  if (fs.existsSync(json)) {
    const arr = JSON.parse(fs.readFileSync(json, 'utf8')) as Array<{
      id: string;
      name: string;
    }>;
    for (const r of arr) if (r.id && !byId.has(r.id)) byId.set(r.id, r.name);
  }

  // 3. lib/fec-client.ts ISRAEL_LOBBY_COMMITTEE_IDS (hardcoded mirror)
  const libHardcoded: Record<string, string> = {
    C00104414: 'AIPAC (American Israel Public Affairs Committee)',
    C00803833: 'United Democracy Project (AIPAC Super PAC)',
    C00776997: 'Democratic Majority for Israel PAC',
    C00765578: 'Pro-Israel America PAC',
    C00030718: 'NORPAC',
    C00236489: 'J Street PAC',
    C00368522: 'Joint Action Committee for Political Affairs (JACPAC)',
    C00095067: 'Washington PAC',
    C00386532: 'Americans for a Secure Israel',
  };
  for (const [id, name] of Object.entries(libHardcoded)) {
    if (!byId.has(id)) byId.set(id, name);
  }

  // 4. add super PACs from our hardcoded map above
  for (const [id, name] of Object.entries(PRO_ISRAEL_SUPER_PACS)) {
    if (!byId.has(id)) byId.set(id, name);
  }

  return [...byId.entries()].map(([id, name]) => ({ id, name }));
}

interface ScheduleBEntry {
  pac_id: string;
  pac_name: string;
  cycle: number;
  amount: number;
  date: string;
  type: 'direct' | 'earmarked_bundle';
  memo: string;
  purpose: string;
  earmark_donor: string | null;
}

function extractEarmarkDonor(memo: string): string | null {
  if (!memo) return null;
  const m = memo.match(/EARMARK OF ([A-Z][A-Z0-9 .,'&/\-]+?)(?=\.|$|\s+TRANSMITTED)/i);
  if (m) return m[1].trim();
  return null;
}

function classifyType(row: ScheduleBRow): 'direct' | 'earmarked_bundle' {
  const memo = (row.memo_text || '').toUpperCase();
  const purpose = (row.disbursement_description || '').toUpperCase();
  if (memo.includes('EARMARK') || purpose.includes('EARMARK')) return 'earmarked_bundle';
  return 'direct';
}

interface BlackburnMatch {
  name: string;
  state: string;
  to_blackburn: number;
  pacs: string[];
  employer?: string;
  occupation?: string;
  foreign_money_flag?: string;
}

interface BlackburnCrossref {
  matches: BlackburnMatch[];
}

function loadBlackburnCrossrefDonorIndex(): Map<string, BlackburnMatch> {
  if (!fs.existsSync(BLACKBURN_CROSSREF_PATH)) return new Map();
  const payload = JSON.parse(
    fs.readFileSync(BLACKBURN_CROSSREF_PATH, 'utf8'),
  ) as BlackburnCrossref;
  const m = new Map<string, BlackburnMatch>();
  for (const entry of payload.matches || []) {
    const key = (entry.name || '').toUpperCase().replace(/\s+/g, ' ').trim();
    if (key) m.set(key, entry);
  }
  return m;
}

function normalizeDonorNameForMatch(raw: string): string {
  if (!raw) return '';
  // Memo format: "LAWRENCE HELLER" (first-last) — Blackburn crossref: "HELLER, LAWRENCE" (last, first)
  const s = raw.toUpperCase().replace(/\s+/g, ' ').trim();
  if (s.includes(',')) return s; // already last, first
  const parts = s.split(' ').filter(Boolean);
  if (parts.length < 2) return s;
  const last = parts[parts.length - 1];
  const first = parts.slice(0, -1).join(' ');
  return `${last}, ${first}`;
}

interface CycleBucket {
  total: number;
  entries: ScheduleBEntry[];
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  console.log('=== ROSE PAC DISBURSEMENT AUDIT (CORRECTED METHOD) ===\n');
  console.log(`Candidate:  ${CANDIDATE_ID} (John Rose, R-TN-06)`);
  console.log(`Rose cmte:  ${ROSE_PRINCIPAL_CMTE} (JOHN ROSE FOR TENNESSEE)\n`);

  const pacs = loadProIsraelPacSuperset();
  console.log(`Pro-Israel PAC superset: ${pacs.length} committee IDs\n`);

  const allEntries: ScheduleBEntry[] = [];
  const byPac: Record<
    string,
    {
      committee_id: string;
      total_all_cycles: number;
      by_cycle: Record<string, number>;
      entries: ScheduleBEntry[];
      earmarked_donors: string[];
    }
  > = {};

  for (let i = 0; i < pacs.length; i++) {
    const pac = pacs[i];
    process.stdout.write(
      `[${String(i + 1).padStart(2)}/${pacs.length}] ${pac.id.padEnd(11)} ${pac.name.slice(0, 50).padEnd(50)} `,
    );
    let rows: ScheduleBRow[] = [];
    try {
      rows = await pullScheduleBDisbursements(pac.id, ROSE_PRINCIPAL_CMTE);
    } catch (e) {
      console.log(`  ERR ${String(e).slice(0, 80)}`);
      await sleep(400);
      continue;
    }
    if (!rows.length) {
      console.log(`  0 rows`);
      await sleep(400);
      continue;
    }

    const entries: ScheduleBEntry[] = rows.map(r => ({
      pac_id: pac.id,
      pac_name: pac.name,
      cycle: Number(r.two_year_transaction_period) || 0,
      amount: Number(r.disbursement_amount) || 0,
      date: r.disbursement_date || '',
      type: classifyType(r),
      memo: r.memo_text || '',
      purpose: r.disbursement_description || '',
      earmark_donor: extractEarmarkDonor(r.memo_text || ''),
    }));

    const byCycle: Record<string, number> = {};
    for (const e of entries) {
      const ck = String(e.cycle || 'unknown');
      byCycle[ck] = (byCycle[ck] || 0) + e.amount;
    }
    const total = entries.reduce((s, e) => s + e.amount, 0);
    const earmarkDonors = [
      ...new Set(entries.filter(e => e.earmark_donor).map(e => e.earmark_donor || '')),
    ];

    byPac[pac.name] = {
      committee_id: pac.id,
      total_all_cycles: total,
      by_cycle: byCycle,
      entries,
      earmarked_donors: earmarkDonors,
    };
    allEntries.push(...entries);
    console.log(
      `  ${rows.length} rows / $${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}  cycles=${Object.keys(byCycle).sort().join(',')}  earmark_donors=${earmarkDonors.length}`,
    );
    await sleep(400);
  }

  // Schedule E IE for known pro-Israel super PACs
  console.log(`\n=== Schedule E (Independent Expenditures) for ${CANDIDATE_ID} ===`);
  const ieEntries: Array<
    ScheduleERow & { spender_committee_id: string; spender_label: string }
  > = [];
  for (const [cid, label] of Object.entries(PRO_ISRAEL_SUPER_PACS)) {
    process.stdout.write(`[IE] ${cid.padEnd(11)} ${label.slice(0, 50).padEnd(50)} `);
    try {
      const rows = await pullScheduleEForCandidate(cid, CANDIDATE_ID);
      if (rows.length) {
        for (const r of rows) {
          ieEntries.push({ ...r, spender_committee_id: cid, spender_label: label });
        }
        const sum = rows.reduce((s, r) => s + (Number(r.expenditure_amount) || 0), 0);
        console.log(`  ${rows.length} IE rows / $${sum.toLocaleString()}`);
      } else {
        console.log(`  0 rows`);
      }
    } catch (e) {
      console.log(`  ERR ${String(e).slice(0, 80)}`);
    }
    await sleep(400);
  }

  // Aggregate by cycle across all PACs
  const byCycle: Record<string, CycleBucket> = {};
  for (const e of allEntries) {
    const ck = String(e.cycle || 'unknown');
    if (!byCycle[ck]) byCycle[ck] = { total: 0, entries: [] };
    byCycle[ck].total += e.amount;
    byCycle[ck].entries.push(e);
  }

  // Unique earmark donors across all PACs
  const earmarkDonorAgg = new Map<
    string,
    { name: string; total: number; count: number; pacs: Set<string>; cycles: Set<number> }
  >();
  for (const e of allEntries) {
    if (!e.earmark_donor) continue;
    const key = e.earmark_donor.toUpperCase().replace(/\s+/g, ' ').trim();
    const cur = earmarkDonorAgg.get(key);
    if (cur) {
      cur.total += e.amount;
      cur.count++;
      cur.pacs.add(e.pac_name);
      cur.cycles.add(e.cycle);
    } else {
      earmarkDonorAgg.set(key, {
        name: e.earmark_donor,
        total: e.amount,
        count: 1,
        pacs: new Set([e.pac_name]),
        cycles: new Set([e.cycle]),
      });
    }
  }

  // Cross-reference earmark donors against Blackburn crossref
  const blackburnIdx = loadBlackburnCrossrefDonorIndex();
  const cross: Array<{
    rose_donor_memo_form: string;
    blackburn_entry: BlackburnMatch;
    rose_total: number;
    rose_cycles: number[];
    rose_pacs: string[];
  }> = [];
  for (const [, d] of earmarkDonorAgg) {
    const normalized = normalizeDonorNameForMatch(d.name);
    const hit = blackburnIdx.get(normalized);
    if (hit) {
      cross.push({
        rose_donor_memo_form: d.name,
        blackburn_entry: hit,
        rose_total: d.total,
        rose_cycles: [...d.cycles].sort(),
        rose_pacs: [...d.pacs],
      });
    }
  }

  // Summary
  const cyclesOfInterest = ['2020', '2022', '2024', '2026'];
  const summary: Record<string, unknown> = {};
  let totalAll = 0;
  for (const c of cyclesOfInterest) {
    const v = byCycle[c]?.total || 0;
    summary[`cycle_${c}_direct_and_earmarked`] = v;
    totalAll += v;
  }
  summary.total_all_cycles = totalAll;
  summary.unique_earmarked_donors = earmarkDonorAgg.size;
  summary.earmarked_donors_also_on_blackburn_tn_gov = cross.map(c => ({
    name: c.blackburn_entry.name,
    state: c.blackburn_entry.state,
    employer: c.blackburn_entry.employer,
    to_blackburn: c.blackburn_entry.to_blackburn,
    to_rose_earmark_total: c.rose_total,
    via_pacs: c.rose_pacs,
    cycles: c.rose_cycles,
    foreign_money_flag: c.blackburn_entry.foreign_money_flag,
  }));

  // Top earmark donors (by total)
  const topEarmarkDonors = [...earmarkDonorAgg.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 20)
    .map(d => ({
      name: d.name,
      total: d.total,
      count: d.count,
      pacs: [...d.pacs],
      cycles: [...d.cycles].sort(),
    }));

  const out = {
    candidate_id: CANDIDATE_ID,
    principal_committee_id: ROSE_PRINCIPAL_CMTE,
    method:
      'schedule_b_by_disburser — corrected for earlier broken Schedule A contributor_committee_id filter',
    audited_at: startedAt,
    finished_at: new Date().toISOString(),
    total_pacs_checked: pacs.length,
    by_cycle: byCycle,
    by_pac: byPac,
    independent_expenditures: ieEntries,
    summary: {
      ...summary,
      top_earmark_donors: topEarmarkDonors,
    },
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`\n=== SUMMARY ===`);
  for (const c of cyclesOfInterest) {
    console.log(
      `  cycle ${c}: $${(byCycle[c]?.total || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} (${(byCycle[c]?.entries || []).length} entries)`,
    );
  }
  console.log(`  total all cycles: $${totalAll.toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
  console.log(`  PACs with any hit: ${Object.keys(byPac).length} / ${pacs.length}`);
  console.log(`  unique earmarked donors: ${earmarkDonorAgg.size}`);
  console.log(`  shared with Blackburn TN gov cmte: ${cross.length}`);
  for (const c of cross) {
    console.log(
      `    - ${c.blackburn_entry.name} (${c.blackburn_entry.state}) — Rose $${c.rose_total} via ${c.rose_pacs.join('/')} | Blackburn $${c.blackburn_entry.to_blackburn}`,
    );
  }
  console.log(`\nTop 5 earmark donors to Rose (by total):`);
  for (const d of topEarmarkDonors.slice(0, 5)) {
    console.log(
      `  $${d.total.toLocaleString().padStart(8)} (${d.count}x) | ${d.name} | PACs: ${d.pacs.join(', ')} | cycles: ${d.cycles.join(',')}`,
    );
  }
  console.log(`\nIE entries: ${ieEntries.length}`);
  console.log(`\nWrote ${OUT_PATH}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

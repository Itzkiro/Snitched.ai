#!/usr/bin/env npx tsx
/**
 * Full FEC + pro-Israel-registry audit of Aaron Baker (FL-06 / Republican challenger).
 *
 * - Paginates all Schedule A rows (individuals + non-individuals) for both of
 *   Baker's committees (C00902478 principal, C00893289 terminated predecessor).
 * - Aggregates by donor, classifies PAC vs individual vs WinRed/ActBlue conduit.
 * - Cross-references individuals against the 49-year pro-Israel donor registry
 *   (data/pro-israel-donors-YYYY.csv via lib/roster-match.ts).
 * - Writes data/aaron-baker-audit.json with raw + aggregated + crossref results.
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { loadMaster, parseName, crossref, type CandDonor } from '../lib/roster-match';

const FEC = process.env.FEC_API_KEY || '';
if (!FEC) throw new Error('FEC_API_KEY missing');

const COMMITTEES = ['C00902478', 'C00893289'];
const CANDIDATE_IDS = ['H6FL06324', 'H6FL06241'];
const CYCLES = [2024, 2026];
const DATA_DIR = path.join(__dirname, '..', 'data');
const OUT = path.join(DATA_DIR, 'aaron-baker-audit.json');

const CONDUIT_RE = /^(WINRED|ACTBLUE|ANEDOT)(\s|,|$)/i;

function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

interface Row {
  contributor_name: string;
  contributor_id?: string;
  contributor_committee_id?: string;
  contributor_state?: string;
  contributor_city?: string;
  contributor_employer?: string;
  contributor_occupation?: string;
  contribution_receipt_amount: number;
  contribution_receipt_date: string;
  entity_type: string;
}

async function fec<T>(
  endpoint: string, params: Record<string, string | number>
): Promise<{ results?: T[]; pagination?: { last_indexes?: Record<string, unknown> | null } }> {
  const url = new URL(`https://api.open.fec.gov/v1${endpoint}`);
  url.searchParams.set('api_key', FEC);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString());
  if (res.status === 429) { await sleep(30_000); return fec(endpoint, params); }
  if (!res.ok) throw new Error(`FEC ${endpoint} ${res.status}: ${await res.text().catch(()=>'?')}`);
  return res.json() as Promise<{ results?: T[]; pagination?: { last_indexes?: Record<string, unknown> | null } }>;
}

async function pullAll(committeeId: string, cycle: number, isIndividual: boolean): Promise<Row[]> {
  const rows: Row[] = [];
  let lastIdx: unknown, lastAmt: unknown;
  for (let page = 0; page < 50; page++) {
    const params: Record<string, string | number> = {
      committee_id: committeeId,
      two_year_transaction_period: cycle,
      is_individual: isIndividual ? 'true' : 'false',
      per_page: 100,
      sort: '-contribution_receipt_amount',
    };
    if (lastIdx !== undefined) params.last_index = String(lastIdx);
    if (lastAmt !== undefined) params.last_contribution_receipt_amount = String(lastAmt);
    const resp = await fec<Row>('/schedules/schedule_a/', params);
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

interface DonorAgg {
  name: string;
  state: string;
  city: string;
  employer: string;
  occupation: string;
  total: number;
  count: number;
  first_date: string;
  last_date: string;
  cycles: Set<number>;
}

function aggregate(rows: Array<Row & { cycle: number }>): Map<string, DonorAgg> {
  const m = new Map<string, DonorAgg>();
  for (const r of rows) {
    const name = (r.contributor_name || '').trim().toUpperCase();
    const state = (r.contributor_state || '').toUpperCase();
    const key = `${name}|${state}`;
    const cur = m.get(key);
    const amt = r.contribution_receipt_amount || 0;
    const date = r.contribution_receipt_date || '';
    if (cur) {
      cur.total += amt;
      cur.count++;
      if (date && (!cur.first_date || date < cur.first_date)) cur.first_date = date;
      if (date && date > cur.last_date) cur.last_date = date;
      cur.cycles.add(r.cycle);
      if (r.contributor_employer && !cur.employer) cur.employer = r.contributor_employer;
    } else {
      m.set(key, {
        name, state,
        city: (r.contributor_city || '').toUpperCase(),
        employer: (r.contributor_employer || '').toUpperCase(),
        occupation: (r.contributor_occupation || '').toUpperCase(),
        total: amt, count: 1,
        first_date: date, last_date: date,
        cycles: new Set([r.cycle]),
      });
    }
  }
  return m;
}

async function main(): Promise<void> {
  console.log('=== AARON BAKER FL-06 AUDIT ===');

  // Committee totals
  const totals: Record<string, unknown>[] = [];
  for (const cid of COMMITTEES) {
    const r = await fec<Record<string, unknown>>(`/committee/${cid}/totals/`, { per_page: 10 });
    for (const t of r.results || []) totals.push({ committee_id: cid, ...t });
    await sleep(400);
  }
  console.log(`Committee totals: ${totals.length} cycle rows`);

  // All Schedule A rows (individuals + non-individuals) per committee per cycle
  const allIndividualRows: Array<Row & { cycle: number; committee_id: string }> = [];
  const allPacRows: Array<Row & { cycle: number; committee_id: string }> = [];

  for (const cid of COMMITTEES) {
    for (const cy of CYCLES) {
      const inds = await pullAll(cid, cy, true);
      const pacs = await pullAll(cid, cy, false);
      allIndividualRows.push(...inds.map(r => ({ ...r, cycle: cy, committee_id: cid })));
      allPacRows.push(...pacs.map(r => ({ ...r, cycle: cy, committee_id: cid })));
      console.log(`  ${cid} ${cy}: ${inds.length} inds, ${pacs.length} non-inds`);
    }
  }

  console.log(`\nTotal rows: ${allIndividualRows.length} individual + ${allPacRows.length} non-individual`);

  // Classify PAC rows: conduit (WinRed/Anedot) vs real PAC
  const realPacRows = allPacRows.filter(r => !CONDUIT_RE.test((r.contributor_name || '').trim()));
  const conduitRows = allPacRows.filter(r => CONDUIT_RE.test((r.contributor_name || '').trim()));
  const conduitSum = conduitRows.reduce((s, r) => s + (r.contribution_receipt_amount || 0), 0);
  const realPacSum = realPacRows.reduce((s, r) => s + (r.contribution_receipt_amount || 0), 0);

  console.log(`\nNon-individual classification:`);
  console.log(`  WinRed/Anedot conduit rows: ${conduitRows.length} totaling $${conduitSum.toLocaleString()}`);
  console.log(`  Real PAC/party rows:        ${realPacRows.length} totaling $${realPacSum.toLocaleString()}`);

  console.log(`\nReal PAC contributions (itemized):`);
  const realPacAgg = aggregate(realPacRows);
  for (const [, a] of [...realPacAgg.entries()].sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  $${a.total.toLocaleString()} (${a.count}x) | ${a.name} | ${a.state}`);
  }

  // Aggregate individuals
  const indAgg = aggregate(allIndividualRows);
  console.log(`\nIndividual donors: ${indAgg.size} unique / ${allIndividualRows.length} rows / $${allIndividualRows.reduce((s,r)=>s+(r.contribution_receipt_amount||0),0).toLocaleString()}`);

  console.log(`\nTop 25 individual donors (aggregated):`);
  const top = [...indAgg.values()].sort((a, b) => b.total - a.total).slice(0, 25);
  for (const d of top) {
    console.log(`  $${d.total.toFixed(2).padStart(10)} (${d.count}x) | ${d.name.padEnd(30)} | ${d.state} | ${d.employer.slice(0,25).padEnd(25)} | ${d.occupation.slice(0,18)}`);
  }

  // Cross-reference against pro-Israel registry using library
  console.log(`\nLoading pro-Israel registry from ${DATA_DIR}...`);
  const master = loadMaster(DATA_DIR);
  console.log(`  ${master.size} unique pro-Israel individual donors indexed`);

  const candDonors: CandDonor[] = [];
  for (const r of allIndividualRows) {
    if (r.entity_type && r.entity_type !== 'IND') continue;
    const raw = (r.contributor_name || '').trim();
    if (!raw) continue;
    const p = parseName(raw);
    if (!p || !p.last || !p.first) continue;
    candDonors.push({
      rawName: raw,
      last: p.last, first: p.first, firstInitial: p.firstInitial,
      state: (r.contributor_state || '').toUpperCase().trim(),
      city: (r.contributor_city || '').toUpperCase().trim(),
      employer: (r.contributor_employer || '').toUpperCase().trim(),
      occupation: (r.contributor_occupation || '').toUpperCase().trim(),
      amount: r.contribution_receipt_amount || 0,
      date: r.contribution_receipt_date || '',
      cycle: String(r.cycle),
    });
  }

  const matches = crossref(candDonors, master);
  const matchSum = matches.reduce((s, m) => s + m.candidateTotal, 0);
  const matchToProIsrael = matches.reduce((s, m) => s + m.proIsraelTotal, 0);
  console.log(`\nPro-Israel registry crossref:`);
  console.log(`  ${matches.length} matched donors out of ${candDonors.length} itemized individual rows / ${indAgg.size} uniques`);
  console.log(`  High confidence: ${matches.filter(m => m.confidence === 'high').length}`);
  console.log(`  Medium confidence: ${matches.filter(m => m.confidence === 'medium').length}`);
  console.log(`  These donors gave Baker: $${matchSum.toLocaleString()}`);
  console.log(`  These donors' lifetime to pro-Israel PACs: $${matchToProIsrael.toLocaleString()}`);

  if (matches.length > 0) {
    console.log(`\n  Top matched bundlers:`);
    for (const m of matches.slice(0, 15)) {
      console.log(`    ${m.confidence.toUpperCase().padEnd(6)} | $${m.candidateTotal.toFixed(2).padStart(8)} to Baker | $${m.proIsraelTotal.toLocaleString().padStart(10)} lifetime pro-Israel | ${m.donorName}, ${m.state}`);
    }
  }

  // Write audit JSON
  fs.writeFileSync(OUT, JSON.stringify({
    generated_at: new Date().toISOString(),
    candidate: {
      name: 'Aaron Baker',
      party: 'REP',
      state: 'FL',
      district: '06',
      candidate_ids: CANDIDATE_IDS,
      committees: COMMITTEES,
      principal_committee: 'C00902478',
    },
    totals,
    summary: {
      individual_rows: allIndividualRows.length,
      individual_uniques: indAgg.size,
      individual_sum: allIndividualRows.reduce((s, r) => s + (r.contribution_receipt_amount || 0), 0),
      conduit_rows: conduitRows.length,
      conduit_sum: conduitSum,
      real_pac_rows: realPacRows.length,
      real_pac_sum: realPacSum,
      real_pacs: [...realPacAgg.entries()].map(([, a]) => ({ name: a.name, state: a.state, total: a.total, count: a.count })).sort((a,b) => b.total - a.total),
      pro_israel_registry_size: master.size,
      pro_israel_matches: matches.length,
      pro_israel_matches_high_confidence: matches.filter(m => m.confidence === 'high').length,
      pro_israel_match_to_candidate: matchSum,
      pro_israel_match_career_pro_israel: matchToProIsrael,
    },
    top_individual_donors: [...indAgg.values()].sort((a, b) => b.total - a.total).slice(0, 50).map(d => ({
      name: d.name, state: d.state, city: d.city, employer: d.employer, occupation: d.occupation,
      total: d.total, count: d.count, first_date: d.first_date, last_date: d.last_date,
    })),
    real_pac_contributions: realPacRows.map(r => ({
      date: r.contribution_receipt_date,
      amount: r.contribution_receipt_amount,
      name: r.contributor_name,
      committee_id: r.contributor_committee_id || r.contributor_id,
      state: r.contributor_state,
      cycle: r.cycle,
      baker_committee: r.committee_id,
    })),
    pro_israel_matches: matches,
  }, null, 2));

  console.log(`\nArtifact: ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });

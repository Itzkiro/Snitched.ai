#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Full audit refresh for Laura Friedman (CA-30, D, incumbent / Schiff successor).
 *
 * Pillars:
 *   1. FEC 2026-cycle itemized individuals (min $200) + PAC contribs + IEs
 *   2. 49-year pro-Israel individual-donor roster match (via lib/roster-match.ts)
 *   3. Donor forensics over current cycle
 *   4. Corruption score (v6.5) with current-cycle ratios
 *   5. Juice-box tier from Israel-lobby capture magnitude
 *   6. Audit enrollment: is_audited=true, data_source with audit suffix,
 *      tracker append on --write
 *
 * Cycle-only scoring policy: ONLY 2026 donors feed the live breakdown.
 * Multi-cycle context from the 49-year registry is retained on matches
 * (pro_israel_cycles) but candidateTotal is restricted to 2026-cycle giving
 * to Friedman's committee C00831321.
 *
 * Voting record ingest is deferred to a follow-up (freshman, 15-month record).
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { computeCorruptionScore } from '../lib/corruption-score';
import type { Politician, DonorForensics } from '../lib/types';
import {
  loadMaster,
  crossref,
  buildBreakdown,
  buildRedFlags,
  ROSTER_MATCH_MARKER,
  type CandDonor,
} from '../lib/roster-match';

// ---------------------------------------------------------------------------
// Constants — Laura Friedman
// ---------------------------------------------------------------------------

const BIOGUIDE_ID = 'ca-30-2026-laura-friedman';
const CANDIDATE_NAME = 'Laura Friedman';
const FEC_CANDIDATE_ID = 'H4CA30149';
const FEC_COMMITTEE_ID = 'C00831321'; // LAURA FRIEDMAN FOR CONGRESS (principal)
const CYCLE = 2026;
// Multi-cycle policy (option B for re-election incumbents): include every
// active cycle of the federal committee, not just 2026. Friedman is a sitting
// incumbent in her first re-election; her 2024 cycle is her active
// congressional tenure, not ancient history like Sanford's 2013-2019 stint.
const ACTIVE_CYCLES = [2024, 2026];
const STATE = 'CA';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const FEC_API_KEY = process.env.FEC_API_KEY || '';

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUT_DIR = path.join(__dirname, '..', 'data-ingestion');
const TRACKER_CSV = path.join(OUT_DIR, 'audit-tracker.csv');

// Israel-lobby PAC committee IDs — same list as refresh-mast.ts
const ISRAEL_LOBBY_COMMITTEE_IDS = new Set([
  'C00104299', 'C00797472', 'C00797670',                    // AIPAC
  'C00368522', 'C00699470', 'C00740936', 'C00687657', 'C90019431', // Pro-Israel America
  'C00556100', 'C00345132', 'C30001374', 'C90012063',       // RJC
  'C00764126', 'C90022864',                                 // DMFI
  'C00441949',                                              // J Street
  'C00068692', 'C00247403',                                 // NORPAC
  'C00127811',                                              // USI
  'C00139659', 'C00488411',                                 // JACPAC
  'C00141747', 'C00458935', 'C00265470',                    // FIPAC
  'C00748475', 'C00306670', 'C00268334', 'C90014747',       // Jewish Dem / National Jewish Dem
  'C00202481',                                              // Jewish Republican
  'C00791699',                                              // UDP
  'C00277228',                                              // American Israel Alliance
  'C00503250',                                              // Allies for Israel
  'C00524652',                                              // AMP
]);

const ISRAEL_LOBBY_NAME_RE = /AIPAC|AMERICAN ISRAEL|NORPAC|DEMOCRATIC MAJORITY FOR ISRAEL|DMFI|UNITED DEMOCRACY PROJECT|PRO-ISRAEL AMERICA|PRO\-ISRAEL AMERICA|REPUBLICAN JEWISH COALITION|ZIONIST ORGANIZATION|CHRISTIANS UNITED FOR ISRAEL|JACPAC|JEWISH DEMOCRATIC COUNCIL|JEWISH REPUBLICAN|FRIENDS OF ISRAEL|FIPAC|ALLIES FOR ISRAEL|ISRAEL ALLIANCE|AMP.*MIDDLE EAST|AMERICANS FOR.*MIDDLE EAST|U\.?S\.? ISRAEL|USI PAC|NATIONAL JEWISH DEMOCRATIC|J STREET|J\-STREET/i;

const SOCIAL_MEDIA = {
  twitterHandle: 'LauraFriedmanCA',
  facebookPageUrl: 'https://www.facebook.com/LauraFriedmanCA/',
  instagramHandle: 'laurafriedmanca',
  campaignWebsite: 'https://www.lauraforcongress.org/',
  officialWebsite: 'https://friedman.house.gov/',
};

// ---------------------------------------------------------------------------
// FEC client
// ---------------------------------------------------------------------------

interface FecFetchParams { [k: string]: string | number; }
interface FecResponse<T> {
  results?: T[];
  pagination?: {
    pages: number;
    per_page: number;
    count: number;
    last_indexes?: Record<string, string | number> | null;
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function fecFetch<T>(endpoint: string, params: FecFetchParams): Promise<FecResponse<T>> {
  const url = new URL(`https://api.open.fec.gov/v1${endpoint}`);
  url.searchParams.set('api_key', FEC_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(20000) });
  if (res.status === 429) {
    await sleep(30_000);
    return fecFetch(endpoint, params);
  }
  if (!res.ok) throw new Error(`FEC ${endpoint} ${res.status}`);
  return res.json() as Promise<FecResponse<T>>;
}

interface FecScheduleARow {
  contributor_name: string;
  contributor_id?: string | null;
  contributor_committee_id?: string | null;
  contribution_receipt_amount: number;
  contribution_receipt_date: string;
  entity_type: string;
  contributor_city?: string | null;
  contributor_state?: string | null;
  contributor_zip?: string | null;
  contributor_street_1?: string | null;
  contributor_employer?: string | null;
  contributor_occupation?: string | null;
  two_year_transaction_period?: number;
}

interface FecTotals {
  cycle: number;
  receipts: number;
  individual_contributions: number;
  individual_itemized_contributions: number;
  individual_unitemized_contributions: number;
  other_political_committee_contributions: number;
  last_cash_on_hand_end_period: number;
  transfers_from_other_authorized_committee?: number;
}

interface FecScheduleERow {
  committee_id: string;
  committee_name: string;
  expenditure_amount: number;
  support_oppose_indicator: string;
  payee_name?: string;
  expenditure_date?: string;
}

function isIsraelLobby(name: string, committeeId: string | null | undefined): boolean {
  if (committeeId && ISRAEL_LOBBY_COMMITTEE_IDS.has(committeeId)) return true;
  return ISRAEL_LOBBY_NAME_RE.test(name || '');
}

function computeDonorForensicsFromFec(
  itemized: ReadonlyArray<FecScheduleARow>,
  politicianState: string,
): DonorForensics {
  const count = itemized.length;
  if (count === 0) {
    return {
      missingEmployerRatio: 0, outOfStatePct: 0, householdBundling: 0,
      donationStdDev: 0, platformOpacity: 0, itemizedCount: 0,
      computedAt: new Date().toISOString(),
    };
  }
  const EMPLOYER_MISSING_RE = /^(information requested|requested|n\/?a|none|unknown|\s*)$/i;
  const individuals = itemized.filter(r => r.entity_type === 'IND');
  const missingEmployer = individuals.filter(r => {
    const e = (r.contributor_employer ?? '').trim();
    return e === '' || EMPLOYER_MISSING_RE.test(e);
  }).length;
  const missingEmployerRatio = individuals.length > 0 ? missingEmployer / individuals.length : 0;

  const outOfState = individuals.filter(r => r.contributor_state && r.contributor_state !== politicianState).length;
  const outOfStatePct = individuals.length > 0 ? outOfState / individuals.length : 0;

  const MAX_THRESHOLD = 3500 * 0.9;
  const maxers = individuals.filter(r => r.contribution_receipt_amount >= MAX_THRESHOLD);
  const addrCounts: Record<string, number> = {};
  for (const m of maxers) {
    const addr = `${m.contributor_street_1 ?? ''} ${m.contributor_zip ?? ''}`.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    if (!addr) continue;
    addrCounts[addr] = (addrCounts[addr] ?? 0) + 1;
  }
  const bundledCount = Object.values(addrCounts).filter(n => n >= 2).reduce((s, n) => s + n, 0);
  const householdBundling = count > 0 ? bundledCount / count : 0;

  const amounts = itemized.map(r => r.contribution_receipt_amount);
  const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
  const variance = amounts.reduce((s, a) => s + (a - mean) ** 2, 0) / amounts.length;
  const stdDev = Math.sqrt(variance);
  const donationStdDev = mean > 0 ? stdDev / mean : 0;

  const PLATFORM_RE = /^(ACTBLUE|WINRED|ANEDOT)$/i;
  const platformDollars = itemized
    .filter(r => PLATFORM_RE.test((r.contributor_name || '').trim()))
    .reduce((s, r) => s + r.contribution_receipt_amount, 0);
  const totalDollars = itemized.reduce((s, r) => s + r.contribution_receipt_amount, 0);
  const platformOpacity = totalDollars > 0 ? platformDollars / totalDollars : 0;

  return {
    missingEmployerRatio, outOfStatePct, householdBundling,
    donationStdDev, platformOpacity, itemizedCount: count,
    computedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Pull FEC itemized for a single cycle (paginated)
// ---------------------------------------------------------------------------

async function pullItemizedCycle(committeeId: string, cycle: number): Promise<FecScheduleARow[]> {
  const rows: FecScheduleARow[] = [];
  let lastIndex: string | number | undefined;
  let lastAmt: string | number | undefined;
  let page = 0;
  while (page < 50) {
    const params: FecFetchParams = {
      committee_id: committeeId,
      two_year_transaction_period: cycle,
      min_amount: 200,
      per_page: 100,
      sort: '-contribution_receipt_amount',
    };
    if (lastIndex !== undefined) params.last_index = lastIndex;
    if (lastAmt !== undefined) params.last_contribution_receipt_amount = lastAmt;
    const resp = await fecFetch<FecScheduleARow>('/schedules/schedule_a/', params);
    const batch = resp.results || [];
    if (batch.length === 0) break;
    rows.push(...batch);
    const last = resp.pagination?.last_indexes;
    if (!last) break;
    lastIndex = last.last_index as string | number | undefined;
    lastAmt = last.last_contribution_receipt_amount as string | number | undefined;
    page++;
    await sleep(400);
    if (batch.length < 100) break;
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Convert FEC rows → CandDonor shape for roster-match
// ---------------------------------------------------------------------------

function stripSuffixLocal(s: string): string {
  return s.replace(/\b(JR|SR|II|III|IV|V|MD|DO|PHD|ESQ|CPA)\b\.?/g, '').replace(/\s+/g, ' ').trim();
}

function normName(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[.,'"()]/g, ' ').replace(/\s+/g, ' ').trim();
}

function toCandDonors(rows: FecScheduleARow[], cycle: number): CandDonor[] {
  const out: CandDonor[] = [];
  for (const r of rows) {
    if (r.entity_type !== 'IND') continue;
    const raw = stripSuffixLocal(normName(r.contributor_name));
    if (!raw) continue;
    let last = '';
    let first = '';
    if (raw.includes(',')) {
      const [l, rest] = raw.split(',').map(s => s.trim());
      last = l;
      first = (rest || '').split(/\s+/)[0] || '';
    } else {
      const toks = raw.split(/\s+/);
      if (toks.length < 2) continue;
      last = toks[0];
      first = toks[1];
    }
    if (!last || !first) continue;
    out.push({
      last,
      first,
      firstInitial: first[0],
      state: normName(r.contributor_state || ''),
      city: normName(r.contributor_city || ''),
      employer: normName(r.contributor_employer || ''),
      amount: r.contribution_receipt_amount || 0,
      cycle: String(cycle),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dryRun = !argv.includes('--write');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) { console.error('SUPABASE env required'); process.exit(1); }
  if (!FEC_API_KEY) { console.error('FEC_API_KEY required'); process.exit(1); }

  console.log('='.repeat(60));
  console.log(`  REFRESH: ${CANDIDATE_NAME} (${BIOGUIDE_ID})`);
  console.log('='.repeat(60));
  console.log(dryRun ? '  [DRY RUN — no DB write]' : '  [LIVE — will write]');
  console.log('');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: currentRow, error: loadErr } = await supabase
    .from('politicians').select('*').eq('bioguide_id', BIOGUIDE_ID).single();
  if (loadErr || !currentRow) { console.error('Load failed:', loadErr?.message); process.exit(1); }
  console.log(`Loaded: ${currentRow.name}`);
  console.log(`  current score:     ${currentRow.corruption_score}`);
  console.log(`  current tier:      ${currentRow.juice_box_tier}`);
  console.log(`  israel_lobby_tot:  $${(currentRow.israel_lobby_total || 0).toLocaleString()}`);
  console.log(`  aipac_funding:     $${(currentRow.aipac_funding || 0).toLocaleString()}`);
  console.log(`  is_audited:        ${currentRow.is_audited}`);
  console.log('');

  // ---- PILLAR 1: FEC totals (all active cycles) ----
  console.log('--- Pillar 1: FEC totals (all active cycles) ---');
  const totalsResp = await fecFetch<FecTotals>(`/candidate/${FEC_CANDIDATE_ID}/totals/`, { per_page: 10 });
  const allCyclesRaw = totalsResp.results || [];
  // FEC returns both per-cycle and null-cycle aggregate rows; dedupe and drop null.
  const distinctCycles = new Map<number, FecTotals>();
  for (const c of allCyclesRaw) {
    if (!c.cycle) continue;
    if (!distinctCycles.has(c.cycle)) distinctCycles.set(c.cycle, c);
  }
  const allCycles = Array.from(distinctCycles.values()).sort((a, b) => b.cycle - a.cycle);
  const currentCycleTotals = allCycles.find(t => t.cycle === CYCLE) || allCycles[0];
  console.log(`  Distinct cycles: ${allCycles.length}`);
  for (const c of allCycles) {
    const included = ACTIVE_CYCLES.includes(c.cycle);
    console.log(`    ${c.cycle}${included ? ' *' : ''}: receipts $${(c.receipts || 0).toLocaleString()} | PACs $${(c.other_political_committee_contributions || 0).toLocaleString()}`);
  }
  console.log(`  * = included in multi-cycle totals (incumbent re-election scope)`);

  // Aggregate totals across ACTIVE_CYCLES for display/scoring.
  const multiCycleTotals = ACTIVE_CYCLES.reduce<FecTotals>((acc, yr) => {
    const t = distinctCycles.get(yr);
    if (!t) return acc;
    return {
      cycle: yr,
      receipts: acc.receipts + (t.receipts || 0),
      individual_contributions: acc.individual_contributions + (t.individual_contributions || 0),
      individual_itemized_contributions: acc.individual_itemized_contributions + (t.individual_itemized_contributions || 0),
      individual_unitemized_contributions: acc.individual_unitemized_contributions + (t.individual_unitemized_contributions || 0),
      other_political_committee_contributions: acc.other_political_committee_contributions + (t.other_political_committee_contributions || 0),
      last_cash_on_hand_end_period: Math.max(acc.last_cash_on_hand_end_period, t.last_cash_on_hand_end_period || 0),
      transfers_from_other_authorized_committee: (acc.transfers_from_other_authorized_committee || 0) + (t.transfers_from_other_authorized_committee || 0),
    };
  }, { cycle: 0, receipts: 0, individual_contributions: 0, individual_itemized_contributions: 0, individual_unitemized_contributions: 0, other_political_committee_contributions: 0, last_cash_on_hand_end_period: 0, transfers_from_other_authorized_committee: 0 });
  console.log(`  Multi-cycle total (2024+2026): $${multiCycleTotals.receipts.toLocaleString()} receipts | $${multiCycleTotals.other_political_committee_contributions.toLocaleString()} PACs`);
  await sleep(400);

  // ---- PILLAR 2: FEC itemized (all active cycles) ----
  console.log(`\n--- Pillar 2: FEC itemized across ACTIVE cycles ${JSON.stringify(ACTIVE_CYCLES)} (≥$200) ---`);
  const itemizedByCycle: Record<number, FecScheduleARow[]> = {};
  const itemizedAll: FecScheduleARow[] = [];
  for (const cy of ACTIVE_CYCLES) {
    const rows = await pullItemizedCycle(FEC_COMMITTEE_ID, cy);
    itemizedByCycle[cy] = rows;
    itemizedAll.push(...rows);
    console.log(`  cycle ${cy}: ${rows.length} rows`);
  }
  console.log(`  combined rows: ${itemizedAll.length}`);

  // ---- PILLAR 3: FEC IEs (all active cycles) ----
  console.log(`\n--- Pillar 3: Independent expenditures across active cycles ---`);
  const ies: FecScheduleERow[] = [];
  for (const cy of ACTIVE_CYCLES) {
    const ieResp = await fecFetch<FecScheduleERow>('/schedules/schedule_e/', {
      candidate_id: FEC_CANDIDATE_ID, cycle: cy, per_page: 100, sort: '-expenditure_amount',
    });
    await sleep(400);
    const rows = ieResp.results || [];
    ies.push(...rows);
    console.log(`  cycle ${cy}: ${rows.length} IE rows`);
  }
  let ieSupport = 0;
  let ieIsrael = 0;
  const ieByCommittee: Record<string, { name: string; id: string; amount: number; support_oppose: string; is_israel_lobby: boolean }> = {};
  for (const e of ies) {
    const amt = e.expenditure_amount || 0;
    const israel = isIsraelLobby(e.committee_name || '', e.committee_id);
    if (e.support_oppose_indicator === 'S') ieSupport += amt;
    if (israel) ieIsrael += amt;
    const k = e.committee_id;
    if (!ieByCommittee[k]) {
      ieByCommittee[k] = {
        name: e.committee_name, id: e.committee_id, amount: 0,
        support_oppose: e.support_oppose_indicator, is_israel_lobby: israel,
      };
    }
    ieByCommittee[k].amount += amt;
  }
  const topIe = Object.values(ieByCommittee).sort((a, b) => b.amount - a.amount).slice(0, 10);
  console.log(`  IE rows: ${ies.length} | supporting: $${ieSupport.toLocaleString()} | from Israel lobby: $${ieIsrael.toLocaleString()}`);

  // ---- PILLAR 4: PAC aggregation (across all active cycles) ----
  console.log(`\n--- Pillar 4: PAC + AIPAC rollup (across ${JSON.stringify(ACTIVE_CYCLES)}) ---`);
  let aipacCurrent = 0;
  let israelLobbyPacsCurrent = 0;
  const pacDetails: Array<{ pac_id: string; pac_name: string; amount: number; date: string; cycle: number }> = [];
  const byDonor: Record<string, { name: string; amount: number; type: string; is_israel_lobby: boolean }> = {};
  const orgDonors: Record<string, { name: string; amount: number; type: string; is_israel_lobby: boolean }> = {};

  for (const cy of ACTIVE_CYCLES) {
    for (const r of (itemizedByCycle[cy] || [])) {
      const name = (r.contributor_name || '').trim();
      const cid = r.contributor_committee_id || r.contributor_id;
      const israel = isIsraelLobby(name, cid);
      const type = r.entity_type === 'IND' ? 'Individual'
        : r.entity_type === 'ORG' || r.entity_type === 'CCM' ? 'Corporate'
        : r.entity_type === 'PAC' || r.entity_type === 'COM' ? 'PAC'
        : 'Other';
      const amt = r.contribution_receipt_amount || 0;
      if (israel && type === 'PAC') {
        israelLobbyPacsCurrent += amt;
        pacDetails.push({
          pac_id: cid || '',
          pac_name: name,
          amount: amt,
          date: r.contribution_receipt_date,
          cycle: cy,
        });
        if (/AIPAC|AMERICAN ISRAEL/i.test(name)) aipacCurrent += amt;
      }
      const key = name.toUpperCase();
      if (!byDonor[key]) byDonor[key] = { name, amount: 0, type, is_israel_lobby: israel };
      byDonor[key].amount += amt;
      if (type !== 'Individual') {
        if (!orgDonors[key]) orgDonors[key] = { name, amount: 0, type, is_israel_lobby: israel };
        orgDonors[key].amount += amt;
      }
    }
  }
  console.log(`  AIPAC PAC dollars (all active):       $${aipacCurrent.toLocaleString()}`);
  console.log(`  Israel-lobby PAC total (all active):  $${israelLobbyPacsCurrent.toLocaleString()}`);
  console.log(`  PAC detail rows:                      ${pacDetails.length}`);

  const PLATFORM_CONDUIT_RE = /^(ACTBLUE|WINRED|ANEDOT)(\s|,|$)|VICTORY COMMITTEE|JOINT FUNDRAISING/i;
  const isConduit = (n: string): boolean => PLATFORM_CONDUIT_RE.test((n || '').trim());
  const top5Donors = Object.values(byDonor)
    .filter(d => !isConduit(d.name))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);
  const topOrgs = Object.values(orgDonors)
    .filter(d => !isConduit(d.name))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 15);
  console.log('  Top 5 donors (all types, all active cycles):');
  for (const d of top5Donors) {
    console.log(`    $${d.amount.toLocaleString().padStart(10)} — ${d.name}${d.is_israel_lobby ? ' [ISRAEL LOBBY]' : ''}`);
  }

  // ---- PILLAR 5: 49-year bundler crossref (all active cycles) ----
  console.log(`\n--- Pillar 5: 49-year pro-Israel bundler crossref (all active-cycle donors) ---`);
  console.log(`  Loading registry from ${DATA_DIR}...`);
  const master = loadMaster(DATA_DIR);
  console.log(`  registry indexed: ${master.size} unique (last|firstInitial|state)`);

  const candDonors: CandDonor[] = [];
  for (const cy of ACTIVE_CYCLES) {
    candDonors.push(...toCandDonors(itemizedByCycle[cy] || [], cy));
  }
  console.log(`  cand donors (all active cycle individuals): ${candDonors.length}`);
  const matches = crossref(candDonors, master);
  const breakdown = buildBreakdown(matches, candDonors.length, `refresh-friedman.ts:${BIOGUIDE_ID}:cycles-${ACTIVE_CYCLES.join('+')}`);
  console.log(`  matches: ${breakdown.matches} (high: ${breakdown.high_confidence}, med: ${breakdown.medium_confidence})`);
  console.log(`  match rate: ${breakdown.match_rate_pct}%`);
  console.log(`  bundler total to Friedman (${CYCLE}): $${breakdown.to_candidate.toLocaleString()}`);
  console.log(`  these donors career to pro-Israel PACs: $${breakdown.these_donors_to_pro_israel_career.toLocaleString()}`);
  console.log('  Top 5 bundler matches:');
  for (const m of breakdown.top_donors.slice(0, 5)) {
    console.log(`    $${m.to_candidate.toLocaleString().padStart(7)} to Friedman | $${m.to_pro_israel_career.toLocaleString()} career | ${m.name} (${m.state}) [${m.confidence}]`);
  }

  const bundlerTotal = breakdown.to_candidate;
  const israelLobbyTotal = israelLobbyPacsCurrent + ieIsrael + bundlerTotal;

  // ---- PILLAR 6: Forensics (across all active cycles) ----
  console.log(`\n--- Pillar 6: Donor forensics (all active cycles) ---`);
  const forensics = computeDonorForensicsFromFec(itemizedAll, STATE);
  console.log(`  missing_employer: ${(forensics.missingEmployerRatio * 100).toFixed(1)}%`);
  console.log(`  out_of_state:     ${(forensics.outOfStatePct * 100).toFixed(1)}%`);
  console.log(`  household_bundle: ${(forensics.householdBundling * 100).toFixed(2)}%`);
  console.log(`  donation CV:      ${forensics.donationStdDev.toFixed(3)}`);
  console.log(`  platform_opacity: ${(forensics.platformOpacity * 100).toFixed(1)}%`);

  // ---- PILLAR 7: Score v6.5 (multi-cycle ratios for incumbent re-election) ----
  console.log(`\n--- Pillar 7: Corruption score (v6.5, multi-cycle ratios: ${JSON.stringify(ACTIVE_CYCLES)}) ---`);
  const scoringReceipts = multiCycleTotals.receipts;
  const scoringPACs = multiCycleTotals.other_political_committee_contributions;
  const scoringIndivs = multiCycleTotals.individual_contributions;
  const currentCycleReceiptsDisplay = currentCycleTotals?.receipts || 0;

  const cyclesCount = ACTIVE_CYCLES.length;
  console.log(`  scoring window cycles: ${cyclesCount} (${ACTIVE_CYCLES.join(', ')})`);

  const israelLobbyBreakdown = {
    total: israelLobbyTotal,
    pacs: israelLobbyPacsCurrent,
    ie: ieIsrael,
    bundlers: bundlerTotal,
    source: `fec_${ACTIVE_CYCLES.join('+')}+pro_israel_pacs+49yr_bundler_registry`,
    scoring_scope: `incumbent_reelection_multi_cycle:${ACTIVE_CYCLES.join('+')}`,
    snapshot: new Date().toISOString().slice(0, 10),
    cycles_count: cyclesCount,
    active_cycles: ACTIVE_CYCLES,
    pac_details: pacDetails.sort((a, b) => b.amount - a.amount),
    ie_details: topIe.filter(i => i.is_israel_lobby).map(i => ({
      committee_name: i.name, committee_id: i.id, amount: i.amount,
      support_oppose: i.support_oppose, is_israel_lobby: true,
    })),
    individual_registry: breakdown,
  };

  const polForScoring: Politician = {
    id: BIOGUIDE_ID,
    name: currentRow.name,
    office: currentRow.office,
    officeLevel: currentRow.office_level,
    party: currentRow.party,
    jurisdiction: currentRow.jurisdiction,
    jurisdictionType: currentRow.jurisdiction_type,
    corruptionScore: currentRow.corruption_score,
    juiceBoxTier: currentRow.juice_box_tier,
    aipacFunding: aipacCurrent,
    totalFundsRaised: scoringReceipts,
    top5Donors: top5Donors as Politician['top5Donors'],
    contributionBreakdown: {
      aipac: aipacCurrent,
      otherPACs: Math.max(0, scoringPACs - aipacCurrent),
      individuals: scoringIndivs,
      corporate: 0,
    },
    israelLobbyTotal,
    israelLobbyBreakdown,
    isActive: true,
    tags: currentRow.tags || [],
    bio: currentRow.bio,
    socialMedia: SOCIAL_MEDIA,
    source_ids: currentRow.source_ids,
    dataSource: `audit_2026-04-24_fec_${ACTIVE_CYCLES.join('+')}+49yr_bundlers_incumbent_reelection`,
    donorForensics: forensics,
    courtCases: [],
    lobbyingRecords: currentRow.lobbying_records || [],
    votes: currentRow.voting_records || [],
  };
  const score = computeCorruptionScore(polForScoring);
  console.log(`  corruption_score: ${currentRow.corruption_score} → ${score.score} (${score.grade}, ${score.confidence} confidence)`);
  for (const f of score.factors) {
    console.log(`    ${f.key}: raw=${f.rawScore} weight=${f.weight.toFixed(2)} data=${f.dataAvailable}`);
  }

  // ---- PILLAR 8: Juice-box tier ----
  const israelTotalForTier = Math.max(israelLobbyTotal, aipacCurrent);
  const juiceBoxTier: 'none' | 'compromised' | 'bought' | 'owned' =
    israelTotalForTier >= 5_000_000 ? 'owned'
    : israelTotalForTier >= 2_000_000 ? 'bought'
    : israelTotalForTier >= 500_000 ? 'compromised'
    : 'none';
  console.log(`\n  Juice-box tier: ${currentRow.juice_box_tier} → ${juiceBoxTier} (from $${israelTotalForTier.toLocaleString()} Israel capture)`);

  // ---- PILLAR 9: Red-flag merge ----
  const existingSourceIds = (currentRow.source_ids as Record<string, unknown>) || {};
  const existingFlags = (existingSourceIds.red_flags as Array<{ label: string; severity: 'high' | 'med' }>) || [];
  const keptFlags = existingFlags.filter(f => !f.label.includes(ROSTER_MATCH_MARKER));
  const newRosterFlags = buildRedFlags(breakdown, CANDIDATE_NAME);
  const mergedFlags = [...keptFlags, ...newRosterFlags];
  const newSourceIds = {
    ...existingSourceIds,
    fec_candidate_id: FEC_CANDIDATE_ID,
    fec_committee_id: FEC_COMMITTEE_ID,
    red_flags: mergedFlags,
  };
  console.log(`\n  red_flags: kept ${keptFlags.length} non-roster + ${newRosterFlags.length} new roster = ${mergedFlags.length} total`);

  // ---- PILLAR 10: Write artifact ----
  const artifactPath = path.join(OUT_DIR, `${BIOGUIDE_ID}-audit-${new Date().toISOString().slice(0, 10)}.json`);
  const artifact = {
    bioguide_id: BIOGUIDE_ID,
    name: CANDIDATE_NAME,
    fec_candidate_id: FEC_CANDIDATE_ID,
    fec_committee_id: FEC_COMMITTEE_ID,
    cycle: CYCLE,
    generated_at: new Date().toISOString(),
    totals: {
      scoring_receipts_multi_cycle: scoringReceipts,
      current_cycle_receipts: currentCycleReceiptsDisplay,
      israel_lobby_total: israelLobbyTotal,
      aipac_funding: aipacCurrent,
      bundler_total: bundlerTotal,
      ie_israel: ieIsrael,
      match_count: breakdown.matches,
      match_rate_pct: breakdown.match_rate_pct,
      cycles_count: cyclesCount,
      active_cycles: ACTIVE_CYCLES,
    },
    score: { old: currentRow.corruption_score, new: score.score, grade: score.grade },
    tier: { old: currentRow.juice_box_tier, new: juiceBoxTier },
    israel_lobby_breakdown: israelLobbyBreakdown,
    top5_donors: top5Donors,
    forensics,
    red_flags: mergedFlags,
  };

  // ---- DIFF ----
  const newDataSource = `audit_2026-04-24_fec_${ACTIVE_CYCLES.join('+')}+49yr_bundlers_incumbent_reelection`;
  console.log('\n--- Proposed Update ---');
  console.log(`  total_funds:       $${(currentRow.total_funds || 0).toLocaleString()} → $${scoringReceipts.toLocaleString()} (multi-cycle ${ACTIVE_CYCLES.join('+')})`);
  console.log(`  israel_lobby_tot:  $${(currentRow.israel_lobby_total || 0).toLocaleString()} → $${israelLobbyTotal.toLocaleString()}`);
  console.log(`  aipac_funding:     $${(currentRow.aipac_funding || 0).toLocaleString()} → $${aipacCurrent.toLocaleString()}`);
  console.log(`  corruption_score:  ${currentRow.corruption_score} → ${score.score}`);
  console.log(`  juice_box_tier:    ${currentRow.juice_box_tier} → ${juiceBoxTier}`);
  console.log(`  is_audited:        ${currentRow.is_audited} → true`);
  console.log(`  data_source:       ${currentRow.data_source} → ${newDataSource}`);
  console.log(`  cycles_count:      ${currentRow.cycles_count} → ${cyclesCount}`);
  console.log('');

  if (dryRun) {
    fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
    console.log(`[DRY RUN] Artifact: ${artifactPath}`);
    console.log('[DRY RUN] Re-run with --write to persist.');
    return;
  }

  // ---- LIVE WRITE ----
  const updatePayload: Record<string, unknown> = {
    total_funds: scoringReceipts,
    top5_donors: top5Donors,
    contribution_breakdown: polForScoring.contributionBreakdown,
    aipac_funding: aipacCurrent,
    israel_lobby_total: israelLobbyTotal,
    israel_lobby_breakdown: israelLobbyBreakdown,
    corruption_score: score.score,
    grade: score.grade,
    juice_box_tier: juiceBoxTier,
    social_media: SOCIAL_MEDIA,
    source_ids: newSourceIds,
    data_source: newDataSource,
    is_audited: true,
    last_synced: new Date().toISOString(),
    cycles_count: cyclesCount,
    updated_at: new Date().toISOString(),
  };

  // Iteratively drop columns that fail schema-cache lookup. PostgREST returns
  // one missing-column error at a time, so loop until success or we're out of
  // optional columns to strip.
  const OPTIONAL_COLS = ['is_audited', 'cycles_count', 'last_synced', 'grade'] as const;
  const droppedCols: string[] = [];
  let attempt = updatePayload;
  for (let iter = 0; iter < OPTIONAL_COLS.length + 1; iter++) {
    const { error } = await supabase.from('politicians').update(attempt).eq('bioguide_id', BIOGUIDE_ID);
    if (!error) break;
    const msg = error.message || '';
    const missing = OPTIONAL_COLS.find(c => msg.includes(`'${c}'`));
    if (!missing) { console.error(`DB update failed: ${msg}`); process.exit(1); }
    console.warn(`  Dropping absent column '${missing}' and retrying...`);
    const next = { ...attempt };
    delete (next as Record<string, unknown>)[missing];
    attempt = next;
    droppedCols.push(missing);
    if (iter === OPTIONAL_COLS.length) { console.error(`DB update failed after exhausting optional columns: ${msg}`); process.exit(1); }
  }
  if (droppedCols.length > 0) console.log(`DB update succeeded (dropped: ${droppedCols.join(', ')}).`);
  else console.log('DB update succeeded.');

  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
  console.log(`Artifact written: ${artifactPath}`);

  // Tracker append
  const trackerLine = [
    BIOGUIDE_ID,
    `"${CANDIDATE_NAME}"`,
    `"U.S. House of Representatives"`,
    `"Democrat"`,
    `"CA-30"`,
    `"California"`,
    currentRow.corruption_score || 0,
    score.score,
    score.grade,
    score.confidence,
    juiceBoxTier,
    Math.round(scoringReceipts),
    Math.round(aipacCurrent),
    Math.round(israelLobbyTotal),
    pacDetails.length,
    0, // israel_aligned_votes — deferred
    0, // total_israel_votes — deferred
    cyclesCount,
    FEC_CANDIDATE_ID,
    new Date().toISOString(),
  ].join(',');
  fs.appendFileSync(TRACKER_CSV, '\n' + trackerLine);
  console.log(`Tracker appended: ${TRACKER_CSV}`);
}

main().catch(err => { console.error(err); process.exit(1); });

#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Refresh Brian Mast (FL-21, R) full record.
 *
 * Pillars:
 *   1. Court records — CourtListener full-text search
 *   2. Finances     — FEC API for committee C00632257 (MAST FOR CONGRESS)
 *                     pulls PAC contributions, top individual donors, aggregated
 *                     Israel-lobby totals, independent expenditures
 *   3. Social media — verified handles
 *   4. Web intel    — Exa news search
 *   5. Forensics    — donorForensicsScore signals computed from FEC itemized data
 *   6. Corruption   — v5 algorithm
 */

import { createClient } from '@supabase/supabase-js';
import { searchCourtRecords } from '../lib/courtlistener-client';
import { computeCorruptionScore } from '../lib/corruption-score';
import type { Politician, DonorForensics } from '../lib/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BIOGUIDE_ID = '317b2e4e-5dcf-478b-bad4-1518d0fc20c2';
const CANDIDATE_NAME = 'Brian Mast';
const FEC_CANDIDATE_ID = 'H6FL18097';
const FEC_COMMITTEE_ID = 'C00632257'; // MAST FOR CONGRESS (principal)
const CYCLE = 2026;

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const FEC_API_KEY = process.env.FEC_API_KEY || '';
const EXA_API_KEY = process.env.EXA_API_KEY || '';
const COURTLISTENER_TOKEN = process.env.COURTLISTENER_TOKEN || '';

// Israel-lobby PAC committee IDs (federal)
const ISRAEL_LOBBY_COMMITTEE_IDS = new Set([
  'C00104299', // AIPAC PAC
  'C00797472', // AIPAC PAC (newer id)
  'C00791699', // United Democracy Project
  'C00764126', // DMFI PAC
  'C00068692', // NORPAC
  'C00441949', // J Street PAC
  'C00556100', // Republican Jewish Coalition PAC
  'C00368522', // Pro-Israel America PAC
  'C00748475', // Jewish Democratic Council PAC
  'C00488411', // JACPAC
]);

const ISRAEL_LOBBY_NAME_RE = /AIPAC|AMERICAN ISRAEL|NORPAC|DEMOCRATIC MAJORITY FOR ISRAEL|DMFI|UNITED DEMOCRACY PROJECT|PRO-ISRAEL AMERICA|REPUBLICAN JEWISH COALITION|ZIONIST ORGANIZATION|CHRISTIANS UNITED FOR ISRAEL|JACPAC|JEWISH DEMOCRATIC COUNCIL|FRIENDS OF ISRAEL/i;

// Verified Mast social handles (public/press)
const SOCIAL_MEDIA = {
  twitterHandle: 'RepBrianMast',
  facebookPageUrl: 'https://www.facebook.com/repbrianmast',
  instagramHandle: 'repbrianmast',
  youtubeChannelId: '@RepBrianMast',
  campaignWebsite: 'https://brianmast.com',
};

// ---------------------------------------------------------------------------
// FEC client
// ---------------------------------------------------------------------------

interface FecFetchParams { [k: string]: string | number; }
interface FecResponse<T> { results?: T[]; pagination?: { pages: number; per_page: number; count: number; last_indexes?: Record<string, string | number> | null }; }

async function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

async function fecFetch<T>(endpoint: string, params: FecFetchParams): Promise<FecResponse<T>> {
  const url = new URL(`https://api.open.fec.gov/v1${endpoint}`);
  url.searchParams.set('api_key', FEC_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(20000) });
  if (res.status === 429) { await sleep(30_000); return fecFetch(endpoint, params); }
  if (!res.ok) throw new Error(`FEC ${endpoint} ${res.status}`);
  return res.json() as Promise<FecResponse<T>>;
}

// ---------------------------------------------------------------------------
// FEC data types
// ---------------------------------------------------------------------------

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
}

interface FecTotals {
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

  // Household bundling: individuals giving >= 90% of $3500 cap sharing address
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

interface ExaResult { title: string; url: string; publishedDate: string | null; }
async function exaSearch(query: string, numResults = 6): Promise<ExaResult[]> {
  if (!EXA_API_KEY) return [];
  try {
    const res = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': EXA_API_KEY },
      body: JSON.stringify({ query, numResults, type: 'auto', useAutoprompt: true, contents: { text: { maxCharacters: 300 } } }),
    });
    if (!res.ok) return [];
    const data = await res.json() as { results?: Array<Record<string, unknown>> };
    return (data.results || []).map(r => ({
      title: String(r.title || ''),
      url: String(r.url || ''),
      publishedDate: (r.publishedDate as string | null) || null,
    }));
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run') || !argv.includes('--write');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) { console.error('SUPABASE env required'); process.exit(1); }
  if (!FEC_API_KEY) { console.error('FEC_API_KEY required'); process.exit(1); }

  console.log('='.repeat(60));
  console.log(`  REFRESH: ${CANDIDATE_NAME} (${BIOGUIDE_ID})`);
  console.log('='.repeat(60));
  console.log(dryRun ? '  [DRY RUN — no DB write]' : '  [LIVE]');
  console.log('');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: currentRow, error: loadErr } = await supabase
    .from('politicians').select('*').eq('bioguide_id', BIOGUIDE_ID).single();
  if (loadErr || !currentRow) { console.error('Load failed:', loadErr?.message); process.exit(1); }
  console.log(`Loaded: ${currentRow.name} | current score=${currentRow.corruption_score} | aipac=$${currentRow.aipac_funding?.toLocaleString() || 0}\n`);

  // ---- PILLAR 1: COURT RECORDS ----
  console.log('--- Pillar 1: Court Records ---');
  let courtRecords: Record<string, unknown>[] = (currentRow.court_records as Array<Record<string, unknown>> | null) || [];
  try {
    const fresh = await searchCourtRecords(CANDIDATE_NAME, []);
    const mapped = fresh.map(r => ({
      id: r.id, case_name: r.caseName, case_name_short: r.caseNameShort,
      court: r.court, court_id: r.courtId, docket_number: r.docketNumber,
      date_filed: r.dateFiled, date_terminated: r.dateTerminated,
      cause: r.cause, nature_of_suit: r.natureOfSuit, url: r.url, source: r.source,
    }));
    // Dedupe by id
    const seen = new Set<string>();
    const existing = ((currentRow.court_records as Array<{ id: string; source?: string }> | null) || []).filter(r => r.source && r.source !== 'courtlistener');
    courtRecords = [...existing, ...mapped].filter(r => {
      const id = String((r as { id: string }).id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    console.log(`  CourtListener: ${fresh.length} fresh | total: ${courtRecords.length}`);
  } catch (err) {
    console.warn(`  CourtListener error: ${err instanceof Error ? err.message : String(err)}`);
  }
  console.log('');

  // ---- PILLAR 2: FEC ----
  console.log('--- Pillar 2: FEC Campaign Finance (all cycles) ---');
  const allCyclesResp = await fecFetch<FecTotals & { cycle: number }>(`/candidate/${FEC_CANDIDATE_ID}/totals/`, { per_page: 10 });
  const allCycles = allCyclesResp.results || [];
  await sleep(500);
  // Sum receipts and contribution lines across every reported cycle.
  const lifetimeTotals: FecTotals = allCycles.reduce<FecTotals>((acc, t) => ({
    receipts: acc.receipts + (t.receipts || 0),
    individual_contributions: acc.individual_contributions + (t.individual_contributions || 0),
    individual_itemized_contributions: acc.individual_itemized_contributions + (t.individual_itemized_contributions || 0),
    individual_unitemized_contributions: acc.individual_unitemized_contributions + (t.individual_unitemized_contributions || 0),
    other_political_committee_contributions: acc.other_political_committee_contributions + (t.other_political_committee_contributions || 0),
    last_cash_on_hand_end_period: Math.max(acc.last_cash_on_hand_end_period, t.last_cash_on_hand_end_period || 0),
    transfers_from_other_authorized_committee: (acc.transfers_from_other_authorized_committee ?? 0) + (t.transfers_from_other_authorized_committee || 0),
  }), { receipts: 0, individual_contributions: 0, individual_itemized_contributions: 0, individual_unitemized_contributions: 0, other_political_committee_contributions: 0, last_cash_on_hand_end_period: 0, transfers_from_other_authorized_committee: 0 });
  const totals = lifetimeTotals;
  const currentCycleTotals = allCycles.find(t => t.cycle === CYCLE) || allCycles[0];
  console.log(`  Cycles found: ${allCycles.length}`);
  for (const c of allCycles) console.log(`    ${c.cycle}: $${(c.receipts || 0).toLocaleString()} receipts, $${(c.other_political_committee_contributions || 0).toLocaleString()} PACs`);
  console.log(`  LIFETIME receipts: $${totals.receipts.toLocaleString()} | indiv $${totals.individual_contributions.toLocaleString()} | PACs $${totals.other_political_committee_contributions.toLocaleString()}`);
  console.log(`  Current cycle (${CYCLE}): $${(currentCycleTotals.receipts || 0).toLocaleString()}`);

  // Pull itemized contributions across every cycle we have totals for so
  // Israel-lobby aggregation reflects career dollars, not just this cycle.
  const CYCLES_TO_PULL = Array.from(new Set(allCycles.map(c => c.cycle).filter(Boolean))).sort((a, b) => b - a);
  console.log(`  Paginating itemized donors (≥$200) for cycles: ${CYCLES_TO_PULL.join(', ')}`);
  const itemized: FecScheduleARow[] = [];
  const itemizedCurrentCycle: FecScheduleARow[] = [];
  for (const cycleYear of CYCLES_TO_PULL) {
    let lastIndex: string | number | undefined;
    let lastContributionAmount: string | number | undefined;
    let page = 0;
    const before = itemized.length;
    while (page < 25) {
      const params: FecFetchParams = {
        committee_id: FEC_COMMITTEE_ID,
        two_year_transaction_period: cycleYear,
        min_amount: 200,
        per_page: 100,
        sort: '-contribution_receipt_amount',
      };
      if (lastIndex !== undefined) params.last_index = lastIndex;
      if (lastContributionAmount !== undefined) params.last_contribution_receipt_amount = lastContributionAmount;
      const resp = await fecFetch<FecScheduleARow>('/schedules/schedule_a/', params);
      const rows = resp.results || [];
      if (rows.length === 0) break;
      itemized.push(...rows);
      if (cycleYear === CYCLE) itemizedCurrentCycle.push(...rows);
      const last = resp.pagination?.last_indexes;
      if (!last) break;
      lastIndex = last.last_index as string | number | undefined;
      lastContributionAmount = last.last_contribution_receipt_amount as string | number | undefined;
      page++;
      await sleep(400);
      if (rows.length < 100) break;
    }
    console.log(`    cycle ${cycleYear}: ${itemized.length - before} rows`);
  }
  console.log(`  Itemized pulled total: ${itemized.length} rows (current cycle: ${itemizedCurrentCycle.length})`);

  // Classify donors — accumulate both lifetime (for display) and current-cycle
  // (for scoring) Israel-lobby totals. The scorer math penalizes by *ratio*,
  // so using lifetime totals would dilute the signal for a candidate who has
  // been AIPAC-backed across every cycle.
  let aipacLifetime = 0;
  let israelLobbyLifetime = 0;
  let israelLobbyPacsLifetime = 0;
  let aipacCurrent = 0;
  let israelLobbyCurrent = 0;
  const byDonor: Record<string, { name: string; amount: number; type: string; is_israel_lobby: boolean }> = {};
  const orgDonors: Record<string, { name: string; amount: number; type: string; is_israel_lobby: boolean }> = {};

  for (const row of itemized) {
    const name = (row.contributor_name || '').trim();
    const isIsrael = isIsraelLobby(name, row.contributor_committee_id || row.contributor_id);
    const type = row.entity_type === 'IND' ? 'Individual'
      : row.entity_type === 'ORG' || row.entity_type === 'CCM' ? 'Corporate'
      : row.entity_type === 'PAC' || row.entity_type === 'COM' ? 'PAC'
      : 'Other';
    const amt = row.contribution_receipt_amount || 0;

    if (isIsrael) {
      israelLobbyLifetime += amt;
      if (type === 'PAC') israelLobbyPacsLifetime += amt;
      if (/AIPAC|AMERICAN ISRAEL/i.test(name)) aipacLifetime += amt;
    }

    const key = name.toUpperCase();
    if (!byDonor[key]) byDonor[key] = { name, amount: 0, type, is_israel_lobby: isIsrael };
    byDonor[key].amount += amt;

    if (type !== 'Individual') {
      if (!orgDonors[key]) orgDonors[key] = { name, amount: 0, type, is_israel_lobby: isIsrael };
      orgDonors[key].amount += amt;
    }
  }

  // Current-cycle Israel-lobby aggregation (scorer uses these directly).
  for (const row of itemizedCurrentCycle) {
    const name = (row.contributor_name || '').trim();
    const isIsrael = isIsraelLobby(name, row.contributor_committee_id || row.contributor_id);
    const amt = row.contribution_receipt_amount || 0;
    if (isIsrael) {
      israelLobbyCurrent += amt;
      if (/AIPAC|AMERICAN ISRAEL/i.test(name)) aipacCurrent += amt;
    }
  }

  const aipac = aipacLifetime;
  const israelLobbyTotal = israelLobbyLifetime;
  const israelLobbyPacs = israelLobbyPacsLifetime;

  const top5Donors = Object.values(byDonor).sort((a, b) => b.amount - a.amount).slice(0, 5);
  const topOrgs = Object.values(orgDonors).sort((a, b) => b.amount - a.amount).slice(0, 15);

  console.log(`  AIPAC-only total:           $${aipac.toLocaleString()}`);
  console.log(`  Israel lobby grand total:   $${israelLobbyTotal.toLocaleString()}`);
  console.log(`  Israel lobby PAC dollars:   $${israelLobbyPacs.toLocaleString()}`);
  console.log('  Top organizational donors (2026 cycle):');
  for (const o of topOrgs.slice(0, 10)) {
    console.log(`    $${o.amount.toLocaleString().padStart(10)} — ${o.name} (${o.type})${o.is_israel_lobby ? ' [ISRAEL LOBBY]' : ''}`);
  }
  console.log('  Top 5 donors (all types):');
  for (const d of top5Donors) {
    console.log(`    $${d.amount.toLocaleString().padStart(10)} — ${d.name}${d.is_israel_lobby ? ' [ISRAEL LOBBY]' : ''}`);
  }
  console.log('');

  // Independent expenditures
  console.log('  Pulling IEs for/against Mast...');
  const ieResp = await fecFetch<FecScheduleERow>('/schedules/schedule_e/', {
    candidate_id: FEC_CANDIDATE_ID, cycle: CYCLE, per_page: 100, sort: '-expenditure_amount',
  });
  await sleep(500);
  const ies = ieResp.results || [];
  let ieSupport = 0;
  let ieIsrael = 0;
  const ieByCommittee: Record<string, { name: string; id: string; amount: number; support_oppose: string; is_israel_lobby: boolean }> = {};
  for (const e of ies) {
    const amt = e.expenditure_amount || 0;
    const isIsrael = isIsraelLobby(e.committee_name || '', e.committee_id);
    if (e.support_oppose_indicator === 'S') ieSupport += amt;
    if (isIsrael) ieIsrael += amt;
    const key = e.committee_id;
    if (!ieByCommittee[key]) ieByCommittee[key] = { name: e.committee_name, id: e.committee_id, amount: 0, support_oppose: e.support_oppose_indicator, is_israel_lobby: isIsrael };
    ieByCommittee[key].amount += amt;
  }
  const topIe = Object.values(ieByCommittee).sort((a, b) => b.amount - a.amount).slice(0, 10);
  console.log(`  IE rows: ${ies.length} | IE supporting Mast: $${ieSupport.toLocaleString()} | IE from Israel lobby: $${ieIsrael.toLocaleString()}`);
  for (const ie of topIe.slice(0, 5)) {
    console.log(`    $${ie.amount.toLocaleString().padStart(10)} — ${ie.name} [${ie.support_oppose}]${ie.is_israel_lobby ? ' [ISRAEL LOBBY]' : ''}`);
  }
  console.log('');

  const contribution_breakdown = {
    aipac,
    otherPACs: Math.max(0, totals.other_political_committee_contributions - aipac),
    individuals: totals.individual_contributions,
    corporate: 0,
  };

  // ---- PILLAR 3: SOCIAL ----
  console.log('--- Pillar 3: Social Media ---');
  for (const [k, v] of Object.entries(SOCIAL_MEDIA)) console.log(`  ${k}: ${v}`);
  console.log('');

  // ---- PILLAR 4: WEB INTEL ----
  console.log('--- Pillar 4: Web Intel (Exa) ---');
  const news = EXA_API_KEY
    ? await exaSearch(`"Brian Mast" FL-21 Congress ethics OR investigation OR conflict OR indictment OR lobby`, 8)
    : [];
  console.log(`  Articles: ${news.length}`);
  for (const n of news.slice(0, 5)) console.log(`    - ${n.title} (${n.publishedDate || '?'})`);
  console.log('');

  // ---- PILLAR 5: FORENSICS ----
  // Compute forensics over the CURRENT cycle only — stale prior-cycle
  // patterns aren't meaningful for today's race.
  console.log('--- Pillar 5: Donor Forensics (current cycle) ---');
  const forensics = computeDonorForensicsFromFec(itemizedCurrentCycle, 'FL');
  console.log(`  missing_employer: ${(forensics.missingEmployerRatio * 100).toFixed(1)}%`);
  console.log(`  out_of_state:     ${(forensics.outOfStatePct * 100).toFixed(1)}%`);
  console.log(`  household_bundle: ${(forensics.householdBundling * 100).toFixed(2)}%`);
  console.log(`  donation CV:      ${forensics.donationStdDev.toFixed(3)}`);
  console.log(`  platform_opacity: ${(forensics.platformOpacity * 100).toFixed(1)}%`);
  console.log('');

  // ---- PILLAR 6: CORRUPTION SCORE ----
  // Scorer is ratio-based (Israel-lobby $ ÷ total raised). Using lifetime
  // totals dilutes the signal across cycles where AIPAC backed him; using
  // current-cycle totals reflects how AIPAC-heavy the 2026 race is. Store
  // lifetime values in the breakdown for display.
  console.log('--- Pillar 6: Corruption Score (v5, current-cycle ratios) ---');
  const currentCycleContributionBreakdown = {
    aipac: aipacCurrent,
    otherPACs: Math.max(0, (currentCycleTotals.other_political_committee_contributions || 0) - aipacCurrent),
    individuals: currentCycleTotals.individual_contributions || 0,
    corporate: 0,
  };
  console.log(`  Scorer inputs:  total=$${(currentCycleTotals.receipts || 0).toLocaleString()} | aipac=$${aipacCurrent.toLocaleString()} | israel_total=$${israelLobbyCurrent.toLocaleString()}`);
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
    totalFundsRaised: currentCycleTotals.receipts || 0,
    top5Donors: top5Donors as Politician['top5Donors'],
    contributionBreakdown: currentCycleContributionBreakdown,
    israelLobbyTotal: israelLobbyCurrent,
    israelLobbyBreakdown: {
      total: israelLobbyTotal,
      pacs: israelLobbyPacs,
      ie: ieIsrael,
      bundlers: 0,
      ie_details: topIe.filter(i => i.is_israel_lobby).map(i => ({ committee_name: i.name, committee_id: i.id, amount: i.amount, support_oppose: i.support_oppose, is_israel_lobby: true })),
    },
    isActive: true,
    tags: currentRow.tags || [],
    bio: currentRow.bio,
    socialMedia: SOCIAL_MEDIA,
    source_ids: currentRow.source_ids,
    dataSource: 'fec_api_v5',
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
  console.log('');

  // ---- DIFF + WRITE ----
  console.log('--- Proposed Update ---');
  console.log(`  total_funds:       $${currentRow.total_funds?.toLocaleString() || 0} → $${(currentCycleTotals.receipts || 0).toLocaleString()} (current cycle; lifetime $${totals.receipts.toLocaleString()})`);
  console.log(`  aipac_funding:     $${currentRow.aipac_funding?.toLocaleString() || 0} → $${aipacCurrent.toLocaleString()} (current cycle; lifetime $${aipacLifetime.toLocaleString()})`);
  console.log(`  israel_lobby_tot:  $${currentRow.israel_lobby_total?.toLocaleString() || 0} → $${israelLobbyCurrent.toLocaleString()} (current cycle; lifetime $${israelLobbyLifetime.toLocaleString()})`);
  console.log(`  corruption_score:  ${currentRow.corruption_score} → ${score.score}`);
  console.log(`  court_records:     ${(currentRow.court_records || []).length} → ${courtRecords.length}`);
  console.log(`  top5_donors:       ${(currentRow.top5_donors || []).length} → ${top5Donors.length}`);
  console.log('');

  if (dryRun) {
    console.log('[DRY RUN] Re-run with --write to persist.');
    return;
  }

  const { error } = await supabase.from('politicians').update({
    total_funds: currentCycleTotals.receipts || 0,
    top5_donors: top5Donors,
    contribution_breakdown: currentCycleContributionBreakdown,
    aipac_funding: aipacCurrent,
    israel_lobby_total: israelLobbyCurrent,
    israel_lobby_breakdown: polForScoring.israelLobbyBreakdown,
    court_records: courtRecords,
    social_media: SOCIAL_MEDIA,
    corruption_score: score.score,
    data_source: 'fec_api_v5',
    updated_at: new Date().toISOString(),
  }).eq('bioguide_id', BIOGUIDE_ID);
  if (error) { console.error(`DB update failed: ${error.message}`); process.exit(1); }
  console.log('DB update succeeded.');
}

main().catch(err => { console.error(err); process.exit(1); });

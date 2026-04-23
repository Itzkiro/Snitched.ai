#!/usr/bin/env npx tsx
/**
 * Full FEC audit + DB seed for Jerrad Christian (D, OH-12 challenger to
 * Rep. Troy Balderson). FEC H4OH12080 / principal committee C00851956
 * "CITIZENS FOR J CHRISTIAN" (2024+2026 cycles).
 *
 * Policy (per feedback memory 2026-04-22): scoring uses CURRENT CYCLE ONLY;
 * historical (pre-2026) data lives in source_ids.historical_breakdown.
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { loadMaster, parseName, crossref, type CandDonor } from '../lib/roster-match';
import { computeCorruptionScore } from '../lib/corruption-score';
import type { Politician } from '../lib/types';

const FEC = process.env.FEC_API_KEY || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!FEC) throw new Error('FEC_API_KEY missing');
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('SUPABASE env missing');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONDUIT_RE = /^(WINRED|ACTBLUE|ANEDOT)(\s|,|$)/i;

const BIOGUIDE_ID = 'oh-house-2026-jerrad-christian';
const FEC_CANDIDATE_ID = 'H4OH12080';
const COMMITTEES = ['C00851956'];
const CYCLES_ALL = [2024, 2026];
const CURRENT_CYCLE = 2026;

const ISRAEL_LOBBY_COMMITTEE_IDS = new Set([
  'C00104299','C00797472','C00797670',
  'C00368522','C00699470','C00740936','C00687657','C90019431',
  'C00556100','C00345132','C30001374','C90012063',
  'C00764126','C90022864',
  'C00441949','C00068692','C00247403','C00127811',
  'C00139659','C00488411',
  'C00141747','C00458935','C00265470',
  'C00748475','C00306670','C00268334','C90014747',
  'C00202481','C00791699','C00277228','C00503250','C00524652',
]);
const ISRAEL_NAME_RE = /AIPAC|AMERICAN ISRAEL|NORPAC|DEMOCRATIC MAJORITY FOR ISRAEL|DMFI|UNITED DEMOCRACY PROJECT|PRO-ISRAEL AMERICA|REPUBLICAN JEWISH COALITION|ZIONIST ORGANIZATION|JACPAC|JEWISH DEMOCRATIC COUNCIL|JEWISH REPUBLICAN|FRIENDS OF ISRAEL|FIPAC|ALLIES FOR ISRAEL|ISRAEL ALLIANCE|J STREET|JOINT ACTION COMMITTEE FOR POLITICAL|U\.?S\.? ISRAEL/i;

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
  if (!res.ok) throw new Error(`FEC ${endpoint} ${res.status}`);
  return res.json() as Promise<{ results?: T[]; pagination?: { last_indexes?: Record<string, unknown> | null } }>;
}

async function pullAll(committeeId: string, cycle: number, isIndividual: boolean): Promise<Row[]> {
  const rows: Row[] = [];
  let lastIdx: unknown, lastAmt: unknown;
  for (let page = 0; page < 80; page++) {
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
    await sleep(350);
  }
  return rows;
}

async function main(): Promise<void> {
  console.log('=== JERRAD CHRISTIAN (D, OH-12) AUDIT ===');
  const s = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Totals per cycle
  const totals: Record<string, unknown>[] = [];
  for (const cid of COMMITTEES) {
    const r = await fec<Record<string, unknown>>(`/committee/${cid}/totals/`, { per_page: 10 });
    for (const t of r.results || []) totals.push({ committee_id: cid, ...t });
    await sleep(400);
  }
  console.log(`Committee totals rows: ${totals.length}`);
  for (const t of totals) {
    console.log(`  ${t.committee_id} ${t.cycle}: receipts=$${Number(t.receipts || 0).toLocaleString()} | inds=$${Number(t.individual_contributions || 0).toLocaleString()} | pacs=$${Number(t.other_political_committee_contributions || 0).toLocaleString()} | cand=$${Number(t.candidate_contribution || 0).toLocaleString()}`);
  }

  // Schedule A — pull all cycles to split current vs historical
  const allInd: Array<Row & { cycle: number }> = [];
  const allPac: Array<Row & { cycle: number }> = [];
  for (const cid of COMMITTEES) {
    for (const cy of CYCLES_ALL) {
      const inds = await pullAll(cid, cy, true);
      const pacs = await pullAll(cid, cy, false);
      allInd.push(...inds.map(r => ({ ...r, cycle: cy })));
      allPac.push(...pacs.map(r => ({ ...r, cycle: cy })));
      console.log(`  ${cid} ${cy}: ${inds.length} inds, ${pacs.length} non-inds`);
    }
  }

  // Split current vs historical
  function classify(pacRows: typeof allPac) {
    const real = pacRows.filter(r => !CONDUIT_RE.test((r.contributor_name || '').trim()));
    const conduit = pacRows.filter(r => CONDUIT_RE.test((r.contributor_name || '').trim()));
    let israelTotal = 0;
    const israelList: Array<{ date: string; amount: number; name: string; id: string }> = [];
    const pacAgg = new Map<string, { name: string; id: string; total: number; count: number; is_israel: boolean }>();
    for (const r of real) {
      const id = r.contributor_committee_id || r.contributor_id || '';
      const name = (r.contributor_name || '').trim();
      const amt = r.contribution_receipt_amount || 0;
      const isIsrael = (id && ISRAEL_LOBBY_COMMITTEE_IDS.has(id)) || ISRAEL_NAME_RE.test(name);
      if (isIsrael) { israelTotal += amt; israelList.push({ date: r.contribution_receipt_date || '', amount: amt, name, id }); }
      const key = id || name;
      const cur = pacAgg.get(key);
      if (cur) { cur.total += amt; cur.count++; }
      else pacAgg.set(key, { name, id, total: amt, count: 1, is_israel: isIsrael });
    }
    return { real, conduit, israelTotal, israelList, pacAgg: [...pacAgg.values()].sort((a, b) => b.total - a.total) };
  }

  const currentPac = classify(allPac.filter(r => r.cycle === CURRENT_CYCLE));
  const historicalPac = classify(allPac.filter(r => r.cycle !== CURRENT_CYCLE));

  const currentInd = allInd.filter(r => r.cycle === CURRENT_CYCLE);
  const historicalInd = allInd.filter(r => r.cycle !== CURRENT_CYCLE);

  console.log(`\nCURRENT (2026) — inds: ${currentInd.length} rows / $${currentInd.reduce((s,r)=>s+(r.contribution_receipt_amount||0),0).toFixed(0)}`);
  console.log(`  real PACs: ${currentPac.real.length} / $${currentPac.real.reduce((s,r)=>s+(r.contribution_receipt_amount||0),0).toFixed(0)} | israel PACs: $${currentPac.israelTotal}`);
  console.log(`  real PAC breakdown (current cycle):`);
  for (const p of currentPac.pacAgg.slice(0, 20)) {
    console.log(`    $${p.total.toFixed(0).padStart(8)} (${p.count}x) | ${p.name.slice(0,45).padEnd(45)} | ${p.id}${p.is_israel ? ' [ISRAEL]' : ''}`);
  }

  console.log(`\nHISTORICAL (pre-2026) — inds: ${historicalInd.length} rows / $${historicalInd.reduce((s,r)=>s+(r.contribution_receipt_amount||0),0).toFixed(0)}`);
  console.log(`  real PACs: ${historicalPac.real.length} / $${historicalPac.real.reduce((s,r)=>s+(r.contribution_receipt_amount||0),0).toFixed(0)} | israel PACs: $${historicalPac.israelTotal}`);

  // Top individual donors (current cycle)
  const currentIndAgg = new Map<string, { name: string; state: string; employer: string; occupation: string; total: number; count: number }>();
  for (const r of currentInd) {
    const name = (r.contributor_name || '').trim().toUpperCase();
    const st = (r.contributor_state || '').toUpperCase();
    const key = `${name}|${st}`;
    const cur = currentIndAgg.get(key);
    const amt = r.contribution_receipt_amount || 0;
    if (cur) { cur.total += amt; cur.count++; }
    else currentIndAgg.set(key, { name, state: st, employer: (r.contributor_employer || '').toUpperCase(), occupation: (r.contributor_occupation || '').toUpperCase(), total: amt, count: 1 });
  }
  const topCurrentInd = [...currentIndAgg.values()].sort((a, b) => b.total - a.total);
  console.log(`\nTop 15 individual donors (2026 cycle):`);
  for (const d of topCurrentInd.slice(0, 15)) {
    console.log(`  $${d.total.toFixed(0).padStart(8)} (${d.count}x) | ${d.name.slice(0,30).padEnd(30)} | ${d.state} | ${d.employer.slice(0,25)}`);
  }

  // Registry crossref — all cycles (but label as historical since registry is 49-year)
  console.log(`\nLoading pro-Israel registry...`);
  const master = loadMaster(DATA_DIR);
  console.log(`  ${master.size} donors indexed`);

  const candDonors: CandDonor[] = [];
  for (const r of allInd) {
    if (r.entity_type && r.entity_type !== 'IND') continue;
    const raw = (r.contributor_name || '').trim();
    if (!raw) continue;
    const p = parseName(raw);
    if (!p || !p.last || !p.first) continue;
    candDonors.push({
      rawName: raw, last: p.last, first: p.first, firstInitial: p.firstInitial,
      state: (r.contributor_state || '').toUpperCase().trim(),
      city: (r.contributor_city || '').toUpperCase().trim(),
      employer: (r.contributor_employer || '').toUpperCase().trim(),
      occupation: (r.contributor_occupation || '').toUpperCase().trim(),
      amount: r.contribution_receipt_amount || 0,
      date: r.contribution_receipt_date || '',
      cycle: String(r.cycle),
    });
  }
  const candDonorsCurrent = candDonors.filter(d => d.cycle === String(CURRENT_CYCLE));
  const matchesAll = crossref(candDonors, master);
  const matchesCurrent = crossref(candDonorsCurrent, master);
  const highAll = matchesAll.filter(m => m.confidence === 'high');
  const highCurrent = matchesCurrent.filter(m => m.confidence === 'high');
  const matchAllSum = matchesAll.reduce((s, m) => s + m.candidateTotal, 0);
  const matchCurSum = matchesCurrent.reduce((s, m) => s + m.candidateTotal, 0);
  console.log(`\nRegistry crossref (all cycles): ${matchesAll.length} matches (${highAll.length} high) / $${matchAllSum.toFixed(0)} to candidate`);
  console.log(`Registry crossref (2026 only):  ${matchesCurrent.length} matches (${highCurrent.length} high) / $${matchCurSum.toFixed(0)} to candidate`);
  if (matchesCurrent.length > 0) {
    console.log(`Top current-cycle matches:`);
    for (const m of matchesCurrent.slice(0, 10)) {
      console.log(`  ${m.confidence.padEnd(6)} | $${m.candidateTotal.toFixed(0).padStart(8)} to Christian | $${m.proIsraelTotal.toLocaleString().padStart(12)} lifetime | ${m.donorName}, ${m.state}`);
    }
  }

  // Compute score on CURRENT CYCLE ONLY
  const currentTotals = totals.filter(t => Number(t.cycle) === CURRENT_CYCLE);
  const currentReceipts = currentTotals.reduce((s, t) => s + (Number(t.receipts) || 0), 0);
  const currentIndividuals = currentTotals.reduce((s, t) => s + (Number(t.individual_contributions) || 0), 0);
  const currentPacsFromTotals = currentTotals.reduce((s, t) => s + (Number(t.other_political_committee_contributions) || 0), 0);
  const currentCandContrib = currentTotals.reduce((s, t) => s + (Number(t.candidate_contribution) || 0), 0);

  const allReceipts = totals.reduce((s, t) => s + (Number(t.receipts) || 0), 0);
  const allCandContrib = totals.reduce((s, t) => s + (Number(t.candidate_contribution) || 0), 0);

  const tier: 'none' | 'compromised' | 'bought' | 'owned' =
    currentPac.israelTotal >= 5_000_000 ? 'owned'
    : currentPac.israelTotal >= 2_000_000 ? 'bought'
    : currentPac.israelTotal >= 500_000 ? 'compromised'
    : 'none';

  const top5Ind = topCurrentInd.slice(0, 5).map(d => ({
    name: d.name, type: 'Individual' as const, amount: Math.round(d.total), is_israel_lobby: false,
  }));

  const pol: Politician = {
    id: BIOGUIDE_ID, name: 'Jerrad Christian', office: 'U.S. House', officeLevel: 'Federal Representative',
    party: 'Democratic', jurisdiction: 'Ohio', jurisdictionType: 'federal_congressional',
    corruptionScore: 0, juiceBoxTier: tier,
    aipacFunding: 0, totalFundsRaised: Math.round(currentReceipts),
    top5Donors: top5Ind,
    contributionBreakdown: {
      aipac: 0, corporate: 0,
      otherPACs: Math.round(currentPacsFromTotals),
      individuals: Math.round(currentIndividuals),
      self_funding: Math.round(currentCandContrib),
      pro_israel_pacs: Math.round(currentPac.israelTotal),
    },
    israelLobbyTotal: currentPac.israelTotal,
    israelLobbyBreakdown: {
      total: currentPac.israelTotal,
      pacs: currentPac.israelTotal,
      ie: 0, bundlers: 0,
      pac_details: currentPac.pacAgg.filter(p => p.is_israel).map(p => ({ name: p.name, fec_id: p.id, amount: p.total, count: p.count })),
      registry_match_total_current: Math.round(matchCurSum),
      registry_match_count_current: matchesCurrent.length,
    },
    isActive: false, tags: ['candidate', '2026-primary', 'challenger'], bio: '',
    socialMedia: {}, source_ids: { fec_candidate_id: FEC_CANDIDATE_ID, principal_committee_id: COMMITTEES[0] },
    dataSource: 'audit_jerrad_christian_2026-04-23', courtCases: [], lobbyingRecords: [], votes: [],
  };

  const result = computeCorruptionScore(pol);
  console.log(`\n=== SCORE (current-cycle-only) ===`);
  console.log(`Score: ${result.score}/100 | Grade: ${result.grade} | Tier: ${tier}`);

  const positiveFlags: string[] = [];
  const redFlags: Array<{ label: string; severity: 'high' | 'med' | 'low' }> = [];

  if (currentPac.israelTotal === 0) {
    positiveFlags.push('[fec 2026-cycle] $0 in pro-Israel PAC contributions in current (2026) cycle.');
  } else {
    redFlags.push({ label: `[fec 2026-cycle] $${currentPac.israelTotal.toFixed(0)} from pro-Israel PACs in 2026 cycle (${currentPac.israelList.length} rows).`, severity: 'high' });
  }
  if (currentPacsFromTotals === 0) {
    positiveFlags.push(`[fec 2026-cycle] $0 in external PAC money — 2026 campaign is 100% individual-donor + self-funded.`);
  }
  if (matchesCurrent.length === 0) {
    positiveFlags.push(`[registry 2026-cycle] 0 of ${currentIndAgg.size} unique individual donors match the 49-year pro-Israel registry.`);
  } else if (matchCurSum < 1000 || matchCurSum / Math.max(currentIndividuals, 1) < 0.02) {
    positiveFlags.push(`[registry 2026-cycle] ${matchesCurrent.length} donors match registry but total only $${matchCurSum.toFixed(0)} to candidate (${(matchCurSum/Math.max(currentIndividuals,1)*100).toFixed(2)}% of individuals) — no capture signal.`);
  }

  const historicalBreakdown = {
    all_cycles_receipts: Math.round(allReceipts),
    all_cycles_self_funding: Math.round(allCandContrib),
    cycles: CYCLES_ALL,
    pre_current_cycle_individuals: historicalInd.length,
    pre_current_cycle_israel_pacs: historicalPac.israelTotal,
    pre_current_cycle_real_pac_sum: historicalPac.real.reduce((s, r) => s + (r.contribution_receipt_amount || 0), 0),
    registry_matches_all_cycles: matchesAll.length,
    registry_high_confidence_all_cycles: highAll.length,
    registry_match_all_cycles_to_candidate: Math.round(matchAllSum),
  };

  // Upsert DB
  const nowIso = new Date().toISOString();
  const { data: existing } = await s.from('politicians').select('bioguide_id').eq('bioguide_id', BIOGUIDE_ID).maybeSingle();

  const payload = {
    bioguide_id: BIOGUIDE_ID,
    name: 'Jerrad Christian',
    office: 'U.S. House',
    office_level: 'Federal Representative',
    party: 'Democratic',
    district: 'District 12',
    jurisdiction: 'Ohio',
    jurisdiction_type: 'federal_congressional',
    photo_url: null,
    corruption_score: result.score,
    aipac_funding: 0,
    juice_box_tier: tier,
    total_funds: Math.round(currentReceipts),
    top5_donors: top5Ind,
    israel_lobby_total: Math.round(currentPac.israelTotal),
    israel_lobby_breakdown: pol.israelLobbyBreakdown,
    contribution_breakdown: pol.contributionBreakdown,
    is_active: false,
    is_candidate: true,
    running_for: 'U.S. House OH-12 (2026)',
    years_in_office: 0,
    bio: 'Democratic challenger for U.S. House Ohio District 12 in 2026 against incumbent Rep. Troy Balderson. FEC candidate ID H4OH12080 / principal committee C00851956 "CITIZENS FOR J CHRISTIAN" (active 2024+2026 cycles).',
    term_start: null, term_end: null,
    social_media: {},
    source_ids: {
      fec_candidate_id: FEC_CANDIDATE_ID,
      principal_committee_id: COMMITTEES[0],
      donation_status: currentPac.israelTotal === 0
        ? 'GRASSROOTS / NO PRO-ISRAEL PAC MONEY (2026 CYCLE)'
        : `SOME PRO-ISRAEL PAC MONEY ($${currentPac.israelTotal.toFixed(0)} in 2026 cycle)`,
      positive_flags: positiveFlags,
      red_flags: redFlags,
      historical_breakdown: historicalBreakdown,
    },
    data_source: 'audit_jerrad_christian_2026-04-23',
    lobbying_records: [], voting_records: [], court_records: [],
    updated_at: nowIso,
  };

  if (existing) {
    await s.from('politicians').update(payload).eq('bioguide_id', BIOGUIDE_ID);
    console.log(`\nUPDATED row ${BIOGUIDE_ID}`);
  } else {
    await s.from('politicians').insert({ ...payload, created_at: nowIso });
    console.log(`\nINSERTED row ${BIOGUIDE_ID}`);
  }

  // Artifact
  const out = path.join(DATA_DIR, 'oh12-jerrad-christian-audit.json');
  fs.writeFileSync(out, JSON.stringify({
    generated_at: nowIso,
    candidate: { name: 'Jerrad Christian', party: 'D', state: 'OH', district: '12', fec_candidate_id: FEC_CANDIDATE_ID, committees: COMMITTEES },
    totals,
    current_cycle: {
      cycle: CURRENT_CYCLE,
      receipts: currentReceipts,
      individuals: currentIndividuals,
      pacs: currentPacsFromTotals,
      self_funding: currentCandContrib,
      israel_pac_total: currentPac.israelTotal,
      israel_pac_rows: currentPac.israelList,
      top_pacs: currentPac.pacAgg,
      top_individuals: topCurrentInd.slice(0, 25),
      registry_matches: matchesCurrent.length,
      registry_high: highCurrent.length,
      registry_match_to_candidate: matchCurSum,
    },
    historical_breakdown: historicalBreakdown,
    score: result.score, grade: result.grade, confidence: result.confidence, juice_box_tier: tier,
    positive_flags: positiveFlags, red_flags: redFlags,
  }, null, 2));
  console.log(`Artifact: ${out}`);
}

main().catch(e => { console.error(e); process.exit(1); });

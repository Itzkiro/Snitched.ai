#!/usr/bin/env npx tsx
/**
 * OH-12 D-primary audit (May 5, 2026): Daniel Crawford + Jason Reynard.
 * Jerrad Christian already audited via scripts/audit-jerrad-christian.ts.
 *
 * Crawford: FEC H6OH12143 / principal committee C00934372 "CITIZENS FOR
 *   DANIEL CRAWFORD". Newly registered 2026-01-13. Community-activist run.
 * Reynard:  Newark, OH (165 N Twenty First St, 43055). NO FEC filing
 *   (sub-$5K threshold). Treat as $0 grassroots / no PAC capture possible.
 *
 * Policy: 2026-cycle-only scoring. Both are first-time candidates; their
 * current cycle is their only cycle. No historical-bundler stripping needed.
 *
 * Also removes the duplicate Christian row oh-house-12-2026-jerrad-shane-christian
 * (auto-seed from earlier sync) — the canonical row is oh-house-2026-jerrad-christian.
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

const DRY_RUN = !process.argv.includes('--write');
const DATA_DIR = path.join(__dirname, '..', 'data');
const CONDUIT_RE = /^(WINRED|ACTBLUE|ANEDOT)(\s|,|$)/i;
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

interface Classified {
  real: Row[];
  conduit: Row[];
  israelTotal: number;
  israelList: Array<{ date: string; amount: number; name: string; id: string }>;
  pacAgg: Array<{ name: string; id: string; total: number; count: number; is_israel: boolean }>;
}

function classify(pacRows: Row[]): Classified {
  const real = pacRows.filter(r => !CONDUIT_RE.test((r.contributor_name || '').trim()));
  const conduit = pacRows.filter(r => CONDUIT_RE.test((r.contributor_name || '').trim()));
  let israelTotal = 0;
  const israelList: Classified['israelList'] = [];
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

interface CandidateConfig {
  bioguideId: string;
  displayName: string;
  party: 'Democratic' | 'Republican';
  fecCandidateId?: string;
  committees: string[];
  bioBase: string;
  positionalNotes: string;
}

async function auditCrawford(): Promise<void> {
  const cfg: CandidateConfig = {
    bioguideId: 'oh-house-2026-daniel-crawford',
    displayName: 'Daniel Crawford',
    party: 'Democratic',
    fecCandidateId: 'H6OH12143',
    committees: ['C00934372'],
    bioBase: 'Democratic challenger for U.S. House Ohio District 12 in 2026 against incumbent Rep. Troy Balderson, running in the May 5, 2026 D primary alongside Jerrad Christian and Jason Reynard. Community activist; FEC candidate ID H6OH12143, principal committee C00934372 "CITIZENS FOR DANIEL CRAWFORD" (registered 2026-01-13).',
    positionalNotes: 'No documented Israel-lobby posture in public record as of audit date.',
  };
  console.log(`\n=== ${cfg.displayName.toUpperCase()} (D, OH-12) AUDIT ===`);

  const totals: Record<string, unknown>[] = [];
  for (const cid of cfg.committees) {
    const r = await fec<Record<string, unknown>>(`/committee/${cid}/totals/`, { per_page: 10 });
    for (const t of r.results || []) totals.push({ committee_id: cid, ...t });
    await sleep(400);
  }
  console.log(`Committee totals rows: ${totals.length}`);
  for (const t of totals) {
    console.log(`  ${t.committee_id} ${t.cycle}: receipts=$${Number(t.receipts || 0).toLocaleString()} | inds=$${Number(t.individual_contributions || 0).toLocaleString()} | pacs=$${Number(t.other_political_committee_contributions || 0).toLocaleString()} | cand=$${Number(t.candidate_contribution || 0).toLocaleString()}`);
  }

  const allInd: Array<Row & { cycle: number }> = [];
  const allPac: Array<Row & { cycle: number }> = [];
  for (const cid of cfg.committees) {
    const inds = await pullAll(cid, CURRENT_CYCLE, true);
    const pacs = await pullAll(cid, CURRENT_CYCLE, false);
    allInd.push(...inds.map(r => ({ ...r, cycle: CURRENT_CYCLE })));
    allPac.push(...pacs.map(r => ({ ...r, cycle: CURRENT_CYCLE })));
    console.log(`  ${cid} ${CURRENT_CYCLE}: ${inds.length} inds, ${pacs.length} non-inds`);
  }

  const currentPac = classify(allPac);
  const currentInd = allInd;

  console.log(`\nCURRENT (2026) — inds: ${currentInd.length} rows / $${currentInd.reduce((s,r)=>s+(r.contribution_receipt_amount||0),0).toFixed(0)}`);
  console.log(`  real PACs: ${currentPac.real.length} / $${currentPac.real.reduce((s,r)=>s+(r.contribution_receipt_amount||0),0).toFixed(0)} | israel PACs: $${currentPac.israelTotal}`);
  for (const p of currentPac.pacAgg.slice(0, 20)) {
    console.log(`    $${p.total.toFixed(0).padStart(8)} (${p.count}x) | ${p.name.slice(0,45).padEnd(45)} | ${p.id}${p.is_israel ? ' [ISRAEL]' : ''}`);
  }

  const indAgg = new Map<string, { name: string; state: string; employer: string; occupation: string; total: number; count: number }>();
  for (const r of currentInd) {
    const name = (r.contributor_name || '').trim().toUpperCase();
    const st = (r.contributor_state || '').toUpperCase();
    const key = `${name}|${st}`;
    const cur = indAgg.get(key);
    const amt = r.contribution_receipt_amount || 0;
    if (cur) { cur.total += amt; cur.count++; }
    else indAgg.set(key, { name, state: st, employer: (r.contributor_employer || '').toUpperCase(), occupation: (r.contributor_occupation || '').toUpperCase(), total: amt, count: 1 });
  }
  const topInd = [...indAgg.values()].sort((a, b) => b.total - a.total);
  console.log(`\nTop 15 individual donors (2026 cycle):`);
  for (const d of topInd.slice(0, 15)) {
    console.log(`  $${d.total.toFixed(0).padStart(8)} (${d.count}x) | ${d.name.slice(0,30).padEnd(30)} | ${d.state} | ${d.employer.slice(0,25)}`);
  }

  // Registry crossref (current cycle only — Crawford has no prior cycles)
  const master = loadMaster(DATA_DIR);
  const candDonors: CandDonor[] = [];
  for (const r of currentInd) {
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
      cycle: String(CURRENT_CYCLE),
    });
  }
  const matches = crossref(candDonors, master);
  const high = matches.filter(m => m.confidence === 'high');
  const matchSum = matches.reduce((s, m) => s + m.candidateTotal, 0);
  console.log(`\nRegistry crossref (2026): ${matches.length} matches (${high.length} high) / $${matchSum.toFixed(0)} to candidate`);
  if (matches.length > 0) {
    for (const m of matches.slice(0, 8)) {
      console.log(`  ${m.confidence.padEnd(6)} | $${m.candidateTotal.toFixed(0).padStart(8)} to Crawford | $${m.proIsraelTotal.toLocaleString().padStart(12)} lifetime | ${m.donorName}, ${m.state}`);
    }
  }

  const currentTotals = totals.filter(t => Number(t.cycle) === CURRENT_CYCLE);
  const currentReceipts = currentTotals.reduce((s, t) => s + (Number(t.receipts) || 0), 0);
  const currentIndividuals = currentTotals.reduce((s, t) => s + (Number(t.individual_contributions) || 0), 0);
  const currentPacsFromTotals = currentTotals.reduce((s, t) => s + (Number(t.other_political_committee_contributions) || 0), 0);
  const currentCandContrib = currentTotals.reduce((s, t) => s + (Number(t.candidate_contribution) || 0), 0);

  const tier: 'none' | 'compromised' | 'bought' | 'owned' =
    currentPac.israelTotal >= 5_000_000 ? 'owned'
    : currentPac.israelTotal >= 2_000_000 ? 'bought'
    : currentPac.israelTotal >= 500_000 ? 'compromised'
    : 'none';

  const top5Ind = topInd.slice(0, 5).map(d => ({
    name: d.name, type: 'Individual' as const, amount: Math.round(d.total), is_israel_lobby: false,
  }));

  const pol: Politician = {
    id: cfg.bioguideId, name: cfg.displayName, office: 'U.S. House', officeLevel: 'Federal Representative',
    party: cfg.party, jurisdiction: 'Ohio', jurisdictionType: 'federal_congressional',
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
      registry_match_total_current: Math.round(matchSum),
      registry_match_count_current: matches.length,
    },
    isActive: true, tags: ['candidate', '2026-primary', 'challenger'], bio: '',
    socialMedia: {}, source_ids: { fec_candidate_id: cfg.fecCandidateId, principal_committee_id: cfg.committees[0] },
    dataSource: 'audit_oh12_challengers_2026-04-24', courtCases: [], lobbyingRecords: [], votes: [],
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
  if (matches.length === 0) {
    positiveFlags.push(`[registry 2026-cycle] 0 of ${indAgg.size} unique individual donors match the 49-year pro-Israel registry.`);
  } else if (matchSum < 1000 || matchSum / Math.max(currentIndividuals, 1) < 0.02) {
    positiveFlags.push(`[registry 2026-cycle] ${matches.length} donors match registry but total only $${matchSum.toFixed(0)} to candidate (${(matchSum/Math.max(currentIndividuals,1)*100).toFixed(2)}% of individuals) — no capture signal.`);
  }

  await upsertCandidate({
    cfg, score: result.score, tier,
    currentReceipts, currentIndividuals, currentPacsFromTotals, currentCandContrib,
    israelTotal: currentPac.israelTotal,
    israelLobbyBreakdown: pol.israelLobbyBreakdown!,
    contributionBreakdown: pol.contributionBreakdown!,
    top5Donors: top5Ind,
    positiveFlags, redFlags,
    extraSourceIds: {
      fec_candidate_id: cfg.fecCandidateId,
      principal_committee_id: cfg.committees[0],
      donation_status: currentPac.israelTotal === 0
        ? 'GRASSROOTS / NO PRO-ISRAEL PAC MONEY (2026 CYCLE)'
        : `SOME PRO-ISRAEL PAC MONEY ($${currentPac.israelTotal.toFixed(0)} in 2026 cycle)`,
    },
  });

  fs.writeFileSync(path.join(DATA_DIR, 'oh12-daniel-crawford-audit.json'), JSON.stringify({
    generated_at: new Date().toISOString(),
    candidate: { name: cfg.displayName, party: 'D', state: 'OH', district: '12', fec_candidate_id: cfg.fecCandidateId, committees: cfg.committees },
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
      top_individuals: topInd.slice(0, 25),
      registry_matches: matches.length,
      registry_high: high.length,
      registry_match_to_candidate: matchSum,
    },
    score: result.score, grade: result.grade, confidence: result.confidence, juice_box_tier: tier,
    positive_flags: positiveFlags, red_flags: redFlags,
  }, null, 2));
}

async function auditReynard(): Promise<void> {
  // Jason Reynard: Newark, OH. NO FEC filing, no committee. Sub-$5K
  // grassroots threshold means he hasn't crossed the federal reporting line.
  // No bundler capture is possible without dollars to capture.
  console.log(`\n=== JASON REYNARD (D, OH-12) AUDIT ===`);
  console.log(`No FEC committee on file. Treating as $0 grassroots / no PAC capture.`);

  const cfg: CandidateConfig = {
    bioguideId: 'oh-house-2026-jason-reynard',
    displayName: 'Jason Reynard',
    party: 'Democratic',
    fecCandidateId: undefined,
    committees: [],
    bioBase: 'Democratic challenger for U.S. House Ohio District 12 in 2026, certified for the May 5, 2026 D primary alongside Jerrad Christian and Daniel Crawford. Newark, OH resident (165 N Twenty First St, 43055). NO FEC committee registered — fundraising is below the $5,000 federal reporting threshold, indicating a grassroots / sub-threshold campaign with no PAC capture exposure on the audit date.',
    positionalNotes: 'No documented Israel-lobby posture in public record as of audit date.',
  };

  const tier: 'none' = 'none';
  const score = 0;
  const top5Ind: Array<{ name: string; type: 'Individual'; amount: number; is_israel_lobby: boolean }> = [];

  const positiveFlags: string[] = [
    '[fec 2026-cycle] No FEC committee registered — fundraising under federal $5K reporting threshold; structurally cannot be captured by pro-Israel PAC money in 2026 cycle.',
    '[grassroots] Sub-threshold candidate; no donor concentration risk possible.',
  ];
  const redFlags: Array<{ label: string; severity: 'high' | 'med' | 'low' }> = [];

  await upsertCandidate({
    cfg, score, tier,
    currentReceipts: 0, currentIndividuals: 0, currentPacsFromTotals: 0, currentCandContrib: 0,
    israelTotal: 0,
    israelLobbyBreakdown: {
      total: 0, pacs: 0, ie: 0, bundlers: 0, pac_details: [],
      registry_match_total_current: 0, registry_match_count_current: 0,
      source: 'no_fec_committee',
    },
    contributionBreakdown: {
      aipac: 0, corporate: 0, otherPACs: 0, individuals: 0, self_funding: 0, pro_israel_pacs: 0,
    },
    top5Donors: top5Ind,
    positiveFlags, redFlags,
    extraSourceIds: {
      fec_candidate_id: null,
      principal_committee_id: null,
      donation_status: 'GRASSROOTS / NO FEC COMMITTEE / SUB-$5K REPORTING THRESHOLD',
      ohio_certified: true,
      ohio_address: '165 N Twenty First St, Newark, OH 43055',
    },
  });

  fs.writeFileSync(path.join(DATA_DIR, 'oh12-jason-reynard-audit.json'), JSON.stringify({
    generated_at: new Date().toISOString(),
    candidate: { name: cfg.displayName, party: 'D', state: 'OH', district: '12', fec_candidate_id: null, committees: [] },
    totals: [],
    current_cycle: { cycle: CURRENT_CYCLE, receipts: 0, individuals: 0, pacs: 0, self_funding: 0, israel_pac_total: 0 },
    score, grade: 'A', confidence: 'low', juice_box_tier: tier,
    positive_flags: positiveFlags, red_flags: redFlags,
    note: 'Sub-FEC-threshold grassroots candidate. Confidence is LOW — no public financial signal exists yet. Re-audit if Reynard files an FEC committee or his campaign clears $5K.',
  }, null, 2));
}

interface UpsertArgs {
  cfg: CandidateConfig;
  score: number;
  tier: 'none' | 'compromised' | 'bought' | 'owned';
  currentReceipts: number;
  currentIndividuals: number;
  currentPacsFromTotals: number;
  currentCandContrib: number;
  israelTotal: number;
  israelLobbyBreakdown: NonNullable<Politician['israelLobbyBreakdown']>;
  contributionBreakdown: NonNullable<Politician['contributionBreakdown']>;
  top5Donors: Array<{ name: string; type: 'Individual' | 'PAC' | 'Corporate' | 'Israel-PAC'; amount: number; is_israel_lobby: boolean }>;
  positiveFlags: string[];
  redFlags: Array<{ label: string; severity: 'high' | 'med' | 'low' }>;
  extraSourceIds: Record<string, unknown>;
}

async function upsertCandidate(a: UpsertArgs): Promise<void> {
  const s = createClient(SUPABASE_URL, SUPABASE_KEY);
  const nowIso = new Date().toISOString();
  const payload = {
    bioguide_id: a.cfg.bioguideId,
    name: a.cfg.displayName,
    office: 'U.S. House',
    office_level: 'Federal Representative',
    party: a.cfg.party,
    district: 'District 12',
    jurisdiction: 'Ohio',
    jurisdiction_type: 'federal_congressional',
    photo_url: null,
    corruption_score: a.score,
    aipac_funding: 0,
    juice_box_tier: a.tier,
    total_funds: Math.round(a.currentReceipts),
    top5_donors: a.top5Donors,
    israel_lobby_total: Math.round(a.israelTotal),
    israel_lobby_breakdown: a.israelLobbyBreakdown,
    contribution_breakdown: a.contributionBreakdown,
    is_active: true,
    is_candidate: true,
    running_for: 'U.S. House OH-12 (2026)',
    years_in_office: 0,
    bio: a.cfg.bioBase + ' ' + a.cfg.positionalNotes,
    term_start: null, term_end: null,
    social_media: {},
    source_ids: {
      ...a.extraSourceIds,
      positive_flags: a.positiveFlags,
      red_flags: a.redFlags,
    },
    data_source: 'audit_oh12_challengers_2026-04-24',
    lobbying_records: [], voting_records: [], court_records: [],
    updated_at: nowIso,
  };

  if (DRY_RUN) {
    console.log(`[DRY-RUN] Would upsert ${a.cfg.bioguideId} | score=${a.score} | tier=${a.tier} | total=$${Math.round(a.currentReceipts)}`);
    return;
  }
  const { data: existing } = await s.from('politicians').select('bioguide_id').eq('bioguide_id', a.cfg.bioguideId).maybeSingle();
  if (existing) {
    await s.from('politicians').update(payload).eq('bioguide_id', a.cfg.bioguideId);
    console.log(`UPDATED row ${a.cfg.bioguideId}`);
  } else {
    await s.from('politicians').insert({ ...payload, created_at: nowIso });
    console.log(`INSERTED row ${a.cfg.bioguideId}`);
  }
}

async function deleteDuplicateChristian(): Promise<void> {
  const s = createClient(SUPABASE_URL, SUPABASE_KEY);
  const dupId = 'oh-house-12-2026-jerrad-shane-christian';
  if (DRY_RUN) {
    console.log(`[DRY-RUN] Would delete duplicate Christian row: ${dupId}`);
    return;
  }
  const { error } = await s.from('politicians').delete().eq('bioguide_id', dupId);
  if (error) console.error(`Delete failed for ${dupId}:`, error);
  else console.log(`DELETED duplicate row ${dupId} (canonical: oh-house-2026-jerrad-christian)`);
}

/**
 * Refresh Balderson (incumbent R, OH-12). He's already audited at the
 * PAC + bundler + roster level (score 95/F, tier compromised, $2.0M raised,
 * $647K pro-Israel signal). This fills the remaining gaps:
 *   1. is_active=true, is_candidate=true, running_for (was missing)
 *   2. voting_records from GovTrack (was 5 stale rows; now 111 relevant)
 *   3. source_ids.positive_flags (was empty) + donation_status
 *   4. Voting-alignment red_flags summarizing the pro-Israel pattern
 */
interface RelevantVoteFile {
  bill: string;
  title: string;
  date: string;
  position: string;
  description: string;
  relevance: string;
  category: string;
  congress: number;
  chamber: string;
  result: string;
  govtrack_link: string;
}

async function auditBalderson(): Promise<void> {
  const s = createClient(SUPABASE_URL, SUPABASE_KEY);
  const BALDERSON_ID = 'oh-rep-d12-troy-balderson';
  console.log(`\n=== TROY BALDERSON (R, OH-12 incumbent) REFRESH ===`);

  // Load existing row — keep the audited score/tier/financial breakdown intact.
  const { data: existing, error } = await s.from('politicians').select('*').eq('bioguide_id', BALDERSON_ID).maybeSingle();
  if (error) throw new Error(`Balderson read failed: ${error.message}`);
  if (!existing) throw new Error(`Balderson row not found: ${BALDERSON_ID}`);

  // Load votes pulled by scripts/fetch-balderson-votes.ts
  const votesPath = path.join(__dirname, '..', 'data-ingestion', 'balderson-votes-historical.json');
  if (!fs.existsSync(votesPath)) {
    throw new Error(`Balderson votes missing: ${votesPath} — run scripts/fetch-balderson-votes.ts first`);
  }
  const votes: RelevantVoteFile[] = JSON.parse(fs.readFileSync(votesPath, 'utf8'));
  const israelAid = votes.filter(v => v.category === 'israel_aid_funding');
  const iran = votes.filter(v => v.category === 'iran_sanctions_nuclear');
  const antiBds = votes.filter(v => v.category === 'israel_aid_restriction');
  const antisemit = votes.filter(v => v.category === 'anti_antisemitism');
  const israelAidAye = israelAid.filter(v => v.position === 'Aye').length;
  const antiBdsAye = antiBds.filter(v => v.position === 'Aye').length;
  const iranAye = iran.filter(v => v.position === 'Aye').length;

  console.log(`  Voting: ${votes.length} relevant votes loaded`);
  console.log(`    Israel-aid funding: ${israelAidAye}/${israelAid.length} Aye (${((israelAidAye/Math.max(israelAid.length,1))*100).toFixed(0)}%)`);
  console.log(`    Anti-BDS:           ${antiBdsAye}/${antiBds.length} Aye`);
  console.log(`    Iran sanctions:     ${iranAye}/${iran.length} Aye`);

  const existingSrcIds = (existing.source_ids as Record<string, unknown>) || {};
  const existingRedFlags = Array.isArray(existingSrcIds.red_flags) ? (existingSrcIds.red_flags as Array<{ label: string; severity: string }>) : [];

  const votingRedFlags: Array<{ label: string; severity: 'high' | 'med' | 'low' }> = [];
  if (israelAid.length > 0) {
    votingRedFlags.push({
      label: `[govtrack] ${israelAidAye}/${israelAid.length} (${((israelAidAye/israelAid.length)*100).toFixed(0)}%) pro-Israel-aid funding votes voted Aye across 115th-119th Congress; consistent alignment with pro-Israel PAC + bundler donors.`,
      severity: 'high',
    });
  }
  if (antiBds.length > 0 && antiBdsAye === antiBds.length) {
    votingRedFlags.push({
      label: `[govtrack] ${antiBdsAye}/${antiBds.length} (100%) anti-BDS / Israel-criticism-restriction votes voted Aye.`,
      severity: 'high',
    });
  }

  const positiveFlags: string[] = [];
  const mergedRedFlags = [...existingRedFlags.map(f => ({ label: f.label, severity: f.severity as 'high' | 'med' | 'low' })), ...votingRedFlags];

  const patchedSourceIds = {
    ...existingSrcIds,
    red_flags: mergedRedFlags,
    positive_flags: positiveFlags,
    donation_status: `CAPTURED / PRO-ISRAEL LOBBY — $${Math.round((existing.israel_lobby_total as number) || 0).toLocaleString()} cycle signal + ${israelAidAye}/${israelAid.length} pro-Israel-aid Aye voting record`,
    govtrack_person_id: 412747,
    real_bioguide_id: 'B001306',
    vote_summary: {
      total_relevant: votes.length,
      israel_aid_funding: { aye: israelAidAye, total: israelAid.length },
      anti_bds: { aye: antiBdsAye, total: antiBds.length },
      iran_sanctions: { aye: iranAye, total: iran.length },
      anti_antisemitism: { total: antisemit.length },
    },
  };

  const patch = {
    is_active: true,
    is_candidate: true,
    running_for: 'U.S. House OH-12 (2026)',
    voting_records: votes,
    source_ids: patchedSourceIds,
    data_source: `${existing.data_source as string}+govtrack_${new Date().toISOString().slice(0,10)}`,
    updated_at: new Date().toISOString(),
  };

  if (DRY_RUN) {
    console.log(`[DRY-RUN] Would patch Balderson row:`);
    console.log(`  is_active: ${existing.is_active} → true`);
    console.log(`  is_candidate: ${existing.is_candidate} → true`);
    console.log(`  running_for: ${existing.running_for} → U.S. House OH-12 (2026)`);
    console.log(`  voting_records: ${((existing.voting_records as unknown[]) || []).length} → ${votes.length}`);
    console.log(`  red_flags: ${existingRedFlags.length} → ${mergedRedFlags.length} (+${votingRedFlags.length} voting-alignment)`);
    console.log(`  data_source: → ${patch.data_source}`);
    return;
  }
  const { error: upErr } = await s.from('politicians').update(patch).eq('bioguide_id', BALDERSON_ID);
  if (upErr) throw new Error(`Balderson update failed: ${upErr.message}`);
  console.log(`UPDATED row ${BALDERSON_ID}`);
}

async function main(): Promise<void> {
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN (use --write to commit)' : 'WRITE'}`);
  await auditCrawford();
  await auditReynard();
  await auditBalderson();
  await deleteDuplicateChristian();
  console.log('\n=== Done ===');
}

main().catch(e => { console.error(e); process.exit(1); });

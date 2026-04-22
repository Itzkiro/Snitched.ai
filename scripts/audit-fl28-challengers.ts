#!/usr/bin/env npx tsx
/**
 * Full FEC audit + DB seed for FL-28 2026 challengers (Ehr, Campione, Henry,
 * Mujica, Lara, Rojas). For each candidate:
 *   - Pull committee totals (principal + any authorized committees)
 *   - Paginate Schedule A individuals (all cycles 2018-2026)
 *   - Paginate Schedule A non-individuals, classify conduit vs real PAC,
 *     flag pro-Israel PACs by ID + name regex
 *   - Crossref individual donors against pro-Israel registry
 *   - Compute corruption score; upsert DB row
 *
 * Writes per-candidate JSON artifact to data/fl28-<slug>-audit.json and a
 * consolidated summary to data/fl28-race-summary.json.
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

// Same lobby set used in lib/corruption-score and audit-politician.ts
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

interface Candidate {
  bioguide_id: string;  // DB primary key (our slug or real bioguide_id)
  name: string;
  party: string;
  fec_candidate_id: string;
  committees: string[];
  cycles: number[];
  district: string;
  office: string;
  office_level: string;
  jurisdiction: string;
  jurisdiction_type: string;
  party_short: string;
  slug: string;
  is_candidate: boolean;
  running_for: string;
}

const CANDIDATES: Candidate[] = [
  {
    bioguide_id: 'fl-house-2026-phil-ehr', name: 'Phil Ehr', party: 'Democratic', party_short: 'D',
    fec_candidate_id: 'H4FL28042', committees: ['C00904128', 'C00845750'],
    cycles: [2018, 2020, 2022, 2024, 2026],
    district: 'District 28', office: 'U.S. House', office_level: 'Federal Representative',
    jurisdiction: 'Florida', jurisdiction_type: 'federal_congressional',
    slug: 'phil-ehr', is_candidate: true, running_for: 'U.S. House FL-28 (2026)',
  },
];

function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

async function fec<T>(
  endpoint: string, params: Record<string, string | number>
): Promise<{ results?: T[]; pagination?: { last_indexes?: Record<string, unknown> | null } }> {
  const url = new URL(`https://api.open.fec.gov/v1${endpoint}`);
  url.searchParams.set('api_key', FEC);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString());
  if (res.status === 429) { await sleep(30_000); return fec(endpoint, params); }
  if (!res.ok) { const txt = await res.text().catch(() => '?'); throw new Error(`FEC ${endpoint} ${res.status}: ${txt.slice(0, 200)}`); }
  return res.json() as Promise<{ results?: T[]; pagination?: { last_indexes?: Record<string, unknown> | null } }>;
}

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
    await sleep(350);
  }
  return rows;
}

interface CandidateAudit {
  candidate: Candidate;
  totals: Record<string, unknown>[];
  individual_rows: number;
  individual_sum: number;
  individual_unique_donors: number;
  real_pac_rows: number;
  real_pac_sum: number;
  real_pacs: Array<{ name: string; committee_id: string; total: number; count: number; is_israel: boolean }>;
  israel_pac_total: number;
  israel_pac_rows: Array<{ date: string; amount: number; name: string; committee_id: string }>;
  conduit_sum: number;
  registry_matches: number;
  registry_match_high: number;
  registry_match_to_candidate: number;
  registry_top_matches: Array<{ donor: string; state: string; to_candidate: number; pro_israel_career: number; confidence: string }>;
  top_individual_donors: Array<{ name: string; state: string; employer: string; total: number; count: number }>;
  score: number;
  grade: string;
  confidence: string;
  juice_box_tier: string;
}

async function auditCandidate(c: Candidate, master: Map<string, import('../lib/roster-match').MasterEntry>): Promise<CandidateAudit> {
  console.log(`\n=== ${c.name} (${c.party_short}) | ${c.fec_candidate_id} | ${c.committees.length} committees ===`);

  if (c.committees.length === 0) {
    console.log('  No committee filed — will seed as $0 candidate.');
    return {
      candidate: c, totals: [],
      individual_rows: 0, individual_sum: 0, individual_unique_donors: 0,
      real_pac_rows: 0, real_pac_sum: 0, real_pacs: [],
      israel_pac_total: 0, israel_pac_rows: [],
      conduit_sum: 0,
      registry_matches: 0, registry_match_high: 0, registry_match_to_candidate: 0, registry_top_matches: [],
      top_individual_donors: [],
      score: 0, grade: 'A', confidence: 'low', juice_box_tier: 'none',
    };
  }

  // Committee totals
  const totals: Record<string, unknown>[] = [];
  for (const cid of c.committees) {
    try {
      const r = await fec<Record<string, unknown>>(`/committee/${cid}/totals/`, { per_page: 10 });
      for (const t of r.results || []) totals.push({ committee_id: cid, ...t });
      await sleep(400);
    } catch (e) { console.error(`  totals error for ${cid}:`, e instanceof Error ? e.message : e); }
  }

  // Schedule A
  const individualRows: Array<Row & { cycle: number; committee_id: string }> = [];
  const nonIndRows: Array<Row & { cycle: number; committee_id: string }> = [];
  for (const cid of c.committees) {
    for (const cy of c.cycles) {
      try {
        const inds = await pullAll(cid, cy, true);
        const pacs = await pullAll(cid, cy, false);
        individualRows.push(...inds.map(r => ({ ...r, cycle: cy, committee_id: cid })));
        nonIndRows.push(...pacs.map(r => ({ ...r, cycle: cy, committee_id: cid })));
        console.log(`  ${cid} ${cy}: ${inds.length} inds, ${pacs.length} non-inds`);
      } catch (e) { console.error(`  scheduleA error ${cid}/${cy}:`, e instanceof Error ? e.message : e); }
    }
  }

  // Non-individual classification
  const realPacRows = nonIndRows.filter(r => !CONDUIT_RE.test((r.contributor_name || '').trim()));
  const conduitRows = nonIndRows.filter(r => CONDUIT_RE.test((r.contributor_name || '').trim()));
  const conduitSum = conduitRows.reduce((s, r) => s + (r.contribution_receipt_amount || 0), 0);
  const realPacSum = realPacRows.reduce((s, r) => s + (r.contribution_receipt_amount || 0), 0);

  // Aggregate real PACs
  const pacAgg = new Map<string, { name: string; committee_id: string; total: number; count: number; is_israel: boolean }>();
  let israelPacTotal = 0;
  const israelPacRows: Array<{ date: string; amount: number; name: string; committee_id: string }> = [];
  for (const r of realPacRows) {
    const id = r.contributor_committee_id || r.contributor_id || '';
    const name = (r.contributor_name || '').trim();
    const amt = r.contribution_receipt_amount || 0;
    const isIsrael = (id && ISRAEL_LOBBY_COMMITTEE_IDS.has(id)) || ISRAEL_NAME_RE.test(name);
    if (isIsrael) {
      israelPacTotal += amt;
      israelPacRows.push({ date: r.contribution_receipt_date || '', amount: amt, name, committee_id: id });
    }
    const key = id || name;
    const cur = pacAgg.get(key);
    if (cur) { cur.total += amt; cur.count++; }
    else pacAgg.set(key, { name, committee_id: id, total: amt, count: 1, is_israel: isIsrael });
  }

  // Aggregate individuals
  const indAgg = new Map<string, { name: string; state: string; employer: string; total: number; count: number }>();
  for (const r of individualRows) {
    const name = (r.contributor_name || '').trim().toUpperCase();
    const state = (r.contributor_state || '').toUpperCase();
    const key = `${name}|${state}`;
    const cur = indAgg.get(key);
    const amt = r.contribution_receipt_amount || 0;
    if (cur) { cur.total += amt; cur.count++; }
    else indAgg.set(key, { name, state, employer: (r.contributor_employer || '').toUpperCase(), total: amt, count: 1 });
  }
  const individualSum = individualRows.reduce((s, r) => s + (r.contribution_receipt_amount || 0), 0);

  // Pro-Israel individual registry crossref
  const candDonors: CandDonor[] = [];
  for (const r of individualRows) {
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
  const matches = crossref(candDonors, master);
  const matchSum = matches.reduce((s, m) => s + m.candidateTotal, 0);
  const highConf = matches.filter(m => m.confidence === 'high');

  console.log(`  totals: ${totals.length} cycles | indivs=${individualRows.length} rows / ${indAgg.size} unique / $${individualSum.toFixed(0)}`);
  console.log(`  real PACs: ${realPacRows.length} rows / $${realPacSum.toFixed(0)} | israel PACs: $${israelPacTotal.toFixed(0)} (${israelPacRows.length} rows)`);
  console.log(`  conduit: $${conduitSum.toFixed(0)} | registry matches: ${matches.length} (${highConf.length} high) | match to cand: $${matchSum.toFixed(0)}`);

  // Compute score
  const combinedReceipts = totals.reduce((s, t) => s + (Number(t.receipts) || 0), 0);
  const combinedIndividualsFromTotals = totals.reduce((s, t) => s + (Number(t.individual_contributions) || 0), 0);
  const combinedPacsFromTotals = totals.reduce((s, t) => s + (Number(t.other_political_committee_contributions) || 0), 0);
  const combinedCandContrib = totals.reduce((s, t) => s + (Number(t.candidate_contribution) || 0), 0);

  const israelForTier = israelPacTotal;
  const tier: 'none' | 'compromised' | 'bought' | 'owned' =
    israelForTier >= 5_000_000 ? 'owned'
    : israelForTier >= 2_000_000 ? 'bought'
    : israelForTier >= 500_000 ? 'compromised'
    : 'none';

  const topIndDonors = [...indAgg.values()].sort((a, b) => b.total - a.total).slice(0, 10);
  const top5Donors = topIndDonors.slice(0, 5).map(d => ({
    name: d.name, type: 'Individual' as const,
    amount: Math.round(d.total), is_israel_lobby: false,
  }));

  const contribBreakdown = {
    aipac: 0,
    corporate: 0,
    otherPACs: Math.round(combinedPacsFromTotals),
    individuals: Math.round(combinedIndividualsFromTotals),
    self_funding: Math.round(combinedCandContrib),
    pro_israel_pacs: Math.round(israelPacTotal),
  };

  const pol: Politician = {
    id: c.bioguide_id, name: c.name, office: c.office, officeLevel: c.office_level,
    party: c.party, jurisdiction: c.jurisdiction, jurisdictionType: c.jurisdiction_type,
    corruptionScore: 0, juiceBoxTier: tier,
    aipacFunding: israelPacTotal,
    totalFundsRaised: Math.round(combinedReceipts),
    top5Donors, contributionBreakdown: contribBreakdown,
    israelLobbyTotal: israelPacTotal,
    israelLobbyBreakdown: {
      total: israelPacTotal, pacs: israelPacTotal, ie: 0, bundlers: 0,
      pac_details: [...pacAgg.values()].filter(p => p.is_israel).map(p => ({
        name: p.name, fec_id: p.committee_id, amount: p.total, count: p.count,
      })),
      registry_match_total: Math.round(matchSum),
      registry_match_count: matches.length,
      registry_match_high_confidence: highConf.length,
    },
    isActive: false,
    tags: ['candidate', '2026-primary', 'challenger', c.party_short.toLowerCase() === 'ind' ? 'independent' : c.party.toLowerCase()],
    bio: '',
    socialMedia: {},
    source_ids: {
      fec_candidate_id: c.fec_candidate_id,
      principal_committee_id: c.committees[0] || '',
    },
    dataSource: 'fl28_audit_2026-04-22',
    courtCases: [], lobbyingRecords: [], votes: [],
  };

  const result = computeCorruptionScore(pol);

  return {
    candidate: c, totals,
    individual_rows: individualRows.length, individual_sum: individualSum,
    individual_unique_donors: indAgg.size,
    real_pac_rows: realPacRows.length, real_pac_sum: realPacSum,
    real_pacs: [...pacAgg.values()].sort((a, b) => b.total - a.total),
    israel_pac_total: israelPacTotal, israel_pac_rows: israelPacRows,
    conduit_sum: conduitSum,
    registry_matches: matches.length, registry_match_high: highConf.length,
    registry_match_to_candidate: matchSum,
    registry_top_matches: matches.slice(0, 10).map(m => ({
      donor: m.donorName, state: m.state, to_candidate: m.candidateTotal,
      pro_israel_career: m.proIsraelTotal, confidence: m.confidence,
    })),
    top_individual_donors: topIndDonors,
    score: result.score, grade: result.grade, confidence: result.confidence, juice_box_tier: tier,
  };
}

async function writeDb(s: ReturnType<typeof createClient>, a: CandidateAudit): Promise<void> {
  const c = a.candidate;
  const nowIso = new Date().toISOString();
  const combinedReceipts = a.totals.reduce((s, t) => s + (Number(t.receipts) || 0), 0);
  const combinedIndividuals = a.totals.reduce((s, t) => s + (Number(t.individual_contributions) || 0), 0);
  const combinedPacs = a.totals.reduce((s, t) => s + (Number(t.other_political_committee_contributions) || 0), 0);
  const combinedCandContrib = a.totals.reduce((s, t) => s + (Number(t.candidate_contribution) || 0), 0);

  const positiveFlags: string[] = [];
  const redFlags: string[] = [];
  let donationStatus = 'NO FEC FILING YET';
  if (combinedReceipts > 0) {
    if (a.israel_pac_total === 0 && a.real_pac_sum === 0) donationStatus = 'GRASSROOTS / NO LOBBY CAPTURE';
    else if (a.israel_pac_total === 0) donationStatus = 'PAC-FUNDED / NO PRO-ISRAEL LOBBY';
    else if (a.israel_pac_total >= 500_000) donationStatus = 'PRO-ISRAEL LOBBY (COMPROMISED)';
    else if (a.israel_pac_total > 0) donationStatus = 'SOME PRO-ISRAEL LOBBY MONEY';
  }
  if (a.israel_pac_total === 0 && combinedReceipts > 0) {
    positiveFlags.push(`[fec] $0 in pro-Israel PAC contributions across all filings.`);
  }
  if (a.israel_pac_total > 0) {
    redFlags.push(`[fec] $${a.israel_pac_total.toFixed(0)} from pro-Israel PACs across ${a.israel_pac_rows.length} contributions.`);
  }
  if (combinedReceipts === 0) {
    positiveFlags.push(`[fec] No campaign funds raised — $0 receipts in FEC filings.`);
  }
  if (a.registry_match_high >= 5 && a.registry_match_to_candidate >= 5000) {
    redFlags.push(`[registry] ${a.registry_match_high} high-confidence pro-Israel bundlers gave candidate $${a.registry_match_to_candidate.toFixed(0)}.`);
  }

  const payload = {
    bioguide_id: c.bioguide_id,
    name: c.name,
    office: c.office, office_level: c.office_level, party: c.party,
    district: c.district, jurisdiction: c.jurisdiction, jurisdiction_type: c.jurisdiction_type,
    photo_url: null,
    corruption_score: a.score,
    aipac_funding: 0,  // AIPAC specifically not always distinguished from pro-Israel total
    juice_box_tier: a.juice_box_tier,
    total_funds: Math.round(combinedReceipts),
    top5_donors: a.top_individual_donors.slice(0, 5).map(d => ({
      name: d.name, type: 'Individual', amount: Math.round(d.total), is_israel_lobby: false,
    })),
    israel_lobby_total: Math.round(a.israel_pac_total),
    israel_lobby_breakdown: {
      total: Math.round(a.israel_pac_total),
      pacs: Math.round(a.israel_pac_total),
      ie: 0, bundlers: 0,
      pac_details: a.real_pacs.filter(p => p.is_israel).map(p => ({
        name: p.name, fec_id: p.committee_id, amount: p.total, count: p.count,
      })),
      registry_match_total: Math.round(a.registry_match_to_candidate),
      registry_match_count: a.registry_matches,
      registry_match_high_confidence: a.registry_match_high,
    },
    contribution_breakdown: {
      aipac: 0, corporate: 0,
      otherPACs: Math.round(combinedPacs),
      individuals: Math.round(combinedIndividuals),
      self_funding: Math.round(combinedCandContrib),
      pro_israel_pacs: Math.round(a.israel_pac_total),
    },
    is_active: false,
    is_candidate: c.is_candidate,
    running_for: c.running_for,
    years_in_office: 0,
    bio: `${c.party} ${c.party === 'Independent' ? 'independent' : 'primary'} challenger for U.S. House Florida District 28 in 2026. FEC candidate ID ${c.fec_candidate_id}.`,
    term_start: null, term_end: null,
    social_media: {},
    source_ids: {
      fec_candidate_id: c.fec_candidate_id,
      principal_committee_id: c.committees[0] || '',
      authorized_committee_ids: c.committees.slice(1),
      donation_status: donationStatus,
      positive_flags: positiveFlags,
      red_flags: redFlags,
    },
    data_source: 'fl28_audit_2026-04-22',
    lobbying_records: [], voting_records: [], court_records: [],
    updated_at: nowIso,
  };

  const { data: existing } = await s.from('politicians').select('bioguide_id').eq('bioguide_id', c.bioguide_id).maybeSingle();
  if (existing) {
    const { error } = await s.from('politicians').update(payload).eq('bioguide_id', c.bioguide_id);
    if (error) throw error;
  } else {
    const { error } = await s.from('politicians').insert({ ...payload, created_at: nowIso });
    if (error) throw error;
  }
}

async function main(): Promise<void> {
  console.log(`Loading pro-Israel registry from ${DATA_DIR}...`);
  const master = loadMaster(DATA_DIR);
  console.log(`  ${master.size} unique pro-Israel individual donors indexed`);

  const s = createClient(SUPABASE_URL, SUPABASE_KEY);

  const audits: CandidateAudit[] = [];
  for (const c of CANDIDATES) {
    const a = await auditCandidate(c, master);
    audits.push(a);
    await writeDb(s, a);
    // per-candidate JSON
    const out = path.join(DATA_DIR, `fl28-${c.slug}-audit.json`);
    fs.writeFileSync(out, JSON.stringify(a, null, 2));
    console.log(`  → DB upserted + artifact ${out}`);
  }

  // Consolidated summary
  const summary = audits.map(a => ({
    name: a.candidate.name,
    party: a.candidate.party,
    fec_id: a.candidate.fec_candidate_id,
    total_receipts: a.totals.reduce((s, t) => s + (Number(t.receipts) || 0), 0),
    individuals: a.totals.reduce((s, t) => s + (Number(t.individual_contributions) || 0), 0),
    pacs: a.totals.reduce((s, t) => s + (Number(t.other_political_committee_contributions) || 0), 0),
    self_funding: a.totals.reduce((s, t) => s + (Number(t.candidate_contribution) || 0), 0),
    real_pac_sum: a.real_pac_sum,
    israel_pac_sum: a.israel_pac_total,
    score: a.score, grade: a.grade, juice_box_tier: a.juice_box_tier,
    individual_uniques: a.individual_unique_donors,
    registry_matches_high: a.registry_match_high,
    registry_match_to_cand: a.registry_match_to_candidate,
  }));
  const summaryPath = path.join(DATA_DIR, 'fl28-race-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`\n=== FL-28 RACE SUMMARY ===`);
  for (const row of summary) {
    console.log(`  ${row.party[0]} ${row.name.padEnd(28)} | $${Math.round(row.total_receipts).toLocaleString().padStart(12)} | score=${String(row.score).padStart(3)}/${row.grade} | tier=${row.juice_box_tier.padEnd(11)} | israel_pac=$${Math.round(row.israel_pac_sum).toLocaleString().padStart(10)}`);
  }
  console.log(`\nSummary: ${summaryPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });

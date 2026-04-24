#!/usr/bin/env npx tsx
/**
 * Merge the FULL federal 49-year pro-Israel individual-donor cross-reference
 * for Byron Donalds' federal House committees (C00733329 + C00509877, cycles
 * 2012-2026) into the Snitched.ai Supabase row (bioguide_id = "fl-gov-2026-byron-donalds").
 *
 * Reads:
 *   data/donalds-federal-49yr-crossref-2026-04-24.json
 *   data/donalds-pac-disbursement-audit.json
 *
 * Updates (delta applied):
 *   israel_lobby_total:                          $140,143  -> $403,091
 *   aipac_funding (legacy column):               $13,015   -> $403,091
 *   israel_lobby_breakdown.total:                 140143   ->  403091
 *   israel_lobby_breakdown.cycle_2026_subtotal:    13015   ->   16188
 *   israel_lobby_breakdown.historical_pac_network_subtotal: 127128 (unchanged)
 *   israel_lobby_breakdown.historical_49yr_individual_bundlers_subtotal: NEW = 259775
 *   individual_registry.matches / high_confidence:   3     ->   131
 *   individual_registry.itemized_individual_rows:    -     ->   31596
 *   individual_registry.these_donors_to_pro_israel_career: $29,450 -> $12,741,230
 *   individual_registry.to_candidate:               $6,015 -> $268,963
 *   individual_registry.top_donors: 3 state HC -> 15 federal top + 3 state HC = 18
 *   source_ids.red_flags:           6 -> 9 (3 high appended)
 *   bio:                            appended with 49-yr finding paragraph
 *   data_source:                    audit_2026-04-24_donalds_full_federal_49yr_capture
 *
 * juice_box_tier remains 'bought' (curator-set; $403K does not auto-trigger
 * 'owned' tier $5M direct-receipt floor). Score 74 is the bought-tier floor;
 * red_flag count contribution may push it slightly higher per scorer logic.
 *
 * CLI:
 *   npx tsx scripts/update-donalds-with-full-capture.ts            # dry-run
 *   npx tsx scripts/update-donalds-with-full-capture.ts --dry-run  # explicit
 *   npx tsx scripts/update-donalds-with-full-capture.ts --write    # commit
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { computeCorruptionScore } from '../lib/corruption-score';
import type { Politician } from '../lib/types';

// ---------------------------------------------------------------------------
// Env + CLI
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
}

const ARGV = new Set(process.argv.slice(2));
const WRITE = ARGV.has('--write');
const DRY_RUN = !WRITE;

const BIOGUIDE_ID = 'fl-gov-2026-byron-donalds';
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const CROSSREF_PATH = path.join(
  DATA_DIR,
  'donalds-federal-49yr-crossref-2026-04-24.json',
);
const NEW_DATA_SOURCE = 'audit_2026-04-24_donalds_full_federal_49yr_capture';

// ---------------------------------------------------------------------------
// Cross-ref shape
// ---------------------------------------------------------------------------

interface CrossrefMatch {
  name: string;
  state: string;
  employer_last_seen: string;
  occupation_last_seen: string;
  to_donalds_all_cycles: number;
  to_donalds_by_cycle: Record<string, number>;
  career_to_pro_israel_pacs: number;
  pacs_given_to: string[];
  pro_israel_cycles: string[];
  also_on_rose_aipac_earmark_list: boolean;
  also_on_donalds_aipac_earmark_list: boolean;
  also_on_blackburn_tn_gov: boolean;
  also_on_rose_federal_49yr: boolean;
  foreign_money_flag?: string;
}

interface Crossref {
  source: string;
  method: string;
  registry: {
    years: string;
    year_count: number;
    unique_individuals: number;
    index_keys: number;
  };
  donalds_donor_universe: {
    committee_ids: string[];
    candidate_id: string;
    unique_donors: number;
    total_itemized_receipts: number;
    cycles: number[];
    by_cycle: Record<string, { rows: number; total: number }>;
  };
  matches: CrossrefMatch[];
  totals: {
    high_conf_match_count: number;
    high_conf_total_to_donalds: number;
    combined_career_to_pro_israel: number;
    cycle_2026_live_signal: number;
    cross_identified_with_blackburn_tn_gov: string[];
    cross_identified_with_rose_federal_49yr: string[];
    cross_identified_with_rose_aipac_earmark: string[];
  };
  generated_at: string;
}

function loadCrossref(): Crossref {
  if (!fs.existsSync(CROSSREF_PATH)) {
    throw new Error(`Cross-ref artifact missing: ${CROSSREF_PATH}`);
  }
  return JSON.parse(fs.readFileSync(CROSSREF_PATH, 'utf8')) as Crossref;
}

// ---------------------------------------------------------------------------
// Politician row shape (subset we touch — preserve unknown fields via spread)
// ---------------------------------------------------------------------------

interface RedFlag {
  severity: 'high' | 'med' | 'low';
  label: string;
  source: string;
  date: string;
}

interface PoliticianRow {
  bioguide_id: string;
  name: string;
  office: string;
  office_level: string;
  party: string;
  district: string | null;
  jurisdiction: string;
  jurisdiction_type: string;
  corruption_score: number;
  aipac_funding: number;
  juice_box_tier: string;
  total_funds: number;
  top5_donors: unknown[];
  israel_lobby_total: number;
  israel_lobby_breakdown: Record<string, unknown>;
  contribution_breakdown: Record<string, unknown>;
  is_active: boolean;
  bio: string;
  source_ids: Record<string, unknown>;
  data_source: string;
  voting_records: unknown[];
  lobbying_records: unknown[];
  court_records: unknown[];
}

// ---------------------------------------------------------------------------
// Top federal bundlers (top 15 from cross-ref by career-to-pro-Israel-PACs)
// ---------------------------------------------------------------------------

interface TopDonor {
  name: string;
  state: string;
  employer?: string;
  occupation?: string;
  pacs: string[];
  confidence: 'high';
  source: string;
  to_candidate: number;
  to_candidate_by_cycle?: Record<string, number>;
  career_to_pro_israel_pacs: number;
  also_on_rose_aipac_earmark_list?: boolean;
  also_on_donalds_aipac_earmark_list?: boolean;
  also_on_blackburn_tn_gov?: boolean;
  also_on_rose_federal_49yr?: boolean;
  foreign_money_flag?: string;
}

function buildTopFederalDonors(cx: Crossref, limit: number): TopDonor[] {
  const sorted = [...cx.matches].sort(
    (a, b) => b.career_to_pro_israel_pacs - a.career_to_pro_israel_pacs,
  );
  return sorted.slice(0, limit).map(m => {
    const d: TopDonor = {
      name: m.name,
      state: m.state,
      pacs: m.pacs_given_to,
      confidence: 'high',
      source: 'federal-house-C00733329-C00509877-cycles-2012-2026',
      to_candidate: m.to_donalds_all_cycles,
      to_candidate_by_cycle: m.to_donalds_by_cycle,
      career_to_pro_israel_pacs: m.career_to_pro_israel_pacs,
    };
    if (m.employer_last_seen) d.employer = m.employer_last_seen;
    if (m.occupation_last_seen) d.occupation = m.occupation_last_seen;
    if (m.also_on_rose_aipac_earmark_list)
      d.also_on_rose_aipac_earmark_list = true;
    if (m.also_on_donalds_aipac_earmark_list)
      d.also_on_donalds_aipac_earmark_list = true;
    if (m.also_on_blackburn_tn_gov) d.also_on_blackburn_tn_gov = true;
    if (m.also_on_rose_federal_49yr) d.also_on_rose_federal_49yr = true;
    if (m.foreign_money_flag) d.foreign_money_flag = m.foreign_money_flag;
    return d;
  });
}

// ---------------------------------------------------------------------------
// Static numbers (computed once from instructions/data)
// ---------------------------------------------------------------------------

const CYCLE_2026_FEDERAL_PAC_LIVE = 7000; // $5K RJC + $2K NORPAC (already on row)
const STATE_HC_TO_CANDIDATE = 6015; // 3 FL DOE state HC bundlers (already on row)
const STATE_HC_CAREER = 29450; // career to pro-Israel PACs from those 3
const STATE_ITEMIZED_ROWS = 770; // FL DOE state itemized rows
const HISTORICAL_PAC_NETWORK_SUBTOTAL = 127128; // 2020-2024 federal PAC capture

// ---------------------------------------------------------------------------
// New red flags (3 high) — append to existing 6
// ---------------------------------------------------------------------------

const NEW_RED_FLAGS: RedFlag[] = [
  {
    severity: 'high',
    label:
      '$262,948 direct to Donalds from 128 high-confidence pro-Israel-network individual bundlers across 2022/2024 federal cycles. Combined career-to-pro-Israel-PACs: $12.7 MILLION — densest individual-donor capture signal in the Snitched cohort. Notable billionaire-level bundlers: Elizabeth Uihlein (Uline, $3M Preserve America PAC/Adelson), Paul Singer (Elliott Management, $2.5M Adelson), David Zalik (GreenSky, $2.55M AIPAC/UDP), Daniel Loeb (Third Point, $381K DMFI/AIPAC), Larry Mizel (MDC Holdings, $1.06M Washington PAC).',
    source:
      'FEC Schedule A 2012-2026 + 49-yr individual donor registry cross-ref (data/donalds-federal-49yr-crossref-2026-04-24.json)',
    date: '2026-04-24',
  },
  {
    severity: 'high',
    label:
      "Adelson-network capture confirmed: 4+ donors who have given $100K-$3M each to Sheldon/Miriam Adelson's Preserve America PAC are now Donalds donors. Adelson-network = the largest GOP pro-Israel donor pool of the cycle and historically the single biggest funding source behind hawkish-pro-Israel Republicans (incl. Trump $250M+ historically). Donalds receiving Adelson-aligned money + Trump endorsement signals coordinated establishment-Israel-lobby support.",
    source:
      'Snitched cross-ref 49-yr registry — Uihlein/Singer/Mizel/Johnson all Adelson-PAC donors',
    date: '2026-04-24',
  },
  {
    severity: 'high',
    label:
      'Sam Olswanger (Senior Policy Advisor, Akin Gump Strauss Hauer & Feld — FARA-registered firm representing foreign sovereigns) is now confirmed on THREE Snitched-audited candidates: Donalds $500, Rose $1,000 (via AIPAC PAC earmark conduit), Blackburn $10,600 direct to her TN gov cmte. Same FARA-firm bundler hitting all three Trump-endorsed/establishment 2026 GOP gubernatorial candidates is structural, not coincidental.',
    source: 'Snitched cross-candidate audit 2026-04-24',
    date: '2026-04-24',
  },
];

// ---------------------------------------------------------------------------
// Bio appendix
// ---------------------------------------------------------------------------

const BIO_APPENDIX = [
  '',
  '',
  "UPDATED 2026-04-24: Full FEC Schedule A 2012-2026 cross-reference against Snitched's 49-year pro-Israel individual donor registry surfaced **128 high-confidence bundlers totaling $262,948 direct → Donalds** (combined career-to-pro-Israel-PACs: $12.7 MILLION — densest individual-donor capture in the Snitched cohort). Notable billionaire bundlers include Elizabeth Uihlein ($3M to Adelson's Preserve America PAC), Paul Singer of Elliott Management ($2.5M to Preserve America PAC), David Zalik of GreenSky ($2.55M to UDP/AIPAC), Daniel Loeb of Third Point ($381K), Larry Mizel of MDC Holdings ($1.06M). 5 of these donors also gave to Marsha Blackburn's TN gov committee; 2 also bundle for Rep. John Rose. Sam Olswanger (Akin Gump Strauss Hauer & Feld — FARA-registered firm) appears on Donalds, Rose, AND Blackburn donor lists — structural cross-candidate FARA-firm bundling pattern. Total cumulative documented pro-Israel-lobby capture is now **$403,091** ($127K 2020-2024 PAC-network + $260K 2012-2024 individual bundlers + $16K 2026-cycle live across federal and state cmtes). Track AIPAC's lifetime $84K+ tally is a subset of this total.",
].join('\n');

// ---------------------------------------------------------------------------
// Build the update payload
// ---------------------------------------------------------------------------

function build(cx: Crossref, existing: PoliticianRow): PoliticianRow {
  const breakdownIn = (existing.israel_lobby_breakdown || {}) as Record<string, unknown>;
  const priorRegistry =
    (breakdownIn.individual_registry as Record<string, unknown>) || {};
  const priorTopDonors = Array.isArray(priorRegistry.top_donors)
    ? (priorRegistry.top_donors as Array<Record<string, unknown>>)
    : [];

  // Top 15 federal bundlers + existing 3 state HC = 18 top_donors entries
  const newFederalTopDonors = buildTopFederalDonors(cx, 15);

  // Tag prior state HC entries with their source for clarity
  const priorStateTopDonors: TopDonor[] = priorTopDonors.map(d => {
    const td: TopDonor = {
      name: String(d.name || ''),
      state: String(d.state || ''),
      pacs: Array.isArray(d.pacs) ? (d.pacs as string[]) : [],
      confidence: 'high',
      source: 'fl-doe-2026-state-gov-cmte',
      to_candidate: Number(d.to_candidate) || 0,
      career_to_pro_israel_pacs: Number(d.career_to_pro_israel_pacs) || 0,
    };
    if (d.employer) td.employer = String(d.employer);
    if (d.occupation) td.occupation = String(d.occupation);
    return td;
  });

  // Dedup by name|state
  const federalKeys = new Set(
    newFederalTopDonors.map(d => `${d.name}|${d.state}`),
  );
  const keptStateDonors = priorStateTopDonors.filter(
    d => !federalKeys.has(`${d.name}|${d.state}`),
  );
  const mergedTopDonors = [...newFederalTopDonors, ...keptStateDonors];

  // Aggregate match-level totals (federal HC + state HC)
  const federalHighConf = cx.totals.high_conf_match_count; // 128
  const stateHighConf = Number(priorRegistry.high_confidence) || 0; // 3
  const totalHighConf = federalHighConf + stateHighConf; // 131

  const federalToCandidate = cx.totals.high_conf_total_to_donalds; // 262947.82
  const totalToCandidate = federalToCandidate + STATE_HC_TO_CANDIDATE; // ~268963

  const federalCareer = cx.totals.combined_career_to_pro_israel; // 12,711,780
  const totalCareer = federalCareer + STATE_HC_CAREER; // 12,741,230

  const federalItemizedRows = Object.values(cx.donalds_donor_universe.by_cycle).reduce(
    (s, c) => s + (c.rows || 0),
    0,
  );
  const totalItemizedRows = federalItemizedRows + STATE_ITEMIZED_ROWS;

  // Compute split between historical (2012-2024) and cycle-2026 portion
  const cycle2026FederalIndividual = cx.totals.cycle_2026_live_signal; // 3173.25
  const historicalFederalIndividualBundlers =
    federalToCandidate - cycle2026FederalIndividual; // ~259774.57

  // Cycle-2026 live = $7K federal PAC + $3,173 federal individual + $6,015 state
  const cycle2026Subtotal =
    CYCLE_2026_FEDERAL_PAC_LIVE +
    cycle2026FederalIndividual +
    STATE_HC_TO_CANDIDATE; // ~16188

  // Cumulative documented capture
  const newIsraelLobbyTotal =
    HISTORICAL_PAC_NETWORK_SUBTOTAL +
    historicalFederalIndividualBundlers +
    cycle2026Subtotal; // ~127128 + 259775 + 16188 = 403091

  // Round to whole dollars for cleaner display
  const round = (n: number): number => Math.round(n);

  const newIndividualRegistry = {
    schema_version: 2,
    method: cx.method,
    registry_years: cx.registry.years,
    registry_unique_individuals: cx.registry.unique_individuals,
    registry_index_keys: cx.registry.index_keys,
    donalds_donor_universe: cx.donalds_donor_universe,
    source: 'fec_2012-2026_house_C00733329_C00509877 + fl_doe_2026_state_gov',
    matches: totalHighConf, // 131
    high_confidence: totalHighConf, // 131
    itemized_individual_rows: totalItemizedRows, // 31596
    these_donors_to_pro_israel_career: round(totalCareer), // 12741230
    to_candidate: round(totalToCandidate), // 268963
    federal_match_count: federalHighConf, // 128
    federal_to_candidate: round(federalToCandidate), // 262948
    federal_career_to_pro_israel: round(federalCareer), // 12711780
    cycle_2026_live_subtotal:
      CYCLE_2026_FEDERAL_PAC_LIVE +
      cycle2026FederalIndividual +
      STATE_HC_TO_CANDIDATE,
    historical_pre_2026_individual_subtotal: round(
      historicalFederalIndividualBundlers,
    ),
    cross_identified_with_blackburn_tn_gov:
      cx.totals.cross_identified_with_blackburn_tn_gov,
    cross_identified_with_rose_federal_49yr:
      cx.totals.cross_identified_with_rose_federal_49yr,
    cross_identified_with_rose_aipac_earmark:
      cx.totals.cross_identified_with_rose_aipac_earmark,
    top_donors: mergedTopDonors,
    generated_at: cx.generated_at,
    source_file: 'data/donalds-federal-49yr-crossref-2026-04-24.json',
  };

  // Updated breakdown — preserves existing pacs, pac_details, ie, source, note
  const updatedBreakdown: Record<string, unknown> = {
    ...breakdownIn,
    total: round(newIsraelLobbyTotal),
    cycle_2026_subtotal: round(cycle2026Subtotal),
    historical_pac_network_subtotal: HISTORICAL_PAC_NETWORK_SUBTOTAL,
    historical_49yr_individual_bundlers_subtotal: round(
      historicalFederalIndividualBundlers,
    ),
    individual_registry: newIndividualRegistry,
    source:
      'fec_2012-2026_house + fl_doe_2026_gov (live) + aipac-network-historical-2020-2024 + 49yr-individual-registry-2012-2024 (cumulative display)',
    note:
      "2026 cycle live: $7,000 federal PAC + $3,173 federal HC individual bundlers + $6,015 FL-DOE HC bundlers = $16,188. Historical 2020-2024 federal PAC capture $127,128. Historical 2012-2024 federal individual-bundler direct $259,775 (128 HC bundlers; combined career-to-pro-Israel-PACs $12.7M). Cumulative $403,091. juice_box_tier='bought' floor (70) carries the cycle-only score per v6.3 policy; new red_flags add high-severity contribution.",
    cumulative_total_note:
      'Cumulative documented pro-Israel-lobby capture: $403,091 across 2012-2026 (federal House + FL gov state cmte). Densest individual-donor capture signal in the Snitched cohort: 128 federal HC bundlers tied to $12.7M lifetime pro-Israel-PAC giving. Cycle-only score driver: 2026 live = $16,188.',
  };

  // Append new red flags (preserve existing 6)
  const priorFlags = (existing.source_ids?.red_flags as RedFlag[]) || [];
  const mergedFlags = [...priorFlags, ...NEW_RED_FLAGS];

  // Update positions.scoring_note for context
  const priorPositions =
    (existing.source_ids?.positions as Record<string, unknown>) || {};
  const newScoringNote =
    "Trump-endorsed FL governor frontrunner with the densest individual-donor capture signal in the Snitched cohort: $403K cumulative documented pro-Israel-lobby capture (federal PAC $134K + 128 federal HC individual bundlers $263K with $12.7M lifetime pro-Israel PAC giving + $6K state HC), 47 AIPAC-earmarked bundlers, AIEF Israel trip, RJC speaker, 100% pro-Israel votes, 4+ Adelson-network billionaire bundlers (Uihlein/Singer/Mizel/Johnson), Olswanger/Akin-Gump FARA cross-candidate signal. juice_box_tier='bought' floor 70 carries the score per cycle-only policy ($16K 2026 live); curator did not bump to 'owned' (auto threshold $5M direct receipt; cumulative $403K direct does not meet).";
  const newPositions = {
    ...priorPositions,
    scoring_note: newScoringNote,
  };

  // Add a historical breakdown entry for the 49yr individual cross-ref
  const priorHistorical =
    (existing.source_ids?.historical_breakdown as Record<string, unknown>) || {};
  const historical49yr = {
    registry_years: cx.registry.years,
    federal_match_count: federalHighConf,
    federal_total_to_donalds_all_cycles: round(federalToCandidate),
    federal_total_to_donalds_historical_2012_2024: round(
      historicalFederalIndividualBundlers,
    ),
    federal_total_to_donalds_cycle_2026: round(cycle2026FederalIndividual),
    combined_career_to_pro_israel_pacs: round(federalCareer),
    overlap_with_blackburn_tn_gov: cx.totals.cross_identified_with_blackburn_tn_gov,
    overlap_with_rose_federal_49yr: cx.totals.cross_identified_with_rose_federal_49yr,
    overlap_with_rose_aipac_earmark: cx.totals.cross_identified_with_rose_aipac_earmark,
    top_15_by_career_pro_israel_pacs: newFederalTopDonors.map(d => ({
      name: d.name,
      state: d.state,
      employer: d.employer,
      to_donalds_all_cycles: d.to_candidate,
      career_to_pro_israel_pacs: d.career_to_pro_israel_pacs,
      pacs: d.pacs,
    })),
    note:
      'Preserved for context. Historical individual-bundler direct $259,775 portion is included in cumulative israel_lobby_total but does not drive cycle-only score per v6.3 policy.',
  };
  const newHistorical = {
    ...priorHistorical,
    individual_registry_49yr_federal: historical49yr,
  };

  const newSourceIds = {
    ...existing.source_ids,
    red_flags: mergedFlags,
    historical_breakdown: newHistorical,
    positions: newPositions,
  };

  return {
    ...existing,
    israel_lobby_total: round(newIsraelLobbyTotal),
    aipac_funding: round(newIsraelLobbyTotal), // legacy column mirrors cumulative per user spec
    israel_lobby_breakdown: updatedBreakdown,
    source_ids: newSourceIds,
    bio: existing.bio + BIO_APPENDIX,
    data_source: NEW_DATA_SOURCE,
  };
}

// ---------------------------------------------------------------------------
// Score recompute
// ---------------------------------------------------------------------------

function computeScoreForPayload(p: PoliticianRow): {
  score: number;
  grade: string;
  confidence: string;
} {
  const shadow = {
    id: p.bioguide_id,
    name: p.name,
    office: p.office,
    officeLevel: p.office_level,
    party: p.party,
    jurisdiction: p.jurisdiction,
    jurisdictionType: p.jurisdiction_type,
    corruptionScore: 0,
    juiceBoxTier: p.juice_box_tier,
    aipacFunding: p.aipac_funding,
    totalFundsRaised: p.total_funds,
    top5Donors: p.top5_donors,
    contributionBreakdown: p.contribution_breakdown,
    israelLobbyTotal: p.israel_lobby_total,
    israelLobbyBreakdown: p.israel_lobby_breakdown,
    isActive: p.is_active,
    bio: p.bio,
    source_ids: p.source_ids,
    dataSource: p.data_source,
    courtCases: p.court_records,
    lobbyingRecords: p.lobbying_records,
    votes: p.voting_records,
    votingRecords: p.voting_records,
  } as unknown as Politician;

  const r = computeCorruptionScore(shadow);
  return { score: r.score, grade: r.grade, confidence: r.confidence };
}

// ---------------------------------------------------------------------------
// Supabase I/O
// ---------------------------------------------------------------------------

async function fetchExisting(supabase: SupabaseClient): Promise<PoliticianRow> {
  const { data, error } = await supabase
    .from('politicians')
    .select('*')
    .eq('bioguide_id', BIOGUIDE_ID)
    .single();
  if (error) throw error;
  if (!data) throw new Error(`Row not found: ${BIOGUIDE_ID}`);
  return data as PoliticianRow;
}

async function writeRow(
  supabase: SupabaseClient,
  next: PoliticianRow,
  score: number,
): Promise<void> {
  const payload = {
    corruption_score: score,
    israel_lobby_total: next.israel_lobby_total,
    aipac_funding: next.aipac_funding,
    israel_lobby_breakdown: next.israel_lobby_breakdown,
    bio: next.bio,
    source_ids: next.source_ids,
    data_source: next.data_source,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('politicians')
    .update(payload)
    .eq('bioguide_id', BIOGUIDE_ID);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Diff printer
// ---------------------------------------------------------------------------

function countArr(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}

function formatDiff(
  before: PoliticianRow,
  after: PoliticianRow,
  beforeScore: number,
  afterScore: { score: number; grade: string; confidence: string },
): void {
  console.log(`\n--- DRY-RUN DIFF: ${BIOGUIDE_ID} ---`);
  console.log(
    `  corruption_score:                          ${beforeScore}  ->  ${afterScore.score} (grade ${afterScore.grade}, confidence ${afterScore.confidence})`,
  );
  console.log(`  juice_box_tier:                            ${before.juice_box_tier}  ->  ${after.juice_box_tier}`);
  console.log(
    `  israel_lobby_total:                        $${Number(before.israel_lobby_total).toLocaleString()}  ->  $${Number(after.israel_lobby_total).toLocaleString()}`,
  );
  console.log(
    `  aipac_funding (legacy):                    $${Number(before.aipac_funding).toLocaleString()}  ->  $${Number(after.aipac_funding).toLocaleString()}`,
  );

  const beforeBd = (before.israel_lobby_breakdown || {}) as Record<string, unknown>;
  const afterBd = (after.israel_lobby_breakdown || {}) as Record<string, unknown>;
  console.log(
    `  breakdown.total:                           $${Number(beforeBd.total || 0).toLocaleString()}  ->  $${Number(afterBd.total || 0).toLocaleString()}`,
  );
  console.log(
    `  breakdown.cycle_2026_subtotal:             $${Number(beforeBd.cycle_2026_subtotal || 0).toLocaleString()}  ->  $${Number(afterBd.cycle_2026_subtotal || 0).toLocaleString()}`,
  );
  console.log(
    `  breakdown.historical_pac_network_subtotal: $${Number(beforeBd.historical_pac_network_subtotal || 0).toLocaleString()}  ->  $${Number(afterBd.historical_pac_network_subtotal || 0).toLocaleString()}`,
  );
  console.log(
    `  breakdown.historical_49yr_indiv_subtotal:  $${Number(beforeBd.historical_49yr_individual_bundlers_subtotal || 0).toLocaleString()}  ->  $${Number(afterBd.historical_49yr_individual_bundlers_subtotal || 0).toLocaleString()}`,
  );

  const beforeReg = (beforeBd.individual_registry as Record<string, unknown>) || {};
  const afterReg = (afterBd.individual_registry as Record<string, unknown>) || {};
  console.log(
    `  registry.matches:                          ${Number(beforeReg.matches) || 0}  ->  ${Number(afterReg.matches) || 0}`,
  );
  console.log(
    `  registry.high_confidence:                  ${Number(beforeReg.high_confidence) || 0}  ->  ${Number(afterReg.high_confidence) || 0}`,
  );
  console.log(
    `  registry.itemized_individual_rows:         ${Number(beforeReg.itemized_individual_rows) || 0}  ->  ${Number(afterReg.itemized_individual_rows) || 0}`,
  );
  console.log(
    `  registry.these_donors_to_pro_israel_career: $${Number(beforeReg.these_donors_to_pro_israel_career || 0).toLocaleString()}  ->  $${Number(afterReg.these_donors_to_pro_israel_career || 0).toLocaleString()}`,
  );
  console.log(
    `  registry.to_candidate:                     $${Number(beforeReg.to_candidate || 0).toLocaleString()}  ->  $${Number(afterReg.to_candidate || 0).toLocaleString()}`,
  );
  console.log(
    `  registry.top_donors:                       ${countArr(beforeReg.top_donors)}  ->  ${countArr(afterReg.top_donors)}`,
  );

  const beforeFlags = countArr((before.source_ids || {}).red_flags as unknown[]);
  const afterFlags = countArr((after.source_ids || {}).red_flags as unknown[]);
  console.log(`  red_flags:                                 ${beforeFlags}  ->  ${afterFlags}`);
  console.log(
    `  bio length:                                ${before.bio.length}  ->  ${after.bio.length} (+${after.bio.length - before.bio.length})`,
  );
  console.log(
    `  data_source:                               ${before.data_source}  ->  ${after.data_source}`,
  );

  console.log(`\nNew red flags (3 high appended):`);
  for (const f of NEW_RED_FLAGS) {
    console.log(`  [${f.severity}] ${f.label.slice(0, 200)}${f.label.length > 200 ? '...' : ''}`);
  }

  const previewTop = (afterReg.top_donors as unknown[] | undefined)?.slice(0, 3) || [];
  console.log(`\ntop_donors[0..2] preview:`);
  for (const d of previewTop) {
    console.log(`  ${JSON.stringify(d).slice(0, 240)}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const mode = WRITE ? 'WRITE' : 'DRY-RUN';
  console.log(`\n=== UPDATE DONALDS WITH FULL FEDERAL 49-YR CAPTURE (${mode}) ===`);

  const cx = loadCrossref();
  console.log(
    `Registry:        ${cx.registry.years} (${cx.registry.year_count} yrs, ${cx.registry.unique_individuals} individuals, ${cx.registry.index_keys} keys)`,
  );
  console.log(
    `Donalds universe: ${cx.donalds_donor_universe.unique_donors} donors / $${cx.donalds_donor_universe.total_itemized_receipts.toLocaleString()} across ${cx.donalds_donor_universe.cycles.join(',')}`,
  );
  console.log(
    `HC matches:      ${cx.totals.high_conf_match_count}  to_donalds=$${cx.totals.high_conf_total_to_donalds.toLocaleString()}  career=$${cx.totals.combined_career_to_pro_israel.toLocaleString()}  cycle_2026_live=$${cx.totals.cycle_2026_live_signal.toLocaleString()}`,
  );
  console.log(
    `Cross-ref:       Blackburn=${cx.totals.cross_identified_with_blackburn_tn_gov.length}  Rose-49yr=${cx.totals.cross_identified_with_rose_federal_49yr.length}  Rose-AIPAC-earmark=${cx.totals.cross_identified_with_rose_aipac_earmark.length}`,
  );

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const existing = await fetchExisting(supabase);
  console.log(
    `\nFetched existing row: ${existing.name} (score=${existing.corruption_score}, tier=${existing.juice_box_tier}, israel_lobby_total=$${Number(existing.israel_lobby_total).toLocaleString()})`,
  );

  const next = build(cx, existing);
  const scored = computeScoreForPayload(next);

  formatDiff(existing, next, Number(existing.corruption_score) || 0, scored);

  if (DRY_RUN) {
    console.log(`\nDRY-RUN complete. Re-run with --write to commit.`);
    return;
  }

  console.log(`\n=== WRITING TO SUPABASE ===`);
  await writeRow(supabase, next, scored.score);

  const { data: verify, error: vErr } = await supabase
    .from('politicians')
    .select(
      'bioguide_id,name,corruption_score,juice_box_tier,israel_lobby_total,aipac_funding,data_source',
    )
    .eq('bioguide_id', BIOGUIDE_ID)
    .single();
  if (vErr) throw vErr;
  console.log(`DB VERIFY: ${JSON.stringify(verify)}`);
  console.log(`\nWRITE complete.`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env npx tsx
/**
 * Correct the Snitched.ai politicians row for Ed Gallrein (KY-04 R, FEC
 * H6KY04171) using:
 *   - real FEC 2026 totals ($2,387,499 — prior row had $4,774,998 doubled)
 *   - corrected pro-Israel PAC scan (data/gallrein-pac-disbursement-audit.json)
 *   - 49-year individual cross-ref (data/gallrein-49yr-crossref-2026-04-27.json)
 *
 * The prior row (audit_v6.5) had:
 *   total_funds:          $4,774,998.62  (doubled — real cycle 2026 is $2,387,499)
 *   israel_lobby_total:   $6,716,533.11  (mathematically impossible — exceeds receipts)
 *
 * This script:
 *   1. Replaces total_funds with real FEC value.
 *   2. Replaces israel_lobby_total with the corrected sum
 *      (PAC direct $62,398 + bundlers from cross-ref).
 *   3. Replaces israel_lobby_breakdown.individual_registry with the 49-yr
 *      cross-ref output (top 25 donors, full breakdown).
 *   4. Replaces israel_lobby_breakdown.pac_details with the corrected PAC
 *      scan (RJC PAC + any other hits).
 *   5. Merges new red_flags (preserving existing flags).
 *   6. Updates bio with the AIPAC-deployed-challenger framing.
 *   7. Recomputes corruption_score via computeCorruptionScore (owned-tier
 *      hard floor at 85).
 *
 * CLI:
 *   npx tsx scripts/fix-gallrein-with-corrected-audit.ts            # dry-run
 *   npx tsx scripts/fix-gallrein-with-corrected-audit.ts --dry-run  # explicit
 *   npx tsx scripts/fix-gallrein-with-corrected-audit.ts --write    # commit
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { computeCorruptionScore } from '../lib/corruption-score';
import type { Politician } from '../lib/types';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
}

const ARGV = new Set(process.argv.slice(2));
const WRITE = ARGV.has('--write');
const DRY_RUN = !WRITE;

const BIOGUIDE_ID = 'ky-04-2026-ed-gallrein';
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const PAC_AUDIT_PATH = path.join(DATA_DIR, 'gallrein-pac-disbursement-audit.json');
const CROSSREF_PATH = path.join(
  DATA_DIR,
  'gallrein-49yr-crossref-2026-04-27.json',
);

// Real FEC cycle-2026 receipts per /candidate/H6KY04171/totals
const REAL_TOTAL_FUNDS = 2387499;
const REAL_PAC_RECEIPTS_FROM_FEC_SUMMARY = 17768;

// ---------------------------------------------------------------------------
// Type shapes
// ---------------------------------------------------------------------------

interface PacAuditEntry {
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

interface PacAuditByPac {
  committee_id: string;
  total_all_cycles: number;
  by_cycle: Record<string, number>;
  entries: PacAuditEntry[];
  earmarked_donors: string[];
}

interface PacAudit {
  candidate_id: string;
  principal_committee_id: string;
  method: string;
  audited_at: string;
  finished_at: string;
  total_pacs_checked: number;
  by_pac: Record<string, PacAuditByPac>;
  by_cycle: Record<string, { total: number; entries: PacAuditEntry[] }>;
  independent_expenditures: unknown[];
  summary: {
    total_all_cycles: number;
    direct_total: number;
    earmarked_total: number;
    unique_earmarked_donors: number;
    top_earmark_donors: Array<{
      name: string;
      total: number;
      count: number;
      pacs: string[];
      cycles: number[];
    }>;
    [k: string]: unknown;
  };
}

interface CrossrefMatch {
  name: string;
  state: string;
  city: string;
  employer_last_seen: string;
  occupation_last_seen: string;
  to_candidate_all_cycles: number;
  to_candidate_by_cycle: Record<string, number>;
  career_to_pro_israel_pacs: number;
  pacs_given_to: string[];
  pro_israel_cycles: string[];
  also_on_aipac_earmark_list: boolean;
  also_on_donalds_2026: boolean;
  also_on_blackburn_tn_gov: boolean;
  also_on_rose_federal: boolean;
  also_on_mills_federal: boolean;
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
  candidate_donor_universe: {
    committee_id: string;
    candidate_id: string;
    unique_donors: number;
    total_itemized_individual_rows: number;
    total_itemized_individual_receipts: number;
    by_cycle: Record<string, { rows: number; total: number }>;
  };
  matches: CrossrefMatch[];
  totals: {
    high_conf_match_count: number;
    match_rate_pct_of_unique_donors: number;
    high_conf_total_to_candidate: number;
    cycle_2026_live_signal: number;
    combined_career_to_pro_israel: number;
    cross_identified_with_aipac_earmark_bundlers: string[];
    cross_identified_with_donalds_2026: string[];
    cross_identified_with_blackburn_tn_gov: string[];
    cross_identified_with_rose_federal: string[];
    cross_identified_with_mills_federal: string[];
    olswanger_present: boolean;
    olswanger_detail: CrossrefMatch | null;
  };
  generated_at: string;
}

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
  is_candidate: boolean;
  running_for: string;
  bio: string;
  source_ids: Record<string, unknown>;
  data_source: string;
  voting_records: unknown[];
  lobbying_records: unknown[];
  court_records: unknown[];
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

function loadPacAudit(): PacAudit {
  if (!fs.existsSync(PAC_AUDIT_PATH))
    throw new Error(`PAC audit missing: ${PAC_AUDIT_PATH}`);
  return JSON.parse(fs.readFileSync(PAC_AUDIT_PATH, 'utf8')) as PacAudit;
}

function loadCrossref(): Crossref {
  if (!fs.existsSync(CROSSREF_PATH))
    throw new Error(`Crossref missing: ${CROSSREF_PATH}`);
  return JSON.parse(fs.readFileSync(CROSSREF_PATH, 'utf8')) as Crossref;
}

// ---------------------------------------------------------------------------
// Build new fields
// ---------------------------------------------------------------------------

function buildPacDetails(pacAudit: PacAudit): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const [pacName, info] of Object.entries(pacAudit.by_pac)) {
    out.push({
      pac_name: pacName,
      committee_id: info.committee_id,
      total_all_cycles: Math.round(info.total_all_cycles * 100) / 100,
      by_cycle: info.by_cycle,
      entry_count: info.entries.length,
      earmarked_donor_count: info.earmarked_donors.length,
      sample_entries: info.entries.slice(0, 5).map(e => ({
        amount: e.amount,
        date: e.date,
        type: e.type,
        cycle: e.cycle,
        earmark_donor: e.earmark_donor,
      })),
    });
  }
  out.sort(
    (a, b) =>
      Number(b.total_all_cycles || 0) - Number(a.total_all_cycles || 0),
  );
  return out;
}

interface IndividualRegistryTopDonor {
  name: string;
  state: string;
  city?: string;
  employer?: string;
  to_candidate: number;
  career_to_pro_israel_pacs: number;
  candidate_cycles: string[];
  pro_israel_cycles: string[];
  pacs: string[];
  confidence: 'high';
  also_on_aipac_earmark_list: boolean;
  also_on_donalds_2026: boolean;
  also_on_blackburn_tn_gov: boolean;
  also_on_rose_federal: boolean;
  also_on_mills_federal: boolean;
  foreign_money_flag?: string;
}

function buildIndividualRegistry(
  cx: Crossref,
): Record<string, unknown> {
  const matches = cx.matches;
  const topDonors: IndividualRegistryTopDonor[] = matches
    .slice(0, 25)
    .map(m => ({
      name: m.name,
      state: m.state,
      city: m.city || undefined,
      employer: m.employer_last_seen || undefined,
      to_candidate: m.to_candidate_all_cycles,
      career_to_pro_israel_pacs: m.career_to_pro_israel_pacs,
      candidate_cycles: Object.keys(m.to_candidate_by_cycle).sort(),
      pro_israel_cycles: m.pro_israel_cycles,
      pacs: m.pacs_given_to,
      confidence: 'high',
      also_on_aipac_earmark_list: m.also_on_aipac_earmark_list,
      also_on_donalds_2026: m.also_on_donalds_2026,
      also_on_blackburn_tn_gov: m.also_on_blackburn_tn_gov,
      also_on_rose_federal: m.also_on_rose_federal,
      also_on_mills_federal: m.also_on_mills_federal,
      foreign_money_flag: m.foreign_money_flag,
    }));
  return {
    schema_version: 3,
    source: cx.source,
    method: cx.method,
    registry_years: cx.registry.years,
    registry_unique_individuals: cx.registry.unique_individuals,
    registry_index_keys: cx.registry.index_keys,
    matches: matches.length,
    high_confidence: matches.length,
    medium_confidence: 0,
    to_candidate: cx.totals.high_conf_total_to_candidate,
    these_donors_to_pro_israel_career: cx.totals.combined_career_to_pro_israel,
    itemized_individual_rows:
      cx.candidate_donor_universe.total_itemized_individual_rows,
    unique_donors: cx.candidate_donor_universe.unique_donors,
    match_rate_pct: cx.totals.match_rate_pct_of_unique_donors,
    cross_identified_with_aipac_earmark_bundlers:
      cx.totals.cross_identified_with_aipac_earmark_bundlers,
    cross_identified_with_donalds_2026: cx.totals.cross_identified_with_donalds_2026,
    cross_identified_with_blackburn_tn_gov:
      cx.totals.cross_identified_with_blackburn_tn_gov,
    cross_identified_with_rose_federal: cx.totals.cross_identified_with_rose_federal,
    cross_identified_with_mills_federal:
      cx.totals.cross_identified_with_mills_federal,
    olswanger_present: cx.totals.olswanger_present,
    top_donors: topDonors,
    generated_at: cx.generated_at,
    source_file: 'data/gallrein-49yr-crossref-2026-04-27.json',
  };
}

const CORRECTED_BIO = [
  'Republican challenger to Rep. Thomas Massie (R-KY-04) in the 2026 GOP primary. Real FEC 2026-cycle receipts: $2,387,499 (98% individual, only $17,768 from PACs per FEC summary). Snitched 49-year individual donor registry cross-reference surfaces an extraordinary capture pattern: **573 of his 736 unique itemized individual donors (77.9%) are documented pro-Israel-network donors** — the densest donor-base capture profile in the Snitched.ai cohort by far. Total bundler $ to Gallrein: $963,803; combined career giving by these 573 to pro-Israel PACs: $23.35 million. Direct PAC capture: $54,398 from Republican Jewish Coalition PAC (35 separate contributions, 33 unique earmark bundlers in cycle 2026), $5,000 from SunPAC, $3,000 from Grand Canyon State Caucus.',
  '',
  'Notable bundlers include Victor Kohn (CA, $1.67M career to AIPAC PAC + Pro-Israel America), Herb Shear (FL, $870K career, RJC + Pro-Israel America), Ronald Bloom (CA, $514K), Garry Rayant (CA, $503K), Norman Radow (GA, $452K), Eugene Fooksman (CA, $426K career to AIPAC PAC + UDP), Steven Fishman (CA, $314K career), Joseph Weinberg (MD, $298K), Yehuda Neuberger (MD, $276K), Kenneth Levy (CA, $259K career to Pro-Israel America + UDP). The pattern strongly suggests Gallrein is an **AIPAC-deployed primary challenger** intended to defeat Massie — Congress\'s most outspoken anti-Israel-aid Republican (Iron Dome NO votes, H.R. 8034 NO, vocal critic of "Israel First" politicians).',
].join('\n');

function buildNewRedFlags(
  cx: Crossref,
  pacAudit: PacAudit,
): RedFlag[] {
  const date = '2026-04-27';
  const careerStr = `$${(cx.totals.combined_career_to_pro_israel / 1_000_000).toFixed(2)}M`;
  const flags: RedFlag[] = [];

  flags.push({
    severity: 'high',
    label: `AIPAC-deployed primary challenger to Rep. Thomas Massie (R-KY-04) — the most anti-Israel-aid Republican in Congress (voted NO on Iron Dome supplementals, NO on H.R. 8034, repeatedly criticizes 'Israel First' politicians). ${cx.totals.high_conf_match_count} of ${cx.candidate_donor_universe.unique_donors} unique itemized individual donors (${cx.totals.match_rate_pct_of_unique_donors}%) are documented pro-Israel-network donors per Snitched 49-year individual registry — densest donor-base capture profile in the entire Snitched cohort. Combined career pro-Israel-PAC giving by these ${cx.totals.high_conf_match_count} donors: ${careerStr}.`,
    source:
      'Snitched 49-yr cross-ref data/gallrein-49yr-crossref-2026-04-27.json',
    date,
  });

  const totalPacDirect = Math.round(pacAudit.summary.total_all_cycles * 100) / 100;
  const rjcEntry = pacAudit.by_pac['REPUBLICAN JEWISH COALITION POLITICAL ACTION COMMITTEE'];
  const rjcTotal = rjcEntry ? Math.round(rjcEntry.total_all_cycles * 100) / 100 : 0;
  const rjcCount = rjcEntry ? rjcEntry.entries.length : 0;
  const rjcEarmarks = rjcEntry ? rjcEntry.earmarked_donors.length : 0;
  const otherPacs = Object.entries(pacAudit.by_pac)
    .filter(([n]) => !/REPUBLICAN JEWISH COALITION/.test(n))
    .map(([n, info]) => `${n.replace(/POLITICAL ACTION COMMITTEE/i, 'PAC')} $${Math.round(info.total_all_cycles).toLocaleString()}`);
  flags.push({
    severity: 'high',
    label: `$${rjcTotal.toLocaleString()} direct from Republican Jewish Coalition PAC across ${rjcCount} transactions (${rjcEarmarks} unique earmark bundlers, cycle 2026). Plus ${otherPacs.length ? otherPacs.join(', ') : 'no other pro-Israel PAC capture'}. Total pro-Israel PAC direct $${totalPacDirect.toLocaleString()} across ${Object.keys(pacAudit.by_pac).length} pro-Israel PACs (corrected Schedule-B-by-disburser scan of 92-PAC superset).`,
    source:
      'FEC Schedule B by-disburser audit data/gallrein-pac-disbursement-audit.json',
    date,
  });

  const top = cx.matches.slice(0, 5);
  const topStr = top
    .map(
      m =>
        `${m.name} (${m.state}, $${Math.round(m.career_to_pro_israel_pacs).toLocaleString()} career)`,
    )
    .join('; ');
  flags.push({
    severity: 'high',
    label: `Top bundlers to Gallrein: ${topStr}. All top-15 bundlers gave $250K+ career to AIPAC PAC / Pro-Israel America / UDP / RJC / NorPAC.`,
    source: 'Snitched 49-yr cross-ref',
    date,
  });

  flags.push({
    severity: 'high',
    label: `Cross-candidate donor-base overlap: ${cx.totals.cross_identified_with_donalds_2026.length} donors also gave to Byron Donalds (FL-19/governor 2026), ${cx.totals.cross_identified_with_rose_federal.length} also to Rep. John Rose (R-TN-06), ${cx.totals.cross_identified_with_mills_federal.length} to Rep. Cory Mills (R-FL-07), ${cx.totals.cross_identified_with_blackburn_tn_gov.length} to Marsha Blackburn (TN gov 2026). The same pro-Israel donor pool is funding Republican challengers and incumbents across districts — a coordinated capture pattern.`,
    source: 'Snitched 49-yr cross-ref + Donalds/Rose/Mills/Blackburn audits',
    date,
  });

  flags.push({
    severity: 'high',
    label:
      'Initial Snitched DB row (audit_v6.5) had inflated/corrupted numbers (total_funds $4,774,998.62 was DOUBLED; israel_lobby_total $6,716,533.11 exceeded receipts mathematically). Corrected 2026-04-27 with real FEC totals + corrected Schedule-B-by-disburser PAC scan + 49-yr individual cross-ref.',
    source: 'data-quality fix 2026-04-27',
    date,
  });

  return flags;
}

function build(
  existing: PoliticianRow,
  cx: Crossref,
  pacAudit: PacAudit,
): PoliticianRow {
  const pacDetails = buildPacDetails(pacAudit);
  const individualRegistry = buildIndividualRegistry(cx);

  // PAC scan total = $62,398 across RJC + SunPAC + Grand Canyon
  const pacsTotal = Math.round(pacAudit.summary.total_all_cycles * 100) / 100;
  // Individual bundlers (HC matches direct $ to candidate)
  const bundlersTotal = cx.totals.high_conf_total_to_candidate;
  // Israel lobby total = pacs + bundlers (cycle 2026 only — all signal is cycle 2026)
  const israelLobbyTotal = Math.round((pacsTotal + bundlersTotal) * 100) / 100;

  const newBreakdown: Record<string, unknown> = {
    ...(existing.israel_lobby_breakdown || {}),
    pacs: pacsTotal,
    bundlers: bundlersTotal,
    ie: 0,
    total: israelLobbyTotal,
    pac_details: pacDetails,
    individual_registry: individualRegistry,
    cycles_count: 1,
    note:
      '2026 cycle only per Snitched cycle-only scoring policy. Corrected 2026-04-27 from corrupted audit_v6.5 (doubled receipts + impossibly inflated lobby total).',
    source: 'corrected_2026-04-27 — schedule_b_by_disburser PAC scan + 49yr individual cross-ref',
  };

  // Build new red flags — strip prior [roster-match] + a few v6.5-era flags
  // that quoted the corrupted numbers, but keep the real qualitative ones.
  const priorFlags = (existing.source_ids?.red_flags as RedFlag[]) || [];
  const PRIOR_KILL =
    /\[roster-match\]|\.65M in AIPAC-affiliated|6\.7M|6,716,533|4,774,998|76\.5%|586\/766|\.01M in individual AIPAC-bundler/;
  const keptFlags = priorFlags.filter(f => !PRIOR_KILL.test(String(f.label || '')));
  const newFlags = buildNewRedFlags(cx, pacAudit);
  const mergedFlags = [...keptFlags, ...newFlags];

  const newSourceIds = {
    ...existing.source_ids,
    red_flags: mergedFlags,
    corrected_audit_2026_04_27: {
      pac_audit_file: 'data/gallrein-pac-disbursement-audit.json',
      crossref_file: 'data/gallrein-49yr-crossref-2026-04-27.json',
      prior_corrupted_totals: {
        total_funds: existing.total_funds,
        israel_lobby_total: existing.israel_lobby_total,
        aipac_funding: existing.aipac_funding,
      },
      real_fec_totals_summary: {
        total_funds: REAL_TOTAL_FUNDS,
        pac_receipts_per_fec_summary: REAL_PAC_RECEIPTS_FROM_FEC_SUMMARY,
      },
    },
  };

  return {
    ...existing,
    total_funds: REAL_TOTAL_FUNDS,
    aipac_funding: israelLobbyTotal,
    israel_lobby_total: israelLobbyTotal,
    israel_lobby_breakdown: newBreakdown,
    juice_box_tier: 'owned',
    bio: CORRECTED_BIO,
    source_ids: newSourceIds,
    data_source: 'audit_2026-04-27_gallrein_corrected_full_capture',
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
    juice_box_tier: next.juice_box_tier,
    total_funds: next.total_funds,
    aipac_funding: next.aipac_funding,
    israel_lobby_total: next.israel_lobby_total,
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

function fmt(n: number): string {
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function formatDiff(
  before: PoliticianRow,
  after: PoliticianRow,
  beforeScore: number,
  afterScore: { score: number; grade: string; confidence: string },
): void {
  console.log(`\n--- DRY-RUN DIFF: ${BIOGUIDE_ID} ---`);
  console.log(
    `  corruption_score:    ${beforeScore}  ->  ${afterScore.score} (grade ${afterScore.grade}, confidence ${afterScore.confidence})`,
  );
  console.log(
    `  juice_box_tier:      ${before.juice_box_tier}  ->  ${after.juice_box_tier}`,
  );
  console.log(
    `  total_funds:         ${fmt(before.total_funds)}  ->  ${fmt(after.total_funds)}`,
  );
  console.log(
    `  aipac_funding:       ${fmt(before.aipac_funding)}  ->  ${fmt(after.aipac_funding)}`,
  );
  console.log(
    `  israel_lobby_total:  ${fmt(before.israel_lobby_total)}  ->  ${fmt(after.israel_lobby_total)}`,
  );
  const beforeReg = (before.israel_lobby_breakdown || {}).individual_registry as
    | Record<string, unknown>
    | undefined;
  const afterReg = (after.israel_lobby_breakdown || {}).individual_registry as
    | Record<string, unknown>
    | undefined;
  console.log(
    `  individual_registry.matches:           ${beforeReg?.matches || 0}  ->  ${afterReg?.matches || 0}`,
  );
  console.log(
    `  individual_registry.to_candidate:      ${fmt(Number(beforeReg?.to_candidate || 0))}  ->  ${fmt(Number(afterReg?.to_candidate || 0))}`,
  );
  console.log(
    `  individual_registry.these_donors_to_pro_israel_career:  ${fmt(Number(beforeReg?.these_donors_to_pro_israel_career || 0))}  ->  ${fmt(Number(afterReg?.these_donors_to_pro_israel_career || 0))}`,
  );
  console.log(
    `  individual_registry.match_rate_pct:    ${beforeReg?.match_rate_pct || 0}%  ->  ${afterReg?.match_rate_pct || 0}%`,
  );
  console.log(
    `  individual_registry.top_donors count:  ${(beforeReg?.top_donors as unknown[] | undefined)?.length || 0}  ->  ${(afterReg?.top_donors as unknown[] | undefined)?.length || 0}`,
  );

  const afterPacDetails =
    ((after.israel_lobby_breakdown || {}).pac_details as unknown[] | undefined) || [];
  console.log(`  pac_details count:    ${afterPacDetails.length}`);
  for (const p of afterPacDetails) {
    const pd = p as Record<string, unknown>;
    console.log(
      `    - ${String(pd.pac_name).slice(0, 50)} (${pd.committee_id}): ${fmt(Number(pd.total_all_cycles || 0))} / ${pd.entry_count} entries / ${pd.earmarked_donor_count} earmark bundlers`,
    );
  }

  const beforeFlags = ((before.source_ids || {}).red_flags as unknown[]) || [];
  const afterFlags = ((after.source_ids || {}).red_flags as unknown[]) || [];
  console.log(
    `  red_flags:           ${beforeFlags.length}  ->  ${afterFlags.length}`,
  );
  console.log(
    `  bio length:          ${(before.bio || '').length}  ->  ${(after.bio || '').length}`,
  );
  console.log(
    `  data_source:         ${before.data_source}  ->  ${after.data_source}`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const mode = WRITE ? 'WRITE' : 'DRY-RUN';
  console.log(`\n=== FIX GALLREIN WITH CORRECTED AUDIT (${mode}) ===`);

  const pacAudit = loadPacAudit();
  const cx = loadCrossref();
  console.log(
    `PAC audit:   ${Object.keys(pacAudit.by_pac).length} PACs / $${pacAudit.summary.total_all_cycles.toLocaleString()} total / ${pacAudit.summary.unique_earmarked_donors} unique earmark bundlers`,
  );
  console.log(
    `Cross-ref:   ${cx.totals.high_conf_match_count} HC matches / $${cx.totals.high_conf_total_to_candidate.toLocaleString()} to candidate / $${cx.totals.combined_career_to_pro_israel.toLocaleString()} career`,
  );

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const existing = await fetchExisting(supabase);
  console.log(
    `\nFetched existing row: ${existing.name} (score=${existing.corruption_score}, tier=${existing.juice_box_tier}, total_funds=$${existing.total_funds}, israel_lobby_total=$${existing.israel_lobby_total})`,
  );

  const next = build(existing, cx, pacAudit);
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
      'bioguide_id,name,corruption_score,juice_box_tier,total_funds,aipac_funding,israel_lobby_total,data_source',
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

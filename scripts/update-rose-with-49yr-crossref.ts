#!/usr/bin/env npx tsx
/**
 * Merge the 49-year pro-Israel individual-donor cross-reference for
 * Rep. John Rose's FEDERAL House committee (C00652743, cycles 2020-2026)
 * into the Snitched.ai Supabase row (bioguide_id = "tn-gov-2026-john-rose").
 *
 * Reads:
 *   data/rose-federal-49yr-crossref-2026-04-24.json  (produced by
 *     scripts/crossref-rose-federal-49yr-pro-israel.ts)
 *
 * Updates:
 *   - israel_lobby_breakdown.individual_registry — keeps the existing
 *     William Smith ($35 JStreet) seed and appends 17 new HC matches.
 *     individual_registry.bundlers_total gets refreshed.
 *   - israel_lobby_total — adds any 2026-cycle portion from these matches.
 *     (Current run: $0 2026, so live total unchanged.)
 *   - source_ids.historical_breakdown.individual_registry_49yr — new
 *     sub-object holding the pre-2026 portion for context (cycle-only
 *     scoring policy).
 *   - source_ids.red_flags — one new HIGH flag summarising the 17-match
 *     direct-bundler pattern plus 15/31 overlap with the AIPAC earmark
 *     list and the Olswanger + Barney Byrd Blackburn overlap.
 *   - bio — short appendix describing the 49-year cross-ref result.
 *
 * CLI
 * ---
 *   npx tsx scripts/update-rose-with-49yr-crossref.ts            # dry-run
 *   npx tsx scripts/update-rose-with-49yr-crossref.ts --dry-run  # explicit
 *   npx tsx scripts/update-rose-with-49yr-crossref.ts --write    # commit
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

const BIOGUIDE_ID = 'tn-gov-2026-john-rose';
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const CROSSREF_PATH = path.join(
  DATA_DIR,
  'rose-federal-49yr-crossref-2026-04-24.json',
);

// ---------------------------------------------------------------------------
// Crossref shape
// ---------------------------------------------------------------------------

interface CrossrefMatch {
  name: string;
  state: string;
  employer_last_seen: string;
  occupation_last_seen: string;
  to_rose_all_cycles: number;
  to_rose_by_cycle: Record<string, number>;
  career_to_pro_israel_pacs: number;
  pacs_given_to: string[];
  pro_israel_cycles: string[];
  also_on_aipac_earmark_list: boolean;
  also_on_blackburn_tn_gov: boolean;
  also_on_rose_tn_gov: boolean;
  also_on_sc01_candidates: boolean;
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
  rose_donor_universe: {
    committee_id: string;
    candidate_id: string;
    unique_donors: number;
    total_itemized_receipts: number;
    cycles: number[];
    by_cycle: Record<string, { rows: number; total: number }>;
  };
  matches: CrossrefMatch[];
  totals: {
    high_conf_match_count: number;
    high_conf_total_to_rose: number;
    combined_career_to_pro_israel: number;
    cycle_2026_live_signal: number;
    historical_cycles_signal: number;
    cross_identified_with_blackburn_tn_gov: string[];
    cross_identified_with_aipac_earmark_bundlers: string[];
    cross_identified_with_sc01_candidates: string[];
    cross_identified_with_rose_tn_gov: string[];
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
// Politician row (subset we touch — preserves unknown fields via spread)
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
// Build new field values
// ---------------------------------------------------------------------------

interface IndividualRegistryEntry {
  name: string;
  state: string;
  to_rose: number;
  to_rose_by_cycle: Record<string, number>;
  career_to_pro_israel_pacs: number;
  pacs: string[];
  pro_israel_cycles: string[];
  employer?: string;
  occupation?: string;
  also_on_aipac_earmark_list?: boolean;
  also_on_blackburn_tn_gov?: boolean;
  foreign_money_flag?: string;
  source: string;
}

function buildRegistryEntries(cx: Crossref): IndividualRegistryEntry[] {
  return cx.matches.map(m => {
    const e: IndividualRegistryEntry = {
      name: m.name,
      state: m.state,
      to_rose: m.to_rose_all_cycles,
      to_rose_by_cycle: m.to_rose_by_cycle,
      career_to_pro_israel_pacs: m.career_to_pro_israel_pacs,
      pacs: m.pacs_given_to,
      pro_israel_cycles: m.pro_israel_cycles,
      also_on_aipac_earmark_list: m.also_on_aipac_earmark_list,
      also_on_blackburn_tn_gov: m.also_on_blackburn_tn_gov,
      source: 'federal-house-C00652743-cycles-2020-2026',
    };
    if (m.employer_last_seen) e.employer = m.employer_last_seen;
    if (m.occupation_last_seen) e.occupation = m.occupation_last_seen;
    if (m.foreign_money_flag) e.foreign_money_flag = m.foreign_money_flag;
    return e;
  });
}

const BIO_APPENDIX = [
  '',
  '',
  "UPDATE 2026-04-24 (49-YEAR INDIVIDUAL-DONOR CROSS-REF): Cross-referenced Rose's full federal House Schedule A individual donor list (1,262 unique donors, $2.98M itemized across cycles 2020-2026, committee C00652743) against the 49-year pro-Israel individual-donor registry (1978-2026, 40,276 unique individuals / 37,768 high-confidence index keys). Method: exact last name + full first name + state match (NFD-normalized, suffix-stripped). Found **17 high-confidence pro-Israel-bundler donors** who gave directly to Rose's federal House committee totalling **$50,641.90** across his 4 cycles in office. Combined career pro-Israel PAC giving by those 17 donors: **$536,158**. 15 of Rose's 31 AIPAC-PAC earmarked bundlers (from the 2026-04-24 PAC-disbursement audit) also appear as *direct* donors to Rose's committee — confirming the AIPAC conduit pattern is accompanied by direct checks. Two donors appear on BOTH Rose's federal list and Blackburn's TN-gubernatorial list: Sam Olswanger (Akin Gump / FARA) and Barney Byrd (TN) — cross-candidate pro-Israel-network coordination signal. 2026 cycle live portion: $0 (all 17 matches gave in 2020/2022/2024 only), so live israel_lobby_total is unchanged per Snitched cycle-only scoring policy; historical portion preserved in source_ids.historical_breakdown.individual_registry_49yr.",
].join('\n');

function build(cx: Crossref, existing: PoliticianRow): PoliticianRow {
  // Registry entries from the 49-yr cross-ref
  const newEntries = buildRegistryEntries(cx);

  // Preserve existing individual_registry (William Smith $35 JStreet was seeded
  // from the TN-REF state cross-ref). Existing schema uses `top_donors`; we
  // normalise it into the new `entries` format while keeping the original
  // object around so we don't lose provenance.
  const breakdownIn = existing.israel_lobby_breakdown || {};
  const priorIndividual =
    (breakdownIn.individual_registry as Record<string, unknown>) || {};
  const priorTopDonors = Array.isArray(priorIndividual.top_donors)
    ? (priorIndividual.top_donors as Array<Record<string, unknown>>)
    : [];
  const priorTnRefEntries: IndividualRegistryEntry[] = priorTopDonors.map(d => ({
    name: String(d.name || ''),
    state: String(d.state || ''),
    to_rose: Number(d.to_candidate) || 0,
    to_rose_by_cycle: { '2026': Number(d.to_candidate) || 0 },
    career_to_pro_israel_pacs:
      Number(d.career_to_pro_israel_pacs) || 0,
    pacs: Array.isArray(d.pacs) ? (d.pacs as string[]) : [],
    pro_israel_cycles: [],
    source: 'tn-ref-11451-2026-state-gov',
  }));

  // Dedup: if an entry with the same (name|state) already exists in new federal
  // matches we prefer the federal-source entry, but we always keep prior TN-REF
  // entries that do NOT collide (William Smith only gave to state, not federal).
  const newKeys = new Set(newEntries.map(e => `${e.name}|${e.state}`));
  const keptPrior = priorTnRefEntries.filter(
    e => !newKeys.has(`${e.name}|${e.state}`),
  );

  const allEntries = [...keptPrior, ...newEntries];

  // William Smith $35 was the existing LIVE bundlers value (TN-gov 2026 cycle).
  // Preserve it; add any new 2026-cycle federal portion on top.
  const priorLiveBundlers = Number(breakdownIn.bundlers) || 0;
  const cycle2026Live =
    priorLiveBundlers + cx.totals.cycle_2026_live_signal;
  const historicalIndividual = cx.totals.historical_cycles_signal;

  const newIndividualRegistry = {
    ...priorIndividual,
    schema_version: 2,
    method: cx.method,
    registry_years: cx.registry.years,
    registry_unique_individuals: cx.registry.unique_individuals,
    registry_index_keys: cx.registry.index_keys,
    rose_donor_universe: cx.rose_donor_universe,
    entries: allEntries,
    match_count: allEntries.length,
    bundlers_total: Math.round(
      allEntries.reduce((s, e) => {
        const r = e as Record<string, unknown>;
        const n = Number((r.to_rose as number) || 0);
        return s + n;
      }, 0) * 100,
    ) / 100,
    cycle_2026_live_subtotal: cycle2026Live,
    historical_pre_2026_subtotal: historicalIndividual,
    cross_identified_with_blackburn_tn_gov:
      cx.totals.cross_identified_with_blackburn_tn_gov,
    cross_identified_with_aipac_earmark_bundlers:
      cx.totals.cross_identified_with_aipac_earmark_bundlers,
    generated_at: cx.generated_at,
    source_file: 'data/rose-federal-49yr-crossref-2026-04-24.json',
  };

  // Refresh the breakdown: only 2026-cycle portion rolls into live totals
  const priorPacs = Number(breakdownIn.pacs) || 0;
  const priorIe = Number(breakdownIn.ie) || 0;
  const newBundlersLive = cycle2026Live;
  const newTotal = priorPacs + priorIe + newBundlersLive;

  const newBreakdown: Record<string, unknown> = {
    ...breakdownIn,
    individual_registry: newIndividualRegistry,
    bundlers: newBundlersLive,
    total: newTotal,
    note:
      (breakdownIn.note as string | undefined) ||
      '2026 cycle only per Snitched cycle-only scoring policy.',
    individual_registry_note: `49-yr individual-donor cross-ref added 2026-04-24: ${cx.matches.length} HC matches totalling $${cx.totals.high_conf_total_to_rose.toLocaleString()} across 2020-2026 federal cycles. 2026-cycle portion: $${cycle2026Live.toLocaleString()} (live). Historical $${historicalIndividual.toLocaleString()} preserved in source_ids.historical_breakdown.individual_registry_49yr.`,
  };

  // Historical breakdown — append, preserving prior PAC-audit historical
  const priorHistorical =
    (existing.source_ids?.historical_breakdown as Record<string, unknown>) || {};
  const historical49yr = {
    registry_years: cx.registry.years,
    match_count: cx.matches.length,
    total_to_rose_historical: historicalIndividual,
    total_to_rose_all_cycles: cx.totals.high_conf_total_to_rose,
    combined_career_to_pro_israel: cx.totals.combined_career_to_pro_israel,
    overlap_with_aipac_earmark_bundlers:
      cx.totals.cross_identified_with_aipac_earmark_bundlers.length,
    overlap_with_blackburn_tn_gov:
      cx.totals.cross_identified_with_blackburn_tn_gov,
    top_matches: cx.matches.slice(0, 10).map(m => ({
      name: m.name,
      state: m.state,
      to_rose_all_cycles: m.to_rose_all_cycles,
      career_to_pro_israel_pacs: m.career_to_pro_israel_pacs,
      pacs: m.pacs_given_to,
    })),
    note:
      'Preserved for context; not counted in live score per Snitched 2026-cycle-only policy.',
  };
  const newHistorical = {
    ...priorHistorical,
    individual_registry_49yr: historical49yr,
  };

  // Red flag
  const priorFlags = (existing.source_ids?.red_flags as RedFlag[]) || [];
  const overlapAipac =
    cx.totals.cross_identified_with_aipac_earmark_bundlers.length;
  const overlapBlackburn = cx.totals.cross_identified_with_blackburn_tn_gov;
  const newFlag: RedFlag = {
    severity: 'high',
    label: `49-year pro-Israel individual-donor cross-ref (1978-2026, 40,276 individuals): ${cx.matches.length} HC bundler-donors gave directly to Rose's federal House committee totalling $${cx.totals.high_conf_total_to_rose.toLocaleString()} across cycles 2020-2026; combined career pro-Israel PAC giving $${cx.totals.combined_career_to_pro_israel.toLocaleString()}. ${overlapAipac}/31 AIPAC-PAC earmarked bundlers are also direct donors — confirms AIPAC-conduit pattern is paired with direct-check capture. Cross-candidate overlap with Blackburn TN-gov donors: ${overlapBlackburn.join(', ') || 'none'}. Top individual bundler: ${cx.matches[0]?.name || 'n/a'} (${cx.matches[0]?.state || '?'}) with career $${cx.matches[0]?.career_to_pro_israel_pacs?.toLocaleString() || '?'} pro-Israel PAC giving. 2026-cycle live portion $${cx.totals.cycle_2026_live_signal.toLocaleString()}; remainder historical.`,
    source:
      'cross-ref data/rose-federal-individual-donors-aggregated.json × data/pro-israel-donors-*.csv (49 years)',
    date: '2020-2026',
  };
  const mergedFlags = [...priorFlags, newFlag];

  const newSourceIds = {
    ...existing.source_ids,
    red_flags: mergedFlags,
    historical_breakdown: newHistorical,
  };

  return {
    ...existing,
    israel_lobby_total: newTotal,
    israel_lobby_breakdown: newBreakdown,
    source_ids: newSourceIds,
    bio: existing.bio + BIO_APPENDIX,
    data_source:
      'audit_2026-04-24_tn_gov_2026_cycle_only_49yr_individual_crossref',
  };
}

// ---------------------------------------------------------------------------
// Score recompute (mirrors update-rose-with-pac-audit.ts)
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
    `  corruption_score:   ${beforeScore}  ->  ${afterScore.score} (grade ${afterScore.grade}, confidence ${afterScore.confidence})`,
  );
  console.log(
    `  israel_lobby_total: $${before.israel_lobby_total}  ->  $${after.israel_lobby_total}`,
  );
  const beforeReg = (before.israel_lobby_breakdown || {}).individual_registry as
    | Record<string, unknown>
    | undefined;
  const afterReg = (after.israel_lobby_breakdown || {}).individual_registry as
    | Record<string, unknown>
    | undefined;
  console.log(
    `  individual_registry.entries:    ${countArr(beforeReg?.entries)}  ->  ${countArr(afterReg?.entries)}`,
  );
  console.log(
    `  individual_registry.bundlers_total:    $${beforeReg?.bundlers_total || 0}  ->  $${afterReg?.bundlers_total || 0}`,
  );
  console.log(
    `  individual_registry.cycle_2026_live_subtotal:    $${afterReg?.cycle_2026_live_subtotal || 0} (new)`,
  );
  console.log(
    `  individual_registry.historical_pre_2026_subtotal: $${afterReg?.historical_pre_2026_subtotal || 0} (new)`,
  );
  const beforeFlags = countArr(
    (before.source_ids || {}).red_flags as unknown[],
  );
  const afterFlags = countArr((after.source_ids || {}).red_flags as unknown[]);
  console.log(`  red_flags:          ${beforeFlags}  ->  ${afterFlags}`);
  const hist = (after.source_ids || {}).historical_breakdown as
    | Record<string, unknown>
    | undefined;
  const histKeys = hist ? Object.keys(hist) : [];
  console.log(`  historical_breakdown keys: [${histKeys.join(', ')}]`);
  console.log(
    `  bio length:         ${before.bio.length}  ->  ${after.bio.length} (+${after.bio.length - before.bio.length})`,
  );
  console.log(`  data_source:        ${before.data_source}  ->  ${after.data_source}`);
  console.log(
    `\nNew red flag:\n  [${mergedLast(after).severity}] ${String(mergedLast(after).label).slice(0, 400)}${String(mergedLast(after).label).length > 400 ? '...' : ''}`,
  );
  console.log(`\nindividual_registry.entries[0..2] preview:`);
  const preview = (afterReg?.entries as unknown[] | undefined)?.slice(0, 3) || [];
  for (const e of preview) {
    console.log(`  ${JSON.stringify(e).slice(0, 240)}`);
  }
}

function mergedLast(after: PoliticianRow): RedFlag {
  const flags = (after.source_ids?.red_flags as RedFlag[]) || [];
  return flags[flags.length - 1];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const mode = WRITE ? 'WRITE' : 'DRY-RUN';
  console.log(`\n=== UPDATE ROSE WITH 49-YR INDIVIDUAL CROSSREF (${mode}) ===`);

  const cx = loadCrossref();
  console.log(`Registry:  ${cx.registry.years}  (${cx.registry.year_count} yrs, ${cx.registry.unique_individuals} individuals, ${cx.registry.index_keys} keys)`);
  console.log(`Rose universe: ${cx.rose_donor_universe.unique_donors} donors / $${cx.rose_donor_universe.total_itemized_receipts.toLocaleString()} across ${cx.rose_donor_universe.cycles.join(',')}`);
  console.log(`Matches:       ${cx.totals.high_conf_match_count}`);
  console.log(`  to Rose:       $${cx.totals.high_conf_total_to_rose.toLocaleString()}`);
  console.log(`  2026 live:     $${cx.totals.cycle_2026_live_signal.toLocaleString()}`);
  console.log(`  historical:    $${cx.totals.historical_cycles_signal.toLocaleString()}`);
  console.log(`  career $:      $${cx.totals.combined_career_to_pro_israel.toLocaleString()}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const existing = await fetchExisting(supabase);
  console.log(
    `\nFetched existing row: ${existing.name} (score=${existing.corruption_score}, tier=${existing.juice_box_tier}, israel_lobby_total=$${existing.israel_lobby_total})`,
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
      'bioguide_id,name,corruption_score,juice_box_tier,israel_lobby_total,data_source',
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

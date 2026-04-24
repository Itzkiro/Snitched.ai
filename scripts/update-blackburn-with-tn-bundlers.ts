#!/usr/bin/env npx tsx
/**
 * Update Marsha Blackburn's tn-gov-2026-marsha-blackburn Supabase row with
 * pro-Israel bundler findings from the TN REF gubernatorial donor list
 * cross-ref against the 33,719-key pro-Israel individual-donor registry.
 *
 * Source artifact: data/blackburn-tn-gov-cross-ref-2026.json
 *   - 25 high-confidence matches (last + full first name + state exact)
 *   - $64,554 to Blackburn TN-gov cmte this cycle
 *   - $3,531,773 combined career to pro-Israel PACs (skewed by $3M Uihlein/Adelson nexus)
 *
 * Merges new TN bundler data with existing federal-Senate bundler row
 * (4 high-conf federal bundlers = $54,681 → 29 combined high-conf = $119,235).
 *
 * Delta applied:
 *   israel_lobby_total:                     $73,886  -> $138,440
 *   israel_lobby_breakdown.bundlers:        $54,681  -> $119,235
 *   individual_registry.matches:            4        -> 29
 *   individual_registry.high_confidence:    4        -> 29
 *   individual_registry.itemized_rows:      1,020    -> 36,338
 *   these_donors_to_pro_israel_career:      $3.7M    -> $7.23M
 *   source_ids.red_flags:                   8        -> 12 (4 high appended)
 *   juice_box_tier:                         compromised -> bought  (floor 45 -> 70)
 *   data_source:                            audit_2026-04-23_tn_gov_2026_cycle_only_with_tn_cross_ref
 *
 * CLI:
 *   npx tsx scripts/update-blackburn-with-tn-bundlers.ts --dry-run   (default)
 *   npx tsx scripts/update-blackburn-with-tn-bundlers.ts --write
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

const BIOGUIDE_ID = 'tn-gov-2026-marsha-blackburn';
const CROSSREF_PATH = path.join(__dirname, '..', 'data', 'blackburn-tn-gov-cross-ref-2026.json');
const NEW_DATA_SOURCE = 'audit_2026-04-23_tn_gov_2026_cycle_only_with_tn_cross_ref';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CrossRefMatch {
  name: string;
  state: string;
  to_blackburn: number;
  career_to_pro_israel_pacs: number;
  employer?: string;
  occupation?: string;
  pacs: string[];
  foreign_money_flag?: string;
}

interface CrossRefFile {
  source: string;
  method: string;
  total_individual_rows_scanned: number;
  unique_donors: number;
  total_raised_individual: number;
  matches: CrossRefMatch[];
  totals: {
    bundler_count: number;
    to_blackburn_sum: number;
    career_to_pro_israel_sum: number;
  };
  notable_clusters: Array<Record<string, unknown>>;
  generated_at: string;
}

interface RedFlag {
  severity: 'high' | 'med' | 'low';
  label: string;
  source: string;
  date: string;
}

interface IndividualRegistry {
  matches: number;
  source: string;
  itemized_individual_rows: number;
  high_confidence: number;
  medium_confidence?: string | number;
  these_donors_to_pro_israel_career: number;
  to_candidate: number;
  top_donors: Array<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Append-only 4 new high-severity red_flags (do NOT drop existing 8)
// ---------------------------------------------------------------------------

const NEW_RED_FLAGS: RedFlag[] = [
  {
    severity: 'high',
    label:
      '$10,600 from Elizabeth Uihlein (Uline CEO, IL) — $3,000,000 career to Preserve America PAC (Miriam Adelson\'s super PAC); single largest pro-Israel-network donor pool of the cycle',
    source: 'TN REF fullReportExcelExport 2026',
    date: '2026-04-23',
  },
  {
    severity: 'high',
    label:
      '$10,600 from Sam Olswanger (Senior Policy Advisor, AKIN GUMP STRAUSS HAUER & FELD — FARA-registered firm representing foreign sovereigns); $6,750 career to Pro-Israel America/AIPAC',
    source: 'TN REF + FARA cross-ref',
    date: '2026-04-23',
  },
  {
    severity: 'high',
    label:
      '$13,100 concentrated cluster from Belz Memphis Jewish-philanthropy real-estate dynasty (Rachel Belz $10,600 + Andrew Groveman/Belz Enterprises $2,500); $259K combined career to Pro-Israel America/AIPAC/UDP/Washington PAC',
    source: 'TN REF cross-ref',
    date: '2026-04-23',
  },
  {
    severity: 'high',
    label:
      'Total cycle Israel-lobby signal upgrades from $73,886 (federal Senate cmte only) to $138,440 (federal + TN gov cmte combined): 29 high-confidence individual bundlers connected to $7.23M lifetime pro-Israel-PAC giving',
    source: 'Snitched audit 2026-04-23 (cross-cmte)',
    date: '2026-04-23',
  },
];

const BIO_APPEND = ` Updated 2026-04-23 — TN REF gubernatorial donor list cross-ref against the 33,719-key pro-Israel donor registry surfaced 25 additional high-confidence bundlers (last+full-first-name+state exact match) totaling $64,554 → Blackburn from individuals connected to $3.53M career pro-Israel-PAC giving. Standout findings: Elizabeth Uihlein (Uline CEO, IL — $3M career to Miriam Adelson's Preserve America PAC), Sam Olswanger (Akin Gump FARA-firm Senior Policy Advisor, DC), and a concentrated $13,100 Memphis Belz-family cluster (Rachel Belz + Andrew Groveman of Belz Enterprises). Combined cycle Israel-lobby direct signal (federal + state): $138,440 across 29 high-conf bundlers tied to $7.23M lifetime pro-Israel-PAC giving.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadCrossRef(): CrossRefFile {
  const raw = fs.readFileSync(CROSSREF_PATH, 'utf8');
  return JSON.parse(raw) as CrossRefFile;
}

function mergeIndividualRegistry(
  existing: IndividualRegistry,
  crossref: CrossRefFile,
): IndividualRegistry {
  const newBundlerDonors = crossref.matches.map(m => ({
    name: m.name,
    state: m.state,
    confidence: 'high',
    source: 'tn_ref_2026_cross_ref',
    to_candidate: m.to_blackburn,
    career_to_pro_israel_pacs: m.career_to_pro_israel_pacs,
    pacs: m.pacs,
    ...(m.employer ? { employer: m.employer } : {}),
    ...(m.occupation ? { occupation: m.occupation } : {}),
    ...(m.foreign_money_flag ? { foreign_money_flag: m.foreign_money_flag } : {}),
  }));

  const mergedTopDonors = [...(existing.top_donors || []), ...newBundlerDonors];

  return {
    matches: (existing.matches || 0) + crossref.totals.bundler_count, // 4 + 25 = 29
    source: 'fec_2026_senate-high-conf-only + tn_ref_2026_gov_cross_ref',
    itemized_individual_rows:
      (existing.itemized_individual_rows || 0) + crossref.total_individual_rows_scanned, // 1020 + 35318
    high_confidence: (existing.high_confidence || 0) + crossref.totals.bundler_count, // 4 + 25
    medium_confidence: existing.medium_confidence,
    these_donors_to_pro_israel_career:
      (existing.these_donors_to_pro_israel_career || 0) +
      crossref.totals.career_to_pro_israel_sum, // 3.7M + 3.53M
    to_candidate: (existing.to_candidate || 0) + crossref.totals.to_blackburn_sum, // 54681 + 64554
    top_donors: mergedTopDonors,
  };
}

// ---------------------------------------------------------------------------
// Main update routine
// ---------------------------------------------------------------------------

interface PlannedUpdate {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  payload: Record<string, unknown>;
  score_before: number;
  score_after: number;
  grade_after: string;
  confidence_after: string;
}

async function buildPlannedUpdate(supabase: SupabaseClient): Promise<PlannedUpdate> {
  const { data: row, error } = await supabase
    .from('politicians')
    .select('*')
    .eq('bioguide_id', BIOGUIDE_ID)
    .single();
  if (error || !row) throw new Error(`load: ${error?.message ?? 'not found'}`);

  const crossref = loadCrossRef();

  // Snapshot "before"
  const existingBreakdown = (row.israel_lobby_breakdown ?? {}) as Record<string, unknown>;
  const existingRegistry =
    (existingBreakdown.individual_registry ?? {}) as IndividualRegistry;
  const existingSourceIds = (row.source_ids ?? {}) as Record<string, unknown>;
  const existingRedFlags = (existingSourceIds.red_flags ?? []) as RedFlag[];

  const before = {
    corruption_score: row.corruption_score,
    juice_box_tier: row.juice_box_tier,
    israel_lobby_total: row.israel_lobby_total,
    bundlers: existingBreakdown.bundlers,
    registry_matches: existingRegistry.matches,
    registry_high_confidence: existingRegistry.high_confidence,
    itemized_individual_rows: existingRegistry.itemized_individual_rows,
    these_donors_to_pro_israel_career: existingRegistry.these_donors_to_pro_israel_career,
    to_candidate: existingRegistry.to_candidate,
    top_donors_count: (existingRegistry.top_donors ?? []).length,
    red_flags_count: existingRedFlags.length,
    data_source: row.data_source,
  };

  // Merge new bundler data
  const mergedRegistry = mergeIndividualRegistry(existingRegistry, crossref);

  // Updated israel_lobby_breakdown (preserve existing fields like pacs, pac_details, ie, source, note)
  const newBundlersTotal =
    (Number(existingBreakdown.bundlers) || 0) + crossref.totals.to_blackburn_sum; // 54681 + 64554 = 119235
  const newIsraelLobbyTotal =
    Number(row.israel_lobby_total || 0) + crossref.totals.to_blackburn_sum; // 73886 + 64554 = 138440

  const updatedBreakdown = {
    ...existingBreakdown,
    bundlers: newBundlersTotal,
    total: newIsraelLobbyTotal,
    source: 'fec_2026_senate + tn_ref_2026_gov (cycle-only)',
    individual_registry: mergedRegistry,
    note:
      '2026-cycle ONLY. Federal Senate cmte + TN REF gov cmte combined. Historical Senate cycles 2018+2024 not loaded into live score per cycle-only policy; lifetime pro-Israel-lobby total per BoughtByZionism / TrackAIPAC is $587K+ across her career — see source_ids.historical_breakdown.',
  };

  // Merge red_flags (append-only, preserve existing 8)
  const mergedRedFlags: RedFlag[] = [...existingRedFlags, ...NEW_RED_FLAGS];

  const updatedSourceIds: Record<string, unknown> = {
    ...existingSourceIds,
    red_flags: mergedRedFlags,
  };

  // Bio append
  const updatedBio = (row.bio || '') + BIO_APPEND;

  // Tier bump curator-set
  const updatedTier: 'bought' = 'bought';

  // Build shadow politician for score recomputation
  const shadow = {
    id: BIOGUIDE_ID,
    name: row.name,
    office: row.office,
    officeLevel: row.office_level,
    party: row.party,
    jurisdiction: row.jurisdiction,
    jurisdictionType: row.jurisdiction_type,
    corruptionScore: 0,
    juiceBoxTier: updatedTier,
    aipacFunding: row.aipac_funding, // 19205 NORPAC (unchanged — direct pro-Israel PAC only)
    totalFundsRaised: row.total_funds,
    top5Donors: row.top5_donors,
    contributionBreakdown: row.contribution_breakdown,
    israelLobbyTotal: newIsraelLobbyTotal,
    israelLobbyBreakdown: updatedBreakdown,
    isActive: row.is_active,
    bio: updatedBio,
    source_ids: updatedSourceIds,
    dataSource: NEW_DATA_SOURCE,
    courtCases: row.court_records ?? [],
    lobbyingRecords: row.lobbying_records ?? [],
    votes: row.voting_records ?? [],
    votingRecords: row.voting_records ?? [],
  } as unknown as Politician;

  const scoreResult = computeCorruptionScore(shadow);

  const after = {
    corruption_score: scoreResult.score,
    grade: scoreResult.grade,
    confidence: scoreResult.confidence,
    juice_box_tier: updatedTier,
    israel_lobby_total: newIsraelLobbyTotal,
    bundlers: newBundlersTotal,
    registry_matches: mergedRegistry.matches,
    registry_high_confidence: mergedRegistry.high_confidence,
    itemized_individual_rows: mergedRegistry.itemized_individual_rows,
    these_donors_to_pro_israel_career: mergedRegistry.these_donors_to_pro_israel_career,
    to_candidate: mergedRegistry.to_candidate,
    top_donors_count: mergedRegistry.top_donors.length,
    red_flags_count: mergedRedFlags.length,
    data_source: NEW_DATA_SOURCE,
  };

  const payload = {
    israel_lobby_total: newIsraelLobbyTotal,
    israel_lobby_breakdown: updatedBreakdown,
    juice_box_tier: updatedTier,
    corruption_score: scoreResult.score,
    source_ids: updatedSourceIds,
    bio: updatedBio,
    data_source: NEW_DATA_SOURCE,
    updated_at: new Date().toISOString(),
  };

  return {
    before,
    after,
    payload,
    score_before: Number(row.corruption_score) || 0,
    score_after: scoreResult.score,
    grade_after: scoreResult.grade,
    confidence_after: scoreResult.confidence,
  };
}

function printDiff(plan: PlannedUpdate): void {
  console.log('\n=== PLANNED DIFF — tn-gov-2026-marsha-blackburn ===');
  const keys = Object.keys(plan.before) as Array<keyof typeof plan.before>;
  const maxKey = Math.max(...keys.map(k => String(k).length));
  const pad = (s: string, n: number): string => s + ' '.repeat(Math.max(0, n - s.length));
  for (const k of keys) {
    const b = plan.before[k as keyof typeof plan.before];
    const a = plan.after[k as keyof typeof plan.after];
    const bStr = typeof b === 'number' ? b.toLocaleString() : String(b);
    const aStr = typeof a === 'number' ? a.toLocaleString() : String(a);
    const changed = bStr !== aStr;
    const marker = changed ? '*' : ' ';
    console.log(`  ${marker} ${pad(String(k), maxKey)}  ${pad(bStr, 18)}  ->  ${aStr}`);
  }
  console.log(
    `\n  score: ${plan.score_before} -> ${plan.score_after} (grade ${plan.grade_after}, confidence ${plan.confidence_after})`,
  );
}

async function writePayload(supabase: SupabaseClient, plan: PlannedUpdate): Promise<void> {
  const { error } = await supabase
    .from('politicians')
    .update(plan.payload)
    .eq('bioguide_id', BIOGUIDE_ID);
  if (error) throw new Error(`update: ${error.message}`);
}

async function verifyRow(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase
    .from('politicians')
    .select(
      'bioguide_id,name,corruption_score,juice_box_tier,israel_lobby_total,israel_lobby_breakdown,data_source,source_ids',
    )
    .eq('bioguide_id', BIOGUIDE_ID)
    .single();
  if (error || !data) throw new Error(`verify: ${error?.message ?? 'not found'}`);

  const breakdown = (data.israel_lobby_breakdown ?? {}) as Record<string, unknown>;
  const registry = (breakdown.individual_registry ?? {}) as IndividualRegistry;
  const sourceIds = (data.source_ids ?? {}) as Record<string, unknown>;
  const redFlags = (sourceIds.red_flags ?? []) as RedFlag[];
  const highCount = redFlags.filter(f => f.severity === 'high').length;
  const medCount = redFlags.filter(f => f.severity === 'med').length;

  console.log('\n=== DB VERIFY ===');
  console.log(`  name:                  ${data.name}`);
  console.log(`  corruption_score:      ${data.corruption_score}`);
  console.log(`  juice_box_tier:        ${data.juice_box_tier}`);
  console.log(`  israel_lobby_total:    $${Number(data.israel_lobby_total).toLocaleString()}`);
  console.log(`  bundlers (breakdown):  $${Number(breakdown.bundlers || 0).toLocaleString()}`);
  console.log(`  registry.matches:      ${registry.matches}`);
  console.log(`  registry.high_conf:    ${registry.high_confidence}`);
  console.log(`  registry.to_candidate: $${Number(registry.to_candidate || 0).toLocaleString()}`);
  console.log(
    `  registry.career_sum:   $${Number(registry.these_donors_to_pro_israel_career || 0).toLocaleString()}`,
  );
  console.log(`  top_donors:            ${(registry.top_donors || []).length} entries`);
  console.log(`  red_flags:             ${redFlags.length} (high=${highCount}, med=${medCount})`);
  console.log(`  data_source:           ${data.data_source}`);
}

function printFinalTable(plan: PlannedUpdate): void {
  console.log('\n=== FINAL SUMMARY ===');
  const rows: Array<[string, string, string]> = [
    ['corruption_score', String(plan.score_before), `${plan.score_after}`],
    ['grade', '-', plan.grade_after],
    ['juice_box_tier', String(plan.before.juice_box_tier), String(plan.after.juice_box_tier)],
    [
      'israel_lobby_total',
      `$${Number(plan.before.israel_lobby_total || 0).toLocaleString()}`,
      `$${Number(plan.after.israel_lobby_total || 0).toLocaleString()}`,
    ],
    [
      'bundlers (high-conf)',
      String(plan.before.registry_high_confidence || 0),
      String(plan.after.registry_high_confidence || 0),
    ],
    [
      'career-to-pro-israel-PACs',
      `$${Number(plan.before.these_donors_to_pro_israel_career || 0).toLocaleString()}`,
      `$${Number(plan.after.these_donors_to_pro_israel_career || 0).toLocaleString()}`,
    ],
    [
      'red_flags count',
      String(plan.before.red_flags_count || 0),
      String(plan.after.red_flags_count || 0),
    ],
  ];
  const head = ['field', 'before', 'after'];
  console.log(head.join(' | '));
  console.log(head.map(h => '-'.repeat(h.length)).join('-|-'));
  for (const r of rows) console.log(r.join(' | '));
}

async function main(): Promise<void> {
  const mode = WRITE ? 'WRITE' : 'DRY-RUN';
  console.log(`=== UPDATE BLACKBURN TN-GOV BUNDLERS (${mode}) ===`);
  console.log(`  bioguide_id: ${BIOGUIDE_ID}`);
  console.log(`  cross-ref artifact: ${CROSSREF_PATH}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const plan = await buildPlannedUpdate(supabase);
  printDiff(plan);

  if (DRY_RUN) {
    printFinalTable(plan);
    console.log('\nDRY-RUN complete. Re-run with --write to commit.');
    return;
  }

  console.log('\n=== WRITING TO SUPABASE ===');
  await writePayload(supabase, plan);
  await verifyRow(supabase);
  printFinalTable(plan);
  console.log('\nWRITE complete.');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env npx tsx
/**
 * Rescore Tyler Dykes (sc-01-2026-tyler-dykes) under the 2026-04-23 user
 * scoring policy: "Anybody that is ANTI-AIPAC is good."
 *
 * Dykes publicly calls for AIPAC to register under FARA and opposes all
 * foreign aid including to Israel. Under the new policy this flips him from
 * "captured by J6/Charlottesville/USMC flags" to "America First anti-lobby
 * grassroots R challenger" — his corruption score should drop accordingly.
 *
 * Mutations:
 *   1. source_ids.red_flags: replace the 3 curator-added flags (J6 felony,
 *      Charlottesville state felony, USMC OTH discharge) with []. Any
 *      [roster-match] auto-flags are preserved (Dykes has none — clean
 *      grassroots fundraising, $5K raised, zero pro-Israel PAC dollars).
 *   2. source_ids.positions.scoring_note: explicit paper trail for the
 *      policy call so future audits can see why J6/Charlottesville aren't
 *      counted.
 *   3. bio: rewrite to lead with the anti-AIPAC signal and recast the J6/
 *      Charlottesville material as biographical context rather than red
 *      flag framing.
 *   4. data_source: bumped to audit_2026-04-23_sc01_anti_aipac_policy so
 *      the policy-driven rescore is traceable.
 *   5. corruption_score: recomputed via lib/corruption-score with the
 *      red_flags array emptied — the +5/+2/cap-30 curator contribution
 *      drops to 0, so the final score falls to the ratio-based baseline
 *      (expected ~0-2 / grade A given zero Israel dollars, zero itemized
 *      PAC money, and $5K raised in small-dollar contributions).
 *
 * Preserved (explicit non-mutations):
 *   - source_ids.fec_candidate_id
 *   - any [roster-match] auto-generated red_flags (Dykes has none, but the
 *     filter runs generically)
 *   - contribution_breakdown, israel_lobby_breakdown/_total, top5_donors,
 *     voting_records, juice_box_tier, tags, office metadata
 *
 * CLI:
 *   npx tsx scripts/rescore-dykes-america-first.ts            # dry-run (default)
 *   npx tsx scripts/rescore-dykes-america-first.ts --dry-run  # dry-run explicit
 *   npx tsx scripts/rescore-dykes-america-first.ts --write    # commit to Supabase
 */
import 'dotenv/config';
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BIOGUIDE_ID = 'sc-01-2026-tyler-dykes';
const DATA_SOURCE = 'audit_2026-04-23_sc01_anti_aipac_policy';
const POLICY_DATE = '2026-04-23';
const POLICY_QUOTE = "Anybody that is ANTI-AIPAC is good";

const NEW_BIO =
  "Republican challenger in SC-01's 2026 primary to replace outgoing Rep. Nancy Mace. " +
  "Bluffton resident, 27-year-old Marine Corps veteran, and the only SC-01 GOP candidate " +
  "explicitly calling for AIPAC to register under the Foreign Agents Registration Act (FARA). " +
  "Runs on an America First platform: oppose all foreign aid (including to Israel), restrict " +
  "immigration, restore domestic industrial base. Biographical context: pardoned by President " +
  "Trump in January 2025 for Jan 6, 2021 Capitol-riot convictions; a separate Virginia state " +
  "felony from the 2017 Charlottesville events is part of his public record. Campaign raised " +
  "$5K reported to FEC through Q1 2026 — entirely small-dollar grassroots, zero pro-Israel " +
  "PAC or bundler dollars.";

const NEW_SCORING_NOTE =
  "Anti-AIPAC stance = Snitched positive signal. J6/Charlottesville not scored as red flags " +
  `per user policy ${POLICY_DATE}: '${POLICY_QUOTE}'.`;

// The three curator red_flags to remove by label-prefix match. We match on
// a stable prefix (not full label) so minor wording drift in the DB still
// clears. Any flag whose label starts with `[roster-match]` or any other
// curator label not in this list is preserved.
const REMOVE_FLAG_PREFIXES: ReadonlyArray<string> = [
  'J6 Capitol riot felony',
  '2017 Charlottesville Unite-the-Right',
  'Other-than-honorable discharge from USMC',
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RedFlag {
  severity?: string;
  label?: string;
  source?: string;
  date?: string;
  [k: string]: unknown;
}

interface SourceIds {
  red_flags?: RedFlag[];
  positions?: Record<string, string>;
  fec_candidate_id?: string;
  [k: string]: unknown;
}

interface ExistingRow {
  bioguide_id: string;
  name: string;
  bio?: string | null;
  is_active?: boolean | null;
  is_candidate?: boolean | null;
  running_for?: string | null;
  corruption_score?: number | null;
  data_source?: string | null;
  source_ids?: SourceIds | null;
  voting_records?: unknown;
  contribution_breakdown?: Record<string, unknown> | null;
  israel_lobby_breakdown?: Record<string, unknown> | null;
  israel_lobby_total?: number | null;
  top5_donors?: unknown;
  total_funds?: number | null;
  juice_box_tier?: string | null;
  office?: string | null;
  office_level?: string | null;
  party?: string | null;
  jurisdiction?: string | null;
  jurisdiction_type?: string | null;
  tags?: string[] | null;
}

interface PlannedUpdate {
  bioguide_id: string;
  name: string;
  beforeScore: number;
  afterScore: number;
  beforeGrade: string;
  afterGrade: string;
  beforeFlagCount: number;
  afterFlagCount: number;
  removedFlagLabels: string[];
  preservedFlagLabels: string[];
  beforeDataSource: string;
  afterDataSource: string;
  bioChanged: boolean;
  scoringNoteBefore: string | undefined;
  scoringNoteAfter: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRemovable(label: string): boolean {
  const trimmed = (label || '').trim();
  return REMOVE_FLAG_PREFIXES.some(p => trimmed.startsWith(p));
}

function computeGrade(score: number): string {
  if (score <= 20) return 'A';
  if (score <= 40) return 'B';
  if (score <= 60) return 'C';
  if (score <= 80) return 'D';
  return 'F';
}

async function fetchDykes(supabase: SupabaseClient): Promise<ExistingRow> {
  const { data, error } = await supabase
    .from('politicians')
    .select(
      'bioguide_id,name,bio,is_active,is_candidate,running_for,corruption_score,data_source,source_ids,voting_records,contribution_breakdown,israel_lobby_breakdown,israel_lobby_total,top5_donors,total_funds,juice_box_tier,office,office_level,party,jurisdiction,jurisdiction_type',
    )
    .eq('bioguide_id', BIOGUIDE_ID)
    .maybeSingle();
  if (error) throw new Error(`Supabase fetch error: ${error.message}`);
  if (!data) throw new Error(`No DB row for bioguide_id=${BIOGUIDE_ID}`);
  return data as ExistingRow;
}

function buildUpdate(existing: ExistingRow): { payload: Record<string, unknown>; planned: PlannedUpdate } {
  const existingSourceIds: SourceIds = (existing.source_ids || {}) as SourceIds;
  const existingRedFlags: RedFlag[] = Array.isArray(existingSourceIds.red_flags)
    ? existingSourceIds.red_flags
    : [];

  const removedFlagLabels: string[] = [];
  const preservedFlags: RedFlag[] = [];
  for (const rf of existingRedFlags) {
    const label = (rf.label || '').trim();
    if (isRemovable(label)) {
      removedFlagLabels.push(label);
    } else {
      preservedFlags.push(rf);
    }
  }

  const existingPositions: Record<string, string> = (existingSourceIds.positions || {}) as Record<string, string>;
  const newPositions: Record<string, string> = {
    ...existingPositions,
    scoring_note: NEW_SCORING_NOTE,
  };

  const mergedSourceIds: SourceIds = {
    ...existingSourceIds,
    red_flags: preservedFlags,
    positions: newPositions,
  };

  // Build shadow Politician for corruption score recompute.
  const shadowPol = {
    id: BIOGUIDE_ID,
    name: existing.name,
    office: existing.office || 'U.S. House',
    officeLevel: existing.office_level || 'Federal Representative',
    party: existing.party || 'Republican',
    jurisdiction: existing.jurisdiction || 'South Carolina',
    jurisdictionType: existing.jurisdiction_type || 'federal_congressional',
    corruptionScore: 0,
    juiceBoxTier: existing.juice_box_tier || 'none',
    aipacFunding: Number(existing.israel_lobby_total) || 0,
    totalFundsRaised: Number(existing.total_funds) || 0,
    top5Donors: Array.isArray(existing.top5_donors) ? existing.top5_donors : [],
    contributionBreakdown: existing.contribution_breakdown ?? {
      aipac: 0, corporate: 0, otherPACs: 0, individuals: 0, self_funding: 0, pro_israel_pacs: 0,
    },
    israelLobbyTotal: Number(existing.israel_lobby_total) || 0,
    israelLobbyBreakdown: existing.israel_lobby_breakdown || { total: 0, pacs: 0, ie: 0, bundlers: 0 },
    isActive: Boolean(existing.is_active),
    tags: existing.tags || ['candidate', '2026-primary', 'challenger', 'republican'],
    bio: NEW_BIO,
    socialMedia: {},
    source_ids: mergedSourceIds,
    dataSource: DATA_SOURCE,
    courtCases: [],
    lobbyingRecords: [],
    votes: [],
  } as unknown as Politician;

  const scoreResult = computeCorruptionScore(shadowPol);
  const afterScore = scoreResult.score;
  const beforeScore = Number(existing.corruption_score) || 0;

  const payload: Record<string, unknown> = {
    bio: NEW_BIO,
    source_ids: mergedSourceIds,
    corruption_score: afterScore,
    data_source: DATA_SOURCE,
    updated_at: new Date().toISOString(),
  };

  const planned: PlannedUpdate = {
    bioguide_id: BIOGUIDE_ID,
    name: existing.name,
    beforeScore,
    afterScore,
    beforeGrade: computeGrade(beforeScore),
    afterGrade: scoreResult.grade,
    beforeFlagCount: existingRedFlags.length,
    afterFlagCount: preservedFlags.length,
    removedFlagLabels,
    preservedFlagLabels: preservedFlags.map(f => (f.label || '').trim()),
    beforeDataSource: existing.data_source || '',
    afterDataSource: DATA_SOURCE,
    bioChanged: (existing.bio || '') !== NEW_BIO,
    scoringNoteBefore: existingPositions.scoring_note,
    scoringNoteAfter: NEW_SCORING_NOTE,
  };

  return { payload, planned };
}

async function writeUpdate(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('politicians')
    .update(payload)
    .eq('bioguide_id', BIOGUIDE_ID);
  if (error) throw new Error(`Supabase update error: ${error.message}`);
}

async function verifyAfterWrite(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase
    .from('politicians')
    .select('bioguide_id,name,corruption_score,data_source,source_ids')
    .eq('bioguide_id', BIOGUIDE_ID)
    .maybeSingle();
  if (error) throw new Error(`Supabase verify error: ${error.message}`);
  if (!data) throw new Error(`Verify: no row returned for ${BIOGUIDE_ID}`);
  const sid = (data.source_ids || {}) as SourceIds;
  const flags = Array.isArray(sid.red_flags) ? sid.red_flags : [];
  const grade = computeGrade(Number(data.corruption_score) || 0);
  console.log(`\n=== POST-WRITE VERIFICATION ===`);
  console.log(`  bioguide_id:     ${data.bioguide_id}`);
  console.log(`  name:            ${data.name}`);
  console.log(`  corruption_score: ${data.corruption_score} (grade ${grade})`);
  console.log(`  data_source:     ${data.data_source}`);
  console.log(`  red_flags count: ${flags.length}`);
  console.log(`  scoring_note:    ${(sid.positions || {}).scoring_note || '(missing)'}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const mode = WRITE ? 'WRITE' : 'DRY-RUN';
  console.log(`\n=== Dykes America-First Rescore (${mode}) ===`);
  console.log(`policy:      "${POLICY_QUOTE}" (${POLICY_DATE})`);
  console.log(`data_source: ${DATA_SOURCE}\n`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const existing = await fetchDykes(supabase);
  console.log(`Fetched: ${existing.name} (${existing.bioguide_id})`);
  console.log(`  current score:       ${existing.corruption_score} (${computeGrade(Number(existing.corruption_score) || 0)})`);
  console.log(`  current data_source: ${existing.data_source || '(none)'}`);

  const { payload, planned } = buildUpdate(existing);

  console.log(`\n--- Planned changes ---`);
  console.log(`  score: ${planned.beforeScore} (${planned.beforeGrade}) -> ${planned.afterScore} (${planned.afterGrade})`);
  console.log(`  red_flags: ${planned.beforeFlagCount} -> ${planned.afterFlagCount}`);
  if (planned.removedFlagLabels.length > 0) {
    console.log(`  removed flags:`);
    for (const l of planned.removedFlagLabels) console.log(`    - ${l.slice(0, 120)}`);
  }
  if (planned.preservedFlagLabels.length > 0) {
    console.log(`  preserved flags:`);
    for (const l of planned.preservedFlagLabels) console.log(`    + ${l.slice(0, 120)}`);
  } else {
    console.log(`  preserved flags: (none — clean by fundraising)`);
  }
  console.log(`  bio changed:    ${planned.bioChanged}`);
  console.log(`  data_source:    ${planned.beforeDataSource} -> ${planned.afterDataSource}`);
  console.log(`  scoring_note:   ${planned.scoringNoteBefore ?? '(unset)'}`);
  console.log(`               -> ${planned.scoringNoteAfter}`);

  if (WRITE) {
    await writeUpdate(supabase, payload);
    console.log(`\n>>> WRITTEN to Supabase`);
    await verifyAfterWrite(supabase);
  } else {
    console.log(`\nDRY-RUN complete. No DB writes made. Re-run with --write to commit.`);
  }

  // Final summary table (markdown)
  console.log(`\n=== SUMMARY ===`);
  console.log(`| name | old_score | new_score | old_flags | new_flags | data_source |`);
  console.log(`|---|---|---|---|---|---|`);
  console.log(
    `| ${planned.name} | ${planned.beforeScore} (${planned.beforeGrade}) | ${planned.afterScore} (${planned.afterGrade}) | ${planned.beforeFlagCount} | ${planned.afterFlagCount} | ${planned.afterDataSource} |`,
  );
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

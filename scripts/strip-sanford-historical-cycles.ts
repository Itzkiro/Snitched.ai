#!/usr/bin/env npx tsx
/**
 * Strip Mark Sanford's historical (2013-2019 incumbent-era) cycle data from
 * the live corruption score and replace it with a 2026-only clean slate, per
 * user policy "we are only looking at just this cycle please".
 *
 * Rationale:
 *   Sanford's earlier audit ingested 1,055 itemized individual-contribution
 *   rows from his 2013-2019 SC-01 incumbent cycles, producing a $96,926 pro-
 *   Israel bundler signal (15 high-confidence registry matches inc. KASSEN
 *   $356K career + LANDES $160K career). His fresh 2026 committee C00285254
 *   has ~$0 in 2026 receipts and ZERO itemized individual donations this
 *   cycle — so under a this-cycle-only policy his 2026 pro-Israel bundler
 *   signal is $0, not $96K.
 *
 * What this script does (Sanford ONLY — no other row touched):
 *   1. Moves existing `israel_lobby_breakdown` JSONB to a new key
 *      `historical_breakdown` (preserved for UI "Historical Context" display).
 *   2. Replaces top-level `israel_lobby_breakdown` with a 2026-only zeroed
 *      struct + explanatory note.
 *   3. Moves existing auto-generated `[roster-match]` red_flags from
 *      `source_ids.red_flags` into a new `source_ids.historical_red_flags`
 *      array. Keeps the 2 curator-added flags (ethics + Nuzzi) live.
 *   4. Sets `israel_lobby_total` to 0.
 *   5. Appends a clarifying sentence to `bio`.
 *   6. Recomputes `corruption_score` via lib/corruption-score with the new
 *      zeroed signal + remaining 2 curator red_flags.
 *   7. Sets `data_source = "audit_2026-04-22_sc01_challengers_cycle_only"`.
 *
 * CLI:
 *   npx tsx scripts/strip-sanford-historical-cycles.ts           # dry-run default
 *   npx tsx scripts/strip-sanford-historical-cycles.ts --dry-run # explicit
 *   npx tsx scripts/strip-sanford-historical-cycles.ts --write   # commit
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

const SANFORD_BIOGUIDE_ID = 'sc-01-2026-mark-sanford';
const NEW_DATA_SOURCE = 'audit_2026-04-22_sc01_challengers_cycle_only';

const BIO_APPEND_SENTENCE =
  " Note: his 2026 committee has zero itemized individual contributions reported so far;" +
  " Snitched's corruption score for this page reflects 2026-cycle activity only. See" +
  " 'Historical Context' for the bundler footprint from his 2013-2019 incumbent-era campaigns" +
  " ($96,926 from 55 roster-matched pro-Israel bundlers including Michael Kassen $356K career," +
  " Joshua Landes $160K career — all from prior cycles).";

const CYCLE_ONLY_NOTE =
  "Historical 2013-2019 incumbent-era bundler signal moved to historical_breakdown per" +
  " user policy 'only this cycle'";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExistingRow {
  bioguide_id: string;
  name: string;
  bio?: string | null;
  is_active?: boolean | null;
  is_candidate?: boolean | null;
  running_for?: string | null;
  corruption_score?: number | null;
  source_ids?: Record<string, unknown> | null;
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
  data_source?: string | null;
}

interface RedFlag {
  severity?: string;
  label?: string;
  source?: string;
  date?: string;
  [k: string]: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRosterMatchFlag(flag: RedFlag): boolean {
  const label = (flag.label || '').toString();
  return label.startsWith('[roster-match]');
}

function buildCleanIsraelLobbyBreakdown(): Record<string, unknown> {
  return {
    ie: 0,
    pacs: 0,
    total: 0,
    source: 'fec_2026_only',
    bundlers: 0,
    cycles_count: 0,
    pac_details: [],
    individual_registry: {
      matches: 0,
      source: '2026-only',
      itemized_individual_rows: 0,
    },
    note: CYCLE_ONLY_NOTE,
  };
}

async function fetchExisting(
  supabase: SupabaseClient,
  bioguide_id: string,
): Promise<ExistingRow> {
  const { data, error } = await supabase
    .from('politicians')
    .select(
      'bioguide_id,name,bio,is_active,is_candidate,running_for,corruption_score,source_ids,voting_records,contribution_breakdown,israel_lobby_breakdown,israel_lobby_total,top5_donors,total_funds,juice_box_tier,office,office_level,party,jurisdiction,jurisdiction_type,data_source',
    )
    .eq('bioguide_id', bioguide_id)
    .maybeSingle();
  if (error) throw new Error(`Supabase fetch error for ${bioguide_id}: ${error.message}`);
  if (!data) throw new Error(`No DB row for bioguide_id=${bioguide_id}`);
  return data as ExistingRow;
}

// ---------------------------------------------------------------------------
// Build the strip payload
// ---------------------------------------------------------------------------

interface BuiltUpdate {
  payload: Record<string, unknown>;
  diff: {
    beforeScore: number;
    afterScore: number;
    beforeIsraelTotal: number;
    afterIsraelTotal: number;
    beforeRedFlagCount: number;
    afterRedFlagCount: number;
    historicalRedFlagCount: number;
    beforeBundlers: number;
    afterBundlers: number;
    movedBreakdownKeys: string[];
    bioAppended: boolean;
    dataSourceBefore: string;
    dataSourceAfter: string;
  };
}

function buildStripPayload(existing: ExistingRow): BuiltUpdate {
  // ---- source_ids red-flag split ----
  const existingSourceIds = (existing.source_ids || {}) as Record<string, unknown>;
  const existingRedFlags = Array.isArray(existingSourceIds.red_flags)
    ? (existingSourceIds.red_flags as RedFlag[])
    : [];
  const existingHistoricalRf = Array.isArray(existingSourceIds.historical_red_flags)
    ? (existingSourceIds.historical_red_flags as RedFlag[])
    : [];

  const liveRedFlags: RedFlag[] = [];
  const historicalRedFlags: RedFlag[] = [...existingHistoricalRf];

  for (const rf of existingRedFlags) {
    if (isRosterMatchFlag(rf)) {
      historicalRedFlags.push(rf);
    } else {
      liveRedFlags.push(rf);
    }
  }

  // ---- Move israel_lobby_breakdown to historical_breakdown ----
  const existingIlb = (existing.israel_lobby_breakdown || null) as
    | Record<string, unknown>
    | null;
  const cleanIlb = buildCleanIsraelLobbyBreakdown();
  const movedBreakdownKeys = existingIlb ? Object.keys(existingIlb) : [];
  const beforeBundlers = Number((existingIlb?.bundlers as number) || 0);

  // Build the new source_ids, preserving ALL other keys, rewriting only
  // red_flags + historical_red_flags. Also nest `historical_breakdown`
  // under source_ids (no dedicated column exists on politicians table).
  const newSourceIds: Record<string, unknown> = {
    ...existingSourceIds,
    red_flags: liveRedFlags,
    historical_red_flags: historicalRedFlags,
    historical_breakdown: existingIlb,
  };

  // ---- Bio append (idempotent — don't double-append) ----
  const existingBio = existing.bio || '';
  const alreadyAppended = existingBio.includes(
    'See \'Historical Context\' for the bundler footprint',
  );
  const newBio = alreadyAppended ? existingBio : existingBio + BIO_APPEND_SENTENCE;

  // ---- Build shadow Politician for recompute with NEW zeroed signal ----
  const shadowPol = {
    id: existing.bioguide_id,
    name: existing.name,
    office: existing.office || 'U.S. House',
    officeLevel: existing.office_level || 'Federal Representative',
    party: existing.party || 'Republican',
    jurisdiction: existing.jurisdiction || 'South Carolina',
    jurisdictionType: existing.jurisdiction_type || 'federal_congressional',
    corruptionScore: 0,
    juiceBoxTier: existing.juice_box_tier || 'none',
    // 2026-only: zero AIPAC + israel lobby total
    aipacFunding: 0,
    totalFundsRaised: Number(existing.total_funds) || 0,
    top5Donors: Array.isArray(existing.top5_donors) ? existing.top5_donors : [],
    contributionBreakdown: existing.contribution_breakdown ?? {
      aipac: 0,
      corporate: 0,
      otherPACs: 0,
      individuals: 0,
      self_funding: 0,
      pro_israel_pacs: 0,
    },
    israelLobbyTotal: 0,
    israelLobbyBreakdown: cleanIlb,
    isActive: existing.is_active ?? true,
    tags: existing.tags || ['candidate', '2026-primary', 'challenger', 'republican'],
    bio: newBio,
    socialMedia: {},
    source_ids: newSourceIds,
    dataSource: NEW_DATA_SOURCE,
    courtCases: [],
    lobbyingRecords: [],
    // Keep votes data for voting-alignment factor
    votes: [],
    votingRecords: existing.voting_records || [],
  } as unknown as Politician;

  const scoreResult = computeCorruptionScore(shadowPol);
  const afterScore = scoreResult.score;
  const beforeScore = Number(existing.corruption_score) || 0;

  // ---- Build final DB payload: only Sanford fields we are touching ----
  // Note: historical_breakdown is nested inside source_ids (JSONB) because no
  // dedicated top-level column exists on the politicians table.
  const payload: Record<string, unknown> = {
    bio: newBio,
    israel_lobby_breakdown: cleanIlb,
    israel_lobby_total: 0,
    source_ids: newSourceIds,
    corruption_score: afterScore,
    data_source: NEW_DATA_SOURCE,
    updated_at: new Date().toISOString(),
  };

  return {
    payload,
    diff: {
      beforeScore,
      afterScore,
      beforeIsraelTotal: Number(existing.israel_lobby_total) || 0,
      afterIsraelTotal: 0,
      beforeRedFlagCount: existingRedFlags.length,
      afterRedFlagCount: liveRedFlags.length,
      historicalRedFlagCount: historicalRedFlags.length,
      beforeBundlers,
      afterBundlers: 0,
      movedBreakdownKeys,
      bioAppended: !alreadyAppended,
      dataSourceBefore: existing.data_source || '',
      dataSourceAfter: NEW_DATA_SOURCE,
    },
  };
}

async function writeToSupabase(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('politicians')
    .update(payload)
    .eq('bioguide_id', SANFORD_BIOGUIDE_ID);
  if (error) {
    throw new Error(`Supabase update error for ${SANFORD_BIOGUIDE_ID}: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const mode = WRITE ? 'WRITE' : 'DRY-RUN';
  console.log(`\n=== Sanford Historical-Cycle Strip (${mode}) ===`);
  console.log(`target = ${SANFORD_BIOGUIDE_ID}`);
  console.log(`new data_source = ${NEW_DATA_SOURCE}\n`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const existing = await fetchExisting(supabase, SANFORD_BIOGUIDE_ID);

  const { payload, diff } = buildStripPayload(existing);

  console.log(`--- DIFF for ${existing.name} ---`);
  console.log(`  corruption_score:     ${diff.beforeScore} -> ${diff.afterScore}`);
  console.log(`  israel_lobby_total:   $${diff.beforeIsraelTotal.toLocaleString()} -> $${diff.afterIsraelTotal.toLocaleString()}`);
  console.log(`  israel bundlers:      $${diff.beforeBundlers.toLocaleString()} -> $${diff.afterBundlers.toLocaleString()}`);
  console.log(`  red_flags (live):     ${diff.beforeRedFlagCount} -> ${diff.afterRedFlagCount}`);
  console.log(`  historical_red_flags: ${diff.historicalRedFlagCount}`);
  console.log(`  breakdown moved:      ${diff.movedBreakdownKeys.length} keys [${diff.movedBreakdownKeys.join(', ')}] -> historical_breakdown`);
  console.log(`  bio appended:         ${diff.bioAppended ? 'yes' : 'no (already present)'}`);
  console.log(`  data_source:          ${diff.dataSourceBefore} -> ${diff.dataSourceAfter}`);
  console.log(`\n--- payload keys to be written ---`);
  console.log(`  ${Object.keys(payload).join(', ')}`);

  if (WRITE) {
    await writeToSupabase(supabase, payload);
    console.log(`\n>>> WRITTEN to Supabase`);
  } else {
    console.log(`\nDRY-RUN complete. No DB writes made. Re-run with --write to commit.`);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

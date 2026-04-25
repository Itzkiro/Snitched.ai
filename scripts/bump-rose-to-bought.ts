#!/usr/bin/env npx tsx
/**
 * Curator override: bump Rep. John Rose's Snitched.ai DB row from
 * juice_box_tier = "compromised" (floor 45) to juice_box_tier = "bought"
 * (floor 70) based on the weight of structural capture evidence:
 *
 *   (a) $142K pro-Israel-network capture 2018-2024
 *       ($91K AIPAC-network PAC-conduit + $51K direct individual bundlers
 *        from 17 high-confidence registry-matched donors with $536K
 *        combined career pro-Israel PAC giving)
 *   (b) six-cycle AIPAC-earmarked bundling pattern with 15/31 earmarked
 *       donors writing direct checks to Rose's committee
 *   (c) shared FARA-firm bundler (Sam Olswanger, Akin Gump) with
 *       Blackburn's donor list; Barney Byrd (TN) on both lists
 *   (d) voting record substantively indistinguishable from Blackburn's
 *       on substantive Israel-aid bills (AYE every supplemental
 *       2019-2024, 100% anti-BDS, AYE Abraham Accords, NAY Iran War
 *       Powers withdrawal)
 *
 * The 2026-cycle-only quantitative score remains $44 (per Snitched
 * cycle-only policy) but the tier bump triggers the v6.3 bought-tier
 * hard floor of 70 — same mechanic that puts Blackburn at 70.
 *
 * Updates (DB row bioguide_id = "tn-gov-2026-john-rose"):
 *   - juice_box_tier: compromised -> bought
 *   - corruption_score: 45 -> 70 (via computeCorruptionScore bought floor)
 *   - grade: C -> D (via computeGrade)
 *   - source_ids.red_flags: append one HIGH-severity curator-override flag
 *   - bio: append one paragraph documenting the override
 *   - data_source: audit_2026-04-24_rose_bought_tier_curator_override
 *
 * CLI
 * ---
 *   npx tsx scripts/bump-rose-to-bought.ts            # dry-run (default)
 *   npx tsx scripts/bump-rose-to-bought.ts --dry-run  # explicit dry-run
 *   npx tsx scripts/bump-rose-to-bought.ts --write    # commit
 */
import 'dotenv/config';
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

// ---------------------------------------------------------------------------
// Row shape (subset we touch — preserves unknown fields via spread)
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
// Override payload — static, since this is a curator decision not derived
// from a re-scanned artifact.
// ---------------------------------------------------------------------------

const OVERRIDE_DATE = '2026-04-24';
const NEW_TIER = 'bought';
const PREV_TIER = 'compromised';

const OVERRIDE_RED_FLAG: RedFlag = {
  severity: 'high',
  label:
    "Curator override 2026-04-24: juice_box_tier bumped compromised → bought " +
    "based on weight of evidence — $142K historical pro-Israel-lobby capture " +
    "(2018-2024 across 7 PACs + 17 high-conf individual bundlers with $536K " +
    "combined career pro-Israel-PAC giving) + voting record substantively " +
    "indistinguishable from Blackburn (who is also at bought tier) + " +
    "cross-candidate FARA-firm bundler (Sam Olswanger, Akin Gump) confirmed " +
    "on both Rose and Blackburn donor lists. Cycle-only policy holds for the " +
    "quantitative cycle score ($44 live), but structural capture evidence " +
    "justifies the bought-tier floor.",
  source:
    'Snitched curator 2026-04-24 — Rose AIPAC PAC Schedule-B audit + 49-year individual cross-ref',
  date: OVERRIDE_DATE,
};

const BIO_APPENDIX = [
  '',
  '',
  "UPDATED 2026-04-24: Curator bumped juice_box_tier from 'compromised' → " +
    "'bought' based on combined evidence: (a) $142K pro-Israel-network capture " +
    "2018-2024 ($91K PAC-conduit + $51K direct individual bundlers from 17 " +
    "high-confidence registry-matched donors); (b) six-cycle AIPAC-earmarked " +
    "bundling pattern where 15 of 31 earmarked donors also wrote direct checks " +
    "to Rose's committee; (c) shared FARA-firm bundler (Sam Olswanger, Akin " +
    "Gump) with Blackburn's donor list; (d) voting record substantively " +
    "indistinguishable from Blackburn's on Israel-aid substantive bills. " +
    "2026-cycle-only live financial signal remains $44 per Snitched cycle-only " +
    "policy — but structural capture is well-documented.",
].join('\n');

// ---------------------------------------------------------------------------
// Build next row (immutable — returns new object)
// ---------------------------------------------------------------------------

function build(existing: PoliticianRow): PoliticianRow {
  const priorFlags = (existing.source_ids?.red_flags as RedFlag[]) || [];
  const mergedFlags: RedFlag[] = [...priorFlags, OVERRIDE_RED_FLAG];

  const newSourceIds: Record<string, unknown> = {
    ...existing.source_ids,
    red_flags: mergedFlags,
  };

  return {
    ...existing,
    juice_box_tier: NEW_TIER,
    source_ids: newSourceIds,
    bio: existing.bio + BIO_APPENDIX,
    data_source: 'audit_2026-04-24_rose_bought_tier_curator_override',
  };
}

// ---------------------------------------------------------------------------
// Score recompute (mirrors update-rose-with-49yr-crossref.ts)
// ---------------------------------------------------------------------------

interface Scored {
  score: number;
  grade: string;
  confidence: string;
}

function computeScoreForPayload(p: PoliticianRow): Scored {
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

async function fetchExisting(
  supabase: SupabaseClient,
): Promise<PoliticianRow> {
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
  scored: Scored,
): Promise<void> {
  const payload = {
    corruption_score: scored.score,
    juice_box_tier: next.juice_box_tier,
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
  afterScored: Scored,
): void {
  console.log(`\n--- DRY-RUN DIFF: ${BIOGUIDE_ID} ---`);
  console.log(
    `  corruption_score:   ${beforeScore}  ->  ${afterScored.score} (grade ${afterScored.grade}, confidence ${afterScored.confidence})`,
  );
  console.log(
    `  juice_box_tier:     ${before.juice_box_tier}  ->  ${after.juice_box_tier}`,
  );
  const beforeFlags = countArr(
    (before.source_ids || {}).red_flags as unknown[],
  );
  const afterFlags = countArr(
    (after.source_ids || {}).red_flags as unknown[],
  );
  console.log(`  red_flags:          ${beforeFlags}  ->  ${afterFlags}`);
  console.log(
    `  bio length:         ${before.bio.length}  ->  ${after.bio.length} (+${after.bio.length - before.bio.length})`,
  );
  console.log(
    `  data_source:        ${before.data_source}  ->  ${after.data_source}`,
  );

  const flags = (after.source_ids?.red_flags as RedFlag[]) || [];
  const newFlag = flags[flags.length - 1];
  if (newFlag) {
    const label = String(newFlag.label);
    console.log(
      `\nNew red flag:\n  [${newFlag.severity}] ${label.slice(0, 400)}${label.length > 400 ? '...' : ''}`,
    );
    console.log(`  source: ${newFlag.source}`);
    console.log(`  date:   ${newFlag.date}`);
  }

  console.log(`\nbio appendix preview:`);
  console.log(
    `  ...${after.bio.slice(Math.max(0, after.bio.length - 400))}`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const mode = WRITE ? 'WRITE' : 'DRY-RUN';
  console.log(`\n=== BUMP ROSE TO BOUGHT TIER (${mode}) ===`);
  console.log(
    `Curator override: juice_box_tier ${PREV_TIER} -> ${NEW_TIER} (floor 70)`,
  );

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const existing = await fetchExisting(supabase);
  console.log(
    `\nFetched existing row: ${existing.name} (score=${existing.corruption_score}, tier=${existing.juice_box_tier}, israel_lobby_total=$${existing.israel_lobby_total})`,
  );

  if (existing.juice_box_tier !== PREV_TIER) {
    console.warn(
      `  ! WARNING: existing juice_box_tier is "${existing.juice_box_tier}" (expected "${PREV_TIER}"). Override will still apply.`,
    );
  }

  const next = build(existing);
  const scored = computeScoreForPayload(next);

  formatDiff(existing, next, Number(existing.corruption_score) || 0, scored);

  if (scored.score < 70) {
    throw new Error(
      `Expected bought-tier floor >= 70, got ${scored.score}. Aborting.`,
    );
  }

  if (DRY_RUN) {
    console.log(`\nDRY-RUN complete. Re-run with --write to commit.`);
    return;
  }

  console.log(`\n=== WRITING TO SUPABASE ===`);
  await writeRow(supabase, next, scored);

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

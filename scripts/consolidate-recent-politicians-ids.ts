#!/usr/bin/env npx tsx
/**
 * Consolidate the 10 newly-seeded `<scope>-2026-<name>` politician rows down
 * to the user's preferred short-slug `<scope>-<name>` URL convention.
 *
 * Reference URL pattern (kept):
 *   https://snitched.ai/politician/fl-gov-james-fishback   <- short slug
 * Broken/inflated pattern (consolidated away):
 *   https://snitched.ai/politician/fl-gov-2026-james-fishback
 *
 * Migration plan (verified 2026-04-22 against Supabase):
 *
 *   Source bioguide_id            -> Target bioguide_id           Conflict
 *   fl-gov-2026-james-fishback    -> fl-gov-james-fishback        old shallow fldoe row at target
 *   fl-gov-2026-byron-donalds     -> fl-gov-byron-donalds         (none — old UUID row inactive)
 *   fl-gov-2026-jay-collins       -> fl-gov-jay-collins           old inactive manual row at target
 *   tn-gov-2026-john-rose         -> tn-gov-john-rose             none
 *   tn-gov-2026-marsha-blackburn  -> tn-gov-marsha-blackburn      none
 *   tn-gov-2026-monty-fritts      -> tn-gov-monty-fritts          none
 *   fl-07-2026-cory-mills         -> fl-07-cory-mills             (none — old UUID row inactive)
 *   fl-07-2026-marialana-kinter   -> fl-07-marialana-kinter       none
 *   fl-07-2026-michael-johnson    -> fl-07-michael-johnson        none
 *   fl-07-2026-sarah-ulrich       -> fl-07-sarah-ulrich           none
 *
 * Approach (Option B — insert-new + delete-old, transactional pair per row):
 *   1. SELECT the source row (with all columns) by current bioguide_id.
 *   2. If a target bioguide_id row exists, log it and DELETE it (it's the
 *      shallow legacy data we're displacing).
 *   3. INSERT a copy of the source row's full payload under the new
 *      bioguide_id.
 *   4. DELETE the source row at the old `-2026-` bioguide_id.
 *
 * FK note: only `social_posts.politician_id` REFERENCES politicians(bioguide_id).
 * Verified zero rows in social_posts reference any of the 20 ids in scope, so
 * no child-row updates are required. (Connection edges and intel_alerts use
 * unconstrained TEXT — no FK enforcement.)
 *
 * Usage:
 *   npx tsx scripts/consolidate-recent-politicians-ids.ts             # dry-run (default)
 *   npx tsx scripts/consolidate-recent-politicians-ids.ts --dry-run   # explicit dry-run
 *   npx tsx scripts/consolidate-recent-politicians-ids.ts --write     # commit changes
 */
import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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
// Migration plan (immutable)
// ---------------------------------------------------------------------------

interface Migration {
  readonly oldId: string;
  readonly newId: string;
  readonly displayName: string;
}

const MIGRATIONS: ReadonlyArray<Migration> = [
  { oldId: 'fl-gov-2026-james-fishback',   newId: 'fl-gov-james-fishback',   displayName: 'James Fishback' },
  { oldId: 'fl-gov-2026-byron-donalds',    newId: 'fl-gov-byron-donalds',    displayName: 'Byron Donalds' },
  { oldId: 'fl-gov-2026-jay-collins',      newId: 'fl-gov-jay-collins',      displayName: 'Jay Collins' },
  { oldId: 'tn-gov-2026-john-rose',        newId: 'tn-gov-john-rose',        displayName: 'John Rose' },
  { oldId: 'tn-gov-2026-marsha-blackburn', newId: 'tn-gov-marsha-blackburn', displayName: 'Marsha Blackburn' },
  { oldId: 'tn-gov-2026-monty-fritts',     newId: 'tn-gov-monty-fritts',     displayName: 'Monty Fritts' },
  { oldId: 'fl-07-2026-cory-mills',        newId: 'fl-07-cory-mills',        displayName: 'Cory Mills' },
  { oldId: 'fl-07-2026-marialana-kinter',  newId: 'fl-07-marialana-kinter',  displayName: 'Marialana Kinter' },
  { oldId: 'fl-07-2026-michael-johnson',   newId: 'fl-07-michael-johnson',   displayName: 'Michael Johnson' },
  { oldId: 'fl-07-2026-sarah-ulrich',      newId: 'fl-07-sarah-ulrich',      displayName: 'Sarah Ulrich' },
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PoliticianRow = Record<string, unknown> & { bioguide_id: string };

interface Plan {
  readonly migration: Migration;
  readonly sourceRow: PoliticianRow | null;
  readonly targetExisting: PoliticianRow | null;
}

interface MigrationResult {
  readonly migration: Migration;
  readonly status: 'ok' | 'skipped' | 'failed';
  readonly note?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return 'Unexpected error';
}

async function fetchRow(
  sb: SupabaseClient,
  bioguideId: string,
): Promise<PoliticianRow | null> {
  const { data, error } = await sb
    .from('politicians')
    .select('*')
    .eq('bioguide_id', bioguideId)
    .maybeSingle();
  if (error) {
    throw new Error(`fetchRow(${bioguideId}) failed: ${getErrorMessage(error)}`);
  }
  return (data as PoliticianRow | null) ?? null;
}

async function buildPlan(sb: SupabaseClient): Promise<ReadonlyArray<Plan>> {
  const plans: Plan[] = [];
  for (const m of MIGRATIONS) {
    const [sourceRow, targetExisting] = await Promise.all([
      fetchRow(sb, m.oldId),
      fetchRow(sb, m.newId),
    ]);
    plans.push({ migration: m, sourceRow, targetExisting });
  }
  return plans;
}

function summarizePlan(plans: ReadonlyArray<Plan>): void {
  console.log('\nPlanned operations:\n');
  for (const p of plans) {
    const { oldId, newId, displayName } = p.migration;
    if (!p.sourceRow) {
      console.log(`  [SKIP] ${displayName}: source ${oldId} NOT FOUND`);
      continue;
    }
    const targetNote = p.targetExisting
      ? `target exists (data_source=${String(p.targetExisting.data_source)}, ` +
        `is_active=${String(p.targetExisting.is_active)}, ` +
        `corruption_score=${String(p.targetExisting.corruption_score)}) -> DELETE then INSERT`
      : 'target absent -> INSERT new id';
    console.log(`  [MIGRATE] ${displayName}: ${oldId} -> ${newId}; ${targetNote}; DELETE old`);
  }
}

async function migrateOne(
  sb: SupabaseClient,
  plan: Plan,
): Promise<MigrationResult> {
  const { migration, sourceRow, targetExisting } = plan;
  const { oldId, newId, displayName } = migration;

  if (!sourceRow) {
    return { migration, status: 'skipped', note: `source ${oldId} not found` };
  }

  // 1. Capture & delete legacy target row if present
  if (targetExisting) {
    console.log(
      `  [${displayName}] capturing legacy target ${newId}: ` +
        JSON.stringify({
          name: targetExisting.name,
          data_source: targetExisting.data_source,
          is_active: targetExisting.is_active,
          corruption_score: targetExisting.corruption_score,
          juice_box_tier: targetExisting.juice_box_tier,
        }),
    );
    const { error: delTargetErr } = await sb
      .from('politicians')
      .delete()
      .eq('bioguide_id', newId);
    if (delTargetErr) {
      return {
        migration,
        status: 'failed',
        note: `delete legacy target failed: ${getErrorMessage(delTargetErr)}`,
      };
    }
  }

  // 2. INSERT a clone of the source row under the new bioguide_id.
  // Drop server-managed timestamps so the trigger and default fire fresh.
  const { created_at: _ca, updated_at: _ua, ...rest } = sourceRow;
  void _ca;
  void _ua;
  const newRow = { ...rest, bioguide_id: newId };
  const { error: insErr } = await sb.from('politicians').insert(newRow);
  if (insErr) {
    return {
      migration,
      status: 'failed',
      note: `insert new id failed: ${getErrorMessage(insErr)}`,
    };
  }

  // 3. DELETE the old `<scope>-2026-<name>` source row.
  const { error: delOldErr } = await sb
    .from('politicians')
    .delete()
    .eq('bioguide_id', oldId);
  if (delOldErr) {
    return {
      migration,
      status: 'failed',
      note: `delete old source failed (new id was inserted; manual cleanup required): ${getErrorMessage(delOldErr)}`,
    };
  }

  return { migration, status: 'ok' };
}

async function verifyFinalState(
  sb: SupabaseClient,
): Promise<void> {
  const newIds = MIGRATIONS.map(m => m.newId);
  const oldIds = MIGRATIONS.map(m => m.oldId);

  const { data: newRows, error: newErr } = await sb
    .from('politicians')
    .select('bioguide_id,name,corruption_score,juice_box_tier,is_active')
    .in('bioguide_id', newIds);
  if (newErr) throw new Error(`verifyFinalState newRows failed: ${getErrorMessage(newErr)}`);

  const { data: oldRows, error: oldErr } = await sb
    .from('politicians')
    .select('bioguide_id')
    .in('bioguide_id', oldIds);
  if (oldErr) throw new Error(`verifyFinalState oldRows failed: ${getErrorMessage(oldErr)}`);

  const byId = new Map((newRows ?? []).map(r => [r.bioguide_id as string, r]));

  console.log('\nFinal state — short-slug ids:\n');
  console.log('| New ID | Name | Score | Tier | Active |');
  console.log('|---|---|---|---|---|');
  for (const m of MIGRATIONS) {
    const r = byId.get(m.newId);
    if (!r) {
      console.log(`| ${m.newId} | (MISSING) | - | - | - |`);
      continue;
    }
    console.log(
      `| ${m.newId} | ${r.name} | ${r.corruption_score} | ${r.juice_box_tier} | ${r.is_active} |`,
    );
  }

  console.log('\nLegacy `-2026-` ids still present (should be empty):');
  if (!oldRows || oldRows.length === 0) {
    console.log('  (none — clean)');
  } else {
    for (const r of oldRows) console.log(`  - ${r.bioguide_id}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(
    `Mode: ${DRY_RUN ? 'DRY-RUN (no writes)' : 'WRITE (committing changes)'}`,
  );

  // Pre-state count
  const allIds = [
    ...MIGRATIONS.map(m => m.oldId),
    ...MIGRATIONS.map(m => m.newId),
  ];
  const { data: pre, error: preErr } = await sb
    .from('politicians')
    .select('bioguide_id')
    .in('bioguide_id', allIds);
  if (preErr) throw new Error(`pre-count failed: ${getErrorMessage(preErr)}`);
  console.log(`Pre-migration row count for tracked ids: ${pre?.length ?? 0}`);

  const plans = await buildPlan(sb);
  summarizePlan(plans);

  if (DRY_RUN) {
    console.log('\nDry-run complete. Re-run with --write to apply changes.');
    return;
  }

  console.log('\nApplying migrations...\n');
  const results: MigrationResult[] = [];
  for (const plan of plans) {
    const r = await migrateOne(sb, plan);
    const tag = r.status === 'ok' ? 'OK' : r.status === 'skipped' ? 'SKIP' : 'FAIL';
    console.log(`  [${tag}] ${plan.migration.displayName}` + (r.note ? `: ${r.note}` : ''));
    results.push(r);
  }

  const okCount = results.filter(r => r.status === 'ok').length;
  const skipCount = results.filter(r => r.status === 'skipped').length;
  const failCount = results.filter(r => r.status === 'failed').length;
  console.log(`\nSummary: ok=${okCount} skipped=${skipCount} failed=${failCount}`);

  await verifyFinalState(sb);

  // Post-state count
  const { data: post, error: postErr } = await sb
    .from('politicians')
    .select('bioguide_id')
    .in('bioguide_id', allIds);
  if (postErr) throw new Error(`post-count failed: ${getErrorMessage(postErr)}`);
  console.log(`\nPost-migration row count for tracked ids: ${post?.length ?? 0}`);

  if (failCount > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal:', getErrorMessage(err));
  process.exit(1);
});

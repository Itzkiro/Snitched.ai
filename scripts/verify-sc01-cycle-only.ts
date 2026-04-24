#!/usr/bin/env npx tsx
/**
 * Verification for the SC-01 2026 cycle-only policy pass.
 *   1. Reports Sanford's post-strip score / grade / israel_lobby_total / red_flags.
 *   2. Prints a final 4-candidate summary table.
 *   3. Re-checks Pelbath / Smith / Dykes israel_lobby_breakdown.individual_registry
 *      .top_donors[].candidate_cycles — flags ANY entry with a non-2026 cycle.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
}

const IDS = [
  'sc-01-2026-tyler-dykes',
  'sc-01-2026-mark-sanford',
  'sc-01-2026-alex-pelbath',
  'sc-01-2026-mark-smith',
];

function computeGrade(score: number): string {
  if (score <= 20) return 'A';
  if (score <= 40) return 'B';
  if (score <= 60) return 'C';
  if (score <= 80) return 'D';
  return 'F';
}

async function main(): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data, error } = await supabase
    .from('politicians')
    .select(
      'bioguide_id,name,corruption_score,is_active,israel_lobby_total,source_ids,israel_lobby_breakdown,data_source',
    )
    .in('bioguide_id', IDS);

  if (error) throw new Error(`fetch error: ${error.message}`);
  if (!data) throw new Error('no rows');

  // Order rows to match IDS
  const rows = IDS.map(id => data.find(r => r.bioguide_id === id)).filter(Boolean) as typeof data;

  // --- Sanford focus block ---
  const sanford = rows.find(r => r.bioguide_id === 'sc-01-2026-mark-sanford');
  if (sanford) {
    const score = Number(sanford.corruption_score) || 0;
    const rfLive = Array.isArray(sanford.source_ids?.red_flags)
      ? sanford.source_ids.red_flags.length
      : 0;
    const rfHist = Array.isArray(sanford.source_ids?.historical_red_flags)
      ? sanford.source_ids.historical_red_flags.length
      : 0;
    console.log(`\n=== SANFORD POST-STRIP ===`);
    console.log(`  name:                  ${sanford.name}`);
    console.log(`  corruption_score:      ${score}`);
    console.log(`  grade:                 ${computeGrade(score)}`);
    console.log(`  israel_lobby_total:    $${Number(sanford.israel_lobby_total).toLocaleString()}`);
    console.log(`  red_flags (live):      ${rfLive}`);
    console.log(`  historical_red_flags:  ${rfHist}`);
    console.log(`  data_source:           ${sanford.data_source}`);
    console.log(`  ilb.bundlers:          $${Number(sanford.israel_lobby_breakdown?.bundlers ?? 0).toLocaleString()}`);
    console.log(`  ilb.total:             $${Number(sanford.israel_lobby_breakdown?.total ?? 0).toLocaleString()}`);
    console.log(`  ilb.source:            ${sanford.israel_lobby_breakdown?.source ?? ''}`);
    console.log(`  historical_breakdown:  ${sanford.source_ids?.historical_breakdown ? 'preserved under source_ids' : 'MISSING'}`);
  }

  // --- Final 4-candidate summary table ---
  console.log(`\n=== FINAL 4-CANDIDATE SUMMARY ===`);
  const header = ['name', 'score', 'grade', 'is_active', 'red_flags', 'data_source'];
  console.log(header.join(' | '));
  console.log(header.map(h => '-'.repeat(Math.max(h.length, 3))).join('-|-'));
  for (const r of rows) {
    const score = Number(r.corruption_score) || 0;
    const rfLive = Array.isArray(r.source_ids?.red_flags) ? r.source_ids.red_flags.length : 0;
    console.log(
      [
        r.name,
        String(score),
        computeGrade(score),
        String(Boolean(r.is_active)),
        String(rfLive),
        r.data_source || '',
      ].join(' | '),
    );
  }

  // --- Cycle audit on the other 3 ---
  console.log(`\n=== CYCLE-ONLY AUDIT (Dykes / Pelbath / Smith) ===`);
  const others = rows.filter(r => r.bioguide_id !== 'sc-01-2026-mark-sanford');
  let anyViolation = false;
  for (const r of others) {
    const topDonors = (r.israel_lobby_breakdown?.individual_registry?.top_donors ||
      []) as Array<{ name?: string; candidate_cycles?: unknown }>;
    if (!Array.isArray(topDonors) || topDonors.length === 0) {
      console.log(`  ${r.name}: no top_donors entries (OK — registry empty)`);
      continue;
    }
    const bad: string[] = [];
    for (const d of topDonors) {
      const cycles = Array.isArray(d.candidate_cycles) ? d.candidate_cycles : [];
      const cycleStrs = cycles.map(c => String(c));
      const hasNon2026 = cycleStrs.some(c => c !== '2026');
      if (hasNon2026) {
        bad.push(`${d.name} -> [${cycleStrs.join(', ')}]`);
      }
    }
    if (bad.length > 0) {
      anyViolation = true;
      console.log(`  ${r.name}: FLAG — ${bad.length} donor(s) with non-2026 cycles:`);
      for (const b of bad) console.log(`      ${b}`);
    } else {
      console.log(
        `  ${r.name}: OK — all ${topDonors.length} top_donors entries show candidate_cycles=["2026"]`,
      );
    }
  }
  if (!anyViolation) {
    console.log(`\nAll 3 other candidates verified 2026-only.`);
  } else {
    console.log(`\nVIOLATION FOUND — review above.`);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

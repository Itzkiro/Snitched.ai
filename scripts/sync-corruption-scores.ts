#!/usr/bin/env npx tsx
/**
 * Recompute & Sync Corruption Scores v2
 *
 * Fetches all politicians from Supabase, recomputes their corruption scores
 * using the v2 algorithm, and updates Supabase with the new scores.
 *
 * Usage:
 *   npx tsx scripts/sync-corruption-scores.ts
 *   npx tsx scripts/sync-corruption-scores.ts --dry-run     # Preview without updating
 *   npx tsx scripts/sync-corruption-scores.ts --limit 10    # Process only N politicians
 *   npx tsx scripts/sync-corruption-scores.ts --verbose      # Show factor breakdowns
 */

import { createClient } from '@supabase/supabase-js';
import { computeCorruptionScore } from '../lib/corruption-score';
import type { Politician } from '../lib/types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SUPABASE_URL = 'https://uqjfxhpyitleeleazzow.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxamZ4aHB5aXRsZWVsZWF6em93Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTc2NzQzOCwiZXhwIjoyMDg3MzQzNDM4fQ.abK_AJ-qataXyYn59I2w2rTxP4dIyl1UjCAMkw_6JPw';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : 1000;

  console.log('='.repeat(60));
  console.log('  Corruption Score v2 Sync');
  console.log('='.repeat(60));
  if (dryRun) console.log('  [DRY RUN — no changes will be saved]\n');

  // Fetch all politicians
  const { data: rows, error } = await supabase
    .from('politicians')
    .select('*')
    .order('name')
    .limit(limit);

  if (error || !rows) {
    console.error('Failed to fetch politicians:', error);
    process.exit(1);
  }

  console.log(`Fetched ${rows.length} politicians\n`);

  // Track stats
  const stats = {
    total: rows.length,
    updated: 0,
    unchanged: 0,
    errors: 0,
    byGrade: { A: 0, B: 0, C: 0, D: 0, F: 0 } as Record<string, number>,
    byConfidence: { high: 0, medium: 0, low: 0 } as Record<string, number>,
    withData: 0,
    noData: 0,
    scoreChanges: [] as { name: string; old: number; new: number; grade: string }[],
  };

  for (const row of rows) {
    // Map Supabase row to Politician type
    const top5 = (row.top5_donors ?? []) as Politician['top5Donors'];
    const politician: Politician = {
      id: row.bioguide_id,
      name: row.name,
      office: row.office,
      officeLevel: row.office_level,
      party: row.party,
      district: row.district,
      jurisdiction: row.jurisdiction,
      jurisdictionType: row.jurisdiction_type,
      photoUrl: row.photo_url,
      corruptionScore: Number(row.corruption_score) || 0,
      aipacFunding: Number(row.aipac_funding) || 0,
      juiceBoxTier: row.juice_box_tier || 'none',
      totalFundsRaised: Number(row.total_funds) || 0,
      top3Donors: top5?.slice(0, 3),
      top5Donors: top5,
      topDonor: top5?.[0] ? { name: top5[0].name, amount: top5[0].amount } : undefined,
      israelLobbyTotal: Number(row.israel_lobby_total) || 0,
      israelLobbyBreakdown: row.israel_lobby_breakdown,
      isActive: row.is_active,
      yearsInOffice: Number(row.years_in_office) || 0,
      tags: [],
      bio: row.bio,
      termStart: row.term_start,
      termEnd: row.term_end,
      socialMedia: row.social_media || {},
      source_ids: row.source_ids || {},
      lobbyingRecords: row.lobbying_records ?? [],
      contributions: [],
      courtCases: [],
      votes: (row.voting_records ?? []).map((v: any) => ({
        id: String(v.roll_call_id ?? ''),
        politicianId: row.bioguide_id,
        billNumber: v.bill_number ?? '',
        billTitle: v.title ?? '',
        voteValue: v.vote === 'Yea' ? 'Yes' : v.vote === 'Nay' ? 'No' : v.vote === 'NV' ? 'Abstain' : 'Absent',
        date: v.vote_date ?? '',
        billSummary: v.description ?? '',
        category: '',
      })),
      socialPosts: [],
      dataStatus: 'live',
      dataSource: row.data_source || 'supabase',
      lastUpdated: row.updated_at || row.created_at,
    };

    // Compute corruption score v2
    const result = computeCorruptionScore(politician);
    const oldScore = politician.corruptionScore;
    const newScore = result.score;

    stats.byGrade[result.grade] = (stats.byGrade[result.grade] || 0) + 1;
    stats.byConfidence[result.confidence] = (stats.byConfidence[result.confidence] || 0) + 1;

    if (result.dataCompleteness > 0) {
      stats.withData++;
    } else {
      stats.noData++;
    }

    const changed = oldScore !== newScore;

    if (changed) {
      stats.scoreChanges.push({
        name: politician.name,
        old: oldScore,
        new: newScore,
        grade: result.grade,
      });
    }

    if (verbose || (changed && Math.abs(oldScore - newScore) >= 5)) {
      console.log(`  ${politician.name} (${politician.officeLevel})`);
      console.log(`    Score: ${oldScore} -> ${newScore} (${result.grade}) [${result.confidence}]`);
      for (const f of result.factors) {
        const marker = f.dataAvailable ? '✓' : '○';
        console.log(`    ${marker} ${f.label}: ${f.rawScore} × ${f.weight} = ${f.weightedScore}`);
        if (verbose) console.log(`      ${f.explanation}`);
      }
      console.log();
    }

    // Update Supabase
    if (!dryRun && changed) {
      const { error: updateError } = await supabase
        .from('politicians')
        .update({ corruption_score: newScore })
        .eq('bioguide_id', row.bioguide_id);

      if (updateError) {
        console.error(`  Error updating ${politician.name}: ${updateError.message}`);
        stats.errors++;
      } else {
        stats.updated++;
      }
    } else if (!changed) {
      stats.unchanged++;
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('  CORRUPTION SCORE v2 SYNC SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Total politicians:  ${stats.total}`);
  console.log(`  Scores changed:     ${stats.scoreChanges.length}`);
  console.log(`  Updated in DB:      ${stats.updated}`);
  console.log(`  Unchanged:          ${stats.unchanged}`);
  console.log(`  Errors:             ${stats.errors}`);
  console.log();
  console.log('  Grade distribution:');
  for (const [grade, count] of Object.entries(stats.byGrade).sort()) {
    const bar = '█'.repeat(Math.round(count / stats.total * 40));
    console.log(`    ${grade}: ${count.toString().padStart(3)} ${bar}`);
  }
  console.log();
  console.log('  Confidence distribution:');
  for (const [conf, count] of Object.entries(stats.byConfidence)) {
    console.log(`    ${conf.padEnd(8)}: ${count}`);
  }
  console.log(`  With data: ${stats.withData} | No data: ${stats.noData}`);

  if (stats.scoreChanges.length > 0) {
    // Show biggest changes
    const sorted = stats.scoreChanges.sort((a, b) => Math.abs(b.new - b.old) - Math.abs(a.new - a.old));
    console.log('\n  Biggest score changes:');
    for (const c of sorted.slice(0, 15)) {
      const dir = c.new > c.old ? '↑' : '↓';
      console.log(`    ${c.name.padEnd(35)} ${c.old} -> ${c.new} (${dir}${Math.abs(c.new - c.old)}) [${c.grade}]`);
    }
  }
}

main().catch(console.error);

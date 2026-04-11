#!/usr/bin/env npx tsx
/**
 * Batch Corruption Score Sync
 *
 * Processes a specific range of politicians by offset/limit.
 * Designed to be run in parallel batches.
 *
 * Usage:
 *   npx tsx scripts/sync-corruption-batch.ts --state OH --offset 0 --batch-size 200
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { computeCorruptionScore } from '../lib/corruption-score';
import type { Politician } from '../lib/types';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

function getArg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

async function main() {
  const statePrefix = getArg('state', 'oh').toLowerCase();
  const offset = parseInt(getArg('offset', '0'));
  const batchSize = parseInt(getArg('batch-size', '200'));

  // Fetch batch
  const { data: rows, error } = await supabase
    .from('politicians')
    .select('*')
    .like('bioguide_id', `${statePrefix}-%`)
    .order('bioguide_id')
    .range(offset, offset + batchSize - 1);

  if (error || !rows) {
    console.error(`[Batch ${offset}] Fetch error:`, error?.message);
    process.exit(1);
  }

  console.log(`[Batch offset=${offset}] Processing ${rows.length} ${statePrefix.toUpperCase()} politicians...`);

  let updated = 0;
  let unchanged = 0;
  let errors = 0;

  for (const row of rows) {
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
      corruptionScore: Number(row.corruption_score) || 0,
      aipacFunding: Number(row.aipac_funding) || 0,
      juiceBoxTier: row.juice_box_tier || 'none',
      totalFundsRaised: Number(row.total_funds) || 0,
      top3Donors: top5?.slice(0, 3),
      top5Donors: top5,
      topDonor: top5?.[0] ? { name: top5[0].name, amount: top5[0].amount } : undefined,
      israelLobbyTotal: Number(row.israel_lobby_total) || 0,
      israelLobbyBreakdown: row.israel_lobby_breakdown,
      contributionBreakdown: row.contribution_breakdown ?? undefined,
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

    const result = computeCorruptionScore(politician);
    const oldScore = politician.corruptionScore;
    const newScore = result.score;

    if (oldScore !== newScore) {
      const { error: updateError } = await supabase
        .from('politicians')
        .update({ corruption_score: newScore })
        .eq('bioguide_id', row.bioguide_id);

      if (updateError) {
        errors++;
      } else {
        updated++;
        if (newScore > 0) {
          console.log(`  ${politician.name}: ${oldScore} -> ${newScore} (${result.grade})`);
        }
      }
    } else {
      unchanged++;
    }
  }

  console.log(`[Batch offset=${offset}] Done: ${updated} updated, ${unchanged} unchanged, ${errors} errors`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });

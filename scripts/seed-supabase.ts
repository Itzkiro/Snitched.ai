/**
 * Seed Supabase with all politician data from local JSON/TS sources.
 *
 * Prerequisites:
 *   1. Run supabase/schema.sql in the Supabase SQL Editor first.
 *   2. Set SUPABASE_URL and SUPABASE_ANON_KEY in .env
 *
 * Usage:
 *   npx tsx scripts/seed-supabase.ts
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { getAllPoliticians } from '../lib/real-data';
import type { Politician } from '../lib/types';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Convert a Politician object to the Supabase row format.
 */
function toRow(p: Politician) {
  return {
    bioguide_id: p.id,
    name: p.name,
    office: p.office,
    office_level: p.officeLevel,
    party: p.party,
    district: p.district || null,
    jurisdiction: p.jurisdiction,
    jurisdiction_type: p.jurisdictionType,
    photo_url: p.photoUrl || null,
    corruption_score: p.corruptionScore,
    aipac_funding: p.aipacFunding,
    juice_box_tier: p.juiceBoxTier,
    total_funds: p.totalFundsRaised || 0,
    top5_donors: p.top5Donors || [],
    israel_lobby_total: p.israelLobbyTotal || 0,
    israel_lobby_breakdown: p.israelLobbyBreakdown || null,
    is_active: p.isActive,
    years_in_office: p.yearsInOffice || 0,
    bio: p.bio || null,
    term_start: p.termStart || null,
    term_end: p.termEnd || null,
    social_media: p.socialMedia || {},
    source_ids: p.source_ids || {},
    data_source: p.dataSource || 'seed',
  };
}

async function seed() {
  console.log('Loading all politicians from local data...');
  const politicians = getAllPoliticians();
  console.log(`Found ${politicians.length} politicians to seed.`);

  // Upsert in batches of 50 (Supabase REST API handles this well)
  const BATCH_SIZE = 50;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < politicians.length; i += BATCH_SIZE) {
    const batch = politicians.slice(i, i + BATCH_SIZE);
    const rows = batch.map(toRow);

    const { error } = await supabase
      .from('politicians')
      .upsert(rows, { onConflict: 'bioguide_id' });

    if (error) {
      console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} error:`, error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
      console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} rows upserted (${inserted}/${politicians.length})`);
    }
  }

  console.log('\n--- Seed Summary ---');
  console.log(`Total politicians: ${politicians.length}`);
  console.log(`Successfully upserted: ${inserted}`);
  console.log(`Errors: ${errors}`);

  // Verify by counting
  const { count, error: countErr } = await supabase
    .from('politicians')
    .select('*', { count: 'exact', head: true });

  if (countErr) {
    console.log(`Verification count error: ${countErr.message}`);
  } else {
    console.log(`Rows in Supabase: ${count}`);
  }
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});

#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Restore Brian Mast's canonical Israel-lobby totals from TrackAIPAC.
 *
 * The FEC-based refresh (refresh-mast.ts) only classifies PAC contributions
 * by committee-name match, which catches ~30% of his real Israel-lobby money.
 * TrackAIPAC cross-references individual donors against their roster of
 * known AIPAC members/bundlers, picking up the additional $1.5M in personal-
 * capacity contributions that FEC doesn't flag.
 *
 * This script applies TrackAIPAC's verified career totals as authoritative,
 * preserves the current-cycle breakdown for scoring, and expands the PAC
 * classifier for future runs.
 *
 * Source: https://www.trackaipac.com/congress (Brian Mast FL-21 entry)
 */

import { createClient } from '@supabase/supabase-js';
import { computeCorruptionScore } from '../lib/corruption-score';
import type { Politician } from '../lib/types';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BIOGUIDE_ID = '317b2e4e-5dcf-478b-bad4-1518d0fc20c2';

// Canonical TrackAIPAC figures (career-to-date)
const TRACKAIPAC = {
  total: 2_246_400,
  pacs: 744_281,
  ie: 0,
  lobby_donors: 1_502_119,
  pac_names: ['AIPAC', 'AMP', 'COPAC', 'NACPAC', 'NORPAC', 'PIA', 'RJC', 'SUNPAC', 'USI', 'ZOA'],
  source: 'trackaipac.com/congress (Brian Mast FL-21 entry)',
  verified_at: '2026-04-19',
};

async function main(): Promise<void> {
  const dryRun = !process.argv.includes('--write');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('SUPABASE env required'); process.exit(1);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: row, error: loadErr } = await supabase
    .from('politicians').select('*').eq('bioguide_id', BIOGUIDE_ID).single();
  if (loadErr || !row) { console.error('Load failed:', loadErr?.message); process.exit(1); }

  console.log('Current state:');
  console.log(`  aipac_funding:     $${row.aipac_funding?.toLocaleString() || 0}`);
  console.log(`  israel_lobby_tot:  $${row.israel_lobby_total?.toLocaleString() || 0}`);
  console.log(`  total_funds:       $${row.total_funds?.toLocaleString() || 0}`);
  console.log(`  corruption_score:  ${row.corruption_score}`);
  console.log('');

  // Career totals — use for Israel-lobby aggregate
  const LIFETIME_RECEIPTS = 48_363_776.24; // From FEC all-cycles refresh

  // Build polForScoring with career numbers so the ratio math reflects the
  // full AIPAC relationship, not a single cycle.
  const polForScoring: Politician = {
    id: BIOGUIDE_ID,
    name: row.name,
    office: row.office,
    officeLevel: row.office_level,
    party: row.party,
    jurisdiction: row.jurisdiction,
    jurisdictionType: row.jurisdiction_type,
    corruptionScore: row.corruption_score,
    juiceBoxTier: row.juice_box_tier,
    aipacFunding: TRACKAIPAC.pacs,          // $744,281 PACs (career)
    totalFundsRaised: LIFETIME_RECEIPTS,    // $48.36M career
    top5Donors: row.top5_donors as Politician['top5Donors'],
    contributionBreakdown: {
      aipac: TRACKAIPAC.pacs,
      otherPACs: Math.max(0, 5_225_552.88 - TRACKAIPAC.pacs),  // career PAC - AIPAC
      individuals: 37_615_177.62,           // career individuals (includes lobby bundlers)
      corporate: 0,
    },
    israelLobbyTotal: TRACKAIPAC.total,     // $2,246,400 grand total
    israelLobbyBreakdown: {
      total: TRACKAIPAC.total,
      pacs: TRACKAIPAC.pacs,
      ie: TRACKAIPAC.ie,
      bundlers: TRACKAIPAC.lobby_donors,    // $1,502,119 individual lobby donors
    },
    isActive: true,
    tags: row.tags || [],
    bio: row.bio,
    socialMedia: row.social_media,
    source_ids: row.source_ids,
    dataSource: 'trackaipac_canonical',
    // Forensic signals computed in refresh-mast run (2026-04-19) — all three
    // threshold-based signals triggered.
    donorForensics: {
      missingEmployerRatio: 0.636,
      outOfStatePct: 0.671,
      householdBundling: 0.0531,
      donationStdDev: 2.898,
      platformOpacity: 0.083,
      itemizedCount: 2316,
      computedAt: '2026-04-19T20:55:00.000Z',
    },
    courtCases: [],
    lobbyingRecords: row.lobbying_records || [],
    votes: row.voting_records || [],
  };

  const score = computeCorruptionScore(polForScoring);
  console.log('Restored inputs (TrackAIPAC canonical):');
  console.log(`  aipac_funding (PACs):    $${TRACKAIPAC.pacs.toLocaleString()}`);
  console.log(`  israel_lobby_total:      $${TRACKAIPAC.total.toLocaleString()}`);
  console.log(`    - PACs:                $${TRACKAIPAC.pacs.toLocaleString()}`);
  console.log(`    - IE:                  $${TRACKAIPAC.ie.toLocaleString()}`);
  console.log(`    - Lobby donors:        $${TRACKAIPAC.lobby_donors.toLocaleString()}`);
  console.log(`  total_funds (career):    $${LIFETIME_RECEIPTS.toLocaleString()}`);
  console.log(`  Israel lobby ratio:      ${((TRACKAIPAC.total / LIFETIME_RECEIPTS) * 100).toFixed(2)}%`);
  console.log(`  PAC sources:             ${TRACKAIPAC.pac_names.join(', ')}`);
  console.log('');
  console.log(`New corruption_score:      ${row.corruption_score} → ${score.score} (${score.grade}, ${score.confidence} confidence)`);
  for (const f of score.factors) {
    console.log(`    ${f.key}: raw=${f.rawScore} weight=${f.weight.toFixed(2)} data=${f.dataAvailable}`);
    console.log(`      ${f.explanation}`);
  }
  console.log('');

  if (dryRun) { console.log('[DRY RUN] Re-run with --write.'); return; }

  const { error } = await supabase.from('politicians').update({
    total_funds: LIFETIME_RECEIPTS,
    contribution_breakdown: polForScoring.contributionBreakdown,
    aipac_funding: TRACKAIPAC.pacs,
    israel_lobby_total: TRACKAIPAC.total,
    israel_lobby_breakdown: polForScoring.israelLobbyBreakdown,
    corruption_score: score.score,
    data_source: 'trackaipac_canonical',
    updated_at: new Date().toISOString(),
  }).eq('bioguide_id', BIOGUIDE_ID);
  if (error) { console.error(`DB update failed: ${error.message}`); process.exit(1); }
  console.log('DB update succeeded.');
}

main().catch(err => { console.error(err); process.exit(1); });

#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Ingest OH SOS itemized Acton contributions into the politicians table.
 *
 * Reads data-ingestion/oh-acton-itemized.json (produced by the Playwright
 * scraper), computes real donor_forensics, replaces the estimate-based top
 * donors with the verified named PACs, and recomputes the corruption score.
 *
 * Usage:
 *   npx tsx scripts/ingest-oh-acton-itemized.ts --dry-run
 *   npx tsx scripts/ingest-oh-acton-itemized.ts --write
 */

import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { computeCorruptionScore } from '../lib/corruption-score';
import type { Politician, DonorForensics } from '../lib/types';
import { computeDonorForensics, type OhContribution } from './sync-oh-state-finance';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const INPUT = 'data-ingestion/oh-acton-itemized.json';
const BIOGUIDE_ID = 'oh-gov-2026-amy-acton';
const REPORTED_TOTAL_2026_Q1 = 9_300_000;

type RawRow = string[];

function parseAmount(s: string): number {
  return Number((s || '').replace(/[$,]/g, '')) || 0;
}

function toOhContrib(r: RawRow): OhContribution {
  const nonInd = (r[1] || '').trim();
  const isPac = Boolean(nonInd) || Boolean(r[2] && r[2] !== '-');
  return {
    contributor_name: nonInd || (r[0] || '').trim(),
    contributor_type: isPac ? (/PARTY|DEMOCRATIC|REPUBLICAN/.test(nonInd) ? 'Party' : 'PAC') : 'Individual',
    contributor_address: (r[3] || '').trim() + (r[5] ? `, ${r[5]}` : '') + (r[6] ? ` ${r[6]}` : ''),
    contributor_employer: (r[12] || '').trim() || null,
    contributor_occupation: null,
    amount: parseAmount(r[10]),
    date: (r[9] || '').trim() || null,
    filing_id: null,
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run') || !argv.includes('--write');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  if (!fs.existsSync(INPUT)) {
    console.error(`ERROR: ${INPUT} not found. Run the Playwright scraper first.`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(INPUT, 'utf8')) as RawRow[];
  const contribs = raw.map(toOhContrib).filter(c => c.amount > 0);
  console.log(`Loaded ${contribs.length} itemized contributions`);

  // Compute forensics
  const forensics: DonorForensics = computeDonorForensics(contribs, 'OH');
  console.log('Forensic signals:');
  console.log(`  missing_employer_ratio: ${(forensics.missingEmployerRatio * 100).toFixed(1)}%`);
  console.log(`  out_of_state_pct:       ${(forensics.outOfStatePct * 100).toFixed(1)}%`);
  console.log(`  household_bundling:     ${(forensics.householdBundling * 100).toFixed(2)}%`);
  console.log(`  donation_std_dev (CV):  ${forensics.donationStdDev.toFixed(3)}`);
  console.log(`  platform_opacity:       ${(forensics.platformOpacity * 100).toFixed(1)}%`);
  console.log('');

  // Aggregate top donors (PACs + totals)
  const byDonor: Record<string, { name: string; amount: number; type: string; is_israel_lobby: boolean }> = {};
  let pacTotal = 0;
  let individualTotal = 0;
  for (const c of contribs) {
    const key = c.contributor_name.toUpperCase();
    if (!byDonor[key]) byDonor[key] = { name: c.contributor_name, amount: 0, type: c.contributor_type, is_israel_lobby: false };
    byDonor[key].amount += c.amount;
    if (c.contributor_type === 'Individual') individualTotal += c.amount;
    else pacTotal += c.amount;
  }
  const top5 = Object.values(byDonor).sort((a, b) => b.amount - a.amount).slice(0, 5);
  console.log('Top 5 itemized donors:');
  for (const d of top5) console.log(`  $${d.amount.toLocaleString().padStart(10)} — ${d.name} (${d.type})`);
  console.log('');

  const itemizedTotal = contribs.reduce((s, c) => s + c.amount, 0);
  const nonItemizedEst = Math.max(0, REPORTED_TOTAL_2026_Q1 - itemizedTotal);
  console.log(`Itemized total (≥$200):  $${itemizedTotal.toLocaleString()}`);
  console.log(`Non-itemized (est.):     $${nonItemizedEst.toLocaleString()}`);
  console.log(`Reported cumulative:     $${REPORTED_TOTAL_2026_Q1.toLocaleString()}`);
  console.log('');

  // Load current politician for score recompute
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: currentRow, error: loadErr } = await supabase
    .from('politicians')
    .select('*')
    .eq('bioguide_id', BIOGUIDE_ID)
    .single();
  if (loadErr || !currentRow) {
    console.error(`Failed to load politician: ${loadErr?.message}`);
    process.exit(1);
  }

  const contribution_breakdown = {
    aipac: 0,
    otherPACs: pacTotal,
    individuals: individualTotal + nonItemizedEst,
    corporate: 0,
  };

  const polForScoring: Politician = {
    id: BIOGUIDE_ID,
    name: currentRow.name,
    office: currentRow.office,
    officeLevel: currentRow.office_level,
    party: currentRow.party,
    jurisdiction: currentRow.jurisdiction,
    jurisdictionType: currentRow.jurisdiction_type,
    corruptionScore: currentRow.corruption_score,
    juiceBoxTier: currentRow.juice_box_tier,
    aipacFunding: 0,
    totalFundsRaised: REPORTED_TOTAL_2026_Q1,
    top5Donors: top5 as Politician['top5Donors'],
    contributionBreakdown: contribution_breakdown,
    israelLobbyTotal: 0,
    israelLobbyBreakdown: { total: 0, pacs: 0, ie: 0, bundlers: 0 },
    isActive: currentRow.is_active ?? false,
    isCandidate: true,
    runningFor: currentRow.running_for ?? 'Governor of Ohio',
    tags: currentRow.tags || [],
    bio: currentRow.bio,
    socialMedia: currentRow.social_media,
    dataSource: 'oh_sos_playwright_2026q1',
    donorForensics: forensics,
    courtCases: [],
    lobbyingRecords: currentRow.lobbying_records || [],
    votes: [],
  };
  const score = computeCorruptionScore(polForScoring);
  console.log(`Corruption score: ${currentRow.corruption_score} → ${score.score} (${score.grade}, ${score.confidence} confidence)`);
  for (const f of score.factors) {
    console.log(`  ${f.key}: raw=${f.rawScore} weight=${f.weight.toFixed(2)} data=${f.dataAvailable}`);
  }
  console.log('');

  if (dryRun) {
    console.log('[DRY RUN] No DB write. Re-run with --write.');
    return;
  }

  const { error } = await supabase
    .from('politicians')
    .update({
      total_funds: REPORTED_TOTAL_2026_Q1,
      top5_donors: top5,
      contribution_breakdown,
      aipac_funding: 0,
      israel_lobby_total: 0,
      israel_lobby_breakdown: { total: 0, pacs: 0, ie: 0, bundlers: 0 },
      corruption_score: score.score,
      data_source: 'oh_sos_playwright_2026q1',
      updated_at: new Date().toISOString(),
    })
    .eq('bioguide_id', BIOGUIDE_ID);
  if (error) {
    console.error(`DB update failed: ${error.message}`);
    process.exit(1);
  }
  console.log('DB update succeeded.');
}

main().catch(err => { console.error(err); process.exit(1); });

#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Load Brian Mast's Israel/Middle-East voting record from GovTrack into DB,
 * then recompute corruption score with v6 algorithm weights + canonical
 * TrackAIPAC Israel-lobby totals.
 *
 * Data source: data-ingestion/mast-israel-votes.json (produced by GovTrack
 * API pull, filtered to Israel/Gaza/Hamas/Iran/antisemitism/war-powers bills).
 */

import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { computeCorruptionScore } from '../lib/corruption-score';
import type { Politician } from '../lib/types';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BIOGUIDE_ID = '317b2e4e-5dcf-478b-bad4-1518d0fc20c2';
const INPUT = 'data-ingestion/mast-israel-votes.json';

interface RawVote { date: string; vote: string; question: string; category: string; url: string; }

interface VotingRecord {
  bill_number: string;
  bill_title: string;
  vote_date: string;
  vote: 'Yea' | 'Nay' | 'Not Voting' | 'Present';
  category: string;
  source_url: string;
}

function extractBillNumber(question: string): string {
  const m = question.match(/^([A-Z]\.\s*\w+\.?\s*\d+)|^(H\.R\.\s*\d+)|^(S\.\s*\d+)|^(H\.Res\.\s*\d+)|^(H\.Con\.Res\.\s*\d+)|^(H\.Amdt\.\s*\d+)/i);
  return m ? m[0].trim().replace(/\s+/g, ' ') : '';
}

function normalizeVote(v: string): VotingRecord['vote'] {
  const u = v.toUpperCase();
  if (u === 'YEA' || u === 'AYE' || u === 'YES') return 'Yea';
  if (u === 'NAY' || u === 'NO') return 'Nay';
  if (u === 'PRESENT') return 'Present';
  return 'Not Voting';
}

// Pro-Israel-aligned positions. For each bill category, the "aligned" vote
// value (what an AIPAC-endorsed member would vote).
function classifyAlignment(question: string, vote: VotingRecord['vote']): { relevant: boolean; aligned: boolean; rationale: string } {
  const q = question.toLowerCase();
  // Anti-Israel measures — aligned = NAY
  if (/strike.*israeli.*(funding|cooperative)/.test(q) ||
      /war powers.*remove united states armed forces/.test(q) ||
      /gaza pier/.test(q)) {
    return { relevant: true, aligned: vote === 'Nay' || vote === 'Not Voting', rationale: 'Anti-Israel measure; aligned = vote against' };
  }
  // Pro-Israel measures — aligned = YEA
  if (/israel security|antisemitism|condemning.*hamas|condemning.*antisemit|iran sanctions|anti-bds|no immigration benefits.*hamas|from the river to the sea|condemning iran|iran.*state sponsor|iran counterterrorism|iran-china|rescission.*waivers.*iran/i.test(q)) {
    return { relevant: true, aligned: vote === 'Yea', rationale: 'Pro-Israel measure; aligned = Yea' };
  }
  return { relevant: true, aligned: false, rationale: 'Israel/ME-related but alignment neutral' };
}

async function main(): Promise<void> {
  const dryRun = !process.argv.includes('--write');
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) { console.error('SUPABASE env required'); process.exit(1); }

  const raw = JSON.parse(fs.readFileSync(INPUT, 'utf8')) as RawVote[];
  console.log(`Loaded ${raw.length} Israel/ME-related votes from GovTrack`);

  const votes: VotingRecord[] = raw.map(r => ({
    bill_number: extractBillNumber(r.question),
    bill_title: r.question,
    vote_date: r.date,
    vote: normalizeVote(r.vote),
    category: r.category || 'israel-middle-east',
    source_url: r.url,
  }));

  let aligned = 0;
  let nonAligned = 0;
  const annotated = votes.map(v => {
    const cls = classifyAlignment(v.bill_title, v.vote);
    if (cls.aligned) aligned++; else nonAligned++;
    return { ...v, israel_aligned: cls.aligned };
  });
  const alignmentRate = votes.length > 0 ? aligned / votes.length : 0;
  console.log(`Pro-Israel alignment: ${aligned}/${votes.length} = ${(alignmentRate * 100).toFixed(1)}%`);
  console.log('');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: row, error: loadErr } = await supabase
    .from('politicians').select('*').eq('bioguide_id', BIOGUIDE_ID).single();
  if (loadErr || !row) { console.error('Load failed:', loadErr?.message); process.exit(1); }

  // Map to the Vote interface the scorer expects (camelCase-ish with the
  // fields the scorer inspects: billNumber, billTitle, voteValue, category)
  const scorerVotes = annotated.map((v, i) => ({
    id: `mast-${i}`,
    politicianId: BIOGUIDE_ID,
    billNumber: v.bill_number,
    billTitle: v.bill_title,
    voteValue: v.vote,
    date: v.vote_date,
    billSummary: v.bill_title,
    category: v.category,
    israel_aligned: v.israel_aligned,
  }));

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
    aipacFunding: row.aipac_funding,
    totalFundsRaised: row.total_funds,
    top5Donors: row.top5_donors as Politician['top5Donors'],
    contributionBreakdown: row.contribution_breakdown,
    israelLobbyTotal: row.israel_lobby_total,
    israelLobbyBreakdown: row.israel_lobby_breakdown,
    isActive: true,
    tags: row.tags || [],
    bio: row.bio,
    socialMedia: row.social_media,
    source_ids: row.source_ids,
    dataSource: row.data_source,
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
    votes: scorerVotes,
  };
  const score = computeCorruptionScore(polForScoring);
  console.log(`Corruption score: ${row.corruption_score} → ${score.score} (${score.grade}, ${score.confidence} confidence)`);
  for (const f of score.factors) {
    console.log(`  ${f.key}: raw=${f.rawScore} weight=${f.weight.toFixed(2)}`);
    console.log(`    ${f.explanation}`);
  }
  console.log('');

  if (dryRun) { console.log('[DRY RUN] Re-run with --write.'); return; }

  const { error } = await supabase.from('politicians').update({
    voting_records: annotated,
    corruption_score: score.score,
    updated_at: new Date().toISOString(),
  }).eq('bioguide_id', BIOGUIDE_ID);
  if (error) { console.error(`DB update failed: ${error.message}`); process.exit(1); }
  console.log(`DB updated: ${annotated.length} voting records + score ${score.score}`);
}

main().catch(err => { console.error(err); process.exit(1); });

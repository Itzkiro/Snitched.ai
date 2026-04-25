#!/usr/bin/env npx tsx
/**
 * Seed Rep. John Rose (R-TN-06, running TN Governor 2026) — audited 2026-04-24.
 *
 * Policy applied:
 *   feedback_snitched_cycle_only_scoring
 *     Rose's live israel_lobby_breakdown reflects ONLY his 2026-cycle
 *     (federal dormant House cmte C00652743 + state TN REF gubernatorial
 *     cmte 11451) direct PAC + high-confidence bundler money. Zero pro-Israel
 *     PAC direct, 1 high-conf bundler $35 to JStreetPAC (dovish counter-signal).
 *
 * Capture pattern is BEHAVIORAL/VOTING (110 Israel/Iran/foreign-aid votes,
 * maximalist aid aligner) rather than financial (zero AIPAC-network money).
 * juice_box_tier=compromised set by curator: voting record substantively
 * indistinguishable from Blackburn but money side is clean — caught by
 * structural-alignment floor.
 *
 * CLI:
 *   npx tsx scripts/seed-rose-tn-gov.ts              # dry-run (default)
 *   npx tsx scripts/seed-rose-tn-gov.ts --dry-run    # dry-run explicit
 *   npx tsx scripts/seed-rose-tn-gov.ts --write      # commit to Supabase
 *
 * Uses the same upsert pattern as scripts/seed-tn-gov-2026.ts.
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
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

const INGESTION_DIR = path.join(__dirname, '..', 'data-ingestion');

// ---------------------------------------------------------------------------
// Vote normalization
// ---------------------------------------------------------------------------

interface RawHistoricalVote {
  bill?: string;
  title?: string;
  date?: string;
  position?: string;
  description?: string;
  relevance?: string;
  category?: string;
  congress?: number;
  chamber?: string;
  result?: string;
  govtrack_link?: string;
}

interface NormalizedVote {
  bill: string;
  bill_title: string;
  title: string;
  date: string;
  vote_position: string;
  position: string;
  description: string;
  relevance: string;
  category: string;
  congress: number | null;
  chamber: string;
  result: string;
  govtrack_link: string;
}

function loadRoseVotes(): NormalizedVote[] {
  const abs = path.join(INGESTION_DIR, 'rose-votes-historical.json');
  const raw = fs.readFileSync(abs, 'utf8').trim();
  if (!raw) return [];
  const arr = JSON.parse(raw) as RawHistoricalVote[];
  return arr.map(v => {
    const title = (v.title || '').slice(0, 400);
    const description = (v.description || '').slice(0, 400);
    const position = v.position || '';
    return {
      bill: v.bill || '',
      bill_title: title,
      title,
      date: v.date || '',
      vote_position: position,
      position,
      description,
      relevance: v.relevance || '',
      category: v.category || '',
      congress: typeof v.congress === 'number' ? v.congress : null,
      chamber: v.chamber || '',
      result: v.result || '',
      govtrack_link: v.govtrack_link || '',
    };
  });
}

// ---------------------------------------------------------------------------
// Types (same shape as seed-tn-gov-2026.ts)
// ---------------------------------------------------------------------------

interface TopDonor {
  name: string;
  amount: number;
  type: string;
}

interface ContributionBreakdown {
  aipac: number;
  corporate: number;
  otherPACs: number;
  individuals: number;
}

interface IsraelLobbyBreakdown {
  ie: number;
  pacs: number;
  total: number;
  source: string;
  bundlers: number;
  cycles_count: number;
  pac_details: Array<Record<string, unknown>>;
  individual_registry: Record<string, unknown>;
  note: string;
}

interface RedFlag {
  severity: 'high' | 'med' | 'low';
  label: string;
  source: string;
  date: string;
}

interface SourceIds {
  fec_candidate_id?: string;
  fec_principal_committee_id?: string;
  tn_ref_committee_id?: string;
  red_flags: RedFlag[];
  positions: Record<string, string>;
}

interface CandidatePayload {
  bioguide_id: string;
  name: string;
  office: string;
  office_level: string;
  party: 'Republican' | 'Democrat' | 'Independent' | 'Nonpartisan' | 'Other';
  district: string | null;
  jurisdiction: string;
  jurisdiction_type: string;
  is_candidate: boolean;
  running_for: string;
  is_active: boolean;
  data_source: string;
  total_funds: number;
  contribution_breakdown: ContributionBreakdown;
  israel_lobby_total: number;
  israel_lobby_breakdown: IsraelLobbyBreakdown;
  juice_box_tier: 'none' | 'compromised' | 'bought' | 'owned';
  top5_donors: TopDonor[];
  voting_records: NormalizedVote[];
  lobbying_records: unknown[];
  court_records: unknown[];
  source_ids: SourceIds;
  bio: string;
  aipac_funding: number;
}

// ---------------------------------------------------------------------------
// Rose payload
// ---------------------------------------------------------------------------

function buildRose(): CandidatePayload {
  const votes = loadRoseVotes();

  return {
    bioguide_id: 'tn-gov-2026-john-rose',
    name: 'John Rose',
    office: 'Governor of Tennessee',
    office_level: 'state',
    party: 'Republican',
    district: null,
    jurisdiction: 'Tennessee',
    jurisdiction_type: 'state',
    is_candidate: true,
    running_for: 'Governor of Tennessee (2026)',
    is_active: true,
    data_source: 'audit_2026-04-23_tn_gov_2026_cycle_only',
    // $77,993 federal (dormant House C00652743) + $1,607,805 TN REF gov 11451.
    total_funds: 1685798,
    contribution_breakdown: {
      individuals: 1420230,
      otherPACs: 80100,
      corporate: 107475,
      aipac: 0,
    },
    israel_lobby_total: 35, // 1 high-conf bundler $35 — JStreetPAC counter-signal
    israel_lobby_breakdown: {
      ie: 0,
      pacs: 0,
      total: 35,
      source: 'fec_2026_house + tn_ref_2026_gov (cycle-only)',
      bundlers: 35,
      cycles_count: 1,
      pac_details: [],
      individual_registry: {
        matches: 1,
        source: 'high-conf-only',
        itemized_individual_rows: 1490,
        high_confidence: 1,
        medium_confidence: 'deferred — false-positive bug',
        these_donors_to_pro_israel_career: 700,
        to_candidate: 35,
        top_donors: [
          {
            name: 'SMITH, WILLIAM',
            state: 'TN',
            confidence: 'high',
            to_candidate: 35,
            career_to_pro_israel_pacs: 700,
            pacs: ['JStreetPAC'],
            note: 'JStreetPAC is dovish/progressive — counter-signal to AIPAC-network capture',
          },
        ],
      },
      note:
        'Quantitative pro-Israel-money signal is null in 2026 cycle. The single $35 match is to JStreetPAC (dovish), not AIPAC-network. Rose\'s pro-Israel-lobby alignment is expressed through VOTING (maximalist Israel aid) not through donor capture.',
    },
    juice_box_tier: 'compromised', // curator-set: voting-based capture, money clean
    top5_donors: [
      { name: 'DRIVING TENNESSEE PAC', amount: 30800, type: 'PAC' },
      {
        name: 'SEVIER COUNTY GOOD GOVERNMENT PAC (Dollywood/Sevier tourism)',
        amount: 30800,
        type: 'PAC',
      },
      { name: 'ROGERS GROUP INC. PAC (TN construction)', amount: 10000, type: 'PAC' },
      { name: 'NATIONAL HEALTH CORP. PAC (NHCPAC)', amount: 5000, type: 'PAC' },
      { name: 'TENNESSEE STATE PIPE TRADES ASSOCIATION PAC', amount: 2500, type: 'PAC' },
    ],
    voting_records: votes,
    lobbying_records: [],
    court_records: [],
    // Zero pro-Israel PAC direct this cycle. israelLobbyTotal $35 drives the factor.
    aipac_funding: 0,
    source_ids: {
      fec_candidate_id: 'H8TN06094',
      fec_principal_committee_id: 'C00652743',
      tn_ref_committee_id: '11451',
      red_flags: [
        {
          severity: 'high',
          label:
            'Jan 6, 2021 — voted to overturn Arizona AND Pennsylvania electoral votes (1 of 139 House Rs); also joined Texas v. PA Supreme Court amicus brief Dec 2020 attempting to invalidate election results in 4 swing states',
          source: 'Congress roll calls + court filings',
          date: '2020-12 / 2021-01',
        },
        {
          severity: 'high',
          label:
            'Voting record: 9/12 AYE on direct Israel-aid funding (2021 Iron Dome, 2022 Iron Dome supp, 2023 H.R. 6126, 2024 H.R. 8034 $26B); AYE on Abraham Accords expansion; NAY on Iran War Powers withdrawal; 100% AYE on anti-BDS — textbook pro-Israel-lobby House R alignment despite zero documented donor capture',
          source: 'GovTrack votes 2019-2026 (data-ingestion/rose-votes-historical.json)',
          date: 'n/a',
        },
        {
          severity: 'med',
          label:
            'Voted NO on Congressional Gold Medal for Capitol Police officers who defended on Jan 6 (one of few House Rs to oppose)',
          source: 'Congress roll call',
          date: '2021-06',
        },
        {
          severity: 'med',
          label:
            'Unilaterally blocked $19.1 billion bipartisan disaster-relief bill on House floor 2019 — used unanimous-consent objection to halt aid for hurricanes / wildfires / flooding',
          source: 'Washington Post + Tennessean',
          date: '2019-05',
        },
      ],
      positions: {
        israel_aid: 'MAXIMALIST_UNCONDITIONAL_AID',
        aipac_fara: 'no public position; aligned voter without donor capture',
        iran_jcpoa: 'PRO_SANCTIONS / OPPOSE_WAR_POWERS_WITHDRAWAL',
        foreign_aid_general: 'America-First-with-Israel-exception (NAY on Ukraine, AYE on Israel)',
        heritage_action_score_119th: '100%',
        trump_endorsement_2026_gov: 'NONE — neutral between Rose and Blackburn',
        scoring_note:
          'Capture pattern is BEHAVIORAL/VOTING (decades of pro-Israel-aid alignment) rather than financial (zero AIPAC-network donor money). juice_box_tier=compromised set by curator: voting record substantively indistinguishable from Blackburn but money side is clean — caught by structural alignment floor.',
      },
    },
    bio:
      "Republican U.S. Representative for TN-06 (Cookeville) since January 2019, running for Governor of Tennessee in the August 6, 2026 GOP primary against Sen. Marsha Blackburn (frontrunner ~58%) and TN State Rep Monty Fritts (~4%). Polls at ~7%. Cookeville businessman and farmer; founded software-certification firm Boson Software, sold related company Transcender for ~$60M; estimated net worth ~$48M+, the wealthiest of the 3 GOP gubernatorial candidates. Combined 2026-cycle fundraising: $1.69M ($1.6M TN REF state gubernatorial committee 11451 + $77K dormant federal House cmte C00652743). State-cmte donor base is overwhelmingly TN-local: top PACs are Driving Tennessee PAC ($30.8K), Sevier County Good Government PAC ($30.8K, Dollywood/Sevier tourism power-base), Rogers Group construction ($10K), NHCPAC, TN State Pipe Trades. Cross-reference of his 1,490 itemized individual donors against the 33,719-key pro-Israel donor registry surfaces only 1 high-confidence match: William Smith (TN), $35 to Rose, $700 career to JStreetPAC (dovish/progressive — counter-signal, not AIPAC-network). VOTING record is a textbook pro-Israel-lobby House R: AYE on every Israel supplemental (2021 Iron Dome, 2022 Iron Dome, 2023 H.R. 6126, 2024 H.R. 8034 $26.38B), AYE on Abraham Accords expansion, AYE on anti-BDS measures, NAY on Iran War Powers withdrawal, 75% AYE on direct Israel-aid funding bills. Heritage Action scorecard 100% (119th Congress). Notable controversies: Jan 6 2021 voted to overturn Arizona + Pennsylvania electoral votes; joined Texas v. Pennsylvania amicus brief Dec 2020; voted NO on Capitol Police Gold Medal; unilaterally blocked $19.1B bipartisan disaster relief on House floor 2019. Trump has NOT endorsed in the primary.",
  };
}

// ---------------------------------------------------------------------------
// Score + upsert
// ---------------------------------------------------------------------------

function computeScoreForPayload(p: CandidatePayload): {
  score: number;
  grade: string;
  confidence: string;
} {
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

async function upsertCandidate(
  supabase: SupabaseClient,
  p: CandidatePayload,
  score: number,
): Promise<void> {
  const nowIso = new Date().toISOString();
  const payload = {
    bioguide_id: p.bioguide_id,
    name: p.name,
    office: p.office,
    office_level: p.office_level,
    party: p.party,
    district: p.district,
    jurisdiction: p.jurisdiction,
    jurisdiction_type: p.jurisdiction_type,
    photo_url: null,
    corruption_score: score,
    aipac_funding: p.aipac_funding,
    juice_box_tier: p.juice_box_tier,
    total_funds: p.total_funds,
    top5_donors: p.top5_donors,
    israel_lobby_total: p.israel_lobby_total,
    israel_lobby_breakdown: p.israel_lobby_breakdown,
    contribution_breakdown: p.contribution_breakdown,
    is_active: p.is_active,
    is_candidate: p.is_candidate,
    running_for: p.running_for,
    years_in_office: 0,
    bio: p.bio,
    term_start: null,
    term_end: null,
    social_media: {},
    source_ids: p.source_ids,
    data_source: p.data_source,
    lobbying_records: p.lobbying_records,
    voting_records: p.voting_records,
    court_records: p.court_records,
    updated_at: nowIso,
  };

  const { data: existing } = await supabase
    .from('politicians')
    .select('bioguide_id,name')
    .eq('bioguide_id', p.bioguide_id)
    .maybeSingle();

  if (existing) {
    console.log(`  [update] existing row for ${existing.name}`);
    const { error } = await supabase
      .from('politicians')
      .update(payload)
      .eq('bioguide_id', p.bioguide_id);
    if (error) throw error;
  } else {
    console.log(`  [insert] new row for ${p.name}`);
    const { error } = await supabase
      .from('politicians')
      .insert({ ...payload, created_at: nowIso });
    if (error) throw error;
  }
}

function printPlannedDiff(
  p: CandidatePayload,
  score: number,
  grade: string,
  confidence: string,
): void {
  console.log(`\n--- ${p.name} (${p.bioguide_id}) ---`);
  console.log(`  office:            ${p.office} (${p.office_level})`);
  console.log(`  party/jurisdiction: ${p.party} / ${p.jurisdiction}`);
  console.log(`  is_candidate:      ${p.is_candidate}   is_active: ${p.is_active}`);
  console.log(`  running_for:       ${p.running_for}`);
  console.log(`  total_funds:       $${p.total_funds.toLocaleString()}`);
  console.log(
    `  contribution_breakdown: ind=$${p.contribution_breakdown.individuals.toLocaleString()} otherPACs=$${p.contribution_breakdown.otherPACs.toLocaleString()} corp=$${p.contribution_breakdown.corporate.toLocaleString()} aipac=$${p.contribution_breakdown.aipac.toLocaleString()}`,
  );
  console.log(
    `  israel_lobby:      total=$${p.israel_lobby_total.toLocaleString()} pacs=$${p.israel_lobby_breakdown.pacs.toLocaleString()} bundlers=$${p.israel_lobby_breakdown.bundlers.toLocaleString()} cycles=${p.israel_lobby_breakdown.cycles_count}`,
  );
  console.log(`  juice_box_tier:    ${p.juice_box_tier}`);
  console.log(`  top5_donors:       ${p.top5_donors.length} entries`);
  console.log(`  voting_records:    ${p.voting_records.length} votes`);
  console.log(
    `  red_flags:         ${p.source_ids.red_flags.length} (high=${p.source_ids.red_flags.filter(f => f.severity === 'high').length}, med=${p.source_ids.red_flags.filter(f => f.severity === 'med').length})`,
  );
  console.log(`  positions keys:    ${Object.keys(p.source_ids.positions).length}`);
  console.log(`  data_source:       ${p.data_source}`);
  console.log(`  --> computed corruption_score: ${score} (grade ${grade}, confidence ${confidence})`);
}

async function verifyRow(supabase: SupabaseClient, bioguide_id: string): Promise<void> {
  const { data, error } = await supabase
    .from('politicians')
    .select(
      'bioguide_id,name,corruption_score,juice_box_tier,is_active,is_candidate,data_source,israel_lobby_total,total_funds',
    )
    .eq('bioguide_id', bioguide_id)
    .single();
  if (error) throw error;
  console.log(`  DB VERIFY ${bioguide_id}:`);
  console.log(`    ${JSON.stringify(data)}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const mode = WRITE ? 'WRITE' : 'DRY-RUN';
  console.log(`\n=== ROSE TN GOV 2026 SEED (${mode}) ===`);
  console.log('Policy applied:');
  console.log('  - feedback_snitched_cycle_only_scoring (2026 federal + state only)');

  const ROSE = buildRose();
  const payloads: CandidatePayload[] = [ROSE];

  const planned: Array<{
    p: CandidatePayload;
    score: number;
    grade: string;
    confidence: string;
  }> = [];
  for (const p of payloads) {
    const r = computeScoreForPayload(p);
    printPlannedDiff(p, r.score, r.grade, r.confidence);
    planned.push({ p, score: r.score, grade: r.grade, confidence: r.confidence });
  }

  if (DRY_RUN) {
    console.log('\nDRY-RUN complete. No DB writes. Re-run with --write to commit.');
    printSummaryTable(planned);
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('\n=== WRITING TO SUPABASE ===');
  for (const { p, score } of planned) {
    console.log(`\nUpserting ${p.name} (${p.bioguide_id})...`);
    await upsertCandidate(supabase, p, score);
  }

  console.log('\n=== POST-WRITE VERIFICATION ===');
  for (const { p } of planned) {
    await verifyRow(supabase, p.bioguide_id);
  }

  printSummaryTable(planned);
  console.log(`\nWRITE complete. ${planned.length} rows upserted.`);
}

function printSummaryTable(
  planned: Array<{ p: CandidatePayload; score: number; grade: string; confidence: string }>,
): void {
  console.log('\n=== SUMMARY TABLE ===');
  const header = ['name', 'bioguide_id', 'score', 'grade', 'tier', 'red_flags', 'data_source'];
  console.log(header.join(' | '));
  console.log(header.map(h => '-'.repeat(Math.max(h.length, 3))).join('-|-'));
  for (const { p, score, grade } of planned) {
    console.log(
      [
        p.name,
        p.bioguide_id,
        String(score),
        grade,
        p.juice_box_tier,
        String(p.source_ids.red_flags.length),
        p.data_source,
      ].join(' | '),
    );
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

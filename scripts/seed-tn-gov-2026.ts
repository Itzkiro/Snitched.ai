#!/usr/bin/env npx tsx
/**
 * Seed the two Tennessee 2026 gubernatorial candidates audited on 2026-04-23:
 *   - Marsha Blackburn  (tn-gov-2026-marsha-blackburn) — establishment frontrunner
 *   - Monty Fritts      (tn-gov-2026-monty-fritts)    — grassroots anti-establishment
 *
 * Applies two active Snitched scoring policies:
 *   1. feedback_snitched_cycle_only_scoring
 *      Blackburn's live israel_lobby_breakdown reflects ONLY her 2026-cycle
 *      direct PAC + high-confidence bundler money. Historical (2018 + 2024
 *      Senate cycles, $587K+ career per BoughtByZionism/TrackAIPAC) is moved
 *      to source_ids.historical_breakdown for context display only.
 *
 *   2. feedback_snitched_anti_aipac_is_clean
 *      Fritts wants to cut ALL foreign aid until the budget balances — that
 *      IS his Israel-aid posture. His non-lobby personal-rhetoric flags
 *      (Christian-Nationalist self-label, capital-punishment-for-trans-parents
 *      podcast, geoengineering bill) are documented in bio as biographical
 *      context but are NOT written to source_ids.red_flags; they are not
 *      foreign-influence-lobby capture and should not pad the Snitched score.
 *
 * CLI:
 *   npx tsx scripts/seed-tn-gov-2026.ts              # dry-run (default)
 *   npx tsx scripts/seed-tn-gov-2026.ts --dry-run    # dry-run explicit
 *   npx tsx scripts/seed-tn-gov-2026.ts --write      # commit to Supabase
 *
 * Uses the same upsert pattern as scripts/seed-aaron-baker.ts.
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
// Vote normalization (Blackburn)
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

function loadBlackburnVotes(): NormalizedVote[] {
  const abs = path.join(INGESTION_DIR, 'blackburn-votes-historical.json');
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
// Candidate payloads
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
  fec_house_id_historical?: string;
  tn_ref_committee_id?: string;
  tn_ref_historical_committee_id?: string;
  red_flags: RedFlag[];
  positions: Record<string, string>;
  historical_breakdown?: Record<string, unknown>;
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
  // Scoring-time aipac field. For scoring we pass the high-conf PAC subtotal
  // (NORPAC direct $19,205 for Blackburn, $0 for Fritts) as aipacFunding;
  // israelLobbyTotal separately carries the bundler-inclusive total.
  aipac_funding: number;
}

// ---------------------------------------------------------------------------
// Fritts payload (clean — 0 red flags, 0 lobby money)
// ---------------------------------------------------------------------------

const FRITTS: CandidatePayload = {
  bioguide_id: 'tn-gov-2026-monty-fritts',
  name: 'Monty Fritts',
  office: 'Governor of Tennessee',
  office_level: 'state',
  party: 'Republican',
  district: null,
  jurisdiction: 'Tennessee',
  jurisdiction_type: 'state',
  is_candidate: true,
  running_for: 'Governor of Tennessee (2026)',
  is_active: true,
  data_source: 'audit_2026-04-23_tn_gov_2026',
  total_funds: 167292,
  contribution_breakdown: {
    individuals: 145300,
    otherPACs: 15400,
    corporate: 0,
    aipac: 0,
  },
  israel_lobby_total: 0,
  israel_lobby_breakdown: {
    ie: 0,
    pacs: 0,
    total: 0,
    source: 'tn_ref_2026_only',
    bundlers: 0,
    cycles_count: 0,
    pac_details: [],
    individual_registry: {
      matches: 0,
      source: 'tn-ref-2026-only',
      itemized_individual_rows: 383,
    },
    note: 'Zero pro-Israel PAC contributions and zero high-confidence individual bundler matches in 2026 cycle. Cross-referenced against 91-PAC superset and 33,719-key individual registry.',
  },
  juice_box_tier: 'none',
  top5_donors: [
    { name: 'TN Firearms Association Legislative Action Committee (TFALAC)', amount: 15400, type: 'PAC' },
    { name: 'Beverly Elliott', amount: 10600, type: 'Individual' },
    { name: 'Knox Liberty Organization', amount: 6800, type: 'Other' },
    { name: 'Monty Fritts (self-loan from TN-32 cmte carryover)', amount: 6477, type: 'Self' },
  ],
  voting_records: [],
  lobbying_records: [],
  court_records: [],
  aipac_funding: 0,
  source_ids: {
    tn_ref_committee_id: '11767',
    tn_ref_historical_committee_id: '9137',
    red_flags: [],
    positions: {
      israel_aid: 'OPPOSE_AS_PART_OF_ALL_FOREIGN_AID',
      aipac_fara: 'no public position',
      foreign_aid_general: 'CUT_UNTIL_BUDGET_BALANCED',
      bds: 'OPPOSE (per iVoterGuide)',
      christian_nationalist: 'SELF_EMBRACED_LABEL',
      scoring_note:
        'Functionally America First on foreign aid. Non-lobby personal-rhetoric controversies (Christian Nationalist label, capital-punishment-for-trans-parents podcast, geoengineering bill) are documented in bio but NOT scored as red_flags per Snitched policy: anti-AIPAC/anti-foreign-aid posture = clean signal.',
    },
  },
  bio:
    "Republican TN State Representative for District 32 (Roane County) since 2022, running for Governor of Tennessee in the August 6, 2026 GOP primary as the grassroots anti-establishment challenger to U.S. Senator Marsha Blackburn (frontrunner ~58%) and U.S. Rep John Rose. Army veteran, retired nuclear-industry worker, and Christian Nationalist self-identified. Carrying ~$11K from his TN-32 House campaigns into the gov race. As of Q1 2026 has raised $167,292 — entirely grassroots with zero pro-Israel PAC money and zero pro-Israel individual bundler signal cross-referenced against 91 lobby committees and 33,719 known pro-Israel individual donors. Top PAC donor: Tennessee Firearms Association Legislative Action Committee ($15,400, domestic 2nd Amendment). Platform: cut grocery sales tax, suspend legal immigration, eliminate state Department of Education, balance state budget by cutting ALL foreign aid pass-throughs. No documented AIPAC, CUFI, RJC, NorPAC, or UDP ties; no Israel trips. Polls 4-7% against the establishment frontrunner. Biographical context (not scored as foreign-influence red flags): in January 2026 a leaked podcast surfaced in which he advocated capital punishment for parents of children seeking gender-affirming care; he sponsored a 2024 TN bill restricting weather-modification/geoengineering; and he has explicitly embraced the 'Christian Nationalist' label in TN news interviews. These are documented for transparency but reflect domestic policy/rhetoric rather than foreign-lobby capture.",
};

// ---------------------------------------------------------------------------
// Blackburn payload (2026-cycle-only scoring; historical in source_ids)
// ---------------------------------------------------------------------------

function buildBlackburn(): CandidatePayload {
  const votes = loadBlackburnVotes();

  return {
    bioguide_id: 'tn-gov-2026-marsha-blackburn',
    name: 'Marsha Blackburn',
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
    // $6,754,961 TN gov + $2,753,251 federal Senate — both active in 2026.
    total_funds: 9508212,
    contribution_breakdown: {
      individuals: 240177,
      otherPACs: 123500,
      corporate: 0,
      aipac: 19205, // NORPAC direct (pro-Israel PAC subtotal)
    },
    israel_lobby_total: 73886, // $19,205 NORPAC + $54,681 bundlers
    israel_lobby_breakdown: {
      ie: 0,
      pacs: 19205,
      total: 73886,
      source: 'fec_2026_senate + tn_ref_2026_gov (cycle-only)',
      bundlers: 54681,
      cycles_count: 1, // 2026-cycle-only policy — historical moved to source_ids
      pac_details: [
        {
          committee_id: 'C00247403',
          name: 'NORPAC',
          amount: 19205,
          date: '2025-03-24',
          note: 'single lump, earmarked bundler conduit',
        },
      ],
      individual_registry: {
        matches: 4,
        source: 'fec_2026_senate-high-conf-only',
        itemized_individual_rows: 1020,
        high_confidence: 4,
        medium_confidence: 'deferred — known false-positive bug under remediation',
        these_donors_to_pro_israel_career: 3700000,
        to_candidate: 54681,
        top_donors: [
          {
            name: 'LEVY, EDWARD',
            state: 'MI',
            confidence: 'high',
            to_candidate: 0,
            career_to_pro_israel_pacs: 1350000,
            pacs: ['AIPAC PAC', 'UDP', 'Pro-Israel America'],
          },
          {
            name: 'CHOUAKE, BENJAMIN',
            state: 'NJ',
            confidence: 'high',
            to_candidate: 0,
            career_to_pro_israel_pacs: 1090000,
            pacs: ['NORPAC (chair-level conduit)'],
          },
          {
            name: 'HALPERN, JUDITH',
            state: 'NY',
            confidence: 'high',
            to_candidate: 0,
            career_to_pro_israel_pacs: 715000,
            pacs: ['UDP', 'AIPAC PAC'],
          },
          {
            name: 'TOLL, BRUCE',
            state: 'FL',
            confidence: 'high',
            to_candidate: 0,
            career_to_pro_israel_pacs: 545000,
            pacs: ['RJC PAC', 'RJC Victory Fund'],
          },
        ],
      },
      note:
        '2026-cycle ONLY. Historical Senate cycles 2018+2024 not loaded into live score per cycle-only policy; lifetime pro-Israel-lobby total per BoughtByZionism / TrackAIPAC is $587K+ across her career — see source_ids.historical_breakdown.',
    },
    juice_box_tier: 'compromised', // curator-set per policy (>=45 floor)
    top5_donors: [
      { name: 'Blackburn Tennessee Victory Fund (her own JFC)', amount: 1600000, type: 'JFC' },
      {
        name: 'MARSHA FOR GOVERNOR (cross-pot transfer from her state cmte to federal cmte)',
        amount: 234500,
        type: 'Self',
      },
      { name: 'Pinnacle Financial Partners', amount: 138347, type: 'PAC' },
      { name: 'GO NETN PAC', amount: 30800, type: 'PAC' },
      { name: 'HNTB TN PAC', amount: 30800, type: 'PAC' },
    ],
    voting_records: votes,
    lobbying_records: [],
    court_records: [],
    // For scoring we pass aipacFunding = 19205 (direct pro-Israel PAC subtotal)
    // and israelLobbyTotal = 73886 (bundler-inclusive). The algorithm takes
    // the MAX of the two to avoid double-count, so 73886 drives the factor.
    aipac_funding: 19205,
    source_ids: {
      fec_candidate_id: 'S8TN00337',
      fec_principal_committee_id: 'C00376939',
      tn_ref_committee_id: '11725',
      fec_house_id_historical: 'H2TN06030',
      red_flags: [
        {
          severity: 'high',
          label:
            '$19,205 direct from NORPAC (pro-Israel lobby PAC, 2025-03-24 single lump, earmarked bundler conduit) — federal Senate cmte, 2026 cycle',
          source: 'FEC C00247403',
          date: '2025-03-24',
        },
        {
          severity: 'high',
          label:
            '$54,681 from 4 high-confidence pro-Israel-lobby individual bundlers (LEVY $1.35M career / CHOUAKE $1.09M NORPAC / HALPERN $715K UDP-AIPAC / TOLL $545K RJC) — federal Senate cmte, 2026 cycle',
          source: 'pro-israel-donors-registry-cross-ref-2026',
          date: '2026-04-23',
        },
        {
          severity: 'high',
          label:
            "23-year voting career as one of the Senate's most pro-Israel Republicans: AYE on 2016 $38B Israel MoU, AYE on H.Res.11 (anti-UNSCR 2334), 2x AYE on JCPOA Review Act, AYE on Iron Dome supplementals, anti-UNRWA lead, anti-Iran-deal lead sponsor",
          source: 'GovTrack votes 2003-2026 (data-ingestion/blackburn-votes-historical.json)',
          date: 'n/a',
        },
        {
          severity: 'high',
          label:
            'Documented Christians United for Israel (CUFI) panelist 2020; cosponsored AIPAC Anti-Boycott Act and Taylor Force Act; $587K+ lifetime pro-Israel-lobby total per BoughtByZionism / TrackAIPAC',
          source: 'boughtbyzionism.org/marsha_blackburn',
          date: 'n/a',
        },
        {
          severity: 'med',
          label:
            '$234,500 cross-pot transfer FROM her state-level MARSHA FOR GOVERNOR cmte TO her federal Senate cmte (state-to-federal money commingling concern; legal but worth flagging)',
          source: 'FEC Schedule A 2026 + TN REF cmte 11725',
          date: '2026',
        },
        {
          severity: 'med',
          label:
            '4 foreign-money-adjacent flags: Arnold & Porter (FARA-registered firm) employee donor $3,500; Siemens corporate PAC $2,500 (German parent); Toyota corporate PAC $1,000 × 2 (Japanese parent)',
          source: 'FARA + foreign-parent registry cross-ref',
          date: '2026',
        },
        {
          severity: 'med',
          label: 'DEA opioid bill controversy that derailed Marino DEA-administrator nomination (2017-2018)',
          source: 'Washington Post + 60 Minutes joint investigation',
          date: '2017-10',
        },
        {
          severity: 'med',
          label: "Named in CREW 'Most Corrupt Members of Congress' report 2010 (House years)",
          source: 'CREW report 2010',
          date: '2010',
        },
      ],
      positions: {
        israel_aid: 'MAXIMALIST_UNCONDITIONAL_MILITARY_AID',
        aipac_fara: 'OPPOSE — has not called for FARA registration',
        iran_jcpoa: 'LEAD_SPONSOR_OF_DISAPPROVAL',
        unrwa: 'LEAD_DEFUNDING_PUSH',
        cufi: '2020 panelist',
        rjc_aipac_norpac_udp: 'verified ties via $73,886 cycle + $587K lifetime',
        foreign_aid_general: 'PRO — establishment GOP hawk on Israel + Ukraine + Taiwan',
        scoring_note:
          'Textbook captured-establishment profile by Snitched\'s frame. juice_box_tier=compromised set by curator based on 2026-cycle direct $73,886 + 4 high-conf bundlers connected to $3.7M career pro-Israel money + decades of voting alignment + documented CUFI/AIPAC/NorPAC ties.',
      },
      historical_breakdown: {
        note: 'Federal Senate cycles 2018 + 2024 not loaded into live score per cycle-only policy. Lifetime pro-Israel-lobby total per BoughtByZionism/TrackAIPAC: $587,000+ across 23-year career. Tracked here for context display only.',
      },
    },
    bio:
      "Republican U.S. Senator from Tennessee since 2019 (former U.S. Rep TN-07 2003-2019), running for Governor of Tennessee in the August 6, 2026 GOP primary as the establishment frontrunner (~58% in March 2026 Cygnal poll vs Rep John Rose 7% and TN State Rep Monty Fritts 4%). Has raised $9.5M+ in active 2026 cycles ($6.75M state gubernatorial cmte, $2.75M federal Senate cmte) with $5.06M federal cash on hand. Documented as one of the Senate's most pro-Israel Republicans across a 23-year voting career: AYE on the 2016 $38B U.S.-Israel MoU, AYE on H.Res.11 rebuking UNSCR 2334 (anti-settlement), twice AYE on the JCPOA Review Act, AYE on the 2010 and 2014 Israel Security Cooperation Acts, AYE on Iron Dome funding supplementals, lead sponsor of multiple Iran sanctions and UNRWA defunding bills, cosponsor of the AIPAC Anti-Boycott Act and Taylor Force Act, 2020 CUFI panelist. Lifetime pro-Israel-lobby money totals $587K+ per BoughtByZionism / TrackAIPAC tallies. Snitched 2026-cycle-only scoring captures $73,886 of direct lobby capital this cycle ($19,205 NORPAC direct + $54,681 from 4 high-confidence individual bundlers tied to $3.7M of career pro-Israel-PAC giving — Edward Levy MI, Benjamin Chouake NJ NORPAC chair, Judith Halpern NY UDP-AIPAC, Bruce Toll FL RJC). Foreign-money-adjacent: $3,500 from an Arnold & Porter (FARA-registered firm) employee + $4,500 from Siemens (German parent) and Toyota (Japanese parent) corporate PACs. Compliance note: $234,500 cross-pot transfer from her state MARSHA FOR GOVERNOR committee back to her federal Senate committee in 2026 — legal but worth flagging as state-to-federal money commingling. Notable historical controversies (cited in red_flags): the 2017-2018 DEA opioid bill that derailed the Marino DEA nomination, and her inclusion in the 2010 CREW 'Most Corrupt Members of Congress' report.",
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

function printPlannedDiff(p: CandidatePayload, score: number, grade: string, confidence: string): void {
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
  console.log(`  red_flags:         ${p.source_ids.red_flags.length} (high=${p.source_ids.red_flags.filter(f => f.severity === 'high').length}, med=${p.source_ids.red_flags.filter(f => f.severity === 'med').length})`);
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
  console.log(`\n=== TN GOV 2026 SEED (${mode}) ===`);
  console.log('Policies applied:');
  console.log('  - feedback_snitched_cycle_only_scoring (Blackburn live = 2026-cycle only)');
  console.log('  - feedback_snitched_anti_aipac_is_clean (Fritts personal-rhetoric not scored)');

  const BLACKBURN = buildBlackburn();
  const payloads: CandidatePayload[] = [FRITTS, BLACKBURN];

  // Compute planned scores + print diffs (dry-run always prints; write prints too)
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
    printSummaryTable(planned, 0);
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

  printSummaryTable(planned, planned.length);
  console.log(`\nWRITE complete. ${planned.length} rows upserted.`);
}

function printSummaryTable(
  planned: Array<{ p: CandidatePayload; score: number; grade: string; confidence: string }>,
  _written: number,
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

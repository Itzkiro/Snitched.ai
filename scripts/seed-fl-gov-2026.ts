#!/usr/bin/env npx tsx
/**
 * Seed the three Florida 2026 GOP gubernatorial primary candidates audited on
 * 2026-04-24:
 *   - Byron Donalds   (fl-gov-2026-byron-donalds)  — Trump-endorsed frontrunner
 *   - James Fishback  (fl-gov-2026-james-fishback) — strongest anti-AIPAC voice
 *   - Jay Collins     (fl-gov-2026-jay-collins)    — DeSantis-appointed Lt Gov
 *
 * Applies two active Snitched scoring policies (per user 2026-04-24):
 *   1. feedback_snitched_cycle_only_scoring
 *      Donalds' live israel_lobby_breakdown shows cumulative capture for
 *      DISPLAY but the cycle-only subtotal ($13,015 — $7K federal PAC +
 *      $6,015 FL DOE high-conf bundlers) is the quantitative scoring driver.
 *      juice_box_tier='bought' carries the score via the v6.3 floor (70) —
 *      same mechanic as Blackburn and Rose. Historical 2020-2024 federal
 *      cycles ($127,128) are tracked in source_ids.historical_breakdown for
 *      context display only.
 *
 *   2. feedback_snitched_anti_aipac_is_clean
 *      Fishback is the strongest anti-AIPAC voice in the cohort: publicly
 *      labels AIPAC "a foreign lobbying group" (effective FARA framing),
 *      refuses all AIPAC-network donations, refuses paid Israel trips,
 *      called Netanyahu "immoral war criminal", pledges FL divestment from
 *      Israel Bonds. His non-lobby personal-financial controversies
 *      (Greenlight Capital lawsuit, US Marshals seizure, Azoria ETF shutdown,
 *      Incubate Debate, etc.) are documented in BIO as biographical context
 *      ONLY — they are NOT written to source_ids.red_flags and do NOT affect
 *      the corruption score. Same treatment as Monty Fritts and Tyler Dykes.
 *
 * CLI:
 *   npx tsx scripts/seed-fl-gov-2026.ts              # dry-run (default)
 *   npx tsx scripts/seed-fl-gov-2026.ts --dry-run    # dry-run explicit
 *   npx tsx scripts/seed-fl-gov-2026.ts --write      # commit to Supabase
 *
 * Forked from scripts/seed-tn-gov-2026.ts.
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
const DATA_DIR = path.join(__dirname, '..', 'data');

// ---------------------------------------------------------------------------
// Vote normalization (Donalds — historical)
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

function loadDonaldsVotes(): NormalizedVote[] {
  const abs = path.join(INGESTION_DIR, 'donalds-votes-historical.json');
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
// FLDOE top-donor helpers
// ---------------------------------------------------------------------------

interface FldoeSummaryDonor {
  name: string;
  amount: number;
}

interface FldoeJson {
  candidate_name?: string;
  summary?: {
    total_raised?: number;
    contribution_count?: number;
    unique_donors?: number;
    top_10_donors?: FldoeSummaryDonor[];
  };
}

function loadFldoeTopDonors(filename: string, limit = 5): TopDonor[] {
  const abs = path.join(INGESTION_DIR, filename);
  const raw = fs.readFileSync(abs, 'utf8').trim();
  if (!raw) return [];
  const d = JSON.parse(raw) as FldoeJson;
  const top = d.summary?.top_10_donors || [];
  return top.slice(0, limit).map(t => {
    // Crude type inference from name formatting. FL DOE data uses ALL CAPS
    // "LAST FIRST" for individuals; orgs typically contain commas, inc., llc,
    // pac, party, etc.
    const isLikelyIndividual =
      !/(LLC|INC\.?|PAC|PARTY|CORP|COMPANY|ASSOC|GROUP|FUND|COMMITTEE|BANK|TRUST|HOLDINGS|CAPITAL|REALTY)/i.test(
        t.name,
      ) && !t.name.includes('"');
    return {
      name: t.name,
      amount: Math.round(t.amount),
      type: isLikelyIndividual ? 'Individual' : 'Other',
    };
  });
}

// ---------------------------------------------------------------------------
// Types
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
  cycle_2026_subtotal?: number;
  historical_pac_network_subtotal?: number;
  cumulative_total_note?: string;
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
  fec_house_old_committee_id?: string;
  fl_doe_committee_filing?: string;
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
  aipac_funding: number;
}

// ---------------------------------------------------------------------------
// Donalds payload (bought-tier floor, cycle-only scoring)
// ---------------------------------------------------------------------------

function buildDonalds(): CandidatePayload {
  const votes = loadDonaldsVotes();
  const top5 = loadFldoeTopDonors('donalds-fldoe-2026.json');

  const bio =
    "Republican U.S. Rep for FL-19 (2021-present), running for Governor of Florida in the August 18, 2026 GOP primary as the Trump-endorsed frontrunner (~46% Emerson, Feb 2025 Trump endorsement). FL DOE state gubernatorial committee has raised $238,688 (1,944 contributions, 770 unique donors) as of April 2026 — simultaneously carries $2.75M+ through active federal House principal committee (C00733329). House Freedom Caucus member with a documented 100% pro-Israel voting record across 94 Israel-relevant roll calls 2021-2026: AYE on every standalone Israel funding bill (H.R. 8034 $14B 2024, Iron Dome 2021, H.R. 6126 2023), AYE on H.R. 8369 blocking Biden's Israel arms pause, cosponsored H.Res.771, NAY on Iran War Powers withdrawal — classic Freedom Caucus 'Israel YES, Ukraine NO' split on H.R. 8034/8035 2024. " +
    "Documented cumulative pro-Israel-lobby capture $140,143 across 2020-2026 ($134,128 federal House + $6,015 FL gov state cmte): AIPAC PAC $59,864 across 60 disbursements 52 of which were bundler-earmarked conduits (2022+2024 cycles), NORPAC $29,000 across 4 cycles 2020-2026, J Street PAC $22,500 2020-2024, Republican Jewish Coalition PAC $8,764, American Principles $5,500, US Israel PAC $3,500. Track AIPAC labels him 'Israel First' with a $84K+ lifetime tally. AIEF-sponsored Israel trip May 2019; RJC summit speaker. 2026-cycle live signal per Snitched cycle-only policy is $13,015 ($7,000 federal PAC [$5K RJC + $2K NORPAC] + $6,015 from 3 high-confidence FL-DOE individual bundlers with $29,450 combined career pro-Israel-PAC giving — Kenneth Abramowitz NGN Capital $15,200 career NorPAC/RJC/American Principles; Daniel Adler attorney $14,000 career AIPAC PAC + Pro-Israel America). juice_box_tier='bought' per curator based on weight of evidence — cycle-only driver is small but structural capture across 5 cycles + 47 earmarked bundlers + AIEF trip + RJC speaker justifies the bought-tier floor (70). " +
    "Non-lobby controversies: wife Erika Donalds' Optima charter-school nonprofits received $15M+ in Florida taxpayer charter-school contracts (undisclosed stake first reported by Florida Bulldog June 2025, active January 2026 lawsuit). Historical 1997 marijuana-distribution charge and 2000 bank-fraud felony — both expunged from public record but historically documented (Florida Phoenix + Wikipedia).";

  return {
    bioguide_id: 'fl-gov-2026-byron-donalds',
    name: 'Byron Donalds',
    office: 'Governor of Florida',
    office_level: 'state',
    party: 'Republican',
    district: null,
    jurisdiction: 'Florida',
    jurisdiction_type: 'state',
    is_candidate: true,
    running_for: 'Governor of Florida (2026)',
    is_active: true,
    data_source: 'audit_2026-04-24_fl_gov_2026_cycle_only',
    total_funds: 238688,
    contribution_breakdown: {
      individuals: 225673,
      otherPACs: 13015,
      corporate: 0,
      aipac: 13015, // cycle-only pro-Israel PAC + bundler subtotal for display
    },
    // israel_lobby_total = cumulative for DISPLAY (matches bio + red_flags
    // headline numbers). Score driver is cycle-only via aipac_funding + tier.
    israel_lobby_total: 140143,
    israel_lobby_breakdown: {
      ie: 0,
      pacs: 13015, // 2026 cycle: $7K federal + $6,015 state bundlers
      total: 140143,
      cycle_2026_subtotal: 13015,
      historical_pac_network_subtotal: 127128,
      source:
        'fec_2026_house + fl_doe_2026_gov (live) + aipac-network-historical-2020-2024 (cumulative display)',
      bundlers: 0,
      cycles_count: 1,
      pac_details: [
        {
          committee_id: 'C00797670',
          name: 'AIPAC PAC',
          amount_2026: 0,
          amount_lifetime: 59864,
          disbursement_count: 60,
          earmark_donor_count: 52,
          cycles: ['2022', '2024'],
          type: 'direct + earmarked',
          note: 'no 2026 direct disbursement yet; 52 of 60 historical disbursements were bundler-earmarked individual conduits',
        },
        {
          committee_id: 'C00030718',
          name: 'NORPAC',
          amount_2026: 2000,
          amount_lifetime: 29000,
          disbursement_count: 9,
          cycles: ['2020', '2022', '2024', '2026'],
          type: 'direct',
        },
        {
          committee_id: 'C00104299',
          name: 'Republican Jewish Coalition PAC (RJC-PAC)',
          amount_2026: 5000,
          amount_lifetime: 8764,
          disbursement_count: 90,
          cycles: ['2022', '2024', '2026'],
          type: 'direct',
        },
        {
          committee_id: 'n/a',
          name: 'J Street PAC',
          amount_2026: 0,
          amount_lifetime: 22500,
          disbursement_count: 9,
          cycles: ['2020', '2022', '2024'],
          type: 'direct',
        },
        {
          committee_id: 'C00492579',
          name: 'American Principles',
          amount_2026: 0,
          amount_lifetime: 5500,
          disbursement_count: 4,
          cycles: ['2020', '2022', '2024'],
          type: 'direct',
        },
        {
          committee_id: 'C00127811',
          name: 'U.S. Israel PAC (USI PAC)',
          amount_2026: 0,
          amount_lifetime: 3500,
          disbursement_count: 1,
          cycles: ['2020'],
          type: 'direct',
        },
      ],
      individual_registry: {
        matches: 3,
        source: 'fl_doe_2026_high-conf-only',
        high_confidence: 3,
        to_candidate: 6015,
        these_donors_to_pro_israel_career: 29450,
        top_donors: [
          {
            name: 'ABRAMOWITZ, KENNETH',
            state: 'FL',
            confidence: 'high',
            to_candidate: 4000,
            career_to_pro_israel_pacs: 15200,
            employer: 'NGN CAPITAL',
            occupation: 'RETIRED',
            pacs: ['American Principles', 'NorPAC', 'RJC PAC'],
          },
          {
            name: 'ADLER, DANIEL',
            state: 'FL',
            confidence: 'high',
            to_candidate: 2000,
            career_to_pro_israel_pacs: 14000,
            employer: 'BUYMEBEAUTY',
            occupation: 'ATTORNEY',
            pacs: ['AIPAC PAC', 'Pro-Israel America PAC'],
          },
          {
            name: 'ALLEN, JOHN',
            state: 'CA',
            confidence: 'high',
            to_candidate: 15,
            career_to_pro_israel_pacs: 250,
            occupation: 'RETIRED',
            pacs: ['JStreetPAC'],
          },
        ],
      },
      note:
        '2026 cycle live: $7,000 federal PAC ($5K RJC + $2K NORPAC) + $6,015 from 3 high-confidence FL-DOE individual bundlers. Historical federal 2020-2024: $127,128 across 6 pro-Israel PACs (AIPAC $59,864 / NORPAC $29,000 / J Street $22,500 / RJC $8,764 / American Principles $5,500 / USI PAC $3,500). Track AIPAC lifetime estimate $84K+ (overlap with historical). juice_box_tier=bought carries the score per cycle-only policy.',
      cumulative_total_note:
        'Cumulative documented pro-Israel-lobby capture: $140,143 across 2020-2026 (federal House + FL gov state cmte). Cycle-only score driver: 2026 live = $13,015. juice_box_tier="bought" floor (70) carries the score per v6.3 policy.',
    },
    juice_box_tier: 'bought',
    top5_donors: top5,
    voting_records: votes,
    lobbying_records: [],
    court_records: [],
    // For scoring we pass aipacFunding = 13015 (cycle-only bundler-inclusive
    // subtotal) and israelLobbyTotal = 140143 (cumulative for display).
    // computeCorruptionScore takes MAX; cumulative drives the "Israel money"
    // factor but the bought-tier floor (70) is the real driver.
    aipac_funding: 13015,
    source_ids: {
      fec_candidate_id: 'H2FL14186',
      fec_principal_committee_id: 'C00733329',
      fec_house_old_committee_id: 'C00509877',
      fl_doe_committee_filing: 'Donalds, Byron (REP)(GOV)',
      red_flags: [
        {
          severity: 'high',
          label:
            'Trump-endorsed FL Governor frontrunner (Feb 2025); 100% pro-Israel House voting record across 94 Israel-relevant votes 2021-2026 — AYE on every standalone Israel funding bill (H.R. 8034 $14B 2024, Iron Dome 2021, H.R. 6126 2023); cosponsored H.Res.771; AYE on H.R. 8369 (blocks Biden Israel arms pause)',
          source:
            'GovTrack data-ingestion/donalds-votes-historical.json',
          date: '2021-2026',
        },
        {
          severity: 'high',
          label:
            '$134,128 pro-Israel-network PAC capture across 2020-2026 federal House cycles: AIPAC PAC $59,864 with 52 earmarked individual bundlers via conduit + NORPAC $29,000 across 4 cycles + J Street PAC $22,500 + RJC PAC $8,764 + American Principles $5,500',
          source:
            'FEC Schedule B by-disburser audit data/donalds-pac-disbursement-audit.json',
          date: '2020-2026',
        },
        {
          severity: 'high',
          label:
            "AIEF (American Israel Education Foundation) sponsored Israel trip May 2019; RJC summit speaker; Track AIPAC labels Donalds 'Israel First' — $84K+ lifetime tally per https://trackaipac.com/congress",
          source: 'TrackAIPAC + AIEF disclosure',
          date: '2019-2026',
        },
        {
          severity: 'high',
          label:
            "Wife Erika Donalds — $15M+ in Florida taxpayer charter school contracts flowing to her Optima nonprofit/for-profits; undisclosed stake first reported AFTER Florida Bulldog exposé; active January 2026 lawsuit",
          source:
            'Florida Bulldog https://www.floridabulldog.org/2025/06/firms-belonging-to-rep-donalds-wife-grabbed-millions-in-charter-school-contracts/',
          date: '2025-06',
        },
        {
          severity: 'med',
          label:
            'Voted Aye on H.R. 8034 Israel-only ($14B 2024); voted Nay on H.R. 8035 Ukraine — classic Freedom Caucus split (Israel YES, Ukraine NO)',
          source: 'GovTrack 2024-04-20',
          date: '2024-04',
        },
        {
          severity: 'med',
          label:
            '1997 marijuana-distribution charge + 2000 felony bank-fraud (both expunged from public record but historically documented)',
          source: 'Florida Phoenix + Wikipedia',
          date: '1997-2000',
        },
      ],
      positions: {
        israel_aid: 'MAXIMALIST_UNCONDITIONAL_AID',
        aipac_fara: 'no public position (aligned voter)',
        foreign_aid_general: 'Israel YES, Ukraine NO (Freedom Caucus split)',
        house_freedom_caucus: 'MEMBER',
        trump_endorsement_2026: 'ENDORSED Feb 2025',
        aief_israel_trip: 'May 2019',
        cufi_rjc: 'RJC summit speaker; CUFI alignment unverified',
        scoring_note:
          "Trump-endorsed frontrunner with documented multi-cycle AIPAC-network capture ($134K federal across 5 cycles, 52 AIPAC-earmarked bundlers, AIEF trip, RJC speaker, 100% pro-Israel votes). juice_box_tier='bought' per curator based on weight of evidence.",
      },
      historical_breakdown: {
        note: 'Historical 2020-2024 federal House cycles $127,128 (AIPAC $59,864 / NORPAC $27,000 / J Street $22,500 / RJC $3,764 / American Principles $5,500 / USI $3,500) are cumulative-display only. Cycle-only live score driver is $13,015. Track AIPAC lifetime estimate $84K+ (overlap).',
        federal_cycles_loaded: ['2020', '2022', '2024'],
        cycle_totals: {
          '2020': 21000,
          '2022': 49000,
          '2024': 57128,
          '2026_federal': 7000,
        },
      },
    },
    bio,
  };
}

// ---------------------------------------------------------------------------
// Fishback payload (anti-AIPAC clean — 0 red flags, 0 lobby money)
// ---------------------------------------------------------------------------

function buildFishback(): CandidatePayload {
  const top5 = loadFldoeTopDonors('fishback-fldoe-2026.json');

  const bio =
    "Republican candidate in the August 18, 2026 Florida gubernatorial GOP primary against Trump-endorsed frontrunner Rep. Byron Donalds (~46%) and Lt. Gov. Jay Collins. Polls at ~4% (Emerson) / ~14% (Polymarket odds). 30-year-old hedge fund founder of Azoria Partners (~$1B AUM); Bridgewater Associates alum; founded the 'Incubate Debate' non-profit. Self-funding ~$5M+ into the race. The strongest anti-AIPAC voice in the Snitched.ai audit cohort: publicly labels AIPAC 'a foreign lobbying group' (effective FARA framing), refuses all AIPAC-network donations, refuses paid Israel trips, has called Netanyahu an 'immoral war criminal' on the campaign trail, pledges Florida state divestment from Israel Bonds, and pledges to revoke pro-Israel-favoring censorship laws. RJC labels him 'radical fringe.' Donor base is small-dollar national grassroots — 1,479 individual donors averaging ~$78 each, zero pro-Israel-registry matches across the 33,719-key 49-year individual donor index, zero AIPAC-network PAC contributions. Hard immigration restrictionist; not Trump-endorsed. " +
    "Personal-financial controversies (documented but per Snitched policy biographical, not lobby-capture): Greenlight Capital filed a 2024 lawsuit alleging title misrepresentation, false-donation fraud, undisclosed trading account, and confidential-info leak; January 2026 US Marshals seizure of stock and luxury items to satisfy a $229K judgment; $337K loan default; Azoria ETFs shut down by their own trustees; 2022 Broward County Schools severed ties with Incubate Debate over grooming allegations; documented use of fake social-media accounts to shape press coverage. These are ethics concerns of a different category from foreign-influence-lobby capture; under Snitched's anti-AIPAC clean policy they are documented here for transparency but do not affect the corruption score.";

  return {
    bioguide_id: 'fl-gov-2026-james-fishback',
    name: 'James Fishback',
    office: 'Governor of Florida',
    office_level: 'state',
    party: 'Republican',
    district: null,
    jurisdiction: 'Florida',
    jurisdiction_type: 'state',
    is_candidate: true,
    running_for: 'Governor of Florida (2026)',
    is_active: true,
    data_source: 'audit_2026-04-24_fl_gov_2026_anti_aipac_clean',
    total_funds: 154838,
    contribution_breakdown: {
      individuals: 151828,
      otherPACs: 0,
      corporate: 3000, // INK (in-kind) bucket
      aipac: 0,
    },
    israel_lobby_total: 0,
    israel_lobby_breakdown: {
      ie: 0,
      pacs: 0,
      total: 0,
      source: 'fl_doe_2026_only',
      bundlers: 0,
      cycles_count: 0,
      pac_details: [],
      individual_registry: {
        matches: 0,
        source: 'fl_doe_2026_only',
        itemized_individual_rows: 1479,
        high_confidence: 0,
      },
      note:
        "Zero pro-Israel PAC contributions and zero high-confidence individual bundler matches. Refused all AIPAC-network donations and AIEF Israel trips. Publicly calls AIPAC 'a foreign lobbying group' (FARA framing) — strongest anti-AIPAC voice in Snitched cohort.",
    },
    juice_box_tier: 'none',
    top5_donors: top5,
    voting_records: [],
    lobbying_records: [],
    court_records: [],
    aipac_funding: 0,
    source_ids: {
      fl_doe_committee_filing: 'Fishback, James (REP)(GOV)',
      red_flags: [], // ZERO per anti-AIPAC clean policy directive
      positions: {
        israel_aid:
          'OPPOSE — pledges FL divestment from Israel Bonds; revoke pro-Israel censorship laws',
        aipac_fara:
          "EFFECTIVELY SUPPORTS FARA — publicly labels AIPAC 'a foreign lobbying group'",
        netanyahu: "called 'immoral war criminal' on the campaign trail",
        israel_trips: 'REFUSES paid Israel trips',
        aipac_donations: 'REFUSES AIPAC-network donations',
        foreign_aid_general: 'anti-establishment / America First',
        immigration: "hard restrictionist ('America Is Full')",
        trump_endorsement_2026: 'NONE',
        rjc_label: "RJC called him 'radical fringe'",
        scoring_note:
          "Strongest documented anti-AIPAC voice in Snitched cohort. Per user policy 2026-04-24 ('fishback is clean'), non-lobby personal/financial-ethics issues are biographical, NOT scored as red_flags. Same treatment as Tyler Dykes.",
      },
    },
    bio,
  };
}

// ---------------------------------------------------------------------------
// Jay Collins payload (compromised-tier, 2 med red flags)
// ---------------------------------------------------------------------------

function buildCollins(): CandidatePayload {
  const top5 = loadFldoeTopDonors('jay-collins-fldoe-2026.json');

  const bio =
    "Republican candidate in the August 18, 2026 Florida gubernatorial GOP primary. DeSantis-appointed Lieutenant Governor (August 2025); former Florida State Senator (SD-14, elected 2022). Running against Trump-endorsed frontrunner Rep. Byron Donalds (~46%) and hedge-fund outsider James Fishback. Decorated U.S. Army Special Forces Green Beret — Bronze Star, Purple Heart, Legion of Merit, Soldier's Medal; noted for self-surgery during a 2007 Afghanistan firefight. FL DOE state gubernatorial committee has raised $375,064 (333 contributions, 246 unique donors) — 60%+ of which ($244,974) is in-kind transfer from the Republican Party of Florida, heavily signaling establishment FL-GOP backing as DeSantis's institutional pick against the Trump-endorsed Donalds. " +
    "Pro-Israel posture is rhetorical rather than PAC-captured: traveled to Israel post-October-7 2023 to help evacuate Americans; publicly praised Trump's Israel-Hamas peace deal; no documented AIEF trip, RJC summit speaker, or FARA-framing/anti-AIPAC posture. Snitched 2026-cycle cross-reference against the 33,719-key individual pro-Israel-donor registry surfaces 3 high-confidence bundlers totaling $7,800 to Collins with $132,000 combined career pro-Israel-PAC giving — Joseph Lubeck (American Landmark real estate, $57K career AIPAC PAC + UDP), David Robbins (Epstein & Robbins attorney, $59K career I-PAC JAX + AIPAC + UDP), Russell Galbut (Alexander Hotel real estate, $16K career AIPAC PAC + American Principles + SunPAC + NAC). No direct federal or state pro-Israel PAC contributions. juice_box_tier='compromised' per curator based on moderate bundler signal + establishment-hawk voting/rhetorical record. Cleanest personal record of the three 2026 FL Gov GOP candidates.";

  return {
    bioguide_id: 'fl-gov-2026-jay-collins',
    name: 'Jay Collins',
    office: 'Governor of Florida',
    office_level: 'state',
    party: 'Republican',
    district: null,
    jurisdiction: 'Florida',
    jurisdiction_type: 'state',
    is_candidate: true,
    running_for: 'Governor of Florida (2026)',
    is_active: true,
    data_source: 'audit_2026-04-24_fl_gov_2026_cycle_only',
    total_funds: 375064,
    contribution_breakdown: {
      individuals: 122290,
      otherPACs: 0,
      corporate: 244974, // RPOF in-kind transfer bucket
      aipac: 7800, // 3 high-confidence individual bundlers
    },
    israel_lobby_total: 7800,
    israel_lobby_breakdown: {
      ie: 0,
      pacs: 0,
      total: 7800,
      source: 'fl_doe_2026_only',
      bundlers: 7800,
      cycles_count: 1,
      pac_details: [],
      individual_registry: {
        matches: 3,
        source: 'fl_doe_2026_high-conf-only',
        high_confidence: 3,
        to_candidate: 7800,
        these_donors_to_pro_israel_career: 132000,
        top_donors: [
          {
            name: 'LUBECK, JOSEPH',
            state: 'FL',
            confidence: 'high',
            to_candidate: 3000,
            career_to_pro_israel_pacs: 57000,
            employer: 'AMERICAN LANDMARK',
            occupation: 'REAL ESTATE',
            pacs: ['AIPAC PAC', 'United Democracy Project (UDP)'],
          },
          {
            name: 'ROBBINS, DAVID',
            state: 'FL',
            confidence: 'high',
            to_candidate: 1800,
            career_to_pro_israel_pacs: 59000,
            employer: 'EPSTEIN & ROBBINS',
            occupation: 'ATTORNEY',
            pacs: [
              'I-PAC JAX',
              'AIPAC PAC',
              'United Democracy Project (UDP)',
            ],
          },
          {
            name: 'GALBUT, RUSSELL',
            state: 'FL',
            confidence: 'high',
            to_candidate: 3000,
            career_to_pro_israel_pacs: 16000,
            employer: 'ALEXANDER HOTEL',
            occupation: 'REAL ESTATE',
            pacs: [
              'AIPAC PAC',
              'American Principles',
              'SunPAC',
              'National Action Committee',
            ],
          },
        ],
      },
      note:
        '2026 cycle FL DOE state gov cmte only. No FEC federal record (state-level career). 3 high-confidence pro-Israel-network individual bundlers totaling $7,800 to Collins; combined career $132K to AIPAC/RJC/Pro-Israel America.',
    },
    juice_box_tier: 'compromised',
    top5_donors: top5,
    voting_records: [],
    lobbying_records: [],
    court_records: [],
    aipac_funding: 7800,
    source_ids: {
      fl_doe_committee_filing: 'Collins, Jay (REP)(GOV)',
      red_flags: [
        {
          severity: 'med',
          label:
            '3 high-confidence pro-Israel-network individual bundlers in his 246-donor base ($7,800 to Collins / $132,000 combined career to AIPAC/RJC/Pro-Israel America): Joseph Lubeck $57K career, David Robbins $59K career, Russell Galbut $16K career',
          source:
            'FL DOE 2026 cross-ref data/jay-collins-fl-gov-cross-ref-2026.json',
          date: '2026',
        },
        {
          severity: 'med',
          label:
            "Solid pro-Israel rhetorical record: traveled to Israel post-October 7 2023 to evacuate Americans; publicly praised Trump's Israel-Hamas peace deal; no documented FARA-framing or anti-AIPAC posture",
          source: 'Florida Phoenix + candidate website',
          date: '2023-2025',
        },
      ],
      positions: {
        israel_aid: 'PRO_AID_RHETORICAL',
        aipac_fara: 'no public position',
        aief_trip: 'none documented',
        rjc_aipac_pac: 'no documented PAC donations',
        foreign_aid_general: 'DeSantis-loyal hawk profile',
        desantis_appointment:
          'DeSantis-appointed Lieutenant Governor August 2025',
        trump_endorsement_2026:
          "NONE — running against Trump's pick (Donalds) as DeSantis's appointee",
        military_record:
          "Decorated U.S. Army Special Forces Green Beret — Bronze Star, Purple Heart, Legion of Merit, Soldier's Medal; self-surgery during 2007 Afghanistan firefight",
        scoring_note:
          'juice_box_tier=compromised based on 3 HC AIPAC-network bundlers tied to $132K career pro-Israel-PAC giving. Cleanest personal record of the 3 FL gov candidates.',
      },
    },
    bio,
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
  console.log(
    `  party/jurisdiction: ${p.party} / ${p.jurisdiction}`,
  );
  console.log(
    `  is_candidate:      ${p.is_candidate}   is_active: ${p.is_active}`,
  );
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
  console.log(
    `  positions keys:    ${Object.keys(p.source_ids.positions).length}`,
  );
  console.log(`  data_source:       ${p.data_source}`);
  console.log(
    `  --> computed corruption_score: ${score} (grade ${grade}, confidence ${confidence})`,
  );
}

async function verifyRow(
  supabase: SupabaseClient,
  bioguide_id: string,
): Promise<void> {
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
  console.log(`\n=== FL GOV 2026 SEED (${mode}) ===`);
  console.log('Policies applied:');
  console.log(
    '  - feedback_snitched_cycle_only_scoring (Donalds display=cumulative, driver=cycle+tier floor)',
  );
  console.log(
    '  - feedback_snitched_anti_aipac_is_clean (Fishback personal-ethics not scored)',
  );
  console.log(`DATA_DIR check: ${DATA_DIR}`);

  const DONALDS = buildDonalds();
  const FISHBACK = buildFishback();
  const COLLINS = buildCollins();
  const payloads: CandidatePayload[] = [DONALDS, FISHBACK, COLLINS];

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
    console.log(
      '\nDRY-RUN complete. No DB writes. Re-run with --write to commit.',
    );
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
  planned: Array<{
    p: CandidatePayload;
    score: number;
    grade: string;
    confidence: string;
  }>,
  _written: number,
): void {
  console.log('\n=== SUMMARY TABLE ===');
  const header = [
    'name',
    'bioguide_id',
    'score',
    'grade',
    'tier',
    'red_flags',
    'data_source',
  ];
  console.log(header.join(' | '));
  console.log(
    header.map(h => '-'.repeat(Math.max(h.length, 3))).join('-|-'),
  );
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

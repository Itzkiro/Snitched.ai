#!/usr/bin/env npx tsx
/**
 * Seed the four FL-07 (US House) 2026 candidates audited on 2026-04-25:
 *   - Cory Mills        (fl-07-2026-cory-mills)        — R, INCUMBENT, scandal stack
 *   - Marialana Kinter  (fl-07-2026-marialana-kinter)  — D, ANTI-AIPAC CLEAN
 *   - Michael Johnson   (fl-07-2026-michael-johnson)   — R, primary challenger
 *   - Sarah Ulrich      (fl-07-2026-sarah-ulrich)      — R, primary challenger
 *
 * Applies two active Snitched scoring policies:
 *   1. feedback_snitched_cycle_only_scoring
 *      Mills' israel_lobby_breakdown shows cumulative capture for DISPLAY
 *      but the cycle-only subtotal ($18,587 = $3K cycle PAC + $15,587 cycle
 *      individual bundlers) is the live signal. juice_box_tier='bought' carries
 *      the score via the v6.3 floor (70). Historical 2022-2024 cycles
 *      ($146,594) are tracked in source_ids.historical_breakdown for
 *      cumulative-display only.
 *
 *   2. feedback_snitched_anti_aipac_is_clean
 *      Kinter is anti-AIPAC clean: explicitly rejects AIPAC money (Palestine
 *      Chronicle feature, ActBlue page "stands against genocide and rejects
 *      AIPAC"). Zero PAC, zero bundlers — same treatment as Tyler Dykes,
 *      Monty Fritts, Aaron Fishback (Pres), Aaron Baker. red_flags=[],
 *      score=0, juice_box_tier='none'.
 *
 * CLI:
 *   npx tsx scripts/seed-fl-07-2026.ts              # dry-run (default)
 *   npx tsx scripts/seed-fl-07-2026.ts --dry-run    # dry-run explicit
 *   npx tsx scripts/seed-fl-07-2026.ts --write      # commit to Supabase
 *
 * Forked from scripts/seed-fl-gov-2026.ts.
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
// Vote normalization (Mills — historical)
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

function loadMillsVotes(): NormalizedVote[] {
  const abs = path.join(INGESTION_DIR, 'mills-votes-historical.json');
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
// Aggregate-individual-donors helpers (FEC Schedule A)
// ---------------------------------------------------------------------------

interface AggDonor {
  last?: string;
  first?: string;
  state?: string;
  city?: string;
  employer?: string;
  occupation?: string;
  total_to_candidate?: number;
}

interface AggDonorsJson {
  donors?: AggDonor[];
}

function loadTopDonorsFromAggregate(filename: string, limit = 5): TopDonor[] {
  const abs = path.join(DATA_DIR, filename);
  if (!fs.existsSync(abs)) return [];
  const raw = fs.readFileSync(abs, 'utf8').trim();
  if (!raw) return [];
  const d = JSON.parse(raw) as AggDonorsJson;
  const donors = d.donors || [];
  return donors.slice(0, limit).map(t => {
    const last = (t.last || '').trim();
    const first = (t.first || '').trim();
    const display = `${last}, ${first}`.replace(/^,\s*|,\s*$/g, '').trim();
    const employer = (t.employer || '').trim();
    const occupation = (t.occupation || '').trim();
    const isLikelyIndividual =
      !/(LLC|INC\.?|PAC|PARTY|CORP|COMPANY|ASSOC|GROUP|FUND|COMMITTEE|BANK|TRUST|HOLDINGS|CAPITAL|REALTY)/i.test(
        display + ' ' + employer,
      );
    return {
      name: display || `${first} ${last}`.trim(),
      amount: Math.round(t.total_to_candidate || 0),
      type: isLikelyIndividual ? 'Individual' : 'Other',
      state: t.state || '',
      employer,
      occupation,
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
  state?: string;
  employer?: string;
  occupation?: string;
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
  bioguide_id?: string;
  govtrack_id?: number;
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
// Mills payload (bought-tier floor, cycle-only scoring driver, scandal stack)
// ---------------------------------------------------------------------------

function buildMills(): CandidatePayload {
  const votes = loadMillsVotes();
  const top5 = loadTopDonorsFromAggregate(
    'mills-federal-individual-donors-aggregated.json',
  );

  const bio =
    "Republican U.S. Representative for FL-07 (incumbent, 2023-present), seeking re-election in the 2026 cycle. Bioguide M001216 / GovTrack 456889 / FEC H2FL07156 (cmte C00774943). Trump endorsed Mills on Feb 11, 2026 despite an extraordinary multi-front scandal stack: (1) ACTIVE House Ethics + OCE investigation into PACEM Defense / ALS Defense self-dealing — ~$1M / 94 federal weapons contracts since Jan 2024 while Mills sits on Armed Services + Foreign Affairs (H.Res. 893 to censure + remove from committees); (2) DC police sought arrest warrant Feb 2025 for alleged assault of Iranian-American Sarah Raviani — USAO declined to sign, MPD Internal Affairs investigating; (3) Oct 2025 Florida protective order from Lindsey Langston (Miss US 2024) over alleged revenge-porn threats — Roger Stone publicly accused Mills of lying to Trump about the order; (4) publicly contested Bronze Star integrity dispute; (5) House Ethics admonished 2024 for failure to disclose Israel/UAE/UK travel paid by foreign sources; (6) DOJ FARA-related scrutiny over PACEM foreign-government weapons sales; (7) wedding officiated by Imam Al-Hanooti, an unindicted co-conspirator in the 1993 WTC bombing. " +
    "Documented cumulative pro-Israel-lobby capture: $165,181 (2022-2026). PAC-side $59,574 across 5 PACs corrected via Schedule-B-by-disburser audit (AIPAC PAC $28,261 with 35 earmarked-bundler conduits, NORPAC $23,000, RJC PAC $5,313, US Israel PAC $2,000, American Principles $1,000); 2026 cycle live PAC = $3,000 / 2024 = $39,566 / 2022 = $17,007. Individual-bundler side: 49-year cross-ref against 33,719-key registry surfaces 55 high-confidence pro-Israel-network bundlers giving $105,607 to Mills with $747,562 combined career pro-Israel-PAC giving — 2026 cycle live signal $15,587. Cross-candidate signal: 14 of those 55 ALSO bundle for Byron Donalds (FL-19 / FL Gov 2026); 1 also surfaces in Blackburn TN-gov universe. Voting record (91 votes audited): substantively pro-Israel — AYE on H.R. 8369 (forces Biden to deliver Israel arms), AYE on H.R. 6126 ($14.3B Israel), AYE on Abraham Accords expansion, 86% AYE on Iran sanctions, NAY on Iran War Powers withdrawal (pro-strike); 50% AYE on Israel-aid funding overall (NAY on H.R. 8034 / H.R. 7217 only as Freedom Caucus border-rider protest, not as anti-Israel votes). Cycle-only score driver: 2026 = $18,587 ($3K PAC + $15,587 individuals); cumulative for display = $165,181. juice_box_tier='bought' per curator based on multi-cycle PAC capture + 35 AIPAC-earmarked bundlers + 14 cross-Donalds bundlers + voting alignment + scandal stack.";

  return {
    bioguide_id: 'fl-07-2026-cory-mills',
    name: 'Cory Mills',
    office: 'U.S. Representative (FL-07)',
    office_level: 'federal',
    party: 'Republican',
    district: 'FL-07',
    jurisdiction: 'Florida',
    jurisdiction_type: 'federal',
    is_candidate: true,
    running_for: 'U.S. House FL-07 (2026)',
    is_active: true,
    data_source: 'audit_2026-04-24_fl_07_2026_cycle_only',
    total_funds: 1330979,
    contribution_breakdown: {
      individuals: 1312392, // approximate: total_itemized_receipts minus PAC line
      otherPACs: 18587, // 2026-cycle live total ($3K PAC + $15,587 bundlers)
      corporate: 0,
      aipac: 18587, // cycle-only Israel-lobby driver for display
    },
    // israel_lobby_total = cumulative for DISPLAY (matches bio + red_flags
    // headline numbers). Score driver is cycle-only via aipac_funding + tier.
    israel_lobby_total: 165181,
    israel_lobby_breakdown: {
      ie: 0,
      pacs: 18587, // 2026 cycle: $3K federal PAC + $15,587 individual bundlers
      total: 165181,
      cycle_2026_subtotal: 18587,
      historical_pac_network_subtotal: 146594, // $56,574 historical PAC + $90,020 historical bundlers
      source:
        'fec_2026_house (live) + aipac-network-historical-2022-2024 (cumulative display)',
      bundlers: 15587,
      cycles_count: 3,
      pac_details: [
        {
          committee_id: 'C00797670',
          name: 'AIPAC PAC',
          amount_2026: 0,
          amount_lifetime: 28261,
          earmark_donor_count: 35,
          cycles: ['2024'],
          type: 'direct + earmarked',
          note: '35 of disbursements were bundler-earmarked individual conduits via AIPAC PAC',
        },
        {
          committee_id: 'C00030718',
          name: 'NORPAC',
          amount_2026: 0,
          amount_lifetime: 23000,
          cycles: ['2022', '2024'],
          type: 'direct',
        },
        {
          committee_id: 'C00345132',
          name: 'Republican Jewish Coalition PAC (RJC-PAC)',
          amount_2026: 3000,
          amount_lifetime: 5313,
          cycles: ['2022', '2024', '2026'],
          type: 'direct + earmarked',
        },
        {
          committee_id: 'C00127811',
          name: 'U.S. Israel PAC (USI PAC)',
          amount_2026: 0,
          amount_lifetime: 2000,
          cycles: ['2022'],
          type: 'direct',
        },
        {
          committee_id: 'C00492579',
          name: 'American Principles',
          amount_2026: 0,
          amount_lifetime: 1000,
          cycles: ['2022'],
          type: 'direct',
        },
      ],
      individual_registry: {
        matches: 55,
        source: 'fec_49yr_high-conf-only',
        high_confidence: 55,
        to_candidate: 105607,
        these_donors_to_pro_israel_career: 747562,
        cycle_2026_signal: 15587,
        cycle_2024_signal: 81019,
        cycle_2022_signal: 9000,
        cross_identified_with_donalds_federal_49yr: 14,
        cross_identified_with_donalds_aipac_earmark: 1,
        cross_identified_with_blackburn_tn_gov: 1,
        top_donors: [
          {
            name: 'STAHL, LEWIS',
            state: 'FL',
            confidence: 'high',
            to_candidate: 11600,
            career_to_pro_israel_pacs: 109877,
            employer: 'NEXTGEN MANAGEMENT LLC',
            occupation: 'CEO',
            pacs: ['Republican Jewish Coalition PAC (RJC-PAC)', 'Pro-Israel America PAC'],
            also_on_donalds_federal_49yr: true,
          },
          {
            name: 'WEINBERGER, MEG',
            state: 'FL',
            confidence: 'high',
            to_candidate: 10435,
            career_to_pro_israel_pacs: 25000,
            employer: 'HOMEMAKER',
            occupation: 'HOMEMAKER',
            pacs: ['Republican Jewish Coalition PAC (RJC-PAC)'],
            also_on_donalds_federal_49yr: true,
          },
          {
            name: 'MILLER, JEFFREY',
            state: 'FL',
            confidence: 'high',
            to_candidate: 6600,
            career_to_pro_israel_pacs: 51000,
            employer: 'MILLER STRATEGIES LLC',
            occupation: 'CEO',
            pacs: ['Republican Jewish Coalition PAC (RJC-PAC)'],
          },
          {
            name: 'KEISER, BELINDA',
            state: 'FL',
            confidence: 'high',
            to_candidate: 6600,
            career_to_pro_israel_pacs: 2000,
            employer: 'KEISER UNIVERSITY',
            occupation: 'VICE CHANCELLOR',
            pacs: ['Republican Jewish Coalition PAC (RJC-PAC)'],
            also_on_donalds_federal_49yr: true,
          },
          {
            name: 'FARACCHIO, DEAN',
            state: 'FL',
            confidence: 'high',
            to_candidate: 6082,
            career_to_pro_israel_pacs: 40840,
            employer: 'RETIRED',
            occupation: 'RETIRED',
            pacs: ['Republican Jewish Coalition PAC (RJC-PAC)', 'AIPAC PAC'],
            also_on_donalds_federal_49yr: true,
          },
          {
            name: 'GOLDMAN, MARC',
            state: 'FL',
            confidence: 'high',
            to_candidate: 3300,
            career_to_pro_israel_pacs: 51600,
            employer: 'RETIRED',
            occupation: 'RETIRED',
            pacs: ['American Principles', 'Republican Jewish Coalition PAC (RJC-PAC)'],
            also_on_donalds_federal_49yr: true,
          },
          {
            name: 'ZIMMERMAN, SCOTT',
            state: 'FL',
            confidence: 'high',
            to_candidate: 3300,
            career_to_pro_israel_pacs: 84500,
            employer: 'SELF EMPLOYED',
            occupation: 'REAL ESTATE',
            pacs: ['AIPAC PAC', 'United Democracy Project (UDP)'],
          },
          {
            name: 'COHEN, DIANE',
            state: 'FL',
            confidence: 'high',
            to_candidate: 800,
            career_to_pro_israel_pacs: 73950,
            employer: 'RETIRED',
            occupation: 'INFORMATION REQUESTED',
            pacs: ['AIPAC PAC', 'Republican Jewish Coalition PAC (RJC-PAC)'],
            also_on_donalds_aipac_earmark: true,
          },
          {
            name: 'FEINGOLD, BARBARA',
            state: 'FL',
            confidence: 'high',
            to_candidate: 5000,
            career_to_pro_israel_pacs: 46700,
            employer: 'RETIRED',
            occupation: 'RETIRED',
            pacs: ['National Action Committee', 'RJC-PAC', 'RJC Victory Fund'],
            also_on_donalds_federal_49yr: true,
          },
          {
            name: 'KLEIN, MICHAEL',
            state: 'MD',
            confidence: 'high',
            to_candidate: 1238,
            career_to_pro_israel_pacs: 45500,
            employer: 'SELF',
            occupation: 'PHYSICIAN',
            pacs: ['Maryland Association for Concerned Citizens PAC'],
          },
        ],
      },
      note:
        '2026 cycle live: $3,000 PAC ($3K RJC) + $15,587 individual bundlers = $18,587 cycle-only signal. Historical 2022-2024 PAC: $56,574 (AIPAC PAC $28,261 / NORPAC $23K / RJC $2,313 / USI $2K / Am.Principles $1K). Historical 2022-2024 individual bundlers: $90,020. Total cumulative: $165,181. juice_box_tier=bought carries the score per cycle-only policy + scandal stack.',
      cumulative_total_note:
        'Cumulative documented pro-Israel-lobby capture: $165,181 across 2022-2026 federal House cycles. Cycle-only score driver: 2026 live = $18,587. juice_box_tier="bought" floor (70) carries the score per v6.3 policy.',
    },
    juice_box_tier: 'bought',
    top5_donors: top5,
    voting_records: votes,
    lobbying_records: [],
    court_records: [],
    aipac_funding: 18587, // cycle-only driver for scoring
    source_ids: {
      fec_candidate_id: 'H2FL07156',
      fec_principal_committee_id: 'C00774943',
      bioguide_id: 'M001216',
      govtrack_id: 456889,
      red_flags: [
        {
          severity: 'high',
          label:
            'ACTIVE House Ethics + OCE investigation into PACEM Defense / ALS Defense self-dealing — ~$1M / 94 federal weapons contracts since Jan 2024 while sitting on Armed Services + Foreign Affairs. H.Res. 893 introduced to censure and remove from committees',
          source:
            'House Ethics Committee + OCE filings; H.Res. 893; investigations/fl-07-2026-positions.md',
          date: '2025-2026',
        },
        {
          severity: 'high',
          label:
            'DC police sought arrest warrant Feb 2025 for alleged assault of Iranian-American Sarah Raviani; USAO declined to sign warrant; MPD Internal Affairs investigation pending. Oct 2025 Florida protective order from Lindsey Langston (Miss US 2024) over revenge-porn threats — Roger Stone publicly accuses Mills of lying to Trump about the restraining order',
          source: 'WUSA9 + Florida 7th Circuit; investigations/fl-07-2026-positions.md',
          date: '2025-02 / 2025-10',
        },
        {
          severity: 'high',
          label:
            'House Ethics admonished 2024 — failed to disclose Israel/UAE/UK travel paid by foreign sources; DOJ FARA-related scrutiny over PACEM Defense foreign-government weapons sales',
          source: 'House Ethics admonishment 2024; DOJ',
          date: '2024',
        },
        {
          severity: 'high',
          label:
            '$165,181 cumulative pro-Israel-lobby capture 2022-2026: PAC $59,574 (AIPAC PAC $28,261 with 35 earmarked bundlers, NORPAC $23K, RJC $5,313, USI $2K, Am.Principles $1K) + 55 individual bundlers giving $105,607 with $747,562 combined career pro-Israel-PAC giving',
          source:
            'data/mills-pac-disbursement-audit.json + data/mills-federal-49yr-crossref-2026-04-24.json',
          date: '2022-2026',
        },
        {
          severity: 'high',
          label:
            '14 of 55 individual bundlers ALSO bundle for Byron Donalds (FL-19 incumbent / FL Gov 2026 frontrunner) — STAHL, GOLDMAN, FEINGOLD, FARACCHIO, WEINBERGER, BERNSTEIN, SMIEDT, ALEMBIK, BOOK, POGIN, STOCH, KEISER, FARRELL, KIDAN — cross-candidate pro-Israel-network signal',
          source: 'data/mills-federal-49yr-crossref-2026-04-24.json totals',
          date: '2026',
        },
        {
          severity: 'high',
          label:
            "Substantively pro-Israel voting record (91 votes audited): AYE on H.R. 8369 (forces Biden to deliver Israel arms), AYE on H.R. 6126 ($14.3B Israel), AYE on Abraham Accords expansion, 86% AYE on Iran sanctions, NAY on Iran War Powers withdrawal. NAY on H.R. 8034/H.R. 7217 was Freedom Caucus border-rider protest only, not anti-Israel position",
          source: 'GovTrack data-ingestion/mills-votes-historical.json',
          date: '2023-2026',
        },
        {
          severity: 'med',
          label:
            'Trump endorsed Feb 11, 2026 despite scandal stack; Roger Stone publicly accuses Mills of lying to Trump about the Langston restraining order',
          source: 'Trump Truth Social Feb 11 2026; Roger Stone public statements',
          date: '2026-02',
        },
        {
          severity: 'med',
          label:
            'Bronze Star integrity dispute publicly reported; wedding officiated by Imam Al-Hanooti (1993 WTC bombing unindicted co-conspirator)',
          source: 'investigations/fl-07-2026-positions.md',
          date: '1990s-2010s',
        },
      ],
      positions: {
        israel_aid:
          'PRO_AID_SUBSTANTIVELY (50% AYE on Israel-only standalone bills; AYE on H.R. 8369 + H.R. 6126; NAY on H.R. 8034 / H.R. 7217 was Freedom Caucus border-rider protest)',
        iran_policy:
          '86% AYE on Iran sanctions; NAY on Iran War Powers withdrawal (pro-strike)',
        abraham_accords: 'AYE on expansion',
        aipac_fara: 'no public position (aligned voter)',
        house_freedom_caucus: 'MEMBER',
        trump_endorsement_2026: 'ENDORSED Feb 11 2026',
        defense_industry: 'PACEM Defense / ALS Defense — ~$1M federal contracts',
        ethics_investigation: 'ACTIVE House Ethics + OCE; H.Res. 893',
        scoring_note:
          "juice_box_tier='bought' per curator based on weight of evidence — multi-cycle PAC capture + 35 AIPAC-earmarked bundlers + 14 cross-Donalds bundlers + voting alignment + 8-item scandal stack.",
      },
      historical_breakdown: {
        note: 'Historical 2022-2024 federal House cycles: PAC $56,574 + bundlers $90,020 = $146,594 cumulative. Cycle-only live driver: 2026 = $18,587 ($3K PAC + $15,587 bundlers).',
        federal_cycles_loaded: ['2022', '2024', '2026'],
        cycle_pac_totals: {
          '2022': 17007,
          '2024': 39566,
          '2026': 3000,
        },
        cycle_individual_bundler_totals: {
          '2022': 9000,
          '2024': 81019,
          '2026': 15587,
        },
      },
    },
    bio,
  };
}

// ---------------------------------------------------------------------------
// Kinter payload (anti-AIPAC clean — 0 red flags, 0 lobby money)
// ---------------------------------------------------------------------------

function buildKinter(): CandidatePayload {
  const top5 = loadTopDonorsFromAggregate(
    'kinter-federal-individual-donors-aggregated.json',
  );

  const bio =
    "Democratic candidate in the 2026 FL-07 (US House) primary, challenging Republican incumbent Cory Mills. FEC H6FL07165 / cmte C00903633. Former U.S. Navy nuclear reactor operator (2016-2024) — served on USS Maine and at the Naval Nuclear Power Training Command, with security-clearance experience and STEM credentials. Campaign platform centers on anti-genocide / Palestinian solidarity: ActBlue donor page is titled 'Marialana Kinter stands against genocide and rejects AIPAC' and the campaign has been profiled by Palestine Chronicle. " +
    "Explicitly REFUSES all AIPAC-network donations and Israel-lobby money — strongest documented anti-AIPAC voice in the FL-07 race. Snitched.ai 49-year cross-reference against the 33,719-key individual pro-Israel-donor registry returned ZERO matches across her 135-donor / $19,804 itemized donor universe; FEC Schedule-B-by-disburser audit returned ZERO pro-Israel PAC contributions across 92 PACs checked. Per Snitched.ai 'anti-AIPAC clean' policy (consistent with Tyler Dykes / Monty Fritts / James Fishback / Aaron Baker treatment), red_flags=[], score=0, juice_box_tier='none'.";

  return {
    bioguide_id: 'fl-07-2026-marialana-kinter',
    name: 'Marialana Kinter',
    office: 'U.S. Representative (FL-07)',
    office_level: 'federal',
    party: 'Democrat',
    district: 'FL-07',
    jurisdiction: 'Florida',
    jurisdiction_type: 'federal',
    is_candidate: true,
    running_for: 'U.S. House FL-07 (2026)',
    is_active: true,
    data_source: 'audit_2026-04-24_fl_07_2026_anti_aipac_clean',
    total_funds: 19804,
    contribution_breakdown: {
      individuals: 19804,
      otherPACs: 0,
      corporate: 0,
      aipac: 0,
    },
    israel_lobby_total: 0,
    israel_lobby_breakdown: {
      ie: 0,
      pacs: 0,
      total: 0,
      source: 'fec_2026_house_only',
      bundlers: 0,
      cycles_count: 0,
      pac_details: [],
      individual_registry: {
        matches: 0,
        source: 'fec_49yr_high-conf-only',
        itemized_individual_rows: 165,
        unique_donors: 135,
        high_confidence: 0,
      },
      note:
        "Zero pro-Israel PAC contributions and zero high-confidence individual bundler matches across the 33,719-key 49-year registry. Campaign explicitly REJECTS AIPAC money — ActBlue donor page titled 'stands against genocide and rejects AIPAC.' Strongest anti-AIPAC voice in the FL-07 race.",
    },
    juice_box_tier: 'none',
    top5_donors: top5,
    voting_records: [],
    lobbying_records: [],
    court_records: [],
    aipac_funding: 0,
    source_ids: {
      fec_candidate_id: 'H6FL07165',
      fec_principal_committee_id: 'C00903633',
      red_flags: [], // ZERO per anti-AIPAC clean policy
      positions: {
        israel_aid:
          "OPPOSE — campaign brand 'stands against genocide and rejects AIPAC' (Palestine Chronicle feature)",
        aipac_donations: 'REFUSES AIPAC-network donations',
        gaza_palestine: 'PRO_PALESTINE / anti-genocide platform',
        military_record:
          'U.S. Navy nuclear reactor operator 2016-2024 (USS Maine + Naval Nuclear Power Training Command)',
        trump_endorsement_2026: 'NONE — Democratic challenger',
        scoring_note:
          "Anti-AIPAC clean per user policy 2026-04-24. Same treatment as Tyler Dykes / Monty Fritts / James Fishback (Pres) / Aaron Baker. red_flags=[], score=0, juice_box_tier='none'.",
      },
    },
    bio,
  };
}

// ---------------------------------------------------------------------------
// Michael Johnson payload (R primary challenger — clean by absence)
// ---------------------------------------------------------------------------

function buildJohnson(): CandidatePayload {
  const top5 = loadTopDonorsFromAggregate(
    'johnson-fl07-federal-individual-donors-aggregated.json',
  );

  const bio =
    "Republican primary challenger to Rep. Cory Mills in the 2026 FL-07 race. FEC H4FL07152 / cmte C00876557. 36-year U.S. Department of Defense program manager (Vietnam-era veteran) describing himself as a 'Reagan Republican.' Previously ran the 2024 GOP primary against Mills, losing 80.9-19%. " +
    "Campaign finance footprint is minimal: $4,782 raised across 3 donors and 4 itemized rows (2024-2026). FEC Schedule-B-by-disburser audit across 92 pro-Israel PACs returned ZERO PAC contributions; 49-year pro-Israel-donor registry cross-reference returned ZERO bundlers. No public Israel/AIPAC position. No documented scandals or ethics flags. Clean by absence — juice_box_tier='none'.";

  return {
    bioguide_id: 'fl-07-2026-michael-johnson',
    name: 'Michael Johnson',
    office: 'U.S. Representative (FL-07)',
    office_level: 'federal',
    party: 'Republican',
    district: 'FL-07',
    jurisdiction: 'Florida',
    jurisdiction_type: 'federal',
    is_candidate: true,
    running_for: 'U.S. House FL-07 (2026)',
    is_active: true,
    data_source: 'audit_2026-04-24_fl_07_2026_cycle_only',
    total_funds: 4782,
    contribution_breakdown: {
      individuals: 4782,
      otherPACs: 0,
      corporate: 0,
      aipac: 0,
    },
    israel_lobby_total: 0,
    israel_lobby_breakdown: {
      ie: 0,
      pacs: 0,
      total: 0,
      source: 'fec_2024_2026_house_only',
      bundlers: 0,
      cycles_count: 0,
      pac_details: [],
      individual_registry: {
        matches: 0,
        source: 'fec_49yr_high-conf-only',
        unique_donors: 3,
        itemized_individual_rows: 4,
        high_confidence: 0,
      },
      note:
        'Zero pro-Israel PAC contributions and zero high-confidence individual bundler matches. No public Israel/AIPAC position. Clean by absence.',
    },
    juice_box_tier: 'none',
    top5_donors: top5,
    voting_records: [],
    lobbying_records: [],
    court_records: [],
    aipac_funding: 0,
    source_ids: {
      fec_candidate_id: 'H4FL07152',
      fec_principal_committee_id: 'C00876557',
      red_flags: [],
      positions: {
        israel_aid: 'no public position',
        aipac_fara: 'no public position',
        background:
          '36-year DoD program manager; Vietnam-era veteran; self-styled Reagan Republican',
        prior_run: '2024 FL-07 primary against Mills, lost 80.9-19%',
        trump_endorsement_2026: 'NONE',
        scoring_note: "Clean by absence — no PAC, no bundlers, no scandals. juice_box_tier='none'.",
      },
    },
    bio,
  };
}

// ---------------------------------------------------------------------------
// Sarah Ulrich payload (R primary challenger — clean by absence)
// ---------------------------------------------------------------------------

function buildUlrich(): CandidatePayload {
  const top5 = loadTopDonorsFromAggregate(
    'ulrich-fl07-federal-individual-donors-aggregated.json',
  );

  const bio =
    "Republican primary challenger to Rep. Cory Mills in the 2026 FL-07 race. FEC H6FL07223 / cmte C00927210. First-time candidate running in the 'anti-Mills-scandals' lane on a platform of term limits, government ethics, balanced budget, and pro-life policy. " +
    "Campaign finance footprint is minimal: $4,100 raised across 6 donors and 11 itemized rows (2026 cycle only). FEC Schedule-B-by-disburser audit across 92 pro-Israel PACs returned ZERO PAC contributions; 49-year pro-Israel-donor registry cross-reference returned ZERO bundlers. No public Israel/AIPAC position. No documented scandals or ethics flags. Clean by absence — juice_box_tier='none'.";

  return {
    bioguide_id: 'fl-07-2026-sarah-ulrich',
    name: 'Sarah Ulrich',
    office: 'U.S. Representative (FL-07)',
    office_level: 'federal',
    party: 'Republican',
    district: 'FL-07',
    jurisdiction: 'Florida',
    jurisdiction_type: 'federal',
    is_candidate: true,
    running_for: 'U.S. House FL-07 (2026)',
    is_active: true,
    data_source: 'audit_2026-04-24_fl_07_2026_cycle_only',
    total_funds: 4100,
    contribution_breakdown: {
      individuals: 4100,
      otherPACs: 0,
      corporate: 0,
      aipac: 0,
    },
    israel_lobby_total: 0,
    israel_lobby_breakdown: {
      ie: 0,
      pacs: 0,
      total: 0,
      source: 'fec_2026_house_only',
      bundlers: 0,
      cycles_count: 0,
      pac_details: [],
      individual_registry: {
        matches: 0,
        source: 'fec_49yr_high-conf-only',
        unique_donors: 6,
        itemized_individual_rows: 11,
        high_confidence: 0,
      },
      note:
        'Zero pro-Israel PAC contributions and zero high-confidence individual bundler matches. No public Israel/AIPAC position. Clean by absence.',
    },
    juice_box_tier: 'none',
    top5_donors: top5,
    voting_records: [],
    lobbying_records: [],
    court_records: [],
    aipac_funding: 0,
    source_ids: {
      fec_candidate_id: 'H6FL07223',
      fec_principal_committee_id: 'C00927210',
      red_flags: [],
      positions: {
        israel_aid: 'no public position',
        aipac_fara: 'no public position',
        platform: 'term limits, government ethics, balanced budget, pro-life',
        first_time_candidate: 'true',
        trump_endorsement_2026: 'NONE',
        scoring_note: "Clean by absence — no PAC, no bundlers, no scandals. juice_box_tier='none'.",
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
  console.log(`  party/jurisdiction: ${p.party} / ${p.jurisdiction}`);
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
  console.log(`\n=== FL-07 2026 SEED (${mode}) ===`);
  console.log('Policies applied:');
  console.log(
    '  - feedback_snitched_cycle_only_scoring (Mills display=cumulative, driver=cycle+tier floor)',
  );
  console.log(
    '  - feedback_snitched_anti_aipac_is_clean (Kinter — explicit AIPAC rejection, red_flags=[])',
  );
  console.log(`DATA_DIR check: ${DATA_DIR}`);

  const MILLS = buildMills();
  const KINTER = buildKinter();
  const JOHNSON = buildJohnson();
  const ULRICH = buildUlrich();
  const payloads: CandidatePayload[] = [MILLS, KINTER, JOHNSON, ULRICH];

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

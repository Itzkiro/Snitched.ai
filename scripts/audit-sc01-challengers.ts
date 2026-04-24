#!/usr/bin/env npx tsx
/**
 * Finalize SC-01 2026 Republican primary challenger audit (Dykes, Sanford,
 * Pelbath, Smith). For each candidate this script:
 *   - Updates bio, is_candidate, running_for, is_active=true
 *   - Merges curator-supplied source_ids.red_flags and source_ids.positions
 *     into the existing source_ids JSONB (preserving all other keys)
 *   - (Sanford only) Loads 112 Israel/Palestine/Iran-relevant historical
 *     votes from data-ingestion/sanford-votes-historical.json and writes
 *     them to voting_records
 *   - (Sanford only) Rebuilds contribution_breakdown from the 2022/2024/2026
 *     FEC Schedule A itemized dumps, classifying each row as conduit /
 *     individual / otherPAC and fixing the AIPAC/pro-Israel subtotal
 *   - Preserves israel_lobby_breakdown, corruption_score (until recompute),
 *     top5_donors — only the explicitly-listed fields are touched
 *   - Recomputes corruption_score via lib/corruption-score after mutation
 *     so curator red_flags feed into the +5/+2 score contribution path
 *
 * CLI:
 *   npx tsx scripts/audit-sc01-challengers.ts           # dry-run (default)
 *   npx tsx scripts/audit-sc01-challengers.ts --dry-run # dry-run explicit
 *   npx tsx scripts/audit-sc01-challengers.ts --write   # commit to Supabase
 *
 * Dry-run prints a per-candidate JSON diff plus a score delta table.
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
const DRY_RUN = !WRITE; // default is dry-run

const DATA_SOURCE = 'audit_2026-04-22_sc01_challengers';
const INGESTION_DIR = path.join(__dirname, '..', 'data-ingestion');

// ---------------------------------------------------------------------------
// Shared types for curator payloads
// ---------------------------------------------------------------------------

type RedFlagSeverity = 'high' | 'med' | 'low';

interface CuratorRedFlag {
  severity: RedFlagSeverity;
  label: string;
  source: string;
  date: string;
}

interface CuratorPayload {
  bioguide_id: string;
  name: string;
  bio: string;
  is_candidate: boolean;
  running_for: string;
  is_active: boolean;
  red_flags: CuratorRedFlag[];
  positions: Record<string, string>;
  // If present, rebuild voting_records from this JSON array file path.
  votes_source_file?: string;
  // If present, rebuild contribution_breakdown by summing these FEC JSON dumps.
  fec_itemized_files?: string[];
}

// ---------------------------------------------------------------------------
// Curator payloads (one per candidate)
// ---------------------------------------------------------------------------

const DYKES: CuratorPayload = {
  bioguide_id: 'sc-01-2026-tyler-dykes',
  name: 'Tyler Dykes',
  bio: "Republican challenger in SC-01's 2026 primary to replace outgoing Rep. Nancy Mace (running for governor). 27-year-old Bluffton resident and Marine Corps veteran. Convicted of two felony counts of assaulting officers at the Jan 6, 2021 U.S. Capitol riot (pleaded guilty April 2024, sentenced 57 months federal prison, pardoned by President Trump January 2025). Separately pleaded guilty to Virginia state felony for 2017 Charlottesville Unite-the-Right tiki-torch intimidation charges. Received other-than-honorable discharge from USMC. Campaigns on anti-immigration platform and explicitly calls for AIPAC to register under the Foreign Agents Registration Act (FARA).",
  is_candidate: true,
  running_for: 'U.S. House SC-01 (2026)',
  is_active: true,
  red_flags: [
    {
      severity: 'high',
      label: 'J6 Capitol riot felony — pleaded guilty to 2 counts of assaulting officers (April 2024), 57 months federal prison, pardoned by Trump Jan 2025',
      source: 'courthousenews.com',
      date: '2024-04',
    },
    {
      severity: 'high',
      label: '2017 Charlottesville Unite-the-Right tiki-torch intimidation state felony (Virginia)',
      source: 'newsweek.com',
      date: '2023',
    },
    {
      severity: 'med',
      label: 'Other-than-honorable discharge from USMC',
      source: 'marinecorpstimes.com',
      date: 'n/a',
    },
  ],
  positions: {
    israel_aid: 'OPPOSE_ALL_FOREIGN_AID',
    aipac_fara: 'SUPPORT',
    j6: 'PARDONED_CONVICT',
    campaign_site: 'votetylersc.com',
  },
};

const SANFORD: CuratorPayload = {
  bioguide_id: 'sc-01-2026-mark-sanford',
  name: 'Mark Sanford',
  bio: "Former SC Governor (2003-2011) and former U.S. Representative for SC-01 during TWO separate stints (1995-2001 libertarian-leaning fiscal conservative; 2013-2019 after gubernatorial scandal). Attempting 2026 political comeback for his old SC-01 seat. Notorious for 2009 'hiking the Appalachian Trail' Argentina extramarital affair scandal while governor — resulted in 37 SC Ethics Commission charges, $74,000 in civil fines, and a 102-11 bipartisan House censure for misuse of state aircraft. 2018 lost SC-01 primary to Katie Arrington after publicly criticizing President Trump; attempted short 2020 Republican presidential primary challenge against Trump. November 2025 Olivia Nuzzi/Ryan Lizza reporting resurfaced a second alleged extramarital relationship. Voting record as congressman is mixed on Israel: voted AYE on 2016 U.S.-Israel $38B MoU, AYE on H.Res.11 rebuking UNSCR 2334, AYE on most Iran sanctions bills; but was 1 of only 8 House members to vote NO on the 2014 $225M Iron Dome emergency supplemental, and voted NAY on 9 separate Foreign Operations Appropriations bills (1995-2001) that contained the annual ~$3B Israel aid package — a fiscally libertarian anti-foreign-aid pattern. Prior audits of his 2013-2019 incumbent cycles documented a strong pro-Israel bundler footprint: 15 high-confidence pro-Israel PAC donors (KASSEN $356K career, LANDES $160K career) contributed $96,926 in bundled individual donations across 1,055 itemized rows.",
  is_candidate: true,
  running_for: 'U.S. House SC-01 (2026)',
  is_active: true,
  red_flags: [
    {
      severity: 'high',
      label: '37 SC Ethics Commission charges + $74K civil fines + 102-11 House censure (2009 Appalachian Trail/Argentina affair, misuse of state aircraft)',
      source: 'postandcourier.com',
      date: '2009-2010',
    },
    {
      severity: 'med',
      label: 'November 2025 Olivia Nuzzi/Ryan Lizza reporting alleged second extramarital relationship',
      source: 'Vanity Fair / P&C',
      date: '2025-11',
    },
  ],
  positions: {
    israel_aid: 'MIXED_fiscally_skeptical',
    iron_dome_2014: 'NAY (1 of 8 House NOs)',
    israel_mou_2016: 'AYE',
    iran_sanctions: 'AYE majority',
    foreign_ops_approp: 'NAY pattern 1995-2001',
    two_state: 'SUPPORT',
    jcpoa: 'OPPOSED',
  },
  votes_source_file: 'sanford-votes-historical.json',
  // NOTE: Intentionally NOT rebuilding contribution_breakdown for Sanford.
  // The 2022/2024/2026 FEC pulls are post-incumbent cycles with $0 itemized
  // individuals; writing those would destroy the historical $96K bundler
  // signal captured in israel_lobby_breakdown.individual_registry from an
  // earlier audit of his 2013-2019 incumbent cycles (1,055 rows, 15 matches).
};

const PELBATH: CuratorPayload = {
  bioguide_id: 'sc-01-2026-alex-pelbath',
  name: 'Alex Pelbath',
  bio: "Republican challenger in SC-01's 2026 primary to replace outgoing Rep. Nancy Mace. Retired U.S. Air Force Lieutenant Colonel (former Pentagon defense-budget drafter), now a commercial airline pilot for Southwest Airlines. Mount Pleasant, SC resident. Campaigns on 'peace through strength' national-security-hawk framing. Raised $369K by Q1 2026, placing second in GOP forum straw polls at ~29.5% behind frontrunner Mark Smith. Small but documented pro-Israel-lobby bundler footprint: 2 of 197 itemized individual donors are registered pro-Israel PAC donors per cross-reference against a 49-year registry (totaling ~$5.5K career contributions to AIPAC/NorPAC/UDP/Pro-Israel America/DMFI/RJC).",
  is_candidate: true,
  running_for: 'U.S. House SC-01 (2026)',
  is_active: true,
  red_flags: [],
  positions: {
    israel_aid: 'PRESUMED_PRO_AID_HAWK',
    defense_industry_ties: 'Pentagon-budget + USAF career',
    campaign_site: 'pelbathforcongress.com',
  },
};

const SMITH: CuratorPayload = {
  bioguide_id: 'sc-01-2026-mark-smith',
  name: 'Mark Smith',
  bio: "Republican challenger in SC-01's 2026 primary to replace outgoing Rep. Nancy Mace. Businessman — president of McAlister-Smith Funeral Homes (5 Lowcountry locations) and current SC State Representative for House District 99 (Mount Pleasant). Former Mount Pleasant Town Councilman 2013-2017. Leading the GOP forum straw poll at 34.1%. Publicly defers to Speaker Johnson / Trump foreign policy line. March 2026 FITSNews reporting documented an active S.C. Code § 8-13-765 ethics violation: Smith sent campaign-fundraiser emails from his official MarkSmith@schouse.gov state legislative account — illegal commingling of government resources with campaign activity. Separately, 2017 campaign-finance filings showed a pattern of self-donations routed through LLCs.",
  is_candidate: true,
  running_for: 'U.S. House SC-01 (2026)',
  is_active: true,
  red_flags: [
    {
      severity: 'high',
      label: 'Active S.C. Code § 8-13-765 violation: March 2026 campaign fundraising emails sent from state legislative email account MarkSmith@schouse.gov (illegal commingling)',
      source: 'fitsnews.com',
      date: '2026-03',
    },
    {
      severity: 'med',
      label: '2017 campaign-finance filings showed pattern of self-donations routed through LLCs (structuring concern)',
      source: 'fitsnews.com',
      date: '2017',
    },
    {
      severity: 'high',
      label: '[roster-match] 7.8% of itemized individual donors (13/166) are documented pro-Israel PAC donors per registry — top donors gave $90,550 career to AIPAC/RJC/NorPAC/Pro-Israel America/Hudson Valley/UDP/JStreet',
      source: 'pro-israel-donors-registry-cross-ref',
      date: '2026-04-21',
    },
  ],
  positions: {
    israel_aid: 'PRO_AID_DEFAULT',
    trump_alignment: 'ALIGNED',
    sc_house_district: '99',
    industry: 'funeral_homes',
    campaign_site: 'votemarksmith.com',
  },
};

const PAYLOADS: CuratorPayload[] = [DYKES, SANFORD, PELBATH, SMITH];

// ---------------------------------------------------------------------------
// Israel-lobby PAC set (same canonical set used in lib/corruption-score +
// audit-fl28-challengers.ts — kept in sync manually for now).
// ---------------------------------------------------------------------------

const ISRAEL_LOBBY_COMMITTEE_IDS = new Set<string>([
  'C00104299', 'C00797472', 'C00797670',
  'C00368522', 'C00699470', 'C00740936', 'C00687657', 'C90019431',
  'C00556100', 'C00345132', 'C30001374', 'C90012063',
  'C00764126', 'C90022864',
  'C00441949', 'C00068692', 'C00247403', 'C00127811',
  'C00139659', 'C00488411',
  'C00141747', 'C00458935', 'C00265470',
  'C00748475', 'C00306670', 'C00268334', 'C90014747',
  'C00202481', 'C00791699', 'C00277228', 'C00503250', 'C00524652',
]);

const ISRAEL_NAME_RE = /AIPAC|AMERICAN ISRAEL|NORPAC|DEMOCRATIC MAJORITY FOR ISRAEL|DMFI|UNITED DEMOCRACY PROJECT|PRO-ISRAEL AMERICA|REPUBLICAN JEWISH COALITION|ZIONIST ORGANIZATION|JACPAC|JEWISH DEMOCRATIC COUNCIL|JEWISH REPUBLICAN|FRIENDS OF ISRAEL|FIPAC|ALLIES FOR ISRAEL|ISRAEL ALLIANCE|J STREET|JOINT ACTION COMMITTEE FOR POLITICAL|U\.?S\.? ISRAEL/i;

const CONDUIT_RE = /^(WINRED|ACTBLUE|ANEDOT)(\s|,|$)/i;
const CONDUIT_COMMITTEE_IDS = new Set<string>([
  'C00401224', // ActBlue
  'C00694323', // WinRed
  'C00755447', // Anedot
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FecRow {
  contributor_name?: string | null;
  contributor_id?: string | null;
  contributor_committee_id?: string | null;
  contribution_receipt_amount?: number | null;
  contribution_receipt_date?: string | null;
  entity_type?: string | null;
}

interface ContributionBreakdown {
  aipac: number;
  corporate: number;
  otherPACs: number;
  individuals: number;
  self_funding: number;
  pro_israel_pacs: number;
}

interface ClassifiedTotals {
  individuals: number;
  conduit: number;
  otherPACs: number;
  proIsraelPacs: number;
  rowsSeen: number;
  totalSum: number;
}

function loadJson<T>(file: string): T {
  const abs = path.join(INGESTION_DIR, file);
  if (!fs.existsSync(abs)) {
    throw new Error(`Required ingestion file missing: ${abs}`);
  }
  const raw = fs.readFileSync(abs, 'utf8').trim();
  if (!raw) return [] as unknown as T; // empty file -> empty array
  return JSON.parse(raw) as T;
}

function classifyFecRows(rows: FecRow[]): ClassifiedTotals {
  const totals: ClassifiedTotals = {
    individuals: 0,
    conduit: 0,
    otherPACs: 0,
    proIsraelPacs: 0,
    rowsSeen: 0,
    totalSum: 0,
  };

  for (const r of rows) {
    const amt = r.contribution_receipt_amount || 0;
    if (!amt) continue;
    totals.rowsSeen++;
    totals.totalSum += amt;

    const name = (r.contributor_name || '').trim();
    const cid = (r.contributor_committee_id || '').trim();
    const entity = (r.entity_type || '').toUpperCase();

    const isConduit =
      CONDUIT_RE.test(name) || (cid && CONDUIT_COMMITTEE_IDS.has(cid));

    if (isConduit) {
      totals.conduit += amt;
      continue;
    }

    if (entity === 'IND') {
      totals.individuals += amt;
      continue;
    }

    // Everything else (PAC, ORG, CCM, COM, PTY) rolls up to otherPACs.
    totals.otherPACs += amt;

    const isIsrael =
      (cid && ISRAEL_LOBBY_COMMITTEE_IDS.has(cid)) ||
      ISRAEL_NAME_RE.test(name);
    if (isIsrael) {
      totals.proIsraelPacs += amt;
    }
  }

  return totals;
}

interface HistoricalVote {
  bill?: string;
  title?: string;
  date?: string;
  sanford_position?: string;
  description?: string;
  relevance?: string;
  govtrack_link?: string;
}

interface NormalizedVote {
  bill: string;
  title: string;
  date: string;
  position: string;
  description: string;
  relevance: string;
  govtrack_link: string;
}

function normalizeVotes(raw: HistoricalVote[]): NormalizedVote[] {
  return raw.map(v => ({
    bill: v.bill || '',
    title: (v.title || '').slice(0, 400),
    date: v.date || '',
    position: v.sanford_position || '',
    description: (v.description || '').slice(0, 400),
    relevance: v.relevance || '',
    govtrack_link: v.govtrack_link || '',
  }));
}

// ---------------------------------------------------------------------------
// Diff helpers (for dry-run output)
// ---------------------------------------------------------------------------

interface PlannedUpdate {
  bioguide_id: string;
  name: string;
  fieldsChanged: Record<string, { before: unknown; after: unknown }>;
  mergedSourceIds: Record<string, unknown>;
  votesCount: number;
  newBreakdown?: ContributionBreakdown;
  beforeScore: number;
  afterScore: number;
  isActiveBefore: boolean;
  isActiveAfter: boolean;
  redFlagCount: number;
  biggestSignal: string;
}

function buildDiff(before: unknown, after: unknown): { before: unknown; after: unknown } {
  return { before, after };
}

// ---------------------------------------------------------------------------
// Core: build the planned update for one candidate
// ---------------------------------------------------------------------------

interface ExistingRow {
  bioguide_id: string;
  name: string;
  bio?: string | null;
  is_active?: boolean | null;
  is_candidate?: boolean | null;
  running_for?: string | null;
  corruption_score?: number | null;
  source_ids?: Record<string, unknown> | null;
  voting_records?: unknown;
  contribution_breakdown?: Record<string, unknown> | null;
  israel_lobby_breakdown?: Record<string, unknown> | null;
  israel_lobby_total?: number | null;
  top5_donors?: unknown;
  total_funds?: number | null;
  juice_box_tier?: string | null;
  office?: string | null;
  office_level?: string | null;
  party?: string | null;
  jurisdiction?: string | null;
  jurisdiction_type?: string | null;
  tags?: string[] | null;
}

interface BuiltUpdate {
  payload: Record<string, unknown>;
  planned: PlannedUpdate;
}

function buildUpdateForCandidate(
  p: CuratorPayload,
  existing: ExistingRow,
): BuiltUpdate {
  const fieldsChanged: Record<string, { before: unknown; after: unknown }> = {};

  // --- bio, is_candidate, running_for, is_active ---
  if ((existing.bio || '') !== p.bio) {
    fieldsChanged.bio = buildDiff(
      (existing.bio || '').slice(0, 120) + (existing.bio && existing.bio.length > 120 ? '…' : ''),
      p.bio.slice(0, 120) + '…',
    );
  }
  if (existing.is_candidate !== p.is_candidate) {
    fieldsChanged.is_candidate = buildDiff(existing.is_candidate, p.is_candidate);
  }
  if ((existing.running_for || '') !== p.running_for) {
    fieldsChanged.running_for = buildDiff(existing.running_for, p.running_for);
  }
  if (existing.is_active !== p.is_active) {
    fieldsChanged.is_active = buildDiff(existing.is_active, p.is_active);
  }

  // --- source_ids merge (red_flags + positions) ---
  const existingSourceIds = (existing.source_ids || {}) as Record<string, unknown>;
  const existingRedFlags = Array.isArray(existingSourceIds.red_flags)
    ? (existingSourceIds.red_flags as CuratorRedFlag[])
    : [];

  // Merge strategy: dedupe red_flags by label string (curator set wins on tie).
  const seenLabels = new Set<string>();
  const mergedRedFlags: CuratorRedFlag[] = [];
  for (const rf of [...p.red_flags, ...existingRedFlags]) {
    const label = (rf.label || '').trim();
    if (!label || seenLabels.has(label)) continue;
    seenLabels.add(label);
    mergedRedFlags.push(rf);
  }

  const existingPositions = (existingSourceIds.positions || {}) as Record<string, string>;
  const mergedPositions = { ...existingPositions, ...p.positions };

  const mergedSourceIds = {
    ...existingSourceIds,
    red_flags: mergedRedFlags,
    positions: mergedPositions,
  };

  if (
    JSON.stringify(existingSourceIds.red_flags || []) !==
    JSON.stringify(mergedRedFlags)
  ) {
    fieldsChanged.red_flags = buildDiff(
      (existingSourceIds.red_flags as CuratorRedFlag[] | undefined)?.length || 0,
      `${mergedRedFlags.length} total (${p.red_flags.length} new)`,
    );
  }
  if (
    JSON.stringify(existingSourceIds.positions || {}) !==
    JSON.stringify(mergedPositions)
  ) {
    fieldsChanged.positions = buildDiff(
      Object.keys(existingPositions).length,
      Object.keys(mergedPositions).length,
    );
  }

  // --- voting_records (Sanford only) ---
  let votes: NormalizedVote[] = [];
  if (p.votes_source_file) {
    const raw = loadJson<HistoricalVote[]>(p.votes_source_file);
    votes = normalizeVotes(raw);
    fieldsChanged.voting_records = buildDiff(
      Array.isArray(existing.voting_records) ? (existing.voting_records as unknown[]).length : 0,
      `${votes.length} Israel/Palestine/Iran-relevant historical votes`,
    );
  }

  // --- contribution_breakdown rebuild (Sanford only) ---
  let newBreakdown: ContributionBreakdown | undefined;
  if (p.fec_itemized_files) {
    const allRows: FecRow[] = [];
    for (const f of p.fec_itemized_files) {
      const rows = loadJson<FecRow[]>(f);
      allRows.push(...rows);
    }
    const totals = classifyFecRows(allRows);

    // Preserve existing aipac + corporate + self_funding (if any) — curator
    // only asked us to fix individuals / otherPACs / pro_israel_pacs buckets.
    const existingBreakdown = (existing.contribution_breakdown || {}) as Partial<ContributionBreakdown>;
    newBreakdown = {
      aipac: Math.round(totals.proIsraelPacs), // Sanford: treat pro-Israel as AIPAC bucket too
      corporate: Math.round(Number(existingBreakdown.corporate) || 0),
      otherPACs: Math.round(totals.otherPACs),
      individuals: Math.round(totals.individuals),
      self_funding: Math.round(Number(existingBreakdown.self_funding) || 0),
      pro_israel_pacs: Math.round(totals.proIsraelPacs),
    };

    fieldsChanged.contribution_breakdown = buildDiff(
      existingBreakdown,
      {
        ...newBreakdown,
        _meta: `sum=$${Math.round(totals.totalSum).toLocaleString()} across ${totals.rowsSeen} rows; conduit=$${Math.round(totals.conduit).toLocaleString()} excluded`,
      },
    );
  }

  // --- Build shadow Politician for corruption score recompute ---
  // NOTE: DB columns (e.g. contribution_breakdown) are wider than the Politician
  // type in lib/types.ts (which omits pro_israel_pacs / self_funding). The
  // corruption-score algorithm only reads fields defined on Politician, so we
  // cast through `unknown` to construct a valid shadow object.
  const shadowPol = {
    id: p.bioguide_id,
    name: p.name,
    office: existing.office || 'U.S. House',
    officeLevel: existing.office_level || 'Federal Representative',
    party: existing.party || 'Republican',
    jurisdiction: existing.jurisdiction || 'South Carolina',
    jurisdictionType: existing.jurisdiction_type || 'federal_congressional',
    corruptionScore: 0,
    juiceBoxTier: existing.juice_box_tier || 'none',
    aipacFunding: newBreakdown?.pro_israel_pacs ?? Number(existing.israel_lobby_total) ?? 0,
    totalFundsRaised: Number(existing.total_funds) || 0,
    top5Donors: Array.isArray(existing.top5_donors) ? existing.top5_donors : [],
    contributionBreakdown: newBreakdown ?? existing.contribution_breakdown ?? {
      aipac: 0, corporate: 0, otherPACs: 0, individuals: 0, self_funding: 0, pro_israel_pacs: 0,
    },
    israelLobbyTotal: Number(existing.israel_lobby_total) || newBreakdown?.pro_israel_pacs || 0,
    israelLobbyBreakdown: existing.israel_lobby_breakdown || {
      total: 0, pacs: 0, ie: 0, bundlers: 0,
    },
    isActive: p.is_active,
    tags: existing.tags || ['candidate', '2026-primary', 'challenger', 'republican'],
    bio: p.bio,
    socialMedia: {},
    source_ids: mergedSourceIds,
    dataSource: DATA_SOURCE,
    courtCases: [],
    lobbyingRecords: [],
    votes: [],
  } as unknown as Politician;

  const scoreResult = computeCorruptionScore(shadowPol);
  const afterScore = scoreResult.score;
  const beforeScore = Number(existing.corruption_score) || 0;
  if (afterScore !== beforeScore) {
    fieldsChanged.corruption_score = buildDiff(beforeScore, afterScore);
  }

  // --- Biggest signal line for summary table ---
  let biggestSignal = 'no major signal';
  if (p.red_flags.some(r => r.severity === 'high')) {
    biggestSignal = p.red_flags.find(r => r.severity === 'high')!.label.slice(0, 80);
  } else if (p.red_flags.length > 0) {
    biggestSignal = p.red_flags[0].label.slice(0, 80);
  } else if (p.bioguide_id === 'sc-01-2026-alex-pelbath') {
    biggestSignal = 'clean record; defense-industry hawk profile';
  }

  // --- Build final DB payload ---
  const payload: Record<string, unknown> = {
    bio: p.bio,
    is_candidate: p.is_candidate,
    running_for: p.running_for,
    is_active: p.is_active,
    source_ids: mergedSourceIds,
    corruption_score: afterScore,
    data_source: DATA_SOURCE,
    updated_at: new Date().toISOString(),
  };
  if (votes.length > 0) {
    payload.voting_records = votes;
  }
  if (newBreakdown) {
    payload.contribution_breakdown = newBreakdown;
  }

  return {
    payload,
    planned: {
      bioguide_id: p.bioguide_id,
      name: p.name,
      fieldsChanged,
      mergedSourceIds,
      votesCount: votes.length,
      newBreakdown,
      beforeScore,
      afterScore,
      isActiveBefore: Boolean(existing.is_active),
      isActiveAfter: p.is_active,
      redFlagCount: mergedRedFlags.length,
      biggestSignal,
    },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function fetchExisting(
  supabase: SupabaseClient,
  bioguide_id: string,
): Promise<ExistingRow> {
  const { data, error } = await supabase
    .from('politicians')
    .select(
      'bioguide_id,name,bio,is_active,is_candidate,running_for,corruption_score,source_ids,voting_records,contribution_breakdown,israel_lobby_breakdown,israel_lobby_total,top5_donors,total_funds,juice_box_tier,office,office_level,party,jurisdiction,jurisdiction_type',
    )
    .eq('bioguide_id', bioguide_id)
    .maybeSingle();
  if (error) throw new Error(`Supabase fetch error for ${bioguide_id}: ${error.message}`);
  if (!data) throw new Error(`No DB row for bioguide_id=${bioguide_id} — seed row first`);
  return data as ExistingRow;
}

async function writeToSupabase(
  supabase: SupabaseClient,
  bioguide_id: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('politicians')
    .update(payload)
    .eq('bioguide_id', bioguide_id);
  if (error) throw new Error(`Supabase update error for ${bioguide_id}: ${error.message}`);
}

async function main(): Promise<void> {
  const mode = WRITE ? 'WRITE' : 'DRY-RUN';
  console.log(`\n=== SC-01 Challenger Audit Finalize (${mode}) ===`);
  console.log(`data_source = ${DATA_SOURCE}\n`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const summary: PlannedUpdate[] = [];

  for (const p of PAYLOADS) {
    console.log(`\n--- ${p.name} (${p.bioguide_id}) ---`);
    let existing: ExistingRow;
    try {
      existing = await fetchExisting(supabase, p.bioguide_id);
    } catch (e) {
      console.error(`  SKIP: ${e instanceof Error ? e.message : e}`);
      continue;
    }

    const { payload, planned } = buildUpdateForCandidate(p, existing);
    summary.push(planned);

    // Pretty-print diff
    console.log(`  score: ${planned.beforeScore} -> ${planned.afterScore}`);
    console.log(`  is_active: ${planned.isActiveBefore} -> ${planned.isActiveAfter}`);
    console.log(`  red_flags merged: ${planned.redFlagCount} (${p.red_flags.length} new)`);
    console.log(`  positions keys: ${Object.keys(planned.mergedSourceIds.positions || {}).length}`);
    if (planned.votesCount > 0) console.log(`  voting_records: ${planned.votesCount}`);
    if (planned.newBreakdown) {
      const b = planned.newBreakdown;
      console.log(`  contribution_breakdown: ind=$${b.individuals.toLocaleString()} otherPACs=$${b.otherPACs.toLocaleString()} proIsrael=$${b.pro_israel_pacs.toLocaleString()}`);
    }
    console.log(`  fields touched: ${Object.keys(planned.fieldsChanged).join(', ') || '(none)'}`);

    if (WRITE) {
      await writeToSupabase(supabase, p.bioguide_id, payload);
      console.log(`  >>> WRITTEN to Supabase`);
    }
  }

  // --- Final summary table ---
  console.log(`\n\n=== SUMMARY TABLE ===`);
  const header = ['name', 'old_score', 'new_score', 'is_active_flip', 'red_flags', 'biggest_signal'];
  console.log(header.join(' | '));
  console.log(header.map(h => '-'.repeat(Math.max(h.length, 3))).join('-|-'));
  for (const s of summary) {
    const flip = s.isActiveBefore === s.isActiveAfter ? 'no' : `${s.isActiveBefore} -> ${s.isActiveAfter}`;
    console.log(
      [
        s.name,
        String(s.beforeScore),
        String(s.afterScore),
        flip,
        String(s.redFlagCount),
        s.biggestSignal,
      ].join(' | '),
    );
  }

  if (DRY_RUN) {
    console.log(`\nDRY-RUN complete. No DB writes made. Re-run with --write to commit.`);
  } else {
    console.log(`\nWRITE complete. ${summary.length} rows updated in politicians table.`);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

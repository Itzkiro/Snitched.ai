#!/usr/bin/env npx tsx
/**
 * Update Rep. John Rose's Snitched.ai DB row (bioguide_id = "tn-gov-2026-john-rose")
 * after the 2026-04-24 CORRECTED pro-Israel PAC audit.
 *
 * Background
 * ----------
 * The 2026-04-23 seed (scripts/seed-rose-tn-gov.ts) reported "zero pro-Israel
 * PAC direct contributions" because scripts/audit-rose.ts used the broken FEC
 * API Schedule A contributor_committee_id filter (silently ignored). The
 * corrected audit (scripts/audit-rose-pac-disbursements.ts, reads
 * data/rose-pac-disbursement-audit.json) found:
 *   - AIPAC PAC + NORPAC + others = ~$91.7K 2018-2026 across 7 pro-Israel PACs
 *   - 31 unique earmarked individual bundlers
 *   - Sam Olswanger (Akin Gump FARA) shared with Blackburn
 *
 * Per feedback_snitched_cycle_only_scoring, only the 2026-cycle portion
 * ($9.44 earmark of Brett Marz via AIPAC PAC) is counted in the live
 * israel_lobby_breakdown / israel_lobby_total. Historical 2018-2024 capture
 * is preserved in source_ids.historical_breakdown for context.
 *
 * CLI
 * ---
 *   npx tsx scripts/update-rose-with-pac-audit.ts             # dry-run
 *   npx tsx scripts/update-rose-with-pac-audit.ts --dry-run   # dry-run explicit
 *   npx tsx scripts/update-rose-with-pac-audit.ts --write     # commit to Supabase
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

const BIOGUIDE_ID = 'tn-gov-2026-john-rose';
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const AUDIT_PATH = path.join(DATA_DIR, 'rose-pac-disbursement-audit.json');

// ---------------------------------------------------------------------------
// Audit JSON shape (subset we use)
// ---------------------------------------------------------------------------

interface AuditEntry {
  pac_id: string;
  pac_name: string;
  cycle: number;
  amount: number;
  date: string;
  type: 'direct' | 'earmarked_bundle';
  memo: string;
  purpose: string;
  earmark_donor: string | null;
}

interface AuditByPac {
  committee_id: string;
  total_all_cycles: number;
  by_cycle: Record<string, number>;
  entries: AuditEntry[];
  earmarked_donors: string[];
}

interface AuditSummary {
  cycle_2020_direct_and_earmarked: number;
  cycle_2022_direct_and_earmarked: number;
  cycle_2024_direct_and_earmarked: number;
  cycle_2026_direct_and_earmarked: number;
  total_all_cycles: number;
  unique_earmarked_donors: number;
  earmarked_donors_also_on_blackburn_tn_gov: Array<{
    name: string;
    state: string;
    employer?: string;
    to_blackburn: number;
    to_rose_earmark_total: number;
    via_pacs: string[];
    cycles: number[];
    foreign_money_flag?: string;
  }>;
  top_earmark_donors: Array<{
    name: string;
    total: number;
    count: number;
    pacs: string[];
    cycles: number[];
  }>;
}

interface Audit {
  candidate_id: string;
  principal_committee_id: string;
  method: string;
  audited_at: string;
  total_pacs_checked: number;
  by_cycle: Record<string, { total: number; entries: AuditEntry[] }>;
  by_pac: Record<string, AuditByPac>;
  independent_expenditures: unknown[];
  summary: AuditSummary;
}

function loadAudit(): Audit {
  if (!fs.existsSync(AUDIT_PATH)) {
    throw new Error(
      `Audit artifact not found: ${AUDIT_PATH}. Run scripts/audit-rose-pac-disbursements.ts first.`,
    );
  }
  return JSON.parse(fs.readFileSync(AUDIT_PATH, 'utf8')) as Audit;
}

// ---------------------------------------------------------------------------
// Build new field values from audit
// ---------------------------------------------------------------------------

interface PacDetail {
  committee_id: string;
  name: string;
  amount: number;
  date: string;
  type: 'direct' | 'earmarked_bundle';
  earmark_donor?: string;
  memo?: string;
}

function build2026PacDetails(audit: Audit): PacDetail[] {
  const bucket = audit.by_cycle['2026'];
  if (!bucket) return [];
  return bucket.entries.map(e => {
    const detail: PacDetail = {
      committee_id: e.pac_id,
      name: e.pac_name,
      amount: e.amount,
      date: e.date,
      type: e.type,
    };
    if (e.earmark_donor) detail.earmark_donor = e.earmark_donor;
    if (e.memo) detail.memo = e.memo;
    return detail;
  });
}

interface HistoricalByPac {
  pac_name: string;
  committee_id: string;
  total_2018_2024: number;
  cycles: string[];
  earmark_bundler_count: number;
  notable_earmark_donors: string[];
  direct_cycles_subtotal: Record<string, number>;
}

function buildHistoricalBreakdown(audit: Audit): {
  aipac_pac_c00797670: Record<string, unknown>;
  other_pacs: HistoricalByPac[];
  combined_historical_total: number;
  note: string;
} {
  const combined =
    audit.summary.cycle_2020_direct_and_earmarked +
    audit.summary.cycle_2022_direct_and_earmarked +
    audit.summary.cycle_2024_direct_and_earmarked;

  // AIPAC PAC detail (main finding)
  const aipacKey = Object.keys(audit.by_pac).find(k =>
    audit.by_pac[k].committee_id === 'C00797670',
  );
  const aipac = aipacKey ? audit.by_pac[aipacKey] : null;
  const aipacHistoricalEntries = aipac
    ? aipac.entries.filter(e => e.cycle !== 2026)
    : [];
  const aipacHistoricalTotal = aipacHistoricalEntries.reduce(
    (s, e) => s + e.amount,
    0,
  );
  const aipacNotable = [
    ...new Set(
      aipacHistoricalEntries
        .filter(e => e.earmark_donor)
        .map(e => e.earmark_donor || ''),
    ),
  ];
  // A few sample entries to show shape
  const aipacSampleEntries = aipacHistoricalEntries.slice(0, 10).map(e => ({
    cycle: e.cycle,
    date: e.date,
    amount: e.amount,
    type: e.type,
    earmark_donor: e.earmark_donor,
  }));

  const aipacDetail: Record<string, unknown> = {
    committee_id: 'C00797670',
    name: 'AIPAC PAC (American Israel Public Affairs Committee Political Action Committee)',
    total_2022_2024: aipacHistoricalTotal,
    cycles_with_disbursements: [
      ...new Set(aipacHistoricalEntries.map(e => String(e.cycle))),
    ].sort(),
    earmark_bundlers_count: aipacNotable.length,
    notable_donors: aipacNotable,
    sample_entries: aipacSampleEntries,
  };

  // Other PACs (any non-AIPAC PAC with hits, and any AIPAC PAC pre-2026 already covered above)
  const otherPacs: HistoricalByPac[] = [];
  for (const [name, pac] of Object.entries(audit.by_pac)) {
    if (pac.committee_id === 'C00797670') continue;
    const histEntries = pac.entries.filter(e => e.cycle !== 2026);
    if (!histEntries.length) continue;
    const total = histEntries.reduce((s, e) => s + e.amount, 0);
    const cycleSubtotal: Record<string, number> = {};
    for (const e of histEntries) {
      const ck = String(e.cycle);
      cycleSubtotal[ck] = (cycleSubtotal[ck] || 0) + e.amount;
    }
    const earmarkDonors = [
      ...new Set(
        histEntries.filter(e => e.earmark_donor).map(e => e.earmark_donor || ''),
      ),
    ];
    otherPacs.push({
      pac_name: name,
      committee_id: pac.committee_id,
      total_2018_2024: total,
      cycles: [...new Set(histEntries.map(e => String(e.cycle)))].sort(),
      earmark_bundler_count: earmarkDonors.length,
      notable_earmark_donors: earmarkDonors,
      direct_cycles_subtotal: cycleSubtotal,
    });
  }
  otherPacs.sort((a, b) => b.total_2018_2024 - a.total_2018_2024);

  return {
    aipac_pac_c00797670: aipacDetail,
    other_pacs: otherPacs,
    combined_historical_total: combined,
    note:
      'Captured via corrected FEC Schedule B-by-disburser method 2026-04-24 after initial broken-filter audit on 2026-04-23. Represents documented pro-Israel-lobby capture during Rose\'s House tenure 2019-2024, preserved for context but not counted in live score per cycle-only policy.',
  };
}

// ---------------------------------------------------------------------------
// Compose payload (preserves un-touched seed fields)
// ---------------------------------------------------------------------------

interface RedFlag {
  severity: 'high' | 'med' | 'low';
  label: string;
  source: string;
  date: string;
}

interface PoliticianRow {
  bioguide_id: string;
  name: string;
  office: string;
  office_level: string;
  party: string;
  district: string | null;
  jurisdiction: string;
  jurisdiction_type: string;
  corruption_score: number;
  aipac_funding: number;
  juice_box_tier: string;
  total_funds: number;
  top5_donors: unknown[];
  israel_lobby_total: number;
  israel_lobby_breakdown: Record<string, unknown>;
  contribution_breakdown: Record<string, unknown>;
  is_active: boolean;
  is_candidate: boolean;
  running_for: string;
  bio: string;
  social_media?: Record<string, unknown>;
  source_ids: Record<string, unknown>;
  data_source: string;
  voting_records: unknown[];
  lobbying_records: unknown[];
  court_records: unknown[];
}

const BIO_APPENDIX = [
  '',
  '',
  'CORRECTION 2026-04-24: Initial audit (2026-04-23) reported zero pro-Israel PAC direct contributions due to a broken FEC API `contributor_committee_id` filter that silently returned unfiltered results. Corrected audit using Schedule B-by-disburser method found **AIPAC PAC (C00797670) contributed $52,239 to Rose across 45 transactions spanning 2022, 2024, and 2026 cycles** — comprising direct committee-to-committee transfers ($5K lump sums) plus 30+ individually-earmarked bundler transfers ($1K-$3.3K each) where pro-Israel donors wrote checks to AIPAC PAC designated for Rose\'s committee. Additional pro-Israel PAC capture found: NORPAC $40,000 (cycles 2018/2020/2022/2024), plus smaller amounts from NORPAC legacy, American Principles, Pro-Israel America PAC legacy, AIPAC PAC legacy, and J Street PAC — combined ~$91,739 pro-Israel-network capture across 7 PACs 2018-2026. Notable earmarked donors include Sam Olswanger (Akin Gump Strauss Hauer & Feld — FARA-registered firm representing foreign sovereigns, who also bundled $10,600 to Blackburn\'s TN gov committee), Lawrence Hyatt ($4,300 combined), Jack Ades (recurring multi-cycle, $4,567 total), Jonathan Caplan, Seth Damski, Jonathan Slass, Stuart Kuntz, Russell Herman. Per Snitched 2026-cycle-only scoring policy, only the $9.44 2026-cycle portion (earmark of Brett Marz via AIPAC PAC) is counted in the live score; the 2018-2024 historical capture ($91,729 net) is preserved in source_ids.historical_breakdown for context. Live score maintained driven by voting-pattern alignment (75% AYE on direct Israel-aid funding bills).',
].join('\n');

function build(audit: Audit, existing: PoliticianRow): PoliticianRow {
  const pacDetails2026 = build2026PacDetails(audit);
  const pacs2026Total = pacDetails2026.reduce((s, d) => s + d.amount, 0);

  // Existing israel_lobby_breakdown had $35 JStreetPAC bundler seed.
  // We keep the individual_registry bundler info from the existing row — it's
  // independent of the PAC-disburser audit — but refresh the PAC side with
  // the corrected numbers.
  const priorBundler =
    (existing.israel_lobby_breakdown &&
      Number(existing.israel_lobby_breakdown['bundlers']) || 0);
  const newTotal = pacs2026Total + priorBundler;

  const newBreakdown = {
    ...existing.israel_lobby_breakdown,
    ie: 0,
    pacs: pacs2026Total,
    total: newTotal,
    pac_details: pacDetails2026,
    note:
      '2026 cycle only per Snitched cycle-only scoring policy. Historical AIPAC-network capture ($91,729 across 2018/2020/2022/2024 cycles, 7 PACs, 31 earmarked individual bundlers) in source_ids.historical_breakdown.',
  };

  // Merge red_flags: preserve existing, add 3 new
  const existingFlags = (existing.source_ids?.red_flags as RedFlag[]) || [];
  const aipacBundlers = audit.by_pac[
    Object.keys(audit.by_pac).find(
      k => audit.by_pac[k].committee_id === 'C00797670',
    ) || ''
  ];
  const aipacEarmarkCount =
    aipacBundlers
      ? new Set(
          aipacBundlers.entries
            .filter(e => e.earmark_donor)
            .map(e => e.earmark_donor),
        ).size
      : 0;

  const newFlags: RedFlag[] = [
    {
      severity: 'high',
      label: `AIPAC PAC $52,239 total across 45 transactions 2022-2026 (direct contributions + ${aipacEarmarkCount} earmarked individual bundlers). Includes Sam Olswanger — Akin Gump FARA-registered firm Senior Policy Advisor — who also maxed-out to Blackburn's TN gov committee. Mechanism: AIPAC-designated bundler earmarks ($1,000-$3,300 each) funneled through AIPAC PAC conduit. Historical pattern (2022-2024); 2026 cycle visible only $9.44.`,
      source: 'FEC Schedule B C00797670 by recipient C00652743 — audit 2026-04-24',
      date: '2022-2026',
    },
    {
      severity: 'high',
      label: `Pro-Israel-network lifetime capture across 7 PACs totals ~$91,739 (2018-2024): AIPAC PAC $52,239, NORPAC $40,000, plus AIPAC legacy / NORPAC legacy / Pro-Israel America legacy / American Principles / J Street PAC. 31 unique earmarked individual bundlers identified. Pattern documented across Rose's House tenure 2019-2024; only $9.44 visible in 2026 cycle per cycle-only scoring policy.`,
      source: 'FEC Schedule B by 92 pro-Israel PACs → recipient C00652743 — audit 2026-04-24',
      date: '2018-2026',
    },
    {
      severity: 'high',
      label: `Cross-candidate bundler identification: Sam Olswanger (Akin Gump Strauss Hauer & Feld, DC — FARA-registered firm representing foreign sovereigns) appears as earmarked AIPAC-PAC bundler to Rose ($1,000 via AIPAC PAC) AND as maxed-out individual donor to Blackburn's TN gov committee ($10,600). Same FARA-registered firm, same two TN 2026 GOP gubernatorial candidates — indicates coordinated foreign-money-adjacent bundling across both campaigns.`,
      source: 'cross-ref data/rose-pac-disbursement-audit.json × data/blackburn-tn-gov-cross-ref-2026.json',
      date: '2022-2024',
    },
  ];

  const mergedFlags = [...existingFlags, ...newFlags];

  const historical = buildHistoricalBreakdown(audit);

  const newSourceIds = {
    ...existing.source_ids,
    red_flags: mergedFlags,
    historical_breakdown: historical,
  };

  const newBio = existing.bio + BIO_APPENDIX;

  return {
    ...existing,
    israel_lobby_total: newTotal,
    israel_lobby_breakdown: newBreakdown,
    source_ids: newSourceIds,
    bio: newBio,
    data_source: 'audit_2026-04-24_tn_gov_2026_cycle_only_rose_pac_correction',
  };
}

// ---------------------------------------------------------------------------
// Score recompute (same as seed-rose-tn-gov.ts)
// ---------------------------------------------------------------------------

function computeScoreForPayload(p: PoliticianRow): {
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

// ---------------------------------------------------------------------------
// Supabase I/O
// ---------------------------------------------------------------------------

async function fetchExisting(supabase: SupabaseClient): Promise<PoliticianRow> {
  const { data, error } = await supabase
    .from('politicians')
    .select('*')
    .eq('bioguide_id', BIOGUIDE_ID)
    .single();
  if (error) throw error;
  if (!data) throw new Error(`Rose row not found: ${BIOGUIDE_ID}`);
  return data as PoliticianRow;
}

async function writeRow(
  supabase: SupabaseClient,
  next: PoliticianRow,
  score: number,
): Promise<void> {
  const payload = {
    corruption_score: score,
    israel_lobby_total: next.israel_lobby_total,
    israel_lobby_breakdown: next.israel_lobby_breakdown,
    bio: next.bio,
    source_ids: next.source_ids,
    data_source: next.data_source,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('politicians')
    .update(payload)
    .eq('bioguide_id', BIOGUIDE_ID);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Diff printer
// ---------------------------------------------------------------------------

function formatDiff(
  before: PoliticianRow,
  after: PoliticianRow,
  beforeScore: number,
  afterScore: { score: number; grade: string; confidence: string },
): void {
  console.log(`\n--- DRY-RUN DIFF: ${BIOGUIDE_ID} ---`);
  console.log(`  corruption_score:    ${beforeScore}  ->  ${afterScore.score} (grade ${afterScore.grade}, confidence ${afterScore.confidence})`);
  console.log(`  juice_box_tier:      ${before.juice_box_tier}  ->  ${after.juice_box_tier} (unchanged)`);
  console.log(`  israel_lobby_total:  $${before.israel_lobby_total}  ->  $${after.israel_lobby_total}`);
  const beforePacs =
    Number((before.israel_lobby_breakdown || {}).pacs || 0) || 0;
  const afterPacs =
    Number((after.israel_lobby_breakdown || {}).pacs || 0) || 0;
  console.log(`  israel_lobby_breakdown.pacs:      $${beforePacs}  ->  $${afterPacs}`);
  const beforePacDetails = Array.isArray(
    (before.israel_lobby_breakdown || {}).pac_details,
  )
    ? ((before.israel_lobby_breakdown || {}).pac_details as unknown[]).length
    : 0;
  const afterPacDetails = Array.isArray(
    (after.israel_lobby_breakdown || {}).pac_details,
  )
    ? ((after.israel_lobby_breakdown || {}).pac_details as unknown[]).length
    : 0;
  console.log(`  israel_lobby_breakdown.pac_details (count): ${beforePacDetails}  ->  ${afterPacDetails}`);
  const beforeFlags =
    ((before.source_ids || {}).red_flags as unknown[] | undefined)?.length || 0;
  const afterFlags =
    ((after.source_ids || {}).red_flags as unknown[] | undefined)?.length || 0;
  console.log(`  source_ids.red_flags (count):     ${beforeFlags}  ->  ${afterFlags}`);
  const hasHistorical = 'historical_breakdown' in (after.source_ids || {});
  console.log(`  source_ids.historical_breakdown:  ${hasHistorical ? 'ADDED' : 'MISSING'}`);
  console.log(`  data_source:         ${before.data_source}  ->  ${after.data_source}`);
  console.log(`  bio:                 ${before.bio.length} chars  ->  ${after.bio.length} chars (+${after.bio.length - before.bio.length})`);
  console.log(`\nAfter-write israel_lobby_breakdown (abridged):`);
  console.log(JSON.stringify(after.israel_lobby_breakdown, null, 2).split('\n').slice(0, 40).join('\n'));
  console.log(`\nAfter-write NEW red_flags (3 added):`);
  const addedFlags =
    ((after.source_ids || {}).red_flags as Array<Record<string, unknown>>).slice(
      beforeFlags,
    );
  for (const f of addedFlags) {
    console.log(`  [${f.severity}] ${String(f.label).slice(0, 200)}${String(f.label).length > 200 ? '...' : ''}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const mode = WRITE ? 'WRITE' : 'DRY-RUN';
  console.log(`\n=== UPDATE ROSE WITH PAC AUDIT (${mode}) ===`);

  const audit = loadAudit();
  console.log(`Audit method:       ${audit.method}`);
  console.log(`Audit timestamp:    ${audit.audited_at}`);
  console.log(`PACs checked:       ${audit.total_pacs_checked}`);
  console.log(`Cycle 2020 total:   $${audit.summary.cycle_2020_direct_and_earmarked.toLocaleString()}`);
  console.log(`Cycle 2022 total:   $${audit.summary.cycle_2022_direct_and_earmarked.toLocaleString()}`);
  console.log(`Cycle 2024 total:   $${audit.summary.cycle_2024_direct_and_earmarked.toLocaleString()}`);
  console.log(`Cycle 2026 total:   $${audit.summary.cycle_2026_direct_and_earmarked.toLocaleString()}`);
  console.log(`Unique earmark donors: ${audit.summary.unique_earmarked_donors}`);
  console.log(`Shared with Blackburn: ${audit.summary.earmarked_donors_also_on_blackburn_tn_gov.length}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const existing = await fetchExisting(supabase);
  console.log(`\nFetched existing row: ${existing.name} (score=${existing.corruption_score}, tier=${existing.juice_box_tier})`);

  const next = build(audit, existing);
  const scored = computeScoreForPayload(next);

  formatDiff(existing, next, Number(existing.corruption_score) || 0, scored);

  if (DRY_RUN) {
    console.log(`\nDRY-RUN complete. Re-run with --write to commit.`);
    return;
  }

  console.log(`\n=== WRITING TO SUPABASE ===`);
  await writeRow(supabase, next, scored.score);

  const { data: verify, error: vErr } = await supabase
    .from('politicians')
    .select(
      'bioguide_id,name,corruption_score,juice_box_tier,israel_lobby_total,data_source',
    )
    .eq('bioguide_id', BIOGUIDE_ID)
    .single();
  if (vErr) throw vErr;
  console.log(`DB VERIFY: ${JSON.stringify(verify)}`);
  console.log(`\nWRITE complete.`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

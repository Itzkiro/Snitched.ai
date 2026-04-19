#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Import Vivek Ramaswamy's OH SOS campaign-finance CSVs (committee /
 * contributions / expenditures) — name-search exports the user pulled
 * manually because the OH SOS portal's CFDISCLOSURE app is behind a
 * Cloudflare WAF that blocks our headless scraper.
 *
 * What the CSVs are:
 *   - Vivek committee.csv      → his joint gubernatorial committee
 *   - Vivek contributions.csv  → contribs from anyone named "Vivek" to any
 *                                committee (mostly noise; only ~$6K is to his
 *                                own committee)
 *   - Vivek Exp.csv            → expenditures from any committee where the
 *                                Payee is a Vivek-related entity. THIS is the
 *                                useful slice — $1.14M across 106 PACs.
 *
 * What we DO with it:
 *   - Aggregate PAC support to Vivek-related payees
 *   - Compute top5 donors, contribution_breakdown.{otherPACs, individuals}
 *   - Verify aipac_funding=$0 and israel_lobby_total=$0 against real names
 *     (the prior zeros were placeholder / unverified)
 *   - Recompute corruption score with the refreshed signals
 *   - Keep total_funds = $19.8M unchanged (CSVs only cover the itemized PAC
 *     subset, not his self-funding + small-dollar bulk reported in press)
 *
 * Usage:
 *   npx tsx scripts/import-vivek-csv.ts --dry-run
 *   npx tsx scripts/import-vivek-csv.ts --write
 */

import { createClient } from '@supabase/supabase-js';
import { computeCorruptionScore } from '../lib/corruption-score';
import type { Politician } from '../lib/types';
import * as fs from 'fs';
import * as path from 'path';

const BIOGUIDE_ID = 'oh-gov-2026-vivek-ramaswamy';
const CSV_DIR = '/Users/kirolosabdalla/Desktop/United For America/Candidates/Ohio/Governor/Vivek R';
const COMMITTEE_FILE = 'Vivek committee.csv';
const CONTRIB_FILE = 'Vivek contributions.csv';
const EXP_FILE = 'Vivek Exp.csv';

// Catch typos in OH SOS data: "RAMASWAMI", "RAMASWAY", "RAMASESAMY".
const VIVEK_PAYEE_RE = /VIVEK|RAMASW/i;

// Israel-lobby classifier — same list used in sync-oh-state-finance.ts.
const ISRAEL_LOBBY_NAMES = [
  'AIPAC', 'AMERICAN ISRAEL PUBLIC AFFAIRS',
  'DEMOCRATIC MAJORITY FOR ISRAEL', 'DMFI',
  'UNITED DEMOCRACY PROJECT', 'PRO-ISRAEL AMERICA',
  'NORPAC', 'JACPAC',
  'REPUBLICAN JEWISH COALITION',
  'CHRISTIANS UNITED FOR ISRAEL',
  'ZIONIST ORGANIZATION OF AMERICA',
];
function classifyIsraelLobby(name: string): boolean {
  const n = name.toUpperCase();
  return ISRAEL_LOBBY_NAMES.some(needle => n.includes(needle));
}
function isAipac(name: string): boolean {
  return /AIPAC|AMERICAN ISRAEL/i.test(name);
}

// ---------------------------------------------------------------------------
// CSV parsing (handles quoted fields with commas)
// ---------------------------------------------------------------------------

function parseCsv(filePath: string): Record<string, string>[] {
  const txt = fs.readFileSync(filePath, 'utf8');
  const lines = txt.split(/\r?\n/).filter(Boolean);
  const headerLine = lines.shift();
  if (!headerLine) return [];
  const cols = splitCsvLine(headerLine);
  return lines.map(line => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    cols.forEach((c, i) => { row[c] = (cells[i] ?? '').trim(); });
    return row;
  });
}
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ',' && !inQuote) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}
function parseMoney(s: string): number {
  const n = Number(String(s).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run') || !argv.includes('--write');

  console.log('='.repeat(60));
  console.log(`  CSV IMPORT: Vivek Ramaswamy (${BIOGUIDE_ID})`);
  console.log('='.repeat(60));
  console.log(dryRun ? '  [DRY RUN — no DB write]' : '  [LIVE — writing to Supabase]');
  console.log('');

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Load existing record
  const { data: currentRow, error: loadErr } = await supabase
    .from('politicians').select('*').eq('bioguide_id', BIOGUIDE_ID).single();
  if (loadErr || !currentRow) {
    console.error(`Failed to load: ${loadErr?.message}`);
    process.exit(1);
  }
  console.log(`Loaded: ${currentRow.name} | total_funds=$${Number(currentRow.total_funds).toLocaleString()} | score=${currentRow.corruption_score}\n`);

  // Parse CSVs
  const committee = parseCsv(path.join(CSV_DIR, COMMITTEE_FILE));
  const contribs = parseCsv(path.join(CSV_DIR, CONTRIB_FILE));
  const expenditures = parseCsv(path.join(CSV_DIR, EXP_FILE));
  console.log(`CSVs parsed:`);
  console.log(`  committee:     ${committee.length} rows`);
  console.log(`  contributions: ${contribs.length} rows`);
  console.log(`  expenditures:  ${expenditures.length} rows\n`);
  if (committee.length === 0) console.warn('No committee row — file may be empty');

  // Itemized direct contribs to Vivek's committee (small subset of true total)
  const direct = contribs.filter(r => VIVEK_PAYEE_RE.test(r['Committee'] || ''));
  const directTotal = direct.reduce((s, r) => s + parseMoney(r['Amount']), 0);
  console.log(`Direct itemized contribs to Vivek's committee: ${direct.length} rows, $${directTotal.toFixed(2)}`);

  // PAC expenditures TO Vivek-related entities (the bulk of useful signal)
  const inflow = expenditures.filter(r => VIVEK_PAYEE_RE.test(r['Payee Name'] || ''));
  console.log(`Expenditures TO Vivek-related payees: ${inflow.length} rows`);

  // Aggregate by spending Committee (= the donor PAC)
  type DonorAgg = { name: string; amount: number; count: number; type: string; is_israel_lobby: boolean };
  const byDonor = new Map<string, DonorAgg>();
  let aipac = 0, israelLobby = 0, israelLobbyPacs = 0;
  let pacTotal = 0;
  for (const r of inflow) {
    const donor = (r['Committee'] || '').trim();
    if (!donor) continue;
    const amt = parseMoney(r['Amount']);
    const isIsr = classifyIsraelLobby(donor);
    const key = donor.toUpperCase();
    if (!byDonor.has(key)) byDonor.set(key, { name: donor, amount: 0, count: 0, type: 'PAC', is_israel_lobby: isIsr });
    const agg = byDonor.get(key)!;
    agg.amount += amt;
    agg.count += 1;
    pacTotal += amt;
    if (isIsr) {
      israelLobby += amt;
      israelLobbyPacs += amt;
      if (isAipac(donor)) aipac += amt;
    }
  }

  // Add itemized individual contribs to byDonor too
  let individualsTotal = 0;
  for (const r of direct) {
    const name = (r['Contributor Name'] || '').trim();
    if (!name) continue;
    const amt = parseMoney(r['Amount']);
    individualsTotal += amt;
    const key = `IND:${name.toUpperCase()}`;
    const isIsr = classifyIsraelLobby(name);
    if (!byDonor.has(key)) byDonor.set(key, { name, amount: 0, count: 0, type: 'Individual', is_israel_lobby: isIsr });
    const agg = byDonor.get(key)!;
    agg.amount += amt;
    agg.count += 1;
  }

  const top5 = [...byDonor.values()].sort((a, b) => b.amount - a.amount).slice(0, 5)
    .map(d => ({ name: d.name, amount: Math.round(d.amount * 100) / 100, type: d.type, is_israel_lobby: d.is_israel_lobby }));
  console.log(`\nTop 5 donors (PACs + itemized individuals):`);
  for (const d of top5) console.log(`  - ${d.name} | ${d.type} | $${d.amount.toLocaleString()}${d.is_israel_lobby ? ' [ISRAEL LOBBY]' : ''}`);

  console.log(`\nAggregates:`);
  console.log(`  PAC support (otherPACs): $${pacTotal.toLocaleString()}`);
  console.log(`  Itemized individuals:    $${individualsTotal.toLocaleString()}`);
  console.log(`  AIPAC funding:           $${aipac.toLocaleString()}`);
  console.log(`  Israel lobby total:      $${israelLobby.toLocaleString()}`);

  // Build update — DO NOT touch total_funds (CSVs only cover itemized PAC slice)
  const newBreakdown = {
    aipac,
    otherPACs: Math.max(0, pacTotal - aipac),
    individuals: individualsTotal,
    corporate: 0,
  };
  const newIsraelBreakdown = {
    total: israelLobby,
    pacs: israelLobbyPacs,
    ie: 0,
    bundlers: 0,
  };

  // Recompute corruption score using refreshed donor data
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
    aipacFunding: aipac,
    totalFundsRaised: Number(currentRow.total_funds) || 0,
    top5Donors: top5,
    contributionBreakdown: newBreakdown,
    israelLobbyTotal: israelLobby,
    israelLobbyBreakdown: newIsraelBreakdown,
    isActive: currentRow.is_active ?? false,
    isCandidate: true,
    runningFor: currentRow.running_for ?? 'Governor of Ohio',
    tags: currentRow.tags || [],
    bio: currentRow.bio,
    socialMedia: currentRow.social_media || {},
    dataSource: 'oh_sos_csv_import',
    courtCases: [],
    lobbyingRecords: currentRow.lobbying_records || [],
    votes: [],
  };
  const score = computeCorruptionScore(polForScoring);
  console.log(`\nCorruption score: ${currentRow.corruption_score} → ${score.score} (${score.grade}, ${score.confidence} confidence)`);
  for (const f of score.factors) {
    console.log(`  ${f.key}: raw=${f.rawScore} weighted=${f.weightedScore} (w=${f.weight}, data=${f.dataAvailable})`);
  }

  // Build update payload
  const updates: Record<string, unknown> = {
    top5_donors: top5,
    contribution_breakdown: newBreakdown,
    aipac_funding: aipac,
    israel_lobby_total: israelLobby,
    israel_lobby_breakdown: newIsraelBreakdown,
    corruption_score: score.score,
    data_source: 'oh_sos_csv_import',
    updated_at: new Date().toISOString(),
  };

  console.log(`\n--- Proposed update (total_funds intentionally unchanged) ---`);
  console.log(`  top5_donors:        ${(currentRow.top5_donors || []).length} → ${top5.length}`);
  console.log(`  contribution_breakdown: ${JSON.stringify(currentRow.contribution_breakdown)} → ${JSON.stringify(newBreakdown)}`);
  console.log(`  aipac_funding:      ${currentRow.aipac_funding} → ${aipac}`);
  console.log(`  israel_lobby_total: ${currentRow.israel_lobby_total} → ${israelLobby}`);
  console.log(`  corruption_score:   ${currentRow.corruption_score} → ${score.score}`);
  console.log(`  data_source:        ${currentRow.data_source} → oh_sos_csv_import`);
  console.log('');

  if (dryRun) {
    console.log('[DRY RUN] Skipping DB write. Re-run with --write to persist.');
    return;
  }
  const { error: updateErr } = await supabase
    .from('politicians').update(updates).eq('bioguide_id', BIOGUIDE_ID);
  if (updateErr) {
    console.error(`DB update failed: ${updateErr.message}`);
    process.exit(1);
  }
  console.log('DB update succeeded.');
}

main().catch(err => { console.error(err); process.exit(1); });

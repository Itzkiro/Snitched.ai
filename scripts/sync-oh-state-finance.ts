#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Sync Ohio State Campaign Finance Data to Supabase
 *
 * Pulls campaign finance data for OH statewide and state-legislative
 * candidates from the Ohio Secretary of State CFDISCLOSURE portal
 * (https://www6.ohiosos.gov/ords/f?p=CFDISCLOSURE) and writes normalized
 * totals / top donors / contribution breakdown to the politicians table.
 *
 * Modes:
 *   - Single-committee lookup: --committee-id <id> OR --committee-name "<name>"
 *   - Single-candidate lookup: --candidate "<name>" (resolves the committee)
 *   - Write by bioguide_id:   --bioguide-id <id>
 *
 * Exit codes:
 *   0 — success, data pulled
 *   2 — OH SOS portal unreachable (maintenance / 403); caller should fall back
 *   1 — any other error
 *
 * Usage:
 *   npx tsx scripts/sync-oh-state-finance.ts --candidate "Amy Acton" --bioguide-id oh-gov-2026-amy-acton
 *   npx tsx scripts/sync-oh-state-finance.ts --committee-name "Ohioans for Amy Acton" --dry-run
 *   npx tsx scripts/sync-oh-state-finance.ts --committee-id 12345 --output /tmp/acton.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import type { DonorForensics } from '../lib/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const OH_SOS_BASE = 'https://www6.ohiosos.gov/ords/f';
const OH_SOS_COMMITTEE_PAGE = 'CFDISCLOSURE:73';          // Committee search
const OH_SOS_CONTRIB_PAGE = 'CFDISCLOSURE:75';            // Contribution search
const USER_AGENT = 'Mozilla/5.0 (compatible; Snitched.ai/1.0; +https://snitched.ai)';

const MAINTENANCE_EXIT_CODE = 2;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OhCommitteeSummary {
  committee_id: string;
  committee_name: string;
  committee_type: string | null;
  candidate_name: string | null;
  office: string | null;
  district: string | null;
  party: string | null;
  treasurer: string | null;
  source_url: string;
}

export interface OhContribution {
  contributor_name: string;
  contributor_type: 'Individual' | 'PAC' | 'Corporate' | 'Party' | 'Other';
  contributor_address: string | null;
  contributor_employer: string | null;
  contributor_occupation: string | null;
  amount: number;
  date: string | null;
  filing_id: string | null;
}

export interface OhFinanceResult {
  bioguide_id: string | null;
  candidate_name: string;
  committee: OhCommitteeSummary;
  total_funds: number;
  total_contribution_count: number;
  top5_donors: Array<{ name: string; amount: number; type: string; is_israel_lobby: boolean }>;
  contribution_breakdown: {
    aipac: number;
    otherPACs: number;
    individuals: number;
    corporate: number;
  };
  aipac_funding: number;
  israel_lobby_total: number;
  israel_lobby_breakdown: {
    total: number;
    pacs: number;
    ie: number;
    bundlers: number;
    ie_details?: Array<Record<string, unknown>>;
  };
  /** Donor-pattern forensic signals. Only populated when itemized data is available. */
  donor_forensics?: DonorForensics;
  data_source: string;
  scraped_at: string;
}

// ---------------------------------------------------------------------------
// Israel-lobby donor classifier
// ---------------------------------------------------------------------------

// Names that are commonly tied to AIPAC / Israel-lobby networks. Matching is
// case-insensitive substring so affiliates (e.g. "AIPAC PAC") are also caught.
const ISRAEL_LOBBY_NAMES = [
  'AIPAC',
  'American Israel Public Affairs',
  'Democratic Majority for Israel',
  'DMFI',
  'United Democracy Project',
  'Pro-Israel America',
  'NORPAC',
  'JACPAC',
  'Republican Jewish Coalition',
  'Christians United for Israel',
  'Zionist Organization of America',
];

function classifyIsraelLobby(name: string): boolean {
  const n = name.toUpperCase();
  return ISRAEL_LOBBY_NAMES.some(needle => n.includes(needle.toUpperCase()));
}

function classifyContributorType(raw: string): OhContribution['contributor_type'] {
  const t = (raw || '').toUpperCase();
  if (t.includes('PAC') || t.includes('POLITICAL ACTION')) return 'PAC';
  if (t.includes('PARTY') || t.includes('COMMITTEE')) return 'Party';
  if (t.includes('CORP') || t.includes('LLC') || t.includes('INC')) return 'Corporate';
  if (t.includes('IND') || t === '' || t === 'INDIVIDUAL') return 'Individual';
  return 'Other';
}

// ---------------------------------------------------------------------------
// OH SOS HTTP helpers
// ---------------------------------------------------------------------------

async function ohSosFetch(page: string, params: Record<string, string> = {}): Promise<string> {
  const url = new URL(OH_SOS_BASE);
  url.searchParams.set('p', page);
  for (const [k, v] of Object.entries(params)) url.searchParams.append(k, v);
  const res = await fetch(url.toString(), {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  });
  if (res.status === 403 || res.status === 503) {
    const body = await res.text();
    if (/maintenance/i.test(body)) {
      const err = new Error('OH_SOS_MAINTENANCE');
      (err as Error & { maintenance: boolean }).maintenance = true;
      throw err;
    }
  }
  if (!res.ok) throw new Error(`OH SOS ${page} HTTP ${res.status}`);
  return res.text();
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/** Extract table rows from an Oracle APEX interactive-grid HTML page. */
function extractApexRows(html: string): Array<Record<string, string>> {
  const rows: Array<Record<string, string>> = [];
  const tableMatch = html.match(/<table[^>]*class="[^"]*report-standard[^"]*"[^>]*>([\s\S]*?)<\/table>/i)
    || html.match(/<table[^>]*id="[^"]*report[^"]*"[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) return rows;
  const body = tableMatch[1];
  const headerMatch = body.match(/<thead>([\s\S]*?)<\/thead>/i);
  const headers: string[] = [];
  if (headerMatch) {
    const hre = /<th[^>]*>([\s\S]*?)<\/th>/gi;
    let h: RegExpExecArray | null;
    while ((h = hre.exec(headerMatch[1])) !== null) {
      headers.push(h[1].replace(/<[^>]+>/g, '').trim().toLowerCase());
    }
  }
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let r: RegExpExecArray | null;
  while ((r = rowRe.exec(body)) !== null) {
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let c: RegExpExecArray | null;
    while ((c = cellRe.exec(r[1])) !== null) {
      cells.push(c[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
    }
    if (cells.length === 0) continue;
    const row: Record<string, string> = {};
    cells.forEach((v, i) => { row[headers[i] || `col${i}`] = v; });
    rows.push(row);
  }
  return rows;
}

function parseMoney(s: string): number {
  const n = Number(String(s).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Committee lookup
// ---------------------------------------------------------------------------

export async function findCommittee(
  search: { name?: string; id?: string; candidate?: string },
): Promise<OhCommitteeSummary | null> {
  const params: Record<string, string> = {};
  if (search.id) params.P73_COMMITTEE_ID = search.id;
  else if (search.name) params.P73_COMMITTEE_NAME = search.name;
  else if (search.candidate) params.P73_CANDIDATE_NAME = search.candidate;
  else throw new Error('findCommittee: one of id, name, candidate required');

  const html = await ohSosFetch(OH_SOS_COMMITTEE_PAGE, params);
  const rows = extractApexRows(html);
  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    committee_id: row['committee id'] || row.committeeid || row.col0 || '',
    committee_name: row['committee name'] || row.committeename || row.col1 || '',
    committee_type: row['committee type'] || row.type || null,
    candidate_name: row['candidate name'] || row.candidate || null,
    office: row.office || null,
    district: row.district || null,
    party: row.party || null,
    treasurer: row.treasurer || null,
    source_url: `${OH_SOS_BASE}?p=${OH_SOS_COMMITTEE_PAGE}&${new URLSearchParams(params).toString()}`,
  };
}

// ---------------------------------------------------------------------------
// Contribution pull
// ---------------------------------------------------------------------------

export async function fetchContributions(committeeId: string, year?: number): Promise<OhContribution[]> {
  const params: Record<string, string> = { P75_COMMITTEE_ID: committeeId };
  if (year) params.P75_FILING_YEAR = String(year);
  const html = await ohSosFetch(OH_SOS_CONTRIB_PAGE, params);
  const rows = extractApexRows(html);
  return rows.map(r => ({
    contributor_name: r['contributor name'] || r.contributor || r.col0 || '',
    contributor_type: classifyContributorType(r['contributor type'] || r.type || r.col1 || ''),
    contributor_address: r.address || null,
    contributor_employer: r.employer || null,
    contributor_occupation: r.occupation || null,
    amount: parseMoney(r.amount || r.contribution || r.col2 || '0'),
    date: r.date || null,
    filing_id: r['filing id'] || r.filing || null,
  }));
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export function aggregateContributions(
  contributions: OhContribution[],
): Pick<OhFinanceResult, 'total_funds' | 'total_contribution_count' | 'top5_donors' | 'contribution_breakdown' | 'aipac_funding' | 'israel_lobby_total' | 'israel_lobby_breakdown'> {
  let aipac = 0;
  let otherPACs = 0;
  let individuals = 0;
  let corporate = 0;
  let israelLobbyTotal = 0;
  let israelLobbyPacs = 0;

  const byDonor: Record<string, { name: string; amount: number; type: string; is_israel_lobby: boolean }> = {};

  for (const c of contributions) {
    const isIsrael = classifyIsraelLobby(c.contributor_name);
    const key = c.contributor_name.trim().toUpperCase();
    if (!byDonor[key]) byDonor[key] = { name: c.contributor_name.trim(), amount: 0, type: c.contributor_type, is_israel_lobby: isIsrael };
    byDonor[key].amount += c.amount;

    if (isIsrael) {
      israelLobbyTotal += c.amount;
      if (c.contributor_type === 'PAC') israelLobbyPacs += c.amount;
      if (/AIPAC|AMERICAN ISRAEL/i.test(c.contributor_name)) aipac += c.amount;
    }

    if (c.contributor_type === 'PAC') otherPACs += c.amount;
    else if (c.contributor_type === 'Individual') individuals += c.amount;
    else if (c.contributor_type === 'Corporate') corporate += c.amount;
  }

  const top5_donors = Object.values(byDonor)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const total_funds = individuals + otherPACs + corporate;

  return {
    total_funds,
    total_contribution_count: contributions.length,
    top5_donors,
    contribution_breakdown: {
      aipac,
      otherPACs: Math.max(0, otherPACs - aipac),
      individuals,
      corporate,
    },
    aipac_funding: aipac,
    israel_lobby_total: israelLobbyTotal,
    israel_lobby_breakdown: {
      total: israelLobbyTotal,
      pacs: israelLobbyPacs,
      ie: 0,
      bundlers: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Donor forensic signals (v5 scorer)
// ---------------------------------------------------------------------------

/** FEC/state itemization threshold — employer/occupation required above this. */
const ITEMIZATION_THRESHOLD = 200;

/**
 * Compute content-neutral donor-pattern forensic signals over itemized
 * contributions. Feeds the donorForensicsScore corruption factor.
 *
 * All ratios returned in [0, 1]. The donationStdDev is the coefficient of
 * variation (std_dev / mean), unitless and comparable across campaigns.
 */
export function computeDonorForensics(
  contributions: ReadonlyArray<OhContribution>,
  politicianState: string | null = 'OH',
): DonorForensics {
  const itemized = contributions.filter(c => c.amount >= ITEMIZATION_THRESHOLD);
  const itemizedCount = itemized.length;

  if (itemizedCount === 0) {
    return {
      missingEmployerRatio: 0,
      outOfStatePct: 0,
      householdBundling: 0,
      donationStdDev: 0,
      platformOpacity: 0,
      itemizedCount: 0,
      computedAt: new Date().toISOString(),
    };
  }

  // 1. Missing employer ratio
  const EMPLOYER_MISSING_RE = /^(information requested|requested|n\/?a|none|unknown|\s*)$/i;
  const missingEmployer = itemized.filter(c => {
    const e = (c.contributor_employer ?? '').trim();
    return e === '' || EMPLOYER_MISSING_RE.test(e);
  }).length;
  const missingEmployerRatio = missingEmployer / itemizedCount;

  // 2. Out-of-state (best-effort — address field format varies, scan for state suffix)
  const stateRe = politicianState ? new RegExp(`\\b${politicianState}\\b|,\\s*${politicianState}\\s+\\d{5}`, 'i') : null;
  const outOfState = itemized.filter(c => {
    const addr = (c.contributor_address ?? '').trim();
    if (!addr) return false;
    return stateRe ? !stateRe.test(addr) : false;
  }).length;
  const outOfStatePct = outOfState / itemizedCount;

  // 3. Household bundling — donors at/near max ($3,500 individual limit)
  // sharing an address. Normalize addresses for comparison.
  const MAX_CONTRIBUTION = 3500;
  const normalize = (addr: string): string => addr.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  const maxGivers = itemized.filter(c => c.amount >= MAX_CONTRIBUTION * 0.9);
  const addrCounts: Record<string, number> = {};
  for (const c of maxGivers) {
    const a = (c.contributor_address ?? '').trim();
    if (!a) continue;
    const n = normalize(a);
    addrCounts[n] = (addrCounts[n] ?? 0) + 1;
  }
  const bundled = Object.values(addrCounts).filter(n => n >= 2).reduce((sum, n) => sum + n, 0);
  const householdBundling = itemizedCount > 0 ? bundled / itemizedCount : 0;

  // 4. Coefficient of variation of donation amounts (std_dev / mean)
  // Low CV = uniform amounts = potential laundering signal. Real grassroots
  // has a heavy tail and CV > 1 is normal.
  const amounts = itemized.map(c => c.amount);
  const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
  const variance = amounts.reduce((s, a) => s + (a - mean) ** 2, 0) / amounts.length;
  const stdDev = Math.sqrt(variance);
  const donationStdDev = mean > 0 ? stdDev / mean : 0;

  // 5. Platform opacity — the OH SOS feed doesn't distinguish platform vs.
  // direct-committee, so this stays 0 until platform classification is added
  // via a donor-name heuristic (ActBlue, WinRed, Anedot) or FEC filer-type.
  const PLATFORM_NAMES = /\b(ACTBLUE|WINRED|ANEDOT)\b/i;
  const platformDollars = contributions
    .filter(c => PLATFORM_NAMES.test(c.contributor_name))
    .reduce((s, c) => s + c.amount, 0);
  const totalDollars = contributions.reduce((s, c) => s + c.amount, 0);
  const platformOpacity = totalDollars > 0 ? platformDollars / totalDollars : 0;

  return {
    missingEmployerRatio,
    outOfStatePct,
    householdBundling,
    donationStdDev,
    platformOpacity,
    itemizedCount,
    computedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Orchestration — usable as a library too
// ---------------------------------------------------------------------------

export async function pullOhFinance(opts: {
  candidate?: string;
  committeeId?: string;
  committeeName?: string;
  bioguideId?: string;
  year?: number;
  politicianState?: string;
}): Promise<OhFinanceResult> {
  const committee = await findCommittee({
    id: opts.committeeId,
    name: opts.committeeName,
    candidate: opts.candidate,
  });
  if (!committee) throw new Error(`No committee found for ${JSON.stringify(opts)}`);

  const contribs = await fetchContributions(committee.committee_id, opts.year);
  const agg = aggregateContributions(contribs);
  const donor_forensics = contribs.length > 0
    ? computeDonorForensics(contribs, opts.politicianState ?? 'OH')
    : undefined;

  return {
    bioguide_id: opts.bioguideId ?? null,
    candidate_name: opts.candidate ?? committee.candidate_name ?? committee.committee_name,
    committee,
    ...agg,
    donor_forensics,
    data_source: 'oh_sos_cfdisclosure',
    scraped_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function argFlag(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const candidate = argFlag(argv, '--candidate');
  const committeeId = argFlag(argv, '--committee-id');
  const committeeName = argFlag(argv, '--committee-name');
  const bioguideId = argFlag(argv, '--bioguide-id');
  const outputPath = argFlag(argv, '--output');
  const yearArg = argFlag(argv, '--year');
  const year = yearArg ? Number(yearArg) : undefined;

  if (!candidate && !committeeId && !committeeName) {
    console.error('ERROR: one of --candidate, --committee-id, --committee-name required');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('  OH SOS Campaign Finance Sync');
  console.log('='.repeat(60));
  console.log(`  candidate:      ${candidate ?? '(none)'}`);
  console.log(`  committee_id:   ${committeeId ?? '(lookup)'}`);
  console.log(`  committee_name: ${committeeName ?? '(lookup)'}`);
  console.log(`  bioguide_id:    ${bioguideId ?? '(skip DB write)'}`);
  if (dryRun) console.log('  [DRY RUN — no DB write]');
  console.log('');

  let result: OhFinanceResult;
  try {
    result = await pullOhFinance({ candidate, committeeId, committeeName, bioguideId, year });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'OH_SOS_MAINTENANCE') {
      console.error('OH SOS CFDISCLOSURE portal is under maintenance; cannot scrape live data.');
      console.error('Callers should fall back to a cached/reported snapshot.');
      process.exit(MAINTENANCE_EXIT_CODE);
    }
    console.error(`Scraper error: ${msg}`);
    process.exit(1);
  }

  console.log(`Committee: ${result.committee.committee_name} (${result.committee.committee_id})`);
  console.log(`Total funds:       $${result.total_funds.toLocaleString()}`);
  console.log(`Contribution rows: ${result.total_contribution_count}`);
  console.log(`Top donors:`);
  for (const d of result.top5_donors) {
    console.log(`  - ${d.name} (${d.type}) $${d.amount.toLocaleString()}${d.is_israel_lobby ? ' [ISRAEL LOBBY]' : ''}`);
  }
  console.log(`AIPAC: $${result.aipac_funding.toLocaleString()} | Israel lobby: $${result.israel_lobby_total.toLocaleString()}`);

  if (outputPath) {
    fs.writeFileSync(path.resolve(outputPath), JSON.stringify(result, null, 2));
    console.log(`Wrote ${outputPath}`);
  }

  if (bioguideId && !dryRun) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for DB write');
      process.exit(1);
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { error } = await supabase.from('politicians').update({
      total_funds: result.total_funds,
      top5_donors: result.top5_donors,
      contribution_breakdown: result.contribution_breakdown,
      aipac_funding: result.aipac_funding,
      israel_lobby_total: result.israel_lobby_total,
      israel_lobby_breakdown: result.israel_lobby_breakdown,
      data_source: result.data_source,
      updated_at: new Date().toISOString(),
    }).eq('bioguide_id', bioguideId);
    if (error) {
      console.error(`DB update failed: ${error.message}`);
      process.exit(1);
    }
    console.log(`Wrote to politicians.${bioguideId}`);
  }
}

// Only run main when executed directly, not when imported as a module
if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

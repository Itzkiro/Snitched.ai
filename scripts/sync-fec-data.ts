#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Sync FEC Campaign Finance Data to Supabase
 *
 * Pulls real FEC (Federal Election Commission) data for all federal politicians
 * in the Supabase database and updates their records with:
 *   - total_funds (total raised)
 *   - top5_donors (top 5 donors by amount)
 *   - aipac_funding (AIPAC-specific contributions)
 *   - israel_lobby_total (all Israel lobby contributions)
 *   - israel_lobby_breakdown (JSONB breakdown)
 *   - data_source (set to 'fec_api')
 *
 * Usage:
 *   npx tsx scripts/sync-fec-data.ts
 *   npx tsx scripts/sync-fec-data.ts --dry-run      # Preview without updating DB
 *   npx tsx scripts/sync-fec-data.ts --limit 5       # Process only N politicians
 *   npx tsx scripts/sync-fec-data.ts --cycle 2024    # Specific election cycle
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const FEC_API_KEY = process.env.FEC_API_KEY || '';
const FEC_BASE_URL = 'https://api.open.fec.gov/v1';
const RATE_LIMIT_MS = 600; // ms between requests to stay under FEC limits

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!FEC_API_KEY) {
  console.error('ERROR: FEC_API_KEY environment variable is required');
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required');
  process.exit(1);
}

// Federal office levels we care about
const FEDERAL_OFFICES = ['US Senator', 'US Representative'];

// Known Israel lobby PAC committee IDs
const ISRAEL_LOBBY_COMMITTEE_IDS: Record<string, string> = {
  'C00104414': 'AIPAC (American Israel Public Affairs Committee)',
  'C00803833': 'United Democracy Project (AIPAC Super PAC)',
  'C00776997': 'Democratic Majority for Israel PAC',
  'C00765578': 'Pro-Israel America PAC',
  'C00030718': 'NORPAC',
  'C00236489': 'J Street PAC',
  'C00368522': 'Joint Action Committee for Political Affairs (JACPAC)',
  'C00095067': 'Washington PAC',
  'C00386532': 'Americans for a Secure Israel',
};

const ISRAEL_LOBBY_NAME_PATTERNS = [
  'AIPAC',
  'AMERICAN ISRAEL PUBLIC AFFAIRS',
  'UNITED DEMOCRACY PROJECT',
  'DEMOCRATIC MAJORITY FOR ISRAEL',
  'PRO-ISRAEL AMERICA',
  'NORPAC',
  'J STREET',
  'JSTREET',
  'JOINT ACTION COMMITTEE FOR POLITICAL',
  'WASHINGTON PAC',
  'ISRAEL BONDS',
  'FRIENDS OF ISRAEL',
  'ISRAEL ALLIES',
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SupabasePolitician {
  bioguide_id: string;
  name: string;
  office: string;
  office_level: string;
  party: string;
  source_ids: {
    fec_candidate_id?: string;
    bioguide_id?: string;
    [key: string]: string | undefined;
  } | null;
}

interface DonorSummary {
  name: string;
  amount: number;
  type: string;
  is_israel_lobby: boolean;
}

interface SyncResult {
  bioguide_id: string;
  name: string;
  fec_candidate_id: string;
  total_raised: number;
  total_disbursed: number;
  aipac_funding: number;
  israel_lobby_total: number;
  top5_donors: DonorSummary[];
  israel_lobby_breakdown: {
    total: number;
    pacs: number;
    ie: number;
    bundlers: number;
  };
  contribution_count: number;
  updated: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isIsraelLobbyDonor(donorName: string, committeeId?: string): boolean {
  if (committeeId && ISRAEL_LOBBY_COMMITTEE_IDS[committeeId]) {
    return true;
  }
  const upper = (donorName || '').toUpperCase();
  return ISRAEL_LOBBY_NAME_PATTERNS.some(pattern => upper.includes(pattern));
}

function isAipacDonor(donorName: string, committeeId?: string): boolean {
  if (committeeId === 'C00104414' || committeeId === 'C00803833') return true;
  const upper = (donorName || '').toUpperCase();
  return upper.includes('AIPAC') ||
         upper.includes('AMERICAN ISRAEL PUBLIC AFFAIRS') ||
         upper.includes('UNITED DEMOCRACY PROJECT');
}

function classifyDonorType(entityType: string, donorName: string, isIsrael: boolean): string {
  if (isIsrael) return 'Israel-PAC';
  if (entityType === 'IND') return 'Individual';
  if (entityType === 'ORG') return 'Corporate';
  if (['COM', 'PAC', 'CCM', 'PTY'].includes(entityType)) return 'PAC';
  const nameLower = donorName.toLowerCase();
  if (nameLower.includes('pac') || nameLower.includes('committee')) return 'PAC';
  return 'Individual';
}

// ---------------------------------------------------------------------------
// FEC API client (standalone, not using lib/fec-client which has Next.js deps)
// ---------------------------------------------------------------------------

let requestCount = 0;

async function fecGet(endpoint: string, params: Record<string, string | number> = {}): Promise<any> {
  const url = new URL(`${FEC_BASE_URL}${endpoint}`);
  url.searchParams.set('api_key', FEC_API_KEY);
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null && val !== '') {
      url.searchParams.set(key, String(val));
    }
  }

  requestCount++;
  const response = await fetch(url.toString(), {
    headers: { 'Accept': 'application/json' },
  });

  if (response.status === 429) {
    console.log('    Rate limited by FEC API, waiting 60s...');
    await sleep(60000);
    return fecGet(endpoint, params);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`FEC API ${response.status}: ${response.statusText} ${body}`.trim());
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// FEC data fetchers
// ---------------------------------------------------------------------------

/**
 * Fetch candidate financial totals across cycles.
 * Uses /candidate/{id}/totals/ endpoint.
 */
async function fetchCandidateTotals(
  candidateId: string,
  cycles: number[]
): Promise<{ raised: number; disbursed: number }> {
  let totalRaised = 0;
  let totalDisbursed = 0;

  for (const cycle of cycles) {
    try {
      const data = await fecGet(`/candidate/${candidateId}/totals/`, {
        cycle,
        per_page: 100,
      });

      for (const result of data.results || []) {
        totalRaised += Number(result.receipts || 0);
        totalDisbursed += Number(result.disbursements || 0);
      }
    } catch (e: any) {
      console.log(`      Warning: Could not fetch totals for cycle ${cycle}: ${e.message}`);
    }
    await sleep(RATE_LIMIT_MS);
  }

  return { raised: totalRaised, disbursed: totalDisbursed };
}

/**
 * Fetch principal campaign committee(s) for a candidate.
 */
async function fetchCandidateCommittees(candidateId: string, cycle: number): Promise<string[]> {
  try {
    const data = await fecGet(`/candidate/${candidateId}/committees/`, {
      cycle,
      per_page: 10,
      designation: 'P', // Principal campaign committee
    });
    const ids = (data.results || [])
      .map((r: any) => r.committee_id)
      .filter(Boolean);

    // If no principal committees, try without the designation filter
    if (ids.length === 0) {
      const allData = await fecGet(`/candidate/${candidateId}/committees/`, {
        cycle,
        per_page: 10,
      });
      await sleep(RATE_LIMIT_MS);
      return (allData.results || [])
        .map((r: any) => r.committee_id)
        .filter(Boolean);
    }

    return ids;
  } catch (e: any) {
    console.log(`      Warning: Could not fetch committees: ${e.message}`);
    return [];
  }
}

/**
 * Fetch Schedule A contributions for a committee.
 * Returns individual contributions sorted by amount descending.
 */
async function fetchTopContributions(
  committeeId: string,
  cycle: number,
  limit: number = 100
): Promise<Array<{
  donor_name: string;
  amount: number;
  entity_type: string;
  contributor_id: string;
  date: string;
}>> {
  const contributions: Array<{
    donor_name: string;
    amount: number;
    entity_type: string;
    contributor_id: string;
    date: string;
  }> = [];

  try {
    const data = await fecGet('/schedules/schedule_a/', {
      committee_id: committeeId,
      two_year_transaction_period: cycle,
      sort: '-contribution_receipt_amount',
      per_page: Math.min(limit, 100),
    });

    for (const c of data.results || []) {
      contributions.push({
        donor_name: c.contributor_name || 'UNKNOWN',
        amount: Number(c.contribution_receipt_amount || 0),
        entity_type: c.entity_type || '',
        contributor_id: c.contributor_id || '',
        date: c.contribution_receipt_date || '',
      });
    }
  } catch (e: any) {
    console.log(`      Warning: Could not fetch contributions for ${committeeId}: ${e.message}`);
  }

  return contributions;
}

/**
 * Fetch independent expenditures for/against a candidate.
 * This is where big AIPAC Super PAC spending shows up.
 */
async function fetchIndependentExpenditures(
  candidateId: string,
  cycle: number
): Promise<Array<{
  committee_name: string;
  committee_id: string;
  amount: number;
  support_oppose: string;
  is_israel_lobby: boolean;
}>> {
  try {
    const data = await fecGet('/schedules/schedule_e/', {
      candidate_id: candidateId,
      cycle,
      per_page: 100,
      sort: '-expenditure_amount',
    });

    // Aggregate by committee
    const byCommittee: Record<string, {
      name: string;
      total: number;
      support_oppose: string;
      is_israel_lobby: boolean;
    }> = {};

    for (const exp of data.results || []) {
      const cid = exp.committee_id || '';
      const cname = exp.committee?.name || exp.payee_name || 'UNKNOWN';
      if (!byCommittee[cid]) {
        byCommittee[cid] = {
          name: cname,
          total: 0,
          support_oppose: exp.support_oppose_indicator === 'S' ? 'support' : 'oppose',
          is_israel_lobby: isIsraelLobbyDonor(cname, cid),
        };
      }
      byCommittee[cid].total += Number(exp.expenditure_amount || 0);
    }

    return Object.entries(byCommittee)
      .map(([cid, info]) => ({
        committee_name: info.name,
        committee_id: cid,
        amount: Math.round(info.total * 100) / 100,
        support_oppose: info.support_oppose,
        is_israel_lobby: info.is_israel_lobby,
      }))
      .sort((a, b) => b.amount - a.amount);
  } catch (e: any) {
    console.log(`      Warning: Could not fetch IEs for ${candidateId}: ${e.message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Process a single politician
// ---------------------------------------------------------------------------

async function processPolitician(
  politician: SupabasePolitician,
  cycles: number[],
  supabase: SupabaseClient,
  dryRun: boolean
): Promise<SyncResult> {
  const fecId = politician.source_ids?.fec_candidate_id;
  const result: SyncResult = {
    bioguide_id: politician.bioguide_id,
    name: politician.name,
    fec_candidate_id: fecId || '',
    total_raised: 0,
    total_disbursed: 0,
    aipac_funding: 0,
    israel_lobby_total: 0,
    top5_donors: [],
    israel_lobby_breakdown: { total: 0, pacs: 0, ie: 0, bundlers: 0 },
    contribution_count: 0,
    updated: false,
    error: null,
  };

  if (!fecId) {
    // No FEC ID -- try to look up by name and state
    console.log(`    No FEC candidate ID, attempting name lookup...`);
    const foundId = await lookupFecCandidateId(politician);
    if (foundId) {
      console.log(`    Found FEC ID via name lookup: ${foundId}`);
      result.fec_candidate_id = foundId;
      // Update source_ids in Supabase with the discovered FEC ID
      if (!dryRun) {
        const existingSourceIds = politician.source_ids || {};
        await supabase
          .from('politicians')
          .update({
            source_ids: { ...existingSourceIds, fec_candidate_id: foundId },
          })
          .eq('bioguide_id', politician.bioguide_id);
      }
    } else {
      result.error = 'No FEC candidate ID found';
      return result;
    }
  }

  const candidateId = result.fec_candidate_id;

  try {
    // 1. Fetch financial totals
    console.log(`    Fetching totals...`);
    const totals = await fetchCandidateTotals(candidateId, cycles);
    result.total_raised = Math.round(totals.raised * 100) / 100;
    result.total_disbursed = Math.round(totals.disbursed * 100) / 100;

    // 2. Fetch committees and contributions
    const latestCycle = cycles[0];
    console.log(`    Fetching committees for cycle ${latestCycle}...`);
    const committees = await fetchCandidateCommittees(candidateId, latestCycle);
    await sleep(RATE_LIMIT_MS);

    console.log(`    Found ${committees.length} committee(s)`);

    // Fetch contributions from up to 3 committees
    let allContributions: Array<{
      donor_name: string;
      amount: number;
      entity_type: string;
      contributor_id: string;
      date: string;
    }> = [];

    for (const committeeId of committees.slice(0, 3)) {
      const contribs = await fetchTopContributions(committeeId, latestCycle, 100);
      allContributions = allContributions.concat(contribs);
      await sleep(RATE_LIMIT_MS);
    }

    result.contribution_count = allContributions.length;

    // 3. Analyze contributions
    let israelLobbyPacTotal = 0;
    let aipacDirect = 0;
    const donorAggregation: Record<string, {
      amount: number;
      type: string;
      is_israel_lobby: boolean;
      count: number;
    }> = {};

    for (const c of allContributions) {
      const isIsrael = isIsraelLobbyDonor(c.donor_name, c.contributor_id);
      const isAipac = isAipacDonor(c.donor_name, c.contributor_id);
      const donorType = classifyDonorType(c.entity_type, c.donor_name, isIsrael);

      if (isIsrael) israelLobbyPacTotal += c.amount;
      if (isAipac) aipacDirect += c.amount;

      // Aggregate by donor name
      const key = c.donor_name;
      if (!donorAggregation[key]) {
        donorAggregation[key] = { amount: 0, type: donorType, is_israel_lobby: isIsrael, count: 0 };
      }
      donorAggregation[key].amount += c.amount;
      donorAggregation[key].count++;
    }

    // Build top 5 donors
    const sortedDonors = Object.entries(donorAggregation)
      .map(([name, data]) => ({
        name,
        amount: Math.round(data.amount * 100) / 100,
        type: data.type,
        is_israel_lobby: data.is_israel_lobby,
      }))
      .sort((a, b) => b.amount - a.amount);

    result.top5_donors = sortedDonors.slice(0, 5);

    // 4. Fetch independent expenditures (AIPAC Super PAC money)
    console.log(`    Fetching independent expenditures...`);
    let israelLobbyIeTotal = 0;
    let aipacIe = 0;

    for (const cycle of cycles) {
      const ies = await fetchIndependentExpenditures(candidateId, cycle);
      for (const ie of ies) {
        if (ie.is_israel_lobby && ie.support_oppose === 'support') {
          israelLobbyIeTotal += ie.amount;
          if (isAipacDonor(ie.committee_name, ie.committee_id)) {
            aipacIe += ie.amount;
          }
        }
      }
      await sleep(RATE_LIMIT_MS);
    }

    // 5. Calculate final totals
    result.aipac_funding = Math.round((aipacDirect + aipacIe) * 100) / 100;
    result.israel_lobby_total = Math.round((israelLobbyPacTotal + israelLobbyIeTotal) * 100) / 100;
    result.israel_lobby_breakdown = {
      total: result.israel_lobby_total,
      pacs: Math.round(israelLobbyPacTotal * 100) / 100,
      ie: Math.round(israelLobbyIeTotal * 100) / 100,
      bundlers: 0,
    };

    // 6. Update Supabase
    // Note: total_funds, aipac_funding, israel_lobby_total are bigint columns
    // so we must round to whole numbers (no decimals allowed).
    if (!dryRun) {
      console.log(`    Updating Supabase...`);
      const { error: updateError } = await supabase
        .from('politicians')
        .update({
          total_funds: Math.round(result.total_raised),
          top5_donors: result.top5_donors.map(d => ({
            name: d.name,
            amount: Math.round(d.amount),
            type: d.type,
          })),
          aipac_funding: Math.round(result.aipac_funding),
          israel_lobby_total: Math.round(result.israel_lobby_total),
          israel_lobby_breakdown: {
            total: Math.round(result.israel_lobby_breakdown.total),
            pacs: Math.round(result.israel_lobby_breakdown.pacs),
            ie: Math.round(result.israel_lobby_breakdown.ie),
            bundlers: 0,
          },
          data_source: 'fec_api',
          updated_at: new Date().toISOString(),
        })
        .eq('bioguide_id', politician.bioguide_id);

      if (updateError) {
        result.error = `DB update failed: ${updateError.message}`;
        console.log(`    ERROR: ${result.error}`);
      } else {
        result.updated = true;
      }
    } else {
      result.updated = false;
      console.log(`    [DRY RUN] Would update DB with above data`);
    }

    console.log(
      `    Result: $${result.total_raised.toLocaleString()} raised, ` +
      `$${result.israel_lobby_total.toLocaleString()} Israel lobby, ` +
      `$${result.aipac_funding.toLocaleString()} AIPAC, ` +
      `${result.contribution_count} contributions`
    );

  } catch (e: any) {
    result.error = e.message;
    console.log(`    ERROR: ${e.message}`);
  }

  return result;
}

// ---------------------------------------------------------------------------
// FEC candidate ID lookup by name
// ---------------------------------------------------------------------------

async function lookupFecCandidateId(politician: SupabasePolitician): Promise<string | null> {
  try {
    // Determine office code
    let officeCode = 'H'; // default House
    if (politician.office_level === 'US Senator' || politician.office?.toLowerCase().includes('senator')) {
      officeCode = 'S';
    }

    // Search by name - FEC wants last name for best results
    const nameParts = politician.name.split(' ');
    const lastName = nameParts[nameParts.length - 1];

    const data = await fecGet('/candidates/search/', {
      name: politician.name,
      state: 'FL',
      office: officeCode,
      sort: '-election_years',
      per_page: 5,
    });

    await sleep(RATE_LIMIT_MS);

    const candidates = data.results || [];
    if (candidates.length === 0) {
      // Try with just last name
      const data2 = await fecGet('/candidates/search/', {
        name: lastName,
        state: 'FL',
        office: officeCode,
        sort: '-election_years',
        per_page: 10,
      });
      await sleep(RATE_LIMIT_MS);

      const candidates2 = data2.results || [];
      // Look for a reasonable match
      for (const c of candidates2) {
        const fecName = (c.name || '').toUpperCase();
        if (fecName.includes(lastName.toUpperCase())) {
          return c.candidate_id;
        }
      }
      return null;
    }

    // Return the first (most recent) match
    return candidates[0].candidate_id || null;
  } catch (e: any) {
    console.log(`      Name lookup error: ${e.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitIdx = args.indexOf('--limit');
  const cycleIdx = args.indexOf('--cycle');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : Infinity;
  const cycles = cycleIdx >= 0
    ? [parseInt(args[cycleIdx + 1])]
    : [2026, 2024, 2022]; // Most recent cycles (2026 needed for new members)

  console.log('='.repeat(70));
  console.log('  Snitched.ai - FEC Campaign Finance Data Sync');
  console.log('='.repeat(70));
  console.log(`  Mode:     ${dryRun ? 'DRY RUN (no DB updates)' : 'LIVE (will update Supabase)'}`);
  console.log(`  Cycles:   ${cycles.join(', ')}`);
  console.log(`  Limit:    ${limit === Infinity ? 'All federal politicians' : limit}`);
  console.log(`  FEC Key:  ${FEC_API_KEY.slice(0, 8)}...`);
  console.log(`  Supabase: ${SUPABASE_URL}`);
  console.log('');

  // Initialize Supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Step 1: Query federal politicians from Supabase
  console.log('Step 1: Fetching federal politicians from Supabase...');
  const { data: politicians, error: fetchError } = await supabase
    .from('politicians')
    .select('bioguide_id, name, office, office_level, party, source_ids')
    .in('office_level', FEDERAL_OFFICES);

  if (fetchError) {
    console.error(`Failed to fetch politicians: ${fetchError.message}`);
    process.exit(1);
  }

  if (!politicians || politicians.length === 0) {
    console.log('No federal politicians found in database.');
    process.exit(0);
  }

  console.log(`  Found ${politicians.length} federal politicians`);

  // Separate those with and without FEC IDs
  const withFecId = politicians.filter(p => p.source_ids?.fec_candidate_id);
  const withoutFecId = politicians.filter(p => !p.source_ids?.fec_candidate_id);

  console.log(`  With FEC candidate ID:    ${withFecId.length}`);
  console.log(`  Without FEC candidate ID: ${withoutFecId.length}`);
  console.log('');

  // Process those with FEC IDs first, then try name lookups
  const toProcess = [
    ...withFecId,
    ...withoutFecId,
  ].slice(0, limit) as SupabasePolitician[];

  console.log(`Step 2: Processing ${toProcess.length} politicians...`);
  console.log('-'.repeat(70));

  const results: SyncResult[] = [];
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  const startTime = Date.now();

  for (let i = 0; i < toProcess.length; i++) {
    const pol = toProcess[i];
    console.log(`\n[${i + 1}/${toProcess.length}] ${pol.name} (${pol.office_level}, ${pol.party})`);
    console.log(`    FEC ID: ${pol.source_ids?.fec_candidate_id || 'NONE'}`);

    const result = await processPolitician(pol, cycles, supabase, dryRun);
    results.push(result);

    if (result.error) {
      if (result.error === 'No FEC candidate ID found') {
        skippedCount++;
      } else {
        errorCount++;
      }
    } else if (result.updated || dryRun) {
      successCount++;
    }

    // Small delay between politicians
    if (i < toProcess.length - 1) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  // Step 3: Print summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n' + '='.repeat(70));
  console.log('  SYNC SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Total processed:  ${toProcess.length}`);
  console.log(`  Successful:       ${successCount}`);
  console.log(`  Errors:           ${errorCount}`);
  console.log(`  Skipped (no ID):  ${skippedCount}`);
  console.log(`  API requests:     ${requestCount}`);
  console.log(`  Duration:         ${elapsed}s`);
  console.log(`  Mode:             ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  // Top fundraisers
  const sortedByFunds = results
    .filter(r => r.total_raised > 0)
    .sort((a, b) => b.total_raised - a.total_raised);

  if (sortedByFunds.length > 0) {
    console.log('\n  Top 10 Fundraisers:');
    for (const r of sortedByFunds.slice(0, 10)) {
      console.log(
        `    ${r.name.padEnd(30)} $${r.total_raised.toLocaleString().padStart(15)} raised` +
        (r.israel_lobby_total > 0 ? `  ($${r.israel_lobby_total.toLocaleString()} Israel lobby)` : '')
      );
    }
  }

  // Israel lobby recipients
  const israelRecipients = results
    .filter(r => r.israel_lobby_total > 0)
    .sort((a, b) => b.israel_lobby_total - a.israel_lobby_total);

  if (israelRecipients.length > 0) {
    console.log('\n  Israel Lobby Recipients:');
    for (const r of israelRecipients) {
      console.log(
        `    ${r.name.padEnd(30)} $${r.israel_lobby_total.toLocaleString().padStart(12)} total` +
        `  (PAC: $${r.israel_lobby_breakdown.pacs.toLocaleString()}, IE: $${r.israel_lobby_breakdown.ie.toLocaleString()})`
      );
    }
  }

  // Errors
  const errored = results.filter(r => r.error && r.error !== 'No FEC candidate ID found');
  if (errored.length > 0) {
    console.log('\n  Errors:');
    for (const r of errored) {
      console.log(`    ${r.name}: ${r.error}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`  Done. ${dryRun ? 'This was a DRY RUN -- no data was written.' : 'Supabase has been updated.'}`);
  console.log('='.repeat(70));
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});

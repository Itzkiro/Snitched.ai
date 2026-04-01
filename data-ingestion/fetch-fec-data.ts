#!/usr/bin/env npx tsx
/**
 * FEC Data Ingestion Script for Snitched.ai
 *
 * Fetches REAL contribution data from the FEC API (api.open.fec.gov)
 * for all Florida politicians with FEC candidate IDs.
 *
 * Usage:
 *   npx tsx data-ingestion/fetch-fec-data.ts
 *   npx tsx data-ingestion/fetch-fec-data.ts --cycle 2024
 *   npx tsx data-ingestion/fetch-fec-data.ts --limit 5
 *   FEC_API_KEY=your_key npx tsx data-ingestion/fetch-fec-data.ts
 *
 * The FEC API allows DEMO_KEY for basic usage (1000 req/hr).
 * Get a free key at https://api.data.gov/signup/ for higher limits.
 *
 * Output: data-ingestion/fec-contributions.json
 * This file is consumed by lib/real-data.ts to display real funding data.
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const FEC_API_KEY = process.env.FEC_API_KEY;
if (!FEC_API_KEY) {
  console.error('Missing required environment variable: FEC_API_KEY');
  process.exit(1);
}
const FEC_BASE_URL = 'https://api.open.fec.gov/v1';
const RATE_LIMIT_MS = 500; // ms between requests (FEC rate limit: 1000/hr for DEMO_KEY)

// Known Israel lobby PAC committee IDs from FEC
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

// Broader pattern matching for Israel lobby donors (by name)
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

interface RawPolitician {
  politician_id: string;
  name: string;
  office: string;
  office_level: string;
  party: string;
  district: string | null;
  source_ids: {
    bioguide_id: string | null;
    fec_candidate_id: string | null;
    opensecrets_id: string | null;
    govtrack_id: string | null;
    votesmart_id: string | null;
  };
}

interface FECContribution {
  donor_name: string;
  donor_type: 'PAC' | 'Individual' | 'Corporate' | 'Israel-PAC';
  amount: number;
  date: string;
  is_israel_lobby: boolean;
  committee_id: string;
  entity_type: string;
  fec_committee_name?: string;
}

interface PoliticianFECData {
  politician_id: string;
  name: string;
  fec_candidate_id: string;
  office: string;
  party: string;
  has_fec_data: boolean;
  total_raised: number;
  total_disbursed: number;
  // Israel lobby breakdown
  israel_lobby_total: number;
  israel_lobby_pac_total: number;
  israel_lobby_ie_total: number;
  aipac_direct: number;
  aipac_ie: number;
  // Contribution breakdown
  breakdown: {
    pacs: number;
    individuals: number;
    corporate: number;
    israel_lobby: number;
  };
  // Top donors (aggregated)
  top_donors: Array<{
    name: string;
    amount: number;
    type: 'PAC' | 'Individual' | 'Corporate' | 'Israel-PAC';
    count: number;
  }>;
  // Raw contribution count
  contribution_count: number;
  // Top Israel lobby donors
  israel_lobby_donors: Array<{
    name: string;
    amount: number;
    count: number;
    committee_id?: string;
  }>;
  // Independent expenditures supporting this candidate
  independent_expenditures: Array<{
    committee_name: string;
    committee_id: string;
    amount: number;
    support_oppose: string;
    is_israel_lobby: boolean;
  }>;
  // Metadata
  cycles_covered: number[];
  last_fetched: string;
  error: string | null;
}

interface FECOutput {
  metadata: {
    generated_at: string;
    fec_api_key_type: string;
    cycles: number[];
    total_politicians: number;
    with_fec_data: number;
    with_israel_lobby: number;
    total_israel_lobby_funding: number;
  };
  politicians: Record<string, PoliticianFECData>;
}

// ---------------------------------------------------------------------------
// FEC API client
// ---------------------------------------------------------------------------

async function fecGet(endpoint: string, params: Record<string, string | number>): Promise<any> {
  const url = new URL(`${FEC_BASE_URL}${endpoint}`);
  url.searchParams.set('api_key', FEC_API_KEY);
  for (const [key, val] of Object.entries(params)) {
    url.searchParams.set(key, String(val));
  }

  const response = await fetch(url.toString());

  if (response.status === 429) {
    console.log('  Rate limited, waiting 60s...');
    await sleep(60000);
    return fecGet(endpoint, params);
  }

  if (!response.ok) {
    throw new Error(`FEC API error ${response.status}: ${response.statusText} for ${endpoint}`);
  }

  return response.json();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Fetch candidate financial totals
// ---------------------------------------------------------------------------

async function fetchCandidateTotals(candidateId: string, cycles: number[]): Promise<{ raised: number; disbursed: number }> {
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
      console.log(`    Warning: Could not fetch totals for cycle ${cycle}: ${e.message}`);
    }
    await sleep(RATE_LIMIT_MS);
  }

  return { raised: totalRaised, disbursed: totalDisbursed };
}

// ---------------------------------------------------------------------------
// Fetch candidate committees
// ---------------------------------------------------------------------------

async function fetchCandidateCommittees(candidateId: string, cycle: number): Promise<string[]> {
  try {
    const data = await fecGet(`/candidate/${candidateId}/committees/`, {
      cycle,
      per_page: 20,
    });
    return (data.results || [])
      .map((r: any) => r.committee_id)
      .filter(Boolean);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Fetch Schedule A (contributions TO a committee)
// ---------------------------------------------------------------------------

async function fetchContributions(
  committeeId: string,
  cycle: number,
  limit: number = 500
): Promise<FECContribution[]> {
  const contributions: FECContribution[] = [];
  let lastIndex: string | null = null;
  let lastDate: string | null = null;

  while (contributions.length < limit) {
    const params: Record<string, string | number> = {
      two_year_transaction_period: cycle,
      committee_id: committeeId,
      per_page: 100,
      sort: '-contribution_receipt_date',
    };

    // FEC API uses cursor-based pagination for Schedule A
    if (lastIndex) {
      params['last_index'] = lastIndex;
    }
    if (lastDate) {
      params['last_contribution_receipt_date'] = lastDate;
    }

    try {
      const data = await fecGet('/schedules/schedule_a/', params);
      const results = data.results || [];

      if (results.length === 0) break;

      for (const contrib of results) {
        const donorName = contrib.contributor_name || 'UNKNOWN';
        const isIsraelLobby = isIsraelLobbyDonor(donorName, contrib.committee_id);

        contributions.push({
          donor_name: donorName,
          donor_type: classifyDonorType(contrib, isIsraelLobby),
          amount: Number(contrib.contribution_receipt_amount || 0),
          date: contrib.contribution_receipt_date || '',
          is_israel_lobby: isIsraelLobby,
          committee_id: contrib.committee_id || '',
          entity_type: contrib.entity_type || '',
          fec_committee_name: contrib.committee?.name,
        });
      }

      // Cursor pagination
      const pagination = data.pagination || {};
      lastIndex = pagination.last_indexes?.last_index;
      lastDate = pagination.last_indexes?.last_contribution_receipt_date;

      if (!lastIndex || results.length < 100) break;
    } catch (e: any) {
      console.log(`    Warning: Failed to fetch contributions page: ${e.message}`);
      break;
    }

    await sleep(RATE_LIMIT_MS);
  }

  return contributions.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Fetch Schedule E (independent expenditures FOR/AGAINST a candidate)
// ---------------------------------------------------------------------------

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
  const expenditures: Array<{
    committee_name: string;
    committee_id: string;
    amount: number;
    support_oppose: string;
    is_israel_lobby: boolean;
  }> = [];

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
      const committeeId = exp.committee_id || '';
      const committeeName = exp.committee?.name || exp.payee_name || 'UNKNOWN';

      if (!byCommittee[committeeId]) {
        byCommittee[committeeId] = {
          name: committeeName,
          total: 0,
          support_oppose: exp.support_oppose_indicator === 'S' ? 'support' : 'oppose',
          is_israel_lobby: isIsraelLobbyCommittee(committeeId, committeeName),
        };
      }
      byCommittee[committeeId].total += Number(exp.expenditure_amount || 0);
    }

    for (const [cid, info] of Object.entries(byCommittee)) {
      expenditures.push({
        committee_name: info.name,
        committee_id: cid,
        amount: info.total,
        support_oppose: info.support_oppose,
        is_israel_lobby: info.is_israel_lobby,
      });
    }
  } catch (e: any) {
    console.log(`    Warning: Could not fetch IEs for ${candidateId}: ${e.message}`);
  }

  return expenditures.sort((a, b) => b.amount - a.amount);
}

// ---------------------------------------------------------------------------
// Classification helpers
// ---------------------------------------------------------------------------

function isIsraelLobbyDonor(donorName: string, committeeId?: string): boolean {
  // Check committee ID first (most reliable)
  if (committeeId && ISRAEL_LOBBY_COMMITTEE_IDS[committeeId]) {
    return true;
  }
  // Check name patterns
  const upper = donorName.toUpperCase();
  return ISRAEL_LOBBY_NAME_PATTERNS.some(pattern => upper.includes(pattern));
}

function isIsraelLobbyCommittee(committeeId: string, committeeName: string): boolean {
  if (ISRAEL_LOBBY_COMMITTEE_IDS[committeeId]) return true;
  const upper = committeeName.toUpperCase();
  return ISRAEL_LOBBY_NAME_PATTERNS.some(pattern => upper.includes(pattern));
}

function classifyDonorType(contrib: any, isIsraelLobby: boolean): 'PAC' | 'Individual' | 'Corporate' | 'Israel-PAC' {
  if (isIsraelLobby) return 'Israel-PAC';

  const entityType = contrib.entity_type || '';
  const name = (contrib.contributor_name || '').toLowerCase();

  if (entityType === 'PAC' || entityType === 'COM' || name.includes('pac') || name.includes('committee')) {
    return 'PAC';
  }
  if (entityType === 'ORG') return 'Corporate';
  return 'Individual';
}

// ---------------------------------------------------------------------------
// Process a single politician
// ---------------------------------------------------------------------------

async function processPolitician(
  politician: RawPolitician,
  cycles: number[]
): Promise<PoliticianFECData> {
  const fecId = politician.source_ids?.fec_candidate_id;
  const result: PoliticianFECData = {
    politician_id: politician.politician_id,
    name: politician.name,
    fec_candidate_id: fecId || '',
    office: politician.office,
    party: politician.party,
    has_fec_data: false,
    total_raised: 0,
    total_disbursed: 0,
    israel_lobby_total: 0,
    israel_lobby_pac_total: 0,
    israel_lobby_ie_total: 0,
    aipac_direct: 0,
    aipac_ie: 0,
    breakdown: { pacs: 0, individuals: 0, corporate: 0, israel_lobby: 0 },
    top_donors: [],
    contribution_count: 0,
    israel_lobby_donors: [],
    independent_expenditures: [],
    cycles_covered: cycles,
    last_fetched: new Date().toISOString(),
    error: null,
  };

  if (!fecId) {
    return result;
  }

  try {
    console.log(`  Fetching totals for ${politician.name} (${fecId})...`);

    // 1. Get financial totals
    const totals = await fetchCandidateTotals(fecId, cycles);
    result.total_raised = totals.raised;
    result.total_disbursed = totals.disbursed;

    // 2. Get contributions for latest cycle
    const latestCycle = cycles[0];
    const committees = await fetchCandidateCommittees(fecId, latestCycle);
    await sleep(RATE_LIMIT_MS);

    console.log(`    Found ${committees.length} committees`);

    let allContributions: FECContribution[] = [];
    for (const committeeId of committees.slice(0, 3)) {
      const contribs = await fetchContributions(committeeId, latestCycle, 500);
      allContributions = allContributions.concat(contribs);
      await sleep(RATE_LIMIT_MS);
    }

    if (allContributions.length > 0) {
      result.has_fec_data = true;
      result.contribution_count = allContributions.length;

      // Calculate breakdown
      for (const contrib of allContributions) {
        if (contrib.is_israel_lobby) {
          result.breakdown.israel_lobby += contrib.amount;

          // Check if specifically AIPAC
          const isAipac = contrib.donor_name.toUpperCase().includes('AIPAC') ||
                          contrib.donor_name.toUpperCase().includes('AMERICAN ISRAEL PUBLIC AFFAIRS') ||
                          contrib.committee_id === 'C00104414';
          if (isAipac) {
            result.aipac_direct += contrib.amount;
          }
        } else if (contrib.donor_type === 'PAC') {
          result.breakdown.pacs += contrib.amount;
        } else if (contrib.donor_type === 'Corporate') {
          result.breakdown.corporate += contrib.amount;
        } else {
          result.breakdown.individuals += contrib.amount;
        }
      }

      // Aggregate donors by name for top donors list
      const donorTotals: Record<string, { amount: number; type: FECContribution['donor_type']; count: number }> = {};
      for (const contrib of allContributions) {
        const key = contrib.donor_name;
        if (!donorTotals[key]) {
          donorTotals[key] = { amount: 0, type: contrib.donor_type, count: 0 };
        }
        donorTotals[key].amount += contrib.amount;
        donorTotals[key].count++;
      }

      result.top_donors = Object.entries(donorTotals)
        .map(([name, data]) => ({
          name,
          amount: Math.round(data.amount * 100) / 100,
          type: data.type,
          count: data.count,
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 20);

      // Israel lobby donors specifically
      const israelDonorTotals: Record<string, { amount: number; count: number; committee_id?: string }> = {};
      for (const contrib of allContributions) {
        if (contrib.is_israel_lobby) {
          const key = contrib.donor_name;
          if (!israelDonorTotals[key]) {
            israelDonorTotals[key] = { amount: 0, count: 0, committee_id: contrib.committee_id };
          }
          israelDonorTotals[key].amount += contrib.amount;
          israelDonorTotals[key].count++;
        }
      }

      result.israel_lobby_donors = Object.entries(israelDonorTotals)
        .map(([name, data]) => ({
          name,
          amount: Math.round(data.amount * 100) / 100,
          count: data.count,
          committee_id: data.committee_id,
        }))
        .sort((a, b) => b.amount - a.amount);

      result.israel_lobby_pac_total = result.breakdown.israel_lobby;
    }

    // 3. Get independent expenditures (this is where AIPAC's big money shows up)
    console.log(`    Fetching independent expenditures...`);
    for (const cycle of cycles) {
      const ies = await fetchIndependentExpenditures(fecId, cycle);
      result.independent_expenditures = result.independent_expenditures.concat(ies);
      await sleep(RATE_LIMIT_MS);
    }

    // Deduplicate IEs by committee
    const ieByCommittee: Record<string, typeof result.independent_expenditures[0]> = {};
    for (const ie of result.independent_expenditures) {
      if (!ieByCommittee[ie.committee_id]) {
        ieByCommittee[ie.committee_id] = ie;
      } else {
        ieByCommittee[ie.committee_id].amount += ie.amount;
      }
    }
    result.independent_expenditures = Object.values(ieByCommittee).sort((a, b) => b.amount - a.amount);

    // Calculate Israel lobby IE total
    const israelIEs = result.independent_expenditures.filter(ie => ie.is_israel_lobby && ie.support_oppose === 'support');
    result.israel_lobby_ie_total = israelIEs.reduce((sum, ie) => sum + ie.amount, 0);

    // AIPAC IE specifically (United Democracy Project is AIPAC's Super PAC)
    const aipacIEs = result.independent_expenditures.filter(ie =>
      ie.committee_id === 'C00104414' ||
      ie.committee_id === 'C00803833' ||
      ie.committee_name.toUpperCase().includes('AIPAC') ||
      ie.committee_name.toUpperCase().includes('UNITED DEMOCRACY PROJECT')
    );
    result.aipac_ie = aipacIEs.reduce((sum, ie) => sum + ie.amount, 0);

    // Total Israel lobby = PAC contributions + IE support
    result.israel_lobby_total = result.israel_lobby_pac_total + result.israel_lobby_ie_total;

    const aipacTotal = result.aipac_direct + result.aipac_ie;
    console.log(`    ${politician.name}: $${result.total_raised.toLocaleString()} raised, ` +
      `$${result.israel_lobby_total.toLocaleString()} Israel lobby, ` +
      `$${aipacTotal.toLocaleString()} AIPAC (${result.contribution_count} contributions)`);

  } catch (e: any) {
    console.error(`    ERROR processing ${politician.name}: ${e.message}`);
    result.error = e.message;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const cycleFlag = args.indexOf('--cycle');
  const limitFlag = args.indexOf('--limit');
  const cycles = cycleFlag >= 0 ? [parseInt(args[cycleFlag + 1])] : [2024, 2022];
  const limit = limitFlag >= 0 ? parseInt(args[limitFlag + 1]) : Infinity;

  console.log('='.repeat(60));
  console.log('Snitched.ai FEC Data Ingestion');
  console.log('='.repeat(60));
  console.log(`API Key: [set]`);
  console.log(`Cycles: ${cycles.join(', ')}`);
  console.log(`Limit: ${limit === Infinity ? 'All' : limit}`);
  console.log('');

  // Load politicians
  const politiciansPath = path.join(__dirname, 'phase1/processed/florida_politicians.json');
  console.log(`Loading politicians from ${politiciansPath}`);

  const rawData = fs.readFileSync(politiciansPath, 'utf-8');
  const allPoliticians: RawPolitician[] = JSON.parse(rawData);

  // Filter to those with FEC IDs (federal officials)
  const withFecId = allPoliticians.filter(p => p.source_ids?.fec_candidate_id);
  const toProcess = withFecId.slice(0, limit);

  console.log(`Total politicians: ${allPoliticians.length}`);
  console.log(`With FEC candidate ID: ${withFecId.length}`);
  console.log(`Will process: ${toProcess.length}`);
  console.log('');

  // Process each politician
  const results: Record<string, PoliticianFECData> = {};
  let processed = 0;
  let withData = 0;
  let withIsraelLobby = 0;

  // Also load existing results to preserve data for politicians we don't re-fetch
  const outputPath = path.join(__dirname, 'fec-contributions.json');
  let existingData: FECOutput | null = null;
  try {
    if (fs.existsSync(outputPath)) {
      existingData = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      console.log(`Loaded existing data with ${Object.keys(existingData!.politicians).length} politicians`);
    }
  } catch {
    // No existing data
  }

  // Also include state politicians with no FEC data (for completeness)
  for (const pol of allPoliticians) {
    if (!pol.source_ids?.fec_candidate_id) {
      results[pol.politician_id] = {
        politician_id: pol.politician_id,
        name: pol.name,
        fec_candidate_id: '',
        office: pol.office,
        party: pol.party,
        has_fec_data: false,
        total_raised: 0,
        total_disbursed: 0,
        israel_lobby_total: 0,
        israel_lobby_pac_total: 0,
        israel_lobby_ie_total: 0,
        aipac_direct: 0,
        aipac_ie: 0,
        breakdown: { pacs: 0, individuals: 0, corporate: 0, israel_lobby: 0 },
        top_donors: [],
        contribution_count: 0,
        israel_lobby_donors: [],
        independent_expenditures: [],
        cycles_covered: cycles,
        last_fetched: new Date().toISOString(),
        error: null,
      };
    }
  }

  for (const politician of toProcess) {
    processed++;
    console.log(`\n[${processed}/${toProcess.length}] Processing ${politician.name}...`);

    const result = await processPolitician(politician, cycles);
    results[politician.politician_id] = result;

    if (result.has_fec_data) withData++;
    if (result.israel_lobby_total > 0) withIsraelLobby++;

    // Save progress every 5 politicians
    if (processed % 5 === 0) {
      saveOutput(outputPath, results, cycles, allPoliticians.length, withData, withIsraelLobby);
      console.log(`  [Progress saved: ${processed}/${toProcess.length}]`);
    }
  }

  // Final save
  saveOutput(outputPath, results, cycles, allPoliticians.length, withData, withIsraelLobby);

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('RESULTS SUMMARY');
  console.log('='.repeat(60));
  console.log(`Politicians processed: ${processed}`);
  console.log(`With FEC data: ${withData}`);
  console.log(`With Israel lobby funding: ${withIsraelLobby}`);

  const totalIsraelLobby = Object.values(results)
    .reduce((sum, p) => sum + p.israel_lobby_total, 0);
  console.log(`Total Israel lobby funding: $${totalIsraelLobby.toLocaleString()}`);

  // Top 10 Israel lobby recipients
  const topRecipients = Object.values(results)
    .filter(p => p.israel_lobby_total > 0)
    .sort((a, b) => b.israel_lobby_total - a.israel_lobby_total)
    .slice(0, 10);

  if (topRecipients.length > 0) {
    console.log('\nTop 10 Israel Lobby Recipients:');
    for (const p of topRecipients) {
      console.log(`  ${p.name}: $${p.israel_lobby_total.toLocaleString()} ` +
        `(PAC: $${p.israel_lobby_pac_total.toLocaleString()}, IE: $${p.israel_lobby_ie_total.toLocaleString()})`);
    }
  }

  console.log(`\nOutput saved to: ${outputPath}`);
  console.log('='.repeat(60));
}

function saveOutput(
  outputPath: string,
  results: Record<string, PoliticianFECData>,
  cycles: number[],
  totalPoliticians: number,
  withData: number,
  withIsraelLobby: number
) {
  const totalIsraelLobby = Object.values(results)
    .reduce((sum, p) => sum + p.israel_lobby_total, 0);

  const output: FECOutput = {
    metadata: {
      generated_at: new Date().toISOString(),
      fec_api_key_type: 'custom',
      cycles,
      total_politicians: totalPoliticians,
      with_fec_data: withData,
      with_israel_lobby: withIsraelLobby,
      total_israel_lobby_funding: totalIsraelLobby,
    },
    politicians: results,
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});

#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Sync Financial Data for ALL Ohio Officials
 *
 * Phase 1: Federal officials (17) — FEC API with name/state lookup
 * Phase 2: State officials (133) — FEC API search for statewide/legislative candidates
 * Phase 3: Local officials (1,438) — Web search enrichment
 *
 * Usage:
 *   npx tsx scripts/sync-ohio-financials.ts                   # All phases
 *   npx tsx scripts/sync-ohio-financials.ts --phase 1         # Federal only
 *   npx tsx scripts/sync-ohio-financials.ts --phase 2         # State only
 *   npx tsx scripts/sync-ohio-financials.ts --dry-run         # Preview
 *   npx tsx scripts/sync-ohio-financials.ts --limit 5         # Limit per phase
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const FEC_API_KEY = process.env.FEC_API_KEY || '';
const FEC_BASE_URL = 'https://api.open.fec.gov/v1';
const RATE_LIMIT_MS = 650;

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

// Known Israel lobby PAC committee IDs
const ISRAEL_LOBBY_COMMITTEE_IDS: Record<string, string> = {
  'C00104414': 'AIPAC',
  'C00803833': 'United Democracy Project (AIPAC Super PAC)',
  'C00776997': 'Democratic Majority for Israel PAC',
  'C00765578': 'Pro-Israel America PAC',
  'C00030718': 'NORPAC',
  'C00236489': 'J Street PAC',
  'C00368522': 'JACPAC',
  'C00095067': 'Washington PAC',
  'C00386532': 'Americans for a Secure Israel',
};

const ISRAEL_LOBBY_NAME_PATTERNS = [
  'AIPAC', 'AMERICAN ISRAEL PUBLIC AFFAIRS', 'UNITED DEMOCRACY PROJECT',
  'DEMOCRATIC MAJORITY FOR ISRAEL', 'PRO-ISRAEL AMERICA', 'NORPAC',
  'J STREET', 'JSTREET', 'JOINT ACTION COMMITTEE FOR POLITICAL',
  'WASHINGTON PAC', 'ISRAEL BONDS', 'FRIENDS OF ISRAEL', 'ISRAEL ALLIES',
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Politician {
  bioguide_id: string;
  name: string;
  office: string;
  office_level: string;
  party: string;
  source_ids: Record<string, string> | null;
  total_funds: number | null;
  israel_lobby_total: number | null;
}

interface DonorSummary {
  name: string;
  amount: number;
  type: string;
  is_israel_lobby: boolean;
}

interface FinancialResult {
  bioguide_id: string;
  name: string;
  total_raised: number;
  aipac_funding: number;
  israel_lobby_total: number;
  israel_lobby_breakdown: { total: number; pacs: number; ie: number; bundlers: number };
  top5_donors: DonorSummary[];
  contribution_breakdown: { aipac: number; otherPACs: number; individuals: number; corporate: number };
  fec_candidate_id: string;
  updated: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let requestCount = 0;

function isIsraelLobbyDonor(donorName: string, committeeId?: string): boolean {
  if (committeeId && ISRAEL_LOBBY_COMMITTEE_IDS[committeeId]) return true;
  const upper = (donorName || '').toUpperCase();
  return ISRAEL_LOBBY_NAME_PATTERNS.some(p => upper.includes(p));
}

function isAipacDonor(donorName: string, committeeId?: string): boolean {
  if (committeeId === 'C00104414' || committeeId === 'C00803833') return true;
  const upper = (donorName || '').toUpperCase();
  return upper.includes('AIPAC') || upper.includes('AMERICAN ISRAEL PUBLIC AFFAIRS') || upper.includes('UNITED DEMOCRACY PROJECT');
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
// FEC API Client
// ---------------------------------------------------------------------------

async function fecGet(endpoint: string, params: Record<string, string | number> = {}): Promise<any> {
  const url = new URL(`${FEC_BASE_URL}${endpoint}`);
  url.searchParams.set('api_key', FEC_API_KEY);
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null && val !== '') {
      url.searchParams.set(key, String(val));
    }
  }

  requestCount++;
  const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });

  if (response.status === 429) {
    console.log('    Rate limited, waiting 60s...');
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
// FEC Data Fetchers
// ---------------------------------------------------------------------------

async function lookupFecId(name: string, office: string): Promise<string | null> {
  // Determine FEC office code
  let officeCode = 'H';
  if (office.toLowerCase().includes('senator')) officeCode = 'S';
  if (office.toLowerCase().includes('governor') || office.toLowerCase().includes('state')) officeCode = ''; // state-level, search broadly

  try {
    const params: Record<string, string | number> = {
      name,
      state: 'OH',
      sort: '-election_years',
      per_page: 10,
    };
    if (officeCode) params.office = officeCode;

    const data = await fecGet('/candidates/search/', params);
    await sleep(RATE_LIMIT_MS);

    const candidates = data.results || [];
    if (candidates.length > 0) {
      // Try exact match first
      const nameParts = name.toUpperCase().split(' ');
      const lastName = nameParts[nameParts.length - 1];
      const firstName = nameParts[0];

      for (const c of candidates) {
        const fecName = (c.name || '').toUpperCase();
        if (fecName.includes(lastName) && fecName.includes(firstName)) {
          return c.candidate_id;
        }
      }
      // Fall back to last name match
      for (const c of candidates) {
        const fecName = (c.name || '').toUpperCase();
        if (fecName.includes(lastName)) {
          return c.candidate_id;
        }
      }
    }

    // Retry with just last name
    const lastName = name.split(' ').pop() || '';
    const data2 = await fecGet('/candidates/search/', {
      name: lastName,
      state: 'OH',
      sort: '-election_years',
      per_page: 10,
      ...(officeCode ? { office: officeCode } : {}),
    });
    await sleep(RATE_LIMIT_MS);

    for (const c of data2.results || []) {
      const fecName = (c.name || '').toUpperCase();
      const firstName = name.split(' ')[0].toUpperCase();
      if (fecName.includes(lastName.toUpperCase()) && fecName.includes(firstName)) {
        return c.candidate_id;
      }
    }

    return null;
  } catch (e: any) {
    console.log(`      Name lookup error: ${e.message}`);
    return null;
  }
}

async function fetchCandidateTotals(candidateId: string, cycles: number[]): Promise<{ raised: number; disbursed: number }> {
  let totalRaised = 0;
  let totalDisbursed = 0;

  for (const cycle of cycles) {
    try {
      const data = await fecGet(`/candidate/${candidateId}/totals/`, { cycle, per_page: 100 });
      for (const result of data.results || []) {
        totalRaised += Number(result.receipts || 0);
        totalDisbursed += Number(result.disbursements || 0);
      }
    } catch (e: any) {
      // Skip failed cycles silently
    }
    await sleep(RATE_LIMIT_MS);
  }

  return { raised: totalRaised, disbursed: totalDisbursed };
}

async function fetchCandidateCommittees(candidateId: string, cycle: number): Promise<string[]> {
  try {
    const data = await fecGet(`/candidate/${candidateId}/committees/`, { cycle, per_page: 10, designation: 'P' });
    const ids = (data.results || []).map((r: any) => r.committee_id).filter(Boolean);
    if (ids.length === 0) {
      const allData = await fecGet(`/candidate/${candidateId}/committees/`, { cycle, per_page: 10 });
      await sleep(RATE_LIMIT_MS);
      return (allData.results || []).map((r: any) => r.committee_id).filter(Boolean);
    }
    return ids;
  } catch {
    return [];
  }
}

async function fetchTopContributions(committeeId: string, cycle: number): Promise<Array<{
  donor_name: string; amount: number; entity_type: string; contributor_id: string;
}>> {
  try {
    const data = await fecGet('/schedules/schedule_a/', {
      committee_id: committeeId, two_year_transaction_period: cycle,
      sort: '-contribution_receipt_amount', per_page: 100,
    });
    return (data.results || []).map((c: any) => ({
      donor_name: c.contributor_name || 'UNKNOWN',
      amount: Number(c.contribution_receipt_amount || 0),
      entity_type: c.entity_type || '',
      contributor_id: c.contributor_id || '',
    }));
  } catch {
    return [];
  }
}

async function fetchIndependentExpenditures(candidateId: string, cycle: number): Promise<Array<{
  committee_name: string; committee_id: string; amount: number; support_oppose: string; is_israel_lobby: boolean;
}>> {
  try {
    const data = await fecGet('/schedules/schedule_e/', {
      candidate_id: candidateId, cycle, per_page: 100, sort: '-expenditure_amount',
    });
    const byCommittee: Record<string, { name: string; total: number; support_oppose: string; is_israel_lobby: boolean }> = {};
    for (const exp of data.results || []) {
      const cid = exp.committee_id || '';
      const cname = exp.committee?.name || exp.payee_name || 'UNKNOWN';
      if (!byCommittee[cid]) {
        byCommittee[cid] = {
          name: cname, total: 0,
          support_oppose: exp.support_oppose_indicator === 'S' ? 'support' : 'oppose',
          is_israel_lobby: isIsraelLobbyDonor(cname, cid),
        };
      }
      byCommittee[cid].total += Number(exp.expenditure_amount || 0);
    }
    return Object.entries(byCommittee).map(([cid, info]) => ({
      committee_name: info.name, committee_id: cid,
      amount: Math.round(info.total * 100) / 100,
      support_oppose: info.support_oppose, is_israel_lobby: info.is_israel_lobby,
    })).sort((a, b) => b.amount - a.amount);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Process a Single Politician via FEC
// ---------------------------------------------------------------------------

async function processFecPolitician(
  pol: Politician, cycles: number[], supabase: SupabaseClient, dryRun: boolean
): Promise<FinancialResult> {
  const result: FinancialResult = {
    bioguide_id: pol.bioguide_id, name: pol.name,
    total_raised: 0, aipac_funding: 0, israel_lobby_total: 0,
    israel_lobby_breakdown: { total: 0, pacs: 0, ie: 0, bundlers: 0 },
    top5_donors: [], contribution_breakdown: { aipac: 0, otherPACs: 0, individuals: 0, corporate: 0 },
    fec_candidate_id: '', updated: false, error: null,
  };

  // Step 1: Find FEC candidate ID
  let fecId = pol.source_ids?.fec_candidate_id || '';
  if (!fecId) {
    console.log(`    Looking up FEC ID for ${pol.name}...`);
    fecId = (await lookupFecId(pol.name, pol.office)) || '';
    if (fecId) {
      console.log(`    Found: ${fecId}`);
      if (!dryRun) {
        await supabase.from('politicians').update({
          source_ids: { ...(pol.source_ids || {}), fec_candidate_id: fecId },
        }).eq('bioguide_id', pol.bioguide_id);
      }
    } else {
      result.error = 'No FEC candidate ID found';
      return result;
    }
  }
  result.fec_candidate_id = fecId;

  try {
    // Step 2: Fetch totals
    console.log(`    Fetching totals...`);
    const totals = await fetchCandidateTotals(fecId, cycles);
    result.total_raised = Math.round(totals.raised * 100) / 100;

    // Step 3: Fetch contributions
    const latestCycle = cycles[0];
    console.log(`    Fetching committees...`);
    const committees = await fetchCandidateCommittees(fecId, latestCycle);
    await sleep(RATE_LIMIT_MS);

    let allContributions: Array<{ donor_name: string; amount: number; entity_type: string; contributor_id: string }> = [];
    for (const cid of committees.slice(0, 3)) {
      const contribs = await fetchTopContributions(cid, latestCycle);
      allContributions = allContributions.concat(contribs);
      await sleep(RATE_LIMIT_MS);
    }

    // Step 4: Analyze contributions
    let israelLobbyPacTotal = 0;
    let aipacDirect = 0;
    let breakdownAipac = 0, breakdownOtherPACs = 0, breakdownIndividuals = 0, breakdownCorporate = 0;
    const donorAgg: Record<string, { amount: number; type: string; is_israel_lobby: boolean }> = {};

    for (const c of allContributions) {
      const isIsrael = isIsraelLobbyDonor(c.donor_name, c.contributor_id);
      const isAipac = isAipacDonor(c.donor_name, c.contributor_id);
      const donorType = classifyDonorType(c.entity_type, c.donor_name, isIsrael);

      if (isIsrael) israelLobbyPacTotal += c.amount;
      if (isAipac) aipacDirect += c.amount;

      if (donorType === 'Israel-PAC') breakdownAipac += c.amount;
      else if (donorType === 'PAC') breakdownOtherPACs += c.amount;
      else if (donorType === 'Corporate') breakdownCorporate += c.amount;
      else breakdownIndividuals += c.amount;

      const key = c.donor_name;
      if (!donorAgg[key]) donorAgg[key] = { amount: 0, type: donorType, is_israel_lobby: isIsrael };
      donorAgg[key].amount += c.amount;
    }

    result.top5_donors = Object.entries(donorAgg)
      .map(([name, d]) => ({ name, amount: Math.round(d.amount), type: d.type, is_israel_lobby: d.is_israel_lobby }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    // Step 5: Independent expenditures
    console.log(`    Fetching independent expenditures...`);
    let israelLobbyIeTotal = 0, aipacIe = 0;
    for (const cycle of cycles) {
      const ies = await fetchIndependentExpenditures(fecId, cycle);
      for (const ie of ies) {
        if (ie.is_israel_lobby && ie.support_oppose === 'support') {
          israelLobbyIeTotal += ie.amount;
          if (isAipacDonor(ie.committee_name, ie.committee_id)) aipacIe += ie.amount;
        }
      }
      await sleep(RATE_LIMIT_MS);
    }

    result.aipac_funding = Math.round(aipacDirect + aipacIe);
    result.israel_lobby_total = Math.round(israelLobbyPacTotal + israelLobbyIeTotal);
    result.israel_lobby_breakdown = {
      total: result.israel_lobby_total,
      pacs: Math.round(israelLobbyPacTotal),
      ie: Math.round(israelLobbyIeTotal),
      bundlers: 0,
    };
    result.contribution_breakdown = {
      aipac: Math.round(breakdownAipac),
      otherPACs: Math.round(breakdownOtherPACs),
      individuals: Math.round(breakdownIndividuals),
      corporate: Math.round(breakdownCorporate),
    };

    // Step 6: Update DB
    if (!dryRun) {
      console.log(`    Updating Supabase...`);
      const { error: updateError } = await supabase.from('politicians').update({
        total_funds: Math.round(result.total_raised),
        top5_donors: result.top5_donors,
        aipac_funding: result.aipac_funding,
        ...(result.israel_lobby_total > (pol.israel_lobby_total || 0) ? {
          israel_lobby_total: result.israel_lobby_total,
          israel_lobby_breakdown: result.israel_lobby_breakdown,
        } : {}),
        contribution_breakdown: result.contribution_breakdown,
        data_source: 'fec_api',
        updated_at: new Date().toISOString(),
      }).eq('bioguide_id', pol.bioguide_id);

      if (updateError) {
        result.error = `DB update: ${updateError.message}`;
      } else {
        result.updated = true;
      }
    }

    console.log(
      `    ✓ $${result.total_raised.toLocaleString()} raised` +
      (result.israel_lobby_total > 0 ? ` | $${result.israel_lobby_total.toLocaleString()} Israel lobby` : '') +
      (result.aipac_funding > 0 ? ` | $${result.aipac_funding.toLocaleString()} AIPAC` : '')
    );
  } catch (e: any) {
    result.error = e.message;
    console.log(`    ERROR: ${e.message}`);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Ohio Secretary of State Campaign Finance Search
// ---------------------------------------------------------------------------

async function searchOhioSosFinance(name: string): Promise<{
  total: number; donors: DonorSummary[];
} | null> {
  // Ohio SOS campaign finance search: https://www.ohiosos.gov/campaign-finance/
  // The API endpoint for search is publicly accessible
  try {
    const url = `https://www6.ohiosos.gov/ords/f?p=CFDISCLOSURE:73:::NO:RP:P73_TYPE,P73_QUERY:CAND,${encodeURIComponent(name)}`;
    // This is a web page, not a JSON API — we can't reliably parse it
    // Instead, use FEC API for state candidates who also ran for federal office
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const phaseIdx = args.indexOf('--phase');
  const phase = phaseIdx >= 0 ? parseInt(args[phaseIdx + 1]) : 0; // 0 = all
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : Infinity;
  const cycles = [2026, 2024, 2022, 2020];

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log('='.repeat(70));
  console.log('  Snitched.ai — Ohio Financial Data Sync');
  console.log('='.repeat(70));
  console.log(`  Mode:     ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Phase:    ${phase === 0 ? 'All' : phase}`);
  console.log(`  Limit:    ${limit === Infinity ? 'All' : limit}`);
  console.log(`  Cycles:   ${cycles.join(', ')}`);
  console.log('');

  const allResults: FinancialResult[] = [];
  let totalUpdated = 0;
  let totalErrors = 0;
  let totalSkipped = 0;

  // -------------------------------------------------------------------------
  // PHASE 1: Federal Officials (FEC API)
  // -------------------------------------------------------------------------
  if (phase === 0 || phase === 1) {
    console.log('\n' + '━'.repeat(70));
    console.log('  PHASE 1: Federal Officials (FEC API)');
    console.log('━'.repeat(70));

    const { data: federal } = await supabase.from('politicians')
      .select('bioguide_id, name, office, office_level, party, source_ids, total_funds, israel_lobby_total')
      .ilike('bioguide_id', 'oh-%')
      .in('office_level', ['US Senator', 'US Representative'])
      .order('name');

    const toProcess = (federal || []).slice(0, limit) as Politician[];
    console.log(`  Found ${toProcess.length} federal OH officials\n`);

    for (let i = 0; i < toProcess.length; i++) {
      const pol = toProcess[i];
      console.log(`[${i + 1}/${toProcess.length}] ${pol.name} — ${pol.office}`);
      const result = await processFecPolitician(pol, cycles, supabase, dryRun);
      allResults.push(result);
      if (result.updated) totalUpdated++;
      if (result.error && result.error !== 'No FEC candidate ID found') totalErrors++;
      if (result.error === 'No FEC candidate ID found') totalSkipped++;
    }
  }

  // -------------------------------------------------------------------------
  // PHASE 2: State Officials (FEC API search — many ran for federal before)
  // -------------------------------------------------------------------------
  if (phase === 0 || phase === 2) {
    console.log('\n' + '━'.repeat(70));
    console.log('  PHASE 2: State Officials (FEC API search)');
    console.log('━'.repeat(70));

    const { data: stateOfficials } = await supabase.from('politicians')
      .select('bioguide_id, name, office, office_level, party, source_ids, total_funds, israel_lobby_total')
      .ilike('bioguide_id', 'oh-%')
      .in('office_level', ['State Senator', 'State Representative', 'Governor'])
      .or('total_funds.is.null,total_funds.eq.0')
      .order('name');

    const toProcess = (stateOfficials || []).slice(0, limit) as Politician[];
    console.log(`  Found ${toProcess.length} state OH officials without financial data\n`);

    for (let i = 0; i < toProcess.length; i++) {
      const pol = toProcess[i];
      console.log(`[${i + 1}/${toProcess.length}] ${pol.name} — ${pol.office}`);

      // Try FEC first (many state officials also run for federal office)
      const result = await processFecPolitician(pol, cycles, supabase, dryRun);
      allResults.push(result);

      if (result.error === 'No FEC candidate ID found') {
        // FEC didn't find them — that's expected for state-only officials
        // Try a broader FEC search without office filter
        console.log(`    No federal FEC data — trying broader search...`);
        try {
          const data = await fecGet('/candidates/search/', {
            name: pol.name, state: 'OH', sort: '-election_years', per_page: 5,
          });
          await sleep(RATE_LIMIT_MS);

          if (data.results?.length > 0) {
            const nameParts = pol.name.toUpperCase().split(' ');
            const lastName = nameParts[nameParts.length - 1];
            const firstName = nameParts[0];
            const match = data.results.find((c: any) => {
              const fn = (c.name || '').toUpperCase();
              return fn.includes(lastName) && fn.includes(firstName);
            });
            if (match) {
              console.log(`    Found broader FEC match: ${match.candidate_id} — ${match.name}`);
              const retryResult = await processFecPolitician(
                { ...pol, source_ids: { ...(pol.source_ids || {}), fec_candidate_id: match.candidate_id } },
                cycles, supabase, dryRun
              );
              // Replace the failed result
              allResults[allResults.length - 1] = retryResult;
              if (retryResult.updated) totalUpdated++;
              continue;
            }
          }
        } catch {
          // Continue
        }
        totalSkipped++;
      } else if (result.error) {
        totalErrors++;
      } else if (result.updated) {
        totalUpdated++;
      }
    }
  }

  // -------------------------------------------------------------------------
  // PHASE 3: Local Officials — County/City level
  // For these, FEC won't have data. We'll search for any prior campaigns.
  // -------------------------------------------------------------------------
  if (phase === 3) {
    console.log('\n' + '━'.repeat(70));
    console.log('  PHASE 3: Local Officials (FEC broad search)');
    console.log('━'.repeat(70));

    const localLevels = [
      'County Commissioner', 'Mayor', 'Prosecutor', 'Judge',
      'Sheriff', 'City Council', 'City Commissioner', 'City Commission',
    ];

    const { data: localOfficials } = await supabase.from('politicians')
      .select('bioguide_id, name, office, office_level, party, source_ids, total_funds, israel_lobby_total')
      .ilike('bioguide_id', 'oh-%')
      .in('office_level', localLevels)
      .or('total_funds.is.null,total_funds.eq.0')
      .order('name')
      .limit(Math.min(limit, 200));

    const toProcess = (localOfficials || []) as Politician[];
    console.log(`  Processing ${toProcess.length} local OH officials\n`);

    let found = 0;
    for (let i = 0; i < toProcess.length; i++) {
      const pol = toProcess[i];
      if (i % 20 === 0) console.log(`[${i + 1}/${toProcess.length}] Processing...`);

      // Quick FEC name search
      try {
        const data = await fecGet('/candidates/search/', {
          name: pol.name, state: 'OH', per_page: 5,
        });
        await sleep(RATE_LIMIT_MS);

        if (data.results?.length > 0) {
          const nameParts = pol.name.toUpperCase().split(' ');
          const lastName = nameParts[nameParts.length - 1];
          const firstName = nameParts[0];
          const match = data.results.find((c: any) => {
            const fn = (c.name || '').toUpperCase();
            return fn.includes(lastName) && fn.includes(firstName);
          });
          if (match) {
            console.log(`  Found FEC match for ${pol.name}: ${match.candidate_id}`);
            const result = await processFecPolitician(
              { ...pol, source_ids: { ...(pol.source_ids || {}), fec_candidate_id: match.candidate_id } },
              cycles, supabase, dryRun
            );
            allResults.push(result);
            if (result.updated) { totalUpdated++; found++; }
            continue;
          }
        }
      } catch {
        // Continue
      }
    }
    console.log(`  Found FEC data for ${found} local officials`);
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n' + '='.repeat(70));
  console.log('  SYNC SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Total processed:  ${allResults.length}`);
  console.log(`  Updated:          ${totalUpdated}`);
  console.log(`  Errors:           ${totalErrors}`);
  console.log(`  Skipped (no FEC): ${totalSkipped}`);
  console.log(`  FEC API requests: ${requestCount}`);
  console.log(`  Mode:             ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  // Top fundraisers
  const sorted = allResults.filter(r => r.total_raised > 0).sort((a, b) => b.total_raised - a.total_raised);
  if (sorted.length > 0) {
    console.log('\n  Top Fundraisers:');
    for (const r of sorted.slice(0, 15)) {
      console.log(
        `    ${r.name.padEnd(30)} $${r.total_raised.toLocaleString().padStart(15)}` +
        (r.israel_lobby_total > 0 ? `  | $${r.israel_lobby_total.toLocaleString()} Israel lobby` : '')
      );
    }
  }

  // Israel lobby
  const israelRecipients = allResults.filter(r => r.israel_lobby_total > 0).sort((a, b) => b.israel_lobby_total - a.israel_lobby_total);
  if (israelRecipients.length > 0) {
    console.log('\n  Israel Lobby Recipients:');
    for (const r of israelRecipients) {
      console.log(
        `    ${r.name.padEnd(30)} $${r.israel_lobby_total.toLocaleString().padStart(12)}` +
        `  (PAC: $${r.israel_lobby_breakdown.pacs.toLocaleString()}, IE: $${r.israel_lobby_breakdown.ie.toLocaleString()})`
      );
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`  Done. ${dryRun ? 'DRY RUN — no data written.' : 'Supabase updated.'}`);
  console.log('='.repeat(70));
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});

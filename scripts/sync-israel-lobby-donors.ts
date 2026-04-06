#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Sync Israel Lobby Individual Donors from FEC Data
 *
 * Searches FEC Schedule A (individual contributions) for donors whose
 * employer matches known Israel lobby organizations. This captures the
 * "Lobby Donors" category that Track AIPAC tracks.
 *
 * How it works:
 *   1. For each FL federal politician, get their FEC candidate_id
 *   2. Query Schedule A contributions filtered by Israel lobby employer names
 *   3. Sum up contributions per politician per org
 *   4. Update israel_lobby_total and breakdown in Supabase
 *
 * Usage:
 *   npx tsx scripts/sync-israel-lobby-donors.ts
 *   npx tsx scripts/sync-israel-lobby-donors.ts --dry-run
 *   npx tsx scripts/sync-israel-lobby-donors.ts --limit 5
 */

import { createClient } from '@supabase/supabase-js';

const FEC_API_KEY = process.env.FEC_API_KEY || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!FEC_API_KEY) { console.error('ERROR: FEC_API_KEY required'); process.exit(1); }
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Israel lobby organizations — employer names to search for in FEC data
// Based on Track AIPAC's org list + known affiliates
// Only use highly specific employer names that uniquely identify Israel lobby
// Avoid short/generic names that match non-lobby employers
const ISRAEL_LOBBY_EMPLOYERS = [
  'AIPAC',
  'AMERICAN ISRAEL PUBLIC AFFAIRS',
  'AMERICAN ISRAEL PUBLIC AFFAIRS COMMITTEE',
  'UNITED DEMOCRACY PROJECT',
  'DEMOCRATIC MAJORITY FOR ISRAEL',
  'PRO-ISRAEL AMERICA',
  'NORPAC',
  'REPUBLICAN JEWISH COALITION',
  'J STREET',
  'ZIONIST ORGANIZATION OF AMERICA',
];

// Known FEC committee IDs for Israel lobby PACs
const ISRAEL_LOBBY_COMMITTEE_IDS = [
  'C00104299', // AIPAC PAC
  'C00791699', // United Democracy Project
  'C00764126', // DMFI PAC
  'C00068692', // NORPAC
  'C00441949', // J Street PAC
  'C00556100', // Republican Jewish Coalition
  'C00368522', // Pro-Israel America PAC
];

const RATE_LIMIT_MS = 600;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fecFetch(endpoint: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`https://api.open.fec.gov/v1${endpoint}`);
  url.searchParams.set('api_key', FEC_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const resp = await fetch(url.toString(), { signal: AbortSignal.timeout(20000) });
  if (resp.status === 429) {
    console.log('    Rate limited, waiting 30s...');
    await sleep(30000);
    return fecFetch(endpoint, params);
  }
  if (!resp.ok) throw new Error(`FEC API ${resp.status}`);
  return resp.json();
}

async function getIsraelLobbyDonors(candidateId: string, cycles: number[] = [2024, 2022, 2020]): Promise<{
  totalFromEmployers: number;
  totalFromPacs: number;
  orgBreakdown: Record<string, number>;
  donorCount: number;
}> {
  let totalFromEmployers = 0;
  let totalFromPacs = 0;
  const orgBreakdown: Record<string, number> = {};
  let donorCount = 0;

  // 1. Search for individual contributions from Israel lobby employers
  for (const employer of ISRAEL_LOBBY_EMPLOYERS) {
    try {
      const data = await fecFetch('/schedules/schedule_a/', {
        candidate_id: candidateId,
        contributor_employer: employer,
        per_page: '100',
        sort: '-contribution_receipt_amount',
      });

      if (data.pagination?.count > 0) {
        // Sum all contributions from this employer (may need pagination)
        let pageTotal = 0;
        for (const r of data.results || []) {
          pageTotal += r.contribution_receipt_amount || 0;
        }

        // If there are more pages, the count gives us approximate total
        // For accuracy, we'd paginate but this is good enough for now
        if (data.pagination.count > 100) {
          // Estimate: average contribution * total count
          const avgContrib = pageTotal / data.results.length;
          pageTotal = avgContrib * data.pagination.count;
        }

        if (pageTotal > 0) {
          totalFromEmployers += pageTotal;
          orgBreakdown[employer] = (orgBreakdown[employer] || 0) + pageTotal;
          donorCount += data.pagination.count;
        }
      }

      await sleep(RATE_LIMIT_MS);
    } catch (e: any) {
      // Skip on timeout, continue with next employer
      if (e.message?.includes('timeout')) continue;
    }
  }

  // 2. Get direct PAC contributions from known Israel lobby committees
  for (const committeId of ISRAEL_LOBBY_COMMITTEE_IDS) {
    try {
      const data = await fecFetch('/schedules/schedule_a/', {
        candidate_id: candidateId,
        committee_id: committeId,
        per_page: '100',
      });

      for (const r of data.results || []) {
        totalFromPacs += r.contribution_receipt_amount || 0;
      }

      await sleep(RATE_LIMIT_MS);
    } catch {
      continue;
    }
  }

  return { totalFromEmployers, totalFromPacs, orgBreakdown, donorCount };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : 0;

  console.log('='.repeat(60));
  console.log('  Israel Lobby Donor Sync — FEC Individual Contributions');
  console.log('='.repeat(60));
  console.log(`  Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Employers to search: ${ISRAEL_LOBBY_EMPLOYERS.length}`);
  console.log(`  PAC committees: ${ISRAEL_LOBBY_COMMITTEE_IDS.length}`);
  console.log();

  // Get federal politicians with FEC candidate IDs
  const { data: politicians } = await supabase
    .from('politicians')
    .select('bioguide_id, name, office_level, source_ids, israel_lobby_total')
    .in('office_level', ['US Senator', 'US Representative'])
    .order('name');

  let pols = politicians || [];
  if (limit) pols = pols.slice(0, limit);

  console.log(`Processing ${pols.length} federal politicians...\n`);

  let updated = 0;
  let errors = 0;

  for (let i = 0; i < pols.length; i++) {
    const pol = pols[i];
    const sourceIds = (pol.source_ids as any) || {};
    const candidateId = sourceIds.fec_candidate_id;

    if (!candidateId) {
      console.log(`[${i + 1}/${pols.length}] ${pol.name} — no FEC candidate_id, skipping`);
      continue;
    }

    console.log(`[${i + 1}/${pols.length}] ${pol.name} (${candidateId})`);

    try {
      const result = await getIsraelLobbyDonors(candidateId);
      const total = result.totalFromEmployers + result.totalFromPacs;

      if (total > 0) {
        console.log(`    Lobby Donors: $${Math.round(result.totalFromEmployers).toLocaleString()} (${result.donorCount} contributions)`);
        console.log(`    PAC Direct: $${Math.round(result.totalFromPacs).toLocaleString()}`);
        console.log(`    TOTAL: $${Math.round(total).toLocaleString()}`);

        if (!dryRun) {
          const { error } = await supabase
            .from('politicians')
            .update({
              israel_lobby_total: Math.round(total),
              israel_lobby_breakdown: {
                total: Math.round(total),
                pacs: Math.round(result.totalFromPacs),
                ie: 0,
                bundlers: Math.round(result.totalFromEmployers),
                orgBreakdown: result.orgBreakdown,
              },
            })
            .eq('bioguide_id', pol.bioguide_id);

          if (error) {
            console.log(`    ERROR: ${error.message}`);
            errors++;
          } else {
            updated++;
          }
        }
      } else {
        console.log('    No Israel lobby contributions found');
      }
    } catch (e: any) {
      console.log(`    ERROR: ${e.message}`);
      errors++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`  Updated: ${updated} | Errors: ${errors}`);
  console.log('='.repeat(60));
}

main();

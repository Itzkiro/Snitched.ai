#!/usr/bin/env npx tsx
/**
 * Sync Lobbying Disclosure Data to Supabase
 *
 * Pulls real LDA (Lobbying Disclosure Act) data for federal politicians and
 * updates their records with lobbying connections.
 *
 * Data sources:
 *   1. Lobbyist contributions to politicians (LD-203 filings)
 *   2. Revolving door connections (lobbyists who used to work for the politician)
 *
 * Usage:
 *   npx tsx scripts/sync-lobbying-data.ts
 *   npx tsx scripts/sync-lobbying-data.ts --dry-run
 *   npx tsx scripts/sync-lobbying-data.ts --limit 5
 *   npx tsx scripts/sync-lobbying-data.ts --year 2024
 */

import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const LDA_API_KEY = process.env.LDA_API_KEY || '';
const LDA_BASE_URL = 'https://lda.gov/api/v1';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required');
  process.exit(1);
}

const RATE_LIMIT_MS = 550; // ~109 req/min to stay under 120/min limit
const FEDERAL_OFFICES = ['US Senator', 'US Representative'];

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LDAContributionItem {
  contribution_type_display: string;
  contributor_name: string;
  payee_name: string;
  honoree_name: string;
  amount: string;
  date: string;
}

interface LDAContributionFiling {
  filing_uuid: string;
  filing_year: number;
  registrant: { id: number; name: string };
  lobbyist?: { first_name: string; last_name: string };
  contribution_items: LDAContributionItem[];
}

interface LDALobbyist {
  lobbyist: { id: number; first_name: string; last_name: string };
  covered_position: string;
  new: boolean;
}

interface LDALobbyingActivity {
  general_issue_code: string;
  general_issue_code_display: string;
  description: string;
  government_entities: { id: number; name: string }[];
  lobbyists: LDALobbyist[];
}

interface LDAFiling {
  filing_uuid: string;
  filing_type_display: string;
  filing_year: number;
  income: number | null;
  expenses: number | null;
  registrant: { id: number; name: string };
  client: { id: number; name: string; general_description: string; state: string };
  lobbying_activities: LDALobbyingActivity[];
}

interface LobbyingRecord {
  registrantName: string;
  clientName: string;
  income: number;
  issueAreas: string[];
  filingYear: number;
  revolvingDoor: string[];
}

// ---------------------------------------------------------------------------
// LDA API helpers
// ---------------------------------------------------------------------------

async function ldaFetch(endpoint: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`${LDA_BASE_URL}${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const resp = await fetch(url.toString(), {
    headers: {
      'Authorization': `Token ${LDA_API_KEY}`,
      'Accept': 'application/json',
    },
  });

  if (resp.status === 429) {
    const retryAfter = parseInt(resp.headers.get('Retry-After') ?? '5');
    console.log(`    Rate limited, waiting ${retryAfter}s...`);
    await sleep(retryAfter * 1000);
    return ldaFetch(endpoint, params);
  }

  if (!resp.ok) {
    throw new Error(`LDA API ${resp.status}: ${await resp.text()}`);
  }

  return resp.json();
}

async function ldaFetchAllPages(endpoint: string, params: Record<string, string>, maxPages = 10): Promise<any[]> {
  const allResults: any[] = [];
  let page = 1;

  while (page <= maxPages) {
    const data = await ldaFetch(endpoint, { ...params, page: String(page), page_size: '25' });
    allResults.push(...(data.results ?? []));

    if (!data.next) break;
    page++;
    await sleep(RATE_LIMIT_MS);
  }

  return allResults;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Scraping functions
// ---------------------------------------------------------------------------

/**
 * Get lobbyist contributions to a politician (LD-203 filings).
 * Returns total amount and list of contributing firms.
 */
async function getContributionsToPolitian(
  name: string,
  years: number[] = [2024, 2023, 2022],
): Promise<{
  totalAmount: number;
  contributingFirms: { name: string; amount: number; lobbyist: string }[];
  filingCount: number;
}> {
  const contributingFirms = new Map<string, { name: string; amount: number; lobbyist: string }>();
  let totalAmount = 0;
  let filingCount = 0;

  // Search by last name to catch variations
  const nameParts = name.split(/\s+/);
  const lastName = nameParts[nameParts.length - 1];

  for (const year of years) {
    try {
      const filings = await ldaFetchAllPages('/contributions/', {
        contribution_honoree: lastName,
        filing_year: String(year),
      }, 4);

      for (const filing of filings as LDAContributionFiling[]) {
        const items = filing.contribution_items ?? [];
        for (const item of items) {
          // Filter to only contributions mentioning this politician
          const honoree = (item.honoree_name ?? '').toLowerCase();
          const firstName = nameParts[0].toLowerCase();
          const lastNameLower = lastName.toLowerCase();

          if (!honoree.includes(lastNameLower)) continue;
          // For common last names, also check first name
          if (['scott', 'lee', 'smith', 'wilson', 'brown'].includes(lastNameLower)) {
            if (!honoree.includes(firstName)) continue;
          }

          const amount = parseFloat(item.amount ?? '0');
          if (amount <= 0) continue;

          totalAmount += amount;
          filingCount++;

          const firmName = filing.registrant?.name ?? 'Unknown';
          const lobbyistName = filing.lobbyist
            ? `${filing.lobbyist.first_name} ${filing.lobbyist.last_name}`
            : item.contributor_name ?? 'Unknown';

          const existing = contributingFirms.get(firmName);
          if (existing) {
            existing.amount += amount;
          } else {
            contributingFirms.set(firmName, {
              name: firmName,
              amount,
              lobbyist: lobbyistName,
            });
          }
        }
      }

      await sleep(RATE_LIMIT_MS);
    } catch (err) {
      console.error(`    Error fetching contributions for ${name} (${year}):`, err);
    }
  }

  return {
    totalAmount,
    contributingFirms: Array.from(contributingFirms.values())
      .sort((a, b) => b.amount - a.amount),
    filingCount,
  };
}

/**
 * Get revolving door connections — lobbyists who used to work for this politician.
 */
async function getRevolvingDoorConnections(
  name: string,
  years: number[] = [2024, 2023],
): Promise<{
  connections: { lobbyistName: string; priorPosition: string; currentFirm: string; client: string }[];
  totalFilings: number;
  totalIncome: number;
  uniqueClients: Set<string>;
}> {
  const connections = new Map<string, {
    lobbyistName: string;
    priorPosition: string;
    currentFirm: string;
    client: string;
  }>();
  let totalFilings = 0;
  let totalIncome = 0;
  const uniqueClients = new Set<string>();

  const nameParts = name.split(/\s+/);
  const lastName = nameParts[nameParts.length - 1];

  for (const year of years) {
    try {
      const filings = await ldaFetchAllPages('/filings/', {
        lobbyist_covered_position: lastName,
        filing_year: String(year),
      }, 8);

      for (const filing of filings as LDAFiling[]) {
        totalFilings++;
        const income = parseFloat(String(filing.income ?? filing.expenses ?? 0)) || 0;
        totalIncome += income;

        const clientName = filing.client?.name ?? 'Unknown';
        uniqueClients.add(clientName);

        for (const activity of filing.lobbying_activities ?? []) {
          for (const lob of activity.lobbyists ?? []) {
            if (!lob.covered_position) continue;

            const position = lob.covered_position.toLowerCase();
            const lastNameLower = lastName.toLowerCase();

            if (!position.includes(lastNameLower)) continue;

            const lobbyistName = `${lob.lobbyist.first_name} ${lob.lobbyist.last_name}`;
            const key = `${lobbyistName}-${clientName}`;

            if (!connections.has(key)) {
              connections.set(key, {
                lobbyistName,
                priorPosition: lob.covered_position,
                currentFirm: filing.registrant?.name ?? 'Unknown',
                client: clientName,
              });
            }
          }
        }
      }

      await sleep(RATE_LIMIT_MS);
    } catch (err) {
      console.error(`    Error fetching revolving door for ${name} (${year}):`, err);
    }
  }

  return {
    connections: Array.from(connections.values()),
    totalFilings,
    totalIncome,
    uniqueClients,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : 100;
  const yearIdx = args.indexOf('--year');
  const searchYears = yearIdx >= 0 ? [parseInt(args[yearIdx + 1])] : [2024, 2023, 2022];

  console.log('='.repeat(60));
  console.log('  LDA Lobbying Data Sync');
  console.log('='.repeat(60));
  if (dryRun) console.log('  [DRY RUN — no changes will be saved]');
  console.log(`  Years: ${searchYears.join(', ')}`);
  console.log();

  // Fetch federal politicians
  const { data: rows, error } = await supabase
    .from('politicians')
    .select('bioguide_id, name, office, office_level')
    .in('office_level', FEDERAL_OFFICES)
    .order('name')
    .limit(limit);

  if (error || !rows) {
    console.error('Failed to fetch politicians:', error);
    process.exit(1);
  }

  console.log(`Fetched ${rows.length} federal politicians\n`);

  const stats = {
    total: rows.length,
    withContributions: 0,
    withRevolvingDoor: 0,
    updated: 0,
    errors: 0,
    totalLobbyistContributions: 0,
    totalRevolvingDoorConnections: 0,
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    console.log(`[${i + 1}/${rows.length}] ${row.name} (${row.office_level})`);

    // 1. Get lobbyist contributions
    const contribs = await getContributionsToPolitian(row.name, searchYears);

    if (contribs.totalAmount > 0) {
      stats.withContributions++;
      stats.totalLobbyistContributions += contribs.totalAmount;
      console.log(`  Contributions: $${contribs.totalAmount.toLocaleString()} from ${contribs.contributingFirms.length} firms`);
      if (verbose && contribs.contributingFirms.length > 0) {
        for (const f of contribs.contributingFirms.slice(0, 3)) {
          console.log(`    $${f.amount.toLocaleString()} from ${f.name} (${f.lobbyist})`);
        }
      }
    } else {
      console.log('  Contributions: None found');
    }

    await sleep(RATE_LIMIT_MS);

    // 2. Get revolving door connections
    const revolving = await getRevolvingDoorConnections(row.name, searchYears.slice(0, 2));

    if (revolving.connections.length > 0) {
      stats.withRevolvingDoor++;
      stats.totalRevolvingDoorConnections += revolving.connections.length;
      console.log(`  Revolving door: ${revolving.connections.length} lobbyists, ${revolving.uniqueClients.size} clients, $${revolving.totalIncome.toLocaleString()} income`);
      if (verbose) {
        for (const c of revolving.connections.slice(0, 3)) {
          console.log(`    ${c.lobbyistName} (was: ${c.priorPosition.substring(0, 60)})`);
          console.log(`      Now at ${c.currentFirm}, lobbying for ${c.client}`);
        }
      }
    } else {
      console.log('  Revolving door: None found');
    }

    // Build lobbying records for Supabase
    const lobbyingRecords: LobbyingRecord[] = [];

    // Add revolving door filings as lobbying records
    if (revolving.connections.length > 0) {
      // Group by registrant+client
      const grouped = new Map<string, LobbyingRecord>();
      for (const conn of revolving.connections) {
        const key = `${conn.currentFirm}:${conn.client}`;
        if (!grouped.has(key)) {
          grouped.set(key, {
            registrantName: conn.currentFirm,
            clientName: conn.client,
            income: 0,
            issueAreas: [],
            filingYear: searchYears[0],
            revolvingDoor: [],
          });
        }
        const record = grouped.get(key)!;
        record.revolvingDoor.push(`${conn.lobbyistName} (prev: ${conn.priorPosition.substring(0, 80)})`);
      }
      lobbyingRecords.push(...grouped.values());
    }

    // Add contribution data
    if (contribs.contributingFirms.length > 0) {
      for (const firm of contribs.contributingFirms.slice(0, 10)) {
        lobbyingRecords.push({
          registrantName: firm.name,
          clientName: firm.name,
          income: firm.amount,
          issueAreas: ['Lobbyist Contribution'],
          filingYear: searchYears[0],
          revolvingDoor: [],
        });
      }
    }

    // Update Supabase
    if (!dryRun && lobbyingRecords.length > 0) {
      const { error: updateError } = await supabase
        .from('politicians')
        .update({ lobbying_records: lobbyingRecords })
        .eq('bioguide_id', row.bioguide_id);

      if (updateError) {
        console.error(`  Error updating ${row.name}: ${updateError.message}`);
        stats.errors++;
      } else {
        stats.updated++;
      }
    }

    console.log();
    await sleep(RATE_LIMIT_MS);
  }

  // Print summary
  console.log('='.repeat(60));
  console.log('  LDA LOBBYING SYNC SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Total politicians:          ${stats.total}`);
  console.log(`  With lobbyist contributions: ${stats.withContributions}`);
  console.log(`  With revolving door:         ${stats.withRevolvingDoor}`);
  console.log(`  Total lobbyist $:            $${stats.totalLobbyistContributions.toLocaleString()}`);
  console.log(`  Revolving door connections:   ${stats.totalRevolvingDoorConnections}`);
  console.log(`  Updated in Supabase:         ${stats.updated}`);
  console.log(`  Errors:                      ${stats.errors}`);
}

main().catch(console.error);

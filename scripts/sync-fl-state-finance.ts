#!/usr/bin/env npx tsx
import 'dotenv/config';
/**
 * Sync FL State Campaign Finance Data to Supabase
 *
 * Reads scraped contribution data from the FL DOE scraper output
 * and updates Supabase with total_funds, top5_donors, contribution_breakdown,
 * israel_lobby_total, and aipac_funding for all FL state legislators.
 *
 * Usage:
 *   npx tsx scripts/sync-fl-state-finance.ts
 *   npx tsx scripts/sync-fl-state-finance.ts --dry-run
 *   npx tsx scripts/sync-fl-state-finance.ts --input data-ingestion/fl-state-contributions.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required');
  process.exit(1);
}

const DEFAULT_INPUT = path.resolve(__dirname, '..', 'data-ingestion', 'fl-state-contributions.json');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScrapedResult {
  bioguide_id: string;
  name: string;
  office_level: string;
  total_funds: number;
  top5_donors: Array<{
    name: string;
    amount: number;
    type: string;
    is_israel_lobby: boolean;
  }>;
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
  };
  contribution_count: number;
  raw_contribution_count: number;
}

interface ScrapedData {
  scraped_at: string;
  total_legislators: number;
  with_data: number;
  results: ScrapedResult[];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const inputIdx = args.indexOf('--input');
  const inputPath = inputIdx >= 0 ? args[inputIdx + 1] : DEFAULT_INPUT;

  console.log('='.repeat(60));
  console.log('  FL State Campaign Finance → Supabase Sync');
  console.log('='.repeat(60));
  console.log(`  Input:  ${inputPath}`);
  console.log(`  Mode:   ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log();

  // Step 1: Load scraped data
  if (!fs.existsSync(inputPath)) {
    console.error(`ERROR: Input file not found: ${inputPath}`);
    console.error('Run the scraper first: python3 scrapers/fl-doe-scraper.py');
    process.exit(1);
  }

  const raw = fs.readFileSync(inputPath, 'utf-8');
  const data: ScrapedData = JSON.parse(raw);

  console.log(`Loaded ${data.results.length} legislators (scraped at ${data.scraped_at})`);
  console.log(`  With data: ${data.with_data}`);
  console.log();

  // Step 2: Update Supabase
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const result of data.results) {
    if (result.total_funds === 0 && result.raw_contribution_count === 0) {
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`  [DRY RUN] ${result.name}: $${result.total_funds.toLocaleString()} total, ${result.contribution_count} contributions`);
      updated++;
      continue;
    }

    const { error } = await supabase
      .from('politicians')
      .update({
        total_funds: result.total_funds,
        top5_donors: result.top5_donors,
        contribution_breakdown: result.contribution_breakdown,
        aipac_funding: result.aipac_funding,
        israel_lobby_total: result.israel_lobby_total,
        israel_lobby_breakdown: result.israel_lobby_breakdown,
        data_source: 'fl_doe_scrape',
        updated_at: new Date().toISOString(),
      })
      .eq('bioguide_id', result.bioguide_id);

    if (error) {
      console.error(`  ERROR updating ${result.name}: ${error.message}`);
      errors++;
    } else {
      updated++;
      if (result.israel_lobby_total > 0) {
        console.log(`  ✓ ${result.name}: $${result.total_funds.toLocaleString()} (Israel: $${result.israel_lobby_total.toLocaleString()})`);
      }
    }
  }

  // Step 3: Summary
  console.log('\n' + '='.repeat(60));
  console.log('  SYNC SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Total legislators:  ${data.results.length}`);
  console.log(`  Updated:            ${updated}`);
  console.log(`  Skipped (no data):  ${skipped}`);
  console.log(`  Errors:             ${errors}`);
  console.log(`  Mode:               ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  // Top funded
  const funded = data.results
    .filter(r => r.total_funds > 0)
    .sort((a, b) => b.total_funds - a.total_funds);

  if (funded.length > 0) {
    console.log('\n  Top 10 State Legislators by Funding:');
    for (const r of funded.slice(0, 10)) {
      const israel = r.israel_lobby_total > 0 ? `  (Israel: $${r.israel_lobby_total.toLocaleString()})` : '';
      console.log(`    ${r.name.padEnd(35)} $${r.total_funds.toLocaleString().padStart(12)}${israel}`);
    }
  }

  // Israel lobby recipients
  const israelRecipients = data.results
    .filter(r => r.israel_lobby_total > 0)
    .sort((a, b) => b.israel_lobby_total - a.israel_lobby_total);

  if (israelRecipients.length > 0) {
    console.log('\n  Israel Lobby Recipients (State Level):');
    for (const r of israelRecipients) {
      console.log(`    ${r.name.padEnd(35)} $${r.israel_lobby_total.toLocaleString().padStart(12)}`);
    }
  }

  console.log('\n' + '='.repeat(60));
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});

#!/usr/bin/env npx tsx
/**
 * Bulk Court Records Sync — Ohio Officials
 *
 * Same logic as sync-court-records-fl.ts but targets OH politicians.
 *
 * Usage:
 *   npx tsx scripts/sync-court-records-oh.ts
 *   npx tsx scripts/sync-court-records-oh.ts --dry-run
 *   npx tsx scripts/sync-court-records-oh.ts --limit 50
 *   npx tsx scripts/sync-court-records-oh.ts --force
 *   npx tsx scripts/sync-court-records-oh.ts --verbose
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { searchCourtRecords, type CourtRecord } from '../lib/courtlistener-client';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const DELAY_MS = 600;
const BATCH_SIZE = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toStorableFormat(records: CourtRecord[]) {
  return records.map((r) => ({
    id: r.id,
    case_name: r.caseName,
    case_name_short: r.caseNameShort,
    court: r.court,
    court_id: r.courtId,
    docket_number: r.docketNumber,
    date_filed: r.dateFiled,
    date_terminated: r.dateTerminated,
    cause: r.cause,
    nature_of_suit: r.natureOfSuit,
    jurisdiction_type: r.jurisdictionType,
    url: r.url,
    source: r.source,
  }));
}

interface PoliticianRow {
  bioguide_id: string;
  name: string;
  court_records: unknown;
}

async function fetchOhPoliticians(force: boolean): Promise<PoliticianRow[]> {
  const all: PoliticianRow[] = [];
  let offset = 0;

  while (true) {
    let query = supabase
      .from('politicians')
      .select('bioguide_id, name, court_records')
      .like('bioguide_id', 'oh-%')
      .range(offset, offset + BATCH_SIZE - 1);

    if (!force) {
      query = query.is('court_records', null);
    }

    const { data, error } = await query;
    if (error) {
      console.error(`Query error at offset ${offset}:`, error.message);
      break;
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    offset += BATCH_SIZE;
    if (data.length < BATCH_SIZE) break;
  }

  return all;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const verbose = args.includes('--verbose');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;

  console.log('=== Court Records Sync — Ohio Officials ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Force re-fetch: ${force ? 'yes' : 'no (skipping with existing data)'}`);
  if (limit !== Infinity) console.log(`Limit: ${limit}`);
  console.log();

  const politicians = await fetchOhPoliticians(force);
  const toProcess = politicians.slice(0, limit);

  console.log(`Found ${politicians.length} OH officials ${force ? '(all)' : '(without court records)'}`);
  console.log(`Processing ${toProcess.length} officials...`);
  console.log();

  let synced = 0;
  let withRecords = 0;
  let errors = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const p = toProcess[i];
    const progress = `[${i + 1}/${toProcess.length}]`;

    try {
      const log: string[] = [];
      const records = await searchCourtRecords(p.name, log);

      if (verbose) {
        for (const line of log) console.log(`  ${line}`);
      }

      if (records.length > 0) withRecords++;

      if (!dryRun) {
        const { error: updateError } = await supabase
          .from('politicians')
          .update({
            court_records: toStorableFormat(records),
            updated_at: new Date().toISOString(),
          })
          .eq('bioguide_id', p.bioguide_id);

        if (updateError) {
          console.error(`${progress} ✗ ${p.name} — DB error: ${updateError.message}`);
          errors++;
        } else {
          console.log(`${progress} ✓ ${p.name} — ${records.length} records`);
          synced++;
        }
      } else {
        console.log(`${progress} [DRY] ${p.name} — would store ${records.length} records`);
        synced++;
      }

      await sleep(DELAY_MS);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Rate limited') || message.includes('429')) {
        console.error(`\n⚠ Rate limited at ${progress}. Stopping.`);
        break;
      }
      console.error(`${progress} ✗ ${p.name} — ${message}`);
      errors++;
    }
  }

  console.log();
  console.log('=== Summary ===');
  console.log(`Processed:    ${synced + errors}`);
  console.log(`Updated:      ${synced}`);
  console.log(`With records: ${withRecords}`);
  console.log(`Errors:       ${errors}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

import { NextRequest } from 'next/server';
import { verifyCronAuth, cronResponse } from '@/lib/cron-auth';
import { getServiceRoleSupabase } from '@/lib/supabase-server';
import { searchCourtRecords, type CourtRecord } from '@/lib/courtlistener-client';

/**
 * GET /api/cron/sync-court-records
 *
 * Recurring cron job that searches CourtListener for court records
 * involving ALL politicians in the database — not limited to a single state.
 *
 * Schedule: every ~65 minutes (5 * * * * — hourly, with overlap buffer)
 *
 * What it does:
 *   1. Loads politicians without court_records (null) — all states
 *   2. If none remain, refreshes the oldest-updated records
 *   3. Searches CourtListener for dockets + opinions by name
 *   4. Stores court records in the politicians JSONB field
 *
 * Rate limits:
 *   - CourtListener authenticated: 5,000 queries/hour
 *   - Each politician = 2 API calls (dockets + opinions)
 *   - 600ms delay between politicians
 *   - Vercel serverless max: 300s → ~250 politicians per run
 *   - At hourly runs: ~6,000 politicians/day throughput
 */

const MAX_POLITICIANS_PER_RUN = 250;
const DELAY_BETWEEN_POLITICIANS_MS = 600;
const BATCH_SIZE = 1000; // Supabase pagination

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface PoliticianRow {
  bioguide_id: string;
  name: string;
  court_records: unknown;
}

async function fetchPoliticiansWithoutCourtRecords(
  supabase: ReturnType<typeof getServiceRoleSupabase>,
  limit: number,
): Promise<PoliticianRow[]> {
  if (!supabase) return [];
  const all: PoliticianRow[] = [];
  let offset = 0;

  while (all.length < limit) {
    const batchLimit = Math.min(BATCH_SIZE, limit - all.length);
    const { data, error } = await supabase
      .from('politicians')
      .select('bioguide_id, name, court_records')
      .is('court_records', null)
      .range(offset, offset + batchLimit - 1);

    if (error || !data || data.length === 0) break;
    all.push(...data);
    offset += batchLimit;
    if (data.length < batchLimit) break;
  }

  return all.slice(0, limit);
}

async function fetchStalestCourtRecords(
  supabase: ReturnType<typeof getServiceRoleSupabase>,
  limit: number,
): Promise<PoliticianRow[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from('politicians')
    .select('bioguide_id, name, court_records')
    .not('court_records', 'is', null)
    .order('updated_at', { ascending: true })
    .limit(limit);

  return data || [];
}

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const startTime = Date.now();
  const log: string[] = [];
  let syncedCount = 0;
  let withRecordsCount = 0;
  let errorCount = 0;
  const errors: Array<{ politicianId: string; error: string }> = [];

  try {
    const supabase = getServiceRoleSupabase();
    if (!supabase) {
      return cronResponse('sync-court-records', {
        success: false, synced: 0, errors: 1,
        details: { log: ['No database access'], message: 'No database access' },
        duration_ms: Date.now() - startTime,
      });
    }

    // Priority 1: politicians with no court records at all
    let toProcess = await fetchPoliticiansWithoutCourtRecords(supabase, MAX_POLITICIANS_PER_RUN);
    log.push(`Politicians without court records: ${toProcess.length}`);

    // Priority 2: if all have been searched, refresh the stalest records
    if (toProcess.length === 0) {
      toProcess = await fetchStalestCourtRecords(supabase, MAX_POLITICIANS_PER_RUN);
      log.push(`Refreshing ${toProcess.length} stale records`);
    }

    if (toProcess.length === 0) {
      log.push('No politicians to process');
      return cronResponse('sync-court-records', {
        success: true, synced: 0, errors: 0,
        details: { log },
        duration_ms: Date.now() - startTime,
      });
    }

    log.push(`Processing ${toProcess.length} politicians...`);

    for (let i = 0; i < toProcess.length; i++) {
      const politician = toProcess[i];

      // Safety: stop if we're approaching the 300s Vercel limit
      const elapsed = Date.now() - startTime;
      if (elapsed > 270_000) {
        log.push(`Stopping at ${i}/${toProcess.length} — approaching 300s timeout`);
        break;
      }

      try {
        const records: CourtRecord[] = await searchCourtRecords(politician.name, log);

        if (records.length > 0) withRecordsCount++;

        const courtRecordsJson = records.map((r) => ({
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

        const { error: updateError } = await supabase
          .from('politicians')
          .update({
            court_records: courtRecordsJson,
            updated_at: new Date().toISOString(),
          })
          .eq('bioguide_id', politician.bioguide_id);

        if (updateError) {
          errorCount++;
          errors.push({ politicianId: politician.bioguide_id, error: updateError.message });
        } else {
          syncedCount++;
        }

        await sleep(DELAY_BETWEEN_POLITICIANS_MS);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errorCount++;
        errors.push({ politicianId: politician.bioguide_id, error: message });

        if (message.includes('Rate limited') || message.includes('429')) {
          log.push(`Rate limited at ${i + 1}/${toProcess.length}. Stopping — will resume next run.`);
          break;
        }
      }
    }

    log.push(`Done: ${syncedCount} synced, ${withRecordsCount} with records, ${errorCount} errors`);

    return cronResponse('sync-court-records', {
      success: errorCount === 0,
      synced: syncedCount,
      errors: errorCount,
      details: {
        politicians_processed: syncedCount + errorCount,
        with_records: withRecordsCount,
        log,
        ...(errors.length > 0 ? { errors } : {}),
      },
      duration_ms: Date.now() - startTime,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.push(`Fatal error: ${message}`);

    return cronResponse('sync-court-records', {
      success: false, synced: syncedCount, errors: errorCount + 1,
      details: { log, fatalError: message },
      duration_ms: Date.now() - startTime,
    });
  }
}

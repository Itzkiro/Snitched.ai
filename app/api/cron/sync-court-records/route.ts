import { NextRequest } from 'next/server';
import { verifyCronAuth, cronResponse } from '@/lib/cron-auth';
import { getServiceRoleSupabase } from '@/lib/supabase-server';
import { searchCourtRecords, type CourtRecord } from '@/lib/courtlistener-client';

/**
 * GET /api/cron/sync-court-records
 *
 * Daily cron job that searches CourtListener for court records
 * involving tracked politicians and candidates.
 *
 * Schedule: 0 1 * * * (1 AM UTC daily)
 *
 * What it does:
 *   1. Loads politicians/candidates from Supabase
 *   2. Searches CourtListener for dockets + opinions by name
 *   3. Stores court records in the politicians JSONB field
 *
 * Rate limits:
 *   - CourtListener: 5,000 queries/hour (authenticated)
 *   - We use 500ms delays between politicians
 *   - Stop immediately on 429
 */

const MAX_POLITICIANS_PER_RUN = 30;
const DELAY_BETWEEN_POLITICIANS_MS = 500;

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const startTime = Date.now();
  const log: string[] = [];
  let syncedCount = 0;
  let errorCount = 0;
  const errors: Array<{ politicianId: string; error: string }> = [];

  try {
    const supabase = getServiceRoleSupabase();
    log.push(`Database access: ${supabase ? 'yes' : 'no'}`);

    if (!supabase) {
      return cronResponse('sync-court-records', {
        success: false, synced: 0, errors: 1,
        details: { log, message: 'No database access' },
        duration_ms: Date.now() - startTime,
      });
    }

    // Load politicians — prioritize candidates and those without court data
    // First: candidates without court records
    const { data: candidates } = await supabase
      .from('politicians')
      .select('bioguide_id, name, court_records')
      .eq('is_candidate', true)
      .is('court_records', null)
      .limit(MAX_POLITICIANS_PER_RUN);

    // Then: active politicians without court records
    const remaining = MAX_POLITICIANS_PER_RUN - (candidates?.length || 0);
    const { data: officials } = remaining > 0
      ? await supabase
          .from('politicians')
          .select('bioguide_id, name, court_records')
          .eq('is_active', true)
          .is('court_records', null)
          .limit(remaining)
      : { data: [] };

    const toProcess = [...(candidates || []), ...(officials || [])];
    log.push(`Politicians to process: ${toProcess.length} (${candidates?.length || 0} candidates, ${officials?.length || 0} officials)`);

    if (toProcess.length === 0) {
      // Re-check oldest updated ones for refresh
      const { data: stale } = await supabase
        .from('politicians')
        .select('bioguide_id, name, court_records')
        .or('is_candidate.eq.true,is_active.eq.true')
        .not('court_records', 'is', null)
        .order('updated_at', { ascending: true })
        .limit(MAX_POLITICIANS_PER_RUN);

      if (stale && stale.length > 0) {
        toProcess.push(...stale);
        log.push(`Refreshing ${stale.length} stale records`);
      }
    }

    for (const politician of toProcess) {
      try {
        log.push(`Processing: ${politician.name}`);

        const records: CourtRecord[] = await searchCourtRecords(politician.name, log);

        // Convert to storable format
        const courtRecordsJson = records.map(r => ({
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

        // Update politician record
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
          log.push(`  DB update failed: ${updateError.message}`);
        } else {
          syncedCount++;
          log.push(`  Stored ${records.length} court records`);
        }

        await sleep(DELAY_BETWEEN_POLITICIANS_MS);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errorCount++;
        errors.push({ politicianId: politician.bioguide_id, error: message });
        log.push(`  ERROR: ${message}`);

        if (message.includes('Rate limited') || message.includes('429')) {
          log.push('Rate limited by CourtListener. Stopping sync.');
          break;
        }
      }
    }

    log.push(`Sync complete: ${syncedCount} synced, ${errorCount} errors`);

    return cronResponse('sync-court-records', {
      success: errorCount === 0,
      synced: syncedCount,
      errors: errorCount,
      details: {
        politicians_processed: toProcess.length,
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

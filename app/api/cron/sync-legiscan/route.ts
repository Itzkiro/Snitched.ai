import { NextRequest } from 'next/server';
import { verifyCronAuth, cronResponse } from '@/lib/cron-auth';
import { getServiceRoleSupabase } from '@/lib/supabase-server';

/**
 * GET /api/cron/sync-legiscan
 *
 * Daily cron job that syncs FL state legislature activity from LegiScan.
 * Schedule: Every day at 5:00 AM UTC (0 5 * * *)
 *
 * What it does:
 *   1. Fetches the current FL legislative session info
 *   2. Gets the master bill list for the active session
 *   3. For recently updated bills, fetches full details and roll-call votes
 *   4. Upserts bill data and vote records to the database
 *
 * Session awareness:
 *   - FL legislature typically meets January through March/April
 *   - During session: syncs daily with larger batch sizes
 *   - Off-session: syncs weekly (still runs daily but skips if no changes)
 *
 * Rate limit awareness:
 *   - LegiScan free tier: 30,000 requests/month (~1,000/day)
 *   - We limit to ~200 requests per run to stay well under
 */

const LEGISCAN_BASE = 'https://api.legiscan.com/';
const MAX_BILLS_PER_RUN = 50;
const DELAY_BETWEEN_REQUESTS_MS = 300;

// FL session typically runs Jan-April
const FL_SESSION_MONTHS = [1, 2, 3, 4]; // January through April

export const maxDuration = 300; // Allow up to 5 minutes
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const startTime = Date.now();
  const log: string[] = [];
  let syncedBills = 0;
  let syncedVotes = 0;
  let errorCount = 0;

  const apiKey = process.env.LEGISCAN_API_KEY;
  if (!apiKey) {
    return cronResponse('sync-legiscan', {
      success: false,
      synced: 0,
      errors: 1,
      details: { error: 'LEGISCAN_API_KEY is not configured' },
      duration_ms: Date.now() - startTime,
    });
  }

  const supabase = getServiceRoleSupabase();
  const hasDatabaseAccess = !!supabase;
  log.push(`Database access: ${hasDatabaseAccess ? 'yes' : 'no (dry run)'}`);

  // Check if we're in session
  const currentMonth = new Date().getMonth() + 1;
  const isInSession = FL_SESSION_MONTHS.includes(currentMonth);
  log.push(`FL session status: ${isInSession ? 'IN SESSION' : 'off-session'}`);

  try {
    // -----------------------------------------------------------------------
    // Step 1: Get FL session list to find the active session
    // -----------------------------------------------------------------------
    log.push('--- Fetching FL session list ---');

    const sessionListUrl = `${LEGISCAN_BASE}?key=${apiKey}&op=getSessionList&state=FL`;
    const sessionListRes = await fetch(sessionListUrl);

    if (!sessionListRes.ok) {
      log.push(`Session list fetch failed: ${sessionListRes.status}`);
      return cronResponse('sync-legiscan', {
        success: false,
        synced: 0,
        errors: 1,
        details: { error: `LegiScan API returned ${sessionListRes.status}`, log },
        duration_ms: Date.now() - startTime,
      });
    }

    const sessionListData = await sessionListRes.json();
    if (sessionListData.status === 'ERROR') {
      const errorMsg = sessionListData.alert?.message || 'Unknown LegiScan error';
      log.push(`LegiScan error: ${errorMsg}`);
      return cronResponse('sync-legiscan', {
        success: false,
        synced: 0,
        errors: 1,
        details: { error: errorMsg, log },
        duration_ms: Date.now() - startTime,
      });
    }

    // Find the most recent session
    const sessions = sessionListData.sessions || {};
    const sessionEntries = Object.values(sessions) as Array<{
      session_id: number;
      session_title: string;
      year_start: number;
      year_end: number;
      special: number;
    }>;

    if (sessionEntries.length === 0) {
      log.push('No FL sessions found');
      return cronResponse('sync-legiscan', {
        success: true,
        synced: 0,
        errors: 0,
        details: { message: 'No FL sessions found', log },
        duration_ms: Date.now() - startTime,
      });
    }

    // Sort by year descending and pick the first (most recent) regular session
    sessionEntries.sort((a, b) => b.year_start - a.year_start);
    const activeSession = sessionEntries.find((s) => s.special === 0) || sessionEntries[0];
    const sessionId = activeSession.session_id;

    log.push(`Active session: ${activeSession.session_title} (ID: ${sessionId})`);

    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));

    // -----------------------------------------------------------------------
    // Step 2: Get master bill list for the active session
    // -----------------------------------------------------------------------
    log.push('--- Fetching master bill list ---');

    const masterListUrl = `${LEGISCAN_BASE}?key=${apiKey}&op=getMasterList&id=${sessionId}`;
    const masterListRes = await fetch(masterListUrl);

    if (!masterListRes.ok) {
      log.push(`Master list fetch failed: ${masterListRes.status}`);
      errorCount++;
      return cronResponse('sync-legiscan', {
        success: false,
        synced: 0,
        errors: 1,
        details: { error: `Master list fetch failed: ${masterListRes.status}`, log },
        duration_ms: Date.now() - startTime,
      });
    }

    const masterListData = await masterListRes.json();
    if (masterListData.status === 'ERROR') {
      const errorMsg = masterListData.alert?.message || 'Unknown error';
      log.push(`Master list error: ${errorMsg}`);
      return cronResponse('sync-legiscan', {
        success: false,
        synced: 0,
        errors: 1,
        details: { error: errorMsg, log },
        duration_ms: Date.now() - startTime,
      });
    }

    const masterList = masterListData.masterlist || {};
    // masterlist has a "session" key and then bill entries keyed by position number
    const { session: sessionMeta, ...billEntries } = masterList;

    const allBills = Object.values(billEntries) as Array<{
      bill_id: number;
      number: string;
      change_hash: string;
      status: number;
      status_date: string;
      last_action_date: string;
      last_action: string;
      title: string;
      description: string;
      url: string;
    }>;

    log.push(`Master list contains ${allBills.length} bills`);

    // -----------------------------------------------------------------------
    // Step 3: Determine which bills need syncing
    // -----------------------------------------------------------------------
    // During session: sync recently updated bills (last 2 days)
    // Off-session: sync recently updated bills (last 7 days)
    const lookbackDays = isInSession ? 2 : 7;
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);
    const lookbackStr = lookbackDate.toISOString().split('T')[0]; // YYYY-MM-DD

    const recentBills = allBills
      .filter((b) => b.last_action_date >= lookbackStr)
      .slice(0, MAX_BILLS_PER_RUN);

    log.push(
      `Bills updated in last ${lookbackDays} days: ${recentBills.length} ` +
      `(processing up to ${MAX_BILLS_PER_RUN})`,
    );

    if (recentBills.length === 0) {
      log.push('No recently updated bills to sync');
      return cronResponse('sync-legiscan', {
        success: true,
        synced: 0,
        errors: 0,
        details: {
          session: activeSession.session_title,
          session_id: sessionId,
          total_bills: allBills.length,
          lookback_days: lookbackDays,
          message: 'No recently updated bills',
          log,
        },
        duration_ms: Date.now() - startTime,
      });
    }

    // -----------------------------------------------------------------------
    // Step 4: Fetch full details for each recently updated bill
    // -----------------------------------------------------------------------
    log.push('--- Syncing bill details ---');

    for (const billEntry of recentBills) {
      try {
        await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));

        const billUrl = `${LEGISCAN_BASE}?key=${apiKey}&op=getBill&id=${billEntry.bill_id}`;
        const billRes = await fetch(billUrl);

        if (billRes.status === 429) {
          log.push('Rate limited by LegiScan. Stopping sync.');
          break;
        }

        if (!billRes.ok) {
          log.push(`  ${billEntry.number}: fetch failed (${billRes.status})`);
          errorCount++;
          continue;
        }

        const billData = await billRes.json();
        if (billData.status === 'ERROR') {
          log.push(`  ${billEntry.number}: API error`);
          errorCount++;
          continue;
        }

        const bill = billData.bill;

        // Upsert bill to database
        if (supabase && bill) {
          const billId = `legiscan-fl-${bill.bill_id}`;
          const { error: upsertError } = await supabase.from('bills').upsert(
            {
              id: billId,
              bill_type: bill.bill_type || '',
              bill_number: bill.bill_number || billEntry.number,
              title: bill.title || '',
              description: bill.description || '',
              state: 'FL',
              session_id: sessionId,
              session_title: activeSession.session_title,
              status: bill.status,
              status_desc: mapLegiScanStatus(bill.status),
              introduced_date: bill.history?.[0]?.date || null,
              latest_action_date: billEntry.last_action_date,
              latest_action_text: billEntry.last_action,
              sponsors_count: (bill.sponsors || []).length,
              source: 'legiscan',
              source_url: bill.state_link || bill.url || '',
              change_hash: billEntry.change_hash,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' },
          );

          if (upsertError) {
            log.push(`  ${billEntry.number}: DB error - ${upsertError.message}`);
            errorCount++;
          } else {
            syncedBills++;
          }

          // Step 5: Sync roll-call votes for this bill
          const rollCalls = bill.votes || [];
          for (const rc of rollCalls) {
            try {
              await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));

              const rcUrl = `${LEGISCAN_BASE}?key=${apiKey}&op=getRollCall&id=${rc.roll_call_id}`;
              const rcRes = await fetch(rcUrl);

              if (rcRes.status === 429) {
                log.push('Rate limited during vote sync. Stopping.');
                break;
              }

              if (!rcRes.ok) continue;

              const rcData = await rcRes.json();
              if (rcData.status === 'ERROR') continue;

              const rollCall = rcData.roll_call;
              if (!rollCall) continue;

              // Upsert the roll call record
              const voteId = `legiscan-rc-${rollCall.roll_call_id}`;
              await supabase.from('votes').upsert(
                {
                  id: voteId,
                  bill_id: billId,
                  roll_call_id: rollCall.roll_call_id,
                  vote_date: rollCall.date,
                  description: rollCall.desc || '',
                  chamber: rollCall.chamber === 'H' ? 'House' : 'Senate',
                  yea_count: rollCall.yea,
                  nay_count: rollCall.nay,
                  nv_count: rollCall.nv,
                  absent_count: rollCall.absent,
                  passed: rollCall.passed === 1,
                  source: 'legiscan',
                  updated_at: new Date().toISOString(),
                },
                { onConflict: 'id' },
              );

              // Upsert individual politician votes
              const individualVotes = rollCall.votes || [];
              for (const iv of individualVotes) {
                const pvId = `${voteId}-${iv.people_id}`;
                await supabase.from('politician_votes').upsert(
                  {
                    id: pvId,
                    vote_id: voteId,
                    people_id: iv.people_id,
                    position: iv.vote_text || mapVoteValue(iv.vote_id),
                    updated_at: new Date().toISOString(),
                  },
                  { onConflict: 'id' },
                );
              }

              syncedVotes++;
            } catch {
              // Roll call sync is best-effort
            }
          }
        }

        log.push(
          `  ${billEntry.number}: "${bill?.title?.substring(0, 60) || 'untitled'}..." ` +
          `(${(bill?.votes || []).length} roll calls)`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.push(`  ${billEntry.number}: ERROR - ${msg}`);
        errorCount++;

        if (msg.includes('rate limit') || msg.includes('429')) {
          log.push('Rate limited. Stopping bill sync.');
          break;
        }
      }
    }

    log.push(
      `Sync complete: ${syncedBills} bills, ${syncedVotes} roll calls, ${errorCount} errors`,
    );

    return cronResponse('sync-legiscan', {
      success: errorCount === 0,
      synced: syncedBills + syncedVotes,
      errors: errorCount,
      details: {
        session: activeSession.session_title,
        session_id: sessionId,
        is_in_session: isInSession,
        total_bills_in_session: allBills.length,
        bills_checked: recentBills.length,
        bills_synced: syncedBills,
        roll_calls_synced: syncedVotes,
        lookback_days: lookbackDays,
        log,
      },
      duration_ms: Date.now() - startTime,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.push(`Fatal error: ${message}`);

    return cronResponse('sync-legiscan', {
      success: false,
      synced: syncedBills + syncedVotes,
      errors: errorCount + 1,
      details: { log, fatalError: message },
      duration_ms: Date.now() - startTime,
    });
  }
}

/** Map LegiScan status codes to human-readable strings */
function mapLegiScanStatus(status: number): string {
  const statusMap: Record<number, string> = {
    1: 'Introduced',
    2: 'Engrossed',
    3: 'Enrolled',
    4: 'Passed',
    5: 'Vetoed',
    6: 'Failed',
  };
  return statusMap[status] || `Status ${status}`;
}

/** Map LegiScan vote_id codes to position strings */
function mapVoteValue(voteId: number): string {
  const voteMap: Record<number, string> = {
    1: 'Yea',
    2: 'Nay',
    3: 'NV',
    4: 'Absent',
  };
  return voteMap[voteId] || 'Unknown';
}

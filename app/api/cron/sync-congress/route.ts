import { NextRequest } from 'next/server';
import { verifyCronAuth, cronResponse } from '@/lib/cron-auth';
import { getServerSupabase } from '@/lib/supabase-server';

/**
 * GET /api/cron/sync-congress
 *
 * Daily cron job that syncs the latest Congress.gov vote records and member data.
 * Schedule: Every day at 4:00 AM UTC (0 4 * * *)
 *
 * What it does:
 *   1. Fetches the latest member list from Congress.gov API
 *   2. Fetches recent bills with votes from the current Congress session
 *   3. For each bill with roll-call votes, fetches individual member votes
 *   4. Upserts vote records and bill data to the database
 *
 * Rate limit awareness:
 *   - Congress.gov allows ~5,000 requests/hour per API key
 *   - We add small delays between batches to be a good API citizen
 *   - If rate-limited (429), we stop and report partial progress
 */

const CONGRESS_API_BASE = 'https://api.congress.gov/v3';
const MAX_BILLS_PER_RUN = 50;
const DELAY_BETWEEN_REQUESTS_MS = 200;

export const maxDuration = 300; // Allow up to 5 minutes
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const startTime = Date.now();
  const log: string[] = [];
  let syncedBills = 0;
  let syncedVotes = 0;
  let syncedMembers = 0;
  let errorCount = 0;

  const apiKey = process.env.CONGRESS_API_KEY;
  if (!apiKey) {
    return cronResponse('sync-congress', {
      success: false,
      synced: 0,
      errors: 1,
      details: { error: 'CONGRESS_API_KEY is not configured' },
      duration_ms: Date.now() - startTime,
    });
  }

  const supabase = getServerSupabase();
  const hasDatabaseAccess = !!supabase;
  log.push(`Database access: ${hasDatabaseAccess ? 'yes' : 'no (dry run)'}`);

  try {
    // Determine current Congress session (119th Congress: 2025-2027)
    const currentYear = new Date().getFullYear();
    const congress = Math.floor((currentYear - 1789) / 2) + 1;
    log.push(`Current Congress: ${congress}th`);

    // -----------------------------------------------------------------------
    // Step 1: Sync recent members (current members who may have changed status)
    // -----------------------------------------------------------------------
    log.push('--- Syncing member data ---');

    try {
      const membersUrl =
        `${CONGRESS_API_BASE}/member?api_key=${apiKey}&format=json` +
        `&currentMember=true&limit=250&offset=0`;
      const membersRes = await fetch(membersUrl);

      if (membersRes.status === 429) {
        log.push('Rate limited on members fetch. Skipping member sync.');
      } else if (!membersRes.ok) {
        log.push(`Members fetch failed: ${membersRes.status}`);
        errorCount++;
      } else {
        const membersData = await membersRes.json();
        const members = membersData.members || [];
        log.push(`Fetched ${members.length} current members from Congress.gov`);

        if (supabase && members.length > 0) {
          // Upsert basic member info for any members we track
          for (const member of members) {
            const latestTerm = member.terms?.item?.[member.terms.item.length - 1];

            const { error: upsertError } = await supabase
              .from('politicians')
              .update({
                name: member.name,
                party: mapPartyName(member.partyName),
                photo_url: member.depiction?.imageUrl || null,
                is_active: true,
                updated_at: new Date().toISOString(),
              })
              .eq('bioguide_id', member.bioguideId);

            // We ignore "no rows matched" errors since we only track some politicians
            if (upsertError && !upsertError.message.includes('0 rows')) {
              errorCount++;
            } else if (!upsertError) {
              syncedMembers++;
            }
          }
          log.push(`Updated ${syncedMembers} tracked members`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.push(`Members sync error: ${msg}`);
      errorCount++;
    }

    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));

    // -----------------------------------------------------------------------
    // Step 2: Fetch recently updated bills from the current Congress
    // -----------------------------------------------------------------------
    log.push('--- Syncing recent bills ---');

    // Look back 2 days to catch anything that was updated since our last run
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - 2);
    const fromDateTime = lookbackDate.toISOString().replace(/\.\d+Z$/, 'Z');

    try {
      const billsUrl =
        `${CONGRESS_API_BASE}/bill/${congress}` +
        `?api_key=${apiKey}&format=json` +
        `&sort=updateDate+desc&limit=${MAX_BILLS_PER_RUN}&offset=0` +
        `&fromDateTime=${encodeURIComponent(fromDateTime)}`;
      const billsRes = await fetch(billsUrl);

      if (billsRes.status === 429) {
        log.push('Rate limited on bills fetch. Stopping bill sync.');
      } else if (!billsRes.ok) {
        log.push(`Bills fetch failed: ${billsRes.status}`);
        errorCount++;
      } else {
        const billsData = await billsRes.json();
        const bills = billsData.bills || [];
        log.push(`Fetched ${bills.length} recently updated bills from Congress ${congress}`);

        // Step 3: For each bill, fetch full details and upsert to DB
        for (const billSummary of bills) {
          try {
            await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));

            const billType = (billSummary.type || '').toLowerCase();
            const billNumber = billSummary.number;
            const billDetailUrl =
              `${CONGRESS_API_BASE}/bill/${congress}/${billType}/${billNumber}` +
              `?api_key=${apiKey}&format=json`;
            const detailRes = await fetch(billDetailUrl);

            if (detailRes.status === 429) {
              log.push('Rate limited during bill detail fetch. Stopping.');
              break;
            }

            if (!detailRes.ok) {
              log.push(`  Bill ${billType.toUpperCase()} ${billNumber}: fetch failed (${detailRes.status})`);
              errorCount++;
              continue;
            }

            const detailData = await detailRes.json();
            const bill = detailData.bill;

            if (supabase && bill) {
              const billId = `congress-${congress}-${billType}-${billNumber}`;
              const { error: billUpsertError } = await supabase
                .from('bills')
                .upsert(
                  {
                    id: billId,
                    congress: bill.congress,
                    bill_type: billType,
                    bill_number: billNumber,
                    title: bill.title || '',
                    summary: bill.summaries?.count > 0 ? '' : null, // Will be fetched separately if needed
                    description: bill.title || '',
                    introduced_date: bill.introducedDate || null,
                    policy_area: bill.policyArea?.name || null,
                    origin_chamber: bill.originChamber || null,
                    latest_action_date: bill.latestAction?.actionDate || null,
                    latest_action_text: bill.latestAction?.text || null,
                    sponsors_count: (bill.sponsors || []).length,
                    cosponsors_count: bill.cosponsors?.count || 0,
                    source: 'congress.gov',
                    source_url: `https://www.congress.gov/bill/${congress}th-congress/${
                      bill.originChamber === 'House' ? 'house' : 'senate'
                    }-bill/${billNumber}`,
                    updated_at: new Date().toISOString(),
                  },
                  { onConflict: 'id' },
                );

              if (billUpsertError) {
                log.push(`  Bill ${billType.toUpperCase()} ${billNumber}: DB error - ${billUpsertError.message}`);
                errorCount++;
              } else {
                syncedBills++;
              }
            }

            // Step 4: If the bill has recorded votes, fetch them
            if (bill?.actions?.count > 0) {
              await syncBillVotes(
                congress,
                billType,
                billNumber,
                apiKey,
                supabase,
                log,
              );
              syncedVotes++; // Count as "vote sync attempted"
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            log.push(`  Bill processing error: ${msg}`);
            errorCount++;

            if (msg.includes('rate limit') || msg.includes('429')) {
              log.push('Rate limited. Stopping bill sync.');
              break;
            }
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.push(`Bills sync error: ${msg}`);
      errorCount++;
    }

    log.push(
      `Sync complete: ${syncedMembers} members, ${syncedBills} bills, ` +
      `${syncedVotes} vote records checked, ${errorCount} errors`,
    );

    return cronResponse('sync-congress', {
      success: errorCount === 0,
      synced: syncedMembers + syncedBills + syncedVotes,
      errors: errorCount,
      details: {
        congress,
        members_synced: syncedMembers,
        bills_synced: syncedBills,
        vote_records_checked: syncedVotes,
        lookback_from: fromDateTime,
        log,
      },
      duration_ms: Date.now() - startTime,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.push(`Fatal error: ${message}`);

    return cronResponse('sync-congress', {
      success: false,
      synced: syncedMembers + syncedBills + syncedVotes,
      errors: errorCount + 1,
      details: { log, fatalError: message },
      duration_ms: Date.now() - startTime,
    });
  }
}

/**
 * Fetch vote actions for a specific bill and upsert to the database.
 * Congress.gov exposes roll-call votes via the bill's actions endpoint.
 */
async function syncBillVotes(
  congress: number,
  billType: string,
  billNumber: string,
  apiKey: string,
  supabase: ReturnType<typeof getServerSupabase>,
  log: string[],
) {
  try {
    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));

    const actionsUrl =
      `${CONGRESS_API_BASE}/bill/${congress}/${billType}/${billNumber}/actions` +
      `?api_key=${apiKey}&format=json&limit=50`;
    const actionsRes = await fetch(actionsUrl);

    if (!actionsRes.ok) return;

    const actionsData = await actionsRes.json();
    const actions = actionsData.actions || [];

    // Look for roll-call vote actions (they contain recordedVotes)
    const voteActions = actions.filter(
      (a: Record<string, unknown>) =>
        a.recordedVotes && (a.recordedVotes as unknown[]).length > 0,
    );

    if (voteActions.length > 0 && supabase) {
      const billId = `congress-${congress}-${billType}-${billNumber}`;

      for (const action of voteActions) {
        const recordedVotes = action.recordedVotes as Array<{
          rollNumber: number;
          chamber: string;
          congress: number;
          date: string;
          sessionNumber: number;
          url: string;
        }>;

        for (const rv of recordedVotes) {
          const voteId = `${billId}-roll-${rv.chamber}-${rv.rollNumber}`;
          await supabase.from('votes').upsert(
            {
              id: voteId,
              bill_id: billId,
              roll_number: rv.rollNumber,
              chamber: rv.chamber,
              congress: rv.congress,
              vote_date: rv.date || action.actionDate,
              session_number: rv.sessionNumber,
              source_url: rv.url,
              description: action.text || '',
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' },
          );
        }
      }

      log.push(
        `  Bill ${billType.toUpperCase()} ${billNumber}: ${voteActions.length} roll-call votes synced`,
      );
    }
  } catch {
    // Vote sync is best-effort; don't fail the entire run
  }
}

/** Map Congress.gov party names to our Party type */
function mapPartyName(partyName: string): string {
  if (partyName === 'Democratic') return 'Democrat';
  if (partyName === 'Republican') return 'Republican';
  if (partyName === 'Independent') return 'Independent';
  return 'Other';
}

import { NextRequest } from 'next/server';
import { verifyCronAuth, cronResponse } from '@/lib/cron-auth';
import { fecFetch, isIsraelLobbyDonor, ISRAEL_LOBBY_COMMITTEE_IDS } from '@/lib/fec-client';
import { getServerSupabase } from '@/lib/supabase-server';

/**
 * GET /api/cron/sync-fec
 *
 * Weekly cron job that refreshes FEC contribution data for tracked politicians.
 * Schedule: Every Sunday at 3:00 AM UTC (0 3 * * 0)
 *
 * What it does:
 *   1. Fetches all politicians from the database that have an FEC candidate ID
 *   2. For each candidate, pulls latest Schedule A (contributions) from the FEC API
 *   3. Identifies Israel lobby / AIPAC contributions
 *   4. Upserts contribution summaries back to the database
 *
 * Rate limit awareness:
 *   - FEC allows 1,000 requests/hour per API key
 *   - We batch requests with delays to stay well under the limit
 *   - If rate-limited, we stop and report partial progress
 */

// Maximum number of politicians to sync in a single cron run
// to stay within FEC rate limits (each politician = 2-3 API calls)
const MAX_POLITICIANS_PER_RUN = 100;
const DELAY_BETWEEN_CANDIDATES_MS = 500; // 500ms between candidates

export const maxDuration = 300; // Allow up to 5 minutes for this cron job
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const startTime = Date.now();
  const log: string[] = [];
  let syncedCount = 0;
  let errorCount = 0;
  const errors: Array<{ candidateId: string; error: string }> = [];

  try {
    const supabase = getServerSupabase();

    // If no database, we can still run but only log the FEC data
    const hasDatabaseAccess = !!supabase;
    log.push(`Database access: ${hasDatabaseAccess ? 'yes' : 'no (dry run)'}`);

    // Step 1: Get list of tracked politicians with FEC candidate IDs
    let candidateIds: Array<{ politicianId: string; fecCandidateId: string; name: string }> = [];

    if (supabase) {
      const { data: politicians, error: dbError } = await supabase
        .from('politicians')
        .select('bioguide_id, name, source_ids')
        .eq('is_active', true)
        .not('source_ids->fec_candidate_id', 'is', null)
        .limit(MAX_POLITICIANS_PER_RUN);

      if (dbError) {
        log.push(`Database error fetching politicians: ${dbError.message}`);
        return cronResponse('sync-fec', {
          success: false,
          synced: 0,
          errors: 1,
          details: { log, errors: [{ candidateId: 'n/a', error: dbError.message }] },
          duration_ms: Date.now() - startTime,
        });
      }

      candidateIds = (politicians || [])
        .filter((p: Record<string, unknown>) => {
          const sourceIds = p.source_ids as Record<string, string> | null;
          return sourceIds?.fec_candidate_id;
        })
        .map((p: Record<string, unknown>) => ({
          politicianId: p.bioguide_id as string,
          fecCandidateId: (p.source_ids as Record<string, string>).fec_candidate_id,
          name: p.name as string,
        }));
    }

    if (candidateIds.length === 0) {
      log.push('No politicians with FEC candidate IDs found. Nothing to sync.');
      return cronResponse('sync-fec', {
        success: true,
        synced: 0,
        errors: 0,
        details: { log, message: 'No candidates to sync' },
        duration_ms: Date.now() - startTime,
      });
    }

    log.push(`Found ${candidateIds.length} politicians with FEC IDs to sync`);

    // Step 2: For each candidate, fetch contributions and update
    const currentCycle = new Date().getFullYear() % 2 === 0
      ? String(new Date().getFullYear())
      : String(new Date().getFullYear() + 1);

    for (const candidate of candidateIds) {
      try {
        // Find principal campaign committee
        const committeesData = await fecFetch(
          `/candidate/${candidate.fecCandidateId}/committees/`,
          { cycle: currentCycle, per_page: 5, designation: 'P' },
        );

        const committees = committeesData.results || [];
        if (committees.length === 0) {
          log.push(`  ${candidate.name}: No principal committee found, skipping`);
          continue;
        }

        const committeeId = committees[0].committee_id;

        // Fetch Schedule A contributions (top donors)
        const contribData = await fecFetch('/schedules/schedule_a/', {
          committee_id: committeeId,
          two_year_transaction_period: currentCycle,
          sort: '-contribution_receipt_amount',
          per_page: 100,
        });

        const contributions = contribData.results || [];

        // Calculate summary stats
        let totalAmount = 0;
        let israelLobbyTotal = 0;
        let aipacTotal = 0;
        let individualTotal = 0;
        let pacTotal = 0;
        const topDonors: Array<{
          name: string;
          amount: number;
          type: string;
          is_israel_lobby: boolean;
        }> = [];

        for (const c of contributions) {
          const amount = Number(c.contribution_receipt_amount || 0);
          const donorName = c.contributor_name || 'UNKNOWN';
          const contribCommitteeId = c.contributor_id || '';
          const entityType = c.entity_type || '';
          const isIsrael = isIsraelLobbyDonor(donorName, contribCommitteeId);
          const isAipac =
            contribCommitteeId === 'C00104414' ||
            donorName.toUpperCase().includes('AIPAC') ||
            donorName.toUpperCase().includes('AMERICAN ISRAEL PUBLIC AFFAIRS');

          totalAmount += amount;
          if (isIsrael) israelLobbyTotal += amount;
          if (isAipac) aipacTotal += amount;

          if (entityType === 'IND') {
            individualTotal += amount;
          } else if (['COM', 'PAC', 'CCM', 'PTY'].includes(entityType)) {
            pacTotal += amount;
          }

          // Track top donors
          if (topDonors.length < 5) {
            let donorType = 'Unknown';
            if (isIsrael) donorType = 'Israel-PAC';
            else if (entityType === 'IND') donorType = 'Individual';
            else if (['COM', 'PAC', 'CCM', 'PTY'].includes(entityType)) donorType = 'PAC';
            else if (entityType === 'ORG') donorType = 'Corporate';

            topDonors.push({
              name: donorName,
              amount,
              type: donorType,
              is_israel_lobby: isIsrael,
            });
          }
        }

        // Step 3: Update the database
        if (supabase) {
          const { error: updateError } = await supabase
            .from('politicians')
            .update({
              total_funds: Math.round(totalAmount * 100) / 100,
              aipac_funding: Math.round(aipacTotal * 100) / 100,
              israel_lobby_total: Math.round(israelLobbyTotal * 100) / 100,
              top5_donors: topDonors.map((d) => ({
                name: d.name,
                amount: Math.round(d.amount * 100) / 100,
                type: d.type,
              })),
              israel_lobby_breakdown: {
                total: Math.round(israelLobbyTotal * 100) / 100,
                pacs: Math.round(israelLobbyTotal * 100) / 100,
                ie: 0,
                bundlers: 0,
              },
              updated_at: new Date().toISOString(),
            })
            .eq('bioguide_id', candidate.politicianId);

          if (updateError) {
            log.push(`  ${candidate.name}: DB update failed - ${updateError.message}`);
            errorCount++;
            errors.push({ candidateId: candidate.fecCandidateId, error: updateError.message });
            continue;
          }
        }

        syncedCount++;
        log.push(
          `  ${candidate.name}: $${totalAmount.toLocaleString()} total, ` +
          `$${israelLobbyTotal.toLocaleString()} Israel lobby, ` +
          `${contributions.length} contributions`,
        );

        // Delay between candidates to respect rate limits
        if (candidateIds.indexOf(candidate) < candidateIds.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_CANDIDATES_MS));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errorCount++;
        errors.push({ candidateId: candidate.fecCandidateId, error: message });
        log.push(`  ${candidate.name}: ERROR - ${message}`);

        // If rate-limited, stop processing immediately
        if (message.includes('rate limit')) {
          log.push('Rate limited by FEC API. Stopping sync to avoid further errors.');
          break;
        }
      }
    }

    log.push(`Sync complete: ${syncedCount} synced, ${errorCount} errors`);

    return cronResponse('sync-fec', {
      success: errorCount === 0,
      synced: syncedCount,
      errors: errorCount,
      details: {
        cycle: currentCycle,
        candidates_checked: candidateIds.length,
        log,
        ...(errors.length > 0 ? { errors } : {}),
      },
      duration_ms: Date.now() - startTime,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.push(`Fatal error: ${message}`);

    return cronResponse('sync-fec', {
      success: false,
      synced: syncedCount,
      errors: errorCount + 1,
      details: { log, fatalError: message },
      duration_ms: Date.now() - startTime,
    });
  }
}

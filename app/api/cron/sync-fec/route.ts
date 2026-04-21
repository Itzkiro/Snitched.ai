import { NextRequest } from 'next/server';
import { verifyCronAuth, cronResponse } from '@/lib/cron-auth';
import { fecFetch, isIsraelLobbyDonor, ISRAEL_LOBBY_COMMITTEE_IDS } from '@/lib/fec-client';
import { getServiceRoleSupabase } from '@/lib/supabase-server';

/**
 * GET /api/cron/sync-fec
 *
 * Daily cron job that refreshes FEC contribution data for tracked politicians.
 * Schedule: Every day at 3:00 AM UTC (0 3 * * *)
 *
 * What it does:
 *   1. Fetches all politicians from the database (with or without FEC candidate IDs)
 *   2. For politicians without FEC IDs, attempts name-based lookup and updates source_ids
 *   3. Fetches multi-cycle financial totals (2026, 2024, 2022)
 *   4. Fetches up to 500 contributions from up to 3 committees using cursor pagination
 *   5. Fetches independent expenditures (Schedule E) across cycles
 *   6. Identifies Israel lobby / AIPAC contributions and IEs
 *   7. Upserts comprehensive summaries back to the database
 *
 * Rate limit awareness:
 *   - FEC allows 1,000 requests/hour per API key
 *   - We use 600ms delays between requests to stay under the limit
 *   - If rate-limited (429), we stop immediately and report partial progress
 */

const MAX_POLITICIANS_PER_RUN = 50;
const DELAY_MS = 600; // 600ms between FEC requests
const SYNC_CYCLES = [2026, 2024, 2022];
const MAX_CONTRIBUTIONS_PER_COMMITTEE = 500;
const MAX_COMMITTEES = 3;

export const maxDuration = 300; // Allow up to 5 minutes for this cron job
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Politician {
  bioguide_id: string;
  name: string;
  office?: string;
  office_level?: string;
  source_ids: Record<string, string> | null;
}

interface Contribution {
  donor_name: string;
  amount: number;
  entity_type: string;
  contributor_id: string;
  date: string;
}

interface IndependentExpenditure {
  committee_name: string;
  committee_id: string;
  amount: number;
  support_oppose: string;
  is_israel_lobby: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAipacDonor(donorName: string, committeeId?: string): boolean {
  if (committeeId === 'C00104414' || committeeId === 'C00803833') return true;
  const upper = (donorName || '').toUpperCase();
  return (
    upper.includes('AIPAC') ||
    upper.includes('AMERICAN ISRAEL PUBLIC AFFAIRS') ||
    upper.includes('UNITED DEMOCRACY PROJECT')
  );
}

function classifyDonorType(entityType: string, donorName: string, isIsrael: boolean): string {
  if (isIsrael) return 'Israel-PAC';
  if (entityType === 'IND') return 'Individual';
  if (entityType === 'ORG') return 'Corporate';
  if (['COM', 'PAC', 'CCM', 'PTY'].includes(entityType)) return 'PAC';
  const nameLower = (donorName || '').toLowerCase();
  if (nameLower.includes('pac') || nameLower.includes('committee')) return 'PAC';
  return 'Individual';
}

// ---------------------------------------------------------------------------
// FEC data fetchers
// ---------------------------------------------------------------------------

/**
 * Fetch candidate financial totals for specified cycles.
 * Returns total receipts and disbursements summed across all provided cycles.
 */
async function fetchCandidateTotals(
  candidateId: string,
  cycles: number[],
  log: string[],
): Promise<{ raised: number; disbursed: number }> {
  let totalRaised = 0;
  let totalDisbursed = 0;

  for (const cycle of cycles) {
    try {
      const data = await fecFetch(`/candidate/${candidateId}/totals/`, {
        cycle,
        per_page: 100,
      });
      await sleep(DELAY_MS);

      for (const result of data.results || []) {
        totalRaised += Number(result.receipts || 0);
        totalDisbursed += Number(result.disbursements || 0);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('rate limit') || msg.includes('429')) throw e;
      log.push(`    Warning: totals for cycle ${cycle}: ${msg}`);
    }
  }

  return { raised: totalRaised, disbursed: totalDisbursed };
}

/**
 * Fetch principal campaign committee IDs for a candidate.
 * Tries principal (designation=P) committees first; falls back to all committees.
 * Tries multiple cycles if the primary cycle returns nothing.
 */
async function fetchCandidateCommittees(
  candidateId: string,
  primaryCycle: number,
  fallbackCycles: number[],
  log: string[],
): Promise<string[]> {
  const tryFetch = async (cycle: number, designationP: boolean): Promise<string[]> => {
    const params: Record<string, string | number> = {
      cycle,
      per_page: 10,
    };
    if (designationP) params.designation = 'P';

    const data = await fecFetch(`/candidate/${candidateId}/committees/`, params);
    await sleep(DELAY_MS);

    return (data.results || []).map((r: Record<string, unknown>) => r.committee_id as string).filter(Boolean);
  };

  try {
    // 1. Try principal committees for primary cycle
    let ids = await tryFetch(primaryCycle, true);
    if (ids.length > 0) return ids;

    // 2. Try all committees for primary cycle
    ids = await tryFetch(primaryCycle, false);
    if (ids.length > 0) return ids;

    // 3. Try principal committees for fallback cycles
    for (const cycle of fallbackCycles) {
      ids = await tryFetch(cycle, true);
      if (ids.length > 0) return ids;

      ids = await tryFetch(cycle, false);
      if (ids.length > 0) return ids;
    }

    log.push(`    No committees found for ${candidateId} across any cycle`);
    return [];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('rate limit') || msg.includes('429')) throw e;
    log.push(`    Warning: committees lookup failed: ${msg}`);
    return [];
  }
}

/**
 * Fetch up to `limit` contributions for a committee using cursor-based pagination.
 * Uses last_index + last_contribution_receipt_date for pagination past page 1.
 */
async function fetchContributions(
  committeeId: string,
  cycle: number,
  limit: number,
  log: string[],
): Promise<Contribution[]> {
  const contributions: Contribution[] = [];
  let lastIndex: string | undefined;
  let lastDate: string | undefined;

  try {
    while (contributions.length < limit) {
      const batchSize = Math.min(100, limit - contributions.length);
      const params: Record<string, string | number | undefined> = {
        committee_id: committeeId,
        two_year_transaction_period: cycle,
        sort: '-contribution_receipt_amount',
        per_page: batchSize,
        last_index: lastIndex,
        last_contribution_receipt_date: lastDate,
      };

      const data = await fecFetch('/schedules/schedule_a/', params);
      await sleep(DELAY_MS);

      const results: Record<string, unknown>[] = data.results || [];
      if (results.length === 0) break;

      for (const c of results) {
        contributions.push({
          donor_name: (c.contributor_name as string) || 'UNKNOWN',
          amount: Number(c.contribution_receipt_amount || 0),
          entity_type: (c.entity_type as string) || '',
          contributor_id: (c.contributor_id as string) || '',
          date: (c.contribution_receipt_date as string) || '',
        });
      }

      // Extract pagination cursors from the pagination object
      const pagination = data.pagination as Record<string, unknown> | undefined;
      const newLastIndex = pagination?.last_indexes
        ? (pagination.last_indexes as Record<string, string>).last_index
        : undefined;
      const newLastDate = pagination?.last_indexes
        ? (pagination.last_indexes as Record<string, string>).last_contribution_receipt_date
        : undefined;

      // Stop if no more pages or cursors haven't changed
      if (!newLastIndex || newLastIndex === lastIndex) break;

      lastIndex = newLastIndex;
      lastDate = newLastDate;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('rate limit') || msg.includes('429')) throw e;
    log.push(`    Warning: contributions for committee ${committeeId}: ${msg}`);
  }

  return contributions;
}

/**
 * Fetch independent expenditures (Schedule E) for a candidate.
 * Aggregates by committee. Identifies Israel lobby IEs.
 */
async function fetchIndependentExpenditures(
  candidateId: string,
  cycles: number[],
  log: string[],
): Promise<IndependentExpenditure[]> {
  const byCommittee: Record<
    string,
    { name: string; total: number; support_oppose: string; is_israel_lobby: boolean }
  > = {};

  for (const cycle of cycles) {
    let lastIndex: string | undefined;
    let fetched = 0;
    const MAX_IE = 500;

    try {
      while (fetched < MAX_IE) {
        const params: Record<string, string | number | undefined> = {
          candidate_id: candidateId,
          cycle,
          per_page: 100,
          sort: '-expenditure_amount',
          last_index: lastIndex,
        };

        const data = await fecFetch('/schedules/schedule_e/', params);
        await sleep(DELAY_MS);

        const results = data.results || [];
        if (results.length === 0) break;

        for (const exp of results) {
          const cid = (exp.committee_id as string) || '';
          const cname =
            (exp.committee as Record<string, string> | undefined)?.name ||
            (exp.payee_name as string) ||
            'UNKNOWN';

          if (!byCommittee[cid]) {
            byCommittee[cid] = {
              name: cname,
              total: 0,
              support_oppose: exp.support_oppose_indicator === 'S' ? 'support' : 'oppose',
              is_israel_lobby:
                isIsraelLobbyDonor(cname, cid) || !!ISRAEL_LOBBY_COMMITTEE_IDS[cid],
            };
          }
          byCommittee[cid].total += Number(exp.expenditure_amount || 0);
          fetched++;
        }

        // Pagination cursor
        const pagination = data.pagination as Record<string, unknown> | undefined;
        const newLastIndex = pagination?.last_indexes
          ? (pagination.last_indexes as Record<string, string>).last_index
          : undefined;
        if (!newLastIndex || newLastIndex === lastIndex) break;
        lastIndex = newLastIndex;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('rate limit') || msg.includes('429')) throw e;
      log.push(`    Warning: IEs for cycle ${cycle}: ${msg}`);
    }
  }

  return Object.entries(byCommittee)
    .map(([cid, info]) => ({
      committee_name: info.name,
      committee_id: cid,
      amount: Math.round(info.total),
      support_oppose: info.support_oppose,
      is_israel_lobby: info.is_israel_lobby,
    }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Look up a FEC candidate ID by name, state (FL), and office type.
 * Returns null if no match found.
 */
async function lookupFecCandidateId(
  politician: Politician,
  log: string[],
): Promise<string | null> {
  try {
    const officeCode =
      politician.office_level?.toLowerCase().includes('senator') ||
      politician.office?.toLowerCase().includes('senator')
        ? 'S'
        : 'H';

    const nameParts = (politician.name || '').split(' ');
    const lastName = nameParts[nameParts.length - 1];

    // First try: full name
    const data = await fecFetch('/candidates/search/', {
      name: politician.name,
      state: 'FL',
      office: officeCode,
      sort: '-election_years',
      per_page: 5,
    });
    await sleep(DELAY_MS);

    const candidates = data.results || [];
    if (candidates.length > 0) {
      return (candidates[0] as Record<string, string>).candidate_id || null;
    }

    // Fallback: last name only
    const data2 = await fecFetch('/candidates/search/', {
      name: lastName,
      state: 'FL',
      office: officeCode,
      sort: '-election_years',
      per_page: 10,
    });
    await sleep(DELAY_MS);

    for (const c of data2.results || []) {
      const fecName = ((c as Record<string, string>).name || '').toUpperCase();
      if (fecName.includes(lastName.toUpperCase())) {
        return (c as Record<string, string>).candidate_id || null;
      }
    }

    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('rate limit') || msg.includes('429')) throw e;
    log.push(`    Name lookup error: ${msg}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const startTime = Date.now();
  const log: string[] = [];
  let syncedCount = 0;
  let errorCount = 0;
  const errors: Array<{ candidateId: string; error: string }> = [];

  try {
    const supabase = getServiceRoleSupabase();
    log.push(`Database access: ${supabase ? 'yes' : 'no (dry run)'}`);

    if (!supabase) {
      return cronResponse('sync-fec', {
        success: false,
        synced: 0,
        errors: 1,
        details: { log, message: 'No database access — check Supabase environment variables' },
        duration_ms: Date.now() - startTime,
      });
    }

    // -----------------------------------------------------------------------
    // Step 1: Load politicians — with AND without FEC IDs
    // -----------------------------------------------------------------------

    const { data: withFecRaw, error: err1 } = await supabase
      .from('politicians')
      .select('bioguide_id, name, office, office_level, source_ids, israel_lobby_breakdown, aipac_funding, top5_donors')
      .eq('is_active', true)
      .eq('office_level', 'federal')
      .not('source_ids->fec_candidate_id', 'is', null)
      .limit(MAX_POLITICIANS_PER_RUN);

    if (err1) {
      log.push(`DB error fetching politicians with FEC IDs: ${err1.message}`);
      return cronResponse('sync-fec', {
        success: false,
        synced: 0,
        errors: 1,
        details: { log, errors: [{ candidateId: 'n/a', error: err1.message }] },
        duration_ms: Date.now() - startTime,
      });
    }

    // Also load politicians without FEC IDs so we can attempt name lookup
    const remaining = MAX_POLITICIANS_PER_RUN - (withFecRaw || []).length;
    let withoutFecRaw: Politician[] = [];

    if (remaining > 0) {
      const { data, error: err2 } = await supabase
        .from('politicians')
        .select('bioguide_id, name, office, office_level, source_ids, israel_lobby_breakdown, aipac_funding, top5_donors')
        .eq('is_active', true)
        .eq('office_level', 'federal')
        .or('source_ids->fec_candidate_id.is.null,source_ids.is.null')
        .limit(remaining);

      if (err2) {
        log.push(`Warning: could not fetch politicians without FEC IDs: ${err2.message}`);
      } else {
        withoutFecRaw = (data || []) as Politician[];
      }
    }

    const toProcess: Politician[] = [
      ...((withFecRaw || []) as Politician[]),
      ...withoutFecRaw,
    ];

    if (toProcess.length === 0) {
      log.push('No politicians found to sync.');
      return cronResponse('sync-fec', {
        success: true,
        synced: 0,
        errors: 0,
        details: { log, message: 'No candidates to sync' },
        duration_ms: Date.now() - startTime,
      });
    }

    log.push(
      `Found ${(withFecRaw || []).length} with FEC IDs, ${withoutFecRaw.length} without — processing ${toProcess.length} total`,
    );

    // -----------------------------------------------------------------------
    // Step 2: Process each politician
    // -----------------------------------------------------------------------

    const primaryCycle = SYNC_CYCLES[0];
    const fallbackCycles = SYNC_CYCLES.slice(1);

    for (const politician of toProcess) {
      const candidateName = politician.name;
      let fecCandidateId = politician.source_ids?.fec_candidate_id || null;

      try {
        // --- 2a. Name-based FEC ID lookup if missing --
        if (!fecCandidateId) {
          log.push(`  ${candidateName}: No FEC ID — attempting name lookup...`);
          fecCandidateId = await lookupFecCandidateId(politician, log);

          if (fecCandidateId) {
            log.push(`  ${candidateName}: Found FEC ID via name lookup: ${fecCandidateId}`);
            // Persist discovered FEC ID back to source_ids
            const existingSourceIds = politician.source_ids || {};
            await supabase
              .from('politicians')
              .update({
                source_ids: { ...existingSourceIds, fec_candidate_id: fecCandidateId },
              })
              .eq('bioguide_id', politician.bioguide_id);
          } else {
            log.push(`  ${candidateName}: No FEC ID found, skipping`);
            continue;
          }
        }

        log.push(`  ${candidateName} (${fecCandidateId}): starting sync...`);

        // --- 2b. Multi-cycle financial totals ---
        const totals = await fetchCandidateTotals(fecCandidateId, SYNC_CYCLES, log);
        log.push(
          `  ${candidateName}: totals — $${Math.round(totals.raised).toLocaleString()} raised`,
        );

        // --- 2c. Committee lookup with fallback ---
        const committeeIds = await fetchCandidateCommittees(
          fecCandidateId,
          primaryCycle,
          fallbackCycles,
          log,
        );
        log.push(`  ${candidateName}: found ${committeeIds.length} committee(s)`);

        // --- 2d. Contributions from up to MAX_COMMITTEES committees ---
        // Try primary cycle first; fall back to older cycles if nothing found
        let allContributions: Contribution[] = [];

        for (const committeeId of committeeIds.slice(0, MAX_COMMITTEES)) {
          let contribs: Contribution[] = [];
          for (const cycle of SYNC_CYCLES) {
            contribs = await fetchContributions(
              committeeId,
              cycle,
              MAX_CONTRIBUTIONS_PER_COMMITTEE,
              log,
            );
            if (contribs.length > 0) break;
          }
          allContributions = allContributions.concat(contribs);
          log.push(
            `  ${candidateName}: ${contribs.length} contributions from committee ${committeeId}`,
          );
        }

        // --- 2e. Analyze contributions ---
        let israelLobbyPacTotal = 0;
        let aipacDirect = 0;
        let breakdownAipac = 0;
        let breakdownOtherPACs = 0;
        let breakdownIndividuals = 0;
        let breakdownCorporate = 0;

        const donorAgg: Record<
          string,
          { amount: number; type: string; is_israel_lobby: boolean }
        > = {};

        for (const c of allContributions) {
          const isIsrael = isIsraelLobbyDonor(c.donor_name, c.contributor_id);
          const isAipac = isAipacDonor(c.donor_name, c.contributor_id);
          const donorType = classifyDonorType(c.entity_type, c.donor_name, isIsrael);

          if (isIsrael) israelLobbyPacTotal += c.amount;
          if (isAipac) aipacDirect += c.amount;

          // Accumulate breakdown by category
          if (donorType === 'Israel-PAC') {
            breakdownAipac += c.amount;
          } else if (donorType === 'PAC') {
            breakdownOtherPACs += c.amount;
          } else if (donorType === 'Corporate') {
            breakdownCorporate += c.amount;
          } else {
            breakdownIndividuals += c.amount;
          }

          const key = c.donor_name;
          if (!donorAgg[key]) {
            donorAgg[key] = { amount: 0, type: donorType, is_israel_lobby: isIsrael };
          }
          donorAgg[key].amount += c.amount;
        }

        const top5Donors = Object.entries(donorAgg)
          .map(([name, d]) => ({
            name,
            amount: Math.round(d.amount),
            type: d.type,
            is_israel_lobby: d.is_israel_lobby,
          }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 5)
          .map((d) => ({ name: d.name, amount: d.amount, type: d.type, is_israel_lobby: d.is_israel_lobby }));

        // --- 2f. Independent Expenditures (Schedule E) ---
        const independentExpenditures = await fetchIndependentExpenditures(
          fecCandidateId,
          SYNC_CYCLES,
          log,
        );

        let israelLobbyIeTotal = 0;
        let aipacIe = 0;

        const ieBreakdown = independentExpenditures.map((ie) => {
          if (ie.is_israel_lobby && ie.support_oppose === 'support') {
            israelLobbyIeTotal += ie.amount;
            if (isAipacDonor(ie.committee_name, ie.committee_id)) {
              aipacIe += ie.amount;
            }
          }
          return {
            committee_name: ie.committee_name,
            committee_id: ie.committee_id,
            amount: ie.amount,
            support_oppose: ie.support_oppose,
            is_israel_lobby: ie.is_israel_lobby,
          };
        });

        // --- 2g. Final aggregates (bigint columns — whole numbers only) ---
        const totalFunds = Math.round(totals.raised);

        // PRESERVE roster-match artifacts (bundlers, individual_bundlers,
        // pac_details, bundlers_by_source) from the existing row. The roster-
        // match pipeline (flag-bundlers-batch.ts, refresh-*-roster cron) owns
        // those fields; sync-fec owns only the PAC/IE/total-funds side.
        const politicianRaw = politician as unknown as Record<string, unknown>;
        const existingBreakdown = (politicianRaw.israel_lobby_breakdown || {}) as Record<string, unknown>;
        const existingBundlers = Number(existingBreakdown.bundlers) || 0;
        const existingBundlersBySource = existingBreakdown.bundlers_by_source;
        const existingIndividualBundlers = existingBreakdown.individual_bundlers;
        const existingPacDetails = existingBreakdown.pac_details;
        const existingPacsByCycle = existingBreakdown.pacs_by_cycle;
        const existingScoringRule = existingBreakdown.scoring_rule;

        // Career-view AIPAC/IE computation.
        // If sync-fec's single-cycle pull produces a SMALLER pacs figure than
        // what's already in the row (because a roster-match script wrote a
        // career-sum value), keep the larger number — we don't want daily
        // cron to regress real data.
        const incomingPacs = Math.round(israelLobbyPacTotal);
        const existingPacs = Number(existingBreakdown.pacs) || 0;
        const finalPacs = Math.max(incomingPacs, existingPacs);
        const incomingAipac = Math.round(aipacDirect + aipacIe);
        const existingAipac = Number(politicianRaw.aipac_funding) || 0;
        const finalAipac = Math.max(incomingAipac, existingAipac);

        const aipacFunding = finalAipac;
        const israelLobbyTotal = finalPacs + Math.round(israelLobbyIeTotal) + existingBundlers;

        const israelLobbyBreakdown = {
          total: israelLobbyTotal,
          pacs: finalPacs,
          ie: Math.round(israelLobbyIeTotal),
          ie_details: ieBreakdown,
          bundlers: existingBundlers,                // preserve roster-match
          ...(existingBundlersBySource ? { bundlers_by_source: existingBundlersBySource } : {}),
          ...(existingIndividualBundlers ? { individual_bundlers: existingIndividualBundlers } : {}),
          ...(existingPacDetails ? { pac_details: existingPacDetails } : {}),
          ...(existingPacsByCycle ? { pacs_by_cycle: existingPacsByCycle } : {}),
          ...(existingScoringRule ? { scoring_rule: existingScoringRule } : {}),
        };

        const contributionBreakdown = {
          aipac: Math.round(breakdownAipac),
          otherPACs: Math.round(breakdownOtherPACs),
          individuals: Math.round(breakdownIndividuals),
          corporate: Math.round(breakdownCorporate),
        };

        // --- 2h. Upsert to Supabase ---
        // top5_donors is also owned by the roster-match pipeline when it has
        // AIPAC-as-top-donor data. Skip overwriting if existing row has an
        // AIPAC/NORPAC/UDP entry in top5 (indicates roster-match already ran).
        const existingTop5 = (politicianRaw.top5_donors || []) as Array<Record<string, unknown>>;
        const existingHasProIsraelTop = existingTop5.some(d =>
          /AIPAC|NORPAC|UNITED DEMOCRACY PROJECT|DMFI|NATIONAL PAC|PRO.?ISRAEL/i.test(String(d?.name || ''))
        );
        const top5ToWrite = existingHasProIsraelTop ? existingTop5 : top5Donors;

        const { error: updateError } = await supabase
          .from('politicians')
          .update({
            total_funds: totalFunds,
            aipac_funding: aipacFunding,
            israel_lobby_total: israelLobbyTotal,
            israel_lobby_breakdown: israelLobbyBreakdown,
            contribution_breakdown: contributionBreakdown,
            top5_donors: top5ToWrite,
            data_source: existingHasProIsraelTop ? 'fec_api+roster_match' : 'fec_api',
            updated_at: new Date().toISOString(),
          })
          .eq('bioguide_id', politician.bioguide_id);

        if (updateError) {
          log.push(`  ${candidateName}: DB update failed — ${updateError.message}`);
          errorCount++;
          errors.push({ candidateId: fecCandidateId, error: updateError.message });
          continue;
        }

        syncedCount++;
        log.push(
          `  ${candidateName}: synced — ` +
            `$${totalFunds.toLocaleString()} total funds, ` +
            `breakdown: ind=$${contributionBreakdown.individuals.toLocaleString()} ` +
            `pac=$${contributionBreakdown.otherPACs.toLocaleString()} ` +
            `corp=$${contributionBreakdown.corporate.toLocaleString()} ` +
            `aipac=$${contributionBreakdown.aipac.toLocaleString()}, ` +
            `$${israelLobbyTotal.toLocaleString()} Israel lobby, ` +
            `${allContributions.length} contributions`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errorCount++;
        errors.push({ candidateId: fecCandidateId || politician.bioguide_id, error: message });
        log.push(`  ${candidateName}: ERROR — ${message}`);

        // Stop immediately if rate-limited
        if (message.includes('rate limit') || message.includes('429')) {
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
        cycles: SYNC_CYCLES,
        candidates_checked: toProcess.length,
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

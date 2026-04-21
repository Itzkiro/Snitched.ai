import { NextRequest } from 'next/server';
import { verifyCronAuth, cronResponse } from '@/lib/cron-auth';
import { getServiceRoleSupabase } from '@/lib/supabase-server';
import { searchCourtRecords } from '@/lib/courtlistener-client';

/**
 * GET /api/cron/research-candidates
 *
 * Daily cron agent that enriches candidate profiles across all 4 pillars:
 *   1. FINANCIALS — Sync FEC contributions for candidates with fec_candidate_id
 *   2. COURT RECORDS — Search CourtListener for legal cases
 *   3. VOTING RECORDS — Pull from existing voting_records or LegiScan
 *   4. SOCIAL MEDIA — Fetch recent social posts from social_posts table
 *
 * Schedule: 0 6 * * * (6 AM UTC daily)
 *
 * Prioritizes candidates (is_candidate=true) and fills in missing data.
 * Rate limits: FEC 1K/hr, CourtListener 5K/hr — uses 600ms delays.
 */

const MAX_CANDIDATES_PER_RUN = 20;
const DELAY_MS = 600;
const FEC_API_KEY = process.env.FEC_API_KEY || '';
const FEC_BASE = 'https://api.open.fec.gov/v1';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fecFetch(path: string, params: Record<string, string | number> = {}): Promise<unknown> {
  const url = new URL(`${FEC_BASE}${path}`);
  url.searchParams.set('api_key', FEC_API_KEY);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString());
  if (res.status === 429) throw new Error('FEC rate limit hit');
  if (!res.ok) throw new Error(`FEC ${res.status}: ${res.statusText}`);
  return res.json();
}

/**
 * Lookup FEC candidate ID by name search
 */
async function lookupFecCandidateId(name: string, log: string[]): Promise<string | null> {
  try {
    const data = await fecFetch('/candidates/search/', {
      q: name,
      state: 'FL',
      per_page: 5,
      sort: '-election_year',
    }) as { results?: Array<{ candidate_id: string; name: string; election_years: number[] }> };

    const results = data.results || [];
    if (results.length > 0) {
      log.push(`    FEC match: ${results[0].name} (${results[0].candidate_id})`);
      return results[0].candidate_id;
    }
    log.push(`    No FEC match for "${name}"`);
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch FEC contribution totals for a candidate
 */
async function fetchFecContributions(
  candidateId: string,
  log: string[],
): Promise<{
  totalFunds: number;
  top5Donors: Array<{ name: string; amount: number; type: string; is_israel_lobby: boolean }>;
  contributionBreakdown: { aipac: number; otherPACs: number; individuals: number; corporate: number };
} | null> {
  try {
    const data = await fecFetch(`/candidate/${candidateId}/totals/`, {
      per_page: 1,
      sort_null_only: 'false',
      cycle: 2026,
    }) as { results?: Array<{ receipts: number; individual_contributions: number; other_political_committee_contributions: number }> };

    const totals = data.results?.[0];
    if (!totals) return null;

    const totalFunds = totals.receipts || 0;
    const individuals = totals.individual_contributions || 0;
    const pacs = totals.other_political_committee_contributions || 0;

    log.push(`    FEC totals: $${Math.round(totalFunds).toLocaleString('en-US')} raised`);

    // Fetch top donors
    await sleep(DELAY_MS);
    const schedA = await fecFetch('/schedules/schedule_a/', {
      candidate_id: candidateId,
      per_page: 10,
      sort: '-contribution_receipt_amount',
      two_year_transaction_period: 2026,
    }) as { results?: Array<{ contributor_name: string; contribution_receipt_amount: number; committee_type: string; entity_type: string }> };

    const top5 = (schedA.results || []).slice(0, 5).map(d => ({
      name: d.contributor_name || 'Unknown',
      amount: d.contribution_receipt_amount || 0,
      type: d.entity_type === 'IND' ? 'Individual' : d.entity_type === 'COM' ? 'PAC' : 'Corporate',
      is_israel_lobby: false,
    }));

    return {
      totalFunds,
      top5Donors: top5,
      contributionBreakdown: {
        aipac: 0,
        otherPACs: pacs,
        individuals,
        corporate: totalFunds - individuals - pacs,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('rate limit') || msg.includes('429')) throw err;
    log.push(`    FEC error: ${msg}`);
    return null;
  }
}

/**
 * Enrich social media data from social_posts table
 */
async function fetchSocialPosts(
  supabase: ReturnType<typeof getServiceRoleSupabase>,
  politicianId: string,
  log: string[],
): Promise<number> {
  if (!supabase) return 0;
  const { data, count } = await supabase
    .from('social_posts')
    .select('id', { count: 'exact' })
    .eq('politician_id', politicianId);

  const postCount = count || data?.length || 0;
  log.push(`    Social posts: ${postCount}`);
  return postCount;
}

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
    log.push(`Database: ${supabase ? 'connected' : 'unavailable'}`);
    log.push(`FEC API key: ${FEC_API_KEY ? 'configured' : 'missing'}`);

    if (!supabase) {
      return cronResponse('research-candidates', {
        success: false, synced: 0, errors: 1,
        details: { log, message: 'No database access' },
        duration_ms: Date.now() - startTime,
      });
    }

    // Load candidates — prioritize those with least data
    const { data: candidates, error: dbErr } = await supabase
      .from('politicians')
      .select('bioguide_id, name, office, source_ids, total_funds, court_records, voting_records, is_active, is_candidate')
      .eq('is_candidate', true)
      .order('updated_at', { ascending: true })
      .limit(MAX_CANDIDATES_PER_RUN);

    if (dbErr || !candidates) {
      return cronResponse('research-candidates', {
        success: false, synced: 0, errors: 1,
        details: { log, error: dbErr?.message || 'No candidates found' },
        duration_ms: Date.now() - startTime,
      });
    }

    log.push(`Candidates to research: ${candidates.length}`);

    for (const candidate of candidates) {
      try {
        log.push(`\n--- ${candidate.name} ---`);
        const updates: Record<string, unknown> = {};

        // ===== PILLAR 1: FINANCIALS (FEC) =====
        if (FEC_API_KEY) {
          let fecId = candidate.source_ids?.fec_candidate_id || null;

          if (!fecId) {
            log.push('  [FEC] Looking up candidate ID...');
            fecId = await lookupFecCandidateId(candidate.name, log);
            await sleep(DELAY_MS);

            if (fecId) {
              updates.source_ids = { ...(candidate.source_ids || {}), fec_candidate_id: fecId };
            }
          }

          if (fecId) {
            log.push(`  [FEC] Fetching contributions for ${fecId}...`);
            const fecData = await fetchFecContributions(fecId, log);
            await sleep(DELAY_MS);

            if (fecData) {
              updates.total_funds = fecData.totalFunds;
              updates.top5_donors = fecData.top5Donors;
              updates.contribution_breakdown = fecData.contributionBreakdown;
            }
          } else {
            log.push('  [FEC] No candidate ID — skipping financials');
          }
        }

        // ===== PILLAR 2: COURT RECORDS =====
        if (!candidate.court_records) {
          log.push('  [COURT] Searching CourtListener...');
          const courtRecords = await searchCourtRecords(candidate.name, log);
          updates.court_records = courtRecords.map(r => ({
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
            url: r.url,
            source: r.source,
          }));
          await sleep(DELAY_MS);
        } else {
          log.push(`  [COURT] Already has ${(candidate.court_records as unknown[]).length} records`);
        }

        // ===== PILLAR 3: VOTING RECORDS =====
        if (!candidate.voting_records) {
          log.push('  [VOTES] No voting records — will be filled by sync-legiscan/sync-congress crons');
        } else {
          log.push(`  [VOTES] Has ${(candidate.voting_records as unknown[]).length} records`);
        }

        // ===== PILLAR 4: SOCIAL MEDIA =====
        const socialCount = await fetchSocialPosts(supabase, candidate.bioguide_id, log);
        if (socialCount === 0) {
          log.push('  [SOCIAL] No posts — will be filled by sync-social-media cron');
        }

        // ===== WRITE UPDATES =====
        if (Object.keys(updates).length > 0) {
          updates.updated_at = new Date().toISOString();
          const { error: updateErr } = await supabase
            .from('politicians')
            .update(updates)
            .eq('bioguide_id', candidate.bioguide_id);

          if (updateErr) {
            errorCount++;
            errors.push({ candidateId: candidate.bioguide_id, error: updateErr.message });
            log.push(`  DB UPDATE FAILED: ${updateErr.message}`);
          } else {
            syncedCount++;
            log.push(`  Updated ${Object.keys(updates).length - 1} fields`);
          }
        } else {
          log.push('  No new data to update');
          syncedCount++;
        }

      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errorCount++;
        errors.push({ candidateId: candidate.bioguide_id, error: message });
        log.push(`  FATAL: ${message}`);

        if (message.includes('rate limit') || message.includes('429')) {
          log.push('Rate limited. Stopping research.');
          break;
        }
      }
    }

    log.push(`\nResearch complete: ${syncedCount} enriched, ${errorCount} errors`);

    return cronResponse('research-candidates', {
      success: errorCount === 0,
      synced: syncedCount,
      errors: errorCount,
      details: {
        candidates_researched: candidates.length,
        log,
        ...(errors.length > 0 ? { errors } : {}),
      },
      duration_ms: Date.now() - startTime,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.push(`Fatal: ${message}`);

    return cronResponse('research-candidates', {
      success: false, synced: syncedCount, errors: errorCount + 1,
      details: { log, fatalError: message },
      duration_ms: Date.now() - startTime,
    });
  }
}

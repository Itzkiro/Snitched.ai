import { NextRequest } from 'next/server';
import * as path from 'path';
import { verifyCronAuth, cronResponse } from '@/lib/cron-auth';
import { getServiceRoleSupabase } from '@/lib/supabase-server';
import {
  loadMaster, pullCandidateIndividuals, crossref, buildBreakdown, applyToPolitician,
} from '@/lib/roster-match';

/**
 * GET /api/cron/refresh-gallrein-roster
 *
 * Weekly roster-match refresh for Ed Gallrein (KY-04 R, H6KY04171). Re-pulls
 * itemized individuals from FEC and re-cross-references against the pro-Israel
 * donor registry. Matters because FEC Schedule A detail lags summary totals by
 * weeks after each filing — about half of his 2026-cycle itemized dollars
 * aren't in per-transaction detail on the day of filing.
 *
 * Schedule: weekly Monday 02:00 UTC (see vercel.json).
 * Auth:     verifyCronAuth via CRON_SECRET header or X-Vercel-Cron header.
 */

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const BIOGUIDE_ID = 'ky-04-2026-ed-gallrein';
const CANDIDATE_NAME = 'Gallrein';
const FEC_CAND_ID = 'H6KY04171';
const DATA_DIR = path.join(process.cwd(), 'data');

export async function GET(request: NextRequest) {
  const start = Date.now();

  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const client = getServiceRoleSupabase();
  if (!client) {
    return cronResponse('refresh-gallrein-roster', {
      success: false, synced: 0, errors: 1,
      details: { error: 'No Supabase client' }, duration_ms: Date.now() - start,
    });
  }

  const apiKey = process.env.FEC_API_KEY;
  if (!apiKey) {
    return cronResponse('refresh-gallrein-roster', {
      success: false, synced: 0, errors: 1,
      details: { error: 'FEC_API_KEY missing' }, duration_ms: Date.now() - start,
    });
  }

  try {
    const master = loadMaster(DATA_DIR);
    if (master.size === 0) {
      return cronResponse('refresh-gallrein-roster', {
        success: false, synced: 0, errors: 1,
        details: { error: `empty registry at ${DATA_DIR}` }, duration_ms: Date.now() - start,
      });
    }
    const { committeeId, donors } = await pullCandidateIndividuals(FEC_CAND_ID, apiKey);
    const matches = crossref(donors, master);
    const breakdown = buildBreakdown(matches, donors.length, 'api/cron/refresh-gallrein-roster');
    const applied = await applyToPolitician(client, BIOGUIDE_ID, breakdown, CANDIDATE_NAME);

    return cronResponse('refresh-gallrein-roster', {
      success: true, synced: 1, errors: 0,
      details: {
        committee_id: committeeId,
        master_individuals_indexed: master.size,
        itemized_rows: donors.length,
        matches: breakdown.matches,
        high_confidence: breakdown.high_confidence,
        medium_confidence: breakdown.medium_confidence,
        to_candidate: breakdown.to_candidate,
        career_to_pro_israel: breakdown.these_donors_to_pro_israel_career,
        match_rate_pct: breakdown.match_rate_pct,
        column_used: applied.column,
        red_flags: { kept: applied.kept, added: applied.added },
      },
      duration_ms: Date.now() - start,
    });
  } catch (e) {
    return cronResponse('refresh-gallrein-roster', {
      success: false, synced: 0, errors: 1,
      details: { error: e instanceof Error ? e.message : String(e) },
      duration_ms: Date.now() - start,
    });
  }
}

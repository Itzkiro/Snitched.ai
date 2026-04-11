import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth, cronResponse } from '@/lib/cron-auth';
import { getServiceRoleSupabase } from '@/lib/supabase-server';
import { fecFetch, ISRAEL_LOBBY_COMMITTEE_IDS } from '@/lib/fec-client';

/**
 * GET /api/cron/track-fec-filings
 *
 * Live FEC filing tracker. Checks for new contributions and independent
 * expenditures filed in the last 24 hours for tracked politicians.
 * Creates intel_alerts for notable filings (large amounts, Israel lobby, etc).
 *
 * Schedule: every 6 hours (0 3,9,15,21 * * *)
 */

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const DELAY_MS = 600;
const NOTABLE_THRESHOLD = 10000; // $10K+ individual contributions are notable
const IE_THRESHOLD = 50000;      // $50K+ independent expenditures

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function isIsraelLobby(committeeName: string, committeeId: string): boolean {
  if (Object.values(ISRAEL_LOBBY_COMMITTEE_IDS).includes(committeeId)) return true;
  const upper = committeeName.toUpperCase();
  return upper.includes('AIPAC') || upper.includes('UNITED DEMOCRACY PROJECT') ||
    upper.includes('NORPAC') || upper.includes('DMFI') || upper.includes('J STREET');
}

export async function GET(request: NextRequest) {
  const start = Date.now();

  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const client = getServiceRoleSupabase();
  if (!client) {
    return cronResponse('track-fec-filings', { success: false, synced: 0, errors: 1, details: { error: 'No DB' }, duration_ms: 0 });
  }

  // Get tracked politicians with FEC IDs
  const { data: pols } = await client
    .from('politicians')
    .select('bioguide_id, name, source_ids')
    .not('source_ids', 'is', null);

  const withFecId = ((pols || []) as { bioguide_id: string; name: string; source_ids: Record<string, string> }[])
    .filter(p => p.source_ids?.fec_candidate_id)
    .slice(0, 50); // Process top 50 per run

  let alertsCreated = 0;
  let filingsChecked = 0;
  const errors: string[] = [];

  // Check recent independent expenditures (most newsworthy)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  try {
    // Check recent IEs for tracked candidates
    for (const pol of withFecId.slice(0, 30)) {
      const candidateId = pol.source_ids.fec_candidate_id;

      try {
        const data = await fecFetch('/schedules/schedule_e/', {
          candidate_id: candidateId,
          min_date: yesterday,
          per_page: 20,
          sort: '-expenditure_date',
        });
        await sleep(DELAY_MS);
        filingsChecked++;

        for (const ie of data.results || []) {
          const amount = Math.abs(Number(ie.expenditure_amount || 0));
          const cmtName = ie.committee?.name || ie.committee_name || '';
          const cmtId = ie.committee_id || '';
          const isIsrael = isIsraelLobby(cmtName, cmtId);

          if (amount < IE_THRESHOLD && !isIsrael) continue;

          // Check if already alerted
          const { count } = await client
            .from('intel_alerts')
            .select('*', { count: 'exact', head: true })
            .eq('type', 'fec_filing')
            .eq('politician_id', pol.bioguide_id)
            .eq('title', `IE: ${cmtName}`);

          if ((count || 0) > 0) continue;

          const severity = isIsrael ? 'critical' : amount >= 500000 ? 'high' : amount >= 100000 ? 'medium' : 'info';
          const supportOppose = ie.support_oppose_indicator === 'S' ? 'SUPPORTING' : 'OPPOSING';

          await client.from('intel_alerts').insert({
            type: 'fec_filing',
            severity,
            title: `IE: ${cmtName}`,
            summary: `${cmtName} spent ${amount >= 1e6 ? `$${(amount / 1e6).toFixed(1)}M` : `$${(amount / 1e3).toFixed(0)}K`} ${supportOppose} ${pol.name}${isIsrael ? ' (ISRAEL LOBBY)' : ''}`,
            url: `https://www.fec.gov/data/independent-expenditures/?data_type=processed&committee_id=${cmtId}&candidate_id=${candidateId}`,
            politician_id: pol.bioguide_id,
            politician_name: pol.name,
            amount,
            source: 'fec',
            metadata: {
              committee_id: cmtId,
              committee_name: cmtName,
              candidate_id: candidateId,
              support_oppose: supportOppose,
              expenditure_date: ie.expenditure_date,
              is_israel_lobby: isIsrael,
            },
          });
          alertsCreated++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('429')) break; // Stop on rate limit
        errors.push(`IE check for ${pol.name}: ${msg}`);
      }
    }

    // Check recent large contributions (Schedule A)
    for (const pol of withFecId.slice(0, 20)) {
      const candidateId = pol.source_ids.fec_candidate_id;

      // Get committees
      try {
        const cmtData = await fecFetch(`/candidate/${candidateId}/committees/`, { per_page: 5 });
        await sleep(DELAY_MS);
        const committeeIds = (cmtData.results || []).map((r: Record<string, unknown>) => r.committee_id as string).filter(Boolean);

        for (const cmtId of committeeIds.slice(0, 2)) {
          const data = await fecFetch('/schedules/schedule_a/', {
            committee_id: cmtId,
            min_date: yesterday,
            per_page: 20,
            sort: '-contribution_receipt_amount',
          });
          await sleep(DELAY_MS);
          filingsChecked++;

          for (const c of data.results || []) {
            const amount = Number(c.contribution_receipt_amount || 0);
            const donorName = c.contributor_name || 'Unknown';
            const donorCmtId = c.committee_id || '';

            if (amount < NOTABLE_THRESHOLD) continue;

            const isIsrael = isIsraelLobby(donorName, donorCmtId);
            const severity = isIsrael ? 'critical' : amount >= 100000 ? 'high' : 'medium';

            // Dedup
            const { count } = await client
              .from('intel_alerts')
              .select('*', { count: 'exact', head: true })
              .eq('type', 'fec_filing')
              .eq('politician_id', pol.bioguide_id)
              .ilike('title', `%${donorName.slice(0, 30)}%`);
            if ((count || 0) > 0) continue;

            await client.from('intel_alerts').insert({
              type: 'fec_filing',
              severity,
              title: `New contribution: ${donorName}`,
              summary: `${donorName} contributed $${amount >= 1e6 ? (amount / 1e6).toFixed(1) + 'M' : (amount / 1e3).toFixed(0) + 'K'} to ${pol.name}${isIsrael ? ' (ISRAEL LOBBY)' : ''}`,
              url: `https://www.fec.gov/data/receipts/?data_type=processed&committee_id=${cmtId}&contributor_name=${encodeURIComponent(donorName)}`,
              politician_id: pol.bioguide_id,
              politician_name: pol.name,
              amount,
              source: 'fec',
              metadata: {
                donor_name: donorName,
                committee_id: cmtId,
                contribution_date: c.contribution_receipt_date,
                entity_type: c.entity_type,
                is_israel_lobby: isIsrael,
              },
            });
            alertsCreated++;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('429')) break;
        errors.push(`Contrib check for ${pol.name}: ${msg}`);
      }
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  return cronResponse('track-fec-filings', {
    success: true,
    synced: alertsCreated,
    errors: errors.length,
    details: { filingsChecked, alertsCreated, politiciansMonitored: withFecId.length, errors: errors.slice(0, 5) },
    duration_ms: Date.now() - start,
  });
}

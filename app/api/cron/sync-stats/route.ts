import { NextRequest } from 'next/server';
import { verifyCronAuth, cronResponse } from '@/lib/cron-auth';
import { getServiceRoleSupabase } from '@/lib/supabase-server';

/**
 * GET /api/cron/sync-stats
 *
 * Refreshes the platform_stats table with live counts computed from the
 * politicians table. Runs every 12 hours so every user-facing number on
 * the site stays in sync with the database — no hardcoded stats anywhere.
 *
 * Schedule: every 12 hours (0 0,12 * * *)
 *
 * Stats computed:
 *   total_politicians, total_active, total_states, total_funded,
 *   total_campaign_funds, israel_lobby_total, with_israel_lobby,
 *   with_court_records, with_voting_records, with_lobbying_records,
 *   avg_corruption_score, compromised_count, social_posts_count,
 *   candidates_count, state_<XX>_count (per-state)
 */

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const PAGE = 1000;

interface StatRow {
  key: string;
  value: number;
  label: string;
}

export async function GET(request: NextRequest) {
  const start = Date.now();

  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const client = getServiceRoleSupabase();
  if (!client) {
    return cronResponse('sync-stats', {
      success: false, synced: 0, errors: 1,
      details: { error: 'Database not configured' },
      duration_ms: Date.now() - start,
    });
  }

  const stats: StatRow[] = [];

  try {
    // ── Count queries (head-only, fast) ──────────────────────────────
    const [
      { count: totalPoliticians },
      { count: totalActive },
      { count: totalFunded },
      { count: withIsrael },
      { count: withCourt },
      { count: withVotes },
      { count: withLobby },
      { count: compromised },
      { count: candidates },
      { count: socialPosts },
    ] = await Promise.all([
      client.from('politicians').select('*', { count: 'exact', head: true }),
      client.from('politicians').select('*', { count: 'exact', head: true }).eq('is_active', true),
      client.from('politicians').select('*', { count: 'exact', head: true }).gt('total_funds', 0),
      client.from('politicians').select('*', { count: 'exact', head: true }).gt('israel_lobby_total', 0),
      client.from('politicians').select('*', { count: 'exact', head: true }).not('court_records', 'is', null),
      client.from('politicians').select('*', { count: 'exact', head: true }).not('voting_records', 'is', null),
      client.from('politicians').select('*', { count: 'exact', head: true }).not('lobbying_records', 'is', null),
      client.from('politicians').select('*', { count: 'exact', head: true }).neq('juice_box_tier', 'none'),
      client.from('politicians').select('*', { count: 'exact', head: true }).eq('is_candidate', true),
      client.from('social_posts').select('*', { count: 'exact', head: true }),
    ]);

    stats.push(
      { key: 'total_politicians', value: totalPoliticians ?? 0, label: 'Politicians Tracked' },
      { key: 'total_active', value: totalActive ?? 0, label: 'Active Politicians' },
      { key: 'total_funded', value: totalFunded ?? 0, label: 'With Financial Data' },
      { key: 'with_israel_lobby', value: withIsrael ?? 0, label: 'With Israel Lobby Funding' },
      { key: 'with_court_records', value: withCourt ?? 0, label: 'With Court Records' },
      { key: 'with_voting_records', value: withVotes ?? 0, label: 'With Voting Records' },
      { key: 'with_lobbying_records', value: withLobby ?? 0, label: 'With Lobbying Records' },
      { key: 'compromised_count', value: compromised ?? 0, label: 'Flagged for Foreign Lobby' },
      { key: 'candidates_count', value: candidates ?? 0, label: 'Candidates' },
      { key: 'social_posts_count', value: socialPosts ?? 0, label: 'Social Posts Tracked' },
    );

    // ── SUM queries (paginated to avoid 1000-row cap) ────────────────
    let totalCampaignFunds = 0;
    let israelLobbySum = 0;
    let corruptionSum = 0;
    let corruptionCount = 0;

    let offset = 0;
    while (true) {
      const { data } = await client
        .from('politicians')
        .select('total_funds, israel_lobby_total, corruption_score, is_active')
        .range(offset, offset + PAGE - 1);

      if (!data || data.length === 0) break;

      for (const row of data) {
        totalCampaignFunds += Number(row.total_funds) || 0;
        israelLobbySum += Number(row.israel_lobby_total) || 0;
        if (row.is_active) {
          corruptionSum += Number(row.corruption_score) || 0;
          corruptionCount++;
        }
      }

      if (data.length < PAGE) break;
      offset += PAGE;
    }

    const avgCorruption = corruptionCount > 0 ? Math.round(corruptionSum / corruptionCount) : 0;

    stats.push(
      { key: 'total_campaign_funds', value: Math.round(totalCampaignFunds), label: 'Total Campaign Funds ($)' },
      { key: 'israel_lobby_total', value: Math.round(israelLobbySum), label: 'Israel Lobby Funding ($)' },
      { key: 'avg_corruption_score', value: avgCorruption, label: 'Average Corruption Score' },
    );

    // ── Per-state counts ─────────────────────────────────────────────
    const stateCounts: Record<string, number> = {};
    offset = 0;
    while (true) {
      const { data } = await client
        .from('politicians')
        .select('bioguide_id')
        .range(offset, offset + PAGE - 1);

      if (!data || data.length === 0) break;

      for (const row of data) {
        const id = row.bioguide_id as string;
        // State prefix pattern: "XX-..." (e.g. "fl-sen-marco-rubio")
        const match = id.match(/^([a-z]{2})-/i);
        if (match) {
          const code = match[1].toUpperCase();
          stateCounts[code] = (stateCounts[code] || 0) + 1;
        } else {
          // Legacy FL entries without state prefix
          stateCounts['FL'] = (stateCounts['FL'] || 0) + 1;
        }
      }

      if (data.length < PAGE) break;
      offset += PAGE;
    }

    const totalStates = Object.keys(stateCounts).length;
    stats.push({ key: 'total_states', value: totalStates, label: 'States Covered' });

    for (const [code, count] of Object.entries(stateCounts)) {
      stats.push({ key: `state_${code}_count`, value: count, label: `${code} Politicians` });
    }

    // ── Upsert all stats ─────────────────────────────────────────────
    const now = new Date().toISOString();
    const rows = stats.map(s => ({
      key: s.key,
      value: s.value,
      label: s.label,
      updated_at: now,
    }));

    const { error: upsertError } = await client
      .from('platform_stats')
      .upsert(rows, { onConflict: 'key' });

    if (upsertError) {
      return cronResponse('sync-stats', {
        success: false, synced: 0, errors: 1,
        details: { error: upsertError.message },
        duration_ms: Date.now() - start,
      });
    }

    return cronResponse('sync-stats', {
      success: true,
      synced: stats.length,
      errors: 0,
      details: {
        total_politicians: totalPoliticians,
        total_states: totalStates,
        total_funded: totalFunded,
        total_campaign_funds: totalCampaignFunds,
        israel_lobby_total: israelLobbySum,
        avg_corruption_score: avgCorruption,
        state_counts: stateCounts,
      },
      duration_ms: Date.now() - start,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return cronResponse('sync-stats', {
      success: false, synced: 0, errors: 1,
      details: { error: message },
      duration_ms: Date.now() - start,
    });
  }
}

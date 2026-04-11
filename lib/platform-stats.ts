/**
 * Platform Stats — centralised live numbers.
 *
 * Every user-facing number on the site should come from this module.
 * The `platform_stats` table is refreshed by /api/cron/sync-stats (every 12 h).
 *
 * Stat keys:
 *   total_politicians        — total rows in politicians table
 *   total_active             — is_active = true
 *   total_states             — distinct 2-letter state prefixes
 *   total_funded             — total_funds > 0
 *   total_campaign_funds     — SUM(total_funds)
 *   israel_lobby_total       — SUM(israel_lobby_total)
 *   with_israel_lobby        — israel_lobby_total > 0
 *   with_court_records       — court_records IS NOT NULL
 *   with_voting_records      — voting_records IS NOT NULL
 *   with_lobbying_records    — lobbying_records IS NOT NULL
 *   avg_corruption_score     — AVG(corruption_score) for active
 *   compromised_count        — juice_box_tier != 'none'
 *   social_posts_count       — rows in social_posts table
 *   candidates_count         — is_candidate = true
 *   state_<XX>_count         — per-state politician count (e.g. state_FL_count)
 */

import { getServerSupabase } from './supabase-server';

export interface PlatformStat {
  key: string;
  value: number;
  label: string | null;
  updated_at: string;
}

/**
 * Fetch all platform stats as a key→value map.
 * Returns an empty map if the table doesn't exist yet.
 */
export async function getAllStats(): Promise<Record<string, number>> {
  const client = getServerSupabase();
  if (!client) return {};

  const stats: Record<string, number> = {};
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await client
      .from('platform_stats')
      .select('key, value')
      .range(offset, offset + pageSize - 1);

    if (error || !data || data.length === 0) break;
    for (const row of data) {
      stats[row.key] = Number(row.value);
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return stats;
}

/**
 * Fetch a single stat by key. Returns 0 if not found.
 */
export async function getStat(key: string): Promise<number> {
  const client = getServerSupabase();
  if (!client) return 0;

  const { data } = await client
    .from('platform_stats')
    .select('value')
    .eq('key', key)
    .single();

  return data ? Number(data.value) : 0;
}

/**
 * Fetch multiple stats by keys. Returns a map with 0 defaults.
 */
export async function getStats(keys: string[]): Promise<Record<string, number>> {
  const client = getServerSupabase();
  if (!client) return Object.fromEntries(keys.map(k => [k, 0]));

  const { data } = await client
    .from('platform_stats')
    .select('key, value')
    .in('key', keys);

  const result: Record<string, number> = {};
  for (const k of keys) result[k] = 0;
  if (data) {
    for (const row of data) {
      result[row.key] = Number(row.value);
    }
  }
  return result;
}

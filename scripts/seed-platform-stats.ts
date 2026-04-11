#!/usr/bin/env npx tsx
/**
 * One-time seed of platform_stats table.
 * Same logic as the cron job but runs locally.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const PAGE = 1000;

async function main() {
  const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  console.log('Computing platform stats...\n');

  const stats: { key: string; value: number; label: string }[] = [];

  // ── Count queries ──
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

  // ── SUM queries ──
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

  // ── Per-state counts ──
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
      const match = id.match(/^([a-z]{2})-/i);
      if (match) {
        const code = match[1].toUpperCase();
        stateCounts[code] = (stateCounts[code] || 0) + 1;
      } else {
        stateCounts['FL'] = (stateCounts['FL'] || 0) + 1;
      }
    }
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  stats.push({ key: 'total_states', value: Object.keys(stateCounts).length, label: 'States Covered' });
  for (const [code, count] of Object.entries(stateCounts)) {
    stats.push({ key: `state_${code}_count`, value: count, label: `${code} Politicians` });
  }

  // ── Upsert ──
  const now = new Date().toISOString();
  const rows = stats.map(s => ({ ...s, updated_at: now }));

  const { error } = await client.from('platform_stats').upsert(rows, { onConflict: 'key' });
  if (error) {
    console.error('Upsert error:', error.message);
    process.exit(1);
  }

  console.log(`Seeded ${stats.length} stats:\n`);
  for (const s of stats) {
    const val = s.value >= 1e6 ? `$${(s.value / 1e6).toFixed(1)}M` : s.value.toLocaleString();
    console.log(`  ${s.key.padEnd(25)} ${val.padStart(12)}  ${s.label}`);
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });

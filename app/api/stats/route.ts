import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';

export const revalidate = 300; // 5 minutes

/**
 * GET /api/stats
 *
 * Returns lightweight platform statistics without loading all politician data.
 * Used by the homepage to show counts without the heavy /api/politicians call.
 */
export async function GET() {
  try {
    const client = getServerSupabase();
    if (!client) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const [
      { count: total },
      { count: funded },
      { count: withVotes },
      { count: withLobby },
      { count: withIsrael },
      { count: socialPosts },
    ] = await Promise.all([
      client.from('politicians').select('*', { count: 'exact', head: true }),
      client.from('politicians').select('*', { count: 'exact', head: true }).gt('total_funds', 0),
      client.from('politicians').select('*', { count: 'exact', head: true }).not('voting_records', 'is', null),
      client.from('politicians').select('*', { count: 'exact', head: true }).not('lobbying_records', 'is', null),
      client.from('politicians').select('*', { count: 'exact', head: true }).gt('israel_lobby_total', 0),
      client.from('social_posts').select('*', { count: 'exact', head: true }),
    ]);

    // Get Israel lobby total sum
    const { data: israelData } = await client
      .from('politicians')
      .select('israel_lobby_total')
      .gt('israel_lobby_total', 0);
    const israelLobbyTotal = (israelData || []).reduce((s, r) => s + (Number(r.israel_lobby_total) || 0), 0);

    // Get top 5 most corrupt
    const { data: topCorrupt } = await client
      .from('politicians')
      .select('name, corruption_score, office')
      .eq('is_active', true)
      .order('corruption_score', { ascending: false })
      .limit(5);

    // Get top 5 Israel lobby recipients
    const { data: topIsrael } = await client
      .from('politicians')
      .select('name, israel_lobby_total, office')
      .gt('israel_lobby_total', 0)
      .order('israel_lobby_total', { ascending: false })
      .limit(5);

    return NextResponse.json({
      total,
      funded,
      withVotes,
      withLobby,
      withIsrael,
      socialPosts,
      israelLobbyTotal,
      topCorrupt: topCorrupt || [],
      topIsrael: topIsrael || [],
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (error) {
    console.error('Stats API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

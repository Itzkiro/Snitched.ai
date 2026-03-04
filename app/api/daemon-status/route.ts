import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';

/**
 * GET /api/daemon-status
 *
 * Public endpoint to check if the social media daemon is running.
 * Used by the frontend to show real-time monitoring status.
 */
export async function GET() {
  try {
    const client = getServerSupabase();
    if (!client) {
      return NextResponse.json({ status: 'no_database' });
    }

    // Get latest scrape run
    const { data: latestRun } = await client
      .from('scrape_runs')
      .select('started_at, completed_at, status, posts_found, posts_new, errors')
      .eq('run_type', 'social_media')
      .order('started_at', { ascending: false })
      .limit(1)
      .single();

    // Get recent runs for sparkline/graph
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentRuns } = await client
      .from('scrape_runs')
      .select('started_at, posts_found, status')
      .eq('run_type', 'social_media')
      .gte('started_at', oneHourAgo)
      .order('started_at', { ascending: true });

    // Get total post count
    const { count: totalPosts } = await client
      .from('social_posts')
      .select('*', { count: 'exact', head: true });

    let daemonStatus = 'unknown';
    let lastRunMinutesAgo = -1;

    if (latestRun) {
      const lastRunTime = new Date(latestRun.started_at).getTime();
      lastRunMinutesAgo = Math.round((Date.now() - lastRunTime) / 1000 / 60);

      if (lastRunMinutesAgo <= 30) daemonStatus = 'online';
      else if (lastRunMinutesAgo <= 120) daemonStatus = 'delayed';
      else daemonStatus = 'offline';
    } else {
      daemonStatus = 'never_started';
    }

    return NextResponse.json({
      status: daemonStatus,
      lastRun: latestRun || null,
      lastRunMinutesAgo,
      recentRuns: recentRuns || [],
      totalPosts: totalPosts || 0,
    });
  } catch (error) {
    // Tables might not exist
    return NextResponse.json({
      status: 'not_configured',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

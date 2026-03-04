import { NextRequest } from 'next/server';
import { verifyCronAuth, cronResponse } from '@/lib/cron-auth';
import { getServiceRoleSupabase } from '@/lib/supabase-server';

/**
 * GET /api/cron/sync-social-media
 *
 * Lightweight cron fallback that checks daemon health and fills gaps.
 * The main scraping happens via the persistent daemon on the Mac mini.
 * This cron runs every 6 hours as a safety net.
 *
 * What it does:
 *   1. Checks if the daemon has run recently (via scrape_runs table)
 *   2. Reports daemon health status
 *   3. If daemon is stale (>2 hours), flags it for alerting
 */

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const startTime = Date.now();
  const log: string[] = [];

  try {
    const supabase = getServiceRoleSupabase();
    if (!supabase) {
      return cronResponse('sync-social-media', {
        success: false,
        synced: 0,
        errors: 1,
        details: { log: ['Supabase not configured'] },
        duration_ms: Date.now() - startTime,
      });
    }

    // Check latest scrape run
    const { data: latestRun, error: runError } = await supabase
      .from('scrape_runs')
      .select('*')
      .eq('run_type', 'social_media')
      .order('started_at', { ascending: false })
      .limit(1)
      .single();

    if (runError && !runError.message.includes('rows returned')) {
      // Table might not exist yet
      if (runError.message.includes('does not exist')) {
        log.push('scrape_runs table not created yet — run schema.sql');
        return cronResponse('sync-social-media', {
          success: true,
          synced: 0,
          errors: 0,
          details: { log, daemon_status: 'table_missing' },
          duration_ms: Date.now() - startTime,
        });
      }
      log.push(`Error checking scrape_runs: ${runError.message}`);
    }

    // Check daemon health
    let daemonStatus = 'unknown';
    let lastRunAge = -1;

    if (latestRun) {
      const lastRunTime = new Date(latestRun.started_at).getTime();
      lastRunAge = Math.round((Date.now() - lastRunTime) / 1000 / 60); // minutes
      const postsFound = latestRun.posts_found || 0;

      log.push(`Last daemon run: ${latestRun.started_at} (${lastRunAge} min ago)`);
      log.push(`Last run status: ${latestRun.status}, posts: ${postsFound}`);

      if (lastRunAge <= 30) {
        daemonStatus = 'healthy';
      } else if (lastRunAge <= 120) {
        daemonStatus = 'delayed';
      } else {
        daemonStatus = 'stale';
        log.push('WARNING: Daemon appears to be down — last run was over 2 hours ago');
      }
    } else {
      daemonStatus = 'never_run';
      log.push('No scrape runs found — daemon has never run');
    }

    // Get post counts
    const { count: totalPosts } = await supabase
      .from('social_posts')
      .select('*', { count: 'exact', head: true });

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentPosts } = await supabase
      .from('social_posts')
      .select('*', { count: 'exact', head: true })
      .gte('scraped_at', oneDayAgo);

    log.push(`Total posts in DB: ${totalPosts || 0}`);
    log.push(`Posts scraped in last 24h: ${recentPosts || 0}`);

    return cronResponse('sync-social-media', {
      success: true,
      synced: 0,
      errors: 0,
      details: {
        daemon_status: daemonStatus,
        last_run_age_minutes: lastRunAge,
        total_posts: totalPosts || 0,
        recent_posts_24h: recentPosts || 0,
        log,
      },
      duration_ms: Date.now() - startTime,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.push(`Fatal error: ${message}`);

    return cronResponse('sync-social-media', {
      success: false,
      synced: 0,
      errors: 1,
      details: { log, fatalError: message },
      duration_ms: Date.now() - startTime,
    });
  }
}

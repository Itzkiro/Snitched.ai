import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';

// Revalidate every 5 minutes
export const revalidate = 300;

/**
 * GET /api/social-posts
 *
 * Fetch social media posts from Supabase with filtering.
 *
 * Query params:
 *   ?politician_id=fl-sen-marco-rubio   — Filter by politician
 *   ?platform=twitter                    — Filter by platform
 *   ?limit=50                            — Max results (default 50, max 200)
 *   ?offset=0                            — Pagination offset
 *   ?since=2024-01-01T00:00:00Z         — Posts after this date
 *   ?sort=posted_at                      — Sort field (posted_at | scraped_at | sentiment_score)
 *   ?order=desc                          — Sort order (asc | desc)
 */
export async function GET(request: NextRequest) {
  try {
    const client = getServerSupabase();
    if (!client) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 503 },
      );
    }

    const { searchParams } = new URL(request.url);
    const politicianId = searchParams.get('politician_id');
    const platform = searchParams.get('platform');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const since = searchParams.get('since');
    const sort = searchParams.get('sort') || 'posted_at';
    const order = searchParams.get('order') === 'asc' ? true : false; // ascending if 'asc'

    let query = client
      .from('social_posts')
      .select('*', { count: 'exact' });

    if (politicianId) {
      query = query.eq('politician_id', politicianId);
    }

    if (platform) {
      query = query.eq('platform', platform);
    }

    if (since) {
      query = query.gte('posted_at', since);
    }

    // Only allow sorting by safe columns
    const allowedSorts = ['posted_at', 'scraped_at', 'sentiment_score', 'likes_count'];
    const sortCol = allowedSorts.includes(sort) ? sort : 'posted_at';

    query = query
      .order(sortCol, { ascending: order })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      // Table might not exist yet
      if (error.message.includes('relation') && error.message.includes('does not exist')) {
        return NextResponse.json({
          posts: [],
          total: 0,
          message: 'Social posts table not created yet. Run the schema SQL first.',
        });
      }
      console.error('Social posts query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      posts: data || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Failed to fetch social posts:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

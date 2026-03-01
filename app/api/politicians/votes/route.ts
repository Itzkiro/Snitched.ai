import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';

/**
 * GET /api/politicians/votes?bioguideId=<id>&category=<category>
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const bioguideId = searchParams.get('bioguideId');
  const category = searchParams.get('category');

  if (!bioguideId) {
    return NextResponse.json(
      { error: 'bioguideId is required' },
      { status: 400 }
    );
  }

  const client = getServerSupabase();
  if (!client) {
    return NextResponse.json(
      { error: 'Database not configured' },
      { status: 503 }
    );
  }

  try {
    let query = client
      .from('politician_votes')
      .select(`
        position,
        votes!inner(
          *,
          bills(*)
        )
      `)
      .eq('politician_bioguide_id', bioguideId);

    if (category) {
      query = query.eq('votes.bills.ai_primary_category', category);
    }

    const { data, error } = await query
      .order('votes(vote_date)', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching politician votes:', error);
      return NextResponse.json([]);
    }

    // Transform nested data to match BillWithVote interface
    const transformed = (data || []).map((pv: Record<string, unknown>) => {
      const votes = pv.votes as Record<string, unknown>;
      return {
        ...votes,
        bills: votes.bills,
        politician_votes: [{ position: pv.position }],
      };
    });

    return NextResponse.json(transformed);
  } catch (error) {
    console.error('Politician votes API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

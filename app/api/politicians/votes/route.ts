import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';

// Revalidate every 10 minutes
export const revalidate = 600;

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

    // Fallback: if the 3-table schema is empty for this politician, try the
    // politicians.voting_records JSON field (used for manually-seeded votes).
    if (transformed.length === 0) {
      const { data: pol } = await client
        .from('politicians')
        .select('voting_records')
        .eq('bioguide_id', bioguideId)
        .single();
      const vr = (pol?.voting_records || []) as Array<Record<string, unknown>>;
      if (vr.length > 0) {
        const mapped = vr.map(v => ({
          id: v.id,
          vote_date: v.date,
          bill_number: v.billNumber,
          result: 'See bill',
          bills: {
            title: v.billTitle,
            summary: v.billSummary,
            ai_primary_category: v.category,
            bill_number: v.billNumber,
          },
          politician_votes: [{ position: v.voteValue === 'Yes' ? 'Yea' : v.voteValue === 'No' ? 'Nay' : v.voteValue }],
        }));
        return NextResponse.json(mapped);
      }
    }

    return NextResponse.json(transformed);
  } catch (error) {
    console.error('Politician votes API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

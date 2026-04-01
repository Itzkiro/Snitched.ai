import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';

/**
 * GET /api/bills/search?q=<query>&limit=<limit>
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const query = searchParams.get('q') || '';
  const limit = Math.max(1, Math.min(parseInt(searchParams.get('limit') || '20', 10), 100));

  if (!query) {
    return NextResponse.json([]);
  }

  const client = getServerSupabase();
  if (!client) {
    return NextResponse.json(
      { error: 'Database not configured' },
      { status: 503 }
    );
  }

  try {
    const { data, error } = await client
      .from('bills')
      .select('*')
      .or(`title.ilike.%${query}%,summary.ilike.%${query}%,description.ilike.%${query}%`)
      .limit(limit);

    if (error) {
      console.error('Error searching bills:', error);
      return NextResponse.json([]);
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Bills search API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

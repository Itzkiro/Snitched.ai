import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';

/**
 * GET /api/bills
 * Query params:
 *   - id: single bill ID
 *   - ids: comma-separated bill IDs
 *   - category: bill category filter
 *   - needsAnalysis: if "true", fetch bills without AI category
 *   - limit: max results (default 50)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const id = searchParams.get('id');
  const ids = searchParams.get('ids');
  const category = searchParams.get('category');
  const needsAnalysis = searchParams.get('needsAnalysis');
  const limit = Math.max(1, Math.min(parseInt(searchParams.get('limit') || '50', 10), 200));

  const client = getServerSupabase();
  if (!client) {
    return NextResponse.json(
      { error: 'Database not configured' },
      { status: 503 }
    );
  }

  try {
    // Single bill by ID
    if (id) {
      const { data, error } = await client
        .from('bills')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error fetching bill:', error);
        return NextResponse.json(null);
      }
      return NextResponse.json(data);
    }

    // Multiple bills by IDs
    if (ids) {
      const idList = ids.split(',').filter(Boolean);
      const { data, error } = await client
        .from('bills')
        .select('*')
        .in('id', idList);

      if (error) {
        console.error('Error fetching bills:', error);
        return NextResponse.json([]);
      }
      return NextResponse.json(data || []);
    }

    // Bills needing AI analysis
    if (needsAnalysis === 'true') {
      const { data, error } = await client
        .from('bills')
        .select('*')
        .is('ai_primary_category', null)
        .limit(limit);

      if (error) {
        console.error('Error fetching bills needing analysis:', error);
        return NextResponse.json([]);
      }
      return NextResponse.json(data || []);
    }

    // Bills by category
    if (category) {
      const { data, error } = await client
        .from('bills')
        .select('*')
        .eq('ai_primary_category', category)
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error fetching bills by category:', error);
        return NextResponse.json([]);
      }
      return NextResponse.json(data || []);
    }

    // Default: return recent bills
    const { data, error } = await client
      .from('bills')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching bills:', error);
      return NextResponse.json([]);
    }
    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Bills API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

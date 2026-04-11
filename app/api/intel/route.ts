import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleSupabase } from '@/lib/supabase-server';
import { getStateFromId } from '@/lib/state-utils';

/**
 * GET /api/intel
 *
 * Returns recent intelligence alerts. Supports filtering by type and severity.
 *
 * Query params:
 *   type: 'news' | 'fec_filing' | 'scandal' | 'lobby_filing' (optional)
 *   severity: 'critical' | 'high' | 'medium' | 'info' (optional)
 *   politician_id: filter by politician (optional)
 *   limit: max results (default 50, max 200)
 */

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const client = getServiceRoleSupabase();
  if (!client) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const params = request.nextUrl.searchParams;
  const type = params.get('type');
  const severity = params.get('severity');
  const politicianId = params.get('politician_id');
  const stateFilter = params.get('state');
  const limit = Math.min(Number(params.get('limit') || '50'), 200);

  let query = client
    .from('intel_alerts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (type) query = query.eq('type', type);
  if (severity) query = query.eq('severity', severity);
  if (politicianId) query = query.eq('politician_id', politicianId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Filter by state if specified (match via politician_id prefix)
  let filtered = data || [];
  if (stateFilter && stateFilter !== 'ALL') {
    const upper = stateFilter.toUpperCase();
    filtered = filtered.filter(a => {
      if (!a.politician_id) return false;
      return getStateFromId(a.politician_id as string) === upper;
    });
  }

  // Count by severity
  const counts = { critical: 0, high: 0, medium: 0, info: 0 };
  for (const a of filtered) {
    const s = a.severity as keyof typeof counts;
    if (s in counts) counts[s]++;
  }

  return NextResponse.json({ alerts: filtered, counts, total: filtered.length });
}

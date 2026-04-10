import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';

/**
 * GET /api/connections
 *
 * Returns the cross-politician connections graph.
 * Query params:
 *   - minConnections: minimum politician_count to include a node (default: 2)
 *   - category: filter by node category
 *   - politician: filter edges by politician bioguide_id
 *   - limit: max nodes (default: 500)
 */

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'No database access' }, { status: 500 });
  }

  const params = request.nextUrl.searchParams;
  const minConnections = Number(params.get('minConnections') || '2');
  const category = params.get('category');
  const politicianId = params.get('politician');
  const limit = Math.min(Number(params.get('limit') || '500'), 1000);

  // Fetch nodes
  let nodeQuery = supabase
    .from('connection_nodes')
    .select('*')
    .gte('politician_count', minConnections)
    .order('politician_count', { ascending: false })
    .limit(limit);

  if (category) {
    nodeQuery = nodeQuery.eq('category', category);
  }

  const { data: nodes, error: nodeErr } = await nodeQuery;
  if (nodeErr) {
    return NextResponse.json({ error: nodeErr.message }, { status: 500 });
  }

  // Get node IDs for edge filtering
  const nodeIds = new Set((nodes || []).map((n: { id: string }) => n.id));

  // Fetch edges connected to these nodes
  let edgeQuery = supabase
    .from('connection_edges')
    .select('*');

  if (politicianId) {
    edgeQuery = edgeQuery.eq('source_id', politicianId);
  }

  const { data: allEdges, error: edgeErr } = await edgeQuery.limit(5000);
  if (edgeErr) {
    return NextResponse.json({ error: edgeErr.message }, { status: 500 });
  }

  // Filter edges to only include those connected to our nodes
  const edges = (allEdges || []).filter((e: { target_id: string; source_id: string }) =>
    nodeIds.has(e.target_id) || nodeIds.has(e.source_id)
  );

  // Collect politician IDs from edges to include as nodes
  const politicianIds = new Set<string>();
  for (const e of edges) {
    if ((e as { source_type: string }).source_type === 'politician') {
      politicianIds.add((e as { source_id: string }).source_id);
    }
  }

  // Fetch politician nodes
  let politicians: Array<{ bioguide_id: string; name: string; party: string; office: string; corruption_score: number }> = [];
  if (politicianIds.size > 0) {
    const { data: polData } = await supabase
      .from('politicians')
      .select('bioguide_id, name, party, office, corruption_score')
      .in('bioguide_id', Array.from(politicianIds));
    politicians = polData || [];
  }

  return NextResponse.json({
    nodes: nodes || [],
    edges,
    politicians,
    meta: {
      totalNodes: (nodes || []).length,
      totalEdges: edges.length,
      totalPoliticians: politicians.length,
      minConnections,
    },
  });
}

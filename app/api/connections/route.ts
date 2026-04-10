import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleSupabase } from '@/lib/supabase-server';

/**
 * GET /api/connections
 *
 * Builds the cross-politician connections graph ON THE FLY from the
 * politicians table. No dependency on connection_nodes/edges tables.
 *
 * Query params:
 *   - minConnections: minimum politician count to include an entity (default: 2)
 *   - category: filter by entity category
 *   - limit: max entity nodes (default: 300)
 */

export const dynamic = 'force-dynamic';

interface EntityNode {
  id: string;
  label: string;
  category: string;
  total_amount: number;
  politician_count: number;
}

interface GraphEdge {
  id: string;
  source_id: string;
  target_id: string;
  source_type: string;
  target_type: string;
  label: string;
  amount: number;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

export async function GET(request: NextRequest) {
  const supabase = getServiceRoleSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'No database access' }, { status: 500 });
  }

  const params = request.nextUrl.searchParams;
  const minConnections = Number(params.get('minConnections') || '2');
  const categoryFilter = params.get('category');
  const limit = Math.min(Number(params.get('limit') || '300'), 500);

  // Load all politicians with data
  // Paginate to get ALL politicians (Supabase caps at 1000 per request)
  const connCols = 'bioguide_id, name, party, office, corruption_score, top5_donors, israel_lobby_breakdown, lobbying_records, court_records';
  const allPols: Record<string, unknown>[] = [];
  let pg = 0;
  while (true) {
    const { data: batch, error: batchErr } = await supabase
      .from('politicians')
      .select(connCols)
      .range(pg * 1000, (pg + 1) * 1000 - 1);
    if (batchErr || !batch) break;
    allPols.push(...batch);
    if (batch.length < 1000) break;
    pg++;
  }
  const pols = allPols;

  if (pols.length === 0) {
    return NextResponse.json({ error: 'No politicians found' }, { status: 500 });
  }

  // Build graph in memory
  const nodeMap = new Map<string, EntityNode>();
  const nodePolMap = new Map<string, Set<string>>();
  const edges: GraphEdge[] = [];
  const edgeIds = new Set<string>();

  function addNode(id: string, label: string, category: string, amount = 0) {
    if (nodeMap.has(id)) {
      nodeMap.get(id)!.total_amount += amount;
    } else {
      nodeMap.set(id, { id, label, category, total_amount: amount, politician_count: 0 });
    }
  }

  function addEdge(polId: string, nodeId: string, category: string, label: string, amount = 0) {
    const eid = `${polId}--${nodeId}`;
    if (edgeIds.has(eid)) return;
    edgeIds.add(eid);
    edges.push({ id: eid, source_id: polId, target_id: nodeId, source_type: 'politician', target_type: category, label, amount });
    if (!nodePolMap.has(nodeId)) nodePolMap.set(nodeId, new Set());
    nodePolMap.get(nodeId)!.add(polId);
  }

  for (const pol of pols) {
    const polId = pol.bioguide_id as string;
    const donors = (pol.top5_donors || []) as Array<{ name: string; amount: number; type: string }>;
    const lobby = (pol.lobbying_records || []) as Array<Record<string, unknown>>;
    const israelBreakdown = (pol.israel_lobby_breakdown || {}) as Record<string, unknown>;
    const courtRecords = (pol.court_records || []) as Array<Record<string, unknown>>;

    for (const d of donors) {
      if (!d.name) continue;
      const nodeId = `donor-${slugify(d.name)}`;
      const cat = d.type === 'Israel-PAC' ? 'israel-pac' : d.type === 'PAC' ? 'pac' : d.type === 'Corporate' ? 'corporate' : 'donor';
      addNode(nodeId, d.name, cat, d.amount || 0);
      addEdge(polId, nodeId, cat, 'donated_to', d.amount || 0);
    }

    for (const ie of ((israelBreakdown.ie_details || []) as Array<{ committee_name: string; amount: number; is_israel_lobby: boolean; support_oppose: string }>)) {
      if (!ie.committee_name) continue;
      const nodeId = `ie-${slugify(ie.committee_name)}`;
      addNode(nodeId, ie.committee_name, 'israel-pac', ie.amount || 0);
      addEdge(polId, nodeId, 'israel-pac', 'ie_spending', ie.amount || 0);
    }

    for (const r of lobby) {
      if (!r.registrantName) continue;
      const firmId = `firm-${slugify(String(r.registrantName))}`;
      addNode(firmId, String(r.registrantName), 'lobby-firm', Number(r.income) || 0);
      addEdge(polId, firmId, 'lobby-firm', 'lobbied_by', Number(r.income) || 0);
    }

    for (const c of courtRecords) {
      const caseName = String(c.case_name || c.caseName || '');
      if (!caseName) continue;
      const caseId = `case-${slugify(caseName).slice(0, 60)}`;
      addNode(caseId, caseName, 'court-case', 0);
      addEdge(polId, caseId, 'court-case', 'court_party', 0);
    }
  }

  // Set politician_count
  for (const [nodeId, polIds] of nodePolMap) {
    const node = nodeMap.get(nodeId);
    if (node) node.politician_count = polIds.size;
  }

  // Filter nodes
  let nodes = Array.from(nodeMap.values())
    .filter(n => n.politician_count >= minConnections);

  if (categoryFilter) {
    nodes = nodes.filter(n => n.category === categoryFilter);
  }

  nodes.sort((a, b) => b.politician_count - a.politician_count);
  nodes = nodes.slice(0, limit);

  // Filter edges to only those connected to visible nodes
  const visibleNodeIds = new Set(nodes.map(n => n.id));
  const visibleEdges = edges.filter(e => visibleNodeIds.has(e.target_id));

  // Collect politician IDs
  const polIds = new Set<string>();
  for (const e of visibleEdges) polIds.add(e.source_id);

  const politicians = pols
    .filter(p => polIds.has(p.bioguide_id as string))
    .map(p => ({
      bioguide_id: p.bioguide_id as string,
      name: p.name as string,
      party: p.party as string,
      office: p.office as string,
      corruption_score: p.corruption_score,
    }));

  // Cross-party analysis: find entities that connect R and D politicians
  const polPartyMap = new Map<string, string>();
  for (const p of pols) polPartyMap.set(p.bioguide_id as string, p.party as string);

  const crossPartyEntities: Array<{ id: string; label: string; category: string; republicans: number; democrats: number; total: number }> = [];
  for (const node of nodes) {
    const connectedPols = nodePolMap.get(node.id);
    if (!connectedPols || connectedPols.size < 2) continue;
    let rCount = 0, dCount = 0;
    for (const pid of connectedPols) {
      const party = polPartyMap.get(pid);
      if (party === 'Republican') rCount++;
      else if (party === 'Democrat') dCount++;
    }
    if (rCount > 0 && dCount > 0) {
      crossPartyEntities.push({
        id: node.id, label: node.label, category: node.category,
        republicans: rCount, democrats: dCount, total: connectedPols.size,
      });
    }
  }
  crossPartyEntities.sort((a, b) => b.total - a.total);

  return NextResponse.json({
    nodes,
    edges: visibleEdges,
    politicians,
    crossParty: crossPartyEntities.slice(0, 20),
    meta: {
      totalNodes: nodes.length,
      totalEdges: visibleEdges.length,
      totalPoliticians: politicians.length,
      crossPartyCount: crossPartyEntities.length,
      minConnections,
    },
  });
}

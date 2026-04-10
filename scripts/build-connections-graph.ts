/**
 * Build Connections Graph
 *
 * Extracts entities from all politicians and creates the cross-politician
 * connections graph in connection_nodes + connection_edges tables.
 *
 * Usage: npx tsx scripts/build-connections-graph.ts [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const DRY_RUN = process.argv.includes('--dry-run');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

interface Node {
  id: string;
  label: string;
  category: string;
  total_amount: number;
  metadata: Record<string, unknown>;
  politician_count: number;
}

interface Edge {
  id: string;
  source_id: string;
  target_id: string;
  source_type: string;
  target_type: string;
  label: string;
  amount: number;
  metadata: Record<string, unknown>;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

async function main() {
  console.log(`\n=== BUILD CONNECTIONS GRAPH ===`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Started: ${new Date().toISOString()}\n`);

  // Load all politicians with data
  const { data: pols, error } = await sb.from('politicians').select('*');
  if (error || !pols) {
    console.error('Failed to load politicians:', error?.message);
    process.exit(1);
  }
  console.log(`Loaded ${pols.length} politicians\n`);

  const nodeMap = new Map<string, Node>();
  const edges: Edge[] = [];
  const nodePolMap = new Map<string, Set<string>>(); // node ID -> set of politician IDs

  function addNode(id: string, label: string, category: string, amount = 0, meta: Record<string, unknown> = {}) {
    if (nodeMap.has(id)) {
      const existing = nodeMap.get(id)!;
      existing.total_amount += amount;
      Object.assign(existing.metadata, meta);
    } else {
      nodeMap.set(id, { id, label, category, total_amount: amount, metadata: meta, politician_count: 0 });
    }
    return id;
  }

  const edgeIds = new Set<string>();
  function addEdge(polId: string, nodeId: string, category: string, label: string, amount = 0, meta: Record<string, unknown> = {}) {
    const baseId = `${polId}--${nodeId}`;
    // Deduplicate: if edge already exists, skip (aggregate amount on node instead)
    if (edgeIds.has(baseId)) return;
    edgeIds.add(baseId);
    edges.push({
      id: baseId,
      source_id: polId,
      target_id: nodeId,
      source_type: 'politician',
      target_type: category,
      label,
      amount,
      metadata: meta,
    });
    if (!nodePolMap.has(nodeId)) nodePolMap.set(nodeId, new Set());
    nodePolMap.get(nodeId)!.add(polId);
  }

  // Process each politician
  for (const pol of pols) {
    const polId = pol.bioguide_id;
    const donors = pol.top5_donors || [];
    const lobby = pol.lobbying_records || [];
    const israelBreakdown = pol.israel_lobby_breakdown || {};
    const courtRecords = pol.court_records || [];

    // --- DONORS ---
    for (const d of donors) {
      if (!d.name) continue;
      const nodeId = `donor-${slugify(d.name)}`;
      const category = d.type === 'Israel-PAC' ? 'israel-pac' : d.type === 'PAC' ? 'pac' : d.type === 'Corporate' ? 'corporate' : 'donor';
      addNode(nodeId, d.name, category, d.amount || 0, { type: d.type });
      addEdge(polId, nodeId, category, 'donated_to', d.amount || 0);
    }

    // --- ISRAEL LOBBY IE ---
    const ieDetails = israelBreakdown.ie_details || [];
    for (const ie of ieDetails) {
      if (!ie.committee_name) continue;
      const nodeId = `ie-${slugify(ie.committee_name)}`;
      addNode(nodeId, ie.committee_name, 'israel-pac', ie.amount || 0, {
        committee_id: ie.committee_id,
        support_oppose: ie.support_oppose,
      });
      addEdge(polId, nodeId, 'israel-pac', 'ie_spending', ie.amount || 0, { support_oppose: ie.support_oppose });
    }

    // --- LOBBYING FIRMS ---
    for (const r of lobby) {
      if (!r.registrantName) continue;
      const firmId = `firm-${slugify(r.registrantName)}`;
      addNode(firmId, r.registrantName, 'lobby-firm', r.income || 0);
      addEdge(polId, firmId, 'lobby-firm', 'lobbied_by', r.income || 0);

      // Clients
      if (r.clientName && r.clientName !== r.registrantName) {
        const clientId = `client-${slugify(r.clientName)}`;
        addNode(clientId, r.clientName, 'lobby-client', 0, { via_firm: r.registrantName });
        // Client -> Firm edge (not politician edge)
        const clientEdgeId = `${clientId}--${firmId}`;
        if (!edgeIds.has(clientEdgeId)) {
          edgeIds.add(clientEdgeId);
          edges.push({
            id: clientEdgeId,
            source_id: clientId,
            target_id: firmId,
            source_type: 'lobby-client',
            target_type: 'lobby-firm',
            label: 'hired',
            amount: 0,
            metadata: {},
          });
        }
      }
    }

    // --- COURT RECORDS ---
    for (const c of courtRecords) {
      if (!c.case_name && !c.caseName) continue;
      const caseName = c.case_name || c.caseName || '';
      const caseId = `case-${slugify(caseName).slice(0, 60)}`;
      addNode(caseId, caseName, 'court-case', 0, {
        court: c.court || c.courtId || '',
        docket: c.docket_number || c.docketNumber || '',
        date: c.date_filed || c.dateFiled || '',
      });
      addEdge(polId, caseId, 'court-case', 'court_party', 0);
    }
  }

  // Update politician_count on nodes
  for (const [nodeId, polIds] of nodePolMap) {
    const node = nodeMap.get(nodeId);
    if (node) node.politician_count = polIds.size;
  }

  // Stats
  const nodes = Array.from(nodeMap.values());
  const sharedNodes = nodes.filter(n => n.politician_count > 1);
  const sharedDonors = sharedNodes.filter(n => ['donor', 'pac', 'corporate', 'israel-pac'].includes(n.category));
  const sharedFirms = sharedNodes.filter(n => n.category === 'lobby-firm');
  const sharedCases = sharedNodes.filter(n => n.category === 'court-case');

  console.log(`=== GRAPH STATS ===`);
  console.log(`Total nodes: ${nodes.length}`);
  console.log(`Total edges: ${edges.length}`);
  console.log(`\nShared connections (multi-politician):`);
  console.log(`  Shared donors/PACs: ${sharedDonors.length}`);
  console.log(`  Shared lobby firms: ${sharedFirms.length}`);
  console.log(`  Shared court cases: ${sharedCases.length}`);
  console.log(`\nTop shared connections:`);
  sharedNodes
    .sort((a, b) => b.politician_count - a.politician_count)
    .slice(0, 15)
    .forEach(n => {
      const polNames = Array.from(nodePolMap.get(n.id) || [])
        .map(id => pols.find(p => p.bioguide_id === id)?.name || id)
        .slice(0, 5);
      console.log(`  [${n.politician_count} pols] ${n.label} (${n.category}) → ${polNames.join(', ')}${nodePolMap.get(n.id)!.size > 5 ? '...' : ''}`);
    });

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No data written. Remove --dry-run to write to DB.');
    return;
  }

  // Write to DB
  console.log('\nWriting to Supabase...');

  // Clear existing data
  await sb.from('connection_edges').delete().neq('id', '');
  await sb.from('connection_nodes').delete().neq('id', '');
  console.log('Cleared existing graph data');

  // Insert nodes in batches
  const nodeBatchSize = 200;
  for (let i = 0; i < nodes.length; i += nodeBatchSize) {
    const batch = nodes.slice(i, i + nodeBatchSize);
    const { error: nodeErr } = await sb.from('connection_nodes').upsert(batch, { onConflict: 'id' });
    if (nodeErr) console.error(`Node batch ${i} error:`, nodeErr.message);
    else process.stdout.write(`  Nodes: ${Math.min(i + nodeBatchSize, nodes.length)}/${nodes.length}\r`);
  }
  console.log(`  Nodes: ${nodes.length}/${nodes.length} ✓`);

  // Insert edges in batches
  for (let i = 0; i < edges.length; i += nodeBatchSize) {
    const batch = edges.slice(i, i + nodeBatchSize);
    const { error: edgeErr } = await sb.from('connection_edges').upsert(batch, { onConflict: 'id' });
    if (edgeErr) console.error(`Edge batch ${i} error:`, edgeErr.message);
    else process.stdout.write(`  Edges: ${Math.min(i + nodeBatchSize, edges.length)}/${edges.length}\r`);
  }
  console.log(`  Edges: ${edges.length}/${edges.length} ✓`);

  console.log(`\nGraph built successfully!`);
  console.log(`Completed: ${new Date().toISOString()}`);
}

main().catch(console.error);

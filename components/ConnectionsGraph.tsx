'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import cytoscape, { type Core, type NodeSingular } from 'cytoscape';
import fcose from 'cytoscape-fcose';
import type { Politician } from '@/lib/types';

// Register fcose layout
if (typeof window !== 'undefined') {
  cytoscape.use(fcose);
}

// ---------------------------------------------------------------------------
// 4 Pillar Categories + Colors (OpenPlanter-inspired)
// ---------------------------------------------------------------------------

const PILLAR_COLORS: Record<string, string> = {
  politician: '#00bfff',
  pillar: '#64748b',
  // Pillar 1: Financials
  'financial': '#f97583',
  'donor-individual': '#10b981',
  'donor-pac': '#f59e0b',
  'donor-corporate': '#60a5fa',
  'donor-israel': '#ef4444',
  'lobby-firm': '#e3b341',
  'lobby-client': '#a78bfa',
  'ie-committee': '#06b6d4',
  // Pillar 2: Court / Legal
  'legal': '#b392f0',
  'court-case': '#d2a8ff',
  // Pillar 3: Voting
  'voting': '#7ee787',
  'vote-yea': '#56d364',
  'vote-nay': '#f97583',
  'vote-absent': '#8b949e',
  // Pillar 4: Social Media
  'social': '#ffa657',
  'social-post': '#ff7b72',
};

function getCategoryColor(cat: string): string {
  return PILLAR_COLORS[cat] ?? '#8b949e';
}

// ---------------------------------------------------------------------------
// Cytoscape Stylesheet (adapted from OpenPlanter)
// ---------------------------------------------------------------------------

const graphStyle: cytoscape.StylesheetStyle[] = [
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      'background-color': 'data(color)',
      'background-opacity': 0.85,
      'border-width': 1,
      'border-color': 'data(color)',
      'border-opacity': 0.5,
      color: '#ffffff',
      'text-valign': 'bottom',
      'text-halign': 'center',
      'text-margin-y': 4,
      'font-size': 'data(fontSize)',
      'font-family': 'JetBrains Mono, Fira Code, monospace',
      shape: 'ellipse',
      width: 'data(size)',
      height: 'data(size)',
      'text-wrap': 'ellipsis',
      'text-max-width': '120px',
      'min-zoomed-font-size': 4,
      'text-outline-color': '#0a0a0a',
      'text-outline-width': 1.5,
      'text-outline-opacity': 0.8,
    },
  },
  // Pillar nodes — hexagon
  {
    selector: "node[node_type='pillar']",
    style: { shape: 'hexagon' },
  },
  // Entity nodes — round-rectangle
  {
    selector: "node[node_type='entity']",
    style: { shape: 'round-rectangle' },
  },
  // Politician — star
  {
    selector: "node[node_type='politician']",
    style: { shape: 'star' },
  },
  // Selected
  {
    selector: 'node:selected',
    style: {
      'border-width': 3,
      'border-color': '#ffffff',
      'border-opacity': 1,
      'background-opacity': 1,
    },
  },
  // Highlighted neighborhood
  {
    selector: 'node.highlighted',
    style: {
      'border-width': 2,
      'border-color': '#ffffff',
      'border-opacity': 0.8,
      'background-opacity': 1,
    },
  },
  // Dimmed
  {
    selector: 'node.dimmed',
    style: { opacity: 0.12, 'text-opacity': 0 },
  },
  // Edges
  {
    selector: 'edge',
    style: {
      width: 1.2,
      'line-color': 'data(color)',
      'target-arrow-shape': 'triangle',
      'target-arrow-color': 'data(color)',
      'curve-style': 'bezier',
      opacity: 0.35,
    },
  },
  // Structural edges (pillar connections) — thicker
  {
    selector: "edge[edgeType='pillar']",
    style: { width: 2.5, opacity: 0.5, 'target-arrow-shape': 'none' },
  },
  // Category edges
  {
    selector: "edge[edgeType='category']",
    style: { width: 1.8, opacity: 0.4, 'line-style': 'solid' },
  },
  // Highlighted edges
  {
    selector: 'edge.highlighted',
    style: { 'line-color': '#58a6ff', width: 2.5, opacity: 0.8 },
  },
  // Dimmed edges
  {
    selector: 'edge.dimmed',
    style: { opacity: 0.05 },
  },
  // Hidden
  {
    selector: 'node.hidden, edge.hidden',
    style: { display: 'none' },
  },
] as unknown as cytoscape.StylesheetStyle[];

// ---------------------------------------------------------------------------
// Build graph from Politician data — 4 Pillars
// ---------------------------------------------------------------------------

interface GraphNode {
  id: string;
  label: string;
  category: string;
  node_type: 'politician' | 'pillar' | 'category' | 'entity';
  amount?: number;
  sublabel?: string;
  tag?: string;
}

interface GraphEdge {
  source: string;
  target: string;
  label?: string;
  edgeType: 'pillar' | 'category' | 'entity';
}

function formatAmount(n: number): string {
  if (!Number.isFinite(n)) return '$0';
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
}

function buildGraph(politician: Politician): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const ids = new Set<string>();

  const add = (n: GraphNode) => { if (!ids.has(n.id)) { ids.add(n.id); nodes.push(n); } };

  // Central politician
  add({ id: 'pol', label: politician.name, category: 'politician', node_type: 'politician', sublabel: politician.office });

  // ===== PILLAR 1: FINANCIALS =====
  const donors = politician.top5Donors || [];
  const breakdown = politician.contributionBreakdown;
  const lobbyRecords = (politician.lobbyingRecords || []) as unknown as Array<Record<string, unknown>>;
  const ieDetails = politician.israelLobbyBreakdown?.ie_details || [];

  const hasFinancials = donors.length > 0 || breakdown || lobbyRecords.length > 0 || ieDetails.length > 0;
  if (hasFinancials) {
    add({ id: 'p-fin', label: 'FINANCIALS', category: 'financial', node_type: 'pillar', amount: politician.totalFundsRaised });
    edges.push({ source: 'pol', target: 'p-fin', edgeType: 'pillar' });

    // Donors by type
    if (breakdown) {
      if (breakdown.individuals > 0) {
        add({ id: 'cat-indiv', label: 'Individual Donors', category: 'donor-individual', node_type: 'category', amount: breakdown.individuals });
        edges.push({ source: 'p-fin', target: 'cat-indiv', edgeType: 'category' });
        donors.filter(d => d.type === 'Individual').forEach((d, i) => {
          add({ id: `indiv-${i}`, label: truncate(d.name, 25), category: 'donor-individual', node_type: 'entity', amount: d.amount });
          edges.push({ source: 'cat-indiv', target: `indiv-${i}`, label: formatAmount(d.amount), edgeType: 'entity' });
        });
      }
      if (breakdown.otherPACs > 0) {
        add({ id: 'cat-pac', label: 'PACs', category: 'donor-pac', node_type: 'category', amount: breakdown.otherPACs });
        edges.push({ source: 'p-fin', target: 'cat-pac', edgeType: 'category' });
        donors.filter(d => d.type === 'PAC').forEach((d, i) => {
          add({ id: `pac-${i}`, label: truncate(d.name, 25), category: 'donor-pac', node_type: 'entity', amount: d.amount });
          edges.push({ source: 'cat-pac', target: `pac-${i}`, label: formatAmount(d.amount), edgeType: 'entity' });
        });
      }
      if (breakdown.corporate > 0) {
        add({ id: 'cat-corp', label: 'Corporate', category: 'donor-corporate', node_type: 'category', amount: breakdown.corporate });
        edges.push({ source: 'p-fin', target: 'cat-corp', edgeType: 'category' });
        donors.filter(d => d.type === 'Corporate').forEach((d, i) => {
          add({ id: `corp-${i}`, label: truncate(d.name, 25), category: 'donor-corporate', node_type: 'entity', amount: d.amount });
          edges.push({ source: 'cat-corp', target: `corp-${i}`, label: formatAmount(d.amount), edgeType: 'entity' });
        });
      }
      if (breakdown.aipac > 0 || (politician.israelLobbyTotal || 0) > 0) {
        add({ id: 'cat-israel', label: 'Israel Lobby', category: 'donor-israel', node_type: 'category', amount: politician.israelLobbyTotal || breakdown.aipac });
        edges.push({ source: 'p-fin', target: 'cat-israel', edgeType: 'category' });
        donors.filter(d => d.type === 'Israel-PAC').forEach((d, i) => {
          add({ id: `israel-${i}`, label: truncate(d.name, 25), category: 'donor-israel', node_type: 'entity', amount: d.amount, tag: 'DIRECT' });
          edges.push({ source: 'cat-israel', target: `israel-${i}`, label: formatAmount(d.amount), edgeType: 'entity' });
        });
        ieDetails.forEach((ie, i) => {
          add({ id: `ie-${i}`, label: truncate(ie.committee_name, 25), category: 'ie-committee', node_type: 'entity', amount: ie.amount, tag: ie.is_israel_lobby ? 'ISRAEL LOBBY' : ie.support_oppose });
          edges.push({ source: 'cat-israel', target: `ie-${i}`, label: formatAmount(ie.amount), edgeType: 'entity' });
        });
      }
    } else {
      donors.forEach((d, i) => {
        const cat = d.type === 'Israel-PAC' ? 'donor-israel' : d.type === 'PAC' ? 'donor-pac' : d.type === 'Corporate' ? 'donor-corporate' : 'donor-individual';
        add({ id: `donor-${i}`, label: truncate(d.name, 25), category: cat, node_type: 'entity', amount: d.amount });
        edges.push({ source: 'p-fin', target: `donor-${i}`, label: formatAmount(d.amount), edgeType: 'entity' });
      });
    }

    // Lobbying
    if (lobbyRecords.length > 0) {
      add({ id: 'cat-lobby', label: 'Lobbying', category: 'lobby-firm', node_type: 'category' });
      edges.push({ source: 'p-fin', target: 'cat-lobby', edgeType: 'category' });

      const byFirm: Record<string, { income: number; clients: Set<string> }> = {};
      for (const r of lobbyRecords) {
        const firm = (r.registrantName as string) || 'Unknown';
        if (!byFirm[firm]) byFirm[firm] = { income: 0, clients: new Set() };
        byFirm[firm].income += (r.income as number) || 0;
        if (r.clientName) byFirm[firm].clients.add(r.clientName as string);
      }
      Object.entries(byFirm).sort((a, b) => b[1].income - a[1].income).slice(0, 10).forEach(([firm, data], i) => {
        add({ id: `firm-${i}`, label: truncate(firm, 25), category: 'lobby-firm', node_type: 'entity', amount: data.income, sublabel: `${data.clients.size} clients` });
        edges.push({ source: 'cat-lobby', target: `firm-${i}`, edgeType: 'entity' });
        [...data.clients].slice(0, 3).forEach((client, ci) => {
          if (client !== firm) {
            add({ id: `client-${i}-${ci}`, label: truncate(client, 20), category: 'lobby-client', node_type: 'entity' });
            edges.push({ source: `firm-${i}`, target: `client-${i}-${ci}`, label: 'CLIENT', edgeType: 'entity' });
          }
        });
      });
    }
  }

  // ===== PILLAR 2: LEGAL / COURT CASES =====
  const courtCases = politician.courtCases || [];
  add({ id: 'p-legal', label: 'COURT RECORDS', category: 'legal', node_type: 'pillar' });
  edges.push({ source: 'pol', target: 'p-legal', edgeType: 'pillar' });
  if (courtCases.length > 0) {
    courtCases.slice(0, 10).forEach((c, i) => {
      add({ id: `case-${i}`, label: truncate(c.caseNumber || c.summary, 25), category: 'court-case', node_type: 'entity', sublabel: c.status, tag: c.caseType });
      edges.push({ source: 'p-legal', target: `case-${i}`, label: c.caseType, edgeType: 'entity' });
    });
  } else {
    add({ id: 'legal-pending', label: 'Investigation Pending', category: 'legal', node_type: 'entity', sublabel: 'Court records being indexed' });
    edges.push({ source: 'p-legal', target: 'legal-pending', edgeType: 'entity' });
  }

  // ===== PILLAR 3: VOTING RECORDS =====
  const votingRecords = (politician.votes || []) as unknown as Array<Record<string, unknown>>;
  add({ id: 'p-votes', label: 'VOTING RECORD', category: 'voting', node_type: 'pillar' });
  edges.push({ source: 'pol', target: 'p-votes', edgeType: 'pillar' });
  if (votingRecords.length > 0) {
    // Summarize votes
    let yeas = 0, nays = 0, absent = 0;
    for (const v of votingRecords) {
      const pos = ((v.votePosition || v.vote_position || '') as string).toLowerCase();
      if (pos.includes('yea') || pos.includes('yes')) yeas++;
      else if (pos.includes('nay') || pos.includes('no')) nays++;
      else absent++;
    }
    if (yeas > 0) {
      add({ id: 'vote-yea', label: `${yeas} YEA votes`, category: 'vote-yea', node_type: 'entity' });
      edges.push({ source: 'p-votes', target: 'vote-yea', edgeType: 'category' });
    }
    if (nays > 0) {
      add({ id: 'vote-nay', label: `${nays} NAY votes`, category: 'vote-nay', node_type: 'entity' });
      edges.push({ source: 'p-votes', target: 'vote-nay', edgeType: 'category' });
    }
    if (absent > 0) {
      add({ id: 'vote-absent', label: `${absent} Absent/NV`, category: 'vote-absent', node_type: 'entity' });
      edges.push({ source: 'p-votes', target: 'vote-absent', edgeType: 'category' });
    }
    // Show recent notable votes
    votingRecords.slice(0, 8).forEach((v, i) => {
      const bill = (v.billNumber || v.bill_number || `Bill #${i + 1}`) as string;
      const pos = ((v.votePosition || v.vote_position || 'Unknown') as string);
      const cat = pos.toLowerCase().includes('yea') || pos.toLowerCase().includes('yes') ? 'vote-yea' : pos.toLowerCase().includes('nay') || pos.toLowerCase().includes('no') ? 'vote-nay' : 'vote-absent';
      add({ id: `vote-${i}`, label: truncate(bill, 20), category: cat, node_type: 'entity', sublabel: truncate((v.billTitle || v.bill_title || '') as string, 40), tag: pos });
      edges.push({ source: 'p-votes', target: `vote-${i}`, label: pos, edgeType: 'entity' });
    });
  } else {
    add({ id: 'votes-pending', label: 'No Records Yet', category: 'voting', node_type: 'entity', sublabel: 'Voting data being synced' });
    edges.push({ source: 'p-votes', target: 'votes-pending', edgeType: 'entity' });
  }

  // ===== PILLAR 4: SOCIAL MEDIA =====
  const socialPosts = politician.socialPosts || [];
  const socialMedia = politician.socialMedia;
  add({ id: 'p-social', label: 'SOCIAL MEDIA', category: 'social', node_type: 'pillar' });
  edges.push({ source: 'pol', target: 'p-social', edgeType: 'pillar' });
  if (socialMedia) {
    if (socialMedia.twitterHandle) {
      add({ id: 'social-twitter', label: `@${socialMedia.twitterHandle}`, category: 'social', node_type: 'entity', tag: 'TWITTER' });
      edges.push({ source: 'p-social', target: 'social-twitter', edgeType: 'category' });
    }
    if (socialMedia.instagramHandle) {
      add({ id: 'social-ig', label: `@${socialMedia.instagramHandle}`, category: 'social', node_type: 'entity', tag: 'INSTAGRAM' });
      edges.push({ source: 'p-social', target: 'social-ig', edgeType: 'category' });
    }
    if (socialMedia.facebookPageUrl) {
      add({ id: 'social-fb', label: 'Facebook Page', category: 'social', node_type: 'entity', tag: 'FACEBOOK' });
      edges.push({ source: 'p-social', target: 'social-fb', edgeType: 'category' });
    }
  }
  if (socialPosts.length > 0) {
    socialPosts.slice(0, 6).forEach((p, i) => {
      add({ id: `post-${i}`, label: truncate(p.content, 30), category: 'social-post', node_type: 'entity', sublabel: p.platform, tag: p.platform.toUpperCase() });
      edges.push({ source: 'p-social', target: `post-${i}`, edgeType: 'entity' });
    });
  } else if (!socialMedia?.twitterHandle && !socialMedia?.instagramHandle) {
    add({ id: 'social-pending', label: 'No Social Data', category: 'social', node_type: 'entity', sublabel: 'Monitoring active' });
    edges.push({ source: 'p-social', target: 'social-pending', edgeType: 'entity' });
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Node sizing (OpenPlanter tier-based)
// ---------------------------------------------------------------------------

function tierSizing(nodeType: string, deg: number): { size: number; fontSize: string } {
  switch (nodeType) {
    case 'politician': return { size: 50 + Math.sqrt(deg) * 4, fontSize: '12px' };
    case 'pillar': return { size: 35 + Math.sqrt(deg) * 4, fontSize: '10px' };
    case 'category': return { size: 22 + Math.sqrt(deg) * 3, fontSize: '8px' };
    case 'entity':
    default: return { size: 14 + Math.sqrt(deg) * 2, fontSize: '7px' };
  }
}

function toCytoElements(graphNodes: GraphNode[], graphEdges: GraphEdge[]): cytoscape.ElementDefinition[] {
  const degree = new Map<string, number>();
  for (const n of graphNodes) degree.set(n.id, 0);
  for (const e of graphEdges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }

  const nodes: cytoscape.ElementDefinition[] = graphNodes.map((n) => {
    const deg = degree.get(n.id) ?? 0;
    const { size, fontSize } = tierSizing(n.node_type, deg);
    return {
      data: {
        id: n.id,
        label: n.label,
        category: n.category,
        node_type: n.node_type,
        color: getCategoryColor(n.category),
        size,
        fontSize,
        amount: n.amount,
        sublabel: n.sublabel,
        tag: n.tag,
      },
    };
  });

  const cyEdges: cytoscape.ElementDefinition[] = graphEdges.map((e, i) => ({
    data: {
      id: `e${i}`,
      source: e.source,
      target: e.target,
      label: e.label,
      edgeType: e.edgeType,
      color: getCategoryColor(graphNodes.find(n => n.id === e.source)?.category ?? ''),
    },
  }));

  return [...nodes, ...cyEdges];
}

// ---------------------------------------------------------------------------
// React Component
// ---------------------------------------------------------------------------

interface NodeDetail {
  label: string;
  category: string;
  amount?: number;
  sublabel?: string;
  tag?: string;
}

export default function ConnectionsGraph({ politician }: { politician: Politician }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [selectedNode, setSelectedNode] = useState<NodeDetail | null>(null);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [layout, setLayout] = useState<'fcose' | 'circle' | 'concentric'>('fcose');

  const { nodes: graphNodes, edges: graphEdges } = buildGraph(politician);

  // Only render if there's meaningful data beyond just the 4 pillars
  const entityCount = graphNodes.filter(n => n.node_type === 'entity' || n.node_type === 'category').length;

  const getLayoutOpts = useCallback((name: string): cytoscape.LayoutOptions => {
    switch (name) {
      case 'circle':
        return { name: 'circle', animate: true, animationDuration: 300, avoidOverlap: true } as cytoscape.LayoutOptions;
      case 'concentric':
        return {
          name: 'concentric', animate: true, animationDuration: 300, avoidOverlap: true, minNodeSpacing: 30,
          concentric: (node: { data: (key: string) => string }) => {
            const nt = node.data('node_type');
            if (nt === 'politician') return 4;
            if (nt === 'pillar') return 3;
            if (nt === 'category') return 2;
            return 1;
          },
          levelWidth: () => 1,
        } as unknown as cytoscape.LayoutOptions;
      case 'fcose':
      default:
        return {
          name: 'fcose', animate: true, animationDuration: 500, randomize: true, quality: 'proof',
          nodeSeparation: 80, idealEdgeLength: 150, nodeRepulsion: () => 20000,
          edgeElasticity: () => 0.45, gravity: 0.2, gravityRange: 3.8, numIter: 2500,
        } as unknown as cytoscape.LayoutOptions;
    }
  }, []);

  // Init Cytoscape
  useEffect(() => {
    if (!containerRef.current || entityCount < 1) return;

    const elements = toCytoElements(graphNodes, graphEdges);

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: graphStyle,
      layout: getLayoutOpts(layout),
      minZoom: 0.2,
      maxZoom: 4,
      wheelSensitivity: 0.3,
    });

    // Click handler — highlight neighborhood
    cy.on('tap', 'node', (evt) => {
      const node = evt.target as NodeSingular;
      cy.elements().removeClass('dimmed highlighted');
      const neighborhood = node.neighborhood().add(node);
      cy.elements().not(neighborhood).addClass('dimmed');
      neighborhood.edges().addClass('highlighted');
      neighborhood.nodes().addClass('highlighted');
      node.removeClass('highlighted');

      setSelectedNode({
        label: node.data('label'),
        category: node.data('category'),
        amount: node.data('amount'),
        sublabel: node.data('sublabel'),
        tag: node.data('tag'),
      });
    });

    // Click background — clear
    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        cy.elements().removeClass('dimmed highlighted');
        cy.nodes().unselect();
        setSelectedNode(null);
      }
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [politician.id, entityCount]);

  // Layout change
  useEffect(() => {
    if (cyRef.current) {
      cyRef.current.layout(getLayoutOpts(layout)).run();
    }
  }, [layout, getLayoutOpts]);

  // Filter by pillar
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.nodes().removeClass('hidden');
    cy.edges().removeClass('hidden');

    if (activeFilter) {
      // Find the pillar node and its descendants
      const pillarNode = cy.getElementById(`p-${activeFilter}`);
      if (pillarNode.nonempty()) {
        const pol = cy.getElementById('pol');
        const connected = pillarNode.successors().add(pillarNode).add(pol);
        // Also keep the pillar-to-pol edge
        const pillarEdge = pol.edgesTo(pillarNode).union(pillarNode.edgesTo(pol));
        const visible = connected.add(pillarEdge);
        cy.elements().not(visible).addClass('hidden');
      }
    }
  }, [activeFilter]);

  if (entityCount < 1) return null;

  const pillars = [
    { id: 'fin', label: 'Financials', icon: '💰', color: PILLAR_COLORS['financial'] },
    { id: 'legal', label: 'Court', icon: '⚖️', color: PILLAR_COLORS['legal'] },
    { id: 'votes', label: 'Voting', icon: '🗳️', color: PILLAR_COLORS['voting'] },
    { id: 'social', label: 'Social', icon: '📱', color: PILLAR_COLORS['social'] },
  ];

  return (
    <div className="terminal-card" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--terminal-blue)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
          🗺️ 4-PILLAR CONNECTION MAP
        </h3>
        <div style={{ fontSize: '0.65rem', color: 'var(--terminal-text-dim)' }}>
          Click nodes to inspect • Drag to pan • Scroll to zoom • {graphNodes.length} entities
        </div>
      </div>

      {/* Pillar filters */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveFilter(null)}
          className="terminal-btn"
          style={{
            padding: '0.3rem 0.6rem', fontSize: '0.65rem',
            background: !activeFilter ? 'rgba(0, 191, 255, 0.2)' : 'transparent',
            border: `1px solid ${!activeFilter ? 'var(--terminal-blue)' : 'var(--terminal-border)'}`,
          }}
        >
          ALL
        </button>
        {pillars.map(p => (
          <button
            key={p.id}
            onClick={() => setActiveFilter(activeFilter === p.id ? null : p.id)}
            className="terminal-btn"
            style={{
              padding: '0.3rem 0.6rem', fontSize: '0.65rem',
              background: activeFilter === p.id ? `${p.color}20` : 'transparent',
              border: `1px solid ${activeFilter === p.id ? p.color : 'var(--terminal-border)'}`,
              color: activeFilter === p.id ? p.color : 'var(--terminal-text-dim)',
            }}
          >
            {p.icon} {p.label}
          </button>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.25rem' }}>
          {(['fcose', 'circle', 'concentric'] as const).map(l => (
            <button
              key={l}
              onClick={() => setLayout(l)}
              className="terminal-btn"
              style={{
                padding: '0.25rem 0.5rem', fontSize: '0.6rem',
                background: layout === l ? 'rgba(255,255,255,0.1)' : 'transparent',
                border: `1px solid ${layout === l ? 'var(--terminal-text-dim)' : 'var(--terminal-border)'}`,
              }}
            >
              {l === 'fcose' ? 'Force' : l === 'circle' ? 'Circle' : 'Grouped'}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '0.75rem', fontSize: '0.6rem' }}>
        {[
          { color: PILLAR_COLORS['donor-individual'], label: 'Individual' },
          { color: PILLAR_COLORS['donor-pac'], label: 'PAC' },
          { color: PILLAR_COLORS['donor-corporate'], label: 'Corporate' },
          { color: PILLAR_COLORS['donor-israel'], label: 'Israel Lobby' },
          { color: PILLAR_COLORS['lobby-firm'], label: 'Lobby Firm' },
          { color: PILLAR_COLORS['legal'], label: 'Legal' },
          { color: PILLAR_COLORS['vote-yea'], label: 'Yea Vote' },
          { color: PILLAR_COLORS['vote-nay'], label: 'Nay Vote' },
          { color: PILLAR_COLORS['social'], label: 'Social' },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--terminal-text-dim)' }}>{item.label}</span>
          </div>
        ))}
      </div>

      {/* Graph container */}
      <div style={{ position: 'relative', width: '100%' }}>
        <div
          ref={containerRef}
          style={{
            width: '100%',
            height: 'min(550px, 70vw)',
            minHeight: '300px',
            background: 'rgba(0, 0, 0, 0.4)',
            border: '1px solid var(--terminal-border)',
            borderRadius: '2px',
          }}
        />

        {/* Detail overlay */}
        {selectedNode && (
          <div style={{
            position: 'absolute', top: 8, right: 8,
            background: 'var(--terminal-card)', border: '1px solid var(--terminal-border)',
            padding: '0.75rem', fontSize: '0.75rem', maxWidth: '260px', zIndex: 10,
          }}>
            <div style={{ fontWeight: 700, color: getCategoryColor(selectedNode.category), marginBottom: '0.25rem' }}>
              {selectedNode.label}
            </div>
            {selectedNode.sublabel && (
              <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.65rem', marginBottom: '0.25rem' }}>
                {selectedNode.sublabel}
              </div>
            )}
            {selectedNode.amount != null && selectedNode.amount > 0 && (
              <div style={{ fontWeight: 700, fontFamily: 'Bebas Neue, monospace', fontSize: '1rem', color: getCategoryColor(selectedNode.category) }}>
                {formatAmount(selectedNode.amount)}
              </div>
            )}
            {selectedNode.tag && (
              <span style={{
                display: 'inline-block', marginTop: '0.25rem', fontSize: '0.6rem',
                padding: '1px 4px', background: `${getCategoryColor(selectedNode.category)}20`,
                color: getCategoryColor(selectedNode.category),
                border: `1px solid ${getCategoryColor(selectedNode.category)}40`, fontWeight: 700,
              }}>
                {selectedNode.tag}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

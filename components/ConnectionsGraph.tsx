'use client';

import { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import type { Politician } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  type: 'politician' | 'individual' | 'pac' | 'corporate' | 'israel' | 'lobby-firm' | 'lobby-client' | 'ie' | 'category';
  amount?: number;
  sublabel?: string;
  tag?: string;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  type: 'funding' | 'lobbying' | 'ie' | 'client' | 'category';
  amount?: number;
  label?: string;
}

// ---------------------------------------------------------------------------
// Color & sizing helpers
// ---------------------------------------------------------------------------

const NODE_COLORS: Record<GraphNode['type'], string> = {
  politician: '#00bfff',
  individual: '#10b981',
  pac: '#f59e0b',
  corporate: '#60a5fa',
  israel: '#ef4444',
  'lobby-firm': '#a78bfa',
  'lobby-client': '#8b5cf6',
  ie: '#06b6d4',
  category: '#64748b',
};

function nodeRadius(node: GraphNode): number {
  if (node.type === 'politician') return 28;
  if (node.type === 'category') return 22;
  if (!node.amount) return 8;
  if (node.amount >= 1_000_000) return 18;
  if (node.amount >= 100_000) return 14;
  if (node.amount >= 10_000) return 11;
  return 8;
}

function formatAmount(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// ---------------------------------------------------------------------------
// Build graph data from Politician
// ---------------------------------------------------------------------------

function buildGraph(politician: Politician): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const nodeIds = new Set<string>();

  const addNode = (n: GraphNode) => {
    if (!nodeIds.has(n.id)) {
      nodeIds.add(n.id);
      nodes.push(n);
    }
  };

  // Central politician node
  addNode({
    id: 'politician',
    label: politician.name,
    type: 'politician',
    sublabel: politician.office,
  });

  const donors = politician.top5Donors || [];
  const breakdown = politician.contributionBreakdown;
  const lobbyRecords = (politician.lobbyingRecords || []) as unknown as Array<Record<string, unknown>>;
  const ieDetails = politician.israelLobbyBreakdown?.ie_details || [];

  // --- FUNDING ---
  if (breakdown || donors.length > 0) {
    addNode({ id: 'cat-funding', label: 'CAMPAIGN FUNDING', type: 'category', amount: politician.totalFundsRaised });
    links.push({ source: 'politician', target: 'cat-funding', type: 'category' });

    if (breakdown) {
      // Individual donors
      if (breakdown.individuals > 0) {
        addNode({ id: 'cat-individuals', label: 'Individuals', type: 'category', amount: breakdown.individuals });
        links.push({ source: 'cat-funding', target: 'cat-individuals', type: 'category' });
        donors.filter(d => d.type === 'Individual').forEach((d, i) => {
          const id = `indiv-${i}`;
          addNode({ id, label: d.name, type: 'individual', amount: d.amount });
          links.push({ source: 'cat-individuals', target: id, type: 'funding', amount: d.amount });
        });
      }

      // PACs
      if (breakdown.otherPACs > 0) {
        addNode({ id: 'cat-pacs', label: 'PACs', type: 'category', amount: breakdown.otherPACs });
        links.push({ source: 'cat-funding', target: 'cat-pacs', type: 'category' });
        donors.filter(d => d.type === 'PAC').forEach((d, i) => {
          const id = `pac-${i}`;
          addNode({ id, label: d.name, type: 'pac', amount: d.amount });
          links.push({ source: 'cat-pacs', target: id, type: 'funding', amount: d.amount });
        });
      }

      // Corporate
      if (breakdown.corporate > 0) {
        addNode({ id: 'cat-corp', label: 'Corporate', type: 'category', amount: breakdown.corporate });
        links.push({ source: 'cat-funding', target: 'cat-corp', type: 'category' });
        donors.filter(d => d.type === 'Corporate').forEach((d, i) => {
          const id = `corp-${i}`;
          addNode({ id, label: d.name, type: 'corporate', amount: d.amount });
          links.push({ source: 'cat-corp', target: id, type: 'funding', amount: d.amount });
        });
      }

      // Israel lobby
      if (breakdown.aipac > 0 || (politician.israelLobbyTotal || 0) > 0) {
        const israelTotal = politician.israelLobbyTotal || breakdown.aipac;
        addNode({ id: 'cat-israel', label: 'Israel Lobby', type: 'israel', amount: israelTotal });
        links.push({ source: 'cat-funding', target: 'cat-israel', type: 'category' });
        donors.filter(d => d.type === 'Israel-PAC').forEach((d, i) => {
          const id = `israel-${i}`;
          addNode({ id, label: d.name, type: 'israel', amount: d.amount, tag: 'DIRECT' });
          links.push({ source: 'cat-israel', target: id, type: 'funding', amount: d.amount });
        });
      }
    } else {
      // No breakdown, just show donors directly
      donors.forEach((d, i) => {
        const type = d.type === 'Israel-PAC' ? 'israel' : d.type === 'PAC' ? 'pac' : d.type === 'Corporate' ? 'corporate' : 'individual';
        const id = `donor-${i}`;
        addNode({ id, label: d.name, type, amount: d.amount });
        links.push({ source: 'cat-funding', target: id, type: 'funding', amount: d.amount });
      });
    }
  }

  // --- LOBBYING ---
  if (lobbyRecords.length > 0) {
    addNode({ id: 'cat-lobbying', label: 'LOBBYING', type: 'category' });
    links.push({ source: 'politician', target: 'cat-lobbying', type: 'category' });

    const byFirm: Record<string, { income: number; clients: Set<string> }> = {};
    for (const r of lobbyRecords) {
      const firm = (r.registrantName as string) || 'Unknown';
      if (!byFirm[firm]) byFirm[firm] = { income: 0, clients: new Set() };
      byFirm[firm].income += (r.income as number) || 0;
      if (r.clientName) byFirm[firm].clients.add(r.clientName as string);
    }

    Object.entries(byFirm)
      .sort((a, b) => b[1].income - a[1].income)
      .slice(0, 15)
      .forEach(([firm, data], i) => {
        const firmId = `firm-${i}`;
        addNode({ id: firmId, label: firm, type: 'lobby-firm', amount: data.income, sublabel: `${data.clients.size} clients` });
        links.push({ source: 'cat-lobbying', target: firmId, type: 'lobbying', amount: data.income });

        [...data.clients].slice(0, 5).forEach((client, ci) => {
          if (client !== firm) {
            const clientId = `client-${i}-${ci}`;
            addNode({ id: clientId, label: client, type: 'lobby-client' });
            links.push({ source: firmId, target: clientId, type: 'client' });
          }
        });
      });
  }

  // --- INDEPENDENT EXPENDITURES ---
  if (ieDetails.length > 0) {
    addNode({ id: 'cat-ie', label: 'INDEP. EXPENDITURES', type: 'category' });
    links.push({ source: 'politician', target: 'cat-ie', type: 'category' });

    ieDetails.sort((a, b) => b.amount - a.amount).slice(0, 10).forEach((ie, i) => {
      const id = `ie-${i}`;
      addNode({
        id,
        label: ie.committee_name,
        type: ie.is_israel_lobby ? 'israel' : 'ie',
        amount: ie.amount,
        tag: ie.support_oppose === 'support' ? 'SUPPORT' : 'OPPOSE',
      });
      links.push({ source: 'cat-ie', target: id, type: 'ie', amount: ie.amount });
    });
  }

  return { nodes, links };
}

// ---------------------------------------------------------------------------
// D3 Force Graph Component
// ---------------------------------------------------------------------------

export default function ConnectionsGraph({ politician }: { politician: Politician }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 900, height: 600 });
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);

  // Responsive sizing
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const w = entry.contentRect.width;
        setDimensions({ width: w, height: Math.max(500, Math.min(w * 0.7, 700)) });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // D3 simulation
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const { nodes, links } = buildGraph(politician);
    if (nodes.length <= 1) return; // no data

    const { width, height } = dimensions;

    // Clear previous
    d3.select(svg).selectAll('*').remove();

    const root = d3.select(svg)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .append('g');

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => root.attr('transform', event.transform));
    d3.select(svg).call(zoom);

    // Arrow marker
    root.append('defs').selectAll('marker')
      .data(['arrow'])
      .join('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', 'rgba(255,255,255,0.2)');

    // Simulation
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id).distance(d => {
        if (d.type === 'category') return 100;
        if (d.type === 'client') return 60;
        return 80;
      }))
      .force('charge', d3.forceManyBody().strength(d => {
        const n = d as GraphNode;
        if (n.type === 'politician') return -400;
        if (n.type === 'category') return -250;
        return -120;
      }))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide<GraphNode>().radius(d => nodeRadius(d) + 4));

    // Links
    const link = root.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', d => {
        if (d.type === 'funding') return 'rgba(245, 158, 11, 0.4)';
        if (d.type === 'lobbying') return 'rgba(167, 139, 250, 0.4)';
        if (d.type === 'ie') return 'rgba(6, 182, 212, 0.4)';
        if (d.type === 'client') return 'rgba(139, 92, 246, 0.25)';
        return 'rgba(255, 255, 255, 0.15)';
      })
      .attr('stroke-width', d => {
        if (d.type === 'category') return 2;
        if (d.amount && d.amount >= 100_000) return 2.5;
        return 1.2;
      })
      .attr('marker-end', d => d.type === 'category' ? '' : 'url(#arrow)');

    // Node groups
    const node = root.append('g')
      .selectAll<SVGGElement, GraphNode>('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'pointer')
      .call(d3.drag<SVGGElement, GraphNode>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
      );

    // Node circles
    node.append('circle')
      .attr('r', d => nodeRadius(d))
      .attr('fill', d => NODE_COLORS[d.type])
      .attr('fill-opacity', d => d.type === 'politician' ? 0.9 : 0.7)
      .attr('stroke', d => NODE_COLORS[d.type])
      .attr('stroke-width', d => d.type === 'politician' ? 3 : 1.5)
      .attr('stroke-opacity', 0.8);

    // Politician icon
    node.filter(d => d.type === 'politician')
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', '16px')
      .text('👤');

    // Category icons
    node.filter(d => d.type === 'category')
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', '12px')
      .text(d => {
        if (d.id === 'cat-funding') return '💰';
        if (d.id === 'cat-lobbying') return '🏛️';
        if (d.id === 'cat-ie') return '📡';
        if (d.id === 'cat-israel') return '🇮🇱';
        return '📂';
      });

    // Labels
    node.append('text')
      .attr('dy', d => nodeRadius(d) + 12)
      .attr('text-anchor', 'middle')
      .attr('fill', 'rgba(255, 255, 255, 0.8)')
      .attr('font-size', d => d.type === 'politician' ? '11px' : d.type === 'category' ? '9px' : '8px')
      .attr('font-weight', d => d.type === 'politician' || d.type === 'category' ? '700' : '500')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('letter-spacing', d => d.type === 'category' ? '0.05em' : '0')
      .text(d => truncate(d.label, d.type === 'politician' ? 30 : 20));

    // Amount labels on larger nodes
    node.filter(d => d.amount != null && d.amount > 0 && d.type !== 'category')
      .append('text')
      .attr('dy', d => nodeRadius(d) + 22)
      .attr('text-anchor', 'middle')
      .attr('fill', d => NODE_COLORS[d.type])
      .attr('font-size', '7px')
      .attr('font-weight', '700')
      .attr('font-family', 'Bebas Neue, JetBrains Mono, monospace')
      .text(d => d.amount ? formatAmount(d.amount) : '');

    // Hover tooltip
    node.on('mouseenter', (_event, d) => setHoveredNode(d))
      .on('mouseleave', () => setHoveredNode(null));

    // Tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as GraphNode).x!)
        .attr('y1', d => (d.source as GraphNode).y!)
        .attr('x2', d => (d.target as GraphNode).x!)
        .attr('y2', d => (d.target as GraphNode).y!);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    return () => { simulation.stop(); };
  }, [politician, dimensions]);

  const { nodes } = buildGraph(politician);
  if (nodes.length <= 1) return null; // No graph data

  return (
    <div className="terminal-card" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--terminal-blue)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
          🗺️ CONNECTION MAP
        </h3>
        <div style={{ fontSize: '0.65rem', color: 'var(--terminal-text-dim)' }}>
          Drag nodes to explore • Scroll to zoom • {nodes.length} entities mapped
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem', fontSize: '0.65rem' }}>
        {[
          { color: NODE_COLORS.individual, label: 'Individual' },
          { color: NODE_COLORS.pac, label: 'PAC' },
          { color: NODE_COLORS.corporate, label: 'Corporate' },
          { color: NODE_COLORS.israel, label: 'Israel Lobby' },
          { color: NODE_COLORS['lobby-firm'], label: 'Lobby Firm' },
          { color: NODE_COLORS['lobby-client'], label: 'Client' },
          { color: NODE_COLORS.ie, label: 'Indep. Expenditure' },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--terminal-text-dim)' }}>{item.label}</span>
          </div>
        ))}
      </div>

      {/* Graph container */}
      <div ref={containerRef} style={{ width: '100%', position: 'relative', background: 'rgba(0, 0, 0, 0.3)', border: '1px solid var(--terminal-border)', borderRadius: '2px' }}>
        <svg
          ref={svgRef}
          style={{ width: '100%', height: dimensions.height, display: 'block' }}
        />

        {/* Hover tooltip */}
        {hoveredNode && (
          <div style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: 'var(--terminal-card)',
            border: '1px solid var(--terminal-border)',
            padding: '0.75rem',
            fontSize: '0.75rem',
            maxWidth: '250px',
            pointerEvents: 'none',
            zIndex: 10,
          }}>
            <div style={{ fontWeight: 700, color: NODE_COLORS[hoveredNode.type], marginBottom: '0.25rem' }}>
              {hoveredNode.label}
            </div>
            {hoveredNode.sublabel && (
              <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.65rem', marginBottom: '0.25rem' }}>
                {hoveredNode.sublabel}
              </div>
            )}
            {hoveredNode.amount != null && hoveredNode.amount > 0 && (
              <div style={{ fontWeight: 700, fontFamily: 'Bebas Neue, monospace', fontSize: '1rem', color: NODE_COLORS[hoveredNode.type] }}>
                {formatAmount(hoveredNode.amount)}
              </div>
            )}
            {hoveredNode.tag && (
              <div style={{
                display: 'inline-block',
                marginTop: '0.25rem',
                fontSize: '0.6rem',
                padding: '1px 4px',
                background: `${NODE_COLORS[hoveredNode.type]}20`,
                color: NODE_COLORS[hoveredNode.type],
                border: `1px solid ${NODE_COLORS[hoveredNode.type]}40`,
                fontWeight: 700,
              }}>
                {hoveredNode.tag}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

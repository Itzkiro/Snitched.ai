'use client';

import { Suspense, useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import cytoscape, { type Core, type NodeSingular } from 'cytoscape';
import fcose from 'cytoscape-fcose';
import Link from 'next/link';

if (typeof window !== 'undefined') {
  cytoscape.use(fcose);
}

// ---------------------------------------------------------------------------
// Colors & Styles
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<string, string> = {
  politician: '#00bfff',
  donor: '#10b981',
  pac: '#f59e0b',
  corporate: '#60a5fa',
  'israel-pac': '#ef4444',
  'lobby-firm': '#e3b341',
  'lobby-client': '#a78bfa',
  'court-case': '#b392f0',
};

const PARTY_COLORS: Record<string, string> = {
  Republican: '#ef4444',
  Democrat: '#3b82f6',
  Independent: '#9ca3af',
};

function getColor(category: string): string {
  return CATEGORY_COLORS[category] ?? '#8b949e';
}

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
      'font-family': 'JetBrains Mono, monospace',
      shape: 'data(shape)',
      width: 'data(size)',
      height: 'data(size)',
      'text-wrap': 'ellipsis',
      'text-max-width': '140px',
      'min-zoomed-font-size': 4,
      'text-outline-color': '#0a0a0a',
      'text-outline-width': 1.5,
      'text-outline-opacity': 0.8,
    },
  },
  { selector: 'node:selected', style: { 'border-width': 3, 'border-color': '#ffffff', 'border-opacity': 1, 'background-opacity': 1 } },
  { selector: 'node.highlighted', style: { 'border-width': 2, 'border-color': '#ffffff', 'background-opacity': 1 } },
  { selector: 'node.dimmed', style: { opacity: 0.08, 'text-opacity': 0 } },
  { selector: 'edge', style: { width: 1, 'line-color': 'data(color)', 'curve-style': 'bezier', opacity: 0.2, 'target-arrow-shape': 'none' } },
  { selector: 'edge.highlighted', style: { 'line-color': '#58a6ff', width: 2.5, opacity: 0.8 } },
  { selector: 'edge.dimmed', style: { opacity: 0.03 } },
  { selector: 'node.hidden, edge.hidden', style: { display: 'none' } },
] as unknown as cytoscape.StylesheetStyle[];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConnNode {
  id: string;
  label: string;
  category: string;
  total_amount: number;
  politician_count: number;
  metadata: Record<string, unknown>;
}

interface ConnEdge {
  id: string;
  source_id: string;
  target_id: string;
  source_type: string;
  target_type: string;
  label: string;
  amount: number;
}

interface PolNode {
  bioguide_id: string;
  name: string;
  party: string;
  office: string;
  corruption_score: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export default function ConnectionsPage() {
  return <Suspense><ConnectionsContent /></Suspense>;
}

function ConnectionsContent() {
  const searchParams = useSearchParams();
  const stateParam = searchParams.get('state') || '';
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState({ totalNodes: 0, totalEdges: 0, totalPoliticians: 0 });
  const [selected, setSelected] = useState<{ label: string; category: string; amount?: number; connections?: number; party?: string; office?: string } | null>(null);
  const [minConn, setMinConn] = useState(2);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [layout, setLayout] = useState<'fcose' | 'circle' | 'concentric'>('fcose');
  const [search, setSearch] = useState('');
  const [crossParty, setCrossParty] = useState<Array<{ id: string; label: string; category: string; republicans: number; democrats: number; total: number }>>([]);

  const getLayoutOpts = useCallback((name: string): cytoscape.LayoutOptions => {
    switch (name) {
      case 'circle': return { name: 'circle', animate: true, animationDuration: 300, avoidOverlap: true } as cytoscape.LayoutOptions;
      case 'concentric': return {
        name: 'concentric', animate: true, animationDuration: 300, avoidOverlap: true, minNodeSpacing: 20,
        concentric: (node: { data: (k: string) => string }) => node.data('nodeType') === 'politician' ? 3 : node.data('nodeType') === 'shared' ? 2 : 1,
        levelWidth: () => 1,
      } as unknown as cytoscape.LayoutOptions;
      default: return {
        name: 'fcose', animate: true, animationDuration: 500, randomize: true, quality: 'proof',
        nodeSeparation: 60, idealEdgeLength: 120, nodeRepulsion: () => 15000,
        edgeElasticity: () => 0.45, gravity: 0.25, numIter: 2500,
      } as unknown as cytoscape.LayoutOptions;
    }
  }, []);

  // Fetch and render
  useEffect(() => {
    const fetchAndRender = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ minConnections: String(minConn), limit: '400' });
        if (categoryFilter) params.set('category', categoryFilter);
        if (stateParam) params.set('state', stateParam);
        const res = await fetch(`/api/connections?${params}`);
        const data = await res.json();
        if (data.error) { console.error(data.error); return; }

        const nodes: ConnNode[] = data.nodes || [];
        const edges: ConnEdge[] = data.edges || [];
        const pols: PolNode[] = data.politicians || [];
        setMeta(data.meta || {});
        setCrossParty(data.crossParty || []);

        if (!containerRef.current) return;

        // Build Cytoscape elements
        const cyNodes: cytoscape.ElementDefinition[] = [];
        const cyEdges: cytoscape.ElementDefinition[] = [];

        // Politician nodes
        for (const p of pols) {
          const deg = edges.filter(e => e.source_id === p.bioguide_id).length;
          cyNodes.push({
            data: {
              id: p.bioguide_id, label: p.name, color: PARTY_COLORS[p.party] || '#8b949e',
              size: 30 + Math.sqrt(deg) * 5, fontSize: '10px', shape: 'star',
              nodeType: 'politician', party: p.party, office: p.office, score: p.corruption_score,
            },
          });
        }

        // Entity nodes
        for (const n of nodes) {
          const isShared = n.politician_count > 1;
          cyNodes.push({
            data: {
              id: n.id, label: n.label, color: getColor(n.category),
              size: isShared ? 14 + Math.sqrt(n.politician_count) * 6 : 10,
              fontSize: isShared ? '8px' : '6px',
              shape: n.category.includes('lobby') ? 'diamond' : n.category === 'court-case' ? 'round-rectangle' : 'ellipse',
              nodeType: isShared ? 'shared' : 'entity',
              category: n.category, amount: n.total_amount, connections: n.politician_count,
            },
          });
        }

        // Edges
        const nodeIds = new Set(cyNodes.map(n => n.data.id));
        for (const e of edges) {
          if (!nodeIds.has(e.source_id) || !nodeIds.has(e.target_id)) continue;
          cyEdges.push({
            data: {
              id: e.id, source: e.source_id, target: e.target_id,
              color: getColor(e.target_type), label: e.label,
            },
          });
        }

        // Destroy previous
        if (cyRef.current) cyRef.current.destroy();

        const cy = cytoscape({
          container: containerRef.current,
          elements: [...cyNodes, ...cyEdges],
          style: graphStyle,
          layout: getLayoutOpts(layout),
          minZoom: 0.1,
          maxZoom: 5,
          wheelSensitivity: 0.3,
        });

        cy.on('tap', 'node', (evt) => {
          const node = evt.target as NodeSingular;
          cy.elements().removeClass('dimmed highlighted');
          const neighborhood = node.neighborhood().add(node);
          cy.elements().not(neighborhood).addClass('dimmed');
          neighborhood.edges().addClass('highlighted');
          neighborhood.nodes().addClass('highlighted');
          node.removeClass('highlighted');
          setSelected({
            label: node.data('label'),
            category: node.data('category') || node.data('party') || '',
            amount: node.data('amount'),
            connections: node.data('connections'),
            party: node.data('party'),
            office: node.data('office'),
          });
        });

        cy.on('tap', (evt) => {
          if (evt.target === cy) {
            cy.elements().removeClass('dimmed highlighted');
            cy.nodes().unselect();
            setSelected(null);
          }
        });

        cyRef.current = cy;
      } catch (err) {
        console.error('Failed to load connections:', err);
      }
      setLoading(false);
    };

    fetchAndRender();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minConn, categoryFilter, stateParam]);

  // Layout change
  useEffect(() => {
    if (cyRef.current) cyRef.current.layout(getLayoutOpts(layout)).run();
  }, [layout, getLayoutOpts]);

  // Search
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().removeClass('hidden');
    cy.edges().removeClass('hidden');
    if (!search.trim()) return;
    const q = search.toLowerCase();
    cy.nodes().forEach(node => {
      if (!(node.data('label') || '').toLowerCase().includes(q)) {
        node.addClass('hidden');
      }
    });
    cy.edges().forEach(edge => {
      if (edge.source().hasClass('hidden') && edge.target().hasClass('hidden')) {
        edge.addClass('hidden');
      }
    });
  }, [search]);

  const categories = [
    { id: null, label: 'ALL' },
    { id: 'donor', label: 'Donors', color: CATEGORY_COLORS.donor },
    { id: 'pac', label: 'PACs', color: CATEGORY_COLORS.pac },
    { id: 'corporate', label: 'Corporate', color: CATEGORY_COLORS.corporate },
    { id: 'israel-pac', label: 'Israel PAC', color: CATEGORY_COLORS['israel-pac'] },
    { id: 'lobby-firm', label: 'Lobby Firms', color: CATEGORY_COLORS['lobby-firm'] },
    { id: 'court-case', label: 'Court Cases', color: CATEGORY_COLORS['court-case'] },
  ];

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--terminal-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: 400, letterSpacing: '0.05em', margin: 0 }}>
              CONNECTIONS MAP
            </h1>
            <p style={{ color: 'var(--terminal-text-dim)', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>
              Cross-politician network analysis | {meta.totalPoliticians} politicians | {meta.totalNodes} entities | {meta.totalEdges} connections
            </p>
          </div>
          <Link href="/" className="terminal-btn" style={{ textDecoration: 'none', padding: '0.4rem 0.75rem', fontSize: '0.7rem' }}>← HOME</Link>
        </div>
      </div>

      {/* Controls */}
      <div style={{ padding: '0.75rem 2rem', borderBottom: '1px solid var(--terminal-border)', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
        {/* Search */}
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search entities..."
          style={{
            padding: '0.4rem 0.6rem', background: 'var(--terminal-surface)', border: '1px solid var(--terminal-border)',
            color: 'var(--terminal-text)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', width: '200px',
          }}
        />

        {/* Category filters */}
        {categories.map(c => (
          <button key={c.id || 'all'} onClick={() => setCategoryFilter(c.id)}
            className="terminal-btn"
            style={{
              padding: '0.3rem 0.6rem', fontSize: '0.65rem',
              background: categoryFilter === c.id ? `${c.color || 'var(--terminal-blue)'}20` : 'transparent',
              border: `1px solid ${categoryFilter === c.id ? (c.color || 'var(--terminal-blue)') : 'var(--terminal-border)'}`,
              color: categoryFilter === c.id ? (c.color || 'var(--terminal-blue)') : 'var(--terminal-text-dim)',
            }}>
            {c.label}
          </button>
        ))}

        {/* Min connections */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.65rem', color: 'var(--terminal-text-dim)' }}>
          Min shared:
          {[2, 3, 5, 10].map(n => (
            <button key={n} onClick={() => setMinConn(n)} className="terminal-btn"
              style={{
                padding: '0.2rem 0.4rem', fontSize: '0.6rem',
                background: minConn === n ? 'rgba(255,255,255,0.1)' : 'transparent',
                border: `1px solid ${minConn === n ? 'var(--terminal-text-dim)' : 'var(--terminal-border)'}`,
              }}>
              {n}+
            </button>
          ))}
        </div>

        {/* Layout */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.25rem' }}>
          {(['fcose', 'circle', 'concentric'] as const).map(l => (
            <button key={l} onClick={() => setLayout(l)} className="terminal-btn"
              style={{
                padding: '0.2rem 0.5rem', fontSize: '0.6rem',
                background: layout === l ? 'rgba(255,255,255,0.1)' : 'transparent',
                border: `1px solid ${layout === l ? 'var(--terminal-text-dim)' : 'var(--terminal-border)'}`,
              }}>
              {l === 'fcose' ? 'Force' : l === 'circle' ? 'Circle' : 'Grouped'}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ padding: '0.5rem 2rem', borderBottom: '1px solid var(--terminal-border)', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', fontSize: '0.6rem' }}>
        {[
          { color: PARTY_COLORS.Republican, label: 'Republican', shape: '★' },
          { color: PARTY_COLORS.Democrat, label: 'Democrat', shape: '★' },
          { color: CATEGORY_COLORS.donor, label: 'Donor' },
          { color: CATEGORY_COLORS.pac, label: 'PAC' },
          { color: CATEGORY_COLORS.corporate, label: 'Corporate' },
          { color: CATEGORY_COLORS['israel-pac'], label: 'Israel PAC' },
          { color: CATEGORY_COLORS['lobby-firm'], label: 'Lobby Firm', shape: '◆' },
          { color: CATEGORY_COLORS['court-case'], label: 'Court Case', shape: '▬' },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ color: item.color, fontSize: '0.7rem' }}>{item.shape || '●'}</span>
            <span style={{ color: 'var(--terminal-text-dim)' }}>{item.label}</span>
          </div>
        ))}
        <span style={{ color: 'var(--terminal-text-dim)', marginLeft: '0.5rem' }}>| Larger nodes = more politician connections</span>
      </div>

      {/* Graph */}
      <div style={{ position: 'relative' }}>
        {loading && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10, fontSize: '1.25rem', color: 'var(--terminal-blue)' }}>
            Loading network...
          </div>
        )}
        <div ref={containerRef} style={{ width: '100%', height: 'min(calc(100vh - 200px), 700px)', minHeight: '400px', background: 'rgba(0,0,0,0.3)' }} />

        {/* Detail overlay */}
        {selected && (
          <div style={{
            position: 'absolute', top: 12, right: 12, background: 'var(--terminal-card)',
            border: '1px solid var(--terminal-border)', padding: '1rem', maxWidth: '280px', zIndex: 10,
          }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: selected.party ? (PARTY_COLORS[selected.party] || '#fff') : getColor(selected.category), marginBottom: '0.25rem' }}>
              {selected.label}
            </div>
            {selected.office && <div style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dim)' }}>{selected.office}</div>}
            {selected.party && <div style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dim)' }}>{selected.party}</div>}
            {selected.category && !selected.party && (
              <div style={{ fontSize: '0.65rem', padding: '1px 4px', display: 'inline-block', marginTop: '0.25rem', background: `${getColor(selected.category)}20`, color: getColor(selected.category), border: `1px solid ${getColor(selected.category)}40`, fontWeight: 700 }}>
                {selected.category.toUpperCase()}
              </div>
            )}
            {selected.amount != null && selected.amount > 0 && (
              <div style={{ fontWeight: 700, fontFamily: 'Bebas Neue, monospace', fontSize: '1.1rem', color: getColor(selected.category), marginTop: '0.25rem' }}>
                {fmt(selected.amount)}
              </div>
            )}
            {selected.connections != null && selected.connections > 1 && (
              <div style={{ fontSize: '0.7rem', color: 'var(--terminal-amber)', marginTop: '0.25rem' }}>
                Connected to {selected.connections} politicians
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cross-Party Analysis */}
      {crossParty.length > 0 && (
        <div style={{ padding: '1.5rem 2rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--terminal-amber)', letterSpacing: '0.05em', marginBottom: '1rem' }}>
            🔀 CROSS-PARTY CONNECTIONS — Entities funding BOTH Republicans & Democrats
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
            {crossParty.map(cp => (
              <div key={cp.id} className="terminal-card" style={{ padding: '0.75rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: '0.25rem' }}>{cp.label}</div>
                <div style={{ fontSize: '0.65rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <span style={{ color: '#ef4444' }}>R: {cp.republicans}</span>
                  <span style={{ color: '#3b82f6' }}>D: {cp.democrats}</span>
                  <span style={{ color: 'var(--terminal-text-dim)' }}>Total: {cp.total}</span>
                  <span style={{
                    fontSize: '0.55rem', padding: '1px 4px',
                    background: `${getColor(cp.category)}20`, color: getColor(cp.category),
                    border: `1px solid ${getColor(cp.category)}40`, fontWeight: 700,
                  }}>
                    {cp.category.toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="classified-footer">
        ALL DATA ACQUIRED VIA OSINT // PUBLIC RECORDS: FEC, COURTLISTENER, LDA // CROSS-POLITICIAN NETWORK ANALYSIS
      </div>
    </div>
  );
}

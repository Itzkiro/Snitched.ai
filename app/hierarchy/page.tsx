'use client';

import { Suspense, useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { Politician } from '@/lib/types';
import { getStateName } from '@/lib/state-utils';

interface HierarchyNode {
  id: string;
  name: string;
  count: number;
  children?: HierarchyNode[];
  politicians?: Politician[];
}

/**
 * Helper: create a leaf node from a filtered politician list.
 * Returns undefined when the list is empty so callers can filter out blanks.
 */
function leafNode(id: string, name: string, list: Politician[]): HierarchyNode | undefined {
  if (list.length === 0) return undefined;
  return { id, name, count: list.length, politicians: list };
}

/**
 * Helper: create a branch node whose count is the sum of its children.
 * Empty children are filtered out automatically.
 */
function branchNode(id: string, name: string, children: (HierarchyNode | undefined)[]): HierarchyNode | undefined {
  const valid = children.filter((c): c is HierarchyNode => c != null && c.count > 0);
  if (valid.length === 0) return undefined;
  return { id, name, count: valid.reduce((s, c) => s + c.count, 0), children: valid };
}

/** Map municipality jurisdictions to their parent county */
const MUNICIPALITY_TO_COUNTY: Record<string, string> = {
  'Palm Coast': 'Flagler County',
  'Flagler Beach': 'Flagler County',
  'Bunnell': 'Flagler County',
  'Palatka': 'Putnam County',
  'Crescent City': 'Putnam County',
};

/** Known county names — used to discover counties dynamically from data */
const COUNTY_NAMES = [
  'Volusia County', 'Flagler County', 'Putnam County',
  'Lake County', 'Seminole County', 'Orange County', 'Brevard County',
];

const CONSTITUTIONAL_OFFICES: Politician['officeLevel'][] = [
  'Sheriff', 'Clerk of Court', 'Property Appraiser', 'Tax Collector', 'Supervisor of Elections',
];

/**
 * Build a sub-tree for a single county from all politicians that belong to it
 * (including municipal officials from cities within the county).
 */
function buildCountyNode(slug: string, countyName: string, pols: Politician[]): HierarchyNode | undefined {
  if (pols.length === 0) return undefined;

  const commissioners = pols.filter(p => p.officeLevel === 'County Commissioner');
  const constitutional = pols.filter(p => CONSTITUTIONAL_OFFICES.includes(p.officeLevel));
  const schoolBoard = pols.filter(p => p.officeLevel === 'School Board');
  const judges = pols.filter(p => p.officeLevel === 'Judge');
  const stateAttorneys = pols.filter(p => p.officeLevel === 'State Attorney');
  const publicDefenders = pols.filter(p => p.officeLevel === 'Public Defender');
  const legalOfficers = [...stateAttorneys, ...publicDefenders];
  const soilWater = pols.filter(p => p.officeLevel === 'Soil & Water');
  const mayors = pols.filter(p => p.officeLevel === 'Mayor');
  const cityCommissioners = pols.filter(p => p.officeLevel === 'City Commissioner');

  const countyGov = branchNode(`${slug}-gov`, 'County Government', [
    leafNode(`${slug}-commissioners`, 'County Commissioners', commissioners),
    leafNode(`${slug}-constitutional`, 'Constitutional Officers', constitutional),
  ]);

  const education = leafNode(`${slug}-education`, 'School Board', schoolBoard);

  const judiciary = branchNode(`${slug}-judiciary`, 'Judiciary', [
    leafNode(`${slug}-judges`, 'Judges', judges),
    leafNode(`${slug}-legal`, 'State Attorney & Public Defender', legalOfficers),
  ]);

  const municipal = branchNode(`${slug}-municipal`, 'Municipal Officials', [
    leafNode(`${slug}-mayors`, 'Mayors', mayors),
    leafNode(`${slug}-city-comm`, 'City Commissioners', cityCommissioners),
  ]);

  const special = leafNode(`${slug}-soil-water`, 'Soil & Water Conservation', soilWater);

  return branchNode(slug, countyName, [
    countyGov,
    education,
    judiciary,
    municipal,
    special,
  ]);
}

/**
 * Build the full hierarchy tree from the flat politician list returned by the API.
 * Every count is derived from the actual data -- nothing is hardcoded.
 */
function buildHierarchy(all: Politician[], rootName = 'Florida', rootSlug = 'florida'): HierarchyNode {
  const byOffice = (level: Politician['officeLevel']) => all.filter(p => p.officeLevel === level);

  // ── Federal ──
  const federal = branchNode('federal', 'Federal Delegation', [
    leafNode('us-senate', 'U.S. Senate', byOffice('US Senator')),
    leafNode('us-house', 'U.S. House', byOffice('US Representative')),
  ]);

  // ── State Executive ──
  const stateExec = leafNode('state-exec', 'State Executive', byOffice('Governor'));

  // ── State Legislature ──
  const stateLeg = branchNode('state-leg', 'State Legislature', [
    leafNode('state-senate', 'State Senate', byOffice('State Senator')),
    leafNode('state-house', 'State House', byOffice('State Representative')),
  ]);

  // ── Counties ──
  // Group all county/municipal politicians by their parent county
  const countyGroups: Record<string, Politician[]> = {};
  for (const name of COUNTY_NAMES) countyGroups[name] = [];

  for (const p of all) {
    if (p.jurisdictionType !== 'county' && p.jurisdictionType !== 'municipal') continue;
    const parentCounty = MUNICIPALITY_TO_COUNTY[p.jurisdiction] || p.jurisdiction;
    if (!countyGroups[parentCounty]) countyGroups[parentCounty] = [];
    countyGroups[parentCounty].push(p);
  }

  const countyNodes: (HierarchyNode | undefined)[] = Object.entries(countyGroups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, pols]) => {
      const slug = name.toLowerCase().replace(/\s+/g, '-');
      return buildCountyNode(slug, name, pols);
    });

  const countiesNode = branchNode('counties', 'Counties', countyNodes);

  // ── Top-level tree ──
  const topChildren: (HierarchyNode | undefined)[] = [
    federal,
    stateExec,
    stateLeg,
    countiesNode,
  ];
  const validTop = topChildren.filter((c): c is HierarchyNode => c != null && c.count > 0);

  return {
    id: rootSlug,
    name: rootName,
    count: validTop.reduce((s, c) => s + c.count, 0),
    children: validTop,
  };
}

/**
 * Recursively sum AIPAC funding across the entire sub-tree rooted at `node`.
 */
function sumAipacFunding(node: HierarchyNode): number {
  let total = 0;
  if (node.politicians) {
    total += node.politicians.reduce((s, p) => s + p.aipacFunding, 0);
  }
  if (node.children) {
    for (const child of node.children) {
      total += sumAipacFunding(child);
    }
  }
  return total;
}

export default function HierarchyPage() {
  return <Suspense><HierarchyContent /></Suspense>;
}

function HierarchyContent() {
  const searchParams = useSearchParams();
  const stateParam = searchParams.get('state') || '';
  const stateName = getStateName(stateParam || 'FL');
  const rootSlug = stateName.toLowerCase().replace(/\s+/g, '-');
  const [path, setPath] = useState<string[]>([rootSlug]);
  const [allPoliticians, setAllPoliticians] = useState<Politician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const qs = stateParam ? `?state=${stateParam}` : '';
        const res = await fetch(`/api/politicians${qs}`);
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data: Politician[] = await res.json();
        setAllPoliticians(data);
      } catch (err) {
        console.error('Error loading:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }
    setPath([rootSlug]);
    loadData();
  }, [stateParam, rootSlug]);

  const hierarchyData = useMemo(() => {
    if (allPoliticians.length === 0) return null;
    return buildHierarchy(allPoliticians, stateName, rootSlug);
  }, [allPoliticians, stateName, rootSlug]);

  if (loading || !hierarchyData) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  }

  if (error) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#ef4444' }}>Error: {error}</div>;
  }

  const getCurrentNode = (): HierarchyNode => {
    let current = hierarchyData;
    for (let i = 1; i < path.length; i++) {
      const child = current.children?.find(c => c.id === path[i]);
      if (child) current = child;
      else break;
    }
    return current;
  };

  const navigateTo = (nodeId: string) => {
    setPath([...path, nodeId]);
  };

  const navigateUp = (index: number) => {
    setPath(path.slice(0, index + 1));
  };

  const currentNode = getCurrentNode();
  const breadcrumbs = path.map((id, idx) => {
    let node = hierarchyData;
    for (let i = 1; i <= idx; i++) {
      const child = node.children?.find(c => c.id === path[i]);
      if (child) node = child;
    }
    return { id, name: node.name };
  });

  const aipacTotal = sumAipacFunding(currentNode);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--terminal-bg)', color: 'var(--terminal-text)' }}>
      {/* Terminal Title */}
      <div className="terminal-title">
        <div>
          <h1>HIERARCHY - {stateName.toUpperCase()} GOVERNMENT STRUCTURE</h1>
          <div className="terminal-subtitle">
            DOGE.gov-Style Drill-Down | Navigate {currentNode.count} Officials
          </div>
        </div>
      </div>

      {/* Alert */}
      <div style={{ padding: '2rem', borderBottom: '1px solid var(--terminal-border)' }}>
        <div className="alert-level">
          <span className="alert-icon">&#128451;</span>
          <span>CURRENT LEVEL: {currentNode.name.toUpperCase()}</span>
          <span style={{ fontSize: '0.875rem', color: 'var(--terminal-text-dim)', marginLeft: '1rem' }}>
            {currentNode.count} OFFICIALS
          </span>
        </div>
      </div>

      {/* Breadcrumb Navigation */}
      <div style={{
        textAlign: 'center',
        padding: '3rem 2rem 2rem',
        borderBottom: '1px solid var(--terminal-border)'
      }}>
        <div style={{ fontSize: '1.5rem', fontWeight: 400, marginBottom: '2rem', color: 'var(--terminal-text-dim)' }}>
          Trace every politician through the hierarchy.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          {breadcrumbs.map((crumb, idx) => (
            <div key={crumb.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <button
                onClick={() => navigateUp(idx)}
                style={{
                  background: idx === breadcrumbs.length - 1 ? 'transparent' : '#1a1a1a',
                  border: idx === breadcrumbs.length - 1 ? '1px solid #ef4444' : '1px solid #333',
                  color: idx === breadcrumbs.length - 1 ? '#fff' : '#888',
                  padding: '1rem 2rem',
                  fontSize: '1.5rem',
                  fontWeight: 600,
                  cursor: idx === breadcrumbs.length - 1 ? 'default' : 'pointer',
                  borderRadius: '4px',
                  transition: 'all 0.2s',
                  minWidth: '300px',
                }}
                onMouseEnter={(e) => {
                  if (idx !== breadcrumbs.length - 1) {
                    e.currentTarget.style.borderColor = '#ef4444';
                    e.currentTarget.style.color = '#fff';
                  }
                }}
                onMouseLeave={(e) => {
                  if (idx !== breadcrumbs.length - 1) {
                    e.currentTarget.style.borderColor = '#333';
                    e.currentTarget.style.color = '#888';
                  }
                }}
              >
                {crumb.name}
              </button>
              {idx < breadcrumbs.length - 1 && (
                <div style={{
                  width: '1px',
                  height: '30px',
                  background: '#333',
                  margin: '0.5rem 0'
                }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Current Level Stats */}
      <div style={{
        maxWidth: '1200px',
        margin: '4rem auto',
        padding: '0 2rem'
      }}>
        <div style={{
          background: '#0a0a0a',
          border: '1px solid #2a2a2a',
          borderRadius: '8px',
          padding: '3rem',
          marginBottom: '3rem',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '3rem' }}>
            <div>
              <div style={{ fontSize: '4rem', fontWeight: 700, color: '#fff', marginBottom: '0.5rem' }}>
                {currentNode.count.toLocaleString()}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Headcount
              </div>
            </div>
            <div>
              <div style={{ fontSize: '4rem', fontWeight: 700, color: '#ef4444', marginBottom: '0.5rem' }}>
                {currentNode.children?.length || (currentNode.politicians?.length || 0)}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {currentNode.children ? 'Subordinate Offices' : 'Officials'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '4rem', fontWeight: 700, color: '#f59e0b', marginBottom: '0.5rem' }}>
                ${(aipacTotal / 1000000).toFixed(1)}M
              </div>
              <div style={{ fontSize: '0.875rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Total AIPAC Funding
              </div>
            </div>
          </div>
        </div>

        {/* Child Nodes or Politicians */}
        {currentNode.children && currentNode.children.length > 0 && (
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '2rem', color: '#fff' }}>
              Drill Down
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '1.5rem'
            }}>
              {currentNode.children.map((child) => (
                <button
                  key={child.id}
                  onClick={() => navigateTo(child.id)}
                  style={{
                    background: '#0a0a0a',
                    border: '1px solid #2a2a2a',
                    borderRadius: '4px',
                    padding: '2rem',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#ef4444';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#2a2a2a';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#fff', marginBottom: '0.5rem' }}>
                    {child.name}
                  </div>
                  <div style={{
                    fontSize: '2rem',
                    fontWeight: 700,
                    color: '#ef4444',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}>
                    {child.count}
                    <span style={{ fontSize: '1rem', color: '#666' }}>{'\u2192'}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Individual Politicians */}
        {currentNode.politicians && currentNode.politicians.length > 0 && (
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '2rem', color: '#fff' }}>
              Officials
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
              gap: '1.5rem'
            }}>
              {currentNode.politicians.map((politician) => (
                <Link
                  key={politician.id}
                  href={`/politician/${politician.id}`}
                  style={{
                    background: '#0a0a0a',
                    border: '1px solid #2a2a2a',
                    borderRadius: '4px',
                    padding: '1.5rem',
                    textDecoration: 'none',
                    display: 'block',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#ef4444';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#2a2a2a';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                    <div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#fff', marginBottom: '0.25rem' }}>
                        {politician.name}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#888' }}>
                        {politician.office}{politician.district ? ` \u2022 ${politician.district}` : ''}
                      </div>
                    </div>
                    <div style={{
                      fontSize: '1.5rem',
                      fontWeight: 700,
                      color: politician.corruptionScore < 40 ? '#10b981' : politician.corruptionScore < 60 ? '#f59e0b' : '#ef4444'
                    }}>
                      {politician.corruptionScore}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '0.75rem',
                      padding: '0.4rem 0.75rem',
                      background: politician.party === 'Republican' ? '#dc2626' : politician.party === 'Democrat' ? '#2563eb' : '#6b7280',
                      color: '#fff',
                      borderRadius: '12px',
                      fontWeight: 600,
                    }}>
                      {politician.party === 'Republican' ? 'R' : politician.party === 'Democrat' ? 'D' : politician.party.charAt(0)}
                    </span>
                    {politician.juiceBoxTier !== 'none' && (
                      <span style={{
                        fontSize: '0.75rem',
                        padding: '0.25rem 0.5rem',
                        background: '#78350f',
                        color: '#f59e0b',
                        borderRadius: '3px',
                      }}>
                        {politician.juiceBoxTier === 'owned' ? 'OWNED' : politician.juiceBoxTier === 'bought' ? 'BOUGHT' : 'COMPROMISED'} ${(politician.aipacFunding / 1000).toFixed(0)}K
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {(!currentNode.children || currentNode.children.length === 0) &&
         (!currentNode.politicians || currentNode.politicians.length === 0) && (
          <div style={{
            textAlign: 'center',
            padding: '4rem 2rem',
            color: 'var(--terminal-text-dim)',
          }}>
            <div style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--terminal-text)' }}>
              No Data Available
            </div>
            <div style={{ fontSize: '0.875rem' }}>
              {currentNode.name} officials are not yet indexed in the database.
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="classified-footer">
        ALL DATA ACQUIRED VIA OSINT // PUBLIC RECORDS: FEC, SOCIAL MEDIA, NEWS OUTLETS // HIERARCHY NAVIGATION DIVISION
      </div>
    </div>
  );
}

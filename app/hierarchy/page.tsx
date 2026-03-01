'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getAllPoliticians } from '@/lib/real-data';
import type { Politician } from '@/lib/types';

interface HierarchyNode {
  id: string;
  name: string;
  count: number;
  children?: HierarchyNode[];
  politicians?: Politician[];
}

export default function HierarchyPage() {
  const [path, setPath] = useState<string[]>(['florida']);
  const [activeTab, setActiveTab] = useState<string>(''); // For tabbed views
  const [hierarchyData, setHierarchyData] = useState<HierarchyNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const allPoliticians = getAllPoliticians();
      
      const data: HierarchyNode = {
        id: 'florida',
        name: 'Florida',
        count: 8, // Will be 8000+ in production
        children: [
          {
            id: 'federal',
            name: 'Federal Delegation',
            count: 30,
            children: [
              {
                id: 'us-senate',
                name: 'U.S. Senate',
                count: 2,
                politicians: allPoliticians.filter(p => p.officeLevel === 'US Senator'),
              },
              {
                id: 'us-house',
                name: 'U.S. House',
                count: 28,
                politicians: allPoliticians.filter(p => p.officeLevel === 'US Representative'),
              },
            ],
          },
          {
            id: 'state-exec',
            name: 'State Executive',
            count: 7,
            politicians: allPoliticians.filter(p => p.officeLevel === 'Governor'),
          },
          {
            id: 'state-leg',
            name: 'State Legislature',
            count: 160,
            children: [
              { id: 'state-senate', name: 'State Senate', count: 40, politicians: [] },
              { id: 'state-house', name: 'State House', count: 120, politicians: [] },
            ],
          },
          { 
            id: 'county-municipal', 
            name: 'County & Municipal', 
            count: 478, // 67 counties + 411 municipalities
            children: [
              {
                id: 'counties',
                name: 'Counties',
                count: 67,
                children: [
                  {
                    id: 'volusia',
                    name: 'Volusia County',
                    count: 24, // 12 county officials + 12 city officials (will add cities)
                    children: [
                      {
                        id: 'county-officials',
                        name: 'County Officials',
                        count: 12,
                        politicians: allPoliticians.filter(p => p.jurisdiction === 'Volusia County' && p.officeLevel !== 'Mayor' && p.officeLevel !== 'City Council'),
                      },
                      {
                        id: 'volusia-cities',
                        name: 'Cities & Municipalities',
                        count: 12, // Daytona Beach, DeLand, Ormond Beach, etc.
                        children: [
                          // Will add Daytona Beach, DeLand, etc.
                        ],
                      },
                    ],
                  },
                  // Other 66 counties
                ],
              },
              {
                id: 'municipalities',
                name: 'All Municipalities',
                count: 411,
                children: [
                  // Will add all 411 FL cities
                ],
              },
            ],
          },
          { id: 'school-boards', name: 'School Boards', count: 67, politicians: [] },
        ],
      };
      
      setHierarchyData(data);
    } catch (error) {
      console.error('Error loading:', error);
      setError(error instanceof Error ? error.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  if (loading || !hierarchyData) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
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
    const newPath = [...path, nodeId];
    setPath(newPath);
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

  return (
    <div style={{ minHeight: '100vh', background: 'var(--terminal-bg)', color: 'var(--terminal-text)' }}>
      {/* Terminal Title */}
      <div className="terminal-title">
        <div>
          <h1>📊 HIERARCHY - FLORIDA GOVERNMENT STRUCTURE</h1>
          <div className="terminal-subtitle">
            DOGE.gov-Style Drill-Down | Navigate {currentNode.count} Officials
          </div>
        </div>
      </div>

      {/* Alert */}
      <div style={{ padding: '2rem', borderBottom: '1px solid var(--terminal-border)' }}>
        <div className="alert-level">
          <span className="alert-icon">🗂️</span>
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
                $
                {currentNode.politicians
                  ? (currentNode.politicians.reduce((sum, p) => sum + p.aipacFunding, 0) / 1000000).toFixed(1)
                  : '0.0'}M
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
                    <span style={{ fontSize: '1rem', color: '#666' }}>→</span>
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
                        {politician.office} • {politician.district}
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
                      {politician.party === 'Republican' ? '🐘 R' : politician.party === 'Democrat' ? '🫏 D' : politician.party.charAt(0)}
                    </span>
                    {politician.juiceBoxTier !== 'none' && (
                      <span style={{ 
                        fontSize: '0.75rem', 
                        padding: '0.25rem 0.5rem', 
                        background: '#78350f',
                        color: '#f59e0b',
                        borderRadius: '3px',
                      }}>
                        {politician.juiceBoxTier === 'owned' ? '👑' : politician.juiceBoxTier === 'bought' ? '💰' : '💸'} ${(politician.aipacFunding / 1000).toFixed(0)}K
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
              Phase 2 Coming Soon
            </div>
            <div style={{ fontSize: '0.875rem' }}>
              {currentNode.name} data will be added after federal and state politicians are fully indexed.
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

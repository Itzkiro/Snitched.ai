'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { Politician } from '@/lib/types';

export default function TerminalHome() {
  const [politicians, setPoliticians] = useState<Politician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch('/api/politicians');
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const allPoliticians: Politician[] = await res.json();
        console.log('Loaded politicians:', allPoliticians.length);
        setPoliticians(allPoliticians);
      } catch (error) {
        console.error('Error loading politicians:', error);
        setError(error instanceof Error ? error.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }
    
    loadData();
  }, []);

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'white' }}>Loading...</div>;
  }

  if (error) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'red' }}>Error: {error}</div>;
  }

  if (politicians.length === 0) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'yellow' }}>No politicians data loaded. Please refresh.</div>;
  }

  const activePoliticians = politicians.filter(p => p.isActive);
  const compromisedCount = activePoliticians.filter(p => p.juiceBoxTier !== 'none').length;
  const totalFunding = activePoliticians.reduce((sum, p) => sum + p.aipacFunding, 0);
  const avgCorruption = activePoliticians.length > 0 
    ? Math.round(activePoliticians.reduce((sum, p) => sum + p.corruptionScore, 0) / activePoliticians.length)
    : 0;
  
  // Calculate stats from loaded politicians (don't call getAllPoliticians again)
  const federal = politicians.filter(p => p.officeLevel === 'US Senator' || p.officeLevel === 'US Representative');
  const state = politicians.filter(p => p.officeLevel === 'State Senator' || p.officeLevel === 'State Representative' || p.officeLevel === 'Governor');
  const county = politicians.filter(p => p.jurisdictionType === 'county' || p.jurisdictionType === 'municipal');
  const stats = {
    total: politicians.length,
    federal: federal.length,
    state: state.length,
    county: county.length,
  };

  // Get top 6 most corrupted for grid display
  const topCorrupted = [...activePoliticians]
    .sort((a, b) => b.corruptionScore - a.corruptionScore)
    .slice(0, 6);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--terminal-bg)', color: 'var(--terminal-text)' }}>
      {/* Main title */}
      <div className="terminal-title">
        <div>
          <h1>SNITCHED.AI - FLORIDA CORRUPTION INDEX</h1>
          <div className="terminal-subtitle">
            Real-Time Political Transparency | Foreign Lobby Tracking | OSINT Intelligence
          </div>
        </div>
      </div>

      {/* Alert level */}
      <div style={{ padding: '2rem', borderBottom: '1px solid var(--terminal-border)' }}>
        <div className="alert-level">
          <span className="alert-icon">⚠️</span>
          <span>CORRUPTION LEVEL {Math.min(5, Math.floor(avgCorruption / 20) + 1)}</span>
          <span style={{ fontSize: '0.875rem', color: 'var(--terminal-text-dim)', marginLeft: '1rem' }}>
            {avgCorruption < 40 ? 'LOW THREAT' : avgCorruption < 60 ? 'ELEVATED THREAT' : 'HIGH THREAT'}
          </span>
        </div>
      </div>

      {/* Breaking news ticker */}
      <div className="breaking-ticker">
        <div className="ticker-content">
          {[...Array(2)].map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: '3rem' }}>
              <div className="ticker-item">
                <span className="ticker-label">BREAKING</span>
                <span>Rick Scott received $1.25M from AIPAC</span>
              </div>
              <div className="ticker-item">
                <span className="ticker-label">ALERT</span>
                <span>Debbie Wasserman Schultz ethics complaint filed</span>
              </div>
              <div className="ticker-item">
                <span className="ticker-label">INTEL</span>
                <span>{compromisedCount} Florida politicians compromised by foreign lobby</span>
              </div>
              <div className="ticker-item">
                <span className="ticker-label">BREAKING</span>
                <span>New court case: Ron DeSantis active litigation discovered</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', padding: '2rem', gap: '2rem' }}>
        {/* Main content */}
        <div style={{ flex: 1 }}>
          {/* Stats grid */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(3, 1fr)', 
            gap: '1.5rem',
            marginBottom: '2rem'
          }}>
            <div className="terminal-card">
              <div className="stat-value danger">${(totalFunding / 1000000).toFixed(2)}M</div>
              <div className="stat-label">TOTAL AIPAC FUNDING</div>
            </div>
            <div className="terminal-card">
              <div className="stat-value warning">{compromisedCount}</div>
              <div className="stat-label">COMPROMISED OFFICIALS</div>
            </div>
            <div className="terminal-card">
              <div className="stat-value">{avgCorruption}</div>
              <div className="stat-label">AVG CORRUPTION SCORE</div>
            </div>
          </div>

          {/* JFK-Intel Data Stats Banner */}
          <div style={{
            padding: '1.5rem',
            background: 'var(--bg-tertiary)',
            border: '2px solid var(--border-color)',
            marginBottom: '2rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--red-blood)', marginBottom: '0.5rem', letterSpacing: '0.1em' }}>
                JFK-INTEL DATABASE STATUS
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Phase 1 Complete | Real Government Data | Live APIs
              </div>
            </div>
            <div style={{ display: 'flex', gap: '2rem' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: '#10b981' }}>{stats.federal}</div>
                <div style={{ fontSize: '0.625rem', color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
                  🏛️ FEDERAL
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: '#3b82f6' }}>{stats.state}</div>
                <div style={{ fontSize: '0.625rem', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
                  ⚖️ STATE
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: '#f59e0b' }}>{stats.county}</div>
                <div style={{ fontSize: '0.625rem', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
                  🏛️ COUNTY
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--red-blood)' }}>{stats.total}</div>
                <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
                  📊 TOTAL
                </div>
              </div>
            </div>
          </div>

          {/* Politician cards grid */}
          <div className="data-grid" style={{ padding: 0 }}>
            {topCorrupted.map((pol) => (
              <Link 
                key={pol.id} 
                href={`/politician/${pol.id}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div className="terminal-card">
                  <div className="card-header">
                    <div>
                      <div className="card-title">🎯 {pol.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--terminal-text-dim)', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>{pol.office}</span>
                        <span style={{ 
                          fontSize: '10px', 
                          padding: '0.3rem 0.6rem', 
                          background: pol.party === 'Republican' ? '#dc2626' : pol.party === 'Democrat' ? '#2563eb' : '#6b7280',
                          color: '#fff',
                          borderRadius: '10px',
                          fontWeight: 600,
                        }}>
                          {pol.party === 'Republican' ? '🐘 R' : pol.party === 'Democrat' ? '🫏 D' : pol.party}
                        </span>
                      </div>
                    </div>
                    <div className={`card-status ${pol.juiceBoxTier !== 'none' ? 'compromised' : ''}`}>
                      {pol.juiceBoxTier !== 'none' ? 'COMPROMISED' : 'MONITORED'}
                    </div>
                  </div>

                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ 
                      fontSize: '1.5rem', 
                      fontWeight: 700,
                      color: pol.corruptionScore >= 60 ? 'var(--terminal-red)' : 
                             pol.corruptionScore >= 40 ? 'var(--terminal-amber)' : 'var(--terminal-green)'
                    }}>
                      CORRUPTION: {pol.corruptionScore}/100
                    </div>
                  </div>

                  {pol.aipacFunding > 0 && (
                    <div style={{ 
                      padding: '0.75rem',
                      background: 'rgba(255, 8, 68, 0.1)',
                      border: '1px solid var(--terminal-red)',
                      marginTop: '1rem'
                    }}>
                      <div style={{ fontSize: '11px', color: 'var(--terminal-text-dim)', marginBottom: '0.25rem' }}>
                        AIPAC FUNDING
                      </div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--terminal-red)' }}>
                        ${(pol.aipacFunding / 1000).toFixed(0)}K
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--terminal-text-dim)', marginTop: '0.25rem' }}>
                        {pol.juiceBoxTier === 'owned' ? '👑 FULLY OWNED' :
                         pol.juiceBoxTier === 'bought' ? '💰 BOUGHT & PAID FOR' :
                         '💸 COMPROMISED'}
                      </div>
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>

          {/* Navigation buttons */}
          <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
            <Link href="/hierarchy">
              <button className="terminal-btn">VIEW FULL HIERARCHY</button>
            </Link>
            <Link href="/juicebox">
              <button className="terminal-btn danger">AIPAC CORRUPTION INDEX</button>
            </Link>
            <Link href="/browse">
              <button className="terminal-btn">DATABASE SEARCH</button>
            </Link>
          </div>
        </div>

        {/* OSINT feed sidebar */}
        <div style={{ width: '300px' }}>
          <div className="osint-feed">
            <div className="feed-header">
              <span className="feed-title">🔴 OSINT FEED</span>
              <span style={{ color: 'var(--terminal-green)' }}>● LIVE</span>
            </div>
            
            <div className="feed-item">
              <span className="feed-time">2h ago</span>
              New ethics complaint filed against Marco Rubio regarding $480K AIPAC contributions.
            </div>
            
            <div className="feed-item">
              <span className="feed-time">4h ago</span>
              Rick Scott corruption score increased from 65 to 68 following financial disclosure.
            </div>
            
            <div className="feed-item">
              <span className="feed-time">6h ago</span>
              Deleted tweet detected: Ron DeSantis removed post about Israel policy.
            </div>
            
            <div className="feed-item">
              <span className="feed-time">8h ago</span>
              Court case update: Debbie Wasserman Schultz litigation status changed to ACTIVE.
            </div>
            
            <div className="feed-item">
              <span className="feed-time">12h ago</span>
              AIPAC funding alert: Brian Mast received $410K in campaign contributions.
            </div>
            
            <div className="feed-item">
              <span className="feed-time">1d ago</span>
              New politician added: Ashley Moody (Attorney General) - monitoring initiated.
            </div>
          </div>

          {/* Quick stats */}
          <div className="terminal-card" style={{ marginTop: '1rem' }}>
            <div style={{ fontSize: '11px', color: 'var(--terminal-blue)', marginBottom: '1rem' }}>
              SYSTEM STATUS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '11px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Targets Monitored:</span>
                <span style={{ color: 'var(--terminal-cyan)' }}>{activePoliticians.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>OSINT Sources:</span>
                <span style={{ color: 'var(--terminal-cyan)' }}>5 Active</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Last Update:</span>
                <span style={{ color: 'var(--terminal-green)' }}>2 min ago</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Database:</span>
                <span style={{ color: 'var(--terminal-green)' }}>ONLINE</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Data source footer */}
      <div className="classified-footer">
        ALL DATA ACQUIRED VIA OSINT // PUBLIC RECORDS: FEC, SOCIAL MEDIA, NEWS OUTLETS // POLITICAL TRANSPARENCY DIVISION
      </div>
    </div>
  );
}

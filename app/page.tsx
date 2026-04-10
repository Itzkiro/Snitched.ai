'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { Politician } from '@/lib/types';

interface FeedItem {
  id: string;
  text: string;
  time: string;
  type: 'funding' | 'score' | 'social' | 'system';
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function generateFeedItems(politicians: Politician[]): FeedItem[] {
  const items: FeedItem[] = [];
  const now = Date.now();

  // Real AIPAC funding alerts from top-funded politicians
  const aipacFunded = [...politicians]
    .filter(p => p.aipacFunding > 0)
    .sort((a, b) => b.aipacFunding - a.aipacFunding)
    .slice(0, 5);

  aipacFunded.forEach((p, i) => {
    items.push({
      id: `funding-${p.id}`,
      text: `AIPAC funding tracked: ${p.name} — $${(p.aipacFunding / 1000).toFixed(0)}K in pro-Israel lobby contributions on record.`,
      time: timeAgo(new Date(now - (i + 1) * 3600000 * 2)),
      type: 'funding',
    });
  });

  // Real corruption score alerts from highest-scored politicians
  const highCorruption = [...politicians]
    .filter(p => p.corruptionScore >= 50)
    .sort((a, b) => b.corruptionScore - a.corruptionScore)
    .slice(0, 3);

  highCorruption.forEach((p, i) => {
    const grade = p.corruptionScore >= 80 ? 'CRITICAL' : p.corruptionScore >= 60 ? 'HIGH' : 'ELEVATED';
    items.push({
      id: `score-${p.id}`,
      text: `Corruption score: ${p.name} rated ${p.corruptionScore}/100 (${grade}) based on funding analysis.`,
      time: timeAgo(new Date(now - (i + 2) * 3600000 * 3)),
      type: 'score',
    });
  });

  // System updates from real data
  const totalTracked = politicians.length;
  const counties = new Set(politicians.map(p => p.jurisdiction)).size;
  items.push({
    id: 'system-count',
    text: `Database update: ${totalTracked} politicians across ${counties} jurisdictions now under monitoring.`,
    time: timeAgo(new Date(now - 12 * 3600000)),
    type: 'system',
  });

  // Sort by recency and return top 6
  return items.slice(0, 6);
}

function generateTickerItems(politicians: Politician[]): { label: string; text: string }[] {
  const items: { label: string; text: string }[] = [];

  const topAipac = [...politicians].filter(p => p.aipacFunding > 0).sort((a, b) => b.aipacFunding - a.aipacFunding);
  if (topAipac[0]) {
    items.push({ label: 'INTEL', text: `${topAipac[0].name} tops AIPAC funding at $${(topAipac[0].aipacFunding / 1000).toFixed(0)}K` });
  }

  const topCorrupt = [...politicians].filter(p => p.corruptionScore > 0).sort((a, b) => b.corruptionScore - a.corruptionScore);
  if (topCorrupt[0]) {
    items.push({ label: 'ALERT', text: `${topCorrupt[0].name} — highest corruption score: ${topCorrupt[0].corruptionScore}/100` });
  }

  const compromised = politicians.filter(p => p.juiceBoxTier !== 'none').length;
  items.push({ label: 'TRACKING', text: `${compromised} Florida politicians flagged for foreign lobby ties` });

  const totalFunding = politicians.reduce((s, p) => s + (p.israelLobbyTotal || p.aipacFunding || 0), 0);
  items.push({ label: 'DATA', text: `$${(totalFunding / 1000000).toFixed(2)}M+ tracked Israel lobby funding (federal only — state data pending)` });

  return items;
}

export default function TerminalHome() {
  const [politicians, setPoliticians] = useState<Politician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [socialPosts, setSocialPosts] = useState<{ content: string; politician_name: string; posted_at: string }[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        const [polRes, socialRes] = await Promise.all([
          fetch('/api/politicians'),
          fetch('/api/social-posts?limit=5&order=desc').catch(() => null),
        ]);
        if (!polRes.ok) throw new Error(`API error: ${polRes.status}`);
        const allPoliticians: Politician[] = await polRes.json();
        setPoliticians(allPoliticians);
        setFeedItems(generateFeedItems(allPoliticians));

        if (socialRes?.ok) {
          const socialData = await socialRes.json();
          if (socialData.posts?.length > 0) {
            setSocialPosts(socialData.posts);
          }
        }
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
    return (
      <div style={{ minHeight: '100vh', background: 'var(--terminal-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem', animation: 'pulse 2s infinite' }}>SNITCHED.AI</div>
          <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Loading intelligence database...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--terminal-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="terminal-card" style={{ textAlign: 'center', maxWidth: '500px', padding: '2rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem', color: 'var(--terminal-red)' }}>CONNECTION ERROR</div>
          <div style={{ color: 'var(--terminal-text-dim)', marginBottom: '1rem' }}>{error}</div>
          <button className="terminal-btn" onClick={() => window.location.reload()}>RETRY</button>
        </div>
      </div>
    );
  }

  if (politicians.length === 0) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--terminal-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="terminal-card" style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '1rem', color: 'var(--terminal-amber)' }}>NO DATA</div>
          <div style={{ color: 'var(--terminal-text-dim)' }}>Database returned empty. Please refresh.</div>
        </div>
      </div>
    );
  }

  const activePoliticians = politicians.filter(p => p.isActive);
  const compromisedCount = activePoliticians.filter(p => p.juiceBoxTier !== 'none').length;
  const totalFunding = activePoliticians.reduce((sum, p) => sum + (p.israelLobbyTotal || p.aipacFunding || 0), 0);
  const avgCorruption = activePoliticians.length > 0 
    ? Math.round(activePoliticians.reduce((sum, p) => sum + p.corruptionScore, 0) / activePoliticians.length)
    : 0;
  
  // Calculate stats from loaded politicians (don't call getAllPoliticians again)
  const federal = politicians.filter(p => p.officeLevel === 'US Senator' || p.officeLevel === 'US Representative');
  const state = politicians.filter(p => p.officeLevel === 'State Senator' || p.officeLevel === 'State Representative' || p.officeLevel === 'Governor');
  const county = politicians.filter(p => p.jurisdictionType === 'county' || p.jurisdictionType === 'municipal');
  const withFunding = politicians.filter(p => (p.totalFundsRaised || 0) > 0).length;
  const withVotes = politicians.filter(p => p.votes && p.votes.length > 0).length;
  const stats = {
    total: politicians.length,
    federal: federal.length,
    state: state.length,
    county: county.length,
    funded: withFunding,
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

      {/* Breaking news ticker — data-driven from loaded politicians */}
      <div className="breaking-ticker">
        <div className="ticker-content">
          {[...Array(2)].map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: '3rem' }}>
              {generateTickerItems(politicians).map((item, j) => (
                <div key={`${i}-${j}`} className="ticker-item">
                  <span className="ticker-label">{item.label}</span>
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', padding: '2rem', gap: '2rem', flexWrap: 'wrap' }}>
        {/* Main content */}
        <div style={{ flex: '1 1 400px', minWidth: 0 }}>
          {/* Stats grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '2rem'
          }}>
            <div className="terminal-card">
              <div className="stat-value" style={{ color: 'var(--terminal-cyan)' }}>
                ${(activePoliticians.reduce((s, p) => s + (p.totalFundsRaised || 0), 0) / 1000000).toFixed(0)}M+
              </div>
              <div className="stat-label">TOTAL CAMPAIGN FUNDS TRACKED</div>
            </div>
            <div className="terminal-card">
              <div className="stat-value danger">${(totalFunding / 1000000).toFixed(1)}M+</div>
              <div className="stat-label">ISRAEL LOBBY FUNDING</div>
            </div>
            <div className="terminal-card">
              <div className="stat-value warning">{stats.funded}</div>
              <div className="stat-label">POLITICIANS WITH REAL DATA</div>
            </div>
            <div className="terminal-card">
              <div className="stat-value">{avgCorruption}</div>
              <div className="stat-label">AVG CORRUPTION SCORE</div>
            </div>
          </div>

          {/* Database Status Banner */}
          <div style={{
            padding: '1.5rem',
            background: 'var(--terminal-surface)',
            border: '2px solid var(--terminal-border)',
            marginBottom: '2rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--terminal-amber)', marginBottom: '0.5rem', letterSpacing: '0.1em' }}>
                DATABASE STATUS
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)' }}>
                FEC | FL Division of Elections | LDA | LegiScan
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
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

          {/* Top Israel Lobby Recipients */}
          {(() => {
            const topIsrael = [...activePoliticians]
              .filter(p => (p.israelLobbyTotal || 0) > 0)
              .sort((a, b) => (b.israelLobbyTotal || 0) - (a.israelLobbyTotal || 0))
              .slice(0, 5);
            if (topIsrael.length === 0) return null;
            return (
              <div className="terminal-card" style={{ marginBottom: '2rem' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--terminal-red)', marginBottom: '1rem', letterSpacing: '0.1em' }}>
                  🇮🇱 TOP ISRAEL LOBBY RECIPIENTS
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {topIsrael.map((pol, i) => (
                    <Link key={pol.id} href={`/politician/${pol.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '0.75rem', background: i === 0 ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                        border: i === 0 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid var(--terminal-border)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', fontWeight: 700, width: '20px' }}>#{i + 1}</span>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{pol.name}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dim)' }}>{pol.office}</div>
                          </div>
                        </div>
                        <div style={{ fontWeight: 700, fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.25rem', color: 'var(--terminal-red)' }}>
                          ${(pol.israelLobbyTotal || 0) >= 1000000
                            ? `${((pol.israelLobbyTotal || 0) / 1000000).toFixed(1)}M`
                            : `${((pol.israelLobbyTotal || 0) / 1000).toFixed(0)}K`}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
                <Link href="/juicebox" style={{ display: 'block', textAlign: 'center', marginTop: '1rem', fontSize: '0.75rem', color: 'var(--terminal-red)', textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  VIEW FULL ISRAEL LOBBY TRACKER →
                </Link>
              </div>
            );
          })()}

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
          <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', flexWrap: 'wrap' }}>
            <Link href="/hierarchy">
              <button className="terminal-btn">VIEW FULL HIERARCHY</button>
            </Link>
            <Link href="/juicebox">
              <button className="terminal-btn danger">AIPAC CORRUPTION INDEX</button>
            </Link>
            <Link href="/browse">
              <button className="terminal-btn">DATABASE SEARCH</button>
            </Link>
            <Link href="/compare">
              <button className="terminal-btn">COMPARE POLITICIANS</button>
            </Link>
          </div>
        </div>

        {/* OSINT feed sidebar — real data from politicians + social posts */}
        <div style={{ flex: '0 0 300px', maxWidth: '100%' }}>
          <div className="osint-feed">
            <div className="feed-header">
              <span className="feed-title">🔴 OSINT FEED</span>
              <span style={{ color: 'var(--terminal-green)' }}>● LIVE</span>
            </div>

            {/* Social media posts from daemon (if available) */}
            {socialPosts.length > 0 && socialPosts.slice(0, 2).map((post, i) => (
              <div key={`social-${i}`} className="feed-item">
                <span className="feed-time">{timeAgo(new Date(post.posted_at))}</span>
                📱 {post.politician_name}: &quot;{post.content?.slice(0, 100)}{post.content?.length > 100 ? '...' : ''}&quot;
              </div>
            ))}

            {/* Data-driven feed items */}
            {feedItems.map((item) => (
              <div key={item.id} className="feed-item">
                <span className="feed-time">{item.time}</span>
                {item.type === 'funding' ? '💰' : item.type === 'score' ? '⚠️' : item.type === 'social' ? '📱' : '🔧'}{' '}
                {item.text}
              </div>
            ))}
          </div>

          {/* Quick stats — real values */}
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
                <span>Data Sources:</span>
                <span style={{ color: 'var(--terminal-cyan)' }}>5 Active</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>With Funding Data:</span>
                <span style={{ color: 'var(--terminal-green)' }}>{stats.funded}</span>
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
        PUBLIC RECORDS: FEC // FL DIVISION OF ELECTIONS // LDA SENATE // LEGISCAN // TRACK AIPAC //
        <Link href="/about" style={{ color: '#fff', marginLeft: '0.5rem', textDecoration: 'underline' }}>METHODOLOGY</Link>
      </div>
    </div>
  );
}

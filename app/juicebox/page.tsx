'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getAllPoliticians } from '@/lib/real-data';
import type { Politician } from '@/lib/types';

export default function JuiceBoxPage() {
  const [politicians, setPoliticians] = useState<Politician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const allPoliticians = getAllPoliticians();
      setPoliticians(allPoliticians);
    } catch (error) {
      console.error('Error loading:', error);
      setError(error instanceof Error ? error.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'white' }}>Loading...</div>;
  }

  if (error) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'red' }}>Error: {error}</div>;
  }

  const juiceBoxPoliticians = politicians
    .filter(p => p.isActive && p.israelLobbyTotal && p.israelLobbyTotal > 0)
    .sort((a, b) => (b.israelLobbyTotal || 0) - (a.israelLobbyTotal || 0));

  const totalIsraelLobby = juiceBoxPoliticians.reduce((sum, p) => sum + (p.israelLobbyTotal || 0), 0);

  const tierCounts = {
    owned: juiceBoxPoliticians.filter(p => p.juiceBoxTier === 'owned').length,
    bought: juiceBoxPoliticians.filter(p => p.juiceBoxTier === 'bought').length,
    compromised: juiceBoxPoliticians.filter(p => p.juiceBoxTier === 'compromised').length,
  };

  const getTierLabel = (tier: string) => {
    if (tier === 'owned') return 'FULLY OWNED';
    if (tier === 'bought') return 'BOUGHT & PAID FOR';
    if (tier === 'compromised') return 'COMPROMISED';
    return 'NONE';
  };

  const getTierColor = (tier: string) => {
    if (tier === 'owned') return '#dc2626';
    if (tier === 'bought') return '#ef4444';
    if (tier === 'compromised') return '#f59e0b';
    return '#6b7280';
  };

  const getRankMedal = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return '';
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--terminal-bg)', color: 'var(--terminal-text)' }}>
      {/* Terminal Title */}
      <div className="terminal-title">
        <div>
          <h1>💰 JUICE BOX LEADERBOARD</h1>
          <div className="terminal-subtitle">
            Israel Lobby Tracking | Ranked by Total Funding
          </div>
        </div>
      </div>

      {/* Alert */}
      <div style={{ padding: '2rem', borderBottom: '1px solid var(--terminal-border)' }}>
        <div className="alert-level">
          <span className="alert-icon">🇮🇱</span>
          <span>COMPROMISED OFFICIALS: {juiceBoxPoliticians.length}</span>
          <span style={{ fontSize: '0.875rem', color: 'var(--terminal-text-dim)', marginLeft: '1rem' }}>
            TOTAL ISRAEL LOBBY: ${(totalIsraelLobby / 1000000).toFixed(2)}M
          </span>
        </div>
      </div>

      <div style={{ padding: '2rem' }}>
        <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
          {/* Stats */}
          <div 
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1.5rem',
              marginBottom: '2rem',
            }}
          >
            <div className="terminal-card">
              <div style={{ fontSize: '3rem', fontWeight: 700, color: '#ef4444', fontFamily: 'Bebas Neue, sans-serif', marginBottom: '0.5rem' }}>
                ${(totalIsraelLobby / 1000000).toFixed(2)}M
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                TOTAL ISRAEL LOBBY
              </div>
            </div>

            <div className="terminal-card">
              <div style={{ fontSize: '3rem', fontWeight: 700, color: '#dc2626', fontFamily: 'Bebas Neue, sans-serif', marginBottom: '0.5rem' }}>
                {tierCounts.owned}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                👑 FULLY OWNED
              </div>
            </div>

            <div className="terminal-card">
              <div style={{ fontSize: '3rem', fontWeight: 700, color: '#ef4444', fontFamily: 'Bebas Neue, sans-serif', marginBottom: '0.5rem' }}>
                {tierCounts.bought}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                💰 BOUGHT & PAID FOR
              </div>
            </div>

            <div className="terminal-card">
              <div style={{ fontSize: '3rem', fontWeight: 700, color: '#f59e0b', fontFamily: 'Bebas Neue, sans-serif', marginBottom: '0.5rem' }}>
                {tierCounts.compromised}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                💸 COMPROMISED
              </div>
            </div>
          </div>

          {/* Leaderboard Table */}
          {juiceBoxPoliticians.length > 0 ? (
            <div className="terminal-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ 
                padding: '1.5rem 2rem',
                background: 'rgba(239, 68, 68, 0.1)',
                borderBottom: '2px solid #ef4444',
              }}>
                <h2 style={{ 
                  fontSize: '1.5rem', 
                  fontWeight: 700, 
                  color: '#ef4444', 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.05em',
                  fontFamily: 'JetBrains Mono, monospace',
                }}>
                  🇮🇱 RANKED BY ISRAEL LOBBY FUNDING
                </h2>
              </div>

              {/* Table Header */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '80px 1fr 150px 150px 150px 120px',
                padding: '1rem 2rem',
                background: 'rgba(255, 255, 255, 0.02)',
                borderBottom: '1px solid var(--terminal-border)',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: 'var(--terminal-amber)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                fontFamily: 'JetBrains Mono, monospace',
              }}>
                <div>RANK</div>
                <div>POLITICIAN</div>
                <div style={{ textAlign: 'right' }}>ISRAEL LOBBY</div>
                <div style={{ textAlign: 'right' }}>TOTAL FUNDS</div>
                <div style={{ textAlign: 'center' }}>STATUS</div>
                <div style={{ textAlign: 'center' }}>PROFILE</div>
              </div>

              {/* Table Rows */}
              {juiceBoxPoliticians.map((politician, index) => {
                const rank = index + 1;
                const isTopThree = rank <= 3;
                const lobbyPercent = politician.totalFundsRaised && politician.israelLobbyTotal
                  ? ((politician.israelLobbyTotal / politician.totalFundsRaised) * 100).toFixed(1)
                  : '0';

                return (
                  <div 
                    key={politician.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '80px 1fr 150px 150px 150px 120px',
                      padding: '1.5rem 2rem',
                      borderBottom: '1px solid var(--terminal-border)',
                      background: isTopThree ? 'rgba(239, 68, 68, 0.05)' : 'transparent',
                      transition: 'background 0.2s',
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  >
                    {/* Rank */}
                    <div style={{ 
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}>
                      <span style={{ 
                        fontSize: isTopThree ? '1.5rem' : '1.25rem',
                        fontWeight: 700,
                        color: isTopThree ? '#ef4444' : 'var(--terminal-text-dim)',
                        fontFamily: 'Bebas Neue, sans-serif',
                      }}>
                        {getRankMedal(rank)} {rank}
                      </span>
                    </div>

                    {/* Politician Info */}
                    <div>
                      <div style={{ 
                        fontSize: '1rem', 
                        fontWeight: 700, 
                        marginBottom: '0.25rem',
                        color: 'var(--terminal-text)',
                      }}>
                        {politician.name}
                      </div>
                      <div style={{ 
                        fontSize: '0.75rem', 
                        color: 'var(--terminal-text-dim)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        flexWrap: 'wrap',
                      }}>
                        <span>{politician.office}</span>
                        <span style={{ 
                          fontSize: '10px', 
                          padding: '0.3rem 0.6rem', 
                          background: politician.party === 'Republican' ? '#dc2626' : politician.party === 'Democrat' ? '#2563eb' : '#6b7280',
                          color: '#fff',
                          borderRadius: '10px',
                          fontWeight: 600,
                        }}>
                          {politician.party === 'Republican' ? '🐘 R' : politician.party === 'Democrat' ? '🫏 D' : politician.party.charAt(0)}
                        </span>
                        {politician.district && <span>• {politician.district}</span>}
                      </div>
                    </div>

                    {/* Israel Lobby Funding */}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ 
                        fontSize: '1.25rem', 
                        fontWeight: 700, 
                        color: '#ef4444',
                        fontFamily: 'Bebas Neue, sans-serif',
                        marginBottom: '0.25rem',
                      }}>
                        ${politician.israelLobbyTotal && politician.israelLobbyTotal >= 1000000
                          ? `${(politician.israelLobbyTotal / 1000000).toFixed(2)}M`
                          : `${((politician.israelLobbyTotal || 0) / 1000).toFixed(0)}K`}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#ef4444' }}>
                        {lobbyPercent}% of total
                      </div>
                    </div>

                    {/* Total Funds */}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ 
                        fontSize: '1rem', 
                        fontWeight: 700, 
                        color: 'var(--terminal-text-dim)',
                        fontFamily: 'Bebas Neue, sans-serif',
                      }}>
                        ${politician.totalFundsRaised && politician.totalFundsRaised >= 1000000
                          ? `${(politician.totalFundsRaised / 1000000).toFixed(1)}M`
                          : `${((politician.totalFundsRaised || 0) / 1000).toFixed(0)}K`}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)' }}>
                        total raised
                      </div>
                    </div>

                    {/* Status Tag */}
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <span style={{
                        padding: '0.5rem 1rem',
                        background: `${getTierColor(politician.juiceBoxTier)}20`,
                        border: `1px solid ${getTierColor(politician.juiceBoxTier)}`,
                        color: getTierColor(politician.juiceBoxTier),
                        fontSize: '0.625rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        whiteSpace: 'nowrap',
                      }}>
                        {getTierLabel(politician.juiceBoxTier)}
                      </span>
                    </div>

                    {/* View Profile */}
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <Link
                        href={`/politician/${politician.id}`}
                        style={{
                          padding: '0.5rem 1rem',
                          background: 'var(--terminal-amber)',
                          color: '#000',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          textDecoration: 'none',
                          transition: 'opacity 0.2s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                      >
                        VIEW →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="terminal-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>💰</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                NO JUICE BOX POLITICIANS FOUND
              </div>
              <div style={{ color: 'var(--terminal-text-dim)' }}>
                All tracked politicians are currently clean
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="classified-footer">
        ALL DATA ACQUIRED VIA OSINT // PUBLIC RECORDS: FEC, SOCIAL MEDIA, NEWS OUTLETS // JUICE BOX LEADERBOARD DIVISION
      </div>
    </div>
  );
}

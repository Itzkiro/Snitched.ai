'use client';

import Link from 'next/link';
import { getAllPoliticians } from '@/lib/real-data';

export const dynamic = 'force-dynamic';

export default function JuiceBoxPage() {
  const juiceBoxPoliticians = getAllPoliticians()
    .filter(p => p.isActive && p.israelLobbyTotal && p.israelLobbyTotal > 0)
    .sort((a, b) => (b.israelLobbyTotal || 0) - (a.israelLobbyTotal || 0));

  const totalIsraelLobby = juiceBoxPoliticians.reduce((sum, p) => sum + (p.israelLobbyTotal || 0), 0);

  const tierCounts = {
    owned: juiceBoxPoliticians.filter(p => p.juiceBoxTier === 'owned').length,
    bought: juiceBoxPoliticians.filter(p => p.juiceBoxTier === 'bought').length,
    compromised: juiceBoxPoliticians.filter(p => p.juiceBoxTier === 'compromised').length,
  };

  // Top 3 for podium
  const top3 = juiceBoxPoliticians.slice(0, 3);
  const remaining = juiceBoxPoliticians.slice(3);

  const getTierColor = (tier: string) => {
    if (tier === 'owned') return '#dc2626';
    if (tier === 'bought') return '#ef4444';
    if (tier === 'compromised') return '#f59e0b';
    return '#6b7280';
  };

  const formatAmount = (amount: number) => {
    // Exact numbers, no decimals
    if (amount >= 1000000) return `$${Math.round(amount / 1000000)}M`;
    return `$${Math.round(amount / 1000)}K`;
  };

  const getPercentage = (politician: any) => {
    if (!politician.totalFundsRaised || !politician.israelLobbyTotal) return '0';
    return ((politician.israelLobbyTotal / politician.totalFundsRaised) * 100).toFixed(1);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#fff' }}>
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
      <div style={{ padding: '2rem', borderBottom: '1px solid #333' }}>
        <div className="alert-level">
          <span className="alert-icon">🇮🇱</span>
          <span>COMPROMISED OFFICIALS: {juiceBoxPoliticians.length}</span>
          <span style={{ fontSize: '0.875rem', color: '#888', marginLeft: '1rem' }}>
            TOTAL ISRAEL LOBBY: ${(totalIsraelLobby / 1000000).toFixed(2)}M
          </span>
        </div>
      </div>

      <div style={{ padding: '2rem 1rem' }}>
        <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
          {/* Podium - Top 3 */}
          {top3.length >= 3 && (
            <div style={{ 
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '2rem',
              marginBottom: '4rem',
              alignItems: 'end',
            }}>
              {/* #2 - Left (Silver) */}
              <Link href={`/politician/${top3[1].id}`} style={{ textDecoration: 'none' }}>
                <div style={{
                  background: 'linear-gradient(135deg, rgba(192, 192, 192, 0.1), rgba(128, 128, 128, 0.05))',
                  border: '2px solid #c0c0c0',
                  borderRadius: '12px',
                  padding: '2rem 1.5rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, border-color 0.2s',
                  height: '320px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🥈</div>
                  
                  {top3[1].photoUrl ? (
                    <img 
                      src={top3[1].photoUrl} 
                      alt={top3[1].name}
                      style={{
                        width: '120px',
                        height: '120px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: '3px solid #c0c0c0',
                        margin: '0 auto 1rem',
                      }}
                    />
                  ) : (
                    <div style={{
                      width: '120px',
                      height: '120px',
                      borderRadius: '50%',
                      background: '#333',
                      border: '3px solid #c0c0c0',
                      margin: '0 auto 1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '3rem',
                      color: '#c0c0c0',
                      fontFamily: 'Bebas Neue, sans-serif',
                    }}>
                      {top3[1].name.charAt(0)}
                    </div>
                  )}

                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#c0c0c0', marginBottom: '0.5rem', fontFamily: 'JetBrains Mono, monospace' }}>
                    {top3[1].name.toUpperCase()}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '1rem' }}>
                    {top3[1].office}
                  </div>

                  <div style={{ fontSize: '2rem', fontWeight: 700, color: '#ef4444', fontFamily: 'Bebas Neue, sans-serif', marginBottom: '0.25rem' }}>
                    {formatAmount(top3[1].israelLobbyTotal || 0)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#ef4444' }}>
                    {getPercentage(top3[1])}% Israel Lobby
                  </div>
                </div>
              </Link>

              {/* #1 - Center (Gold) - TALLEST */}
              <Link href={`/politician/${top3[0].id}`} style={{ textDecoration: 'none' }}>
                <div style={{
                  background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.15), rgba(218, 165, 32, 0.1))',
                  border: '3px solid #ffd700',
                  borderRadius: '12px',
                  padding: '2.5rem 1.5rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, border-color 0.2s',
                  height: '400px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: '0 0 30px rgba(255, 215, 0, 0.3)',
                }}>
                  <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🥇</div>
                  
                  {top3[0].photoUrl ? (
                    <img 
                      src={top3[0].photoUrl} 
                      alt={top3[0].name}
                      style={{
                        width: '140px',
                        height: '140px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: '4px solid #ffd700',
                        margin: '0 auto 1rem',
                      }}
                    />
                  ) : (
                    <div style={{
                      width: '140px',
                      height: '140px',
                      borderRadius: '50%',
                      background: '#333',
                      border: '4px solid #ffd700',
                      margin: '0 auto 1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '4rem',
                      color: '#ffd700',
                      fontFamily: 'Bebas Neue, sans-serif',
                    }}>
                      {top3[0].name.charAt(0)}
                    </div>
                  )}

                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ffd700', marginBottom: '0.5rem', fontFamily: 'JetBrains Mono, monospace' }}>
                    {top3[0].name.toUpperCase()}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#888', marginBottom: '1.5rem' }}>
                    {top3[0].office}
                  </div>

                  <div style={{ fontSize: '2.5rem', fontWeight: 700, color: '#ef4444', fontFamily: 'Bebas Neue, sans-serif', marginBottom: '0.25rem' }}>
                    {formatAmount(top3[0].israelLobbyTotal || 0)}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#ef4444', fontWeight: 700 }}>
                    {getPercentage(top3[0])}% Israel Lobby
                  </div>
                </div>
              </Link>

              {/* #3 - Right (Bronze) */}
              <Link href={`/politician/${top3[2].id}`} style={{ textDecoration: 'none' }}>
                <div style={{
                  background: 'linear-gradient(135deg, rgba(205, 127, 50, 0.1), rgba(184, 115, 51, 0.05))',
                  border: '2px solid #cd7f32',
                  borderRadius: '12px',
                  padding: '2rem 1.5rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, border-color 0.2s',
                  height: '280px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🥉</div>
                  
                  {top3[2].photoUrl ? (
                    <img 
                      src={top3[2].photoUrl} 
                      alt={top3[2].name}
                      style={{
                        width: '100px',
                        height: '100px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: '3px solid #cd7f32',
                        margin: '0 auto 1rem',
                      }}
                    />
                  ) : (
                    <div style={{
                      width: '100px',
                      height: '100px',
                      borderRadius: '50%',
                      background: '#333',
                      border: '3px solid #cd7f32',
                      margin: '0 auto 1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '2.5rem',
                      color: '#cd7f32',
                      fontFamily: 'Bebas Neue, sans-serif',
                    }}>
                      {top3[2].name.charAt(0)}
                    </div>
                  )}

                  <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#cd7f32', marginBottom: '0.5rem', fontFamily: 'JetBrains Mono, monospace' }}>
                    {top3[2].name.toUpperCase()}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '1rem' }}>
                    {top3[2].office}
                  </div>

                  <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#ef4444', fontFamily: 'Bebas Neue, sans-serif', marginBottom: '0.25rem' }}>
                    {formatAmount(top3[2].israelLobbyTotal || 0)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#ef4444' }}>
                    {getPercentage(top3[2])}% Israel Lobby
                  </div>
                </div>
              </Link>
            </div>
          )}

          {/* Remaining Table */}
          {remaining.length > 0 && (
            <div className="terminal-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ 
                padding: '1.5rem 2rem',
                background: 'rgba(239, 68, 68, 0.1)',
                borderBottom: '2px solid #ef4444',
              }}>
                <h2 style={{ 
                  fontSize: '1.25rem', 
                  fontWeight: 700, 
                  color: '#ef4444', 
                  textTransform: 'uppercase',
                  fontFamily: 'JetBrains Mono, monospace',
                }}>
                  🏆 TOP ISRAEL LOBBY RECIPIENTS
                </h2>
              </div>

              {/* Table Header */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '80px 1fr 180px 120px 80px',
                padding: '1rem 2rem',
                background: 'rgba(255, 255, 255, 0.02)',
                borderBottom: '1px solid #333',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: '#f59e0b',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                fontFamily: 'JetBrains Mono, monospace',
              }}>
                <div>RANK</div>
                <div>POLITICIAN</div>
                <div style={{ textAlign: 'right' }}>ISRAEL LOBBY</div>
                <div style={{ textAlign: 'center' }}>STATUS</div>
                <div style={{ textAlign: 'center' }}>VIEW</div>
              </div>

              {/* Table Rows */}
              {remaining.map((politician, index) => {
                const rank = index + 4; // Starting from #4
                const lobbyPercent = getPercentage(politician);

                return (
                  <div 
                    key={politician.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '80px 1fr 180px 120px 80px',
                      padding: '1.5rem 2rem',
                      borderBottom: '1px solid #222',
                      background: 'transparent',
                      transition: 'background 0.2s',
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    {/* Rank */}
                    <div style={{ 
                      display: 'flex',
                      alignItems: 'center',
                    }}>
                      <span style={{ 
                        fontSize: '1.25rem',
                        fontWeight: 700,
                        color: '#888',
                        fontFamily: 'Bebas Neue, sans-serif',
                      }}>
                        {rank}
                      </span>
                    </div>

                    {/* Politician Info */}
                    <div>
                      <div style={{ 
                        fontSize: '1rem', 
                        fontWeight: 700, 
                        marginBottom: '0.25rem',
                        color: '#fff',
                      }}>
                        {politician.name}
                      </div>
                      <div style={{ 
                        fontSize: '0.75rem', 
                        color: '#888',
                      }}>
                        {politician.office} ({politician.party.charAt(0)})
                        {politician.district && ` • ${politician.district}`}
                      </div>
                    </div>

                    {/* Israel Lobby Funding */}
                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div style={{ 
                        fontSize: '1.25rem', 
                        fontWeight: 700, 
                        color: '#ef4444',
                        fontFamily: 'Bebas Neue, sans-serif',
                        marginBottom: '0.25rem',
                      }}>
                        {formatAmount(politician.israelLobbyTotal || 0)}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#ef4444' }}>
                        {lobbyPercent}% of total
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
                        {politician.juiceBoxTier.toUpperCase()}
                      </span>
                    </div>

                    {/* View Button */}
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <Link
                        href={`/politician/${politician.id}`}
                        style={{
                          padding: '0.5rem 1rem',
                          background: '#f59e0b',
                          color: '#000',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          textDecoration: 'none',
                          transition: 'opacity 0.2s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                      >
                        →
                      </Link>
                    </div>
                  </div>
                );
              })}
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

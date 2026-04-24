import Link from 'next/link';
import { Politician } from '@/lib/types';

interface Props {
  politician: Politician;
}

export default function PoliticianCard({ politician }: Props) {
  // Safety check for required fields
  if (!politician || !politician.name || !politician.office) {
    return null;
  }

  const getScoreColor = (score: number) => {
    if (score < 40) return 'var(--gray-light)';
    if (score < 60) return 'var(--red-blood)';
    return 'var(--red-bright)';
  };

  const getScoreClass = (score: number) => {
    if (score < 40) return 'score-low';
    if (score < 60) return 'score-medium';
    return 'score-high';
  };

  const getJuiceBoxLabel = (tier: string) => {
    if (tier === 'owned') return '👑 FULLY OWNED';
    if (tier === 'bought') return '💰 BOUGHT & PAID FOR';
    if (tier === 'compromised') return '💸 COMPROMISED';
    return null;
  };

  const isDangerous = politician.corruptionScore >= 60 || politician.juiceBoxTier === 'owned';

  return (
    <Link 
      href={`/politician/${politician.id}`}
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <div 
        className={isDangerous ? 'card card-danger' : 'card'}
        style={{
          cursor: 'pointer',
          height: '100%',
          position: 'relative',
        }}
      >
        {/* Danger indicator */}
        {isDangerous && (
          <div 
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              padding: '0.5rem',
              background: 'var(--red-blood)',
              color: 'white',
              fontSize: '0.625rem',
              fontWeight: 700,
              letterSpacing: '0.1em',
              fontFamily: 'Bebas Neue, sans-serif',
            }}
          >
            ⚠ HIGH RISK
          </div>
        )}

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'start', gap: '1rem', marginBottom: '1.5rem' }}>
          <div 
            style={{
              width: '64px',
              height: '64px',
              border: `2px solid ${getScoreColor(politician.corruptionScore)}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2rem',
              fontWeight: 700,
              color: getScoreColor(politician.corruptionScore),
              flexShrink: 0,
              fontFamily: 'Bebas Neue, sans-serif',
            }}
          >
            {politician.name.charAt(0)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                marginBottom: '0.5rem',
                textTransform: 'uppercase',
                lineHeight: 1.2,
                wordBreak: 'break-word',
              }}
            >
              {politician.name}
            </h3>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {politician.office}
            </div>
            <span className={`party-badge party-${politician.party.toLowerCase()}`}>
              {politician.party === 'Republican' ? '🐘 R' : politician.party === 'Democrat' ? '🫏 D' : politician.party.charAt(0)}
            </span>
          </div>
          {/* Corruption Score */}
          <div style={{ textAlign: 'center' }}>
            <div 
              className={`corruption-score ${getScoreClass(politician.corruptionScore)}`}
              style={{ color: getScoreColor(politician.corruptionScore), fontSize: '3rem' }}
            >
              {politician.corruptionScore}
            </div>
            <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.1em' }}>
              RISK
            </div>
          </div>
        </div>

        {/* District */}
        {politician.district && (
          <div 
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              marginBottom: '1rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              borderLeft: '2px solid var(--red-blood)',
              paddingLeft: '0.5rem',
            }}
          >
            📍 {politician.district}
          </div>
        )}

        {/* Juice Box Tag */}
        {politician.juiceBoxTier !== 'none' ? (
          <div
            className={`tag tag-${politician.juiceBoxTier.replace('_', '-')}`}
            style={{ marginBottom: '1.5rem', display: 'inline-flex' }}
          >
            {getJuiceBoxLabel(politician.juiceBoxTier)}
            <span style={{ marginLeft: '0.75rem', fontWeight: 700 }}>
              ${Math.round(politician.aipacFunding).toLocaleString('en-US')}
            </span>
          </div>
        ) : ((politician.israelLobbyTotal ?? 0) === 0 && (politician.aipacFunding ?? 0) === 0) ? (
          <div
            style={{
              marginBottom: '1.5rem',
              display: 'inline-flex',
              padding: '0.4rem 0.75rem',
              border: '1px solid var(--terminal-green, #10b981)',
              color: 'var(--terminal-green, #10b981)',
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.1em',
            }}
          >
            ✓ NO FOREIGN INFLUENCE DETECTED
          </div>
        ) : null}

        {/* Top Donor */}
        {politician.topDonor?.name && (
          <div 
            style={{
              padding: '1rem',
              background: 'var(--bg-tertiary)',
              border: (politician.topDonor?.name?.includes('AIPAC') || politician.topDonor?.name?.includes('Israel')) ? '1px solid var(--red-blood)' : '1px solid var(--border-color)',
              marginBottom: '1rem',
            }}
          >
            <div style={{ fontSize: '0.625rem', color: 'var(--red-blood)', marginBottom: '0.5rem', letterSpacing: '0.2em', fontWeight: 700 }}>
              [ TOP DONOR ]
            </div>
            <div style={{ fontWeight: 700, fontSize: '0.875rem', textTransform: 'uppercase' }}>
              {politician.topDonor.name}
            </div>
            <div style={{ fontSize: '1rem', color: (politician.topDonor?.name?.includes('AIPAC') || politician.topDonor?.name?.includes('Israel')) ? 'var(--red-blood)' : 'var(--text-secondary)', fontWeight: 700, fontFamily: 'Bebas Neue, sans-serif' }}>
              ${politician.topDonor.amount?.toLocaleString() || '0'}
            </div>
          </div>
        )}

        {/* Tags */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
          {politician.tags && politician.tags.slice(0, 3).map((tag, idx) => (
            <span 
              key={idx}
              style={{
                fontSize: '0.625rem',
                padding: '0.25rem 0.5rem',
                background: `${tag.color}20`,
                color: tag.color,
                border: `1px solid ${tag.color}`,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {tag.label}
            </span>
          ))}
        </div>

        {/* Data Source Tag */}
        <div 
          style={{
            padding: '0.75rem',
            background: politician.dataStatus === 'live' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
            border: `1px solid ${politician.dataStatus === 'live' ? '#10b981' : '#f59e0b'}`,
            marginBottom: '1rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span 
              style={{
                fontSize: '0.625rem',
                color: politician.dataStatus === 'live' ? '#10b981' : '#f59e0b',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              {politician.dataStatus === 'live' ? '✓ LIVE DATA' : '⚠ MOCK DATA'}
            </span>
            {politician.lastUpdated && (
              <span 
                style={{
                  fontSize: '0.625rem',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                }}
              >
                {new Date(politician.lastUpdated).toLocaleDateString('en-US', { 
                  month: 'short', 
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            )}
          </div>
        </div>

        {/* Funding summary */}
        {(politician.totalFundsRaised ?? 0) > 0 && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.5rem 0.75rem',
            background: 'rgba(0, 191, 255, 0.05)',
            border: '1px solid var(--terminal-border)',
            marginBottom: '0.75rem',
            fontSize: '0.7rem',
          }}>
            <span style={{ color: 'var(--terminal-text-dim)' }}>FUNDS RAISED</span>
            <span style={{ fontWeight: 700, color: 'var(--terminal-amber)', fontFamily: 'Bebas Neue, sans-serif', fontSize: '0.9rem' }}>
              ${Math.round(politician.totalFundsRaised ?? 0).toLocaleString('en-US')}
            </span>
          </div>
        )}

        {/* Pro-Israel Lobby indicator */}
        {(politician.israelLobbyTotal ?? 0) > 0 && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.5rem 0.75rem',
            background: 'rgba(239, 68, 68, 0.05)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            marginBottom: '0.75rem',
            fontSize: '0.7rem',
          }}>
            <span style={{ color: 'var(--terminal-red)' }}>🇮🇱 PRO-ISRAEL LOBBY</span>
            <span style={{ fontWeight: 700, color: 'var(--terminal-red)', fontFamily: 'Bebas Neue, sans-serif', fontSize: '0.9rem' }}>
              ${Math.round(politician.israelLobbyTotal ?? 0).toLocaleString('en-US')}
            </span>
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '0.75rem',
            borderTop: '2px solid var(--border-color)',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          <span>{politician.yearsInOffice} YRS IN OFFICE</span>
          <span style={{ color: 'var(--red-blood)', fontWeight: 700, fontFamily: 'Bebas Neue, sans-serif' }}>
            VIEW DOSSIER →
          </span>
        </div>
      </div>
    </Link>
  );
}

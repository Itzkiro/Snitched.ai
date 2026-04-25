'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { Politician, CorruptionGrade, CorruptionConfidence } from '@/lib/types';
import Leaderboard, { type LeaderboardColumn } from '@/components/Leaderboard';

function getGradeColor(grade: CorruptionGrade): string {
  switch (grade) {
    case 'A': return '#10b981';
    case 'B': return '#22c55e';
    case 'C': return '#f59e0b';
    case 'D': return '#ef4444';
    case 'F': return '#dc2626';
  }
}

function getConfidenceColor(confidence: CorruptionConfidence): string {
  switch (confidence) {
    case 'high': return '#10b981';
    case 'medium': return '#f59e0b';
    case 'low': return '#6b7280';
  }
}

function getScoreColor(score: number): string {
  if (score <= 20) return '#10b981';
  if (score <= 40) return '#22c55e';
  if (score <= 60) return '#f59e0b';
  if (score <= 80) return '#ef4444';
  return '#dc2626';
}

export default function JuiceBoxPage() {
  return <Suspense><JuiceBoxContent /></Suspense>;
}

function JuiceBoxContent() {
  const searchParams = useSearchParams();
  const stateParam = searchParams.get('state') || '';
  const [politicians, setPoliticians] = useState<Politician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'corruption' | 'fundraisers' | 'israel'>('corruption');

  useEffect(() => {
    async function loadData() {
      try {
        const qs = stateParam ? `?state=${stateParam}` : '';
        const res = await fetch(`/api/politicians${qs}`);
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data: Politician[] = await res.json();
        setPoliticians(data);
      } catch (error) {
        console.error('Error loading:', error);
        setError(error instanceof Error ? error.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [stateParam]);

  if (loading) {
    return <div className="p-3 sm:p-6 lg:p-8 text-center text-white">Loading...</div>;
  }

  if (error) {
    return <div className="p-3 sm:p-6 lg:p-8 text-center text-red-500">Error: {error}</div>;
  }

  // Corruption score leaderboard: all active politicians sorted by score (highest first)
  const corruptionRanked = politicians
    .filter(p => p.isActive && p.corruptionScore > 0)
    .sort((a, b) => b.corruptionScore - a.corruptionScore);

  const juiceBoxPoliticians = politicians
    .filter(p => p.isActive && p.israelLobbyTotal && p.israelLobbyTotal > 0)
    .sort((a, b) => (b.israelLobbyTotal || 0) - (a.israelLobbyTotal || 0));

  const fundedPoliticians = politicians
    .filter(p => p.isActive && (p.totalFundsRaised ?? 0) > 0)
    .sort((a, b) => (b.totalFundsRaised || 0) - (a.totalFundsRaised || 0));

  const totalFundsTracked = fundedPoliticians.reduce((sum, p) => sum + (p.totalFundsRaised || 0), 0);
  const totalIsraelLobby = juiceBoxPoliticians.reduce((sum, p) => sum + (p.israelLobbyTotal || 0), 0);

  // Score distribution
  const gradeDistribution = {
    F: corruptionRanked.filter(p => p.corruptionScore > 80).length,
    D: corruptionRanked.filter(p => p.corruptionScore > 60 && p.corruptionScore <= 80).length,
    C: corruptionRanked.filter(p => p.corruptionScore > 40 && p.corruptionScore <= 60).length,
    B: corruptionRanked.filter(p => p.corruptionScore > 20 && p.corruptionScore <= 40).length,
    A: corruptionRanked.filter(p => p.corruptionScore <= 20).length,
  };

  const avgScore = corruptionRanked.length > 0
    ? Math.round(corruptionRanked.reduce((sum, p) => sum + p.corruptionScore, 0) / corruptionRanked.length)
    : 0;

  const highConfidenceCount = corruptionRanked.filter(p => p.corruptionScoreDetails?.confidence === 'high').length;

  const tierCounts = {
    owned: juiceBoxPoliticians.filter(p => p.juiceBoxTier === 'owned').length,
    bought: juiceBoxPoliticians.filter(p => p.juiceBoxTier === 'bought').length,
    compromised: juiceBoxPoliticians.filter(p => p.juiceBoxTier === 'compromised').length,
  };

  const fecVerified = politicians.filter(p => p.tags?.some(t => t.label === 'FEC VERIFIED')).length;
  const fecTotalOnly = politicians.filter(p => p.tags?.some(t => t.label === 'FEC TOTAL ONLY')).length;
  const federalCount = politicians.filter(p => p.officeLevel === 'US Senator' || p.officeLevel === 'US Representative').length;

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
    if (rank === 1) return '\u{1F947}';
    if (rank === 2) return '\u{1F948}';
    if (rank === 3) return '\u{1F949}';
    return '';
  };

  const renderRank = (_row: unknown, index: number) => {
    const rank = index + 1;
    const isTopThree = rank <= 3;
    return (
      <span
        style={{
          fontSize: isTopThree ? '1.25rem' : '1rem',
          fontWeight: 700,
          color: isTopThree ? '#ef4444' : 'var(--terminal-text-dim)',
          fontFamily: 'Bebas Neue, sans-serif',
        }}
      >
        {getRankMedal(rank)} {rank}
      </span>
    );
  };

  // ── Section 1: Corruption Score Leaderboard ──
  // primary metric: corruption score (D-22 committed assignment)
  const corruptionColumns: LeaderboardColumn<Politician>[] = [
    {
      key: 'rank',
      header: '#',
      widthLg: '60px',
      mobileSlot: 'secondary',
      render: () => null,
    },
    {
      key: 'politician',
      header: 'POLITICIAN',
      widthLg: '1fr',
      isName: true,
      mobileSlot: 'secondary',
      cellClassName: 'whitespace-normal lg:whitespace-nowrap',
      render: (p) => (
        <div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.25rem', color: 'var(--terminal-text)' }}>
            {p.name}
          </div>
          <div
            className="break-words"
            style={{
              fontSize: '0.7rem',
              color: 'var(--terminal-text-dim)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              flexWrap: 'wrap',
            }}
          >
            <span>{p.office}</span>
            <span
              style={{
                fontSize: '9px',
                padding: '0.2rem 0.5rem',
                background: p.party === 'Republican' ? '#dc2626' : p.party === 'Democrat' ? '#2563eb' : '#6b7280',
                color: '#fff',
                borderRadius: '10px',
                fontWeight: 600,
              }}
            >
              {p.party === 'Republican' ? 'R' : p.party === 'Democrat' ? 'D' : p.party.charAt(0)}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'score',
      header: 'SCORE',
      widthLg: '100px',
      mobileSlot: 'primary',
      mobileLabel: 'SCORE',
      cellClassName: 'text-center',
      render: (p) => (
        <div className="inline-flex items-center justify-center" style={{
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          border: `3px solid ${getScoreColor(p.corruptionScore)}`,
          flexDirection: 'column',
        }}>
          <span style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            color: getScoreColor(p.corruptionScore),
            fontFamily: 'Bebas Neue, sans-serif',
            lineHeight: 1,
          }}>
            {p.corruptionScore}
          </span>
          <span style={{ fontSize: '0.5rem', color: 'var(--terminal-text-dim)' }}>/100</span>
        </div>
      ),
    },
    {
      key: 'grade',
      header: 'GRADE',
      widthLg: '80px',
      mobileSlot: 'secondary',
      mobileLabel: 'GRADE',
      cellClassName: 'text-center',
      render: (p) => {
        const details = p.corruptionScoreDetails;
        const grade = (details?.grade ?? (p.corruptionScore <= 20 ? 'A' : p.corruptionScore <= 40 ? 'B' : p.corruptionScore <= 60 ? 'C' : p.corruptionScore <= 80 ? 'D' : 'F')) as CorruptionGrade;
        return (
          <span style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            color: getGradeColor(grade),
            fontFamily: 'Bebas Neue, sans-serif',
          }}>
            {grade}
          </span>
        );
      },
    },
    {
      key: 'confidence',
      header: 'CONFIDENCE',
      widthLg: '120px',
      mobileSlot: 'secondary',
      mobileLabel: 'CONFIDENCE',
      cellClassName: 'text-center',
      render: (p) => {
        const details = p.corruptionScoreDetails;
        const confidence = details?.confidence ?? 'low';
        return (
          <span
            className="whitespace-normal lg:whitespace-nowrap"
            style={{
              padding: '0.3rem 0.6rem',
              background: `${getConfidenceColor(confidence)}15`,
              border: `1px solid ${getConfidenceColor(confidence)}`,
              color: getConfidenceColor(confidence),
              fontSize: '0.55rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {confidence} ({details?.dataCompleteness ?? 0}%)
          </span>
        );
      },
    },
    {
      key: 'topFactor',
      header: 'TOP FACTOR',
      widthLg: '1fr',
      mobileSlot: 'secondary',
      mobileLabel: 'TOP FACTOR',
      cellClassName: 'whitespace-normal lg:whitespace-nowrap',
      render: (p) => {
        const details = p.corruptionScoreDetails;
        const topFactor = details?.factors
          ? [...details.factors].sort((a, b) => b.weightedScore - a.weightedScore)[0]
          : null;
        return topFactor ? (
          <div className="break-words">
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--terminal-text)', marginBottom: '0.15rem' }}>
              {topFactor.label}
            </div>
            <div style={{ fontSize: '0.6rem', color: 'var(--terminal-text-dim)' }}>
              {topFactor.rawScore}/100 (x{topFactor.weight})
            </div>
          </div>
        ) : (
          <span style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dim)' }}>--</span>
        );
      },
    },
    {
      key: 'view',
      header: 'DETAILS',
      widthLg: '100px',
      mobileSlot: 'meta',
      cellClassName: 'text-center',
      render: (p) => (
        <Link
          href={`/politician/${p.id}`}
          style={{
            padding: '0.4rem 0.8rem',
            background: 'var(--terminal-amber)',
            color: '#000',
            fontSize: '0.7rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            textDecoration: 'none',
            display: 'inline-block',
          }}
        >
          VIEW
        </Link>
      ),
    },
  ];

  // ── Section 2: Top Fundraisers ──
  // primary metric: top-donor amount → here, "Total Raised" is the headline metric
  // (this section's framing is "TOP FUNDRAISERS"; per plan D-14, primary = top-donor amount;
  // in this section the top-line dollar figure IS total raised, which represents the
  // dominant donor influence on the campaign).
  // NOTE: Plan committed `primary = top-donor amount` for the top-donor leaderboard
  // (Section 3, israel lobby). This Section 2 (TOP FUNDRAISERS) mirrors that pattern —
  // the headline dollar figure is the primary slot. Recording in summary.
  const fundraisersColumns: LeaderboardColumn<Politician>[] = [
    {
      key: 'rank',
      header: '#',
      widthLg: '60px',
      mobileSlot: 'secondary',
      render: () => null,
    },
    {
      key: 'politician',
      header: 'POLITICIAN',
      widthLg: '1fr',
      isName: true,
      mobileSlot: 'secondary',
      cellClassName: 'whitespace-normal lg:whitespace-nowrap',
      render: (p) => (
        <div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.25rem', color: 'var(--terminal-text)' }}>
            {p.name}
          </div>
          <div
            className="break-words"
            style={{
              fontSize: '0.7rem',
              color: 'var(--terminal-text-dim)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              flexWrap: 'wrap',
            }}
          >
            <span>{p.office}</span>
            <span
              style={{
                fontSize: '9px',
                padding: '0.2rem 0.5rem',
                background: p.party === 'Republican' ? '#dc2626' : p.party === 'Democrat' ? '#2563eb' : '#6b7280',
                color: '#fff',
                borderRadius: '10px',
                fontWeight: 600,
              }}
            >
              {p.party === 'Republican' ? 'R' : p.party === 'Democrat' ? 'D' : p.party.charAt(0)}
            </span>
            {p.district && <span>{p.district}</span>}
          </div>
        </div>
      ),
    },
    {
      key: 'score',
      header: 'SCORE',
      widthLg: '100px',
      mobileSlot: 'secondary',
      mobileLabel: 'SCORE',
      cellClassName: 'text-center',
      render: (p) => {
        const grade = (p.corruptionScoreDetails?.grade ?? 'B') as CorruptionGrade;
        return (
          <span style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'baseline' }}>
            <span style={{
              fontSize: '1.1rem', fontWeight: 700,
              color: getScoreColor(p.corruptionScore),
              fontFamily: 'Bebas Neue, sans-serif',
            }}>
              {p.corruptionScore}
            </span>
            <span style={{
              fontSize: '0.9rem', fontWeight: 700,
              color: getGradeColor(grade),
              fontFamily: 'Bebas Neue, sans-serif',
            }}>
              {grade}
            </span>
          </span>
        );
      },
    },
    {
      key: 'totalRaised',
      header: 'TOTAL RAISED',
      widthLg: '140px',
      mobileSlot: 'primary',
      mobileLabel: 'TOTAL RAISED',
      cellClassName: 'text-right',
      render: (p) => (
        <span style={{
          fontSize: '1.1rem', fontWeight: 700,
          color: 'var(--terminal-amber)',
          fontFamily: 'Bebas Neue, sans-serif',
        }}>
          ${Math.round(p.totalFundsRaised || 0).toLocaleString('en-US')}
        </span>
      ),
    },
    {
      key: 'israelLobby',
      header: 'ISRAEL LOBBY',
      widthLg: '140px',
      mobileSlot: 'secondary',
      mobileLabel: 'ISRAEL LOBBY',
      cellClassName: 'text-right',
      render: (p) => (
        <span style={{
          fontSize: '1rem', fontWeight: 700,
          color: (p.israelLobbyTotal || 0) > 0 ? '#ef4444' : 'var(--terminal-text-dim)',
          fontFamily: 'Bebas Neue, sans-serif',
        }}>
          {(p.israelLobbyTotal || 0) > 0
            ? `$${Math.round(p.israelLobbyTotal || 0).toLocaleString('en-US')}`
            : '--'}
        </span>
      ),
    },
    {
      key: 'data',
      header: 'DATA',
      widthLg: '120px',
      mobileSlot: 'secondary',
      mobileLabel: 'DATA',
      cellClassName: 'text-center',
      render: (p) => {
        const hasDetailedData = p.tags?.some(t => t.label === 'FEC VERIFIED');
        return (
          <span
            className="whitespace-normal lg:whitespace-nowrap"
            style={{
              padding: '0.3rem 0.6rem',
              background: hasDetailedData ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              border: `1px solid ${hasDetailedData ? '#10b981' : '#f59e0b'}`,
              color: hasDetailedData ? '#10b981' : '#f59e0b',
              fontSize: '0.55rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {hasDetailedData ? 'FULL FEC' : 'TOTAL ONLY'}
          </span>
        );
      },
    },
    {
      key: 'view',
      header: 'PROFILE',
      widthLg: '100px',
      mobileSlot: 'meta',
      cellClassName: 'text-center',
      render: (p) => (
        <Link
          href={`/politician/${p.id}`}
          style={{
            padding: '0.4rem 0.8rem',
            background: 'var(--terminal-amber)',
            color: '#000',
            fontSize: '0.7rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            textDecoration: 'none',
            display: 'inline-block',
          }}
        >
          VIEW
        </Link>
      ),
    },
  ];

  // ── Section 3: Israel Lobby Leaderboard ──
  // primary metric: pro-Israel donation total (D-22 committed assignment)
  const israelColumns: LeaderboardColumn<Politician>[] = [
    {
      key: 'rank',
      header: '#',
      widthLg: '60px',
      mobileSlot: 'secondary',
      render: () => null,
    },
    {
      key: 'politician',
      header: 'POLITICIAN',
      widthLg: '1fr',
      isName: true,
      mobileSlot: 'secondary',
      cellClassName: 'whitespace-normal lg:whitespace-nowrap',
      render: (p) => (
        <div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.25rem', color: 'var(--terminal-text)' }}>
            {p.name}
          </div>
          <div
            className="break-words"
            style={{
              fontSize: '0.7rem',
              color: 'var(--terminal-text-dim)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              flexWrap: 'wrap',
            }}
          >
            <span>{p.office}</span>
            <span
              style={{
                fontSize: '9px',
                padding: '0.2rem 0.5rem',
                background: p.party === 'Republican' ? '#dc2626' : p.party === 'Democrat' ? '#2563eb' : '#6b7280',
                color: '#fff',
                borderRadius: '10px',
                fontWeight: 600,
              }}
            >
              {p.party === 'Republican' ? 'R' : p.party === 'Democrat' ? 'D' : p.party.charAt(0)}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'score',
      header: 'SCORE',
      widthLg: '100px',
      mobileSlot: 'secondary',
      mobileLabel: 'SCORE',
      cellClassName: 'text-center',
      render: (p) => {
        const grade = (p.corruptionScoreDetails?.grade ?? 'C') as CorruptionGrade;
        return (
          <span style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'baseline' }}>
            <span style={{
              fontSize: '1.1rem', fontWeight: 700,
              color: getScoreColor(p.corruptionScore),
              fontFamily: 'Bebas Neue, sans-serif',
            }}>
              {p.corruptionScore}
            </span>
            <span style={{
              fontSize: '0.9rem', fontWeight: 700,
              color: getGradeColor(grade),
              fontFamily: 'Bebas Neue, sans-serif',
            }}>
              {grade}
            </span>
          </span>
        );
      },
    },
    {
      key: 'israelLobby',
      header: 'ISRAEL LOBBY',
      widthLg: '150px',
      mobileSlot: 'primary',
      mobileLabel: 'ISRAEL LOBBY',
      cellClassName: 'text-right',
      render: (p) => {
        const lobbyPercent = p.totalFundsRaised && p.israelLobbyTotal
          ? ((p.israelLobbyTotal / p.totalFundsRaised) * 100).toFixed(1)
          : '0';
        return (
          <div>
            <div style={{
              fontSize: '1.25rem', fontWeight: 700, color: '#ef4444',
              fontFamily: 'Bebas Neue, sans-serif',
            }}>
              ${Math.round(p.israelLobbyTotal || 0).toLocaleString('en-US')}
            </div>
            <div style={{ fontSize: '0.65rem', color: '#ef4444' }}>
              {lobbyPercent}% of total
            </div>
          </div>
        );
      },
    },
    {
      key: 'totalFunds',
      header: 'TOTAL FUNDS',
      widthLg: '150px',
      mobileSlot: 'secondary',
      mobileLabel: 'TOTAL FUNDS',
      cellClassName: 'text-right',
      render: (p) => (
        <span style={{
          fontSize: '1rem', fontWeight: 700, color: 'var(--terminal-text-dim)',
          fontFamily: 'Bebas Neue, sans-serif',
        }}>
          ${Math.round(p.totalFundsRaised || 0).toLocaleString('en-US')}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'STATUS',
      widthLg: '150px',
      mobileSlot: 'secondary',
      mobileLabel: 'STATUS',
      cellClassName: 'text-center',
      render: (p) => (
        <span
          className="whitespace-normal lg:whitespace-nowrap"
          style={{
            padding: '0.4rem 0.8rem',
            background: `${getTierColor(p.juiceBoxTier)}20`,
            border: `1px solid ${getTierColor(p.juiceBoxTier)}`,
            color: getTierColor(p.juiceBoxTier),
            fontSize: '0.55rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            display: 'inline-block',
          }}
        >
          {getTierLabel(p.juiceBoxTier)}
        </span>
      ),
    },
    {
      key: 'view',
      header: 'PROFILE',
      widthLg: '100px',
      mobileSlot: 'meta',
      cellClassName: 'text-center',
      render: (p) => (
        <Link
          href={`/politician/${p.id}`}
          style={{
            padding: '0.4rem 0.8rem',
            background: 'var(--terminal-amber)',
            color: '#000',
            fontSize: '0.7rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            textDecoration: 'none',
            display: 'inline-block',
          }}
        >
          VIEW
        </Link>
      ),
    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--terminal-bg)', color: 'var(--terminal-text)' }}>
      {/* Terminal Title */}
      <div className="terminal-title">
        <div>
          <h1>CORRUPTION SCORE LEADERBOARD</h1>
          <div className="terminal-subtitle">
            Data-Driven Corruption & Influence Scoring | v1 Algorithm
          </div>
        </div>
      </div>

      {/* Summary Alert */}
      <div className="p-3 sm:p-6 lg:p-8" style={{ borderBottom: '1px solid var(--terminal-border)' }}>
        <div className="alert-level">
          <span className="alert-icon">{avgScore >= 50 ? '\u{1F6A8}' : '\u{26A0}\u{FE0F}'}</span>
          <span>AVG CORRUPTION SCORE: {avgScore}/100</span>
          <span style={{ fontSize: '0.875rem', color: 'var(--terminal-text-dim)', marginLeft: '1rem' }}>
            {corruptionRanked.length} officials scored | {highConfidenceCount} high confidence
          </span>
          <span style={{ fontSize: '0.875rem', color: 'var(--terminal-text-dim)', marginLeft: '1rem' }}>
            | FEC TRACKED: ${Math.round(totalFundsTracked).toLocaleString('en-US')}
          </span>
        </div>
      </div>

      {/* Export bar */}
      <div className="px-3 py-3 sm:px-6 lg:px-8 flex flex-wrap gap-3" style={{ borderBottom: '1px solid var(--terminal-border)' }}>
        <a href="/api/export?format=csv&type=israel_lobby" download className="terminal-btn" style={{ fontSize: '0.7rem', padding: '0.4rem 0.75rem' }}>
          EXPORT ISRAEL LOBBY CSV
        </a>
        <a href="/api/export?format=csv&type=corruption" download className="terminal-btn" style={{ fontSize: '0.7rem', padding: '0.4rem 0.75rem' }}>
          EXPORT CORRUPTION CSV
        </a>
        <a href="/api/export?format=csv&type=all" download className="terminal-btn" style={{ fontSize: '0.7rem', padding: '0.4rem 0.75rem' }}>
          EXPORT ALL DATA CSV
        </a>
      </div>

      <div className="p-3 sm:p-6 lg:p-8">
        <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
          {/* Score Distribution Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 mb-6 lg:mb-8">
            <div className="terminal-card">
              <div style={{ fontSize: '3rem', fontWeight: 700, color: '#dc2626', fontFamily: 'Bebas Neue, sans-serif', marginBottom: '0.5rem' }}>
                {gradeDistribution.F}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                GRADE F (81-100)
              </div>
            </div>

            <div className="terminal-card">
              <div style={{ fontSize: '3rem', fontWeight: 700, color: '#ef4444', fontFamily: 'Bebas Neue, sans-serif', marginBottom: '0.5rem' }}>
                {gradeDistribution.D}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                GRADE D (61-80)
              </div>
            </div>

            <div className="terminal-card">
              <div style={{ fontSize: '3rem', fontWeight: 700, color: '#f59e0b', fontFamily: 'Bebas Neue, sans-serif', marginBottom: '0.5rem' }}>
                {gradeDistribution.C}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                GRADE C (41-60)
              </div>
            </div>

            <div className="terminal-card">
              <div style={{ fontSize: '3rem', fontWeight: 700, color: '#22c55e', fontFamily: 'Bebas Neue, sans-serif', marginBottom: '0.5rem' }}>
                {gradeDistribution.B}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                GRADE B (21-40)
              </div>
            </div>

            <div className="terminal-card">
              <div style={{ fontSize: '3rem', fontWeight: 700, color: '#10b981', fontFamily: 'Bebas Neue, sans-serif', marginBottom: '0.5rem' }}>
                {gradeDistribution.A}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                GRADE A (0-20)
              </div>
            </div>
          </div>

          {/* View Tabs */}
          <div style={{
            display: 'flex',
            gap: '0',
            marginBottom: '2rem',
            borderBottom: '2px solid var(--terminal-border)',
            overflowX: 'auto',
          }}>
            {[
              { key: 'corruption' as const, label: 'CORRUPTION SCORES', count: corruptionRanked.length },
              { key: 'fundraisers' as const, label: 'TOP FUNDRAISERS', count: fundedPoliticians.length },
              { key: 'israel' as const, label: 'ISRAEL LOBBY', count: juiceBoxPoliticians.length },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveView(tab.key)}
                className="px-4 py-3 sm:px-6 lg:px-8"
                style={{
                  background: activeView === tab.key ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
                  border: 'none',
                  borderBottom: activeView === tab.key ? '2px solid var(--terminal-amber)' : '2px solid transparent',
                  color: activeView === tab.key ? 'var(--terminal-amber)' : 'var(--terminal-text-dim)',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  fontFamily: 'JetBrains Mono, monospace',
                  cursor: 'pointer',
                  marginBottom: '-2px',
                  whiteSpace: 'nowrap',
                  minHeight: '44px',
                }}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          {/* CORRUPTION SCORE LEADERBOARD */}
          {activeView === 'corruption' && (
            <div className="terminal-card mb-6 lg:mb-8" style={{ padding: 0, overflow: 'hidden' }}>
              <div
                className="p-3 sm:p-6 lg:p-8"
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  borderBottom: '2px solid #ef4444',
                }}
              >
                <h2 style={{
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  color: '#ef4444',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontFamily: 'JetBrains Mono, monospace',
                }}>
                  CORRUPTION SCORE RANKINGS
                </h2>
                <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginTop: '0.5rem', fontFamily: 'JetBrains Mono, monospace' }}>
                  Ranked by composite corruption/influence score | 5-factor algorithm | Higher = more corrupt
                </div>
              </div>

              {corruptionRanked.length > 0 ? (
                <div className="p-3 sm:p-6 lg:p-8">
                  <Leaderboard
                    rows={corruptionRanked}
                    columns={corruptionColumns}
                    mobileLayout="card"
                    getRowKey={(p) => p.id}
                    rankRender={renderRank}
                  />
                </div>
              ) : (
                <div className="p-3 sm:p-6 lg:p-8 text-center" style={{ color: 'var(--terminal-text-dim)' }}>
                  No politicians with corruption scores found.
                </div>
              )}
            </div>
          )}

          {/* TOP FUNDRAISERS */}
          {activeView === 'fundraisers' && fundedPoliticians.length > 0 && (
            <div className="terminal-card mb-6 lg:mb-8" style={{ padding: 0, overflow: 'hidden' }}>
              <div
                className="p-3 sm:p-6 lg:p-8"
                style={{
                  background: 'rgba(245, 158, 11, 0.1)',
                  borderBottom: '2px solid var(--terminal-amber)',
                }}
              >
                <h2 style={{
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  color: 'var(--terminal-amber)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontFamily: 'JetBrains Mono, monospace',
                }}>
                  TOP FUNDRAISERS (REAL FEC DATA)
                </h2>
                <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginTop: '0.5rem', fontFamily: 'JetBrains Mono, monospace' }}>
                  {fundedPoliticians.length} politicians with verified campaign finance data | Sources: FEC, FL Division of Elections
                </div>
              </div>

              <div className="p-3 sm:p-6 lg:p-8">
                <Leaderboard
                  rows={fundedPoliticians}
                  columns={fundraisersColumns}
                  mobileLayout="card"
                  getRowKey={(p) => p.id}
                  rankRender={renderRank}
                />
              </div>
            </div>
          )}

          {/* ISRAEL LOBBY LEADERBOARD */}
          {activeView === 'israel' && (
            <>
              {juiceBoxPoliticians.length > 0 ? (
                <div className="terminal-card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div
                    className="p-3 sm:p-6 lg:p-8"
                    style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      borderBottom: '2px solid #ef4444',
                    }}
                  >
                    <h2 style={{
                      fontSize: '1.5rem',
                      fontWeight: 700,
                      color: '#ef4444',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      fontFamily: 'JetBrains Mono, monospace',
                    }}>
                      RANKED BY PRO-ISRAEL LOBBY FUNDING
                    </h2>
                    <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginTop: '0.5rem', fontFamily: 'JetBrains Mono, monospace' }}>
                      ${Math.round(totalIsraelLobby).toLocaleString('en-US')} total | {tierCounts.owned} owned, {tierCounts.bought} bought, {tierCounts.compromised} compromised
                    </div>
                  </div>

                  <div className="p-3 sm:p-6 lg:p-8">
                    <Leaderboard
                      rows={juiceBoxPoliticians}
                      columns={israelColumns}
                      mobileLayout="card"
                      getRowKey={(p) => p.id}
                      rankRender={renderRank}
                    />
                  </div>
                </div>
              ) : (
                <div className="terminal-card p-3 sm:p-6 lg:p-8 text-center">
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                    NO ISRAEL LOBBY POLITICIANS FOUND
                  </div>
                  <div style={{ color: 'var(--terminal-text-dim)' }}>
                    All tracked politicians are currently clean
                  </div>
                </div>
              )}
            </>
          )}

          {/* FEC Data Coverage Banner */}
          <div className="terminal-card" style={{
            marginTop: '2rem',
            background: 'rgba(16, 185, 129, 0.05)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem',
            }}>
              <div>
                <div style={{
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  color: '#10b981',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  fontFamily: 'JetBrains Mono, monospace',
                  marginBottom: '0.5rem',
                }}>
                  DATA COVERAGE
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', fontFamily: 'JetBrains Mono, monospace' }}>
                  {fecVerified} with full FEC data | {fecTotalOnly} with FEC totals | {federalCount} federal officials | {politicians.length} total tracked
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  color: '#10b981',
                  fontFamily: 'Bebas Neue, sans-serif',
                }}>
                  ${Math.round(totalFundsTracked).toLocaleString('en-US')}
                </div>
                <div style={{ fontSize: '0.625rem', color: 'var(--terminal-text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  TOTAL FEC FUNDS TRACKED
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="classified-footer">
        ALL DATA ACQUIRED VIA OSINT // PUBLIC RECORDS: FEC, SOCIAL MEDIA, NEWS OUTLETS // CORRUPTION SCORE v1 ALGORITHM
      </div>
    </div>
  );
}

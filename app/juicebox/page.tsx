'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { Politician, CorruptionScoreResult, CorruptionGrade, CorruptionConfidence } from '@/lib/types';

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
  const [politicians, setPoliticians] = useState<Politician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'corruption' | 'fundraisers' | 'israel'>('corruption');

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch('/api/politicians');
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
  }, []);

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'white' }}>Loading...</div>;
  }

  if (error) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'red' }}>Error: {error}</div>;
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
      <div style={{ padding: '2rem', borderBottom: '1px solid var(--terminal-border)' }}>
        <div className="alert-level">
          <span className="alert-icon">{avgScore >= 50 ? '\u{1F6A8}' : '\u{26A0}\u{FE0F}'}</span>
          <span>AVG CORRUPTION SCORE: {avgScore}/100</span>
          <span style={{ fontSize: '0.875rem', color: 'var(--terminal-text-dim)', marginLeft: '1rem' }}>
            {corruptionRanked.length} officials scored | {highConfidenceCount} high confidence
          </span>
          <span style={{ fontSize: '0.875rem', color: 'var(--terminal-text-dim)', marginLeft: '1rem' }}>
            | FEC TRACKED: ${(totalFundsTracked / 1000000).toFixed(1)}M
          </span>
        </div>
      </div>

      {/* Export bar */}
      <div style={{ padding: '0.75rem 2rem', borderBottom: '1px solid var(--terminal-border)', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
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

      <div style={{ padding: '2rem' }}>
        <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
          {/* Score Distribution Stats */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '1.5rem',
              marginBottom: '2rem',
            }}
          >
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

            <div className="terminal-card">
              <div style={{ fontSize: '3rem', fontWeight: 700, color: getScoreColor(avgScore), fontFamily: 'Bebas Neue, sans-serif', marginBottom: '0.5rem' }}>
                {avgScore}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                AVG SCORE
              </div>
            </div>
          </div>

          {/* View Tabs */}
          <div style={{
            display: 'flex',
            gap: '0',
            marginBottom: '2rem',
            borderBottom: '2px solid var(--terminal-border)',
          }}>
            {[
              { key: 'corruption' as const, label: 'CORRUPTION SCORES', count: corruptionRanked.length },
              { key: 'fundraisers' as const, label: 'TOP FUNDRAISERS', count: fundedPoliticians.length },
              { key: 'israel' as const, label: 'ISRAEL LOBBY', count: juiceBoxPoliticians.length },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveView(tab.key)}
                style={{
                  padding: '1rem 2rem',
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
                }}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          {/* CORRUPTION SCORE LEADERBOARD */}
          {activeView === 'corruption' && (
            <div className="terminal-card" style={{ padding: 0, overflow: 'hidden', marginBottom: '2rem' }}>
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
                  CORRUPTION SCORE RANKINGS
                </h2>
                <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginTop: '0.5rem', fontFamily: 'JetBrains Mono, monospace' }}>
                  Ranked by composite corruption/influence score | 5-factor algorithm | Higher = more corrupt
                </div>
              </div>

              {/* Table Header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '60px 1fr 100px 80px 120px 1fr 100px',
                padding: '1rem 2rem',
                background: 'rgba(255, 255, 255, 0.02)',
                borderBottom: '1px solid var(--terminal-border)',
                fontSize: '0.65rem',
                fontWeight: 700,
                color: 'var(--terminal-amber)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                fontFamily: 'JetBrains Mono, monospace',
              }}>
                <div>#</div>
                <div>POLITICIAN</div>
                <div style={{ textAlign: 'center' }}>SCORE</div>
                <div style={{ textAlign: 'center' }}>GRADE</div>
                <div style={{ textAlign: 'center' }}>CONFIDENCE</div>
                <div>TOP FACTOR</div>
                <div style={{ textAlign: 'center' }}>DETAILS</div>
              </div>

              {/* Table Rows */}
              {corruptionRanked.map((politician, index) => {
                const rank = index + 1;
                const isTopThree = rank <= 3;
                const details = politician.corruptionScoreDetails;
                const grade = details?.grade ?? (politician.corruptionScore <= 20 ? 'A' : politician.corruptionScore <= 40 ? 'B' : politician.corruptionScore <= 60 ? 'C' : politician.corruptionScore <= 80 ? 'D' : 'F') as CorruptionGrade;
                const confidence = details?.confidence ?? 'low';

                // Find the top contributing factor
                const topFactor = details?.factors
                  ? [...details.factors].sort((a, b) => b.weightedScore - a.weightedScore)[0]
                  : null;

                return (
                  <div
                    key={politician.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '60px 1fr 100px 80px 120px 1fr 100px',
                      padding: '1.25rem 2rem',
                      borderBottom: '1px solid var(--terminal-border)',
                      background: isTopThree ? 'rgba(239, 68, 68, 0.04)' : 'transparent',
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  >
                    {/* Rank */}
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span style={{
                        fontSize: isTopThree ? '1.25rem' : '1rem',
                        fontWeight: 700,
                        color: isTopThree ? '#ef4444' : 'var(--terminal-text-dim)',
                        fontFamily: 'Bebas Neue, sans-serif',
                      }}>
                        {getRankMedal(rank)} {rank}
                      </span>
                    </div>

                    {/* Politician Info */}
                    <div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.25rem', color: 'var(--terminal-text)' }}>
                        {politician.name}
                      </div>
                      <div style={{
                        fontSize: '0.7rem', color: 'var(--terminal-text-dim)',
                        display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap',
                      }}>
                        <span>{politician.office}</span>
                        <span style={{
                          fontSize: '9px', padding: '0.2rem 0.5rem',
                          background: politician.party === 'Republican' ? '#dc2626' : politician.party === 'Democrat' ? '#2563eb' : '#6b7280',
                          color: '#fff', borderRadius: '10px', fontWeight: 600,
                        }}>
                          {politician.party === 'Republican' ? 'R' : politician.party === 'Democrat' ? 'D' : politician.party.charAt(0)}
                        </span>
                      </div>
                    </div>

                    {/* Score */}
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <div style={{
                        width: '60px',
                        height: '60px',
                        borderRadius: '50%',
                        border: `3px solid ${getScoreColor(politician.corruptionScore)}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'column',
                      }}>
                        <span style={{
                          fontSize: '1.25rem',
                          fontWeight: 700,
                          color: getScoreColor(politician.corruptionScore),
                          fontFamily: 'Bebas Neue, sans-serif',
                          lineHeight: 1,
                        }}>
                          {politician.corruptionScore}
                        </span>
                        <span style={{ fontSize: '0.5rem', color: 'var(--terminal-text-dim)' }}>/100</span>
                      </div>
                    </div>

                    {/* Grade */}
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <span style={{
                        fontSize: '1.5rem',
                        fontWeight: 700,
                        color: getGradeColor(grade),
                        fontFamily: 'Bebas Neue, sans-serif',
                      }}>
                        {grade}
                      </span>
                    </div>

                    {/* Confidence */}
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <span style={{
                        padding: '0.3rem 0.6rem',
                        background: `${getConfidenceColor(confidence)}15`,
                        border: `1px solid ${getConfidenceColor(confidence)}`,
                        color: getConfidenceColor(confidence),
                        fontSize: '0.55rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        whiteSpace: 'nowrap',
                      }}>
                        {confidence} ({details?.dataCompleteness ?? 0}%)
                      </span>
                    </div>

                    {/* Top Factor */}
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      {topFactor ? (
                        <div>
                          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--terminal-text)', marginBottom: '0.15rem' }}>
                            {topFactor.label}
                          </div>
                          <div style={{ fontSize: '0.6rem', color: 'var(--terminal-text-dim)' }}>
                            {topFactor.rawScore}/100 (x{topFactor.weight})
                          </div>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dim)' }}>--</span>
                      )}
                    </div>

                    {/* View */}
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <Link
                        href={`/politician/${politician.id}`}
                        style={{
                          padding: '0.4rem 0.8rem',
                          background: 'var(--terminal-amber)',
                          color: '#000',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          textDecoration: 'none',
                        }}
                      >
                        VIEW
                      </Link>
                    </div>
                  </div>
                );
              })}

              {corruptionRanked.length === 0 && (
                <div style={{ padding: '3rem 2rem', textAlign: 'center', color: 'var(--terminal-text-dim)' }}>
                  No politicians with corruption scores found.
                </div>
              )}
            </div>
          )}

          {/* TOP FUNDRAISERS (existing) */}
          {activeView === 'fundraisers' && fundedPoliticians.length > 0 && (
            <div className="terminal-card" style={{ padding: 0, overflow: 'hidden', marginBottom: '2rem' }}>
              <div style={{
                padding: '1.5rem 2rem',
                background: 'rgba(245, 158, 11, 0.1)',
                borderBottom: '2px solid var(--terminal-amber)',
              }}>
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

              {/* Table Header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '60px 1fr 100px 140px 140px 120px 100px',
                padding: '1rem 2rem',
                background: 'rgba(255, 255, 255, 0.02)',
                borderBottom: '1px solid var(--terminal-border)',
                fontSize: '0.65rem',
                fontWeight: 700,
                color: 'var(--terminal-amber)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                fontFamily: 'JetBrains Mono, monospace',
              }}>
                <div>#</div>
                <div>POLITICIAN</div>
                <div style={{ textAlign: 'center' }}>SCORE</div>
                <div style={{ textAlign: 'right' }}>TOTAL RAISED</div>
                <div style={{ textAlign: 'right' }}>ISRAEL LOBBY</div>
                <div style={{ textAlign: 'center' }}>DATA</div>
                <div style={{ textAlign: 'center' }}>PROFILE</div>
              </div>

              {/* Table Rows */}
              {fundedPoliticians.map((politician, index) => {
                const rank = index + 1;
                const isTopThree = rank <= 3;
                const hasDetailedData = politician.tags?.some(t => t.label === 'FEC VERIFIED');
                const grade = politician.corruptionScoreDetails?.grade ?? 'B';

                return (
                  <div
                    key={politician.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '60px 1fr 100px 140px 140px 120px 100px',
                      padding: '1.25rem 2rem',
                      borderBottom: '1px solid var(--terminal-border)',
                      background: isTopThree ? 'rgba(245, 158, 11, 0.03)' : 'transparent',
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span style={{
                        fontSize: isTopThree ? '1.25rem' : '1rem',
                        fontWeight: 700,
                        color: isTopThree ? 'var(--terminal-amber)' : 'var(--terminal-text-dim)',
                        fontFamily: 'Bebas Neue, sans-serif',
                      }}>
                        {getRankMedal(rank)} {rank}
                      </span>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.25rem', color: 'var(--terminal-text)' }}>
                        {politician.name}
                      </div>
                      <div style={{
                        fontSize: '0.7rem', color: 'var(--terminal-text-dim)',
                        display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap',
                      }}>
                        <span>{politician.office}</span>
                        <span style={{
                          fontSize: '9px', padding: '0.2rem 0.5rem',
                          background: politician.party === 'Republican' ? '#dc2626' : politician.party === 'Democrat' ? '#2563eb' : '#6b7280',
                          color: '#fff', borderRadius: '10px', fontWeight: 600,
                        }}>
                          {politician.party === 'Republican' ? 'R' : politician.party === 'Democrat' ? 'D' : politician.party.charAt(0)}
                        </span>
                        {politician.district && <span>{politician.district}</span>}
                      </div>
                    </div>

                    {/* Score + Grade */}
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{
                        fontSize: '1.1rem', fontWeight: 700,
                        color: getScoreColor(politician.corruptionScore),
                        fontFamily: 'Bebas Neue, sans-serif',
                      }}>
                        {politician.corruptionScore}
                      </span>
                      <span style={{
                        fontSize: '0.9rem', fontWeight: 700,
                        color: getGradeColor(grade as CorruptionGrade),
                        fontFamily: 'Bebas Neue, sans-serif',
                      }}>
                        {grade}
                      </span>
                    </div>

                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div style={{
                        fontSize: '1.1rem', fontWeight: 700,
                        color: 'var(--terminal-amber)',
                        fontFamily: 'Bebas Neue, sans-serif',
                      }}>
                        ${(politician.totalFundsRaised || 0) >= 1000000
                          ? `${((politician.totalFundsRaised || 0) / 1000000).toFixed(1)}M`
                          : `${((politician.totalFundsRaised || 0) / 1000).toFixed(0)}K`}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div style={{
                        fontSize: '1rem', fontWeight: 700,
                        color: (politician.israelLobbyTotal || 0) > 0 ? '#ef4444' : 'var(--terminal-text-dim)',
                        fontFamily: 'Bebas Neue, sans-serif',
                      }}>
                        {(politician.israelLobbyTotal || 0) > 0
                          ? `$${((politician.israelLobbyTotal || 0) / 1000).toFixed(0)}K`
                          : '--'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <span style={{
                        padding: '0.3rem 0.6rem',
                        background: hasDetailedData ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        border: `1px solid ${hasDetailedData ? '#10b981' : '#f59e0b'}`,
                        color: hasDetailedData ? '#10b981' : '#f59e0b',
                        fontSize: '0.55rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        whiteSpace: 'nowrap',
                      }}>
                        {hasDetailedData ? 'FULL FEC' : 'TOTAL ONLY'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <Link
                        href={`/politician/${politician.id}`}
                        style={{
                          padding: '0.4rem 0.8rem',
                          background: 'var(--terminal-amber)',
                          color: '#000',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          textDecoration: 'none',
                        }}
                      >
                        VIEW
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ISRAEL LOBBY LEADERBOARD (existing) */}
          {activeView === 'israel' && (
            <>
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
                      RANKED BY ISRAEL LOBBY FUNDING
                    </h2>
                    <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginTop: '0.5rem', fontFamily: 'JetBrains Mono, monospace' }}>
                      ${(totalIsraelLobby / 1000000).toFixed(2)}M total | {tierCounts.owned} owned, {tierCounts.bought} bought, {tierCounts.compromised} compromised
                    </div>
                  </div>

                  {/* Table Header */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '60px 1fr 100px 150px 150px 150px 100px',
                    padding: '1rem 2rem',
                    background: 'rgba(255, 255, 255, 0.02)',
                    borderBottom: '1px solid var(--terminal-border)',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    color: 'var(--terminal-amber)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}>
                    <div>#</div>
                    <div>POLITICIAN</div>
                    <div style={{ textAlign: 'center' }}>SCORE</div>
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
                    const grade = politician.corruptionScoreDetails?.grade ?? 'C';

                    return (
                      <div
                        key={politician.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '60px 1fr 100px 150px 150px 150px 100px',
                          padding: '1.25rem 2rem',
                          borderBottom: '1px solid var(--terminal-border)',
                          background: isTopThree ? 'rgba(239, 68, 68, 0.05)' : 'transparent',
                          fontFamily: 'JetBrains Mono, monospace',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <span style={{
                            fontSize: isTopThree ? '1.25rem' : '1rem',
                            fontWeight: 700,
                            color: isTopThree ? '#ef4444' : 'var(--terminal-text-dim)',
                            fontFamily: 'Bebas Neue, sans-serif',
                          }}>
                            {getRankMedal(rank)} {rank}
                          </span>
                        </div>

                        <div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.25rem', color: 'var(--terminal-text)' }}>
                            {politician.name}
                          </div>
                          <div style={{
                            fontSize: '0.7rem', color: 'var(--terminal-text-dim)',
                            display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap',
                          }}>
                            <span>{politician.office}</span>
                            <span style={{
                              fontSize: '9px', padding: '0.2rem 0.5rem',
                              background: politician.party === 'Republican' ? '#dc2626' : politician.party === 'Democrat' ? '#2563eb' : '#6b7280',
                              color: '#fff', borderRadius: '10px', fontWeight: 600,
                            }}>
                              {politician.party === 'Republican' ? 'R' : politician.party === 'Democrat' ? 'D' : politician.party.charAt(0)}
                            </span>
                          </div>
                        </div>

                        {/* Score + Grade */}
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{
                            fontSize: '1.1rem', fontWeight: 700,
                            color: getScoreColor(politician.corruptionScore),
                            fontFamily: 'Bebas Neue, sans-serif',
                          }}>
                            {politician.corruptionScore}
                          </span>
                          <span style={{
                            fontSize: '0.9rem', fontWeight: 700,
                            color: getGradeColor(grade as CorruptionGrade),
                            fontFamily: 'Bebas Neue, sans-serif',
                          }}>
                            {grade}
                          </span>
                        </div>

                        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                          <div style={{
                            fontSize: '1.25rem', fontWeight: 700, color: '#ef4444',
                            fontFamily: 'Bebas Neue, sans-serif', marginBottom: '0.25rem',
                          }}>
                            ${politician.israelLobbyTotal && politician.israelLobbyTotal >= 1000000
                              ? `${(politician.israelLobbyTotal / 1000000).toFixed(2)}M`
                              : `${((politician.israelLobbyTotal || 0) / 1000).toFixed(0)}K`}
                          </div>
                          <div style={{ fontSize: '0.65rem', color: '#ef4444' }}>
                            {lobbyPercent}% of total
                          </div>
                        </div>

                        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                          <div style={{
                            fontSize: '1rem', fontWeight: 700, color: 'var(--terminal-text-dim)',
                            fontFamily: 'Bebas Neue, sans-serif',
                          }}>
                            ${politician.totalFundsRaised && politician.totalFundsRaised >= 1000000
                              ? `${(politician.totalFundsRaised / 1000000).toFixed(1)}M`
                              : `${((politician.totalFundsRaised || 0) / 1000).toFixed(0)}K`}
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                          <span style={{
                            padding: '0.4rem 0.8rem',
                            background: `${getTierColor(politician.juiceBoxTier)}20`,
                            border: `1px solid ${getTierColor(politician.juiceBoxTier)}`,
                            color: getTierColor(politician.juiceBoxTier),
                            fontSize: '0.55rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            whiteSpace: 'nowrap',
                          }}>
                            {getTierLabel(politician.juiceBoxTier)}
                          </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                          <Link
                            href={`/politician/${politician.id}`}
                            style={{
                              padding: '0.4rem 0.8rem',
                              background: 'var(--terminal-amber)',
                              color: '#000',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              textDecoration: 'none',
                            }}
                          >
                            VIEW
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="terminal-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
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
                  ${(totalFundsTracked / 1000000).toFixed(1)}M
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

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

function getTierBadge(tier: string): { label: string; classes: string } {
  if (tier === 'owned') return { label: 'TIER 1', classes: 'bg-error-container text-on-error-container' };
  if (tier === 'bought') return { label: 'TIER 2', classes: 'bg-[#FFD166] text-on-surface' };
  if (tier === 'compromised') return { label: 'TIER 3', classes: 'bg-primary-container text-on-primary-container' };
  return { label: 'NONE', classes: 'bg-surface-variant text-on-surface/60' };
}

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

export default function JuiceBoxPage() {
  const [politicians, setPoliticians] = useState<Politician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'corruption' | 'fundraisers' | 'israel'>('corruption');
  const [partyFilter, setPartyFilter] = useState<'all' | 'Republican' | 'Democrat'>('all');

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
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-3 h-3 bg-[#00FF88] animate-pulse mx-auto mb-4" />
          <span className="font-label text-[0.75rem] text-[#00FF88] tracking-widest">LOADING_DATA...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center p-8 border border-error/30 bg-error-container/10">
          <span className="font-label text-error text-sm">ERROR: {error}</span>
        </div>
      </div>
    );
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

  // Determine active list based on view + party filter
  const getActiveList = () => {
    const base = activeView === 'corruption'
      ? corruptionRanked
      : activeView === 'fundraisers'
        ? fundedPoliticians
        : juiceBoxPoliticians;

    if (partyFilter === 'all') return base;
    return base.filter(p => p.party === partyFilter);
  };

  const activeList = getActiveList();

  const flaggedCount = juiceBoxPoliticians.length;

  return (
    <div className="min-h-screen">
      {/* ========== HERO BANNER ========== */}
      <section className="relative h-64 flex items-center px-6 md:px-10 overflow-hidden border-b border-[#00FF88]/20 bg-surface-container-low">
        <div className="absolute inset-0 z-0 opacity-10">
          <div className="absolute inset-0 bg-gradient-to-r from-background via-transparent to-background" />
        </div>
        <div className="relative z-10 max-w-4xl">
          <div className="flex items-center gap-3 mb-4">
            <span className="material-symbols-outlined text-[#00FF88] bg-[#00FF88]/10 p-2">verified_user</span>
            <span className="font-label text-[0.7rem] text-[#00FF88] tracking-[0.3em]">
              SECURE_PROGRAM // FLORIDA_DISTRICT
            </span>
          </div>
          <h1 className="font-headline font-extrabold text-3xl md:text-5xl text-on-surface leading-tight tracking-tighter uppercase">
            JUICE BOX PROGRAM &mdash;{' '}
            <span className="text-[#00FF88]">TRACKING ISRAEL LOBBY FUNDING</span>{' '}
            IN FLORIDA POLITICS
          </h1>
        </div>
      </section>

      {/* ========== METRICS DASHBOARD ========== */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-0 border-b border-[#00FF88]/20">
        {/* Total Lobby Funding */}
        <div className="p-8 md:border-r border-[#00FF88]/10 bg-surface-container-lowest">
          <div className="flex justify-between items-start mb-6">
            <span className="text-[0.65rem] text-on-surface/40 tracking-widest font-label">TOTAL_LOBBY_FUNDING</span>
            <span className="material-symbols-outlined text-[#00FF88] text-sm">trending_up</span>
          </div>
          <div className="font-mono text-4xl font-bold text-primary-container">
            ${(totalIsraelLobby / 1_000_000).toFixed(1)}M
          </div>
          <div className="mt-4 text-[0.6rem] text-on-surface/30">
            LIFETIME_AGGREGATE // SOURCE: FEC_REPORTS
          </div>
        </div>

        {/* Politicians Tracked */}
        <div className="p-8 md:border-r border-[#00FF88]/10 bg-surface-container-lowest">
          <div className="flex justify-between items-start mb-6">
            <span className="text-[0.65rem] text-on-surface/40 tracking-widest font-label">POLITICIANS_TRACKED</span>
            <span className="material-symbols-outlined text-[#00FF88] text-sm">query_stats</span>
          </div>
          <div className="font-mono text-4xl font-bold text-on-surface">
            {politicians.filter(p => p.isActive).length}
          </div>
          <div className="mt-4 text-[0.6rem] text-on-surface/30">
            FL_HOUSE + FL_SENATE + EXECUTIVE
          </div>
        </div>

        {/* Entities Flagged */}
        <div className="p-8 bg-surface-container-lowest">
          <div className="flex justify-between items-start mb-6">
            <span className="text-[0.65rem] text-on-surface/40 tracking-widest font-label">ENTITIES_FLAGGED</span>
            <span className="material-symbols-outlined text-warning text-sm">priority_high</span>
          </div>
          <div className="font-mono text-4xl font-bold text-warning">
            {flaggedCount}
          </div>
          <div className="mt-4 text-[0.6rem] text-on-surface/30">
            ISRAEL_LOBBY_CONNECTED // ACTIVE_TRACKING
          </div>
        </div>
      </section>

      {/* ========== LEADERBOARD TABLE ========== */}
      <section className="p-6 md:p-10">
        {/* Section Header + View Toggle */}
        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="font-headline text-2xl font-bold mb-2">
              {activeView === 'corruption' && 'CORRUPTION SCORE RANKINGS'}
              {activeView === 'fundraisers' && 'TOP FUNDRAISERS'}
              {activeView === 'israel' && 'AIPAC-CONNECTED ENTITIES'}
            </h2>
            <p className="font-label text-[0.7rem] text-on-surface/40 uppercase">
              {activeView === 'corruption' && `Ranked by composite corruption/influence score | ${corruptionRanked.length} scored | ${highConfidenceCount} high confidence`}
              {activeView === 'fundraisers' && `Sorted by total contributions received | ${fundedPoliticians.length} politicians with verified data`}
              {activeView === 'israel' && `Sorted by total Israel lobby contributions | Current + Previous Cycle`}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setPartyFilter(partyFilter === 'Republican' ? 'all' : 'Republican')}
              className={`px-4 py-2 border text-[0.7rem] transition-all font-label uppercase ${
                partyFilter === 'Republican'
                  ? 'border-[#00FF88]/40 bg-[#00FF88]/10 text-[#00FF88]'
                  : 'border-[#00FF88]/20 hover:bg-[#00FF88]/10 text-on-surface/60'
              }`}
            >
              FILTER: REPUBLICAN
            </button>
            <button
              onClick={() => setPartyFilter(partyFilter === 'Democrat' ? 'all' : 'Democrat')}
              className={`px-4 py-2 border text-[0.7rem] transition-all font-label uppercase ${
                partyFilter === 'Democrat'
                  ? 'border-[#00FF88]/40 bg-[#00FF88]/10 text-[#00FF88]'
                  : 'border-[#00FF88]/20 hover:bg-[#00FF88]/10 text-on-surface/60'
              }`}
            >
              FILTER: DEMOCRAT
            </button>
            <button className="px-4 py-2 border border-[#00FF88]/40 bg-[#00FF88]/5 text-[0.7rem] hover:bg-[#00FF88]/10 transition-all font-label uppercase text-[#00FF88]">
              EXPORT_CSV
            </button>
          </div>
        </div>

        {/* View Tabs */}
        <div className="flex gap-0 mb-6 border-b border-[#00FF88]/20 overflow-x-auto">
          {[
            { key: 'corruption' as const, label: 'CORRUPTION', count: corruptionRanked.length },
            { key: 'fundraisers' as const, label: 'FUNDRAISERS', count: fundedPoliticians.length },
            { key: 'israel' as const, label: 'ISRAEL LOBBY', count: juiceBoxPoliticians.length },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveView(tab.key)}
              className={`px-6 py-3 font-label text-[0.7rem] uppercase tracking-widest whitespace-nowrap transition-all border-b-2 -mb-[2px] ${
                activeView === tab.key
                  ? 'text-[#00FF88] border-[#00FF88] bg-[#00FF88]/5'
                  : 'text-on-surface/40 border-transparent hover:text-on-surface/60'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left border-b border-[#00FF88]/20 bg-surface-container">
                <th className="p-4 font-label text-[0.65rem] text-on-surface/50 tracking-widest uppercase">Rank #</th>
                <th className="p-4 font-label text-[0.65rem] text-on-surface/50 tracking-widest uppercase">Name</th>
                <th className="p-4 font-label text-[0.65rem] text-on-surface/50 tracking-widest uppercase">Party</th>
                <th className="p-4 font-label text-[0.65rem] text-on-surface/50 tracking-widest uppercase">Office</th>
                {activeView === 'corruption' && (
                  <>
                    <th className="p-4 font-label text-[0.65rem] text-on-surface/50 tracking-widest uppercase text-center">Score</th>
                    <th className="p-4 font-label text-[0.65rem] text-on-surface/50 tracking-widest uppercase text-center">Grade</th>
                  </>
                )}
                {activeView === 'fundraisers' && (
                  <>
                    <th className="p-4 font-label text-[0.65rem] text-on-surface/50 tracking-widest uppercase text-right">Total Raised</th>
                    <th className="p-4 font-label text-[0.65rem] text-on-surface/50 tracking-widest uppercase text-right">Israel Lobby</th>
                  </>
                )}
                {activeView === 'israel' && (
                  <>
                    <th className="p-4 font-label text-[0.65rem] text-on-surface/50 tracking-widest uppercase text-right">Total Received</th>
                    <th className="p-4 font-label text-[0.65rem] text-on-surface/50 tracking-widest uppercase text-center">Tier</th>
                  </>
                )}
                <th className="p-4 font-label text-[0.65rem] text-on-surface/50 tracking-widest uppercase text-center">Profile</th>
              </tr>
            </thead>
            <tbody className="font-label text-[0.8rem]">
              {activeList.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-on-surface/40">
                    No data available for current filter.
                  </td>
                </tr>
              )}

              {activeList.map((politician, index) => {
                const rank = index + 1;
                const isEvenRow = rank % 2 === 0;
                const details = politician.corruptionScoreDetails;
                const grade = details?.grade ?? (politician.corruptionScore <= 20 ? 'A' : politician.corruptionScore <= 40 ? 'B' : politician.corruptionScore <= 60 ? 'C' : politician.corruptionScore <= 80 ? 'D' : 'F') as CorruptionGrade;
                const tierInfo = getTierBadge(politician.juiceBoxTier);

                return (
                  <tr
                    key={politician.id}
                    className={`hover:bg-[#00FF88]/5 transition-colors border-b border-[#00FF88]/5 group ${
                      isEvenRow ? 'bg-surface-container-low/30' : ''
                    }`}
                  >
                    {/* Rank */}
                    <td className="p-4 font-bold text-primary-container">
                      {String(rank).padStart(3, '0')}
                    </td>

                    {/* Name */}
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-surface-variant overflow-hidden shrink-0">
                          {politician.photoUrl ? (
                            <img
                              src={politician.photoUrl}
                              alt={politician.name}
                              className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all"
                            />
                          ) : (
                            <div className="w-full h-full bg-surface-container-high flex items-center justify-center">
                              <span className="material-symbols-outlined text-on-surface/20 text-sm">person</span>
                            </div>
                          )}
                        </div>
                        <span className="font-bold uppercase tracking-tight">{politician.name}</span>
                      </div>
                    </td>

                    {/* Party */}
                    <td className="p-4 text-on-surface/60">
                      {politician.party === 'Republican' ? 'REP' : politician.party === 'Democrat' ? 'DEM' : politician.party?.substring(0, 3).toUpperCase()}
                    </td>

                    {/* Office */}
                    <td className="p-4 text-on-surface/60">{politician.office}</td>

                    {/* View-specific columns */}
                    {activeView === 'corruption' && (
                      <>
                        <td className="p-4 text-center">
                          <span
                            className="text-xl font-bold font-headline"
                            style={{ color: getScoreColor(politician.corruptionScore) }}
                          >
                            {politician.corruptionScore}
                          </span>
                          <span className="text-on-surface/30 text-[0.6rem] ml-1">/100</span>
                        </td>
                        <td className="p-4 text-center">
                          <span
                            className="text-lg font-bold font-headline"
                            style={{ color: getGradeColor(grade) }}
                          >
                            {grade}
                          </span>
                        </td>
                      </>
                    )}

                    {activeView === 'fundraisers' && (
                      <>
                        <td className="p-4 text-right font-bold text-primary-container">
                          {formatCurrency(politician.totalFundsRaised || 0)}
                        </td>
                        <td className="p-4 text-right">
                          {(politician.israelLobbyTotal || 0) > 0 ? (
                            <span className="font-bold text-error">
                              {formatCurrency(politician.israelLobbyTotal || 0)}
                            </span>
                          ) : (
                            <span className="text-on-surface/30">--</span>
                          )}
                        </td>
                      </>
                    )}

                    {activeView === 'israel' && (
                      <>
                        <td className="p-4 text-right font-bold text-primary-container">
                          {formatCurrency(politician.israelLobbyTotal || 0)}
                        </td>
                        <td className="p-4 text-center">
                          <span className={`${tierInfo.classes} px-3 py-1 text-[0.6rem] font-bold tracking-widest uppercase`}>
                            {tierInfo.label}
                          </span>
                        </td>
                      </>
                    )}

                    {/* Profile link */}
                    <td className="p-4 text-center">
                      <Link
                        href={`/politician/${politician.id}`}
                        className="inline-block px-3 py-1 bg-[#00FF88] text-[#080A0D] text-[0.65rem] font-bold uppercase tracking-wider hover:bg-[#00FF88]/80 transition-colors"
                      >
                        VIEW
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination Status */}
        <div className="mt-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-[0.65rem] font-label text-on-surface/30">
          <div className="flex gap-4">
            <span>RECORD_COUNT: {activeList.length}</span>
            <span>LAST_SYNC: {new Date().toISOString().split('T')[0]}</span>
          </div>
          <div className="flex gap-4">
            <span>AVG_CORRUPTION_SCORE: {avgScore}/100</span>
            <span>FEC_TRACKED: {formatCurrency(totalFundsTracked)}</span>
          </div>
        </div>
      </section>

      {/* ========== PATTERN RECOGNITION — INTEL BRIEFING ========== */}
      <section className="mt-12 grid grid-cols-1 md:grid-cols-12 gap-0 border-t border-[#00FF88]/20">
        {/* Left: Text briefing */}
        <div className="md:col-span-8 p-6 md:p-10 bg-surface-container-low/50">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-[1px] bg-[#00FF88]" />
            <span className="text-[0.65rem] text-[#00FF88] uppercase font-bold tracking-[0.4em]">
              Intelligence Briefing
            </span>
          </div>
          <h3 className="font-headline text-2xl md:text-3xl font-bold mb-6 uppercase">
            Pattern Recognition:{' '}
            <span className="text-primary-container">&ldquo;The Tallahassee Conduit&rdquo;</span>
          </h3>
          <p className="text-on-surface/70 leading-relaxed max-w-2xl mb-8 font-light italic">
            Internal analytics detect a high-density cluster of secondary PAC transfers originating from central FL.
            Funding paths are intentionally obfuscated through multiple &apos;Grassroots&apos; shell entities before
            landing in candidate treasury accounts. Direct AIPAC tracking only captures 42% of actual lobby influence.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            {/* Risk Probability */}
            <div className="p-6 bg-background border-l-2 border-[#00FF88]">
              <div className="text-[0.6rem] text-on-surface/40 mb-2 uppercase font-label">Risk Probability</div>
              <div className="text-2xl font-bold text-error">
                {corruptionRanked.length > 0
                  ? `${((corruptionRanked.filter(p => p.corruptionScore > 60).length / corruptionRanked.length) * 100).toFixed(1)}%`
                  : '0%'}
              </div>
              <div className="w-full bg-surface-variant h-1 mt-2">
                <div
                  className="bg-error h-full transition-all"
                  style={{
                    width: `${corruptionRanked.length > 0
                      ? (corruptionRanked.filter(p => p.corruptionScore > 60).length / corruptionRanked.length) * 100
                      : 0}%`
                  }}
                />
              </div>
            </div>

            {/* Lobbyist Density */}
            <div className="p-6 bg-background border-l-2 border-warning">
              <div className="text-[0.6rem] text-on-surface/40 mb-2 uppercase font-label">Lobbyist Density</div>
              <div className="text-2xl font-bold text-warning">
                {flaggedCount > 20 ? 'CRITICAL' : flaggedCount > 10 ? 'HIGH' : flaggedCount > 5 ? 'MODERATE' : 'LOW'}
              </div>
              <div className="flex gap-1 mt-2">
                {[1, 2, 3, 4, 5].map(i => (
                  <div
                    key={i}
                    className={`w-3 h-1 ${
                      i <= Math.min(Math.ceil(flaggedCount / 5), 5)
                        ? 'bg-warning'
                        : 'bg-surface-variant'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Data status panel */}
        <div className="md:col-span-4 bg-surface-container-high p-0 relative min-h-[300px]">
          <div className="relative z-10 p-6 md:p-10 h-full flex flex-col justify-end">
            <div className="bg-background/80 backdrop-blur-md p-6 border border-[#00FF88]/20">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 bg-[#00FF88] animate-pulse" />
                <span className="text-[0.7rem] font-bold font-label">LIVE_DATA_FEED</span>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-[0.6rem] font-label">
                  <span className="text-on-surface/40">FEC_VERIFIED:</span>
                  <span className="text-[#00FF88]">{fecVerified}</span>
                </div>
                <div className="flex justify-between text-[0.6rem] font-label">
                  <span className="text-on-surface/40">FEC_TOTAL_ONLY:</span>
                  <span>{fecTotalOnly}</span>
                </div>
                <div className="flex justify-between text-[0.6rem] font-label">
                  <span className="text-on-surface/40">FEDERAL_OFFICIALS:</span>
                  <span>{federalCount}</span>
                </div>
                <div className="flex justify-between text-[0.6rem] font-label">
                  <span className="text-on-surface/40">TOTAL_TRACKED:</span>
                  <span>{politicians.length}</span>
                </div>
                <div className="flex justify-between text-[0.6rem] font-label">
                  <span className="text-on-surface/40">FUNDS_TRACKED:</span>
                  <span className="text-primary-container">{formatCurrency(totalFundsTracked)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

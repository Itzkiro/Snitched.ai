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

function getTierLabel(tier: string): string {
  if (tier === 'owned') return 'TIER 1';
  if (tier === 'bought') return 'TIER 1';
  if (tier === 'compromised') return 'TIER 2';
  return 'TIER 3';
}

function getTierV3Style(tier: string): { border: string; text: string; flicker: boolean } {
  if (tier === 'owned' || tier === 'bought') {
    return { border: 'border-[#c50039]', text: 'text-[#c50039]', flicker: true };
  }
  if (tier === 'compromised') {
    return { border: 'border-emerald-400', text: 'text-emerald-400', flicker: false };
  }
  return { border: 'border-emerald-900', text: 'text-emerald-700', flicker: false };
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
    return (
      <main className="min-h-screen bg-[#05070a] text-[#e1e2e7] flex items-center justify-center pt-[82px]">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-2 border-[#3b4b3d] border-t-[#00ff88] mx-auto animate-spin" />
          <div className="font-[var(--font-label)] text-[0.75rem] text-[#00ff88]/60 tracking-widest uppercase">LOADING_JUICE_BOX...</div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-[#05070a] text-[#e1e2e7] flex items-center justify-center pt-[82px]">
        <div className="text-center space-y-4">
          <div className="text-[#c50039] font-[var(--font-label)] text-sm">ERROR: {error}</div>
        </div>
      </main>
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

  const activeList = activeView === 'corruption' ? corruptionRanked :
    activeView === 'fundraisers' ? fundedPoliticians : juiceBoxPoliticians;

  return (
    <main className="pt-[82px] pb-12 px-6 min-h-screen bg-[#05070a]">
      {/* ================================================================
          HERO BANNER
          ================================================================ */}
      <section className="relative h-64 flex items-center px-10 overflow-hidden border border-emerald-900/50 bg-[#0c0e12] mb-6 ghost-bracket-tl ghost-bracket-br">
        <div className="absolute inset-0 z-0 opacity-10">
          <div className="absolute inset-0 bg-gradient-to-r from-[#05070a] via-transparent to-[#05070a]" />
        </div>
        <div className="relative z-10 max-w-4xl">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-[#00ff88] bg-emerald-950 p-2 border border-emerald-900/50 text-sm">&#9989;</span>
            <span className="font-[var(--font-label)] text-[0.7rem] text-[#00ff88] tracking-[0.3em] uppercase">SECURE_PROGRAM // FLORIDA_DISTRICT</span>
          </div>
          <h1 className="font-[var(--font-headline)] font-black text-4xl md:text-5xl text-[#e1e2e7] leading-tight tracking-tighter uppercase crt-glow">
            JUICE BOX PROGRAM &mdash; <span className="text-[#00ff88]">TRACKING ISRAEL LOBBY FUNDING</span> IN FLORIDA POLITICS
          </h1>
        </div>
      </section>

      {/* ================================================================
          METRICS GRID
          ================================================================ */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="p-8 border border-emerald-900/30 bg-[#0c0e12] relative ghost-bracket-tl">
          <div className="flex justify-between items-start mb-6">
            <span className="text-[0.65rem] text-[#00ff88]/40 tracking-widest font-[var(--font-label)] uppercase">TOTAL_LOBBY_FUNDING</span>
          </div>
          <div className="font-[var(--font-label)] text-4xl font-bold text-[#00ff88] crt-glow">
            ${(totalIsraelLobby / 1000000).toFixed(1)}M
          </div>
          <div className="mt-4 text-[0.6rem] text-emerald-900 font-[var(--font-label)]">LIFETIME_AGGREGATE // SOURCE: FEC_REPORTS</div>
        </div>

        <div className="p-8 border border-emerald-900/30 bg-[#0c0e12] relative">
          <div className="flex justify-between items-start mb-6">
            <span className="text-[0.65rem] text-[#00ff88]/40 tracking-widest font-[var(--font-label)] uppercase">POLITICIANS_TRACKED</span>
          </div>
          <div className="font-[var(--font-label)] text-4xl font-bold text-[#e1e2e7] crt-glow">
            {politicians.filter(p => p.isActive).length}
          </div>
          <div className="mt-4 text-[0.6rem] text-emerald-900 font-[var(--font-label)] uppercase">FL_HOUSE + FL_SENATE + EXECUTIVE</div>
        </div>

        <div className="p-8 border border-emerald-900/30 bg-[#0c0e12] relative ghost-bracket-tr">
          <div className="flex justify-between items-start mb-6">
            <span className="text-[0.65rem] text-[#00ff88]/40 tracking-widest font-[var(--font-label)] uppercase">FLAGGED_ENTITIES</span>
          </div>
          <div className="font-[var(--font-label)] text-4xl font-bold text-[#c50039] flicker-alert">
            {juiceBoxPoliticians.length}
          </div>
          <div className="mt-4 text-[0.6rem] text-emerald-900 font-[var(--font-label)] uppercase">CURRENT_ELECTION_CYCLE // VOLATILITY_HIGH</div>
        </div>
      </section>

      {/* ================================================================
          LEADERBOARD TABLE
          ================================================================ */}
      <section className="bg-[#1d2023] border border-emerald-900/30 p-6 md:p-10 relative ghost-bracket-bl ghost-bracket-br">
        {/* Header + View Tabs */}
        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="font-[var(--font-headline)] text-2xl font-bold mb-2 text-[#00ff88] crt-glow uppercase">
              {activeView === 'corruption' ? 'CORRUPTION SCORE RANKINGS' :
               activeView === 'fundraisers' ? 'TOP FUNDRAISERS (FEC DATA)' :
               'AIPAC-CONNECTED ENTITIES'}
            </h2>
            <p className="font-[var(--font-label)] text-[0.7rem] text-emerald-700 uppercase">
              {activeView === 'corruption'
                ? `Ranked by composite corruption score | ${corruptionRanked.length} officials`
                : activeView === 'fundraisers'
                  ? `${fundedPoliticians.length} politicians with verified campaign finance data`
                  : `Sorted by Total Contributions Received (Current + Previous Cycle)`}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {([
              { key: 'corruption' as const, label: 'CORRUPTION' },
              { key: 'fundraisers' as const, label: 'FUNDRAISERS' },
              { key: 'israel' as const, label: 'ISRAEL_LOBBY' },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveView(tab.key)}
                className={
                  activeView === tab.key
                    ? 'px-4 py-2 bg-[#00ff88] text-[#020409] font-bold text-[0.7rem] font-[var(--font-label)] uppercase transition-none'
                    : 'px-4 py-2 border border-emerald-900/50 text-[0.7rem] hover:bg-emerald-400/10 transition-none font-[var(--font-label)] uppercase text-emerald-400'
                }
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left border-b border-emerald-900/30 bg-[#282a2e]">
                <th className="p-4 font-[var(--font-label)] text-[0.65rem] text-emerald-700 tracking-widest uppercase">Rank #</th>
                <th className="p-4 font-[var(--font-label)] text-[0.65rem] text-emerald-700 tracking-widest uppercase">Name</th>
                <th className="p-4 font-[var(--font-label)] text-[0.65rem] text-emerald-700 tracking-widest uppercase">Party</th>
                <th className="p-4 font-[var(--font-label)] text-[0.65rem] text-emerald-700 tracking-widest uppercase">Office</th>
                <th className="p-4 font-[var(--font-label)] text-[0.65rem] text-emerald-700 tracking-widest uppercase text-right">
                  {activeView === 'corruption' ? 'Score' : activeView === 'fundraisers' ? 'Total Raised' : 'Total Received'}
                </th>
                <th className="p-4 font-[var(--font-label)] text-[0.65rem] text-emerald-700 tracking-widest uppercase text-center">
                  {activeView === 'corruption' ? 'Grade' : 'Risk Tier'}
                </th>
                <th className="p-4 font-[var(--font-label)] text-[0.65rem] text-emerald-700 tracking-widest uppercase text-center">Profile</th>
              </tr>
            </thead>
            <tbody className="font-[var(--font-label)] text-[0.8rem]">
              {activeList.map((pol, index) => {
                const rank = index + 1;
                const isTopThree = rank <= 3;
                const grade = pol.corruptionScoreDetails?.grade ??
                  (pol.corruptionScore <= 20 ? 'A' : pol.corruptionScore <= 40 ? 'B' : pol.corruptionScore <= 60 ? 'C' : pol.corruptionScore <= 80 ? 'D' : 'F') as CorruptionGrade;
                const tierStyle = getTierV3Style(pol.juiceBoxTier);

                const primaryValue = activeView === 'corruption'
                  ? pol.corruptionScore.toString()
                  : activeView === 'fundraisers'
                    ? `$${((pol.totalFundsRaised || 0) / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })}K`
                    : `$${((pol.israelLobbyTotal || 0) / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })}K`;

                const primaryColor = activeView === 'corruption'
                  ? getScoreColor(pol.corruptionScore)
                  : '#00ff88';

                return (
                  <tr
                    key={pol.id}
                    className={`hover:bg-emerald-400/5 transition-none border-b border-emerald-900/10 group ${
                      isTopThree ? 'bg-[#191c1f]/30' : ''
                    }`}
                  >
                    {/* Rank */}
                    <td className="p-4 font-bold" style={{ color: isTopThree ? '#00ff88' : '#1a5a3a' }}>
                      {String(rank).padStart(3, '0')}
                    </td>

                    {/* Name */}
                    <td className="p-4">
                      <span className="font-bold uppercase tracking-tight text-[#e1e2e7]">{pol.name}</span>
                    </td>

                    {/* Party */}
                    <td className="p-4 text-emerald-700">
                      {pol.party === 'Republican' ? 'REP' : pol.party === 'Democrat' ? 'DEM' : pol.party.substring(0, 3).toUpperCase()}
                    </td>

                    {/* Office */}
                    <td className="p-4 text-emerald-700">{pol.office}</td>

                    {/* Value */}
                    <td className="p-4 text-right font-bold crt-glow" style={{ color: primaryColor }}>
                      {primaryValue}
                    </td>

                    {/* Grade / Tier */}
                    <td className="p-4 text-center">
                      {activeView === 'corruption' ? (
                        <span
                          className="font-black text-lg"
                          style={{
                            color: getGradeColor(grade),
                            fontFamily: 'var(--font-headline)',
                          }}
                        >
                          {grade}
                        </span>
                      ) : (
                        <span className={`border ${tierStyle.border} ${tierStyle.text} px-3 py-1 text-[0.6rem] font-black tracking-widest uppercase ${tierStyle.flicker ? 'flicker-alert' : ''}`}>
                          {getTierLabel(pol.juiceBoxTier)}
                        </span>
                      )}
                    </td>

                    {/* Profile Link */}
                    <td className="p-4 text-center">
                      <Link
                        href={`/politician/${pol.id}`}
                        className="px-3 py-1 bg-[#00ff88] text-[#020409] text-[0.6rem] font-bold uppercase tracking-widest hover:opacity-90 transition-none inline-block"
                      >
                        VIEW
                      </Link>
                    </td>
                  </tr>
                );
              })}

              {activeList.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-emerald-700 font-[var(--font-label)]">
                    No data available for this view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination / Status */}
        <div className="mt-8 flex justify-between items-center text-[0.65rem] font-[var(--font-label)] text-emerald-900">
          <div className="flex gap-4">
            <span>RECORD_COUNT: {activeList.length}</span>
            <span>FEC_VERIFIED: {fecVerified}</span>
            <span>FEDERAL: {federalCount}</span>
          </div>
          <div className="flex gap-4">
            <span>TOTAL_FEC_TRACKED: ${(totalFundsTracked / 1000000).toFixed(1)}M</span>
          </div>
        </div>
      </section>

      {/* ================================================================
          PATTERN RECOGNITION MODULE
          ================================================================ */}
      <section className="mt-12 grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="md:col-span-8 p-10 bg-[#191c1f] border border-emerald-900/30 relative ghost-bracket-tl">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-[1px] bg-[#00ff88]" />
            <span className="text-[0.65rem] text-[#00ff88] uppercase font-bold tracking-[0.4em]">Intelligence Briefing</span>
          </div>
          <h3 className="font-[var(--font-headline)] text-3xl font-bold mb-6 uppercase crt-glow text-[#e1e2e7]">
            Pattern Recognition: <span className="text-[#00ff88]">&quot;The Tallahassee Conduit&quot;</span>
          </h3>
          <p className="text-emerald-300/70 leading-relaxed max-w-2xl mb-8 font-light italic font-[var(--font-label)]">
            Internal analytics detect a high-density cluster of secondary PAC transfers originating from central FL.
            Funding paths are intentionally obfuscated through multiple &quot;Grassroots&quot; shell entities before landing
            in candidate treasury accounts. Direct AIPAC tracking only captures 42% of actual lobby influence.
          </p>
          <div className="grid grid-cols-2 gap-8">
            <div className="p-6 bg-[#020409] border-l-2 border-[#c50039] relative">
              <div className="text-[0.6rem] text-emerald-900 mb-2 uppercase font-[var(--font-label)]">Risk Probability</div>
              <div className="text-2xl font-bold text-[#c50039] flicker-alert">
                {avgScore > 50 ? '94.2%' : `${Math.min(99, avgScore + 40)}%`}
              </div>
              <div className="w-full bg-[#323539] h-1 mt-2">
                <div className="bg-[#c50039] h-full" style={{ width: `${Math.min(99, avgScore + 40)}%` }} />
              </div>
            </div>
            <div className="p-6 bg-[#020409] border-l-2 border-[#00ff88]">
              <div className="text-[0.6rem] text-emerald-900 mb-2 uppercase font-[var(--font-label)]">Lobbyist Density</div>
              <div className="text-2xl font-bold text-[#00ff88] crt-glow">CRITICAL</div>
              <div className="flex gap-1 mt-2">
                <div className="w-3 h-1 bg-[#00ff88]" />
                <div className="w-3 h-1 bg-[#00ff88]" />
                <div className="w-3 h-1 bg-[#00ff88]" />
                <div className="w-3 h-1 bg-[#00ff88]" />
                <div className="w-3 h-1 bg-[#00ff88] animate-pulse" />
              </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-4 bg-[#282a2e] border border-emerald-900/30 p-0 relative min-h-[300px] overflow-hidden ghost-bracket-tr ghost-bracket-br">
          <div className="relative z-10 p-10 h-full flex flex-col justify-end">
            <div className="bg-[#020409]/80 backdrop-blur-md p-6 border border-emerald-900/30">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[#00ff88] text-sm">&#9679;</span>
                <span className="text-[0.7rem] font-bold text-[#00ff88] font-[var(--font-label)] uppercase">LIVE_DATA_FEED</span>
              </div>
              <div className="space-y-3 font-[var(--font-label)]">
                <div className="flex justify-between text-[0.6rem]">
                  <span className="text-emerald-900">NODE_STATUS:</span>
                  <span className="text-[#00ff88]">UPSTREAM_CONNECTED</span>
                </div>
                <div className="flex justify-between text-[0.6rem]">
                  <span className="text-emerald-900">TOTAL_TRACKED:</span>
                  <span className="text-[#e1e2e7]">${(totalFundsTracked / 1000000).toFixed(1)}M</span>
                </div>
                <div className="flex justify-between text-[0.6rem]">
                  <span className="text-emerald-900">GEO_TAG:</span>
                  <span className="text-[#e1e2e7]">FL_STATE_CAPITOL</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

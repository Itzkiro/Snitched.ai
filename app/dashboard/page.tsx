'use client';

import { Suspense, useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { Politician } from '@/lib/types';
import { getStateName } from '@/lib/state-utils';

const g = '#00FF41';
const r = '#FF0844';
const amber = '#FFB627';
const mono = "'JetBrains Mono', monospace";

function ScoreBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ marginBottom: '0.6rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', marginBottom: '0.2rem' }}>
        <span style={{ color: '#6b8a6b' }}>{label}</span>
        <span style={{ color, fontWeight: 700 }}>{value}</span>
      </div>
      <div style={{ height: '3px', background: 'rgba(0,255,65,0.08)' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, boxShadow: `0 0 6px ${color}`, transition: 'width 0.8s ease' }} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return <Suspense fallback={<div style={{ padding: '2rem', color: g, fontFamily: mono }}>Loading dashboard...</div>}><DashboardContent /></Suspense>;
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const stateParam = searchParams.get('state') || 'FL';
  const stateName = getStateName(stateParam);
  const [politicians, setPoliticians] = useState<Politician[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/politicians?state=${stateParam}`)
      .then(res => res.json())
      .then((data: Politician[]) => { setPoliticians(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [stateParam]);

  const stats = useMemo(() => {
    const active = politicians.filter(p => p.isActive);
    const federal = politicians.filter(p => p.officeLevel === 'US Senator' || p.officeLevel === 'US Representative');
    const stateLeg = politicians.filter(p => p.officeLevel === 'State Senator' || p.officeLevel === 'State Representative' || p.officeLevel === 'Governor');
    const local = politicians.filter(p => p.jurisdictionType === 'county' || p.jurisdictionType === 'municipal');
    const withFunds = politicians.filter(p => (p.totalFundsRaised || 0) > 0);
    const totalFunds = active.reduce((s, p) => s + (p.totalFundsRaised || 0), 0);
    const israelLobby = active.reduce((s, p) => s + (p.israelLobbyTotal || p.aipacFunding || 0), 0);
    const avgCorruption = active.length > 0 ? Math.round(active.reduce((s, p) => s + p.corruptionScore, 0) / active.length) : 0;
    const partyBreakdown = { R: 0, D: 0, I: 0 };
    politicians.forEach(p => {
      if (p.party === 'Republican') partyBreakdown.R++;
      else if (p.party === 'Democrat') partyBreakdown.D++;
      else partyBreakdown.I++;
    });
    const topCorrupt = [...active].sort((a, b) => b.corruptionScore - a.corruptionScore).slice(0, 10);
    const topFunded = [...active].filter(p => (p.israelLobbyTotal || 0) > 0).sort((a, b) => (b.israelLobbyTotal || 0) - (a.israelLobbyTotal || 0)).slice(0, 10);
    const topRaised = [...active].filter(p => (p.totalFundsRaised || 0) > 0).sort((a, b) => (b.totalFundsRaised || 0) - (a.totalFundsRaised || 0)).slice(0, 10);

    return { active, federal, stateLeg, local, withFunds, totalFunds, israelLobby, avgCorruption, partyBreakdown, topCorrupt, topFunded, topRaised, total: politicians.length };
  }, [politicians]);

  const fmtM = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${n}`;

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: mono, color: g }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '1rem', animation: 'pulse 2s infinite' }}>LOADING {stateName.toUpperCase()} DATA</div>
          <div style={{ fontSize: '0.65rem', color: '#3d5a3d' }}>Querying database...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#c8d6c8', fontFamily: mono }}>
      {/* Header */}
      <div style={{
        padding: '1.25rem 2rem', borderBottom: '1px solid rgba(0,255,65,0.12)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: '#0a0f0a',
      }}>
        <div>
          <div style={{ fontSize: '0.55rem', color: '#3d5a3d', letterSpacing: '0.2em', marginBottom: '0.2rem' }}>DASHBOARD</div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: g, textShadow: '0 0 20px rgba(0,255,65,0.2)' }}>
            {stateName.toUpperCase()} CORRUPTION INDEX
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link href={`/officials?state=${stateParam}`} style={{ padding: '0.4rem 0.8rem', border: '1px solid rgba(0,255,65,0.12)', color: g, fontSize: '0.65rem', textDecoration: 'none' }}>OFFICIALS</Link>
          <Link href={`/connections?state=${stateParam}`} style={{ padding: '0.4rem 0.8rem', border: '1px solid rgba(0,255,65,0.12)', color: g, fontSize: '0.65rem', textDecoration: 'none' }}>CONNECTIONS</Link>
        </div>
      </div>

      <div style={{ padding: '1.5rem 2rem' }}>
        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {[
            { label: 'TOTAL', value: stats.total.toLocaleString(), color: g },
            { label: 'FEDERAL', value: String(stats.federal.length), color: g },
            { label: 'STATE', value: String(stats.stateLeg.length), color: '#00cc33' },
            { label: 'LOCAL', value: String(stats.local.length), color: '#00cc33' },
            { label: 'AVG CORRUPTION', value: `${stats.avgCorruption}/100`, color: stats.avgCorruption >= 50 ? r : stats.avgCorruption >= 30 ? amber : g },
            { label: 'ISRAEL LOBBY', value: fmtM(stats.israelLobby), color: r },
            { label: 'TOTAL FUNDS', value: fmtM(stats.totalFunds), color: amber },
            { label: 'WITH DATA', value: String(stats.withFunds.length), color: g },
          ].map(s => (
            <div key={s.label} style={{ padding: '1rem', background: 'rgba(0,255,65,0.03)', border: '1px solid rgba(0,255,65,0.12)' }}>
              <div style={{ fontSize: '0.55rem', color: '#3d5a3d', letterSpacing: '0.15em', marginBottom: '0.3rem' }}>{s.label}</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Party Breakdown */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <div style={{ padding: '1rem', background: 'rgba(255,8,68,0.05)', border: '1px solid rgba(255,8,68,0.15)', textAlign: 'center' }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: r }}>{stats.partyBreakdown.R}</div>
            <div style={{ fontSize: '0.6rem', color: r, letterSpacing: '0.15em' }}>REPUBLICAN</div>
          </div>
          <div style={{ padding: '1rem', background: 'rgba(0,255,65,0.03)', border: '1px solid rgba(0,255,65,0.12)', textAlign: 'center' }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#3b82f6' }}>{stats.partyBreakdown.D}</div>
            <div style={{ fontSize: '0.6rem', color: '#3b82f6', letterSpacing: '0.15em' }}>DEMOCRAT</div>
          </div>
          <div style={{ padding: '1rem', background: 'rgba(0,255,65,0.03)', border: '1px solid rgba(0,255,65,0.12)', textAlign: 'center' }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#6b8a6b' }}>{stats.partyBreakdown.I}</div>
            <div style={{ fontSize: '0.6rem', color: '#6b8a6b', letterSpacing: '0.15em' }}>OTHER</div>
          </div>
        </div>

        {/* Three columns */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          {/* Top Corruption */}
          <div style={{ padding: '1rem', background: 'rgba(0,255,65,0.03)', border: '1px solid rgba(0,255,65,0.12)' }}>
            <div style={{ fontSize: '0.6rem', color: '#3d5a3d', letterSpacing: '0.2em', marginBottom: '0.2rem' }}>THREAT LEVEL</div>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: r, marginBottom: '1rem' }}>Top Corruption Scores</h3>
            {stats.topCorrupt.map((pol, i) => (
              <Link key={pol.id} href={`/politician/${pol.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.5rem 0', borderBottom: '1px solid rgba(0,255,65,0.06)', fontSize: '0.75rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: '#3d5a3d', fontSize: '0.6rem', width: '16px' }}>#{i + 1}</span>
                    <span style={{ color: '#c8d6c8' }}>{pol.name}</span>
                  </div>
                  <span style={{
                    fontWeight: 700,
                    color: pol.corruptionScore >= 60 ? r : pol.corruptionScore >= 40 ? amber : g,
                  }}>{pol.corruptionScore}</span>
                </div>
              </Link>
            ))}
          </div>

          {/* Top Israel Lobby */}
          <div style={{ padding: '1rem', background: 'rgba(255,8,68,0.03)', border: '1px solid rgba(255,8,68,0.1)' }}>
            <div style={{ fontSize: '0.6rem', color: '#3d5a3d', letterSpacing: '0.2em', marginBottom: '0.2rem' }}>FOREIGN INFLUENCE</div>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: r, marginBottom: '1rem' }}>Israel Lobby Recipients</h3>
            {stats.topFunded.length > 0 ? stats.topFunded.map((pol, i) => (
              <Link key={pol.id} href={`/politician/${pol.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.5rem 0', borderBottom: '1px solid rgba(255,8,68,0.06)', fontSize: '0.75rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: '#3d5a3d', fontSize: '0.6rem', width: '16px' }}>#{i + 1}</span>
                    <span style={{ color: '#c8d6c8' }}>{pol.name}</span>
                  </div>
                  <span style={{ fontWeight: 700, color: r, fontFamily: 'Bebas Neue, sans-serif', fontSize: '0.9rem' }}>
                    {fmtM(pol.israelLobbyTotal || 0)}
                  </span>
                </div>
              </Link>
            )) : (
              <div style={{ color: '#3d5a3d', fontSize: '0.7rem', padding: '1rem 0' }}>No Israel lobby data available for this state yet.</div>
            )}
          </div>

          {/* Top Fundraisers */}
          <div style={{ padding: '1rem', background: 'rgba(0,255,65,0.03)', border: '1px solid rgba(0,255,65,0.12)' }}>
            <div style={{ fontSize: '0.6rem', color: '#3d5a3d', letterSpacing: '0.2em', marginBottom: '0.2rem' }}>CAMPAIGN FINANCE</div>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: amber, marginBottom: '1rem' }}>Top Fundraisers</h3>
            {stats.topRaised.map((pol, i) => (
              <Link key={pol.id} href={`/politician/${pol.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.5rem 0', borderBottom: '1px solid rgba(0,255,65,0.06)', fontSize: '0.75rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: '#3d5a3d', fontSize: '0.6rem', width: '16px' }}>#{i + 1}</span>
                    <span style={{ color: '#c8d6c8' }}>{pol.name}</span>
                  </div>
                  <span style={{ fontWeight: 700, color: amber }}>{fmtM(pol.totalFundsRaised || 0)}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Corruption Distribution */}
        <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(0,255,65,0.03)', border: '1px solid rgba(0,255,65,0.12)' }}>
          <div style={{ fontSize: '0.6rem', color: '#3d5a3d', letterSpacing: '0.2em', marginBottom: '0.2rem' }}>ANALYSIS</div>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: g, marginBottom: '1rem' }}>Corruption Distribution</h3>
          <ScoreBar label="CRITICAL (80-100)" value={stats.active.filter(p => p.corruptionScore >= 80).length} max={stats.active.length} color={r} />
          <ScoreBar label="HIGH (60-79)" value={stats.active.filter(p => p.corruptionScore >= 60 && p.corruptionScore < 80).length} max={stats.active.length} color="#ff6b6b" />
          <ScoreBar label="ELEVATED (40-59)" value={stats.active.filter(p => p.corruptionScore >= 40 && p.corruptionScore < 60).length} max={stats.active.length} color={amber} />
          <ScoreBar label="MODERATE (20-39)" value={stats.active.filter(p => p.corruptionScore >= 20 && p.corruptionScore < 40).length} max={stats.active.length} color="#00cc33" />
          <ScoreBar label="LOW (0-19)" value={stats.active.filter(p => p.corruptionScore < 20).length} max={stats.active.length} color={g} />
        </div>
      </div>
    </div>
  );
}

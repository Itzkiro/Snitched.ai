'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { Politician } from '@/lib/types';

function formatAmount(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function getScoreColor(score: number): string {
  if (score <= 20) return 'var(--terminal-green)';
  if (score <= 40) return '#22c55e';
  if (score <= 60) return 'var(--terminal-amber)';
  if (score <= 80) return '#ef4444';
  return 'var(--terminal-red)';
}

export default function ComparePage() {
  const [politicians, setPoliticians] = useState<Politician[]>([]);
  const [loading, setLoading] = useState(true);
  const [leftId, setLeftId] = useState<string>('');
  const [rightId, setRightId] = useState<string>('');
  const [search1, setSearch1] = useState('');
  const [search2, setSearch2] = useState('');

  useEffect(() => {
    fetch('/api/politicians')
      .then(res => res.json())
      .then(data => {
        setPoliticians(data.filter((p: Politician) => p.isActive));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const left = politicians.find(p => p.id === leftId);
  const right = politicians.find(p => p.id === rightId);

  const filtered1 = search1
    ? politicians.filter(p => p.name.toLowerCase().includes(search1.toLowerCase())).slice(0, 8)
    : [];
  const filtered2 = search2
    ? politicians.filter(p => p.name.toLowerCase().includes(search2.toLowerCase())).slice(0, 8)
    : [];

  const rows = [
    { label: 'CORRUPTION SCORE', left: left?.corruptionScore ?? 0, right: right?.corruptionScore ?? 0, format: (n: number) => `${n}/100`, color: true },
    { label: 'TOTAL FUNDS RAISED', left: left?.totalFundsRaised ?? 0, right: right?.totalFundsRaised ?? 0, format: formatAmount },
    { label: 'ISRAEL LOBBY', left: left?.israelLobbyTotal ?? 0, right: right?.israelLobbyTotal ?? 0, format: formatAmount },
    { label: 'AIPAC FUNDING', left: left?.aipacFunding ?? 0, right: right?.aipacFunding ?? 0, format: formatAmount },
    { label: 'YEARS IN OFFICE', left: left?.yearsInOffice ?? 0, right: right?.yearsInOffice ?? 0, format: (n: number) => `${n}` },
  ];

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--terminal-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--terminal-bg)', color: 'var(--terminal-text)' }}>
      <div className="terminal-title">
        <div>
          <h1>COMPARE POLITICIANS</h1>
          <div className="terminal-subtitle">Side-by-side corruption and funding analysis</div>
        </div>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        {/* Selection row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '2rem', marginBottom: '2rem', alignItems: 'start' }}>
          {/* Left selector */}
          <div className="terminal-card">
            <div style={{ fontSize: '0.75rem', color: 'var(--terminal-amber)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              POLITICIAN A
            </div>
            <input
              type="text"
              value={left ? left.name : search1}
              onChange={(e) => { setSearch1(e.target.value); setLeftId(''); }}
              placeholder="Search name..."
              style={{
                width: '100%', padding: '0.75rem', background: 'var(--terminal-bg)',
                border: '2px solid var(--terminal-border)', color: 'var(--terminal-text)',
                fontSize: '0.875rem', fontFamily: 'JetBrains Mono, monospace',
              }}
            />
            {filtered1.length > 0 && !left && (
              <div style={{ border: '1px solid var(--terminal-border)', maxHeight: '200px', overflowY: 'auto', marginTop: '0.25rem' }}>
                {filtered1.map(p => (
                  <div key={p.id} onClick={() => { setLeftId(p.id); setSearch1(''); }}
                    style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.8rem', borderBottom: '1px solid var(--terminal-border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,191,255,0.1)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {p.name} <span style={{ color: 'var(--terminal-text-dim)', fontSize: '0.7rem' }}>({p.officeLevel})</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', paddingTop: '2rem', fontSize: '1.5rem', color: 'var(--terminal-text-dim)' }}>VS</div>

          {/* Right selector */}
          <div className="terminal-card">
            <div style={{ fontSize: '0.75rem', color: 'var(--terminal-amber)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              POLITICIAN B
            </div>
            <input
              type="text"
              value={right ? right.name : search2}
              onChange={(e) => { setSearch2(e.target.value); setRightId(''); }}
              placeholder="Search name..."
              style={{
                width: '100%', padding: '0.75rem', background: 'var(--terminal-bg)',
                border: '2px solid var(--terminal-border)', color: 'var(--terminal-text)',
                fontSize: '0.875rem', fontFamily: 'JetBrains Mono, monospace',
              }}
            />
            {filtered2.length > 0 && !right && (
              <div style={{ border: '1px solid var(--terminal-border)', maxHeight: '200px', overflowY: 'auto', marginTop: '0.25rem' }}>
                {filtered2.map(p => (
                  <div key={p.id} onClick={() => { setRightId(p.id); setSearch2(''); }}
                    style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.8rem', borderBottom: '1px solid var(--terminal-border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,191,255,0.1)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {p.name} <span style={{ color: 'var(--terminal-text-dim)', fontSize: '0.7rem' }}>({p.officeLevel})</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Comparison table */}
        {left && right && (
          <div className="terminal-card">
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px 1fr', gap: '1rem', borderBottom: '2px solid var(--terminal-border)', paddingBottom: '1rem', marginBottom: '1rem' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'Bebas Neue, sans-serif', marginBottom: '0.25rem' }}>{left.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)' }}>{left.office}</div>
                <div style={{ fontSize: '0.75rem', color: left.party === 'Republican' ? '#dc2626' : '#2563eb' }}>{left.party}</div>
              </div>
              <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--terminal-text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', alignSelf: 'center' }}>
                METRIC
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'Bebas Neue, sans-serif', marginBottom: '0.25rem' }}>{right.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)' }}>{right.office}</div>
                <div style={{ fontSize: '0.75rem', color: right.party === 'Republican' ? '#dc2626' : '#2563eb' }}>{right.party}</div>
              </div>
            </div>

            {/* Rows */}
            {rows.map((row, i) => {
              const leftWorse = row.left > row.right;
              const rightWorse = row.right > row.left;
              const equal = row.left === row.right;
              return (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '1fr 200px 1fr', gap: '1rem',
                  padding: '1rem 0', borderBottom: i < rows.length - 1 ? '1px solid var(--terminal-border)' : 'none',
                }}>
                  <div style={{
                    textAlign: 'center', fontSize: '1.75rem', fontWeight: 700, fontFamily: 'Bebas Neue, sans-serif',
                    color: row.color ? getScoreColor(row.left) : (leftWorse && !equal ? 'var(--terminal-red)' : 'var(--terminal-text)'),
                  }}>
                    {row.format(row.left)}
                    {leftWorse && !equal && <span style={{ fontSize: '0.7rem', marginLeft: '0.5rem', color: 'var(--terminal-red)' }}>HIGHER</span>}
                  </div>
                  <div style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--terminal-text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', alignSelf: 'center' }}>
                    {row.label}
                  </div>
                  <div style={{
                    textAlign: 'center', fontSize: '1.75rem', fontWeight: 700, fontFamily: 'Bebas Neue, sans-serif',
                    color: row.color ? getScoreColor(row.right) : (rightWorse && !equal ? 'var(--terminal-red)' : 'var(--terminal-text)'),
                  }}>
                    {row.format(row.right)}
                    {rightWorse && !equal && <span style={{ fontSize: '0.7rem', marginLeft: '0.5rem', color: 'var(--terminal-red)' }}>HIGHER</span>}
                  </div>
                </div>
              );
            })}

            {/* Top donors comparison */}
            <div style={{ marginTop: '2rem', borderTop: '2px solid var(--terminal-border)', paddingTop: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--terminal-amber)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem', textAlign: 'center' }}>
                TOP DONORS COMPARISON
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                <div>
                  {(left.top5Donors || []).slice(0, 3).map((d, i) => (
                    <div key={i} style={{ padding: '0.5rem', borderBottom: '1px solid var(--terminal-border)', fontSize: '0.8rem' }}>
                      <div style={{ fontWeight: 700, color: d.type === 'Israel-PAC' ? 'var(--terminal-red)' : 'var(--terminal-text)' }}>{d.name}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dim)' }}>{d.type}</span>
                        <span style={{ fontFamily: 'Bebas Neue, sans-serif', color: 'var(--terminal-amber)' }}>{formatAmount(d.amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div>
                  {(right.top5Donors || []).slice(0, 3).map((d, i) => (
                    <div key={i} style={{ padding: '0.5rem', borderBottom: '1px solid var(--terminal-border)', fontSize: '0.8rem' }}>
                      <div style={{ fontWeight: 700, color: d.type === 'Israel-PAC' ? 'var(--terminal-red)' : 'var(--terminal-text)' }}>{d.name}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dim)' }}>{d.type}</span>
                        <span style={{ fontFamily: 'Bebas Neue, sans-serif', color: 'var(--terminal-amber)' }}>{formatAmount(d.amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* View dossiers */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem' }}>
              <Link href={`/politician/${left.id}`}>
                <button className="terminal-btn">VIEW {left.name.split(' ').pop()?.toUpperCase()} DOSSIER</button>
              </Link>
              <Link href={`/politician/${right.id}`}>
                <button className="terminal-btn">VIEW {right.name.split(' ').pop()?.toUpperCase()} DOSSIER</button>
              </Link>
            </div>
          </div>
        )}

        {(!left || !right) && (
          <div className="terminal-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>&#x2194;</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--terminal-text-dim)' }}>
              SELECT TWO POLITICIANS
            </div>
            <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.875rem' }}>
              Search and select politicians above to compare their corruption scores, funding, and connections side by side.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Politician } from '@/lib/types';

interface Race {
  seat: string;
  candidates: Politician[];
}

function fmtMoney(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return n > 0 ? `$${n}` : '$0';
}

function partyColor(party: string): string {
  if (party === 'Republican') return '#dc2626';
  if (party === 'Democrat') return '#2563eb';
  return '#6b7280';
}

function scoreColor(score: number): string {
  if (score >= 60) return 'var(--terminal-red)';
  if (score >= 40) return 'var(--terminal-amber)';
  return 'var(--terminal-green)';
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', marginTop: '0.25rem' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.3s' }} />
    </div>
  );
}

export default function CandidateCompare({ races }: { races: Race[] }) {
  const multiCandidateRaces = races.filter(r => r.candidates.length >= 2);
  const [selectedRace, setSelectedRace] = useState<string>(multiCandidateRaces[0]?.seat || '');

  if (multiCandidateRaces.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--terminal-text-dim)', fontSize: '0.8rem' }}>
        No races with 2+ candidates to compare yet.
      </div>
    );
  }

  const race = multiCandidateRaces.find(r => r.seat === selectedRace) || multiCandidateRaces[0];
  const candidates = race.candidates;

  // Compute maxes for relative bars
  const maxFunds = Math.max(...candidates.map(c => c.totalFundsRaised || 0), 1);
  const maxScore = Math.max(...candidates.map(c => c.corruptionScore || 0), 1);
  const maxIsrael = Math.max(...candidates.map(c => c.israelLobbyTotal || c.aipacFunding || 0), 1);

  const stats: { label: string; getValue: (c: Politician) => number; format: (n: number) => string; color: (c: Politician) => string; max: number }[] = [
    {
      label: 'CORRUPTION SCORE',
      getValue: c => c.corruptionScore || 0,
      format: n => `${n}/100`,
      color: c => scoreColor(c.corruptionScore || 0),
      max: 100,
    },
    {
      label: 'TOTAL FUNDS RAISED',
      getValue: c => c.totalFundsRaised || 0,
      format: fmtMoney,
      color: () => 'var(--terminal-blue)',
      max: maxFunds,
    },
    {
      label: 'ISRAEL LOBBY',
      getValue: c => c.israelLobbyTotal || c.aipacFunding || 0,
      format: fmtMoney,
      color: () => 'var(--terminal-red)',
      max: maxIsrael,
    },
  ];

  return (
    <div>
      {/* Race selector */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {multiCandidateRaces.map(r => (
          <button
            key={r.seat}
            onClick={() => setSelectedRace(r.seat)}
            style={{
              padding: '0.5rem 1rem',
              background: r.seat === selectedRace ? 'rgba(0, 191, 255, 0.15)' : 'var(--terminal-card)',
              border: r.seat === selectedRace ? '1px solid var(--terminal-blue)' : '1px solid var(--terminal-border)',
              color: r.seat === selectedRace ? 'var(--terminal-blue)' : 'var(--terminal-text-dim)',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.7rem',
              fontWeight: r.seat === selectedRace ? 700 : 400,
              cursor: 'pointer',
              transition: 'all 0.2s',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {r.seat} ({r.candidates.length})
          </button>
        ))}
      </div>

      {/* Comparison table */}
      <div style={{
        overflowX: 'auto',
        border: '1px solid var(--terminal-border)',
        background: 'var(--terminal-card)',
      }}>
        <table style={{
          width: '100%', borderCollapse: 'collapse',
          fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem',
        }}>
          <thead>
            <tr>
              <th style={{
                padding: '1rem', textAlign: 'left', borderBottom: '2px solid var(--terminal-border)',
                fontSize: '0.65rem', color: 'var(--terminal-text-dim)', letterSpacing: '0.15em',
                textTransform: 'uppercase', minWidth: '120px',
              }}>
                METRIC
              </th>
              {candidates.map(c => (
                <th key={c.id} style={{
                  padding: '1rem', textAlign: 'center', borderBottom: '2px solid var(--terminal-border)',
                  minWidth: '160px',
                }}>
                  <Link href={`/politician/${c.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.25rem' }}>{c.name}</div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.4rem', alignItems: 'center' }}>
                      <span style={{
                        fontSize: '0.6rem', padding: '0.15rem 0.4rem',
                        background: partyColor(c.party), color: '#fff', fontWeight: 600,
                      }}>
                        {c.party === 'Republican' ? 'R' : c.party === 'Democrat' ? 'D' : c.party?.charAt(0)}
                      </span>
                      <span style={{
                        fontSize: '0.6rem', padding: '0.15rem 0.4rem',
                        background: c.isActive ? 'rgba(255,182,39,0.15)' : 'rgba(0,255,65,0.1)',
                        color: c.isActive ? 'var(--terminal-amber)' : 'var(--terminal-green)',
                        border: c.isActive ? '1px solid rgba(255,182,39,0.3)' : '1px solid rgba(0,255,65,0.2)',
                      }}>
                        {c.isActive ? 'INCUMBENT' : 'CHALLENGER'}
                      </span>
                    </div>
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.map(stat => {
              const values = candidates.map(c => stat.getValue(c));
              const bestIdx = stat.label === 'CORRUPTION SCORE'
                ? values.indexOf(Math.min(...values))  // Lower corruption = better
                : values.indexOf(Math.max(...values));  // Higher funds = more notable

              return (
                <tr key={stat.label}>
                  <td style={{
                    padding: '0.75rem 1rem', borderBottom: '1px solid var(--terminal-border)',
                    fontSize: '0.65rem', color: 'var(--terminal-text-dim)', letterSpacing: '0.1em',
                    textTransform: 'uppercase', fontWeight: 600,
                  }}>
                    {stat.label}
                  </td>
                  {candidates.map((c, i) => {
                    const val = stat.getValue(c);
                    return (
                      <td key={c.id} style={{
                        padding: '0.75rem 1rem', textAlign: 'center',
                        borderBottom: '1px solid var(--terminal-border)',
                        background: i === bestIdx && val > 0 ? 'rgba(0, 191, 255, 0.04)' : 'transparent',
                      }}>
                        <div style={{
                          fontSize: '1.1rem', fontWeight: 700,
                          color: stat.color(c),
                          fontFamily: 'Bebas Neue, sans-serif',
                        }}>
                          {stat.format(val)}
                        </div>
                        <Bar value={val} max={stat.max} color={stat.color(c)} />
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {/* Party row */}
            <tr>
              <td style={{
                padding: '0.75rem 1rem', borderBottom: '1px solid var(--terminal-border)',
                fontSize: '0.65rem', color: 'var(--terminal-text-dim)', letterSpacing: '0.1em',
                textTransform: 'uppercase', fontWeight: 600,
              }}>
                PARTY
              </td>
              {candidates.map(c => (
                <td key={c.id} style={{ padding: '0.75rem 1rem', textAlign: 'center', borderBottom: '1px solid var(--terminal-border)' }}>
                  <span style={{
                    padding: '0.3rem 0.75rem', fontWeight: 700, fontSize: '0.75rem',
                    background: partyColor(c.party), color: '#fff',
                  }}>
                    {c.party}
                  </span>
                </td>
              ))}
            </tr>

            {/* Current role row */}
            <tr>
              <td style={{
                padding: '0.75rem 1rem',
                fontSize: '0.65rem', color: 'var(--terminal-text-dim)', letterSpacing: '0.1em',
                textTransform: 'uppercase', fontWeight: 600,
              }}>
                CURRENT ROLE
              </td>
              {candidates.map(c => (
                <td key={c.id} style={{ padding: '0.75rem 1rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--terminal-text)' }}>
                  {c.office}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

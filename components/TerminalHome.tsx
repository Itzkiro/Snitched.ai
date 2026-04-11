'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Politician } from '@/lib/types';
import { getStateName } from '@/lib/state-utils';
import { useTerminal } from './TerminalContext';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATES_WITH_DATA = [
  { code: 'FL', name: 'Florida' },
  { code: 'OH', name: 'Ohio' },
  { code: 'CA', name: 'California' },
  { code: 'TX', name: 'Texas' },
  { code: 'NY', name: 'New York' },
  { code: 'GA', name: 'Georgia' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'IL', name: 'Illinois' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'MI', name: 'Michigan' },
  { code: 'NJ', name: 'New Jersey' },
];

const UPDATE_LOG = [
  { date: 'Apr 11', title: 'State Filtering', desc: 'Filter all pages by state via dropdown', tag: 'New' },
  { date: 'Apr 10', title: 'National Expansion', desc: '11 states, 6,700+ politicians', tag: 'Data' },
  { date: 'Apr 10', title: 'Ohio Full Depth', desc: '88 counties, 204 judges, 150 state/federal', tag: 'Data' },
  { date: 'Apr 10', title: 'Financial Enrichment', desc: '1,644 officials with real campaign finance', tag: 'Data' },
  { date: 'Apr 10', title: 'Corruption Score v4', desc: '4-factor scoring with Israel lobby flag', tag: 'New' },
  { date: 'Apr 9', title: 'Connections Graph', desc: 'Interactive donor-politician network map', tag: 'New' },
];

// ---------------------------------------------------------------------------
// Shared styles (landing page uses Inter, not monospace)
// ---------------------------------------------------------------------------

const sans = "'Inter', -apple-system, system-ui, sans-serif";
const mono = "'JetBrains Mono', monospace";
const accent = '#3b82f6';  // brighter blue
const accentDim = 'rgba(59, 130, 246, 0.15)';
const red = '#ef4444';
const green = '#22c55e';
const amber = '#f59e0b';
const bg = '#09090b';
const card = '#18181b';
const border = '#27272a';
const textPrimary = '#fafafa';
const textSecondary = '#a1a1aa';
const textMuted = '#71717a';

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface TerminalHomeProps {
  initialPoliticians: Politician[];
  selectedState?: string | null;
}

export default function TerminalHome({ initialPoliticians, selectedState }: TerminalHomeProps) {
  const router = useRouter();
  const { entered, enter } = useTerminal();
  const [nameQuery, setNameQuery] = useState('');
  const [zipQuery, setZipQuery] = useState('');
  const [nameSuggestions, setNameSuggestions] = useState<Politician[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const politicians = initialPoliticians;
  const activePoliticians = politicians.filter(p => p.isActive);
  const totalFunding = activePoliticians.reduce((sum, p) => sum + (p.totalFundsRaised || 0), 0);
  const israelLobbyTotal = activePoliticians.reduce((sum, p) => sum + (p.israelLobbyTotal || p.aipacFunding || 0), 0);
  const withFunding = politicians.filter(p => (p.totalFundsRaised || 0) > 0).length;

  const statesWithCounts = STATES_WITH_DATA.map(s => {
    const count = politicians.filter(p => {
      const prefix = p.id.slice(0, 2).toLowerCase();
      const thirdChar = p.id[2];
      if (prefix === s.code.toLowerCase() && thirdChar === '-') return true;
      if (s.code === 'FL' && thirdChar !== '-') return true;
      return false;
    }).length;
    return { ...s, count };
  });

  const handleNameSearch = useCallback((query: string) => {
    setNameQuery(query);
    if (query.length < 2) { setNameSuggestions([]); setShowSuggestions(false); return; }
    const lower = query.toLowerCase();
    const matches = politicians
      .filter(p => p.name.toLowerCase().includes(lower))
      .sort((a, b) => {
        const aS = a.name.toLowerCase().startsWith(lower) ? 0 : 1;
        const bS = b.name.toLowerCase().startsWith(lower) ? 0 : 1;
        return aS - bS || a.name.localeCompare(b.name);
      })
      .slice(0, 8);
    setNameSuggestions(matches);
    setShowSuggestions(matches.length > 0);
  }, [politicians]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
          nameInputRef.current && !nameInputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleZipSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (zipQuery.trim()) router.push(`/browse?zip=${encodeURIComponent(zipQuery.trim())}`);
  };
  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (nameQuery.trim()) router.push(`/browse?q=${encodeURIComponent(nameQuery.trim())}`);
  };

  const topCorrupted = [...activePoliticians]
    .sort((a, b) => b.corruptionScore - a.corruptionScore)
    .slice(0, 6);

  const topIsraelLobby = [...activePoliticians]
    .filter(p => (p.israelLobbyTotal || 0) > 0)
    .sort((a, b) => (b.israelLobbyTotal || 0) - (a.israelLobbyTotal || 0))
    .slice(0, 5);

  // ══════════════════════════════════════════════════════════════════
  // If already entered terminal, show dashboard-style content
  // ══════════════════════════════════════════════════════════════════
  if (entered) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--terminal-bg)', color: 'var(--terminal-text)' }}>
        <div className="terminal-title">
          <div>
            <h1>
              {selectedState && selectedState !== 'ALL'
                ? `${getStateName(selectedState).toUpperCase()} CORRUPTION INDEX`
                : 'SNITCHED.AI - CORRUPTION INDEX'}
            </h1>
            <div className="terminal-subtitle">
              {politicians.length.toLocaleString()} politicians tracked | ${(totalFunding / 1000000).toFixed(0)}M+ campaign funds | Real-time OSINT
            </div>
          </div>
        </div>

        {/* Search bars in terminal mode */}
        <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--terminal-border)', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <form onSubmit={handleNameSubmit} style={{ flex: '1 1 300px', position: 'relative' }}>
            <div style={{ display: 'flex', background: 'var(--terminal-card)', border: '1px solid var(--terminal-border)' }}>
              <input ref={nameInputRef} type="text" placeholder="Search by name..." value={nameQuery}
                onChange={e => handleNameSearch(e.target.value)}
                onFocus={() => nameSuggestions.length > 0 && setShowSuggestions(true)}
                style={{ flex: 1, padding: '0.7rem 1rem', background: 'transparent', border: 'none', color: 'var(--terminal-text)', fontFamily: mono, fontSize: '0.8rem', outline: 'none' }} />
              <button type="submit" style={{ padding: '0.7rem 1rem', background: 'var(--terminal-blue)', border: 'none', color: '#000', fontFamily: mono, fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}>SEARCH</button>
            </div>
            {showSuggestions && (
              <div ref={suggestionsRef} style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--terminal-card)', border: '1px solid var(--terminal-border)', maxHeight: '280px', overflowY: 'auto' }}>
                {nameSuggestions.map(p => (
                  <Link key={p.id} href={`/politician/${p.id}`} onClick={() => setShowSuggestions(false)}
                    style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.75rem', textDecoration: 'none', color: 'inherit', borderBottom: '1px solid var(--terminal-border)', fontSize: '0.8rem' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,191,255,0.08)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <div><div style={{ fontWeight: 600, color: 'var(--terminal-blue)' }}>{p.name}</div><div style={{ fontSize: '0.65rem', color: 'var(--terminal-text-dim)' }}>{p.office}</div></div>
                    <span style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', background: p.party === 'Republican' ? '#dc2626' : '#2563eb', color: '#fff', fontWeight: 600, alignSelf: 'center' }}>{p.party === 'Republican' ? 'R' : 'D'}</span>
                  </Link>
                ))}
              </div>
            )}
          </form>
        </div>

        {/* Top corruption + Israel lobby */}
        <div style={{ display: 'flex', gap: '2rem', padding: '2rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 500px' }}>
            <h2 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--terminal-red)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem' }}>HIGHEST CORRUPTION SCORES</h2>
            <div className="data-grid" style={{ padding: 0 }}>
              {topCorrupted.map(pol => (
                <Link key={pol.id} href={`/politician/${pol.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="terminal-card">
                    <div className="card-header"><div><div className="card-title">{pol.name}</div><div style={{ fontSize: '11px', color: 'var(--terminal-text-dim)', marginTop: '0.3rem' }}>{pol.office}</div></div>
                    <div className={`card-status ${pol.juiceBoxTier !== 'none' ? 'compromised' : ''}`}>{pol.juiceBoxTier !== 'none' ? 'COMPROMISED' : 'MONITORED'}</div></div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 700, color: pol.corruptionScore >= 60 ? 'var(--terminal-red)' : pol.corruptionScore >= 40 ? 'var(--terminal-amber)' : 'var(--terminal-green)' }}>SCORE: {pol.corruptionScore}/100</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
          {topIsraelLobby.length > 0 && (
            <div style={{ flex: '0 0 300px' }}>
              <h2 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--terminal-red)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem' }}>ISRAEL LOBBY TOP</h2>
              {topIsraelLobby.map((pol, i) => (
                <Link key={pol.id} href={`/politician/${pol.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', borderBottom: '1px solid var(--terminal-border)', fontSize: '0.8rem' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.05)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <div><span style={{ color: 'var(--terminal-text-dim)', marginRight: '0.5rem' }}>#{i+1}</span>{pol.name}</div>
                    <span style={{ color: 'var(--terminal-red)', fontWeight: 700, fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.1rem' }}>${((pol.israelLobbyTotal||0) >= 1e6 ? ((pol.israelLobbyTotal||0)/1e6).toFixed(1)+'M' : ((pol.israelLobbyTotal||0)/1e3).toFixed(0)+'K')}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="classified-footer">
          PUBLIC RECORDS: FEC // STATE ELECTIONS // LDA SENATE // LEGISCAN // TRACK AIPAC //
          <Link href="/about" style={{ color: '#fff', marginLeft: '0.5rem', textDecoration: 'underline' }}>METHODOLOGY</Link>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // MODERN LANDING PAGE (before entering terminal)
  // ══════════════════════════════════════════════════════════════════

  const fmtMoney = (n: number) => n >= 1e6 ? `$${(n/1e6).toFixed(0)}M` : `$${(n/1e3).toFixed(0)}K`;

  return (
    <div style={{ minHeight: '100vh', background: bg, color: textPrimary, fontFamily: sans }}>

      {/* ── HERO ── */}
      <section style={{
        position: 'relative', padding: '6rem 2rem 4rem', textAlign: 'center',
        background: `radial-gradient(ellipse 80% 60% at 50% -20%, rgba(59,130,246,0.12) 0%, transparent 70%), ${bg}`,
        overflow: 'hidden',
      }}>
        {/* Dot grid */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.4,
          backgroundImage: 'radial-gradient(circle, #27272a 1px, transparent 1px)',
          backgroundSize: '24px 24px', pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', maxWidth: '800px', margin: '0 auto' }}>
          {/* Badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.35rem 0.9rem', marginBottom: '1.5rem', borderRadius: '999px',
            background: accentDim, fontSize: '0.7rem', color: accent,
            fontWeight: 500, letterSpacing: '0.03em',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: green, display: 'inline-block' }} />
            Now tracking {politicians.length.toLocaleString()} politicians across 11 states
          </div>

          {/* Title */}
          <h1 style={{
            fontSize: 'clamp(2.5rem, 6vw, 4rem)', fontWeight: 800, lineHeight: 1.1,
            marginBottom: '1.25rem', letterSpacing: '-0.02em',
          }}>
            {selectedState && selectedState !== 'ALL' ? (
              <>
                <span style={{ color: textPrimary }}>{getStateName(selectedState)}</span>
                <br />
                <span style={{ color: accent }}>Corruption Index</span>
              </>
            ) : (
              <>
                Know where the money
                <br />
                <span style={{ color: accent }}>really</span> goes.
              </>
            )}
          </h1>

          {/* Subtitle */}
          <p style={{
            fontSize: '1.1rem', color: textSecondary, lineHeight: 1.7,
            maxWidth: '560px', margin: '0 auto 2.5rem',
          }}>
            {selectedState && selectedState !== 'ALL'
              ? `Track corruption, lobby influence, and campaign finance for every politician in ${getStateName(selectedState)}. All from public records.`
              : 'Track political corruption, foreign lobby influence, and campaign finance. Every dollar traced from public FEC filings, lobbying disclosures, and voting records.'}
          </p>

          {/* ── Search Bars ── */}
          <div style={{
            display: 'flex', gap: '0.75rem', maxWidth: '640px', margin: '0 auto 3rem',
            flexWrap: 'wrap', justifyContent: 'center',
          }}>
            {/* Name */}
            <form onSubmit={handleNameSubmit} style={{ flex: '1 1 320px', position: 'relative' }}>
              <div style={{
                display: 'flex', alignItems: 'center', borderRadius: '12px',
                background: card, border: `1px solid ${border}`,
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }}>
                <span style={{ padding: '0 0 0 1rem', color: textMuted, fontSize: '1rem' }}>&#128269;</span>
                <input ref={nameInputRef} type="text" placeholder="Search any politician..."
                  value={nameQuery} onChange={e => handleNameSearch(e.target.value)}
                  onFocus={() => nameSuggestions.length > 0 && setShowSuggestions(true)}
                  style={{
                    flex: 1, padding: '0.85rem 0.75rem', background: 'transparent', border: 'none',
                    color: textPrimary, fontFamily: sans, fontSize: '0.9rem', outline: 'none',
                  }} />
                <button type="submit" style={{
                  padding: '0.6rem 1.1rem', margin: '0.35rem', borderRadius: '8px',
                  background: accent, border: 'none', color: '#fff', fontFamily: sans,
                  fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                }}>Search</button>
              </div>
              {showSuggestions && (
                <div ref={suggestionsRef} style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
                  background: card, border: `1px solid ${border}`, borderRadius: '12px',
                  maxHeight: '300px', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
                }}>
                  {nameSuggestions.map(p => (
                    <Link key={p.id} href={`/politician/${p.id}`} onClick={() => setShowSuggestions(false)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '0.7rem 1rem', textDecoration: 'none', color: 'inherit',
                        borderBottom: `1px solid ${border}`, fontSize: '0.85rem',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.08)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{p.name}</div>
                        <div style={{ fontSize: '0.75rem', color: textMuted, marginTop: '0.1rem' }}>
                          {p.office} &middot; {p.party}
                        </div>
                      </div>
                      <span style={{
                        fontSize: '0.65rem', padding: '0.2rem 0.5rem', borderRadius: '4px',
                        background: p.party === 'Republican' ? red : accent,
                        color: '#fff', fontWeight: 600,
                      }}>{p.party === 'Republican' ? 'R' : p.party === 'Democrat' ? 'D' : p.party?.charAt(0)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </form>

            {/* ZIP */}
            <form onSubmit={handleZipSearch} style={{ flex: '0 1 200px' }}>
              <div style={{
                display: 'flex', alignItems: 'center', borderRadius: '12px',
                background: card, border: `1px solid ${border}`,
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }}>
                <input type="text" placeholder="ZIP code" value={zipQuery}
                  onChange={e => setZipQuery(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  maxLength={5} inputMode="numeric"
                  style={{
                    flex: 1, padding: '0.85rem 1rem', background: 'transparent', border: 'none',
                    color: textPrimary, fontFamily: sans, fontSize: '0.9rem', outline: 'none',
                    letterSpacing: '0.08em',
                  }} />
                <button type="submit" style={{
                  padding: '0.6rem 1rem', margin: '0.35rem', borderRadius: '8px',
                  background: '#27272a', border: `1px solid ${border}`, color: textSecondary,
                  fontFamily: sans, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                }}>Go</button>
              </div>
            </form>
          </div>

          {/* ── Hero Stats ── */}
          <div style={{
            display: 'flex', justifyContent: 'center', gap: '2rem', flexWrap: 'wrap',
          }}>
            {[
              { value: politicians.length.toLocaleString(), label: 'Politicians', color: accent },
              { value: fmtMoney(totalFunding), label: 'Funds Tracked', color: green },
              { value: fmtMoney(israelLobbyTotal), label: 'Israel Lobby', color: red },
              { value: String(withFunding), label: 'With Finance Data', color: amber },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center', minWidth: '100px' }}>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: s.color, fontFamily: mono, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: '0.7rem', color: textMuted, marginTop: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATE SELECTOR ── */}
      <section style={{ padding: '3.5rem 2rem', borderTop: `1px solid ${border}` }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Choose your state
            </h2>
            <p style={{ color: textSecondary, fontSize: '0.95rem' }}>
              Select a state to explore officials, candidates, and corruption data
            </p>
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: '0.6rem',
          }}>
            {statesWithCounts.map(s => (
              <button key={s.code} onClick={() => router.push(`/?state=${s.code}`)}
                style={{
                  padding: '1rem', borderRadius: '10px', background: card,
                  border: `1px solid ${border}`, color: textPrimary, fontFamily: sans,
                  fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s',
                  textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.background = '#1c1c20'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = border; e.currentTarget.style.background = card; }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: '0.1rem' }}>{s.name}</div>
                  <div style={{ fontSize: '0.7rem', color: textMuted }}>{s.code}</div>
                </div>
                <div style={{ fontSize: '0.75rem', color: textMuted, fontFamily: mono }}>
                  {s.count > 0 ? s.count.toLocaleString() : '-'}
                </div>
              </button>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
            <button onClick={enter} style={{
              padding: '0.7rem 2rem', borderRadius: '8px', background: accent,
              border: 'none', color: '#fff', fontFamily: sans, fontSize: '0.85rem',
              fontWeight: 600, cursor: 'pointer', transition: 'opacity 0.2s',
            }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
              Enter Terminal View &rarr;
            </button>
          </div>
        </div>
      </section>

      {/* ── WHAT IS THIS ── */}
      <section style={{ padding: '4rem 2rem', borderTop: `1px solid ${border}`, background: '#0c0c0f' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, textAlign: 'center', marginBottom: '0.5rem' }}>
            What is Snitched.ai?
          </h2>
          <p style={{ color: textSecondary, textAlign: 'center', marginBottom: '2.5rem', fontSize: '0.95rem' }}>
            A citizen research platform powered by public records. No opinions. No partisan bias.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1.25rem' }}>
            {[
              { icon: '&#128176;', title: 'Follow the Money', desc: 'FEC filings, state databases, and lobbying disclosures aggregated to show exactly who funds each politician.', color: accent },
              { icon: '&#127758;', title: 'Foreign Lobby Tracking', desc: 'Israel lobby PACs, bundled donations, and independent expenditures from AIPAC and affiliated organizations.', color: red },
              { icon: '&#9878;', title: 'Corruption Scoring', desc: 'Every politician scored 0-100 based on PAC ratios, lobbying connections, and campaign finance red flags.', color: amber },
            ].map(c => (
              <div key={c.title} style={{
                padding: '1.5rem', borderRadius: '12px', background: card, border: `1px solid ${border}`,
              }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }} dangerouslySetInnerHTML={{ __html: c.icon }} />
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: c.color, marginBottom: '0.5rem' }}>{c.title}</h3>
                <p style={{ fontSize: '0.8rem', color: textSecondary, lineHeight: 1.6 }}>{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DATA SOURCES ── */}
      <section style={{ padding: '3rem 2rem', borderTop: `1px solid ${border}` }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h3 style={{ fontSize: '0.75rem', fontWeight: 600, color: textMuted, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '1.5rem' }}>
            Verified Data Sources
          </h3>
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            {['FEC', 'LDA Senate', 'LegiScan', 'Track AIPAC', 'CourtListener'].map(s => (
              <div key={s} style={{
                padding: '0.5rem 1.25rem', borderRadius: '8px', background: card,
                border: `1px solid ${border}`, fontSize: '0.8rem', color: textSecondary, fontWeight: 500,
              }}>{s}</div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TOP POLITICIANS PREVIEW ── */}
      {topCorrupted.length > 0 && (
        <section style={{ padding: '3.5rem 2rem', borderTop: `1px solid ${border}`, background: '#0c0c0f' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Highest Corruption Scores</h2>
              <button onClick={enter} style={{ background: 'none', border: 'none', color: accent, fontFamily: sans, fontSize: '0.8rem', cursor: 'pointer', fontWeight: 500 }}>
                View all &rarr;
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0.75rem' }}>
              {topCorrupted.map(pol => (
                <Link key={pol.id} href={`/politician/${pol.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{
                    padding: '1.25rem', borderRadius: '12px', background: card, border: `1px solid ${border}`,
                    transition: 'border-color 0.2s',
                  }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = red)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = border)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.75rem' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{pol.name}</div>
                        <div style={{ fontSize: '0.75rem', color: textMuted, marginTop: '0.15rem' }}>{pol.office}</div>
                      </div>
                      <span style={{
                        fontSize: '0.6rem', padding: '0.2rem 0.5rem', borderRadius: '4px',
                        background: pol.party === 'Republican' ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)',
                        color: pol.party === 'Republican' ? red : accent, fontWeight: 600,
                      }}>{pol.party === 'Republican' ? 'R' : 'D'}</span>
                    </div>
                    <div style={{
                      fontSize: '1.75rem', fontWeight: 700, fontFamily: mono,
                      color: pol.corruptionScore >= 60 ? red : pol.corruptionScore >= 40 ? amber : green,
                    }}>
                      {pol.corruptionScore}<span style={{ fontSize: '0.8rem', color: textMuted, fontWeight: 400 }}>/100</span>
                    </div>
                    {(pol.israelLobbyTotal || pol.aipacFunding || 0) > 0 && (
                      <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: red, fontWeight: 500 }}>
                        {fmtMoney(pol.israelLobbyTotal || pol.aipacFunding || 0)} Israel Lobby
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── UPDATE LOG ── */}
      <section style={{ padding: '3.5rem 2rem', borderTop: `1px solid ${border}` }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', textAlign: 'center' }}>
            Platform Updates
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {UPDATE_LOG.map((entry, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '1rem',
                padding: '0.9rem 0',
                borderBottom: i < UPDATE_LOG.length - 1 ? `1px solid ${border}` : 'none',
              }}>
                <span style={{ fontSize: '0.75rem', color: textMuted, minWidth: '50px', fontFamily: mono }}>{entry.date}</span>
                <span style={{
                  fontSize: '0.6rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '4px',
                  background: entry.tag === 'New' ? accentDim : 'rgba(34,197,94,0.12)',
                  color: entry.tag === 'New' ? accent : green, minWidth: '36px', textAlign: 'center',
                }}>{entry.tag}</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{entry.title}</span>
                  <span style={{ color: textMuted, fontSize: '0.8rem' }}> &mdash; {entry.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        padding: '2rem', textAlign: 'center', borderTop: `1px solid ${border}`,
        background: '#0c0c0f',
      }}>
        <div style={{ fontSize: '0.8rem', color: textMuted, marginBottom: '0.5rem' }}>
          <span style={{ fontWeight: 600, color: textSecondary }}>SNITCHED.AI</span> &mdash; Public intelligence from public records
        </div>
        <div style={{ fontSize: '0.7rem', color: textMuted }}>
          FEC &middot; LDA Senate &middot; LegiScan &middot; Track AIPAC &middot; CourtListener &middot;&nbsp;
          <Link href="/about" style={{ color: accent, textDecoration: 'none' }}>Methodology</Link>
        </div>
      </footer>
    </div>
  );
}

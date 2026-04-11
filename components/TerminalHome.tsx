'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import type { Politician } from '@/lib/types';
import { getStateName } from '@/lib/state-utils';
import { useTerminal } from './TerminalContext';

const USMap = dynamic(() => import('./USMap'), { ssr: false });

const STATES_WITH_DATA = [
  { code: 'FL', name: 'Florida' }, { code: 'OH', name: 'Ohio' },
  { code: 'CA', name: 'California' }, { code: 'TX', name: 'Texas' },
  { code: 'NY', name: 'New York' }, { code: 'GA', name: 'Georgia' },
  { code: 'PA', name: 'Pennsylvania' }, { code: 'IL', name: 'Illinois' },
  { code: 'NC', name: 'North Carolina' }, { code: 'MI', name: 'Michigan' },
  { code: 'NJ', name: 'New Jersey' },
];

// UPDATES are built dynamically — numbers come from platformStats (refreshed every 12h)
function buildUpdates(ps: Record<string, number>) {
  const states = ps['total_states'] || 0;
  const pols = ps['total_politicians'] || 0;
  const funded = ps['total_funded'] || 0;
  const funds = ps['total_campaign_funds'] || 0;
  const fundsLabel = funds >= 1e9 ? `$${(funds / 1e9).toFixed(1)}B` : funds >= 1e6 ? `$${(funds / 1e6).toFixed(0)}M` : `$${(funds / 1e3).toFixed(0)}K`;
  return [
    { date: 'APR 11', title: 'State Filtering', desc: 'Filter all pages by state via dropdown', tag: 'NEW' },
    { date: 'APR 10', title: 'National Expansion', desc: `${states} states, ${pols.toLocaleString()}+ politicians`, tag: 'DATA' },
    { date: 'APR 10', title: 'Financial Enrichment', desc: `${funded.toLocaleString()} officials with real campaign finance (${fundsLabel})`, tag: 'DATA' },
    { date: 'APR 10', title: 'Corruption Score v4', desc: '4-factor scoring, Israel lobby instant flag', tag: 'NEW' },
    { date: 'APR 09', title: 'Connections Graph', desc: 'Interactive donor-politician network visualization', tag: 'NEW' },
  ];
}

// ── Colors ──
const g = '#00FF41';       // matrix green
const gDim = '#00cc33';    // dimmer green
const gFaint = 'rgba(0,255,65,0.06)';
const gBorder = 'rgba(0,255,65,0.15)';
const gGlow = 'rgba(0,255,65,0.25)';
const r = '#FF0844';
const amber = '#FFB627';
const bg0 = '#000000';
const bg1 = '#0a0f0a';
const bg2 = '#0d140d';
const cardBg = 'rgba(0,255,65,0.03)';
const borderC = 'rgba(0,255,65,0.12)';
const txt = '#c8d6c8';
const txtDim = '#6b8a6b';
const txtMuted = '#3d5a3d';
const mono = "'JetBrains Mono', 'Courier New', monospace";

interface TerminalHomeProps {
  initialPoliticians: Politician[];
  selectedState?: string | null;
  platformStats?: Record<string, number>;
}

export default function TerminalHome({ initialPoliticians, selectedState, platformStats = {} }: TerminalHomeProps) {
  const router = useRouter();
  const { entered, enter } = useTerminal();
  const [nameQuery, setNameQuery] = useState('');
  const [zipQuery, setZipQuery] = useState('');
  const [nameSuggestions, setNameSuggestions] = useState<Politician[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const sugRef = useRef<HTMLDivElement>(null);
  const [cursorVisible, setCursorVisible] = useState(true);



  const politicians = initialPoliticians;
  const active = politicians.filter(p => p.isActive);
  const totalFunding = active.reduce((s, p) => s + (p.totalFundsRaised || 0), 0);
  const israelTotal = active.reduce((s, p) => s + (p.israelLobbyTotal || p.aipacFunding || 0), 0);
  const withFunding = politicians.filter(p => (p.totalFundsRaised || 0) > 0).length;

  const statesWithCounts = STATES_WITH_DATA.map(s => {
    const count = politicians.filter(p => {
      const pre = p.id.slice(0, 2).toLowerCase();
      if (pre === s.code.toLowerCase() && p.id[2] === '-') return true;
      if (s.code === 'FL' && p.id[2] !== '-') return true;
      return false;
    }).length;
    return { ...s, count };
  });

  // Cursor blink
  useEffect(() => {
    const t = setInterval(() => setCursorVisible(v => !v), 530);
    return () => clearInterval(t);
  }, []);




  const handleNameSearch = useCallback((q: string) => {
    setNameQuery(q);
    if (q.length < 2) { setNameSuggestions([]); setShowSuggestions(false); return; }
    const low = q.toLowerCase();
    const m = politicians.filter(p => p.name.toLowerCase().includes(low))
      .sort((a, b) => {
        const aS = a.name.toLowerCase().startsWith(low) ? 0 : 1;
        const bS = b.name.toLowerCase().startsWith(low) ? 0 : 1;
        return aS - bS || a.name.localeCompare(b.name);
      }).slice(0, 8);
    setNameSuggestions(m);
    setShowSuggestions(m.length > 0);
  }, [politicians]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (sugRef.current && !sugRef.current.contains(e.target as Node) &&
          nameRef.current && !nameRef.current.contains(e.target as Node)) setShowSuggestions(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const handleZip = (e: React.FormEvent) => { e.preventDefault(); if (zipQuery.trim()) router.push(`/zip?zip=${encodeURIComponent(zipQuery.trim())}`); };
  const handleName = (e: React.FormEvent) => { e.preventDefault(); if (nameQuery.trim()) router.push(`/browse?q=${encodeURIComponent(nameQuery.trim())}`); };
  const fmtM = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${(n / 1e3).toFixed(0)}K`;

  const topCorrupt = [...active].sort((a, b) => b.corruptionScore - a.corruptionScore).slice(0, 6);
  const topIsrael = [...active].filter(p => (p.israelLobbyTotal || 0) > 0)
    .sort((a, b) => (b.israelLobbyTotal || 0) - (a.israelLobbyTotal || 0)).slice(0, 5);

  // ══════════════════════════════════════════════════════════════
  // TERMINAL DASHBOARD (after "Enter Terminal")
  // ══════════════════════════════════════════════════════════════
  if (entered) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--terminal-bg)', color: 'var(--terminal-text)' }}>
        <div className="terminal-title"><div>
          <h1>{selectedState && selectedState !== 'ALL' ? `${getStateName(selectedState).toUpperCase()} CORRUPTION INDEX` : 'SNITCHED.AI - CORRUPTION INDEX'}</h1>
          <div className="terminal-subtitle">{politicians.length.toLocaleString()} politicians | ${(totalFunding / 1e6).toFixed(0)}M+ tracked | Real-time OSINT</div>
        </div></div>

        <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--terminal-border)', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <form onSubmit={handleName} style={{ flex: '1 1 300px', position: 'relative' }}>
            <div style={{ display: 'flex', background: 'var(--terminal-card)', border: '1px solid var(--terminal-border)' }}>
              <input ref={nameRef} type="text" placeholder="Search by name..." value={nameQuery}
                onChange={e => handleNameSearch(e.target.value)} onFocus={() => nameSuggestions.length > 0 && setShowSuggestions(true)}
                style={{ flex: 1, padding: '0.7rem 1rem', background: 'transparent', border: 'none', color: 'var(--terminal-text)', fontFamily: mono, fontSize: '0.8rem', outline: 'none' }} />
              <button type="submit" style={{ padding: '0.7rem 1rem', background: 'var(--terminal-blue)', border: 'none', color: '#000', fontFamily: mono, fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}>SEARCH</button>
            </div>
            {showSuggestions && (
              <div ref={sugRef} style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--terminal-card)', border: '1px solid var(--terminal-border)', maxHeight: '280px', overflowY: 'auto' }}>
                {nameSuggestions.map(p => (
                  <Link key={p.id} href={`/politician/${p.id}`} onClick={() => setShowSuggestions(false)}
                    style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.75rem', textDecoration: 'none', color: 'inherit', borderBottom: '1px solid var(--terminal-border)', fontSize: '0.8rem' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,191,255,0.08)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <div><div style={{ fontWeight: 600, color: 'var(--terminal-blue)' }}>{p.name}</div><div style={{ fontSize: '0.65rem', color: 'var(--terminal-text-dim)' }}>{p.office}</div></div>
                    <span style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', background: p.party === 'Republican' ? '#dc2626' : '#2563eb', color: '#fff', fontWeight: 600, alignSelf: 'center' }}>{p.party === 'Republican' ? 'R' : 'D'}</span>
                  </Link>
                ))}
              </div>
            )}
          </form>
        </div>

        <div style={{ display: 'flex', gap: '2rem', padding: '2rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 500px' }}>
            <h2 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--terminal-red)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem' }}>HIGHEST CORRUPTION SCORES</h2>
            <div className="data-grid" style={{ padding: 0 }}>
              {topCorrupt.map(pol => (
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
          {topIsrael.length > 0 && (
            <div style={{ flex: '0 0 300px' }}>
              <h2 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--terminal-red)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem' }}>ISRAEL LOBBY TOP</h2>
              {topIsrael.map((pol, i) => (
                <Link key={pol.id} href={`/politician/${pol.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', borderBottom: '1px solid var(--terminal-border)', fontSize: '0.8rem' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.05)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <div><span style={{ color: 'var(--terminal-text-dim)', marginRight: '0.5rem' }}>#{i + 1}</span>{pol.name}</div>
                    <span style={{ color: 'var(--terminal-red)', fontWeight: 700, fontFamily: 'Bebas Neue', fontSize: '1.1rem' }}>{fmtM(pol.israelLobbyTotal || 0)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="classified-footer">PUBLIC RECORDS: FEC // STATE ELECTIONS // LDA SENATE // LEGISCAN // COURTLISTENER // <Link href="/about" style={{ color: '#fff', textDecoration: 'underline' }}>METHODOLOGY</Link></div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // LANDING PAGE — green terminal aesthetic, polished
  // ══════════════════════════════════════════════════════════════
  return (
    <div style={{ minHeight: '100vh', background: bg0, color: txt, fontFamily: mono, overflowX: 'hidden', position: 'relative' }}>

      {/* ── MATRIX RAIN BACKGROUND (full page) ── */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {/* Falling columns of corruption-related text */}
        {Array.from({ length: 28 }).map((_, col) => {
          const words = [
            'AIPAC', '$$$', 'PAC', 'LOBBY', 'BRIBE', 'DARK$', 'FEC', 'FRAUD',
            'DONOR', 'CORP', 'SHELL', 'SUPER', 'IE$$', 'BUNDL', 'K ST',
            '$10K', '$50K', '$1M', '$5M', 'LAUND', 'QUID', 'KICKB',
            'FARA', 'AGENT', 'FOREI', 'MONEY', 'INFLU', 'CORRU',
            'SNITCH', 'TRACE', 'EXPOS', 'FUND$', 'HIDE', 'LIE',
            'STEAL', 'POWER', 'GREED', 'SELL', 'BETRY', 'OWNED',
          ];
          const isRed = col % 5 === 0; // Every 5th column is red (danger)
          const colColor = isRed ? 'rgba(255,8,68,' : 'rgba(0,255,65,';
          const left = (col / 28 * 100) + (Math.sin(col * 7) * 1.5);
          const duration = 12 + (col % 7) * 3;
          const delay = (col * 0.7) % 8;
          const chars = Array.from({ length: 8 + (col % 5) }).map((_, i) => words[(col * 3 + i) % words.length]);

          return (
            <div key={col} style={{
              position: 'absolute',
              left: `${left}%`,
              top: '-200px',
              fontSize: '0.6rem',
              fontFamily: mono,
              lineHeight: '1.8em',
              letterSpacing: '0.05em',
              whiteSpace: 'nowrap',
              animation: `matrixFall ${duration}s linear ${delay}s infinite`,
              willChange: 'transform',
            }}>
              {chars.map((ch, i) => (
                <div key={i} style={{
                  color: `${colColor}${i === 0 ? '0.5' : i < 3 ? '0.2' : '0.07'})`,
                  textShadow: i === 0 ? `0 0 8px ${colColor}0.6)` : 'none',
                }}>{ch}</div>
              ))}
            </div>
          );
        })}
        {/* CSS animation injected via style tag */}
        <style>{`
          @keyframes matrixFall {
            0% { transform: translateY(-200px); }
            100% { transform: translateY(110vh); }
          }
        `}</style>
      </div>

      {/* All content sits above the matrix rain */}
      <div style={{ position: 'relative', zIndex: 1 }}>

      {/* ── HERO ── */}
      <section style={{
        position: 'relative', padding: '5rem 1.5rem 3.5rem', textAlign: 'center',
        background: `radial-gradient(ellipse 70% 50% at 50% 0%, rgba(0,255,65,0.07) 0%, transparent 70%), ${bg0}`,
      }}>
        {/* Scanlines */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.03,
          background: 'repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(0,255,65,0.08) 2px, rgba(0,255,65,0.08) 4px)',
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', maxWidth: '780px', margin: '0 auto' }}>
          {/* Status line */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.3rem 1rem', marginBottom: '2rem',
            border: `1px solid ${gBorder}`, fontSize: '0.65rem', color: g,
            letterSpacing: '0.15em', textTransform: 'uppercase',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: g, boxShadow: `0 0 8px ${g}`, display: 'inline-block' }} />
            SYSTEM ONLINE &mdash; {politicians.length.toLocaleString()} TARGETS LOADED
          </div>

          {/* Title */}
          <h1 style={{
            fontSize: 'clamp(2.2rem, 7vw, 4.5rem)', fontWeight: 700, lineHeight: 1.05,
            marginBottom: '1.5rem', letterSpacing: '-0.01em',
          }}>
            {selectedState && selectedState !== 'ALL' ? (
              <>
                <span style={{ color: g, textShadow: `0 0 30px ${gGlow}` }}>{getStateName(selectedState).toUpperCase()}</span>
                <br />
                <span style={{ color: txt }}>CORRUPTION INDEX</span>
              </>
            ) : (
              <>
                <span style={{ color: g, textShadow: `0 0 30px ${gGlow}` }}>SNITCHED</span>
                <span style={{ color: txtDim }}>.AI</span>
              </>
            )}
          </h1>

          {/* Tagline */}
          <p style={{
            fontSize: '0.95rem', color: txtDim, lineHeight: 1.7,
            maxWidth: '520px', margin: '0 auto 2.5rem', fontWeight: 400,
          }}>
            {selectedState && selectedState !== 'ALL'
              ? `Every politician in ${getStateName(selectedState)}. Every dollar traced. Every connection mapped.`
              : 'Track political corruption, foreign lobby influence, and campaign finance. Every dollar traced from public records.'}
          </p>

          {/* ── Search Bars ── */}
          <div style={{ display: 'flex', gap: '0.75rem', maxWidth: '640px', margin: '0 auto 2.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            {/* Name */}
            <form onSubmit={handleName} style={{ flex: '1 1 340px', position: 'relative' }}>
              <div style={{
                display: 'flex', alignItems: 'center',
                background: bg1, border: `1px solid ${borderC}`,
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
                onFocus={() => {}} /* parent styling handled by input */
              >
                <span style={{ padding: '0 0 0 0.9rem', color: g, fontSize: '0.8rem', opacity: 0.6 }}>$</span>
                <input ref={nameRef} type="text" placeholder="search --name &quot;politician&quot;"
                  value={nameQuery} onChange={e => handleNameSearch(e.target.value)}
                  onFocus={e => { e.currentTarget.parentElement!.style.borderColor = g; e.currentTarget.parentElement!.style.boxShadow = `0 0 12px ${gGlow}`; nameSuggestions.length > 0 && setShowSuggestions(true); }}
                  onBlur={e => { e.currentTarget.parentElement!.style.borderColor = borderC; e.currentTarget.parentElement!.style.boxShadow = 'none'; }}
                  style={{
                    flex: 1, padding: '0.85rem 0.5rem', background: 'transparent', border: 'none',
                    color: g, fontFamily: mono, fontSize: '0.8rem', outline: 'none', caretColor: g,
                  }} />
                <button type="submit" style={{
                  padding: '0.85rem 1.1rem', background: g, border: 'none', color: bg0,
                  fontFamily: mono, fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
                  letterSpacing: '0.05em',
                }}>RUN</button>
              </div>
              {showSuggestions && (
                <div ref={sugRef} style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                  background: '#0a120a', border: `1px solid ${gBorder}`, borderTop: 'none',
                  maxHeight: '300px', overflowY: 'auto', boxShadow: `0 8px 30px rgba(0,0,0,0.8)`,
                }}>
                  {nameSuggestions.map(p => (
                    <Link key={p.id} href={`/politician/${p.id}`} onClick={() => setShowSuggestions(false)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '0.6rem 0.9rem', textDecoration: 'none', color: txt,
                        borderBottom: `1px solid ${borderC}`, fontSize: '0.8rem',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = gFaint)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <div>
                        <div style={{ fontWeight: 600, color: g }}>{p.name}</div>
                        <div style={{ fontSize: '0.65rem', color: txtDim }}>{p.office} &middot; {p.party}</div>
                      </div>
                      <span style={{
                        fontSize: '0.6rem', padding: '0.15rem 0.45rem',
                        background: p.party === 'Republican' ? 'rgba(255,8,68,0.2)' : 'rgba(0,255,65,0.15)',
                        color: p.party === 'Republican' ? r : g, fontWeight: 700,
                      }}>{p.party === 'Republican' ? 'R' : 'D'}</span>
                    </Link>
                  ))}
                </div>
              )}
            </form>

            {/* ZIP */}
            <form onSubmit={handleZip} style={{ flex: '0 1 200px' }}>
              <div style={{
                display: 'flex', alignItems: 'center',
                background: bg1, border: `1px solid ${borderC}`,
              }}>
                <span style={{ padding: '0 0 0 0.9rem', color: g, fontSize: '0.8rem', opacity: 0.6 }}>#</span>
                <input type="text" placeholder="ZIP code" value={zipQuery}
                  onChange={e => setZipQuery(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  maxLength={5} inputMode="numeric"
                  onFocus={e => { e.currentTarget.parentElement!.style.borderColor = g; }}
                  onBlur={e => { e.currentTarget.parentElement!.style.borderColor = borderC; }}
                  style={{
                    flex: 1, padding: '0.85rem 0.5rem', background: 'transparent', border: 'none',
                    color: g, fontFamily: mono, fontSize: '0.8rem', outline: 'none', caretColor: g,
                    letterSpacing: '0.15em',
                  }} />
                <button type="submit" style={{
                  padding: '0.85rem 0.9rem', background: 'transparent', border: 'none',
                  borderLeft: `1px solid ${borderC}`,
                  color: g, fontFamily: mono, fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
                }}>GO</button>
              </div>
            </form>
          </div>

          {/* ── Stats ── */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '2.5rem', flexWrap: 'wrap' }}>
            {[
              { v: politicians.length.toLocaleString(), l: 'TRACKED', c: g },
              { v: fmtM(totalFunding), l: 'FUNDS', c: gDim },
              { v: fmtM(israelTotal), l: 'ISRAEL LOBBY', c: r },
              { v: `${withFunding}`, l: 'WITH DATA', c: amber },
            ].map(s => (
              <div key={s.l} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 700, color: s.c, lineHeight: 1, textShadow: s.c === g ? `0 0 15px ${gGlow}` : 'none' }}>{s.v}</div>
                <div style={{ fontSize: '0.55rem', color: txtMuted, marginTop: '0.35rem', letterSpacing: '0.2em' }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── INTEL FEED + US MAP ── */}
      <section style={{ padding: '3rem 1.5rem', borderTop: `1px solid ${borderC}`, background: bg1 }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>

          {/* LEFT: US Map */}
          <div style={{ flex: '1 1 400px' }}>
            <div style={{ fontSize: '0.6rem', color: txtMuted, letterSpacing: '0.2em', marginBottom: '0.3rem' }}>COVERAGE.map</div>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: g, marginBottom: '1rem' }}>
              Active Surveillance
              <span style={{ color: cursorVisible ? g : 'transparent', marginLeft: 2 }}>_</span>
            </h2>
            {/* Real Leaflet US Map */}
            <USMap onStateClick={(code) => router.push(`/?state=${code}`)} />
            {/* Legend */}
            <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', marginTop: '0.75rem', fontSize: '0.6rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <div style={{ width: 8, height: 8, background: g, boxShadow: `0 0 6px ${g}`, borderRadius: '50%' }} />
                <span style={{ color: g }}>ACTIVE SURVEILLANCE</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <div style={{ width: 8, height: 8, background: 'rgba(0,255,65,0.15)', border: `1px solid ${gBorder}` }} />
                <span style={{ color: txtDim }}>DATA COLLECTED</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <div style={{ width: 8, height: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }} />
                <span style={{ color: txtMuted }}>PENDING</span>
              </div>
            </div>
          </div>



        </div>
      </section>

      {/* ── STATE SELECTOR ── */}
      <section style={{ padding: '3rem 1.5rem', borderTop: `1px solid ${borderC}`, background: bg1 }}>
        <div style={{ maxWidth: '780px', margin: '0 auto' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.6rem', color: txtMuted, letterSpacing: '0.2em', marginBottom: '0.3rem' }}>SELECT TARGET</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: g }}>
              Enter your state
              <span style={{ color: cursorVisible ? g : 'transparent', marginLeft: 2 }}>_</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.5rem' }}>
            {statesWithCounts.map(s => (
              <button key={s.code} onClick={() => router.push(`/?state=${s.code}`)}
                style={{
                  padding: '0.8rem 0.7rem', background: cardBg, border: `1px solid ${borderC}`,
                  color: txt, fontFamily: mono, fontSize: '0.75rem', cursor: 'pointer',
                  transition: 'all 0.15s', textAlign: 'left',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = g; e.currentTarget.style.background = gFaint; e.currentTarget.style.boxShadow = `0 0 10px ${gGlow}`; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = borderC; e.currentTarget.style.background = cardBg; e.currentTarget.style.boxShadow = 'none'; }}>
                <div>
                  <div style={{ fontWeight: 700, color: g, fontSize: '0.85rem' }}>{s.code}</div>
                  <div style={{ fontSize: '0.6rem', color: txtDim }}>{s.name}</div>
                </div>
                <div style={{ fontSize: '0.65rem', color: txtMuted, fontVariantNumeric: 'tabular-nums' }}>
                  {s.count > 0 ? s.count.toLocaleString() : '---'}
                </div>
              </button>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <button onClick={enter}
              style={{
                padding: '0.75rem 2rem', background: 'transparent', border: `1px solid ${g}`,
                color: g, fontFamily: mono, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                letterSpacing: '0.1em', transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = g; e.currentTarget.style.color = bg0; e.currentTarget.style.boxShadow = `0 0 20px ${gGlow}`; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = g; e.currentTarget.style.boxShadow = 'none'; }}>
              ENTER TERMINAL &gt;
            </button>
          </div>
        </div>
      </section>

      {/* ── MISSION ── */}
      <section style={{ padding: '3.5rem 1.5rem', borderTop: `1px solid ${borderC}` }}>
        <div style={{ maxWidth: '780px', margin: '0 auto' }}>
          <div style={{ fontSize: '0.6rem', color: txtMuted, letterSpacing: '0.2em', marginBottom: '0.3rem' }}>MISSION.md</div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: g, marginBottom: '0.5rem' }}>
            America First. Anti-Corruption.
          </h2>
          <h3 style={{ fontSize: '1rem', fontWeight: 400, color: txt, marginBottom: '1.5rem' }}>
            Exposing foreign influence over American politicians.
          </h3>

          <div style={{ marginBottom: '2rem', padding: '1.5rem', borderLeft: `3px solid ${r}`, background: 'rgba(255,8,68,0.04)' }}>
            <p style={{ fontSize: '0.85rem', color: txt, lineHeight: 1.9, marginBottom: '0.8rem' }}>
              American politicians should serve <span style={{ color: g, fontWeight: 700 }}>American citizens</span> &mdash; not foreign governments, not foreign lobbies, not the highest bidder. Yet billions of dollars flow from foreign-aligned PACs, lobby organizations, and dark money groups directly into the campaigns of the people who write our laws.
            </p>
            <p style={{ fontSize: '0.85rem', color: txt, lineHeight: 1.9 }}>
              Snitched.ai exists to <span style={{ color: r, fontWeight: 700 }}>expose every dollar</span>. We track who takes money from AIPAC, the Israel lobby, and foreign-aligned PACs. We score every politician on corruption. We map every connection between donors, lobbyists, and the officials they own. <span style={{ color: g }}>All from public records. All verifiable. All free.</span>
            </p>
          </div>

          {/* Core values */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            {[
              { icon: '&#127482;&#127480;', title: 'AMERICA FIRST', desc: 'American tax dollars and policy decisions should serve American interests &mdash; not foreign governments or their lobbying arms.', c: g },
              { icon: '&#128683;', title: 'ANTI-ZIONIST LOBBY', desc: 'AIPAC and its network spend hundreds of millions to buy American politicians. We track every dollar of their influence operation.', c: r },
              { icon: '&#128274;', title: 'RADICAL TRANSPARENCY', desc: 'Every data point sourced from public FEC filings, lobbying disclosures, and voting records. Fully verifiable, fully open.', c: amber },
              { icon: '&#9878;&#65039;', title: 'CORRUPTION SCORING', desc: 'Proprietary 0-100 scoring algorithm analyzing PAC ratios, lobby connections, voting alignment with donors, and financial red flags.', c: g },
              { icon: '&#128376;&#65039;', title: 'CONNECTION MAPPING', desc: 'Interactive network graphs showing who funds who, which donors cross party lines, and how lobby money flows through the system.', c: '#00cc33' },
              { icon: '&#128202;', title: 'STATE DASHBOARDS', desc: 'Deep-dive dashboards for every state &mdash; party breakdown, top corrupt officials, Israel lobby recipients, and fundraising leaders.', c: amber },
            ].map(c => (
              <div key={c.title} style={{
                padding: '1.25rem', background: cardBg, border: `1px solid ${borderC}`,
                transition: 'border-color 0.2s',
              }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = c.c)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = borderC)}>
                <div style={{ fontSize: '1.4rem', marginBottom: '0.6rem' }} dangerouslySetInnerHTML={{ __html: c.icon }} />
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: c.c, marginBottom: '0.5rem', letterSpacing: '0.1em' }}>{c.title}</div>
                <p style={{ fontSize: '0.72rem', color: txtDim, lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: c.desc }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={{ padding: '3rem 1.5rem', borderTop: `1px solid ${borderC}`, background: bg1 }}>
        <div style={{ maxWidth: '780px', margin: '0 auto' }}>
          <div style={{ fontSize: '0.6rem', color: txtMuted, letterSpacing: '0.2em', marginBottom: '0.3rem' }}>PIPELINE.md</div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: g, marginBottom: '1.5rem' }}>How It Works</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {[
              { step: '01', title: 'DATA INGESTION', desc: 'Automated scrapers pull FEC filings, state election data, LDA lobbying disclosures, and court records daily.', c: g },
              { step: '02', title: 'ENTITY RESOLUTION', desc: 'Politicians matched across FEC, Congress, state databases, and lobby filings. Donors linked to PACs and organizations.', c: g },
              { step: '03', title: 'CORRUPTION ANALYSIS', desc: 'Every politician scored on 4 factors: PAC funding ratio, lobby connections, donor voting alignment, and financial red flags.', c: amber },
              { step: '04', title: 'ISRAEL LOBBY FLAGGING', desc: 'Automatic detection of AIPAC PAC money, Israel lobby bundled donations, and pro-Israel independent expenditures.', c: r },
              { step: '05', title: 'PUBLIC INTELLIGENCE', desc: 'Results published on searchable dashboards, connection maps, and corruption leaderboards. Updated every 24 hours.', c: g },
            ].map((s, i, arr) => (
              <div key={s.step} style={{
                display: 'flex', gap: '1rem', padding: '1rem 0',
                borderBottom: i < arr.length - 1 ? `1px solid ${borderC}` : 'none',
              }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: s.c, minWidth: '32px', opacity: 0.5 }}>{s.step}</div>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: s.c, marginBottom: '0.3rem', letterSpacing: '0.08em' }}>{s.title}</div>
                  <p style={{ fontSize: '0.72rem', color: txtDim, lineHeight: 1.7 }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DATA SOURCES ── */}
      <section style={{ padding: '2.5rem 1.5rem', borderTop: `1px solid ${borderC}` }}>
        <div style={{ maxWidth: '780px', margin: '0 auto' }}>
          <div style={{ fontSize: '0.6rem', color: txtMuted, letterSpacing: '0.2em', marginBottom: '0.3rem' }}>SOURCES.md</div>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: g, marginBottom: '1.25rem' }}>Verified Data Sources</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.6rem' }}>
            {[
              { name: 'FEC', full: 'Federal Election Commission', desc: 'Campaign contributions, PAC filings, independent expenditures. Updated daily.' },
              { name: 'LDA', full: 'Lobbying Disclosure Act', desc: 'Registered lobbyist filings, client relationships, income reports.' },
              { name: 'LegiScan', full: 'State Legislature Records', desc: 'Roll call votes, bill sponsorships, voting record analysis.' },

              { name: 'CourtListener', full: 'Federal Court Records', desc: 'Court cases, legal proceedings, judicial records.' },
              { name: 'Congress.gov', full: 'Congressional Data', desc: 'Member profiles, committee assignments, legislative activity.' },
            ].map(s => (
              <div key={s.name} style={{ padding: '0.9rem', background: cardBg, border: `1px solid ${borderC}` }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: g, marginBottom: '0.15rem' }}>{s.name}</div>
                <div style={{ fontSize: '0.55rem', color: txtMuted, letterSpacing: '0.08em', marginBottom: '0.3rem' }}>{s.full}</div>
                <div style={{ fontSize: '0.65rem', color: txtDim, lineHeight: 1.5 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TOP CORRUPTION ── */}
      {topCorrupt.length > 0 && (
        <section style={{ padding: '3rem 1.5rem', borderTop: `1px solid ${borderC}`, background: bg1 }}>
          <div style={{ maxWidth: '780px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ fontSize: '0.6rem', color: txtMuted, letterSpacing: '0.2em', marginBottom: '0.2rem' }}>THREAT ASSESSMENT</div>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, color: r }}>Highest Corruption Scores</h2>
              </div>
              <button onClick={enter} style={{ background: 'none', border: 'none', color: g, fontFamily: mono, fontSize: '0.7rem', cursor: 'pointer' }}>VIEW ALL &gt;</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.6rem' }}>
              {topCorrupt.map(pol => (
                <Link key={pol.id} href={`/politician/${pol.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ padding: '1rem', background: cardBg, border: `1px solid ${borderC}`, transition: 'all 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = r; e.currentTarget.style.boxShadow = `0 0 10px rgba(255,8,68,0.15)`; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = borderC; e.currentTarget.style.boxShadow = 'none'; }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.8rem', color: txt }}>{pol.name}</div>
                        <div style={{ fontSize: '0.6rem', color: txtDim, marginTop: '0.1rem' }}>{pol.office}</div>
                      </div>
                      <span style={{ fontSize: '0.55rem', padding: '0.1rem 0.4rem', alignSelf: 'start', background: pol.party === 'Republican' ? 'rgba(255,8,68,0.15)' : gFaint, color: pol.party === 'Republican' ? r : g, fontWeight: 700 }}>{pol.party === 'Republican' ? 'R' : 'D'}</span>
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 700, color: pol.corruptionScore >= 60 ? r : pol.corruptionScore >= 40 ? amber : g, lineHeight: 1 }}>
                      {pol.corruptionScore}<span style={{ fontSize: '0.6rem', color: txtMuted }}>/100</span>
                    </div>
                    {(pol.israelLobbyTotal || pol.aipacFunding || 0) > 0 && (
                      <div style={{ marginTop: '0.4rem', fontSize: '0.65rem', color: r }}>{fmtM(pol.israelLobbyTotal || pol.aipacFunding || 0)} ISRAEL LOBBY</div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── PLATFORM FEATURES ── */}
      <section style={{ padding: '3rem 1.5rem', borderTop: `1px solid ${borderC}` }}>
        <div style={{ maxWidth: '780px', margin: '0 auto' }}>
          <div style={{ fontSize: '0.6rem', color: txtMuted, letterSpacing: '0.2em', marginBottom: '0.3rem' }}>FEATURES.md</div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: g, marginBottom: '1.5rem' }}>Platform Features</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            {[
              'State-by-state corruption dashboards',
              'Politician search by name or ZIP code',
              'Israel lobby funding tracker (AIPAC, UDP, DMFI)',
              'Interactive donor-politician connection maps',
              'Corruption scoring algorithm (0-100)',
              'Federal, state, county & municipal coverage',
              'Campaign finance breakdown per politician',
              'Party affiliation & voting record analysis',
              'Court case & legal proceeding records',
              'Real-time data from 6 verified sources',
              'Compare politicians side-by-side',
              'Government hierarchy drill-down',
            ].map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'start', gap: '0.5rem', padding: '0.4rem 0', fontSize: '0.72rem' }}>
                <span style={{ color: g, fontSize: '0.6rem', marginTop: '0.15rem' }}>&#9654;</span>
                <span style={{ color: txt }}>{f}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── UPDATE LOG ── */}
      <section style={{ padding: '3rem 1.5rem', borderTop: `1px solid ${borderC}`, background: bg1 }}>
        <div style={{ maxWidth: '780px', margin: '0 auto' }}>
          <div style={{ fontSize: '0.6rem', color: txtMuted, letterSpacing: '0.2em', marginBottom: '0.3rem' }}>CHANGELOG</div>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: g, marginBottom: '1.25rem' }}>Platform Updates</h2>

          {buildUpdates(platformStats).map((u, i, arr) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'baseline', gap: '0.75rem', padding: '0.6rem 0',
              borderBottom: i < arr.length - 1 ? `1px solid ${borderC}` : 'none', fontSize: '0.75rem',
            }}>
              <span style={{ color: txtMuted, minWidth: '48px', fontSize: '0.6rem' }}>{u.date}</span>
              <span style={{
                fontSize: '0.55rem', fontWeight: 700, padding: '0.1rem 0.4rem', minWidth: '32px', textAlign: 'center',
                background: u.tag === 'NEW' ? gFaint : 'rgba(255,182,39,0.08)',
                color: u.tag === 'NEW' ? g : amber,
                border: `1px solid ${u.tag === 'NEW' ? gBorder : 'rgba(255,182,39,0.2)'}`,
              }}>{u.tag}</span>
              <div>
                <span style={{ fontWeight: 600, color: txt }}>{u.title}</span>
                <span style={{ color: txtDim }}> &mdash; {u.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ padding: '3rem 1.5rem', borderTop: `1px solid ${borderC}`, textAlign: 'center' }}>
        <div style={{ maxWidth: '500px', margin: '0 auto' }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: g, marginBottom: '0.5rem', textShadow: `0 0 20px ${gGlow}` }}>
            Ready to see who owns your politicians?
          </div>
          <p style={{ fontSize: '0.75rem', color: txtDim, marginBottom: '1.5rem', lineHeight: 1.6 }}>
            Enter the terminal to access the full corruption database, connection maps, and state dashboards.
          </p>
          <button onClick={enter}
            style={{
              padding: '0.9rem 2.5rem', background: g, border: 'none',
              color: bg0, fontFamily: mono, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
              letterSpacing: '0.1em', boxShadow: `0 0 25px ${gGlow}`, transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 0 40px ${gGlow}, 0 0 80px rgba(0,255,65,0.1)`; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = `0 0 25px ${gGlow}`; }}>
            ENTER TERMINAL &gt;
          </button>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        padding: '2rem 1.5rem', textAlign: 'center', borderTop: `1px solid ${borderC}`,
        background: bg1, fontSize: '0.65rem',
      }}>
        <div style={{ color: g, fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.5rem' }}>SNITCHED.AI</div>
        <div style={{ color: txtDim, marginBottom: '0.75rem', lineHeight: 1.6, maxWidth: '400px', margin: '0 auto 0.75rem' }}>
          America First public intelligence platform. Tracking corruption and foreign lobby influence using verified public records.
        </div>
        <div style={{ color: txtMuted, marginBottom: '0.5rem' }}>
          FEC &middot; LDA Senate &middot; LegiScan &middot; CourtListener &middot; Congress.gov
        </div>
        <div style={{ color: txtMuted }}>
          <Link href="/about" style={{ color: g, textDecoration: 'none' }}>Methodology</Link>
          <span style={{ margin: '0 0.5rem' }}>&middot;</span>
          <span>No opinions. No partisan bias. Just data.</span>
        </div>
      </footer>
      </div>{/* end z-index wrapper */}
    </div>
  );
}

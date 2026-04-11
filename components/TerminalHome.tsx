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
  { code: 'FL', name: 'Florida', count: 0 },
  { code: 'OH', name: 'Ohio', count: 0 },
  { code: 'CA', name: 'California', count: 0 },
  { code: 'TX', name: 'Texas', count: 0 },
  { code: 'NY', name: 'New York', count: 0 },
  { code: 'GA', name: 'Georgia', count: 0 },
  { code: 'PA', name: 'Pennsylvania', count: 0 },
  { code: 'IL', name: 'Illinois', count: 0 },
  { code: 'NC', name: 'North Carolina', count: 0 },
  { code: 'MI', name: 'Michigan', count: 0 },
  { code: 'NJ', name: 'New Jersey', count: 0 },
];

const UPDATE_LOG: { date: string; title: string; description: string; type: 'feat' | 'fix' | 'data' }[] = [
  { date: '2026-04-11', title: 'State Filtering', description: 'Dropdown selector now filters all pages by state', type: 'feat' },
  { date: '2026-04-10', title: 'National Expansion', description: 'Expanded from Florida-only to 11 states with 6,700+ politicians', type: 'data' },
  { date: '2026-04-10', title: 'Ohio Full Depth', description: 'All 88 counties, 20 school districts, 17 city councils, 204 judges', type: 'data' },
  { date: '2026-04-10', title: 'Financial Enrichment', description: '1,644 officials enriched with real campaign finance data ($618M tracked)', type: 'data' },
  { date: '2026-04-10', title: 'Corruption Score v4', description: 'Israel lobby instant flag, zero placeholders, 4-factor scoring', type: 'feat' },
  { date: '2026-04-09', title: 'Connections Graph', description: 'Interactive network visualization of donor-politician relationships', type: 'feat' },
  { date: '2026-04-08', title: 'Pagination Fix', description: 'All queries now paginate past Supabase 1000-row limit', type: 'fix' },
  { date: '2026-04-07', title: 'Social Intelligence', description: 'Google News RSS scraper for politician social media monitoring', type: 'feat' },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TypewriterText({ text, speed = 40 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed('');
    setDone(false);
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return (
    <span>
      {displayed}
      {!done && <span style={{ opacity: 0.7, animation: 'pulse 1s infinite' }}>|</span>}
    </span>
  );
}

function StatCounter({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        fontSize: '2.5rem',
        fontWeight: 700,
        color,
        fontFamily: 'Bebas Neue, sans-serif',
        lineHeight: 1,
      }}>
        {value}
      </div>
      <div style={{
        fontSize: '0.65rem',
        color: 'var(--terminal-text-dim)',
        textTransform: 'uppercase',
        letterSpacing: '0.15em',
        marginTop: '0.25rem',
      }}>
        {label}
      </div>
    </div>
  );
}

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

  // Populate state counts
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

  // Name search handler
  const handleNameSearch = useCallback((query: string) => {
    setNameQuery(query);
    if (query.length < 2) {
      setNameSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const lower = query.toLowerCase();
    const matches = politicians
      .filter(p => p.name.toLowerCase().includes(lower))
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(lower) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(lower) ? 0 : 1;
        return aStarts - bStarts || a.name.localeCompare(b.name);
      })
      .slice(0, 8);
    setNameSuggestions(matches);
    setShowSuggestions(matches.length > 0);
  }, [politicians]);

  // Close suggestions on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        nameInputRef.current &&
        !nameInputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleZipSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (zipQuery.trim()) {
      router.push(`/browse?zip=${encodeURIComponent(zipQuery.trim())}`);
    }
  };

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (nameQuery.trim()) {
      router.push(`/browse?q=${encodeURIComponent(nameQuery.trim())}`);
    }
  };

  const handleStateSelect = (code: string) => {
    router.push(`/officials?state=${code}`);
  };

  const topCorrupted = [...activePoliticians]
    .sort((a, b) => b.corruptionScore - a.corruptionScore)
    .slice(0, 6);

  const topIsraelLobby = [...activePoliticians]
    .filter(p => (p.israelLobbyTotal || 0) > 0)
    .sort((a, b) => (b.israelLobbyTotal || 0) - (a.israelLobbyTotal || 0))
    .slice(0, 5);

  // ──────────────────────────────────────────────────────────────────
  // LANDING SPLASH (before the user enters the terminal)
  // ──────────────────────────────────────────────────────────────────
  if (!entered) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #000 0%, #0a1628 40%, #0d1f3c 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--terminal-text)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Grid background */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.03,
          backgroundImage: 'linear-gradient(var(--terminal-blue) 1px, transparent 1px), linear-gradient(90deg, var(--terminal-blue) 1px, transparent 1px)',
          backgroundSize: '50px 50px',
          pointerEvents: 'none',
        }} />

        {/* Scanline overlay */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.02,
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,191,255,0.03) 2px, rgba(0,191,255,0.03) 4px)',
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', textAlign: 'center', maxWidth: '700px', padding: '2rem' }}>
          {/* Status badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.4rem 1.2rem', marginBottom: '2rem',
            background: 'rgba(0, 191, 255, 0.06)', border: '1px solid rgba(0, 191, 255, 0.2)',
            fontSize: '0.65rem', color: 'var(--terminal-blue)', textTransform: 'uppercase',
            letterSpacing: '0.2em', fontWeight: 600,
          }}>
            <span style={{ color: 'var(--terminal-green)', animation: 'pulse 2s infinite' }}>&#9679;</span>
            SYSTEM ONLINE
          </div>

          {/* Logo */}
          <h1 style={{
            fontSize: 'clamp(3rem, 8vw, 5.5rem)',
            fontWeight: 700,
            lineHeight: 1,
            marginBottom: '0.5rem',
            letterSpacing: '0.02em',
          }}>
            <span style={{ color: 'var(--terminal-blue)' }}>SNITCHED</span>
            <span style={{ color: 'var(--terminal-text-dim)', fontWeight: 400 }}>.AI</span>
          </h1>

          {/* Tagline */}
          <p style={{
            fontSize: 'clamp(0.9rem, 2vw, 1.15rem)',
            color: 'var(--terminal-text-dim)',
            lineHeight: 1.7,
            marginBottom: '3rem',
            maxWidth: '550px',
            margin: '0 auto 3rem',
          }}>
            Public intelligence platform tracking political corruption, foreign lobby influence, and campaign finance across America.
          </p>

          {/* Stats row */}
          <div style={{
            display: 'flex', justifyContent: 'center', gap: '2.5rem', flexWrap: 'wrap',
            marginBottom: '3rem',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--terminal-blue)', fontFamily: 'Bebas Neue, sans-serif' }}>
                {politicians.length.toLocaleString()}
              </div>
              <div style={{ fontSize: '0.6rem', color: 'var(--terminal-text-dim)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
                Politicians Tracked
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--terminal-green)', fontFamily: 'Bebas Neue, sans-serif' }}>
                ${(totalFunding / 1000000).toFixed(0)}M
              </div>
              <div style={{ fontSize: '0.6rem', color: 'var(--terminal-text-dim)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
                Funds Tracked
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--terminal-red)', fontFamily: 'Bebas Neue, sans-serif' }}>
                ${(israelLobbyTotal / 1000000).toFixed(1)}M
              </div>
              <div style={{ fontSize: '0.6rem', color: 'var(--terminal-text-dim)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
                Israel Lobby
              </div>
            </div>
          </div>

          {/* Enter Terminal button */}
          <button
            onClick={enter}
            style={{
              padding: '1rem 3rem',
              background: 'transparent',
              border: '2px solid var(--terminal-blue)',
              color: 'var(--terminal-blue)',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.9rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.2em',
              cursor: 'pointer',
              transition: 'all 0.3s',
              position: 'relative',
              overflow: 'hidden',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--terminal-blue)';
              e.currentTarget.style.color = '#000';
              e.currentTarget.style.boxShadow = '0 0 30px rgba(0, 191, 255, 0.4)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--terminal-blue)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            ENTER TERMINAL &gt;
          </button>

          {/* Subtitle under button */}
          <p style={{
            fontSize: '0.65rem', color: 'var(--terminal-text-dim)',
            marginTop: '1.5rem', letterSpacing: '0.15em', textTransform: 'uppercase',
            opacity: 0.5,
          }}>
            No opinions. No partisan bias. Just data.
          </p>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────
  // FULL DASHBOARD (after entering the terminal)
  // ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--terminal-bg)', color: 'var(--terminal-text)' }}>

      {/* ================================================================
          HERO SECTION
          ================================================================ */}
      <section style={{
        position: 'relative',
        padding: '4rem 2rem 3rem',
        background: 'linear-gradient(180deg, #000 0%, #0a1628 60%, var(--terminal-bg) 100%)',
        borderBottom: '2px solid var(--terminal-blue)',
        overflow: 'hidden',
      }}>
        {/* Subtle grid background */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.04,
          backgroundImage: 'linear-gradient(var(--terminal-blue) 1px, transparent 1px), linear-gradient(90deg, var(--terminal-blue) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', maxWidth: '900px', margin: '0 auto', textAlign: 'center' }}>
          {/* Badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.4rem 1rem', marginBottom: '1.5rem',
            background: 'rgba(0, 191, 255, 0.08)', border: '1px solid rgba(0, 191, 255, 0.25)',
            fontSize: '0.7rem', color: 'var(--terminal-blue)', textTransform: 'uppercase',
            letterSpacing: '0.15em', fontWeight: 600,
          }}>
            <span style={{ color: 'var(--terminal-green)', animation: 'pulse 2s infinite' }}>●</span>
            PUBLIC INTELLIGENCE PLATFORM
          </div>

          {/* Title */}
          <h1 style={{
            fontSize: 'clamp(2rem, 5vw, 3.5rem)',
            fontWeight: 700,
            color: '#fff',
            letterSpacing: '0.03em',
            lineHeight: 1.1,
            marginBottom: '1rem',
          }}>
            {selectedState && selectedState !== 'ALL' ? (
              <>
                <span style={{ color: 'var(--terminal-blue)' }}>{getStateName(selectedState).toUpperCase()}</span>
                <span style={{ color: 'var(--terminal-text-dim)', fontWeight: 400 }}> CORRUPTION INDEX</span>
              </>
            ) : (
              <>
                <span style={{ color: 'var(--terminal-blue)' }}>SNITCHED</span>
                <span style={{ color: 'var(--terminal-text-dim)', fontWeight: 400 }}>.AI</span>
              </>
            )}
          </h1>

          {/* Subtitle with typewriter */}
          <div style={{
            fontSize: 'clamp(0.85rem, 2vw, 1.1rem)',
            color: 'var(--terminal-text-dim)',
            marginBottom: '2.5rem',
            lineHeight: 1.6,
            maxWidth: '650px',
            margin: '0 auto 2.5rem',
          }}>
            <TypewriterText
              text={selectedState && selectedState !== 'ALL'
                ? `Track political corruption, foreign lobby influence, and campaign finance in ${getStateName(selectedState)}. Real data from public records.`
                : "Track political corruption, foreign lobby influence, and campaign finance across America. Real data from public records — not opinions."}
              speed={25}
            />
          </div>

          {/* ── Research Bars ── */}
          <div style={{
            display: 'flex', gap: '1rem', maxWidth: '750px', margin: '0 auto 2rem',
            flexWrap: 'wrap', justifyContent: 'center',
          }}>
            {/* Name Search */}
            <form onSubmit={handleNameSubmit} style={{ flex: '1 1 340px', position: 'relative' }}>
              <div style={{
                display: 'flex', alignItems: 'center',
                background: 'rgba(26, 41, 66, 0.8)', border: '1px solid var(--terminal-border)',
                transition: 'border-color 0.2s',
              }}>
                <span style={{ padding: '0 0.75rem', color: 'var(--terminal-text-dim)', fontSize: '1rem' }}>&#128269;</span>
                <input
                  ref={nameInputRef}
                  type="text"
                  placeholder="Search politician by name..."
                  value={nameQuery}
                  onChange={e => handleNameSearch(e.target.value)}
                  onFocus={() => nameSuggestions.length > 0 && setShowSuggestions(true)}
                  style={{
                    flex: 1, padding: '0.9rem 0.5rem', background: 'transparent', border: 'none',
                    color: 'var(--terminal-text)', fontFamily: 'var(--font-terminal)', fontSize: '0.85rem',
                    outline: 'none', letterSpacing: '0.02em',
                  }}
                />
                <button type="submit" style={{
                  padding: '0.9rem 1.25rem', background: 'var(--terminal-blue)', border: 'none',
                  color: '#000', fontFamily: 'var(--font-terminal)', fontSize: '0.75rem',
                  fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer',
                  transition: 'background 0.2s',
                }}>
                  SEARCH
                </button>
              </div>
              {/* Autocomplete dropdown */}
              {showSuggestions && (
                <div ref={suggestionsRef} style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                  background: 'var(--terminal-card)', border: '1px solid var(--terminal-border)',
                  borderTop: 'none', maxHeight: '300px', overflowY: 'auto',
                  boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
                }}>
                  {nameSuggestions.map(p => (
                    <Link
                      key={p.id}
                      href={`/politician/${p.id}`}
                      onClick={() => setShowSuggestions(false)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '0.6rem 0.75rem', textDecoration: 'none', color: 'inherit',
                        borderBottom: '1px solid rgba(42, 63, 95, 0.5)',
                        fontSize: '0.8rem', transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0, 191, 255, 0.08)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--terminal-blue)' }}>{p.name}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dim)', marginTop: '0.15rem' }}>
                          {p.office} &middot; {p.party}
                        </div>
                      </div>
                      <span style={{
                        fontSize: '0.7rem', padding: '0.2rem 0.5rem',
                        background: p.party === 'Republican' ? '#dc2626' : p.party === 'Democrat' ? '#2563eb' : '#6b7280',
                        color: '#fff', fontWeight: 600,
                      }}>
                        {p.party === 'Republican' ? 'R' : p.party === 'Democrat' ? 'D' : p.party?.charAt(0)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </form>

            {/* Zipcode Search */}
            <form onSubmit={handleZipSearch} style={{ flex: '1 1 280px' }}>
              <div style={{
                display: 'flex', alignItems: 'center',
                background: 'rgba(26, 41, 66, 0.8)', border: '1px solid var(--terminal-border)',
                transition: 'border-color 0.2s',
              }}>
                <span style={{ padding: '0 0.75rem', color: 'var(--terminal-text-dim)', fontSize: '0.85rem' }}>&#128205;</span>
                <input
                  type="text"
                  placeholder="Enter ZIP code..."
                  value={zipQuery}
                  onChange={e => setZipQuery(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  maxLength={5}
                  inputMode="numeric"
                  style={{
                    flex: 1, padding: '0.9rem 0.5rem', background: 'transparent', border: 'none',
                    color: 'var(--terminal-text)', fontFamily: 'var(--font-terminal)', fontSize: '0.85rem',
                    outline: 'none', letterSpacing: '0.1em',
                  }}
                />
                <button type="submit" style={{
                  padding: '0.9rem 1.25rem', background: 'var(--terminal-amber)', border: 'none',
                  color: '#000', fontFamily: 'var(--font-terminal)', fontSize: '0.75rem',
                  fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer',
                  transition: 'background 0.2s',
                }}>
                  LOOKUP
                </button>
              </div>
            </form>
          </div>

          {/* Hero Stats */}
          <div style={{
            display: 'flex', justifyContent: 'center', gap: '3rem', flexWrap: 'wrap',
            padding: '1.5rem 0 0',
          }}>
            <StatCounter value={politicians.length.toLocaleString()} label="Politicians Tracked" color="var(--terminal-blue)" />
            <StatCounter value={`$${(totalFunding / 1000000).toFixed(0)}M`} label="Campaign Funds Tracked" color="var(--terminal-green)" />
            <StatCounter value={`$${(israelLobbyTotal / 1000000).toFixed(1)}M`} label="Israel Lobby Funding" color="var(--terminal-red)" />
            <StatCounter value={String(withFunding)} label="With Financial Data" color="var(--terminal-amber)" />
          </div>
        </div>
      </section>

      {/* ================================================================
          STATE SELECTOR
          ================================================================ */}
      <section style={{
        padding: '2.5rem 2rem',
        background: 'var(--terminal-surface)',
        borderBottom: '1px solid var(--terminal-border)',
      }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{
            textAlign: 'center', marginBottom: '1.5rem',
          }}>
            <h2 style={{
              fontSize: '1.1rem', fontWeight: 600, color: 'var(--terminal-blue)',
              textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.4rem',
            }}>
              ENTER YOUR STATE
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--terminal-text-dim)' }}>
              Select a state to view tracked officials, candidates, and corruption data
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: '0.75rem',
          }}>
            {statesWithCounts.map(s => (
              <button
                key={s.code}
                onClick={() => handleStateSelect(s.code)}
                style={{
                  padding: '0.9rem 0.75rem',
                  background: 'var(--terminal-card)',
                  border: '1px solid var(--terminal-border)',
                  color: 'var(--terminal-text)',
                  fontFamily: 'var(--font-terminal)',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--terminal-blue)';
                  e.currentTarget.style.boxShadow = '0 0 15px rgba(0, 191, 255, 0.15)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--terminal-border)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--terminal-blue)', marginBottom: '0.15rem' }}>
                    {s.code}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--terminal-text-dim)' }}>
                    {s.name}
                  </div>
                </div>
                <div style={{
                  fontSize: '0.65rem', color: 'var(--terminal-text-dim)',
                  background: 'rgba(0, 191, 255, 0.08)', padding: '0.2rem 0.4rem',
                  fontWeight: 600,
                }}>
                  {s.count > 0 ? s.count.toLocaleString() : '--'}
                </div>
              </button>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <Link href="/officials" style={{
              fontSize: '0.75rem', color: 'var(--terminal-text-dim)',
              textDecoration: 'none', letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>
              VIEW ALL STATES &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* ================================================================
          WHAT IS SNITCHED.AI — INFO SECTION
          ================================================================ */}
      <section style={{ padding: '3rem 2rem', borderBottom: '1px solid var(--terminal-border)' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <h2 style={{
            fontSize: '1.25rem', fontWeight: 600, color: '#fff',
            textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1.5rem',
            textAlign: 'center',
          }}>
            WHAT IS SNITCHED.AI?
          </h2>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '1.5rem', marginBottom: '2rem',
          }}>
            {/* Card 1 */}
            <div className="terminal-card">
              <div style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>&#128269;</div>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--terminal-blue)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                FOLLOW THE MONEY
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--terminal-text-dim)', lineHeight: 1.7 }}>
                Every dollar traced. We aggregate FEC filings, state campaign finance databases, and lobbying disclosures to show you exactly who funds your politicians.
              </p>
            </div>

            {/* Card 2 */}
            <div className="terminal-card">
              <div style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>&#127758;</div>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--terminal-red)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                FOREIGN LOBBY TRACKING
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--terminal-text-dim)', lineHeight: 1.7 }}>
                Track Israel lobby PACs, bundled donations, and independent expenditures. Know which politicians are funded by AIPAC and affiliated organizations.
              </p>
            </div>

            {/* Card 3 */}
            <div className="terminal-card">
              <div style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>&#9878;</div>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--terminal-amber)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                CORRUPTION SCORING
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--terminal-text-dim)', lineHeight: 1.7 }}>
                Every politician receives a data-driven corruption score (0-100) based on PAC funding ratios, lobbying connections, and campaign finance red flags.
              </p>
            </div>
          </div>

          {/* Mission statement */}
          <div style={{
            padding: '1.5rem', background: 'rgba(0, 191, 255, 0.04)',
            border: '1px solid rgba(0, 191, 255, 0.15)', textAlign: 'center',
          }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--terminal-text)', lineHeight: 1.8, maxWidth: '700px', margin: '0 auto' }}>
              Snitched.ai is a citizen research platform. Every data point is sourced from public records &mdash;
              FEC filings, state campaign finance databases, lobbying disclosures, and legislative voting records.
              <span style={{ color: 'var(--terminal-blue)', fontWeight: 600 }}> No opinions. No partisan bias. Just data.</span>
            </p>
          </div>
        </div>
      </section>

      {/* ================================================================
          DATA SOURCES
          ================================================================ */}
      <section style={{ padding: '2.5rem 2rem', background: 'var(--terminal-surface)', borderBottom: '1px solid var(--terminal-border)' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <h2 style={{
            fontSize: '0.85rem', fontWeight: 600, color: 'var(--terminal-text-dim)',
            textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '1.5rem',
            textAlign: 'center',
          }}>
            VERIFIED DATA SOURCES
          </h2>
          <div style={{
            display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '1.5rem',
          }}>
            {[
              { name: 'FEC', desc: 'Federal Election Commission' },
              { name: 'LDA', desc: 'Lobbying Disclosure Act' },
              { name: 'LegiScan', desc: 'State Legislature Records' },
              { name: 'Track AIPAC', desc: 'Israel Lobby Donor Data' },
              { name: 'CourtListener', desc: 'Federal Court Records' },
            ].map(source => (
              <div key={source.name} style={{
                textAlign: 'center', padding: '0.75rem 1.25rem',
                border: '1px solid var(--terminal-border)', background: 'var(--terminal-card)',
                minWidth: '140px',
              }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--terminal-blue)', marginBottom: '0.2rem' }}>
                  {source.name}
                </div>
                <div style={{ fontSize: '0.6rem', color: 'var(--terminal-text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {source.desc}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================
          TOP TARGETS PREVIEW
          ================================================================ */}
      {topCorrupted.length > 0 && (
        <section style={{ padding: '2.5rem 2rem', borderBottom: '1px solid var(--terminal-border)' }}>
          <div style={{ maxWidth: '900px', margin: '0 auto' }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: '1.5rem',
            }}>
              <h2 style={{
                fontSize: '1rem', fontWeight: 600, color: 'var(--terminal-red)',
                textTransform: 'uppercase', letterSpacing: '0.1em',
              }}>
                HIGHEST CORRUPTION SCORES
              </h2>
              <Link href="/juicebox" style={{
                fontSize: '0.7rem', color: 'var(--terminal-text-dim)',
                textTransform: 'uppercase', letterSpacing: '0.1em', textDecoration: 'none',
              }}>
                VIEW ALL &rarr;
              </Link>
            </div>

            <div className="data-grid" style={{ padding: 0 }}>
              {topCorrupted.map(pol => (
                <Link key={pol.id} href={`/politician/${pol.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="terminal-card">
                    <div className="card-header">
                      <div>
                        <div className="card-title">{pol.name}</div>
                        <div style={{
                          fontSize: '11px', color: 'var(--terminal-text-dim)', marginTop: '0.5rem',
                          display: 'flex', alignItems: 'center', gap: '0.5rem',
                        }}>
                          <span>{pol.office}</span>
                          <span style={{
                            fontSize: '10px', padding: '0.3rem 0.6rem',
                            background: pol.party === 'Republican' ? '#dc2626' : pol.party === 'Democrat' ? '#2563eb' : '#6b7280',
                            color: '#fff', borderRadius: '10px', fontWeight: 600,
                          }}>
                            {pol.party === 'Republican' ? 'R' : pol.party === 'Democrat' ? 'D' : pol.party}
                          </span>
                        </div>
                      </div>
                      <div className={`card-status ${pol.juiceBoxTier !== 'none' ? 'compromised' : ''}`}>
                        {pol.juiceBoxTier !== 'none' ? 'COMPROMISED' : 'MONITORED'}
                      </div>
                    </div>
                    <div style={{
                      fontSize: '1.5rem', fontWeight: 700,
                      color: pol.corruptionScore >= 60 ? 'var(--terminal-red)' :
                             pol.corruptionScore >= 40 ? 'var(--terminal-amber)' : 'var(--terminal-green)',
                    }}>
                      SCORE: {pol.corruptionScore}/100
                    </div>
                    {(pol.israelLobbyTotal || pol.aipacFunding || 0) > 0 && (
                      <div style={{
                        marginTop: '0.75rem', padding: '0.5rem', background: 'rgba(255, 8, 68, 0.08)',
                        border: '1px solid rgba(239, 68, 68, 0.2)', fontSize: '0.8rem',
                        color: 'var(--terminal-red)', fontWeight: 700,
                      }}>
                        {(() => {
                          const amt = pol.israelLobbyTotal || pol.aipacFunding || 0;
                          return amt >= 1000000 ? `$${(amt / 1000000).toFixed(1)}M ISRAEL LOBBY` : `$${(amt / 1000).toFixed(0)}K ISRAEL LOBBY`;
                        })()}
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ================================================================
          TOP ISRAEL LOBBY RECIPIENTS
          ================================================================ */}
      {topIsraelLobby.length > 0 && (
        <section style={{ padding: '2.5rem 2rem', background: 'var(--terminal-surface)', borderBottom: '1px solid var(--terminal-border)' }}>
          <div style={{ maxWidth: '900px', margin: '0 auto' }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: '1.5rem',
            }}>
              <h2 style={{
                fontSize: '1rem', fontWeight: 600, color: 'var(--terminal-red)',
                textTransform: 'uppercase', letterSpacing: '0.1em',
              }}>
                TOP ISRAEL LOBBY RECIPIENTS
              </h2>
              <Link href="/juicebox" style={{
                fontSize: '0.7rem', color: 'var(--terminal-text-dim)',
                textTransform: 'uppercase', letterSpacing: '0.1em', textDecoration: 'none',
              }}>
                FULL LIST &rarr;
              </Link>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {topIsraelLobby.map((pol, i) => (
                <Link key={pol.id} href={`/politician/${pol.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '0.9rem 1rem',
                    background: i === 0 ? 'rgba(239, 68, 68, 0.08)' : 'var(--terminal-card)',
                    border: i === 0 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid var(--terminal-border)',
                    transition: 'border-color 0.2s',
                  }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--terminal-red)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = i === 0 ? 'rgba(239, 68, 68, 0.3)' : 'var(--terminal-border)')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--terminal-text-dim)', fontWeight: 700, width: '24px' }}>#{i + 1}</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{pol.name}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dim)' }}>
                          {pol.office} &middot; {pol.party}
                        </div>
                      </div>
                    </div>
                    <div style={{
                      fontWeight: 700, fontFamily: 'Bebas Neue, sans-serif',
                      fontSize: '1.3rem', color: 'var(--terminal-red)',
                    }}>
                      ${(pol.israelLobbyTotal || 0) >= 1000000
                        ? `${((pol.israelLobbyTotal || 0) / 1000000).toFixed(1)}M`
                        : `${((pol.israelLobbyTotal || 0) / 1000).toFixed(0)}K`}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ================================================================
          QUICK LINKS
          ================================================================ */}
      <section style={{ padding: '2.5rem 2rem', borderBottom: '1px solid var(--terminal-border)' }}>
        <div style={{
          maxWidth: '900px', margin: '0 auto',
          display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center',
        }}>
          <Link href="/officials"><button className="terminal-btn">&#128084; SEATED OFFICIALS</button></Link>
          <Link href="/candidates"><button className="terminal-btn">&#128499; CANDIDATES</button></Link>
          <Link href="/juicebox"><button className="terminal-btn danger">&#128176; CORRUPTION INDEX</button></Link>
          <Link href="/connections"><button className="terminal-btn">&#128376; CONNECTIONS MAP</button></Link>
          <Link href="/browse"><button className="terminal-btn">&#128269; DATABASE SEARCH</button></Link>
          <Link href="/compare"><button className="terminal-btn">&#9878; COMPARE</button></Link>
        </div>
      </section>

      {/* ================================================================
          UPDATE LOG
          ================================================================ */}
      <section style={{ padding: '2.5rem 2rem', background: 'var(--terminal-surface)' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <h2 style={{
            fontSize: '1rem', fontWeight: 600, color: 'var(--terminal-blue)',
            textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1.5rem',
            textAlign: 'center',
          }}>
            PLATFORM UPDATES
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {UPDATE_LOG.map((entry, i) => (
              <div key={i} style={{
                display: 'flex', gap: '1rem', padding: '1rem 0',
                borderBottom: i < UPDATE_LOG.length - 1 ? '1px solid rgba(42, 63, 95, 0.4)' : 'none',
                alignItems: 'flex-start',
              }}>
                {/* Date */}
                <div style={{
                  fontSize: '0.7rem', color: 'var(--terminal-text-dimmer)',
                  fontFamily: 'var(--font-terminal)', minWidth: '80px', paddingTop: '0.1rem',
                }}>
                  {entry.date}
                </div>
                {/* Type badge */}
                <div style={{
                  fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.1em', padding: '0.2rem 0.5rem', minWidth: '40px',
                  textAlign: 'center',
                  background: entry.type === 'feat' ? 'rgba(0, 191, 255, 0.15)' :
                             entry.type === 'data' ? 'rgba(0, 255, 65, 0.1)' :
                             'rgba(245, 158, 11, 0.1)',
                  color: entry.type === 'feat' ? 'var(--terminal-blue)' :
                         entry.type === 'data' ? 'var(--terminal-green)' :
                         'var(--terminal-amber)',
                  border: `1px solid ${
                    entry.type === 'feat' ? 'rgba(0, 191, 255, 0.3)' :
                    entry.type === 'data' ? 'rgba(0, 255, 65, 0.2)' :
                    'rgba(245, 158, 11, 0.2)'
                  }`,
                }}>
                  {entry.type}
                </div>
                {/* Content */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--terminal-text)', marginBottom: '0.15rem' }}>
                    {entry.title}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', lineHeight: 1.5 }}>
                    {entry.description}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================
          FOOTER
          ================================================================ */}
      <div className="classified-footer">
        PUBLIC RECORDS: FEC // FL DIVISION OF ELECTIONS // LDA SENATE // LEGISCAN // TRACK AIPAC //
        <Link href="/about" style={{ color: '#fff', marginLeft: '0.5rem', textDecoration: 'underline' }}>METHODOLOGY</Link>
      </div>
    </div>
  );
}

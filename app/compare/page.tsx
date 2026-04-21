'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import type { Politician } from '@/lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAmount(n: number): string {
  // Raw dollars only — no K/M rounding.
  if (!Number.isFinite(n)) return '$0';
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function getScoreColor(score: number): string {
  if (score <= 20) return 'var(--terminal-green)';
  if (score <= 40) return '#22c55e';
  if (score <= 60) return 'var(--terminal-amber)';
  if (score <= 80) return '#ef4444';
  return 'var(--terminal-red)';
}

function getScoreGrade(score: number): string {
  if (score <= 20) return 'A';
  if (score <= 40) return 'B';
  if (score <= 60) return 'C';
  if (score <= 80) return 'D';
  return 'F';
}

function partyColor(party: string): string {
  if (party === 'Republican') return '#dc2626';
  if (party === 'Democrat') return '#2563eb';
  return 'var(--terminal-text-dim)';
}

function voteBreakdown(votes: Politician['votes']): { yea: number; nay: number; absent: number; total: number } {
  const arr = votes ?? [];
  let yea = 0;
  let nay = 0;
  let absent = 0;
  for (const v of arr) {
    if (v.voteValue === 'Yes') yea++;
    else if (v.voteValue === 'No') nay++;
    else absent++; // Abstain + Absent
  }
  return { yea, nay, absent, total: arr.length };
}

// ---------------------------------------------------------------------------
// Shared connections logic
// ---------------------------------------------------------------------------

interface SharedConnection {
  type: 'donor' | 'lobbyingFirm';
  name: string;
  leftAmount?: number;
  rightAmount?: number;
}

function findSharedConnections(left: Politician, right: Politician): SharedConnection[] {
  const connections: SharedConnection[] = [];

  // Shared donors (from top5Donors)
  const leftDonors = left.top5Donors ?? [];
  const rightDonors = right.top5Donors ?? [];
  const rightDonorMap = new Map(rightDonors.map(d => [d.name.toLowerCase(), d]));
  for (const ld of leftDonors) {
    const match = rightDonorMap.get(ld.name.toLowerCase());
    if (match) {
      connections.push({
        type: 'donor',
        name: ld.name,
        leftAmount: ld.amount,
        rightAmount: match.amount,
      });
    }
  }

  // Shared lobbying firms (from lobbyingRecords)
  const leftLobby = left.lobbyingRecords ?? [];
  const rightLobby = right.lobbyingRecords ?? [];
  const leftFirms = new Map<string, string>();
  for (const rec of leftLobby) {
    leftFirms.set(rec.registrantName.toLowerCase(), rec.registrantName);
  }
  const rightFirms = new Set<string>();
  for (const rec of rightLobby) {
    rightFirms.add(rec.registrantName.toLowerCase());
  }
  for (const [key, name] of leftFirms) {
    if (rightFirms.has(key)) {
      connections.push({ type: 'lobbyingFirm', name });
    }
  }

  return connections;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SearchResult {
  id: string;
  name: string;
  officeLevel: string;
  party: string;
}

interface PoliticianSelectorProps {
  label: string;
  selected: Politician | null;
  onSelect: (p: Politician) => void;
  onClear: () => void;
}

function PoliticianSelector({ label, selected, onSelect, onClear }: PoliticianSelectorProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      fetch(`/api/politicians/search?q=${encodeURIComponent(query)}&limit=8`)
        .then(r => r.json())
        .then(d => {
          setResults(Array.isArray(d) ? d : []);
          setIsOpen(true);
        })
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSelect = useCallback((p: SearchResult) => {
    setIsOpen(false);
    setQuery('');
    setResults([]);
    fetch(`/api/politicians/${p.id}`)
      .then(r => r.json())
      .then(d => onSelect(d))
      .catch(() => {/* silently fail */});
  }, [onSelect]);

  return (
    <div className="terminal-card" ref={containerRef} style={{ position: 'relative' }}>
      <div style={sectionLabel}>{label}</div>
      {selected ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#fff' }}>{selected.name}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)' }}>{selected.office}</div>
              <div style={{ fontSize: '0.75rem', color: partyColor(selected.party) }}>{selected.party}</div>
            </div>
            <button
              className="terminal-btn danger"
              onClick={onClear}
              style={{ padding: '0.4rem 0.75rem', fontSize: '10px', width: 'auto' }}
            >
              CLEAR
            </button>
          </div>
        </div>
      ) : (
        <div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setIsOpen(true)}
            placeholder="Search name..."
            style={searchInputStyle}
          />
          {isOpen && results.length > 0 && (
            <div style={dropdownStyle}>
              {results.map(p => (
                <div
                  key={p.id}
                  onClick={() => handleSelect(p)}
                  style={dropdownItemStyle}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,191,255,0.1)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {p.name}{' '}
                  <span style={{ color: 'var(--terminal-text-dim)', fontSize: '0.7rem' }}>
                    ({p.officeLevel})
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pillar section component
// ---------------------------------------------------------------------------

interface PillarSectionProps {
  title: string;
  icon: string;
  children: React.ReactNode;
}

function PillarSection({ title, icon, children }: PillarSectionProps) {
  return (
    <div className="terminal-card" style={{ marginBottom: '1.5rem' }}>
      <div style={{
        fontSize: '0.75rem',
        color: 'var(--terminal-blue)',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.1em',
        marginBottom: '1rem',
        paddingBottom: '0.75rem',
        borderBottom: '1px solid var(--terminal-border)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}>
        <span>{icon}</span>
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metric row
// ---------------------------------------------------------------------------

interface MetricRowProps {
  label: string;
  leftValue: string;
  rightValue: string;
  leftRaw?: number;
  rightRaw?: number;
  highlightHigher?: boolean;
  colorFn?: (val: number) => string;
}

function MetricRow({ label, leftValue, rightValue, leftRaw, rightRaw, highlightHigher, colorFn }: MetricRowProps) {
  const lNum = leftRaw ?? 0;
  const rNum = rightRaw ?? 0;
  const leftHigher = lNum > rNum;
  const rightHigher = rNum > lNum;

  const leftColor = colorFn
    ? colorFn(lNum)
    : highlightHigher && leftHigher
      ? 'var(--terminal-red)'
      : 'var(--terminal-text)';
  const rightColor = colorFn
    ? colorFn(rNum)
    : highlightHigher && rightHigher
      ? 'var(--terminal-red)'
      : 'var(--terminal-text)';

  return (
    <div style={metricRowStyle}>
      <div style={{ ...metricValueStyle, color: leftColor }}>
        {leftValue}
        {highlightHigher && leftHigher && <span style={higherBadge}>HIGHER</span>}
      </div>
      <div style={metricLabelStyle}>{label}</div>
      <div style={{ ...metricValueStyle, color: rightColor }}>
        {rightValue}
        {highlightHigher && rightHigher && <span style={higherBadge}>HIGHER</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bar chart for vote breakdown
// ---------------------------------------------------------------------------

function VoteBar({ yea, nay, absent, total }: { yea: number; nay: number; absent: number; total: number }) {
  if (total === 0) {
    return <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.75rem', textAlign: 'center' }}>NO DATA</div>;
  }
  const yeaPct = (yea / total) * 100;
  const nayPct = (nay / total) * 100;
  const absPct = (absent / total) * 100;

  return (
    <div>
      <div style={{ display: 'flex', height: '8px', borderRadius: '2px', overflow: 'hidden', marginBottom: '0.5rem' }}>
        <div style={{ width: `${yeaPct}%`, background: 'var(--terminal-green)' }} />
        <div style={{ width: `${nayPct}%`, background: 'var(--terminal-red)' }} />
        <div style={{ width: `${absPct}%`, background: 'var(--terminal-text-dim)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--terminal-text-dim)' }}>
        <span style={{ color: 'var(--terminal-green)' }}>YEA {yea}</span>
        <span style={{ color: 'var(--terminal-red)' }}>NAY {nay}</span>
        <span>ABS {absent}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles (inline, consistent with terminal theme)
// ---------------------------------------------------------------------------

const sectionLabel: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--terminal-amber)',
  marginBottom: '0.5rem',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
};

const searchInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.75rem',
  background: 'var(--terminal-bg)',
  border: '2px solid var(--terminal-border)',
  color: 'var(--terminal-text)',
  fontSize: '0.875rem',
  fontFamily: 'JetBrains Mono, monospace',
  outline: 'none',
};

const dropdownStyle: React.CSSProperties = {
  position: 'absolute',
  left: '1.5rem',
  right: '1.5rem',
  border: '1px solid var(--terminal-border)',
  background: 'var(--terminal-card)',
  maxHeight: '200px',
  overflowY: 'auto',
  marginTop: '0.25rem',
  zIndex: 20,
};

const dropdownItemStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  cursor: 'pointer',
  fontSize: '0.8rem',
  borderBottom: '1px solid var(--terminal-border)',
};

const metricRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr',
  gap: '1rem',
  padding: '0.75rem 0',
  borderBottom: '1px solid var(--terminal-border)',
  alignItems: 'center',
};

const metricValueStyle: React.CSSProperties = {
  textAlign: 'center',
  fontSize: '1.25rem',
  fontWeight: 700,
  fontFamily: 'Bebas Neue, sans-serif',
};

const metricLabelStyle: React.CSSProperties = {
  textAlign: 'center',
  fontSize: '0.65rem',
  color: 'var(--terminal-text-dim)',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  minWidth: '120px',
};

const higherBadge: React.CSSProperties = {
  fontSize: '0.6rem',
  marginLeft: '0.4rem',
  color: 'var(--terminal-red)',
  verticalAlign: 'middle',
};

const twoColGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '1.5rem',
};

const socialHandleStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  color: 'var(--terminal-cyan)',
  padding: '0.25rem 0',
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ComparePage() {
  const [left, setLeft] = useState<Politician | null>(null);
  const [right, setRight] = useState<Politician | null>(null);

  const bothSelected = left !== null && right !== null;
  const sharedConnections = bothSelected ? findSharedConnections(left, right) : [];
  const leftVotes = bothSelected ? voteBreakdown(left.votes) : { yea: 0, nay: 0, absent: 0, total: 0 };
  const rightVotes = bothSelected ? voteBreakdown(right.votes) : { yea: 0, nay: 0, absent: 0, total: 0 };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--terminal-bg)', color: 'var(--terminal-text)' }}>
      {/* Page header */}
      <div className="terminal-title">
        <div>
          <h1>COMPARE POLITICIANS</h1>
          <div className="terminal-subtitle">Side-by-side 4-pillar corruption and influence analysis</div>
        </div>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        {/* Selector row */}
        <div className="compare-selector-row" style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          gap: '1.5rem',
          marginBottom: '2rem',
          alignItems: 'start',
        }}>
          <PoliticianSelector
            label="POLITICIAN A"
            selected={left}
            onSelect={setLeft}
            onClear={() => setLeft(null)}
          />
          <div style={{
            display: 'flex',
            alignItems: 'center',
            paddingTop: '2rem',
            fontSize: '1.5rem',
            color: 'var(--terminal-text-dim)',
            fontWeight: 700,
          }}>
            VS
          </div>
          <PoliticianSelector
            label="POLITICIAN B"
            selected={right}
            onSelect={setRight}
            onClear={() => setRight(null)}
          />
        </div>

        {/* Comparison content */}
        {bothSelected ? (
          <>
            {/* ============================================================
                CORRUPTION SCORE COMPARISON
               ============================================================ */}
            <div className="terminal-card" style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
              <div style={{
                fontSize: '0.75rem',
                color: 'var(--terminal-red)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginBottom: '1rem',
              }}>
                CORRUPTION SCORE
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '2rem', alignItems: 'center' }}>
                {/* Left score */}
                <div>
                  <div style={{
                    fontSize: '4rem',
                    fontWeight: 700,
                    fontFamily: 'Bebas Neue, sans-serif',
                    color: getScoreColor(left.corruptionScore),
                    lineHeight: 1,
                  }}>
                    {left.corruptionScore}
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: getScoreColor(left.corruptionScore), fontFamily: 'Bebas Neue, sans-serif' }}>
                    GRADE {getScoreGrade(left.corruptionScore)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginTop: '0.25rem' }}>
                    {left.name}
                  </div>
                </div>

                <div style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dimmer)', textTransform: 'uppercase' }}>
                  / 100
                </div>

                {/* Right score */}
                <div>
                  <div style={{
                    fontSize: '4rem',
                    fontWeight: 700,
                    fontFamily: 'Bebas Neue, sans-serif',
                    color: getScoreColor(right.corruptionScore),
                    lineHeight: 1,
                  }}>
                    {right.corruptionScore}
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: getScoreColor(right.corruptionScore), fontFamily: 'Bebas Neue, sans-serif' }}>
                    GRADE {getScoreGrade(right.corruptionScore)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginTop: '0.25rem' }}>
                    {right.name}
                  </div>
                </div>
              </div>
            </div>

            {/* ============================================================
                PILLAR 1: FINANCIALS
               ============================================================ */}
            <PillarSection title="PILLAR 1 -- FINANCIALS" icon="$">
              <MetricRow
                label="TOTAL FUNDS RAISED"
                leftValue={formatAmount(left.totalFundsRaised ?? 0)}
                rightValue={formatAmount(right.totalFundsRaised ?? 0)}
                leftRaw={left.totalFundsRaised ?? 0}
                rightRaw={right.totalFundsRaised ?? 0}
                highlightHigher
              />
              <MetricRow
                label="PRO-ISRAEL LOBBY PACS"
                leftValue={formatAmount(left.aipacFunding)}
                rightValue={formatAmount(right.aipacFunding)}
                leftRaw={left.aipacFunding}
                rightRaw={right.aipacFunding}
                highlightHigher
              />
              <MetricRow
                label="PRO-ISRAEL LOBBY TOTAL"
                leftValue={formatAmount(left.israelLobbyTotal ?? 0)}
                rightValue={formatAmount(right.israelLobbyTotal ?? 0)}
                leftRaw={left.israelLobbyTotal ?? 0}
                rightRaw={right.israelLobbyTotal ?? 0}
                highlightHigher
              />
              <MetricRow
                label="PAC RATIO"
                leftValue={(() => {
                  const cb = left.contributionBreakdown;
                  if (!cb) return 'N/A';
                  const total = cb.aipac + cb.otherPACs + cb.individuals + cb.corporate;
                  if (total === 0) return '0%';
                  return `${(((cb.aipac + cb.otherPACs) / total) * 100).toFixed(0)}%`;
                })()}
                rightValue={(() => {
                  const cb = right.contributionBreakdown;
                  if (!cb) return 'N/A';
                  const total = cb.aipac + cb.otherPACs + cb.individuals + cb.corporate;
                  if (total === 0) return '0%';
                  return `${(((cb.aipac + cb.otherPACs) / total) * 100).toFixed(0)}%`;
                })()}
              />

              {/* Top donors side-by-side */}
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--terminal-border)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--terminal-amber)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem', textAlign: 'center' }}>
                  TOP DONORS
                </div>
                <div className="compare-two-col" style={twoColGrid}>
                  <div>
                    {(left.top5Donors ?? []).slice(0, 5).map((d, i) => (
                      <div key={i} style={{ padding: '0.4rem 0', borderBottom: '1px solid var(--terminal-border)', fontSize: '0.8rem' }}>
                        <div style={{ fontWeight: 700, color: d.type === 'Israel-PAC' ? 'var(--terminal-red)' : 'var(--terminal-text)' }}>
                          {d.name}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.15rem' }}>
                          <span style={{ fontSize: '0.65rem', color: 'var(--terminal-text-dim)' }}>{d.type}</span>
                          <span style={{ fontFamily: 'Bebas Neue, sans-serif', color: 'var(--terminal-amber)' }}>{formatAmount(d.amount)}</span>
                        </div>
                      </div>
                    ))}
                    {(left.top5Donors ?? []).length === 0 && (
                      <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.75rem' }}>No donor data</div>
                    )}
                  </div>
                  <div>
                    {(right.top5Donors ?? []).slice(0, 5).map((d, i) => (
                      <div key={i} style={{ padding: '0.4rem 0', borderBottom: '1px solid var(--terminal-border)', fontSize: '0.8rem' }}>
                        <div style={{ fontWeight: 700, color: d.type === 'Israel-PAC' ? 'var(--terminal-red)' : 'var(--terminal-text)' }}>
                          {d.name}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.15rem' }}>
                          <span style={{ fontSize: '0.65rem', color: 'var(--terminal-text-dim)' }}>{d.type}</span>
                          <span style={{ fontFamily: 'Bebas Neue, sans-serif', color: 'var(--terminal-amber)' }}>{formatAmount(d.amount)}</span>
                        </div>
                      </div>
                    ))}
                    {(right.top5Donors ?? []).length === 0 && (
                      <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.75rem' }}>No donor data</div>
                    )}
                  </div>
                </div>
              </div>
            </PillarSection>

            {/* ============================================================
                PILLAR 2: COURT RECORDS
               ============================================================ */}
            <PillarSection title="PILLAR 2 -- COURT RECORDS" icon="&#x2696;">
              <MetricRow
                label="TOTAL CASES"
                leftValue={String((left.courtCases ?? []).length)}
                rightValue={String((right.courtCases ?? []).length)}
                leftRaw={(left.courtCases ?? []).length}
                rightRaw={(right.courtCases ?? []).length}
                highlightHigher
              />
              <div className="compare-two-col" style={{ ...twoColGrid, marginTop: '1rem' }}>
                {/* Left court cases */}
                <div>
                  {(left.courtCases ?? []).length === 0 && (
                    <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.75rem', padding: '0.5rem 0' }}>
                      No court records found
                    </div>
                  )}
                  {(left.courtCases ?? []).slice(0, 5).map((c, i) => (
                    <div key={i} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--terminal-border)', fontSize: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                        <span style={{ fontWeight: 700, color: 'var(--terminal-text)' }}>{c.caseNumber}</span>
                        <span style={{
                          fontSize: '0.6rem',
                          padding: '0.1rem 0.4rem',
                          background: c.status === 'Active' ? 'rgba(255,8,68,0.15)' : c.status === 'Pending' ? 'rgba(255,182,39,0.15)' : 'rgba(0,255,65,0.15)',
                          color: c.status === 'Active' ? 'var(--terminal-red)' : c.status === 'Pending' ? 'var(--terminal-amber)' : 'var(--terminal-green)',
                          textTransform: 'uppercase',
                        }}>
                          {c.status}
                        </span>
                      </div>
                      <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.7rem' }}>{c.caseType} -- {c.court}</div>
                      <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.65rem', marginTop: '0.15rem' }}>{c.summary.slice(0, 100)}{c.summary.length > 100 ? '...' : ''}</div>
                    </div>
                  ))}
                </div>
                {/* Right court cases */}
                <div>
                  {(right.courtCases ?? []).length === 0 && (
                    <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.75rem', padding: '0.5rem 0' }}>
                      No court records found
                    </div>
                  )}
                  {(right.courtCases ?? []).slice(0, 5).map((c, i) => (
                    <div key={i} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--terminal-border)', fontSize: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                        <span style={{ fontWeight: 700, color: 'var(--terminal-text)' }}>{c.caseNumber}</span>
                        <span style={{
                          fontSize: '0.6rem',
                          padding: '0.1rem 0.4rem',
                          background: c.status === 'Active' ? 'rgba(255,8,68,0.15)' : c.status === 'Pending' ? 'rgba(255,182,39,0.15)' : 'rgba(0,255,65,0.15)',
                          color: c.status === 'Active' ? 'var(--terminal-red)' : c.status === 'Pending' ? 'var(--terminal-amber)' : 'var(--terminal-green)',
                          textTransform: 'uppercase',
                        }}>
                          {c.status}
                        </span>
                      </div>
                      <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.7rem' }}>{c.caseType} -- {c.court}</div>
                      <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.65rem', marginTop: '0.15rem' }}>{c.summary.slice(0, 100)}{c.summary.length > 100 ? '...' : ''}</div>
                    </div>
                  ))}
                </div>
              </div>
            </PillarSection>

            {/* ============================================================
                PILLAR 3: VOTING RECORDS
               ============================================================ */}
            <PillarSection title="PILLAR 3 -- VOTING RECORDS" icon="&#x1F5F3;">
              <MetricRow
                label="TOTAL VOTES ON RECORD"
                leftValue={String(leftVotes.total)}
                rightValue={String(rightVotes.total)}
                leftRaw={leftVotes.total}
                rightRaw={rightVotes.total}
              />
              <div className="compare-two-col" style={{ ...twoColGrid, marginTop: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dim)', marginBottom: '0.5rem', textTransform: 'uppercase', textAlign: 'center' }}>
                    {left.name}
                  </div>
                  <VoteBar yea={leftVotes.yea} nay={leftVotes.nay} absent={leftVotes.absent} total={leftVotes.total} />
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dim)', marginBottom: '0.5rem', textTransform: 'uppercase', textAlign: 'center' }}>
                    {right.name}
                  </div>
                  <VoteBar yea={rightVotes.yea} nay={rightVotes.nay} absent={rightVotes.absent} total={rightVotes.total} />
                </div>
              </div>

              {/* Recent votes list */}
              <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--terminal-border)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--terminal-amber)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem', textAlign: 'center' }}>
                  RECENT VOTES
                </div>
                <div className="compare-two-col" style={twoColGrid}>
                  <div>
                    {(left.votes ?? []).length === 0 && (
                      <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.75rem' }}>No voting data</div>
                    )}
                    {(left.votes ?? []).slice(0, 5).map((v, i) => (
                      <div key={i} style={{ padding: '0.4rem 0', borderBottom: '1px solid var(--terminal-border)', fontSize: '0.7rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: 700 }}>{v.billNumber}</span>
                          <span style={{
                            color: v.voteValue === 'Yes' ? 'var(--terminal-green)' : v.voteValue === 'No' ? 'var(--terminal-red)' : 'var(--terminal-text-dim)',
                            fontWeight: 700,
                            fontSize: '0.65rem',
                          }}>
                            {v.voteValue}
                          </span>
                        </div>
                        <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.65rem' }}>{v.billTitle.slice(0, 60)}{v.billTitle.length > 60 ? '...' : ''}</div>
                      </div>
                    ))}
                  </div>
                  <div>
                    {(right.votes ?? []).length === 0 && (
                      <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.75rem' }}>No voting data</div>
                    )}
                    {(right.votes ?? []).slice(0, 5).map((v, i) => (
                      <div key={i} style={{ padding: '0.4rem 0', borderBottom: '1px solid var(--terminal-border)', fontSize: '0.7rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: 700 }}>{v.billNumber}</span>
                          <span style={{
                            color: v.voteValue === 'Yes' ? 'var(--terminal-green)' : v.voteValue === 'No' ? 'var(--terminal-red)' : 'var(--terminal-text-dim)',
                            fontWeight: 700,
                            fontSize: '0.65rem',
                          }}>
                            {v.voteValue}
                          </span>
                        </div>
                        <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.65rem' }}>{v.billTitle.slice(0, 60)}{v.billTitle.length > 60 ? '...' : ''}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </PillarSection>

            {/* ============================================================
                PILLAR 4: SOCIAL MEDIA
               ============================================================ */}
            <PillarSection title="PILLAR 4 -- SOCIAL MEDIA" icon="&#x1F4F1;">
              <MetricRow
                label="SOCIAL POSTS TRACKED"
                leftValue={String((left.socialPosts ?? []).length)}
                rightValue={String((right.socialPosts ?? []).length)}
                leftRaw={(left.socialPosts ?? []).length}
                rightRaw={(right.socialPosts ?? []).length}
              />
              <div className="compare-two-col" style={{ ...twoColGrid, marginTop: '1rem' }}>
                {/* Left social handles */}
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--terminal-amber)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                    HANDLES
                  </div>
                  {left.socialMedia?.twitterHandle && (
                    <div style={socialHandleStyle}>X/Twitter: @{left.socialMedia.twitterHandle}</div>
                  )}
                  {left.socialMedia?.facebookPageUrl && (
                    <div style={socialHandleStyle}>Facebook: {left.socialMedia.facebookPageUrl.split('/').pop()}</div>
                  )}
                  {left.socialMedia?.instagramHandle && (
                    <div style={socialHandleStyle}>Instagram: @{left.socialMedia.instagramHandle}</div>
                  )}
                  {left.socialMedia?.tiktokHandle && (
                    <div style={socialHandleStyle}>TikTok: @{left.socialMedia.tiktokHandle}</div>
                  )}
                  {!left.socialMedia?.twitterHandle && !left.socialMedia?.facebookPageUrl && !left.socialMedia?.instagramHandle && !left.socialMedia?.tiktokHandle && (
                    <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.75rem' }}>No social handles</div>
                  )}
                </div>
                {/* Right social handles */}
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--terminal-amber)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                    HANDLES
                  </div>
                  {right.socialMedia?.twitterHandle && (
                    <div style={socialHandleStyle}>X/Twitter: @{right.socialMedia.twitterHandle}</div>
                  )}
                  {right.socialMedia?.facebookPageUrl && (
                    <div style={socialHandleStyle}>Facebook: {right.socialMedia.facebookPageUrl.split('/').pop()}</div>
                  )}
                  {right.socialMedia?.instagramHandle && (
                    <div style={socialHandleStyle}>Instagram: @{right.socialMedia.instagramHandle}</div>
                  )}
                  {right.socialMedia?.tiktokHandle && (
                    <div style={socialHandleStyle}>TikTok: @{right.socialMedia.tiktokHandle}</div>
                  )}
                  {!right.socialMedia?.twitterHandle && !right.socialMedia?.facebookPageUrl && !right.socialMedia?.instagramHandle && !right.socialMedia?.tiktokHandle && (
                    <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.75rem' }}>No social handles</div>
                  )}
                </div>
              </div>
            </PillarSection>

            {/* ============================================================
                SHARED CONNECTIONS
               ============================================================ */}
            <PillarSection title="SHARED CONNECTIONS" icon="&#x1F517;">
              {sharedConnections.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--terminal-text-dim)', fontSize: '0.8rem' }}>
                  No shared donors or lobbying firms detected between these two politicians.
                </div>
              ) : (
                <div>
                  {sharedConnections.map((conn, i) => (
                    <div key={i} style={{
                      display: 'grid',
                      gridTemplateColumns: '100px 1fr 100px',
                      gap: '1rem',
                      padding: '0.6rem 0',
                      borderBottom: '1px solid var(--terminal-border)',
                      alignItems: 'center',
                      fontSize: '0.8rem',
                    }}>
                      <div style={{ textAlign: 'center' }}>
                        {conn.leftAmount != null && (
                          <span style={{ fontFamily: 'Bebas Neue, sans-serif', color: 'var(--terminal-amber)' }}>
                            {formatAmount(conn.leftAmount)}
                          </span>
                        )}
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: 700, color: 'var(--terminal-red)' }}>{conn.name}</div>
                        <div style={{
                          fontSize: '0.6rem',
                          color: 'var(--terminal-text-dim)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.1em',
                        }}>
                          {conn.type === 'donor' ? 'SHARED DONOR' : 'SHARED LOBBYING FIRM'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        {conn.rightAmount != null && (
                          <span style={{ fontFamily: 'Bebas Neue, sans-serif', color: 'var(--terminal-amber)' }}>
                            {formatAmount(conn.rightAmount)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  <div style={{
                    textAlign: 'center',
                    marginTop: '0.75rem',
                    fontSize: '0.7rem',
                    color: 'var(--terminal-text-dim)',
                  }}>
                    {sharedConnections.length} shared connection{sharedConnections.length !== 1 ? 's' : ''} found
                  </div>
                </div>
              )}
            </PillarSection>

            {/* Dossier links */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}>
              <Link href={`/politician/${left.id}`}>
                <button className="terminal-btn">VIEW {left.name.split(' ').pop()?.toUpperCase()} DOSSIER</button>
              </Link>
              <Link href={`/politician/${right.id}`}>
                <button className="terminal-btn">VIEW {right.name.split(' ').pop()?.toUpperCase()} DOSSIER</button>
              </Link>
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="terminal-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>&#x2194;</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--terminal-text-dim)' }}>
              SELECT TWO POLITICIANS
            </div>
            <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.875rem', maxWidth: '500px', margin: '0 auto' }}>
              Search and select politicians above to compare their corruption scores,
              financials, court records, voting records, social media, and shared connections side by side.
            </div>
          </div>
        )}
      </div>

      {/* Responsive overrides via inline style tag */}
      <style>{`
        @media (max-width: 768px) {
          .compare-selector-row {
            grid-template-columns: 1fr !important;
            gap: 1rem !important;
          }
          .compare-selector-row > div:nth-child(2) {
            display: none !important;
          }
          .compare-two-col {
            grid-template-columns: 1fr !important;
            gap: 1rem !important;
          }
        }
      `}</style>
    </div>
  );
}

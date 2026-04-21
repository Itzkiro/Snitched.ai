'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

// ── Types ──

interface CrossStateDonor {
  donor: string;
  totalAmount: number;
  stateCount: number;
  politicianCount: number;
  states: string[];
  politicians: { id: string; name: string; state: string; party: string; office: string; amount: number }[];
}

interface OwnershipChain {
  firm: string;
  clients: string[];
  politicians: { id: string; name: string; state: string; party: string; income?: number; pacAmount?: number; lobbyIncome?: number }[];
  totalIncome?: number;
  totalFlow?: number;
  pac?: string;
}

interface VotingPair {
  pol1: { id: string; name: string; party: string; state: string };
  pol2: { id: string; name: string; party: string; state: string };
  agreement: number;
  sharedVotes: number;
  sharedDonors: { name: string; amount1: number; amount2: number }[];
  crossParty: boolean;
}

interface TimelineEvent {
  date: string;
  type: 'donation' | 'vote' | 'lobby' | 'ie';
  title: string;
  amount?: number;
  details: string;
  direction?: 'in' | 'out';
}

interface SuspiciousPattern {
  donation: TimelineEvent;
  vote: TimelineEvent;
  daysBetween: number;
}

// ── Helpers ──

function fmtMoney(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '$0';
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function partyColor(party: string): string {
  if (party === 'Republican') return '#dc2626';
  if (party === 'Democrat') return '#2563eb';
  return '#6b7280';
}

function partyTag(party: string): string {
  return party === 'Republican' ? 'R' : party === 'Democrat' ? 'D' : party?.charAt(0) || '?';
}

const typeColors: Record<string, string> = {
  donation: '#22c55e',
  vote: '#3b82f6',
  lobby: '#f59e0b',
  ie: '#ef4444',
};

// ── Tab Components ──

function CrossStateTab() {
  const [data, setData] = useState<{ crossStateConnections: CrossStateDonor[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/investigate?tool=cross-state');
    setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--terminal-text-dim)' }}>Analyzing cross-state donor connections...</div>;
  if (!data?.crossStateConnections?.length) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--terminal-text-dim)' }}>No cross-state connections found yet. More donor data needed.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginBottom: '0.5rem' }}>
        {data.crossStateConnections.length} donors funding politicians across multiple states
      </div>
      {data.crossStateConnections.map(d => (
        <div key={d.donor} className="terminal-card" style={{ padding: '1rem', cursor: 'pointer' }}
          onClick={() => setExpanded(expanded === d.donor ? null : d.donor)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{d.donor}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dim)', marginTop: '0.2rem' }}>
                {d.stateCount} states &middot; {d.politicianCount} politicians &middot; {d.states.join(', ')}
              </div>
            </div>
            <div style={{ fontWeight: 700, fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.2rem', color: 'var(--terminal-red)' }}>
              {fmtMoney(d.totalAmount)}
            </div>
          </div>
          {expanded === d.donor && (
            <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--terminal-border)', paddingTop: '0.75rem' }}>
              {d.politicians.map(p => (
                <Link key={p.id} href={`/politician/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0',
                    borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.8rem',
                  }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.6rem', padding: '0.1rem 0.3rem', background: partyColor(p.party), color: '#fff', fontWeight: 600 }}>{partyTag(p.party)}</span>
                      <span>{p.name}</span>
                      <span style={{ color: 'var(--terminal-text-dim)', fontSize: '0.7rem' }}>{p.state} &middot; {p.office}</span>
                    </div>
                    <span style={{ color: 'var(--terminal-green)', fontWeight: 600 }}>{fmtMoney(p.amount)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function OwnershipTab() {
  const [data, setData] = useState<{ pacToLobbyChains: OwnershipChain[]; lobbyingChains: OwnershipChain[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'pac' | 'lobby'>('lobby');

  useEffect(() => {
    setLoading(true);
    fetch('/api/investigate?tool=ownership').then(r => r.json()).then(d => { setData(d); setLoading(false); });
  }, []);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--terminal-text-dim)' }}>Tracing corporate ownership chains...</div>;

  const chains = view === 'pac' ? (data?.pacToLobbyChains || []) : (data?.lobbyingChains || []);

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button onClick={() => setView('lobby')} style={{
          padding: '0.5rem 1rem', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem', cursor: 'pointer',
          background: view === 'lobby' ? 'rgba(0, 191, 255, 0.15)' : 'var(--terminal-card)',
          border: view === 'lobby' ? '1px solid var(--terminal-blue)' : '1px solid var(--terminal-border)',
          color: view === 'lobby' ? 'var(--terminal-blue)' : 'var(--terminal-text-dim)',
        }}>LOBBYING CHAINS</button>
        <button onClick={() => setView('pac')} style={{
          padding: '0.5rem 1rem', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem', cursor: 'pointer',
          background: view === 'pac' ? 'rgba(0, 191, 255, 0.15)' : 'var(--terminal-card)',
          border: view === 'pac' ? '1px solid var(--terminal-blue)' : '1px solid var(--terminal-border)',
          color: view === 'pac' ? 'var(--terminal-blue)' : 'var(--terminal-text-dim)',
        }}>PAC &rarr; LOBBY CHAINS</button>
      </div>

      {chains.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--terminal-text-dim)' }}>
          No {view === 'pac' ? 'PAC-to-lobby' : 'lobbying'} chains detected yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {chains.map((chain, i) => (
            <div key={i} className="terminal-card" style={{ padding: '1rem' }}>
              {/* Chain header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                {chain.pac && (
                  <>
                    <span style={{ padding: '0.3rem 0.6rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: 'var(--terminal-red)', fontSize: '0.7rem', fontWeight: 700 }}>PAC</span>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{chain.pac}</span>
                    <span style={{ color: 'var(--terminal-text-dim)' }}>&rarr;</span>
                  </>
                )}
                <span style={{ padding: '0.3rem 0.6rem', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', color: 'var(--terminal-amber)', fontSize: '0.7rem', fontWeight: 700 }}>FIRM</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{chain.firm}</span>
                <span style={{ color: 'var(--terminal-text-dim)' }}>&rarr;</span>
                <span style={{ padding: '0.3rem 0.6rem', background: 'rgba(0, 191, 255, 0.1)', border: '1px solid rgba(0, 191, 255, 0.3)', color: 'var(--terminal-blue)', fontSize: '0.7rem', fontWeight: 700 }}>{chain.politicians.length} POLS</span>
                <span style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--terminal-green)', fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.1rem' }}>
                  {fmtMoney(chain.totalIncome || chain.totalFlow || 0)}
                </span>
              </div>
              {/* Clients */}
              {chain.clients.length > 0 && (
                <div style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dim)', marginBottom: '0.5rem' }}>
                  Clients: {chain.clients.join(', ')}
                </div>
              )}
              {/* Politicians */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {chain.politicians.map(p => (
                  <Link key={p.id} href={`/politician/${p.id}`} style={{ textDecoration: 'none' }}>
                    <span style={{
                      padding: '0.3rem 0.6rem', fontSize: '0.7rem',
                      background: 'var(--terminal-card)', border: '1px solid var(--terminal-border)',
                      color: 'var(--terminal-text)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                    }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: partyColor(p.party) }} />
                      {p.name} ({p.state})
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VotingPatternsTab() {
  const [data, setData] = useState<{ votingPairs: VotingPair[]; totalAnalyzed: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'cross-party' | 'shared-donors'>('all');

  useEffect(() => {
    setLoading(true);
    fetch('/api/investigate?tool=voting-patterns').then(r => r.json()).then(d => { setData(d); setLoading(false); });
  }, []);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--terminal-text-dim)' }}>Analyzing voting patterns across {0} politicians...</div>;

  const pairs = (data?.votingPairs || []).filter(p => {
    if (filter === 'cross-party') return p.crossParty;
    if (filter === 'shared-donors') return p.sharedDonors.length > 0;
    return true;
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {(['all', 'cross-party', 'shared-donors'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '0.5rem 1rem', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem', cursor: 'pointer',
            background: filter === f ? 'rgba(0, 191, 255, 0.15)' : 'var(--terminal-card)',
            border: filter === f ? '1px solid var(--terminal-blue)' : '1px solid var(--terminal-border)',
            color: filter === f ? 'var(--terminal-blue)' : 'var(--terminal-text-dim)',
            textTransform: 'uppercase',
          }}>
            {f === 'all' ? `ALL (${data?.votingPairs?.length || 0})` : f === 'cross-party' ? 'CROSS-PARTY' : 'SHARED DONORS'}
          </button>
        ))}
        <span style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dim)', alignSelf: 'center' }}>
          {data?.totalAnalyzed || 0} politicians with voting records analyzed
        </span>
      </div>

      {pairs.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--terminal-text-dim)' }}>No matching voting pairs found.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {pairs.map((p, i) => (
            <div key={i} className="terminal-card" style={{ padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Link href={`/politician/${p.pol1.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span style={{ fontSize: '0.6rem', padding: '0.1rem 0.3rem', background: partyColor(p.pol1.party), color: '#fff', fontWeight: 600 }}>{partyTag(p.pol1.party)}</span>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{p.pol1.name}</span>
                    <span style={{ color: 'var(--terminal-text-dim)', fontSize: '0.7rem' }}>({p.pol1.state})</span>
                  </Link>
                  <span style={{ color: 'var(--terminal-text-dim)', fontSize: '0.7rem' }}>&amp;</span>
                  <Link href={`/politician/${p.pol2.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span style={{ fontSize: '0.6rem', padding: '0.1rem 0.3rem', background: partyColor(p.pol2.party), color: '#fff', fontWeight: 600 }}>{partyTag(p.pol2.party)}</span>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{p.pol2.name}</span>
                    <span style={{ color: 'var(--terminal-text-dim)', fontSize: '0.7rem' }}>({p.pol2.state})</span>
                  </Link>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  {p.crossParty && (
                    <span style={{ fontSize: '0.6rem', padding: '0.2rem 0.5rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: 'var(--terminal-red)', fontWeight: 700 }}>CROSS-PARTY</span>
                  )}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: '1.3rem', fontFamily: 'Bebas Neue, sans-serif', color: p.agreement >= 90 ? 'var(--terminal-red)' : p.agreement >= 80 ? 'var(--terminal-amber)' : 'var(--terminal-blue)' }}>
                      {p.agreement}%
                    </div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--terminal-text-dim)' }}>{p.sharedVotes} shared votes</div>
                  </div>
                </div>
              </div>
              {p.sharedDonors.length > 0 && (
                <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--terminal-border)' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--terminal-red)', fontWeight: 700, marginBottom: '0.3rem' }}>SHARED DONORS:</div>
                  {p.sharedDonors.map((d, j) => (
                    <span key={j} style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dim)', marginRight: '1rem' }}>
                      {d.name} ({fmtMoney(d.amount1)} / {fmtMoney(d.amount2)})
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineTab() {
  const [politicianId, setPoliticianId] = useState('');
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState<{ id: string; name: string; office: string }[]>([]);
  const [data, setData] = useState<{ politician: Record<string, unknown>; events: TimelineEvent[]; suspicious: SuspiciousPattern[] } | null>(null);
  const [loading, setLoading] = useState(false);

  // Search for politicians
  useEffect(() => {
    if (search.length < 2) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/politicians/search?q=${encodeURIComponent(search)}&limit=8`);
      const d = await res.json();
      setSuggestions(Array.isArray(d) ? d.map((p: Record<string, unknown>) => ({ id: String(p.id || p.bioguide_id || ''), name: String(p.name || ''), office: String(p.office || '') })) : []);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadTimeline = async (id: string) => {
    setPoliticianId(id);
    setSuggestions([]);
    setLoading(true);
    const res = await fetch(`/api/investigate?tool=timeline&id=${encodeURIComponent(id)}`);
    setData(await res.json());
    setLoading(false);
  };

  return (
    <div>
      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
        <input type="text" placeholder="Search politician by name..." value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', padding: '0.8rem 1rem', background: 'var(--terminal-card)',
            border: '1px solid var(--terminal-border)', color: 'var(--terminal-text)',
            fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem', outline: 'none',
          }} />
        {suggestions.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--terminal-card)', border: '1px solid var(--terminal-border)', maxHeight: '200px', overflowY: 'auto' }}>
            {suggestions.map(s => (
              <div key={s.id} onClick={() => { setSearch(s.name); loadTimeline(s.id); }}
                style={{ padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.8rem', borderBottom: '1px solid var(--terminal-border)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0, 191, 255, 0.08)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <span style={{ fontWeight: 600 }}>{s.name}</span>
                <span style={{ color: 'var(--terminal-text-dim)', marginLeft: '0.5rem', fontSize: '0.7rem' }}>{s.office}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {loading && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--terminal-text-dim)' }}>Building timeline...</div>}

      {data && !loading && (
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            {(data.politician as Record<string, string>).name} — Money &amp; Votes Timeline
          </h3>

          {/* Suspicious patterns alert */}
          {data.suspicious.length > 0 && (
            <div style={{
              padding: '1rem', marginBottom: '1.5rem',
              background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.3)',
            }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--terminal-red)', marginBottom: '0.5rem' }}>
                SUSPICIOUS PATTERNS: Donations within 30 days of votes
              </div>
              {data.suspicious.map((s, i) => (
                <div key={i} style={{ fontSize: '0.75rem', color: 'var(--terminal-text)', padding: '0.3rem 0', borderBottom: '1px solid rgba(239, 68, 68, 0.1)' }}>
                  <span style={{ color: 'var(--terminal-green)' }}>{s.donation.title}</span>
                  <span style={{ color: 'var(--terminal-text-dim)' }}> ({fmtMoney(s.donation.amount || 0)}) </span>
                  <span style={{ color: 'var(--terminal-red)' }}>&rarr; {s.daysBetween} days &rarr;</span>
                  <span style={{ color: 'var(--terminal-blue)' }}> {s.vote.title}</span>
                  <span style={{ color: 'var(--terminal-text-dim)' }}> ({s.vote.details.split('—')[1]?.trim() || ''})</span>
                </div>
              ))}
            </div>
          )}

          {/* Timeline */}
          <div style={{ position: 'relative', paddingLeft: '2rem' }}>
            {/* Vertical line */}
            <div style={{ position: 'absolute', left: '0.5rem', top: 0, bottom: 0, width: '2px', background: 'var(--terminal-border)' }} />

            {data.events.map((e, i) => (
              <div key={i} style={{ position: 'relative', marginBottom: '0.75rem', paddingLeft: '1rem' }}>
                {/* Dot */}
                <div style={{
                  position: 'absolute', left: '-1.6rem', top: '0.4rem',
                  width: '10px', height: '10px', borderRadius: '50%',
                  background: typeColors[e.type] || '#666',
                  border: '2px solid var(--terminal-bg)',
                }} />
                <div style={{
                  padding: '0.6rem 0.8rem',
                  background: e.type === 'ie' ? 'rgba(239, 68, 68, 0.05)' : 'var(--terminal-card)',
                  border: `1px solid ${e.type === 'ie' ? 'rgba(239, 68, 68, 0.2)' : 'var(--terminal-border)'}`,
                  fontSize: '0.8rem',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: '0.6rem', color: 'var(--terminal-text-dim)', marginRight: '0.5rem' }}>{e.date}</span>
                      <span style={{
                        fontSize: '0.55rem', fontWeight: 700, padding: '0.1rem 0.4rem', marginRight: '0.5rem',
                        background: `${typeColors[e.type]}15`, color: typeColors[e.type],
                        border: `1px solid ${typeColors[e.type]}40`, textTransform: 'uppercase',
                      }}>{e.type}</span>
                      <span style={{ fontWeight: 600 }}>{e.title}</span>
                    </div>
                    {e.amount && e.amount > 0 && (
                      <span style={{ fontWeight: 700, color: e.direction === 'in' ? 'var(--terminal-green)' : 'var(--terminal-blue)', fontFamily: 'Bebas Neue, sans-serif' }}>
                        {e.direction === 'in' ? '+' : ''}{fmtMoney(e.amount)}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dim)', marginTop: '0.2rem' }}>{e.details}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!data && !loading && !politicianId && (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--terminal-text-dim)' }}>
          Search for a politician above to see their money-to-vote timeline
        </div>
      )}
    </div>
  );
}

// ── Main Page ──

type Tool = 'cross-state' | 'ownership' | 'voting-patterns' | 'timeline';

const TOOLS: { id: Tool; label: string; icon: string; desc: string }[] = [
  { id: 'cross-state', label: 'CROSS-STATE', icon: '\u{1F310}', desc: 'Same donor funding politicians in multiple states' },
  { id: 'ownership', label: 'OWNERSHIP TRACE', icon: '\u{1F517}', desc: 'PAC \u2192 Lobby Firm \u2192 Client \u2192 Politician chains' },
  { id: 'voting-patterns', label: 'VOTING PATTERNS', icon: '\u{1F4CA}', desc: 'Politicians who vote together 70%+ and share donors' },
  { id: 'timeline', label: 'TIMELINE', icon: '\u{23F1}', desc: 'Donation \u2192 Vote correlation for a politician' },
];

export default function InvestigatePage() {
  const [activeTool, setActiveTool] = useState<Tool>('cross-state');

  return (
    <div style={{ minHeight: '100vh', paddingBottom: '4rem' }}>
      {/* Header */}
      <div style={{ padding: '2rem', borderBottom: '1px solid var(--terminal-border)' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 400, letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
          DEEP INVESTIGATION
        </h1>
        <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Cross-state connections, ownership tracing, voting patterns, money-vote timelines
        </div>
      </div>

      {/* Tool selector */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '0.5rem',
        padding: '1rem 2rem', borderBottom: '1px solid var(--terminal-border)',
        background: 'var(--terminal-surface)',
      }}>
        {TOOLS.map(t => (
          <button key={t.id} onClick={() => setActiveTool(t.id)} style={{
            padding: '0.6rem 1.2rem', cursor: 'pointer',
            fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem', fontWeight: activeTool === t.id ? 700 : 400,
            background: activeTool === t.id ? 'rgba(0, 191, 255, 0.12)' : 'transparent',
            border: activeTool === t.id ? '1px solid var(--terminal-blue)' : '1px solid var(--terminal-border)',
            color: activeTool === t.id ? 'var(--terminal-blue)' : 'var(--terminal-text-dim)',
            textTransform: 'uppercase', letterSpacing: '0.05em', transition: 'all 0.2s',
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Tool description */}
      <div style={{ padding: '1rem 2rem', fontSize: '0.75rem', color: 'var(--terminal-text-dim)', borderBottom: '1px solid var(--terminal-border)' }}>
        {TOOLS.find(t => t.id === activeTool)?.desc}
      </div>

      {/* Tool content */}
      <div style={{ padding: '1.5rem 2rem' }}>
        {activeTool === 'cross-state' && <CrossStateTab />}
        {activeTool === 'ownership' && <OwnershipTab />}
        {activeTool === 'voting-patterns' && <VotingPatternsTab />}
        {activeTool === 'timeline' && <TimelineTab />}
      </div>

      <div className="classified-footer">
        DEEP INVESTIGATION TOOLS // CROSS-REFERENCE ANALYSIS // PUBLIC RECORDS: FEC, LDA, LEGISCAN, COURTLISTENER
      </div>
    </div>
  );
}

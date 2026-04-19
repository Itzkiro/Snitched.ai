'use client';

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PoliticianRow {
  bioguide_id: string;
  name: string;
  office: string;
  party: string;
  is_active: boolean;
  is_candidate: boolean;
  running_for: string | null;
  corruption_score: number;
  total_funds: number;
}

interface ResearchResult {
  politician: { name: string; office: string; party: string; bioguideId: string };
  financials: {
    fecId: string | null;
    totalFunds: number;
    top5Donors: Array<{ name: string; amount: number; type: string }>;
    contributionBreakdown: { aipac: number; otherPACs: number; individuals: number; corporate: number } | null;
    grassrootsRatio: number;
    foreignInfluenceFlag: boolean;
  };
  courtRecords: Array<Record<string, unknown>>;
  lobbying: {
    totalFilings: number;
    totalIncome: number;
    topFirms: Array<{ name: string; income: number; clients: number }>;
    revolvingDoorCount: number;
  };
  webIntel: {
    newsArticles: Array<{ title: string; url: string; publishedDate?: string }>;
    scandalFlags: string[];
    keyFindings: string[];
  };
  socialMedia: {
    postCount: number;
    platforms: string[];
    handles: Record<string, string>;
  };
  votingRecord: {
    totalVotes: number;
    yeaCount: number;
    nayCount: number;
    absentCount: number;
  };
  log: string[];
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Admin Page
// ---------------------------------------------------------------------------

export default function AdminPage() {
  const [secret, setSecret] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [politicians, setPoliticians] = useState<PoliticianRow[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<PoliticianRow | null>(null);
  const [research, setResearch] = useState<ResearchResult | null>(null);
  const [loading, setLoading] = useState('');
  const [status, setStatus] = useState('');
  const [filter, setFilter] = useState<'all' | 'candidates' | 'officials'>('all');
  const logRef = useRef<HTMLDivElement>(null);

  const api = useCallback(async (action: string, body: Record<string, unknown> = {}) => {
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
      body: JSON.stringify({ action, ...body }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `${res.status} ${res.statusText}`);
    }
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/csv')) {
      const blob = await res.blob();
      return blob;
    }
    return res.json();
  }, [secret]);

  // Login
  const handleLogin = async () => {
    setLoading('auth');
    try {
      const data = await api('list-politicians');
      if (data.error) {
        setStatus(`Error: ${data.error}`);
      } else {
        setPoliticians(data.politicians || []);
        setAuthenticated(true);
        setStatus(`Loaded ${(data.politicians || []).length} politicians`);
      }
    } catch (e) {
      setStatus(`Auth failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    setLoading('');
  };

  // Research
  const handleResearch = async () => {
    if (!selected) return;
    setLoading('research');
    setStatus(`Researching ${selected.name}...`);
    setResearch(null);
    try {
      const data = await api('research', { bioguideId: selected.bioguide_id });
      setResearch(data.result);
      setStatus(`Research complete for ${selected.name}`);
      setTimeout(() => logRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (e) {
      setStatus(`Research failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    setLoading('');
  };

  // Push to DB
  const handlePush = async () => {
    if (!selected || !research) return;
    setLoading('push');
    setStatus('Pushing to live database...');
    try {
      const updates: Record<string, unknown> = {};
      if (research.financials?.totalFunds > 0) updates.total_funds = research.financials.totalFunds;
      if (research.financials?.top5Donors?.length > 0) updates.top5_donors = research.financials.top5Donors;
      if (research.financials?.contributionBreakdown) updates.contribution_breakdown = research.financials.contributionBreakdown;
      if (research.financials?.fecId) {
        updates.source_ids = { fec_candidate_id: research.financials.fecId };
      }
      if (research.courtRecords?.length > 0) updates.court_records = research.courtRecords;

      await api('push-to-db', { bioguideId: selected.bioguide_id, updates });
      setStatus(`Pushed to DB for ${selected.name}`);
    } catch (e) {
      setStatus(`Push failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    setLoading('');
  };

  // Export
  const handleExport = async (format: 'csv' | 'json' | 'pdf') => {
    setLoading('export');
    try {
      if (format === 'csv') {
        const blob = await api('export', {
          bioguideId: selected?.bioguide_id || null,
          format: 'csv',
        });
        const url = URL.createObjectURL(blob as Blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `snitched-${selected ? selected.name.replace(/\s+/g, '-').toLowerCase() : 'all-candidates'}-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        setStatus('CSV exported');
      } else if (format === 'json') {
        const data = await api('export', { bioguideId: selected?.bioguide_id || null });
        const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `snitched-${selected ? selected.name.replace(/\s+/g, '-').toLowerCase() : 'all-candidates'}-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setStatus('JSON exported');
      } else if (format === 'pdf') {
        // Generate printable HTML and trigger print dialog
        const data = await api('export', { bioguideId: selected?.bioguide_id || null });
        const rows = data.data as Array<Record<string, unknown>>;
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(`
            <html><head><title>Snitched.ai Export</title>
            <style>
              body { font-family: monospace; font-size: 11px; padding: 20px; color: #000; }
              h1 { font-size: 18px; border-bottom: 2px solid #000; padding-bottom: 8px; }
              table { border-collapse: collapse; width: 100%; margin-top: 12px; }
              th, td { border: 1px solid #333; padding: 4px 8px; text-align: left; font-size: 10px; }
              th { background: #333; color: #fff; }
              tr:nth-child(even) { background: #f0f0f0; }
              .footer { margin-top: 20px; font-size: 9px; color: #666; }
            </style></head><body>
            <h1>SNITCHED.AI — Intelligence Export</h1>
            <p>Generated: ${new Date().toISOString()} | ${rows.length} records</p>
            <table>
              <tr><th>Name</th><th>Office</th><th>Party</th><th>Running For</th><th>Score</th><th>Funds</th><th>Pro-Israel Lobby</th><th>Court</th><th>Votes</th></tr>
              ${rows.map(r => `<tr>
                <td>${r.name}</td><td>${r.office}</td><td>${r.party}</td><td>${r.running_for || '-'}</td>
                <td>${r.corruption_score}</td><td>$${Number(r.total_funds || 0).toLocaleString()}</td>
                <td>$${Number((r as Record<string, unknown>).israel_lobby_total || r.aipac_funding || 0).toLocaleString()}</td>
                <td>${r.court_records_count}</td><td>${r.voting_records_count}</td>
              </tr>`).join('')}
            </table>
            <div class="footer">SNITCHED.AI // ALL DATA ACQUIRED VIA OSINT // PUBLIC RECORDS</div>
            </body></html>`);
          printWindow.document.close();
          printWindow.print();
          setStatus('PDF print dialog opened');
        }
      }
    } catch (e) {
      setStatus(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    setLoading('');
  };

  const fmt = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(0)}K` : `$${n}`;

  const filtered = politicians.filter(p => {
    if (filter === 'candidates' && !p.is_candidate) return false;
    if (filter === 'officials' && !p.is_active) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // ---------------------------------------------------------------------------
  // LOGIN SCREEN
  // ---------------------------------------------------------------------------
  if (!authenticated) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="terminal-card" style={{ maxWidth: '400px', width: '100%', padding: '2rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--terminal-red)', marginBottom: '1rem', letterSpacing: '0.1em' }}>
            🔒 ADMIN ACCESS
          </h1>
          <p style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginBottom: '1.5rem' }}>
            Enter admin secret to access the control panel.
          </p>
          <input
            type="password"
            value={secret}
            onChange={e => setSecret(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="Admin secret..."
            style={{
              width: '100%', padding: '0.75rem', background: 'var(--terminal-surface)',
              border: '1px solid var(--terminal-border)', color: 'var(--terminal-text)',
              fontFamily: 'JetBrains Mono, monospace', fontSize: '0.875rem', marginBottom: '1rem',
            }}
          />
          <button onClick={handleLogin} className="terminal-btn" style={{ width: '100%', padding: '0.75rem' }}
            disabled={loading === 'auth' || !secret}>
            {loading === 'auth' ? 'AUTHENTICATING...' : 'ACCESS TERMINAL'}
          </button>
          {status && <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--terminal-red)' }}>{status}</p>}
          <Link href="/" style={{ display: 'block', marginTop: '1rem', fontSize: '0.7rem', color: 'var(--terminal-text-dim)', textDecoration: 'none' }}>
            ← Back to Snitched.ai
          </Link>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // ADMIN DASHBOARD
  // ---------------------------------------------------------------------------
  return (
    <div style={{ minHeight: '100vh', padding: '1rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--terminal-red)', letterSpacing: '0.1em', margin: 0 }}>
            ⚡ ADMIN CONTROL PANEL
          </h1>
          <p style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dim)', margin: '0.25rem 0 0' }}>
            {politicians.length} politicians loaded | Research • Export • Push to Live
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => handleExport('csv')} className="terminal-btn" style={{ padding: '0.4rem 0.75rem', fontSize: '0.7rem' }}
            disabled={!!loading}>📊 EXPORT CSV</button>
          <button onClick={() => handleExport('json')} className="terminal-btn" style={{ padding: '0.4rem 0.75rem', fontSize: '0.7rem' }}
            disabled={!!loading}>📋 EXPORT JSON</button>
          <button onClick={() => handleExport('pdf')} className="terminal-btn" style={{ padding: '0.4rem 0.75rem', fontSize: '0.7rem' }}
            disabled={!!loading}>📄 EXPORT PDF</button>
          <Link href="/" className="terminal-btn" style={{ padding: '0.4rem 0.75rem', fontSize: '0.7rem', textDecoration: 'none' }}>← HOME</Link>
        </div>
      </div>

      {/* Status bar */}
      {status && (
        <div style={{ padding: '0.5rem 1rem', marginBottom: '1rem', background: 'rgba(0, 191, 255, 0.1)', border: '1px solid var(--terminal-blue)', fontSize: '0.75rem' }}>
          {loading && '⏳ '}{status}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 350px) 1fr', gap: '1rem', alignItems: 'start' }}>
        {/* LEFT: Politician Selector */}
        <div className="terminal-card" style={{ padding: '1rem' }}>
          <h2 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--terminal-amber)', marginBottom: '0.75rem', letterSpacing: '0.05em' }}>
            SELECT TARGET
          </h2>

          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name..."
            style={{
              width: '100%', padding: '0.5rem', background: 'var(--terminal-surface)',
              border: '1px solid var(--terminal-border)', color: 'var(--terminal-text)',
              fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', marginBottom: '0.5rem',
            }}
          />

          <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.75rem' }}>
            {(['all', 'candidates', 'officials'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} className="terminal-btn"
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.6rem', flex: 1,
                  background: filter === f ? 'rgba(255,255,255,0.1)' : 'transparent',
                  border: `1px solid ${filter === f ? 'var(--terminal-text-dim)' : 'var(--terminal-border)'}`,
                }}>
                {f.toUpperCase()}
              </button>
            ))}
          </div>

          <div style={{ maxHeight: '500px', overflow: 'auto' }}>
            {filtered.map(p => (
              <div
                key={p.bioguide_id}
                onClick={() => { setSelected(p); setResearch(null); }}
                style={{
                  padding: '0.5rem',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--terminal-border)',
                  background: selected?.bioguide_id === p.bioguide_id ? 'rgba(0, 191, 255, 0.15)' : 'transparent',
                }}
                onMouseEnter={e => { if (selected?.bioguide_id !== p.bioguide_id) (e.currentTarget).style.background = 'rgba(255,255,255,0.03)'; }}
                onMouseLeave={e => { if (selected?.bioguide_id !== p.bioguide_id) (e.currentTarget).style.background = 'transparent'; }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{p.name}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--terminal-text-dim)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.15rem' }}>
                  <span>{p.office}</span>
                  <span style={{ color: p.party === 'Republican' ? '#ef4444' : p.party === 'Democrat' ? '#3b82f6' : '#9ca3af' }}>
                    {p.party}
                  </span>
                  {p.is_candidate && <span style={{ color: 'var(--terminal-amber)' }}>CANDIDATE</span>}
                  {p.total_funds > 0 && <span style={{ color: 'var(--terminal-green)' }}>{fmt(p.total_funds)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Research Panel */}
        <div>
          {!selected ? (
            <div className="terminal-card" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎯</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--terminal-text-dim)' }}>
                SELECT A POLITICIAN TO RESEARCH
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginTop: '0.5rem' }}>
                Choose from the list to run 4-pillar investigation
              </p>
            </div>
          ) : (
            <div>
              {/* Selected politician header */}
              <div className="terminal-card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>{selected.name}</h2>
                    <p style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', margin: '0.25rem 0 0' }}>
                      {selected.office} • {selected.party}
                      {selected.running_for && ` • Running for: ${selected.running_for}`}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={handleResearch} className="terminal-btn"
                      style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', background: 'rgba(0, 191, 255, 0.2)', border: '1px solid var(--terminal-blue)' }}
                      disabled={loading === 'research'}>
                      {loading === 'research' ? '⏳ RESEARCHING...' : '🔍 RUN RESEARCH'}
                    </button>
                    {research && (
                      <button onClick={handlePush} className="terminal-btn"
                        style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', background: 'rgba(16, 185, 129, 0.2)', border: '1px solid var(--terminal-green)' }}
                        disabled={loading === 'push'}>
                        {loading === 'push' ? '⏳ PUSHING...' : '🚀 PUSH TO LIVE DB'}
                      </button>
                    )}
                    <button onClick={() => handleExport('csv')} className="terminal-btn"
                      style={{ padding: '0.5rem 0.75rem', fontSize: '0.7rem' }}
                      disabled={!!loading}>📊 CSV</button>
                    <button onClick={() => handleExport('pdf')} className="terminal-btn"
                      style={{ padding: '0.5rem 0.75rem', fontSize: '0.7rem' }}
                      disabled={!!loading}>📄 PDF</button>
                  </div>
                </div>
              </div>

              {/* Research Results */}
              {research && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  {/* Scandal Flags */}
                  {research.webIntel?.scandalFlags?.length > 0 && (
                    <div className="terminal-card" style={{ padding: '1rem', gridColumn: '1 / -1', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444' }}>
                      <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#ef4444', marginBottom: '0.5rem' }}>🚨 SCANDAL FLAGS</h3>
                      {research.webIntel.scandalFlags.map((f: string, i: number) => (
                        <div key={i} style={{ fontSize: '0.7rem', color: '#ef4444', padding: '0.2rem 0' }}>{f}</div>
                      ))}
                    </div>
                  )}

                  {/* Pillar 1: Financials */}
                  <div className="terminal-card" style={{ padding: '1rem' }}>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f97583', marginBottom: '0.75rem' }}>💰 FINANCIALS</h3>
                    <div style={{ fontSize: '0.75rem' }}>
                      <div>FEC ID: <span style={{ color: 'var(--terminal-text-dim)' }}>{research.financials?.fecId || 'Not found'}</span></div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f97583', margin: '0.5rem 0' }}>
                        {fmt(research.financials?.totalFunds || 0)}
                      </div>
                      {research.financials?.grassrootsRatio != null && (
                        <div style={{ fontSize: '0.7rem', marginBottom: '0.5rem' }}>
                          Grassroots ratio: <span style={{ fontWeight: 700, color: research.financials.grassrootsRatio > 50 ? '#10b981' : '#f59e0b' }}>
                            {research.financials.grassrootsRatio}%
                          </span>
                        </div>
                      )}
                      {research.financials?.foreignInfluenceFlag && (
                        <div style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 700, marginBottom: '0.5rem' }}>
                          ⚠️ FOREIGN INFLUENCE DETECTED
                        </div>
                      )}
                      {research.financials?.contributionBreakdown && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dim)' }}>
                          Individuals: {fmt(research.financials.contributionBreakdown.individuals || 0)} |
                          PACs: {fmt(research.financials.contributionBreakdown.otherPACs || 0)} |
                          Corporate: {fmt(research.financials.contributionBreakdown.corporate || 0)}
                        </div>
                      )}
                      {research.financials?.top5Donors?.length > 0 && (
                        <div style={{ marginTop: '0.75rem' }}>
                          <div style={{ fontSize: '0.7rem', fontWeight: 700, marginBottom: '0.25rem' }}>TOP DONORS</div>
                          {research.financials.top5Donors.map((d: { name: string; amount: number }, i: number) => (
                            <div key={i} style={{ fontSize: '0.7rem', display: 'flex', justifyContent: 'space-between', padding: '0.15rem 0', borderBottom: '1px solid var(--terminal-border)' }}>
                              <span>{d.name}</span>
                              <span style={{ color: '#f97583', fontWeight: 600 }}>{fmt(d.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Pillar 2: Court Records */}
                  <div className="terminal-card" style={{ padding: '1rem' }}>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#b392f0', marginBottom: '0.75rem' }}>⚖️ COURT RECORDS</h3>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#b392f0', marginBottom: '0.5rem' }}>
                      {research.courtRecords?.length || 0} records
                    </div>
                    <div style={{ maxHeight: '200px', overflow: 'auto' }}>
                      {!research.courtRecords?.length ? (
                        <div style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dim)' }}>No court records found</div>
                      ) : (
                        research.courtRecords.map((c: Record<string, unknown>, i: number) => (
                          <div key={i} style={{ fontSize: '0.7rem', padding: '0.3rem 0', borderBottom: '1px solid var(--terminal-border)' }}>
                            <div style={{ fontWeight: 600 }}>{String(c.caseName || c.case_name || 'Untitled').slice(0, 60)}</div>
                            <div style={{ color: 'var(--terminal-text-dim)' }}>
                              {String(c.court || '')} | {String(c.docketNumber || c.docket_number || '')} | {String(c.dateFiled || c.date_filed || 'No date')}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Pillar 3: Lobbying */}
                  <div className="terminal-card" style={{ padding: '1rem' }}>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e3b341', marginBottom: '0.75rem' }}>🏛️ LOBBYING</h3>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e3b341', marginBottom: '0.5rem' }}>
                      {research.lobbying?.totalFilings || 0} filings
                    </div>
                    {research.lobbying?.revolvingDoorCount > 0 && (
                      <div style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 700, marginBottom: '0.5rem' }}>
                        🔄 {research.lobbying.revolvingDoorCount} revolving door connections
                      </div>
                    )}
                    <div style={{ maxHeight: '150px', overflow: 'auto' }}>
                      {(research.lobbying?.topFirms || []).map((f: { name: string; income: number; clients: number }, i: number) => (
                        <div key={i} style={{ fontSize: '0.7rem', display: 'flex', justifyContent: 'space-between', padding: '0.15rem 0', borderBottom: '1px solid var(--terminal-border)' }}>
                          <span>{f.name} ({f.clients} clients)</span>
                          <span style={{ color: '#e3b341', fontWeight: 600 }}>{fmt(f.income)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Pillar 4: Voting Records */}
                  <div className="terminal-card" style={{ padding: '1rem' }}>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#7ee787', marginBottom: '0.75rem' }}>🗳️ VOTING RECORDS</h3>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#7ee787', marginBottom: '0.5rem' }}>
                      {research.votingRecord?.totalVotes || 0} votes
                    </div>
                    {research.votingRecord?.totalVotes > 0 && (
                      <div style={{ fontSize: '0.7rem', display: 'flex', gap: '1rem' }}>
                        <span style={{ color: '#56d364' }}>Yea: {research.votingRecord.yeaCount}</span>
                        <span style={{ color: '#f97583' }}>Nay: {research.votingRecord.nayCount}</span>
                        <span style={{ color: '#8b949e' }}>Absent: {research.votingRecord.absentCount}</span>
                      </div>
                    )}
                  </div>

                  {/* Pillar 5: Social Media */}
                  <div className="terminal-card" style={{ padding: '1rem' }}>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#ffa657', marginBottom: '0.75rem' }}>📱 SOCIAL MEDIA</h3>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ffa657', marginBottom: '0.5rem' }}>
                      {research.socialMedia?.postCount || 0} posts
                    </div>
                    {Object.entries(research.socialMedia?.handles || {}).map(([platform, handle]) => (
                      <div key={platform} style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dim)' }}>
                        {platform}: <span style={{ color: '#ffa657' }}>{String(handle)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Pillar 6: Web Intelligence */}
                  <div className="terminal-card" style={{ padding: '1rem' }}>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#79c0ff', marginBottom: '0.75rem' }}>🌐 WEB INTEL</h3>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#79c0ff', marginBottom: '0.5rem' }}>
                      {research.webIntel?.newsArticles?.length || 0} articles
                    </div>
                    <div style={{ maxHeight: '200px', overflow: 'auto' }}>
                      {(research.webIntel?.newsArticles || []).slice(0, 8).map((a: { title: string; url: string; publishedDate?: string }, i: number) => (
                        <div key={i} style={{ fontSize: '0.7rem', padding: '0.3rem 0', borderBottom: '1px solid var(--terminal-border)' }}>
                          <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ color: '#79c0ff', textDecoration: 'none' }}>
                            {a.title || a.url}
                          </a>
                          {a.publishedDate && <span style={{ color: 'var(--terminal-text-dim)', marginLeft: '0.5rem' }}>{a.publishedDate.split('T')[0]}</span>}
                        </div>
                      ))}
                      {!research.webIntel?.newsArticles?.length && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dim)' }}>Add EXA_API_KEY to enable web intelligence</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Research Log */}
              {research && (
                <div ref={logRef} className="terminal-card" style={{ padding: '1rem', marginTop: '1rem' }}>
                  <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--terminal-text-dim)', marginBottom: '0.5rem' }}>📋 RESEARCH LOG</h3>
                  <pre style={{
                    fontSize: '0.65rem', color: 'var(--terminal-green)', background: 'rgba(0,0,0,0.3)',
                    padding: '0.75rem', maxHeight: '300px', overflow: 'auto', whiteSpace: 'pre-wrap',
                    border: '1px solid var(--terminal-border)', fontFamily: 'JetBrains Mono, monospace',
                  }}>
                    {research.log.join('\n')}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

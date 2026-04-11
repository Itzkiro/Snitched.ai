'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface Alert {
  id: string;
  type: string;
  severity: string;
  title: string;
  summary: string;
  url: string;
  politician_id: string | null;
  politician_name: string | null;
  amount: number;
  source: string;
  metadata: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f59e0b',
  medium: '#3b82f6',
  info: '#6b7280',
};

const TYPE_ICONS: Record<string, string> = {
  news: '\u{1F4F0}',
  fec_filing: '\u{1F4B0}',
  scandal: '\u{1F6A8}',
  lobby_filing: '\u{1F3E2}',
};

function fmtMoney(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return n > 0 ? `$${n}` : '';
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function IntelPage() {
  const searchParams = useSearchParams();
  const stateParam = searchParams.get('state') || '';
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [counts, setCounts] = useState({ critical: 0, high: 0, medium: 0, info: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadAlerts = useCallback(async () => {
    const params = new URLSearchParams({ limit: '100' });
    if (filter !== 'all') params.set('severity', filter);
    if (typeFilter !== 'all') params.set('type', typeFilter);
    if (stateParam) params.set('state', stateParam);

    const res = await fetch(`/api/intel?${params}`);
    const data = await res.json();
    setAlerts(data.alerts || []);
    setCounts(data.counts || { critical: 0, high: 0, medium: 0, info: 0 });
    setLoading(false);
  }, [filter, typeFilter, stateParam]);

  useEffect(() => { loadAlerts(); }, [loadAlerts]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(loadAlerts, 60000);
    return () => clearInterval(t);
  }, [autoRefresh, loadAlerts]);

  return (
    <div style={{ minHeight: '100vh', paddingBottom: '4rem' }}>
      {/* Header */}
      <div style={{ padding: '2rem', borderBottom: '1px solid var(--terminal-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '2.5rem', fontWeight: 400, letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
              LIVE INTELLIGENCE
            </h1>
            <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Real-time alerts from FEC filings, news monitors, and scandal detection
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.4rem 0.8rem', fontSize: '0.7rem',
              background: autoRefresh ? 'rgba(0, 255, 65, 0.08)' : 'transparent',
              border: `1px solid ${autoRefresh ? 'var(--terminal-green)' : 'var(--terminal-border)'}`,
              color: autoRefresh ? 'var(--terminal-green)' : 'var(--terminal-text-dim)',
              cursor: 'pointer',
            }} onClick={() => setAutoRefresh(!autoRefresh)}>
              <span style={{ animation: autoRefresh ? 'pulse 2s infinite' : 'none' }}>{autoRefresh ? '\u{25CF}' : '\u{25CB}'}</span>
              {autoRefresh ? 'LIVE' : 'PAUSED'}
            </div>
            <button onClick={loadAlerts} style={{
              padding: '0.4rem 0.8rem', fontSize: '0.7rem', cursor: 'pointer',
              background: 'var(--terminal-card)', border: '1px solid var(--terminal-border)',
              color: 'var(--terminal-text-dim)', fontFamily: 'JetBrains Mono, monospace',
            }}>REFRESH</button>
          </div>
        </div>
      </div>

      {/* Severity counters */}
      <div style={{
        display: 'flex', gap: '0.75rem', padding: '1rem 2rem',
        borderBottom: '1px solid var(--terminal-border)', flexWrap: 'wrap',
      }}>
        {[
          { key: 'all', label: 'ALL', count: alerts.length, color: 'var(--terminal-blue)' },
          { key: 'critical', label: 'CRITICAL', count: counts.critical, color: '#ef4444' },
          { key: 'high', label: 'HIGH', count: counts.high, color: '#f59e0b' },
          { key: 'medium', label: 'MEDIUM', count: counts.medium, color: '#3b82f6' },
          { key: 'info', label: 'INFO', count: counts.info, color: '#6b7280' },
        ].map(s => (
          <button key={s.key} onClick={() => setFilter(s.key)} style={{
            padding: '0.5rem 1rem', cursor: 'pointer',
            fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem',
            background: filter === s.key ? `${s.color}15` : 'transparent',
            border: filter === s.key ? `1px solid ${s.color}` : '1px solid var(--terminal-border)',
            color: filter === s.key ? s.color : 'var(--terminal-text-dim)',
            fontWeight: filter === s.key ? 700 : 400,
          }}>
            {s.label} ({s.count})
          </button>
        ))}

        <div style={{ flex: 1 }} />

        {/* Type filter */}
        {['all', 'news', 'fec_filing'].map(t => (
          <button key={t} onClick={() => setTypeFilter(t)} style={{
            padding: '0.4rem 0.8rem', cursor: 'pointer',
            fontFamily: 'JetBrains Mono, monospace', fontSize: '0.65rem',
            background: typeFilter === t ? 'rgba(0, 191, 255, 0.1)' : 'transparent',
            border: typeFilter === t ? '1px solid var(--terminal-blue)' : '1px solid var(--terminal-border)',
            color: typeFilter === t ? 'var(--terminal-blue)' : 'var(--terminal-text-dim)',
            textTransform: 'uppercase',
          }}>
            {t === 'all' ? 'ALL TYPES' : t === 'news' ? '\u{1F4F0} NEWS' : '\u{1F4B0} FEC'}
          </button>
        ))}
      </div>

      {/* Alerts feed */}
      <div style={{ padding: '1rem 2rem' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--terminal-text-dim)' }}>
            Loading intelligence feed...
          </div>
        ) : alerts.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--terminal-text-dim)' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>{'\u{1F4E1}'}</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>NO ALERTS YET</div>
            <div style={{ fontSize: '0.8rem' }}>
              The news monitor and FEC tracker crons will populate this feed automatically.
              Run them manually to get started.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {alerts.map(alert => (
              <div key={alert.id} style={{
                padding: '1rem',
                background: alert.severity === 'critical' ? 'rgba(239, 68, 68, 0.05)' : 'var(--terminal-card)',
                border: `1px solid ${alert.severity === 'critical' ? 'rgba(239, 68, 68, 0.3)' : 'var(--terminal-border)'}`,
                transition: 'border-color 0.2s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    {/* Type + severity badges */}
                    <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem', alignItems: 'center' }}>
                      <span style={{
                        fontSize: '0.55rem', fontWeight: 700, padding: '0.15rem 0.4rem',
                        background: `${SEVERITY_COLORS[alert.severity]}15`,
                        color: SEVERITY_COLORS[alert.severity],
                        border: `1px solid ${SEVERITY_COLORS[alert.severity]}40`,
                        textTransform: 'uppercase',
                      }}>{alert.severity}</span>
                      <span style={{
                        fontSize: '0.55rem', padding: '0.15rem 0.4rem',
                        background: 'rgba(0, 191, 255, 0.08)', border: '1px solid rgba(0, 191, 255, 0.2)',
                        color: 'var(--terminal-blue)', textTransform: 'uppercase',
                      }}>{TYPE_ICONS[alert.type] || ''} {alert.type.replace('_', ' ')}</span>
                      <span style={{ fontSize: '0.6rem', color: 'var(--terminal-text-dim)' }}>
                        {timeAgo(alert.created_at)}
                      </span>
                    </div>

                    {/* Title */}
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                      {alert.url ? (
                        <a href={alert.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                          {alert.title} <span style={{ fontSize: '0.65rem', color: 'var(--terminal-blue)' }}>{'\u2197'}</span>
                        </a>
                      ) : alert.title}
                    </div>

                    {/* Summary */}
                    {alert.summary && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', lineHeight: 1.5 }}>
                        {alert.summary}
                      </div>
                    )}

                    {/* Politician link */}
                    {alert.politician_id && (
                      <div style={{ marginTop: '0.4rem' }}>
                        <Link href={`/politician/${alert.politician_id}`} style={{
                          fontSize: '0.7rem', color: 'var(--terminal-blue)', textDecoration: 'none',
                        }}>
                          {alert.politician_name || alert.politician_id} &rarr;
                        </Link>
                      </div>
                    )}
                  </div>

                  {/* Amount badge */}
                  {alert.amount > 0 && (
                    <div style={{
                      fontWeight: 700, fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.2rem',
                      color: (alert.metadata as Record<string, unknown>)?.is_israel_lobby ? 'var(--terminal-red)' : 'var(--terminal-green)',
                      whiteSpace: 'nowrap',
                    }}>
                      {fmtMoney(alert.amount)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="classified-footer">
        REAL-TIME INTELLIGENCE // SOURCES: EXA AI, FEC API, LDA // AUTO-REFRESH EVERY 60S
      </div>
    </div>
  );
}

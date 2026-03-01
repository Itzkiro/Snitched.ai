'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function TerminalHeader() {
  const pathname = usePathname();

  return (
    <>
      {/* Top status bar */}
      <div className="terminal-header">
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
          <span>🇺🇸 FL</span>
          <span>{new Date().toISOString().replace('T', ' ').slice(0, 19)}</span>
          <span>POLITICAL INTELLIGENCE NETWORK</span>
        </div>
        <div className="terminal-status">
          <div className="status-item">
            <span className="status-live">●</span>
            <span>LIVE</span>
          </div>
          <div className="status-item">
            <span>SYSTEM OPERATIONAL</span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div style={{ 
        background: 'var(--terminal-surface)', 
        borderBottom: '1px solid var(--terminal-border)',
        padding: '0.75rem 2rem',
        display: 'flex',
        gap: '2rem'
      }}>
        <Link 
          href="/"
          style={{ 
            color: pathname === '/' ? 'var(--terminal-blue)' : 'var(--terminal-text-dim)',
            textDecoration: 'none',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            fontWeight: 600,
            transition: 'color 0.2s'
          }}
        >
          🏠 HOME
        </Link>
        <Link 
          href="/officials"
          style={{ 
            color: pathname === '/officials' ? 'var(--terminal-blue)' : 'var(--terminal-text-dim)',
            textDecoration: 'none',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            fontWeight: 600
          }}
        >
          👔 SEATED OFFICIALS
        </Link>
        <Link 
          href="/candidates"
          style={{ 
            color: pathname === '/candidates' ? 'var(--terminal-blue)' : 'var(--terminal-text-dim)',
            textDecoration: 'none',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            fontWeight: 600
          }}
        >
          🗳️ CANDIDATES
        </Link>
        <Link 
          href="/hierarchy"
          style={{ 
            color: pathname === '/hierarchy' ? 'var(--terminal-blue)' : 'var(--terminal-text-dim)',
            textDecoration: 'none',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            fontWeight: 600
          }}
        >
          📊 HIERARCHY
        </Link>
        <Link 
          href="/juicebox"
          style={{ 
            color: pathname === '/juicebox' ? 'var(--terminal-blue)' : 'var(--terminal-text-dim)',
            textDecoration: 'none',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            fontWeight: 600
          }}
        >
          💰 JUICE BOX LEADERBOARD
        </Link>
        <Link 
          href="/browse"
          style={{ 
            color: pathname === '/browse' ? 'var(--terminal-blue)' : 'var(--terminal-text-dim)',
            textDecoration: 'none',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            fontWeight: 600
          }}
        >
          🔍 DATABASE
        </Link>
      </div>
    </>
  );
}

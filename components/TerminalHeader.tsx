'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import SearchBar from './SearchBar';

const STATES = [
  { code: 'ALL', name: 'All States' },
  { code: 'FL', name: 'Florida' },
  { code: 'TX', name: 'Texas' },
  { code: 'CA', name: 'California' },
  { code: 'NY', name: 'New York' },
  { code: 'GA', name: 'Georgia' },
  { code: 'OH', name: 'Ohio' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'IL', name: 'Illinois' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'MI', name: 'Michigan' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'IN', name: 'Indiana' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MO', name: 'Missouri' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'CO', name: 'Colorado' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'AL', name: 'Alabama' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'OR', name: 'Oregon' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'UT', name: 'Utah' },
  { code: 'IA', name: 'Iowa' },
  { code: 'NV', name: 'Nevada' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'KS', name: 'Kansas' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'ID', name: 'Idaho' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'ME', name: 'Maine' },
  { code: 'MT', name: 'Montana' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'DE', name: 'Delaware' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'AK', name: 'Alaska' },
  { code: 'VT', name: 'Vermont' },
  { code: 'WY', name: 'Wyoming' },
  { code: 'DC', name: 'Washington D.C.' },
];

export default function TerminalHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [stateOpen, setStateOpen] = useState(false);
  const [selectedState, setSelectedState] = useState(searchParams.get('state') || 'FL');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const stateQuery = selectedState && selectedState !== 'ALL' ? `?state=${selectedState}` : '';

  // Close dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setStateOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleStateSelect = (code: string) => {
    setSelectedState(code);
    setStateOpen(false);
    // Update URL with state param
    const params = new URLSearchParams(searchParams.toString());
    if (code === 'ALL') {
      params.delete('state');
    } else {
      params.set('state', code);
    }
    const query = params.toString();
    router.push(pathname + (query ? `?${query}` : ''));
  };

  return (
    <>
      {/* Top status bar */}
      <div className="terminal-header">
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setStateOpen(!stateOpen)}
              style={{
                background: 'none', border: '1px solid var(--terminal-border)',
                color: 'var(--terminal-blue)', cursor: 'pointer', padding: '0.2rem 0.5rem',
                fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem', fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: '0.3rem',
                letterSpacing: '0.05em',
              }}
            >
              🇺🇸 {selectedState} <span style={{ fontSize: '0.5rem', opacity: 0.6 }}>▼</span>
            </button>
            {stateOpen && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, zIndex: 1000,
                background: 'var(--terminal-card)', border: '1px solid var(--terminal-border)',
                maxHeight: '400px', overflowY: 'auto', width: '220px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              }}>
                {STATES.map(s => (
                  <div
                    key={s.code}
                    onClick={() => handleStateSelect(s.code)}
                    style={{
                      padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: '0.75rem',
                      fontFamily: 'JetBrains Mono, monospace',
                      background: selectedState === s.code ? 'rgba(0, 191, 255, 0.15)' : 'transparent',
                      color: selectedState === s.code ? 'var(--terminal-blue)' : 'var(--terminal-text)',
                      borderBottom: '1px solid var(--terminal-border)',
                      display: 'flex', justifyContent: 'space-between',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0, 191, 255, 0.08)')}
                    onMouseLeave={e => (e.currentTarget.style.background = selectedState === s.code ? 'rgba(0, 191, 255, 0.15)' : 'transparent')}
                  >
                    <span>{s.name}</span>
                    <span style={{ color: 'var(--terminal-text-dim)', fontSize: '0.65rem' }}>{s.code}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
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
      <div className="terminal-nav" style={{
        background: 'var(--terminal-surface)',
        borderBottom: '1px solid var(--terminal-border)',
        padding: '0.75rem 2rem',
        display: 'flex',
        alignItems: 'center',
        gap: '2rem'
      }}>
        <Link 
          href={`/${stateQuery}`}
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
          href={`/officials${stateQuery}`}
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
          href={`/candidates${stateQuery}`}
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
          href={`/hierarchy${stateQuery}`}
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
          href={`/juicebox${stateQuery}`}
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
          href={`/social${stateQuery}`}
          style={{
            color: pathname === '/social' ? 'var(--terminal-blue)' : 'var(--terminal-text-dim)',
            textDecoration: 'none',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            fontWeight: 600
          }}
        >
          📡 SOCIAL INTEL
        </Link>
        <Link
          href={`/browse${stateQuery}`}
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
        <Link
          href={`/compare${stateQuery}`}
          style={{
            color: pathname === '/compare' ? 'var(--terminal-blue)' : 'var(--terminal-text-dim)',
            textDecoration: 'none',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            fontWeight: 600
          }}
        >
          ⚖️ COMPARE
        </Link>
        <Link
          href={`/connections${stateQuery}`}
          style={{
            color: pathname === '/connections' ? 'var(--terminal-blue)' : 'var(--terminal-text-dim)',
            textDecoration: 'none',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            fontWeight: 600
          }}
        >
          🕸️ CONNECTIONS
        </Link>

        {/* Spacer to push search to the right */}
        <div style={{ flex: 1 }} />

        {/* Global Search */}
        <SearchBar />
      </div>
    </>
  );
}

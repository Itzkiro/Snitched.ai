'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import SearchBar from './SearchBar';
import SearchOverlay from './SearchOverlay';
import MobileNavDrawer, { type NavLink, type StateOption } from './MobileNavDrawer';
import { useTerminal } from './TerminalContext';

const STATES: StateOption[] = [
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

/**
 * Build the 11-link primary nav. Each link is suffixed with the active
 * `?state=...` query (when not ALL) so deep-linking the state preference
 * survives navigation between sections.
 */
function buildNavLinks(stateQuery: string): NavLink[] {
  return [
    { href: `/${stateQuery}`, label: '🏠 HOME' },
    { href: `/dashboard${stateQuery}`, label: '📊 DASHBOARD' },
    { href: `/officials${stateQuery}`, label: '👔 SEATED OFFICIALS' },
    { href: `/candidates${stateQuery}`, label: '🗳️ CANDIDATES' },
    { href: `/hierarchy${stateQuery}`, label: '📊 HIERARCHY' },
    { href: `/juicebox${stateQuery}`, label: '💰 JUICE BOX LEADERBOARD' },
    { href: `/social${stateQuery}`, label: '📡 SOCIAL INTEL' },
    { href: `/browse${stateQuery}`, label: 'DATABASE' },
    { href: `/connections${stateQuery}`, label: '🕸️ CONNECTIONS' },
    { href: '/investigate', label: '🔬 INVESTIGATE' },
    { href: '/intel', label: '📡 LIVE INTEL' },
  ];
}

export default function TerminalHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { exit } = useTerminal();
  const searchParams = useSearchParams();
  const [stateOpen, setStateOpen] = useState(false);
  const [selectedState, setSelectedState] = useState(searchParams.get('state') || 'FL');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
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

  const handleDrawerStateChange = (code: string) => {
    handleStateSelect(code);
    setDrawerOpen(false);
  };

  const navLinks = buildNavLinks(stateQuery);

  return (
    <>
      {/* Top status bar — responsive: stacks on (base), single row on lg: */}
      <div className="terminal-header">
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setStateOpen(!stateOpen)}
              className="min-h-[44px] min-w-[44px]"
              style={{
                background: 'none', border: '1px solid var(--terminal-border)',
                color: 'var(--terminal-green)', cursor: 'pointer', padding: '0.4rem 0.75rem',
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
                      background: selectedState === s.code ? 'rgba(0, 255, 65, 0.15)' : 'transparent',
                      color: selectedState === s.code ? 'var(--terminal-green)' : 'var(--terminal-text)',
                      borderBottom: '1px solid var(--terminal-border)',
                      display: 'flex', justifyContent: 'space-between',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0, 255, 65, 0.08)')}
                    onMouseLeave={e => (e.currentTarget.style.background = selectedState === s.code ? 'rgba(0, 255, 65, 0.15)' : 'transparent')}
                  >
                    <span>{s.name}</span>
                    <span style={{ color: 'var(--terminal-text-dim)', fontSize: '0.65rem' }}>{s.code}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <span>{new Date().toISOString().replace('T', ' ').slice(0, 19)}</span>
          {/* Tagline drops on (base), returns at sm:+ per D-09 */}
          <span className="hidden sm:block">POLITICAL INTELLIGENCE NETWORK</span>
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

      {/* Navigation — two-row on (base), single-row on lg: per D-08 */}
      <div
        className="terminal-nav flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-4 p-3 sm:p-6 lg:p-8"
        style={{
          background: 'var(--terminal-surface)',
          borderBottom: '1px solid var(--terminal-border)',
        }}
      >
        {/* Row 1 (base): hamburger + LOGO area */}
        <div className="flex items-center gap-3 lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-expanded={drawerOpen}
            aria-controls="mobile-nav-drawer"
            aria-label="Open navigation"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-terminal-green text-2xl"
            style={{
              background: 'none',
              border: '1px solid var(--terminal-border)',
              cursor: 'pointer',
              fontFamily: 'var(--font-terminal)',
            }}
          >
            ≡
          </button>
          <button
            onClick={() => { exit(); router.push('/'); }}
            className="min-h-[44px] flex items-center"
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '0 0.5rem',
              color: 'var(--terminal-green)',
              fontSize: '14px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontWeight: 700,
              fontFamily: 'var(--font-terminal)',
            }}
          >
            🏠 SNITCHED.AI
          </button>
        </div>

        {/* Row 2 (base): inline SearchBar (becomes overlay trigger via SearchBar's own sm:hidden branch) */}
        <div className="lg:hidden w-full">
          <SearchBar onOpenOverlay={() => setSearchOverlayOpen(true)} />
        </div>

        {/* lg:+ row: existing desktop layout [HOME][nav links][search] */}
        <nav className="hidden lg:flex items-center gap-4 lg:gap-8 w-full" aria-label="Primary">
          <button
            onClick={() => { exit(); router.push('/'); }}
            aria-current={pathname === '/' ? 'page' : undefined}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: pathname === '/' ? 'var(--terminal-green)' : 'var(--terminal-text-dim)',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontWeight: 600,
              fontFamily: 'var(--font-terminal)',
              transition: 'color 0.2s',
            }}
          >
            🏠 HOME
          </button>
          <Link
            href={`/dashboard${stateQuery}`}
            aria-current={pathname === '/dashboard' ? 'page' : undefined}
            style={{
              color: pathname === '/dashboard' ? 'var(--terminal-green)' : 'var(--terminal-text-dim)',
              textDecoration: 'none',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontWeight: 600,
            }}
          >
            📊 DASHBOARD
          </Link>
          <Link
            href={`/officials${stateQuery}`}
            aria-current={pathname === '/officials' ? 'page' : undefined}
            style={{
              color: pathname === '/officials' ? 'var(--terminal-green)' : 'var(--terminal-text-dim)',
              textDecoration: 'none',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontWeight: 600,
            }}
          >
            👔 SEATED OFFICIALS
          </Link>
          <Link
            href={`/candidates${stateQuery}`}
            aria-current={pathname === '/candidates' ? 'page' : undefined}
            style={{
              color: pathname === '/candidates' ? 'var(--terminal-green)' : 'var(--terminal-text-dim)',
              textDecoration: 'none',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontWeight: 600,
            }}
          >
            🗳️ CANDIDATES
          </Link>
          <Link
            href={`/hierarchy${stateQuery}`}
            aria-current={pathname === '/hierarchy' ? 'page' : undefined}
            style={{
              color: pathname === '/hierarchy' ? 'var(--terminal-green)' : 'var(--terminal-text-dim)',
              textDecoration: 'none',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontWeight: 600,
            }}
          >
            📊 HIERARCHY
          </Link>
          <Link
            href={`/juicebox${stateQuery}`}
            aria-current={pathname === '/juicebox' ? 'page' : undefined}
            style={{
              color: pathname === '/juicebox' ? 'var(--terminal-green)' : 'var(--terminal-text-dim)',
              textDecoration: 'none',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontWeight: 600,
            }}
          >
            💰 JUICE BOX LEADERBOARD
          </Link>
          <Link
            href={`/social${stateQuery}`}
            aria-current={pathname === '/social' ? 'page' : undefined}
            style={{
              color: pathname === '/social' ? 'var(--terminal-green)' : 'var(--terminal-text-dim)',
              textDecoration: 'none',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontWeight: 600,
            }}
          >
            📡 SOCIAL INTEL
          </Link>
          <Link
            href={`/browse${stateQuery}`}
            aria-current={pathname === '/browse' ? 'page' : undefined}
            style={{
              color: pathname === '/browse' ? 'var(--terminal-green)' : 'var(--terminal-text-dim)',
              textDecoration: 'none',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontWeight: 600,
            }}
          >
            DATABASE
          </Link>
          <Link
            href={`/connections${stateQuery}`}
            aria-current={pathname === '/connections' ? 'page' : undefined}
            style={{
              color: pathname === '/connections' ? 'var(--terminal-green)' : 'var(--terminal-text-dim)',
              textDecoration: 'none',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontWeight: 600,
            }}
          >
            🕸️ CONNECTIONS
          </Link>
          <Link
            href="/investigate"
            aria-current={pathname === '/investigate' ? 'page' : undefined}
            style={{
              color: pathname === '/investigate' ? 'var(--terminal-green)' : 'var(--terminal-text-dim)',
              textDecoration: 'none',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontWeight: 600,
            }}
          >
            🔬 INVESTIGATE
          </Link>
          <Link
            href="/intel"
            aria-current={pathname === '/intel' ? 'page' : undefined}
            style={{
              color: pathname === '/intel' ? 'var(--terminal-green)' : 'var(--terminal-text-dim)',
              textDecoration: 'none',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontWeight: 600,
            }}
          >
            📡 LIVE INTEL
          </Link>

          {/* Spacer to push search to the right */}
          <div style={{ flex: 1 }} />

          {/* Global Search */}
          <SearchBar onOpenOverlay={() => setSearchOverlayOpen(true)} />
        </nav>
      </div>

      <MobileNavDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        navLinks={navLinks}
        states={STATES}
        activeStateCode={selectedState}
        onStateChange={handleDrawerStateChange}
      />

      <SearchOverlay
        open={searchOverlayOpen}
        onClose={() => setSearchOverlayOpen(false)}
      />
    </>
  );
}


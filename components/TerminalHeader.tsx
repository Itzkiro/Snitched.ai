'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import SearchBar from './SearchBar';

interface NavTab {
  readonly label: string;
  readonly href: string;
}

const NAV_TABS: readonly NavTab[] = [
  { label: 'DASHBOARD', href: '/' },
  { label: 'SEATED_OFFICIALS', href: '/officials' },
  { label: 'CANDIDATES', href: '/candidates' },
  { label: 'HIERARCHY', href: '/hierarchy' },
  { label: 'SOCIAL_INTEL', href: '/social' },
  { label: 'JUICE_BOX', href: '/juicebox' },
  { label: 'CONNECTIONS', href: '/browse' },
] as const;

function isActiveTab(pathname: string, href: string): boolean {
  if (href === '/') {
    return pathname === '/';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function UtcClock() {
  const [time, setTime] = useState('');

  useEffect(() => {
    function formatUtc(): string {
      const now = new Date();
      const y = now.getUTCFullYear();
      const mo = String(now.getUTCMonth() + 1).padStart(2, '0');
      const d = String(now.getUTCDate()).padStart(2, '0');
      const h = String(now.getUTCHours()).padStart(2, '0');
      const mi = String(now.getUTCMinutes()).padStart(2, '0');
      const s = String(now.getUTCSeconds()).padStart(2, '0');
      return `${y}-${mo}-${d} ${h}:${mi}:${s} UTC`;
    }

    setTime(formatUtc());
    const interval = setInterval(() => {
      setTime(formatUtc());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <span className="font-label text-xs text-primary-container tracking-[0.2em] crt-glow">
      {time}
    </span>
  );
}

export default function TerminalHeader() {
  const pathname = usePathname();

  return (
    <header className="fixed top-0 w-full z-50 bg-slate-950 border-b border-emerald-900/50 flex flex-col">
      {/* Layer 1: Utility Bar */}
      <div className="flex justify-between items-center px-4 py-2 bg-surface-container-lowest border-b border-outline-variant/30 h-10">
        {/* Left: State selector + Node info */}
        <div className="flex items-center gap-4">
          <div className="group relative">
            <button className="flex items-center gap-2 text-primary-container font-label text-xs tracking-widest hover:text-white transition-none">
              <span className="material-symbols-outlined text-sm">menu</span>
              SELECT STATE
            </button>
            <div className="absolute top-full left-0 mt-1 w-48 bg-slate-950 border border-emerald-900/50 shadow-[0_0_20px_rgba(0,255,136,0.1)] hidden group-hover:block z-[60]">
              <div className="p-2 border-b border-emerald-900/30 bg-emerald-900/10">
                <span className="font-label text-[10px] text-emerald-500 uppercase tracking-widest">
                  SYSTEM_SELECT_NODE
                </span>
              </div>
              <ul className="py-1 font-label text-xs text-primary-container">
                <li className="px-4 py-2 hover:bg-emerald-400 hover:text-slate-950 cursor-pointer flex items-center justify-between group/item">
                  <span>FLORIDA</span>
                  <span className="text-[10px] opacity-0 group-hover/item:opacity-100">[LOAD]</span>
                </li>
                <li className="px-4 py-2 hover:bg-emerald-900/20 cursor-pointer flex items-center justify-between group/item">
                  <span>CALIFORNIA</span>
                  <span className="text-[10px] opacity-0 group-hover/item:opacity-100 text-emerald-700">[OFFLINE]</span>
                </li>
                <li className="px-4 py-2 hover:bg-emerald-900/20 cursor-pointer flex items-center justify-between group/item">
                  <span>NEW YORK</span>
                  <span className="text-[10px] opacity-0 group-hover/item:opacity-100 text-emerald-700">[OFFLINE]</span>
                </li>
                <li className="px-4 py-2 hover:bg-emerald-900/20 cursor-pointer flex items-center justify-between group/item">
                  <span>TEXAS</span>
                  <span className="text-[10px] opacity-0 group-hover/item:opacity-100 text-emerald-700">[OFFLINE]</span>
                </li>
                <li className="px-4 py-2 hover:bg-emerald-900/20 cursor-pointer flex items-center justify-between group/item">
                  <span>ILLINOIS</span>
                  <span className="text-[10px] opacity-0 group-hover/item:opacity-100 text-emerald-700">[OFFLINE]</span>
                </li>
              </ul>
              <div className="p-1 bg-emerald-900/5 text-center">
                <span className="text-[8px] text-emerald-900 animate-pulse">SCANNING_ALL_NODES...</span>
              </div>
            </div>
          </div>
          <div className="h-4 w-px bg-outline-variant/30" />
          <div className="text-[10px] font-label text-outline uppercase tracking-tighter hidden sm:block">
            NODE: DC_ENCLAVE_01
          </div>
        </div>

        {/* Center: UTC clock */}
        <UtcClock />

        {/* Right: Search + icons */}
        <div className="flex items-center gap-4">
          <div className="relative flex items-center bg-surface-container px-2 border-b border-primary-container/50 hidden md:flex">
            <span className="font-label text-primary-container text-xs mr-2">&gt;_</span>
            <SearchBar />
          </div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-outline text-lg hover:text-primary-container cursor-pointer transition-none">
              settings
            </span>
            <span className="material-symbols-outlined text-outline text-lg hover:text-primary-container cursor-pointer transition-none">
              terminal
            </span>
          </div>
        </div>
      </div>

      {/* Layer 2: Navigation Tabs */}
      <nav className="flex w-full overflow-x-auto no-scrollbar bg-slate-950">
        <div className="flex divide-x divide-emerald-900/30 w-full">
          {NAV_TABS.map((tab) => {
            const active = isActiveTab(pathname, tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={
                  active
                    ? 'px-6 py-3 bg-emerald-400 text-slate-950 font-label font-bold text-xs tracking-widest shadow-[0_0_15px_rgba(0,255,136,0.5)] whitespace-nowrap'
                    : 'px-6 py-3 text-emerald-900 font-label text-xs tracking-widest hover:bg-emerald-900/20 hover:text-emerald-300 transition-none whitespace-nowrap'
                }
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}

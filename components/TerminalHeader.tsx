'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SearchBar from './SearchBar';

interface NavItem {
  readonly label: string;
  readonly href: string;
  readonly icon: string;
}

const TOP_NAV_ITEMS: readonly NavItem[] = [
  { label: 'NETWORK', href: '/', icon: 'hub' },
  { label: 'DOSSIERS', href: '/browse', icon: 'folder_shared' },
  { label: 'LEAKS', href: '/social', icon: 'leak_add' },
  { label: 'WATCHLIST', href: '/watchlist', icon: 'visibility' },
] as const;

const SIDEBAR_NAV_ITEMS: readonly NavItem[] = [
  { label: 'THREAT_FEED', href: '/', icon: 'radar' },
  { label: 'ENTITIES', href: '/browse', icon: 'groups' },
  { label: 'MONEY_TRAIL', href: '/juicebox', icon: 'payments' },
  { label: 'POLITICAL_RISK', href: '/hierarchy', icon: 'warning' },
  { label: 'SYSTEM_LOGS', href: '/social', icon: 'terminal' },
] as const;

export default function TerminalHeader() {
  const pathname = usePathname();

  const isActive = (href: string): boolean => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Top Nav Bar — Fixed, h-14, backdrop-blur */}
      <header className="fixed top-0 w-full z-50 flex justify-between items-center px-6 h-14 bg-[#080A0D]/90 backdrop-blur-md border-b border-[#00FF88]/20 shadow-[0_0_15px_rgba(0,255,136,0.1)]">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="font-headline font-bold text-[#00FF88] tracking-tighter text-lg"
          >
            SNITCHED.AI v2.0
          </Link>
          <nav className="hidden md:flex gap-6">
            {TOP_NAV_ITEMS.map((item) => (
              <Link
                key={item.href + item.label}
                href={item.href}
                className={
                  isActive(item.href)
                    ? "font-mono uppercase tracking-widest text-[0.75rem] text-[#00FF88] border-b-2 border-[#00FF88] pb-1"
                    : "font-mono uppercase tracking-widest text-[0.75rem] text-[#C8D8E8]/60 hover:text-[#00FF88]"
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <SearchBar />
          <span className="material-symbols-outlined text-[#00FF88] cursor-pointer hover:bg-[#00FF88]/10 p-1 hidden md:inline-flex">
            sensors
          </span>
          <span className="material-symbols-outlined text-[#00FF88] cursor-pointer hover:bg-[#00FF88]/10 p-1 hidden md:inline-flex">
            schedule
          </span>
        </div>
      </header>

      {/* Side Nav Bar — Fixed left, w-64, hidden on mobile */}
      <aside className="fixed left-0 top-14 bottom-0 w-64 hidden lg:flex flex-col bg-surface z-40">
        {/* Operator Identity */}
        <div className="p-6 bg-surface-container-low">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-surface-container-high flex items-center justify-center">
              <span className="material-symbols-outlined text-[#00FF88]">
                encrypted
              </span>
            </div>
            <div>
              <h3 className="font-mono text-[0.7rem] uppercase text-[#00FF88] font-bold">
                OPERATOR_01
              </h3>
              <p className="font-mono text-[0.6rem] uppercase text-[#C8D8E8]/40">
                FL_TRANSIT_SECURED
              </p>
            </div>
          </div>
        </div>

        {/* Sidebar Navigation */}
        <nav className="flex-1 py-4">
          {SIDEBAR_NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href + item.label}
                href={item.href}
                className={
                  active
                    ? "flex items-center gap-3 px-6 py-3 bg-[#00FF88] text-[#080A0D] font-bold font-mono text-[0.7rem] uppercase"
                    : "flex items-center gap-3 px-6 py-3 text-[#C8D8E8]/40 hover:bg-surface-container-low hover:text-[#00FF88] font-mono text-[0.7rem] uppercase"
                }
              >
                <span className="material-symbols-outlined">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Session Info */}
        <div className="p-6 bg-surface-container-low text-[0.6rem] font-mono text-[#00FF88]/40">
          <p>ACTIVE_SESSION: 44.12.01</p>
          <p>UI_REV: A-01-DELTA</p>
        </div>
      </aside>
    </>
  );
}

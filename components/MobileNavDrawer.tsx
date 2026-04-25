'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import DaemonStatusIndicator from './DaemonStatusIndicator';

export interface NavLink {
  href: string;
  label: string;
}

export interface StateOption {
  code: string;
  name: string;
}

interface MobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
  navLinks: NavLink[];
  states: StateOption[];
  activeStateCode?: string;
  onStateChange: (code: string) => void;
}

const SWIPE_DISMISS_THRESHOLD_PX = -40;

/**
 * MobileNavDrawer — left-anchored off-canvas drawer for (base) navigation.
 *
 * Spec (D-06, D-07, D-09):
 * - 80vw width, capped at 320px
 * - Always mounted so transform animation runs in both directions
 * - Dismisses on backdrop tap, Esc key, swipe-left (touchstart→touchend, no
 *   touchmove polling per T-10-08)
 * - 200ms transform transition (no animation longer than 200ms)
 * - Scroll-locks body while open
 * - Footer mounts shared DaemonStatusIndicator (real state, not "UNKNOWN")
 */
export default function MobileNavDrawer({
  open,
  onClose,
  navLinks,
  states,
  activeStateCode,
  onStateChange,
}: MobileNavDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const touchStartXRef = useRef<number | null>(null);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Body scroll lock while open
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Swipe-left dismissal on the panel — touchstart + touchend only (no touchmove)
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      touchStartXRef.current = touch.clientX;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const startX = touchStartXRef.current;
      touchStartXRef.current = null;
      if (startX == null) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const deltaX = touch.clientX - startX;
      if (deltaX < SWIPE_DISMISS_THRESHOLD_PX) onClose();
    };

    panel.addEventListener('touchstart', onTouchStart, { passive: true });
    panel.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      panel.removeEventListener('touchstart', onTouchStart);
      panel.removeEventListener('touchend', onTouchEnd);
    };
  }, [open, onClose]);

  return (
    <div
      className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/70 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Main navigation"
        id="mobile-nav-drawer"
        className={`absolute left-0 top-0 h-full w-[80vw] max-w-[320px] bg-black/95 backdrop-blur border-r border-terminal-border transition-transform duration-200 flex flex-col ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* State selector — 2-col grid */}
        <div className="p-3 grid grid-cols-2 gap-2 max-h-[40vh] overflow-y-auto">
          {states.map((s) => {
            const isActive = activeStateCode === s.code;
            return (
              <button
                key={s.code}
                type="button"
                onClick={() => onStateChange(s.code)}
                className={`min-h-[48px] px-3 text-sm font-mono uppercase tracking-[0.08em] flex items-center justify-between gap-2 ${
                  isActive
                    ? 'bg-terminal-green text-black'
                    : 'text-terminal-text border border-terminal-border'
                }`}
              >
                <span className="truncate">{s.name}</span>
                <span className="text-xs opacity-70">{s.code}</span>
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div className="border-t border-terminal-border my-2" />

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto" aria-label="Primary">
          <ul className="flex flex-col">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={onClose}
                  className="block min-h-[48px] px-4 py-3 text-base font-mono uppercase tracking-[0.08em] text-terminal-text hover:bg-terminal-green/10"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Footer with real-state daemon indicator (D-07) */}
        <div className="mt-auto border-t border-terminal-border p-3">
          <DaemonStatusIndicator variant="compact" />
        </div>
      </div>
    </div>
  );
}

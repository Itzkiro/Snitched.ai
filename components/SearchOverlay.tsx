'use client';

// Result-row visual helpers (badge color, party label, score color) live in
// lib/search-helpers.ts so SearchBar (sm:+) and SearchOverlay (base) stay in
// sync. JSX is duplicated between the two components because their layouts
// differ (compact dropdown row vs. tall 2-line overlay row), but the color +
// label decisions come from the same pure helpers.

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import type { Politician } from '@/lib/types';
import {
  getPartyColor,
  getPartyLabel,
  getLevelColor,
  getLevelLabel,
  getCorruptionScoreColor,
} from '@/lib/search-helpers';

interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
}

/**
 * SearchOverlay — full-screen (base) search experience per UI-SPEC §8 and
 * D-16/D-17.
 *
 * - fixed inset-0 z-50 panel; covers viewport so dropdown clipping is
 *   structurally impossible (D-16 fix).
 * - Top bar: [← back][input autoFocus][× clear].
 * - Result rows ≥ 56 px, 2-line layout (level badge + name; office + party
 *   + score).
 * - History entry pushed on open and consumed on browser back so the
 *   physical Back button closes the overlay (D-17, T-10-09).
 * - Body scroll-lock while open.
 */
export default function SearchOverlay({ open, onClose }: SearchOverlayProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Politician[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Push a history entry when overlay opens; consume it via popstate so the
  // physical browser Back button closes the overlay instead of navigating away.
  useEffect(() => {
    if (!open) return;
    if (typeof window === 'undefined') return;

    window.history.pushState({ searchOverlayOpen: true }, '');

    const handlePopState = (event: PopStateEvent) => {
      // Verify state shape before acting (T-10-09).
      if (event.state?.searchOverlayOpen !== true) {
        onClose();
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [open, onClose]);

  // Scroll-lock body while open
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // autoFocus the input when the overlay opens
  useEffect(() => {
    if (open) {
      // Defer one tick so the element is mounted and visible.
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  // Reset query/results when closed so reopening starts clean
  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
    }
  }, [open]);

  // Debounced fetch — mirrors SearchBar's API surface
  useEffect(() => {
    if (!open) return;
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      fetch(`/api/politicians/search?q=${encodeURIComponent(query)}&limit=20`)
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setResults(data);
          }
        })
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Search politicians"
    >
      {/* Top bar */}
      <div className="flex items-center gap-2 p-3 border-b border-terminal-border">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close search"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-terminal-green text-xl"
          style={{
            background: 'none',
            border: '1px solid var(--terminal-border)',
            cursor: 'pointer',
            fontFamily: 'var(--font-terminal)',
          }}
        >
          ←
        </button>
        <input
          ref={inputRef}
          type="text"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="SEARCH POLITICIANS..."
          className="flex-1 bg-transparent font-mono text-base text-terminal-text placeholder-terminal-text-dim focus:outline-none min-h-[44px]"
          style={{
            border: 'none',
            letterSpacing: '0.05em',
            padding: '0 0.5rem',
          }}
        />
        <button
          type="button"
          onClick={() => {
            setQuery('');
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
          disabled={query.length === 0}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-terminal-text-dim text-xl disabled:opacity-30"
          style={{
            background: 'none',
            border: '1px solid var(--terminal-border)',
            cursor: query.length === 0 ? 'default' : 'pointer',
            fontFamily: 'var(--font-terminal)',
          }}
        >
          ×
        </button>
      </div>

      {/* Results list */}
      <div className="flex-1 overflow-y-auto">
        {query.length < 2 && (
          <div
            className="p-6 text-center font-mono text-sm"
            style={{ color: 'var(--terminal-text-dim)' }}
          >
            TYPE 2+ CHARACTERS TO SEARCH...
          </div>
        )}
        {query.length >= 2 && results.length === 0 && (
          <div
            className="p-6 text-center font-mono text-sm"
            style={{ color: 'var(--terminal-text-dim)' }}
          >
            NO RECORDS MATCH &quot;{query}&quot;
          </div>
        )}
        {results.map((p) => (
          <Link
            key={p.id}
            href={`/politician/${p.id}`}
            onClick={onClose}
            className="min-h-[56px] px-3 py-2 border-b border-terminal-border/50 flex flex-col gap-1"
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            {/* Row 1: level badge + name */}
            <div className="flex items-center gap-2">
              <span
                className="px-1.5 py-0.5 text-xs font-mono uppercase"
                style={{
                  color: getLevelColor(p.officeLevel),
                  border: `1px solid ${getLevelColor(p.officeLevel)}`,
                  background: 'rgba(0, 255, 65, 0.05)',
                  letterSpacing: '0.05em',
                }}
              >
                {getLevelLabel(p.officeLevel)}
              </span>
              <span
                className="font-mono text-sm uppercase truncate"
                style={{
                  color: 'var(--terminal-text)',
                  letterSpacing: '0.03em',
                  fontWeight: 600,
                }}
              >
                {p.name}
              </span>
            </div>
            {/* Row 2: office + party + score */}
            <div
              className="text-xs font-mono flex gap-2 items-center"
              style={{ color: 'var(--terminal-text-dim)' }}
            >
              <span className="truncate">
                {p.office}
                {p.district ? ` // ${p.district}` : ''}
              </span>
              <span
                style={{
                  background: getPartyColor(p.party),
                  color: '#fff',
                  padding: '0.05rem 0.35rem',
                  borderRadius: '2px',
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {getPartyLabel(p.party)}
              </span>
              <span
                style={{
                  color: getCorruptionScoreColor(p.corruptionScore),
                  fontWeight: 700,
                  marginLeft: 'auto',
                }}
              >
                {p.corruptionScore}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import type { Politician } from '@/lib/types';

/**
 * Simple fuzzy match: checks if all characters of the query appear
 * in order within the target string (case-insensitive).
 * Returns a score (lower = better match). -1 means no match.
 */
function fuzzyMatch(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  // Exact substring match gets best score
  const substringIdx = t.indexOf(q);
  if (substringIdx !== -1) {
    // Prefer matches at word boundaries
    if (substringIdx === 0 || t[substringIdx - 1] === ' ') {
      return 0;
    }
    return 1;
  }

  // Fuzzy: all query chars appear in order
  let qi = 0;
  let gaps = 0;
  let lastMatchIdx = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (lastMatchIdx !== -1 && ti - lastMatchIdx > 1) {
        gaps += ti - lastMatchIdx - 1;
      }
      lastMatchIdx = ti;
      qi++;
    }
  }

  if (qi === q.length) {
    return 2 + gaps;
  }

  return -1; // no match
}

/**
 * Score a politician against a search query.
 * Searches across name, office, party, district, jurisdiction, and officeLevel.
 * Returns the best (lowest) score, or -1 if no match.
 */
function scorePolitician(politician: Politician, query: string): number {
  const fields = [
    politician.name,
    politician.office,
    politician.party,
    politician.district,
    politician.jurisdiction,
    politician.officeLevel,
  ].filter(Boolean) as string[];

  let bestScore = -1;
  for (const field of fields) {
    const score = fuzzyMatch(query, field);
    if (score !== -1 && (bestScore === -1 || score < bestScore)) {
      bestScore = score;
    }
  }

  return bestScore;
}

function getPartyColor(party: string): string {
  switch (party) {
    case 'Republican': return '#dc2626';
    case 'Democrat': return '#2563eb';
    default: return '#6b7280';
  }
}

function getPartyLabel(party: string): string {
  switch (party) {
    case 'Republican': return 'R';
    case 'Democrat': return 'D';
    case 'Independent': return 'I';
    default: return party.charAt(0);
  }
}

function getLevelLabel(officeLevel: string): string {
  if (officeLevel.startsWith('US ')) return 'FED';
  if (officeLevel.startsWith('State ') || officeLevel === 'Governor') return 'STATE';
  return 'LOCAL';
}

function getLevelColor(officeLevel: string): string {
  if (officeLevel.startsWith('US ')) return 'var(--terminal-red)';
  if (officeLevel.startsWith('State ') || officeLevel === 'Governor') return 'var(--terminal-amber)';
  return 'var(--terminal-blue)';
}

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<Politician & { _score: number }>>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced search via API when query changes
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(() => {
      fetch(`/api/politicians/search?q=${encodeURIComponent(query)}&limit=8`)
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data)) {
            setResults(data.map((p: any) => ({ ...p, _score: 0 })));
            setIsOpen(true);
            setSelectedIndex(-1);
          }
        })
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) {
      if (e.key === 'Escape') {
        setQuery('');
        setIsOpen(false);
        inputRef.current?.blur();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % results.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + results.length) % results.length);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < results.length) {
          const selected = results[selectedIndex];
          window.location.href = `/politician/${selected.id}`;
          setQuery('');
          setIsOpen(false);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setQuery('');
        inputRef.current?.blur();
        break;
    }
  }, [isOpen, results, selectedIndex]);

  // Clear search on navigation
  const handleResultClick = () => {
    setQuery('');
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: '1', maxWidth: '420px' }}>
      {/* Search Input */}
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.length >= 2 && results.length > 0 && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="SEARCH: NAME, PARTY, DISTRICT..."
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem 0.5rem 2rem',
            background: 'var(--terminal-bg)',
            border: '1px solid var(--terminal-border)',
            color: 'var(--terminal-text)',
            fontSize: '11px',
            fontFamily: 'var(--font-terminal)',
            letterSpacing: '0.05em',
            outline: 'none',
            transition: 'border-color 0.2s',
          }}
          onMouseEnter={(e) => { (e.target as HTMLInputElement).style.borderColor = 'var(--terminal-blue)'; }}
          onMouseLeave={(e) => {
            if (document.activeElement !== e.target) {
              (e.target as HTMLInputElement).style.borderColor = 'var(--terminal-border)';
            }
          }}
          onBlurCapture={(e) => { (e.target as HTMLInputElement).style.borderColor = 'var(--terminal-border)'; }}
          onFocusCapture={(e) => { (e.target as HTMLInputElement).style.borderColor = 'var(--terminal-blue)'; }}
        />
        {/* Search icon */}
        <span
          style={{
            position: 'absolute',
            left: '0.6rem',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '11px',
            color: 'var(--terminal-text-dim)',
            pointerEvents: 'none',
          }}
        >
          &gt;_
        </span>
        {/* Clear button */}
        {query.length > 0 && (
          <button
            onClick={() => { setQuery(''); setIsOpen(false); inputRef.current?.focus(); }}
            style={{
              position: 'absolute',
              right: '0.5rem',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              color: 'var(--terminal-text-dim)',
              cursor: 'pointer',
              fontSize: '11px',
              fontFamily: 'var(--font-terminal)',
              padding: '0 0.25rem',
            }}
          >
            [X]
          </button>
        )}
      </div>

      {/* Dropdown Results */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: 'var(--terminal-surface)',
            border: `1px solid ${results.length > 0 ? 'var(--terminal-blue)' : 'var(--terminal-border)'}`,
            boxShadow: '0 8px 32px rgba(0, 191, 255, 0.15), 0 0 1px rgba(0, 191, 255, 0.3)',
            zIndex: 1000,
            maxHeight: '400px',
            overflowY: 'auto',
          }}
        >
          {/* Results header */}
          <div
            style={{
              padding: '0.5rem 0.75rem',
              borderBottom: '1px solid var(--terminal-border)',
              fontSize: '10px',
              color: 'var(--terminal-text-dim)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>SEARCH RESULTS</span>
            <span>{results.length} FOUND</span>
          </div>

          {/* Result items */}
          {results.map((politician, index) => (
            <Link
              key={politician.id}
              href={`/politician/${politician.id}`}
              onClick={handleResultClick}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.6rem 0.75rem',
                borderBottom: '1px solid rgba(42, 63, 95, 0.5)',
                textDecoration: 'none',
                color: 'inherit',
                background: index === selectedIndex ? 'rgba(0, 191, 255, 0.1)' : 'transparent',
                borderLeft: index === selectedIndex ? '2px solid var(--terminal-blue)' : '2px solid transparent',
                transition: 'background 0.1s',
                cursor: 'pointer',
              }}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              {/* Level indicator */}
              <div
                style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  color: getLevelColor(politician.officeLevel),
                  border: `1px solid ${getLevelColor(politician.officeLevel)}`,
                  padding: '0.15rem 0.3rem',
                  letterSpacing: '0.05em',
                  flexShrink: 0,
                  minWidth: '36px',
                  textAlign: 'center',
                }}
              >
                {getLevelLabel(politician.officeLevel)}
              </div>

              {/* Name & office */}
              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--terminal-text)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.03em',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {politician.name}
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    color: 'var(--terminal-text-dim)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {politician.office}
                  {politician.district ? ` // ${politician.district}` : ''}
                </div>
              </div>

              {/* Party badge */}
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#fff',
                  background: getPartyColor(politician.party),
                  padding: '0.15rem 0.4rem',
                  borderRadius: '2px',
                  flexShrink: 0,
                }}
              >
                {getPartyLabel(politician.party)}
              </span>

              {/* Corruption score */}
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: politician.corruptionScore >= 60 ? 'var(--terminal-red)' :
                         politician.corruptionScore >= 40 ? 'var(--terminal-amber)' : 'var(--terminal-green)',
                  flexShrink: 0,
                  minWidth: '24px',
                  textAlign: 'right',
                }}
              >
                {politician.corruptionScore}
              </span>
            </Link>
          ))}

          {/* Footer hint */}
          {results.length > 0 && (
            <div
              style={{
                padding: '0.4rem 0.75rem',
                borderTop: '1px solid var(--terminal-border)',
                fontSize: '9px',
                color: 'var(--terminal-text-dimmer)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>[ESC] CLOSE</span>
              <span>[ENTER] SELECT</span>
            </div>
          )}

          {/* No results message */}
          {results.length === 0 && (
            <div
              style={{
                padding: '1rem 0.75rem',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '10px', color: 'var(--terminal-text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                NO RECORDS MATCH &quot;{query}&quot;
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

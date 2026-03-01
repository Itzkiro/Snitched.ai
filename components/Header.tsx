'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getAllPoliticians } from '@/lib/real-data';
import type { Politician } from '@/lib/types';

export default function Header() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Politician[]>([]);
  const [showResults, setShowResults] = useState(false);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.length > 1) {
      const results = getAllPoliticians().filter(p =>
        (p.name && p.name.toLowerCase().includes(query.toLowerCase())) ||
        (p.office && p.office.toLowerCase().includes(query.toLowerCase())) ||
        (p.district && p.district.toLowerCase().includes(query.toLowerCase()))
      ).slice(0, 5);
      setSearchResults(results);
      setShowResults(true);
    } else {
      setShowResults(false);
    }
  };

  return (
    <header 
      style={{
        background: 'var(--bg-secondary)',
        borderBottom: '2px solid var(--border-red)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      <div className="warning-stripe" />
      <div 
        style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '1rem 2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '2rem',
        }}
      >
        {/* Logo */}
        <Link 
          href="/"
          style={{
            display: 'flex',
            flexDirection: 'column',
            textDecoration: 'none',
            color: 'var(--text-primary)',
          }}
        >
          <div 
            style={{
              fontSize: '2rem',
              fontWeight: 400,
              color: 'white',
              letterSpacing: '0.05em',
            }}
          >
            SNITCHED.AI
          </div>
          <div 
            style={{
              fontSize: '0.625rem',
              color: 'var(--red-blood)',
              textTransform: 'uppercase',
              letterSpacing: '0.2em',
              marginTop: '-0.25rem',
            }}
          >
            [ OSINT // PUBLIC RECORDS ]
          </div>
        </Link>

        {/* Search */}
        <div style={{ flex: 1, maxWidth: '600px', position: 'relative' }}>
          <input
            type="search"
            placeholder="SEARCH TARGETS..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onBlur={() => setTimeout(() => setShowResults(false), 200)}
            onFocus={() => searchQuery.length > 1 && setShowResults(true)}
            style={{
              width: '100%',
              padding: '0.875rem 1rem 0.875rem 3rem',
              background: 'var(--bg-tertiary)',
              border: '2px solid var(--border-color)',
            }}
          />
          <div 
            style={{
              position: 'absolute',
              left: '1rem',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '1.25rem',
              color: 'var(--red-blood)',
            }}
          >
            🔍
          </div>

          {/* Search Results Dropdown */}
          {showResults && searchResults.length > 0 && (
            <div 
              style={{
                position: 'absolute',
                top: '110%',
                left: 0,
                right: 0,
                background: 'var(--bg-secondary)',
                border: '2px solid var(--border-red)',
                maxHeight: '400px',
                overflowY: 'auto',
                boxShadow: '0 10px 40px rgba(220, 20, 60, 0.3)',
              }}
            >
              {searchResults.map(politician => (
                <Link
                  key={politician.id}
                  href={`/politician/${politician.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    padding: '1rem',
                    borderBottom: '1px solid var(--border-color)',
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-tertiary)';
                    e.currentTarget.style.borderLeft = '2px solid var(--red-blood)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.borderLeft = 'none';
                  }}
                >
                  <div 
                    style={{
                      width: '48px',
                      height: '48px',
                      border: '2px solid var(--red-blood)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.5rem',
                      fontWeight: 700,
                      color: 'var(--red-blood)',
                      fontFamily: 'Bebas Neue, sans-serif',
                    }}
                  >
                    {politician.name.charAt(0)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.875rem' }}>
                      {politician.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      {politician.office} • {politician.party}
                    </div>
                  </div>
                  {politician.juiceBoxTier !== 'none' && (
                    <div 
                      className={`tag tag-${politician.juiceBoxTier.replace('_', '-')}`}
                      style={{ fontSize: '0.625rem' }}
                    >
                      COMPROMISED
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Nav Links */}
        <nav style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
          <Link 
            href="/hierarchy"
            style={{
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: '0.875rem',
              transition: 'color 0.2s ease',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            📊 HIERARCHY
          </Link>
          <Link 
            href="/juicebox"
            style={{
              color: 'var(--red-blood)',
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: '0.875rem',
              transition: 'color 0.2s ease',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            💰 JUICE BOX LEADERBOARD
          </Link>
          <Link 
            href="/browse"
            style={{
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: '0.875rem',
              transition: 'color 0.2s ease',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            🔍 DATABASE
          </Link>
          <Link 
            href="/tasks"
            style={{
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: '0.875rem',
              transition: 'color 0.2s ease',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            📋 TASKS
          </Link>
        </nav>
      </div>
    </header>
  );
}

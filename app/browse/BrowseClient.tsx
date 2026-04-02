'use client';

import React, { useState } from 'react';
import PoliticianCard from '@/components/PoliticianCard';
import type { Politician } from '@/lib/types';

interface BrowseClientProps {
  politicians: Politician[];
}

export default function BrowseClient({ politicians }: BrowseClientProps) {
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [filterParty, setFilterParty] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPoliticians = politicians.filter(p => {
    if (!p || !p.isActive) return false;
    if (filterLevel !== 'all' && p.officeLevel !== filterLevel) return false;
    if (filterParty !== 'all' && p.party !== filterParty) return false;
    if (searchQuery && p.name && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const officeLevels = [
    { value: 'all', label: 'All Offices' },
    { value: 'US Senator', label: 'US Senate' },
    { value: 'US Representative', label: 'US House' },
    { value: 'Governor', label: 'Governor' },
    { value: 'State Senator', label: 'State Senate' },
    { value: 'State Representative', label: 'State House' },
  ];

  const parties = [
    { value: 'all', label: 'All Parties' },
    { value: 'Republican', label: 'Republican' },
    { value: 'Democrat', label: 'Democrat' },
    { value: 'Independent', label: 'Independent' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--terminal-bg)', color: 'var(--terminal-text)' }}>
      {/* Terminal Title */}
      <div className="terminal-title">
        <div>
          <h1>🔍 DATABASE - ALL POLITICIANS</h1>
          <div className="terminal-subtitle">
            Search & Filter | {filteredPoliticians.length} Records Found
          </div>
        </div>
      </div>

      {/* Alert */}
      <div style={{ padding: '2rem', borderBottom: '1px solid var(--terminal-border)' }}>
        <div className="alert-level">
          <span className="alert-icon">📊</span>
          <span>DATABASE STATUS: ONLINE</span>
          <span style={{ fontSize: '0.875rem', color: 'var(--terminal-text-dim)', marginLeft: '1rem' }}>
            {filteredPoliticians.length} / {politicians.filter(p => p.isActive).length} RECORDS
          </span>
        </div>
      </div>

      <div style={{ padding: '2rem' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          {/* Filters */}
          <div className="terminal-card" style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
              {/* Search */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--terminal-amber)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  🔍 SEARCH NAME
                </label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Enter politician name..."
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'var(--terminal-bg)',
                    border: '2px solid var(--terminal-border)',
                    color: 'var(--terminal-text)',
                    fontSize: '0.875rem',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                />
              </div>

              {/* Office Level */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--terminal-amber)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  📋 OFFICE LEVEL
                </label>
                <select
                  value={filterLevel}
                  onChange={(e) => setFilterLevel(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'var(--terminal-bg)',
                    border: '2px solid var(--terminal-border)',
                    color: 'var(--terminal-text)',
                    fontSize: '0.875rem',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                >
                  {officeLevels.map(level => (
                    <option key={level.value} value={level.value}>{level.label}</option>
                  ))}
                </select>
              </div>

              {/* Party */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--terminal-amber)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  🎯 PARTY AFFILIATION
                </label>
                <select
                  value={filterParty}
                  onChange={(e) => setFilterParty(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'var(--terminal-bg)',
                    border: '2px solid var(--terminal-border)',
                    color: 'var(--terminal-text)',
                    fontSize: '0.875rem',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                >
                  {parties.map(party => (
                    <option key={party.value} value={party.value}>{party.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Active filters display */}
            {(filterLevel !== 'all' || filterParty !== 'all' || searchQuery) && (
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--terminal-border)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginBottom: '0.5rem' }}>
                  ACTIVE FILTERS:
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {filterLevel !== 'all' && (
                    <span className="filter-tag">
                      Office: {officeLevels.find(l => l.value === filterLevel)?.label}
                      <button onClick={() => setFilterLevel('all')} style={{ marginLeft: '0.5rem', background: 'none', border: 'none', color: 'var(--terminal-red)', cursor: 'pointer' }}>✕</button>
                    </span>
                  )}
                  {filterParty !== 'all' && (
                    <span className="filter-tag">
                      Party: {parties.find(p => p.value === filterParty)?.label}
                      <button onClick={() => setFilterParty('all')} style={{ marginLeft: '0.5rem', background: 'none', border: 'none', color: 'var(--terminal-red)', cursor: 'pointer' }}>✕</button>
                    </span>
                  )}
                  {searchQuery && (
                    <span className="filter-tag">
                      Search: &quot;{searchQuery}&quot;
                      <button onClick={() => setSearchQuery('')} style={{ marginLeft: '0.5rem', background: 'none', border: 'none', color: 'var(--terminal-red)', cursor: 'pointer' }}>✕</button>
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Results Grid */}
          {filteredPoliticians.length === 0 ? (
            <div className="terminal-card" style={{ textAlign: 'center', padding: '3rem' }}>
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🔍</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                NO RECORDS FOUND
              </div>
              <div style={{ color: 'var(--terminal-text-dim)' }}>
                Try adjusting your search filters
              </div>
            </div>
          ) : (
            <div className="data-grid">
              {filteredPoliticians
                .filter(p => p && p.id && p.name && p.office && p.party)
                .map(politician => (
                  <PoliticianCard key={politician.id} politician={politician} />
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="classified-footer">
        ALL DATA ACQUIRED VIA OSINT // PUBLIC RECORDS: FEC, SOCIAL MEDIA, NEWS OUTLETS // DATABASE ACCESS DIVISION
      </div>
    </div>
  );
}

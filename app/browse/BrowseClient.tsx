'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Politician } from '@/lib/types';

interface BrowseClientProps {
  politicians: Politician[];
}

type PartyFilter = 'all' | 'Republican' | 'Democrat' | 'Independent';
type LevelFilter = 'all' | 'federal' | 'state' | 'county';
type SortOption = 'name' | 'score' | 'funding' | 'israel';

function getPartyBadgeClasses(party: string): string {
  switch (party) {
    case 'Republican':
      return 'bg-error/10 text-error border border-error/30';
    case 'Democrat':
      return 'bg-blue-900/20 text-blue-400 border border-blue-900/40';
    default:
      return 'bg-slate-800/40 text-slate-400 border border-slate-700/40';
  }
}

function getPartyShort(party: string): string {
  if (party === 'Republican') return 'REP';
  if (party === 'Democrat') return 'DEM';
  return 'IND';
}

function getCorruptionBarColor(score: number): string {
  if (score >= 70) return 'bg-on-tertiary-container';
  if (score >= 40) return 'bg-error';
  return 'bg-primary-container';
}

function getCorruptionTextColor(score: number): string {
  if (score >= 70) return 'text-on-tertiary-container';
  if (score >= 40) return 'text-error';
  return 'text-primary-container';
}

function matchesLevel(p: Politician, level: LevelFilter): boolean {
  if (level === 'all') return true;
  if (level === 'federal') {
    return p.officeLevel === 'US Senator' || p.officeLevel === 'US Representative';
  }
  if (level === 'state') {
    return (
      p.officeLevel === 'State Senator' ||
      p.officeLevel === 'State Representative' ||
      p.officeLevel === 'Governor'
    );
  }
  if (level === 'county') {
    return p.jurisdictionType === 'county' || p.jurisdictionType === 'municipal';
  }
  return true;
}

export default function BrowseClient({ politicians }: BrowseClientProps) {
  const [filterLevel, setFilterLevel] = useState<LevelFilter>('all');
  const [filterParty, setFilterParty] = useState<PartyFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('name');

  const filteredPoliticians = politicians
    .filter((p) => {
      if (!p || !p.isActive) return false;
      if (filterParty !== 'all' && p.party !== filterParty) return false;
      if (!matchesLevel(p, filterLevel)) return false;
      if (
        searchQuery &&
        p.name &&
        !p.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
        return false;
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'score':
          return (b.corruptionScore || 0) - (a.corruptionScore || 0);
        case 'funding':
          return (b.totalFundsRaised || 0) - (a.totalFundsRaised || 0);
        case 'israel':
          return (b.israelLobbyTotal || 0) - (a.israelLobbyTotal || 0);
        default:
          return (a.name || '').localeCompare(b.name || '');
      }
    });

  const activeCount = politicians.filter((p) => p.isActive).length;

  return (
    <>
      <main className="pt-[82px] pb-12 px-6 min-h-screen">
        {/* ====================================================
            SEARCH & FILTERS
            ==================================================== */}
        <section className="bg-surface-container-lowest border border-emerald-900/30 p-6 mb-8 relative ghost-bracket-tl ghost-bracket-br">
          {/* Header with blinking cursor */}
          <h1 className="font-headline text-4xl md:text-5xl font-black tracking-tighter text-primary-container crt-glow mb-6 leading-none">
            &gt; QUERY DATABASE_
            <span className="terminal-cursor" />
          </h1>

          <div className="space-y-6">
            {/* Search Prompt */}
            <div className="flex items-center gap-4 bg-black/40 px-4 py-3 border-b border-primary-container">
              <span className="font-label text-primary-container text-sm">[SEARCH]:</span>
              <input
                className="bg-transparent border-none focus:ring-0 focus:outline-none w-full font-label text-sm text-on-surface placeholder:text-emerald-900"
                placeholder="ENTER ENTITY NAME OR IDENTIFIER..."
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Filters Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {/* Party Affiliation */}
              <div className="space-y-2">
                <label className="font-label text-[10px] text-emerald-700 uppercase tracking-widest">
                  PARTY_AFFILIATION
                </label>
                <div className="flex border border-emerald-900/30">
                  {(['all', 'Republican', 'Democrat', 'Independent'] as const).map(
                    (value) => {
                      const label =
                        value === 'all'
                          ? 'ALL'
                          : value === 'Republican'
                          ? 'R'
                          : value === 'Democrat'
                          ? 'D'
                          : 'I';
                      const isActive = filterParty === value;
                      return (
                        <button
                          key={value}
                          onClick={() => setFilterParty(value)}
                          className={`flex-1 font-label text-xs py-2 ${
                            isActive
                              ? 'bg-primary-container text-on-primary font-bold'
                              : 'text-emerald-900 hover:bg-emerald-900/20'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    }
                  )}
                </div>
              </div>

              {/* Governance Level */}
              <div className="space-y-2">
                <label className="font-label text-[10px] text-emerald-700 uppercase tracking-widest">
                  GOVERNANCE_LEVEL
                </label>
                <div className="flex border border-emerald-900/30">
                  {(['all', 'federal', 'state', 'county'] as const).map((value) => {
                    const label = value.toUpperCase();
                    const isActive = filterLevel === value;
                    return (
                      <button
                        key={value}
                        onClick={() => setFilterLevel(value)}
                        className={`flex-1 font-label text-xs py-2 ${
                          isActive
                            ? 'bg-emerald-900/20 text-primary-container font-bold border-x border-emerald-900/30'
                            : 'text-emerald-900 hover:bg-emerald-900/20'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sort By */}
              <div className="space-y-2">
                <label className="font-label text-[10px] text-emerald-700 uppercase tracking-widest">
                  SORT_ORDER
                </label>
                <div className="flex border border-emerald-900/30">
                  {(
                    [
                      { value: 'name', label: 'NAME' },
                      { value: 'score', label: 'RISK' },
                      { value: 'funding', label: 'FUNDS' },
                    ] as const
                  ).map(({ value, label }) => {
                    const isActive = sortBy === value;
                    return (
                      <button
                        key={value}
                        onClick={() => setSortBy(value)}
                        className={`flex-1 font-label text-xs py-2 ${
                          isActive
                            ? 'bg-emerald-900/20 text-primary-container font-bold'
                            : 'text-emerald-900 hover:bg-emerald-900/20'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Results Count */}
              <div className="space-y-2">
                <label className="font-label text-[10px] text-emerald-700 uppercase tracking-widest">
                  QUERY_RESULTS
                </label>
                <div className="border border-emerald-900/30 py-2 px-3 font-label text-xs text-primary-container">
                  {filteredPoliticians.length} / {activeCount} RECORDS
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ====================================================
            RESULTS GRID
            ==================================================== */}
        {filteredPoliticians.length === 0 ? (
          <div className="bg-black/40 border border-emerald-900/20 border-dashed p-10 flex flex-col items-center justify-center text-center opacity-50">
            <span className="material-symbols-outlined text-4xl text-emerald-900 mb-2">
              search_off
            </span>
            <p className="font-label text-[10px] text-emerald-900 uppercase tracking-widest">
              NO_RECORDS_MATCH_QUERY
            </p>
            <p className="font-label text-[8px] text-emerald-900/50 mt-1">
              ADJUST FILTERS OR SEARCH PARAMETERS
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredPoliticians
              .filter((p) => p && p.id && p.name && p.office && p.party)
              .map((pol) => {
                const partyShort = getPartyShort(pol.party);
                const fundingDisplay =
                  (pol.totalFundsRaised ?? 0) >= 1_000_000
                    ? `$${((pol.totalFundsRaised ?? 0) / 1_000_000).toFixed(1)}M`
                    : (pol.totalFundsRaised ?? 0) >= 1_000
                    ? `$${((pol.totalFundsRaised ?? 0) / 1_000).toFixed(0)}K`
                    : `$${pol.totalFundsRaised ?? 0}`;

                return (
                  <div
                    key={pol.id}
                    className="bg-surface-container border border-emerald-900/30 p-6 relative flex flex-col group hover:border-primary-container/50"
                  >
                    {/* Card Header: Photo + Party Badge */}
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-16 h-16 border border-emerald-900/50 bg-black overflow-hidden flex items-center justify-center">
                        {pol.photoUrl ? (
                          <img
                            alt={pol.name}
                            className="w-full h-full object-cover grayscale brightness-50 contrast-125"
                            src={pol.photoUrl}
                          />
                        ) : (
                          <span className="font-headline text-2xl text-emerald-800 font-bold">
                            {pol.name.charAt(0)}
                          </span>
                        )}
                      </div>
                      <span
                        className={`font-label text-[10px] px-2 py-1 ${getPartyBadgeClasses(
                          pol.party
                        )}`}
                      >
                        {partyShort} - {pol.jurisdiction.toUpperCase()}
                      </span>
                    </div>

                    {/* Name + Title */}
                    <h2 className="font-headline font-bold text-xl text-white mb-1">
                      {pol.name.toUpperCase()}
                    </h2>
                    <p className="font-label text-[10px] text-emerald-500 uppercase tracking-widest mb-4">
                      {pol.officeLevel.toUpperCase().replace(/ /g, '_')} //{' '}
                      {pol.office.toUpperCase()}
                    </p>

                    {/* Fundraising */}
                    {(pol.totalFundsRaised ?? 0) > 0 && (
                      <div className="mb-2 font-label text-[10px] text-emerald-700">
                        FUNDS_RAISED: <span className="text-primary-container font-bold">{fundingDisplay}</span>
                      </div>
                    )}

                    {/* Corruption Index Bar */}
                    <div className="mb-6">
                      <div className="flex justify-between mb-1">
                        <span className="font-label text-[10px] text-outline">
                          CORRUPTION_INDEX
                        </span>
                        <span
                          className={`font-label text-[10px] font-bold ${getCorruptionTextColor(
                            pol.corruptionScore
                          )}`}
                        >
                          {pol.corruptionScore}%
                        </span>
                      </div>
                      <div className="h-1 bg-emerald-950">
                        <div
                          className={`h-full ${getCorruptionBarColor(
                            pol.corruptionScore
                          )} crt-glow`}
                          style={{ width: `${Math.min(pol.corruptionScore, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-2 mb-8 flex-1">
                      {pol.tags &&
                        pol.tags.slice(0, 3).map((tag, idx) => (
                          <span
                            key={idx}
                            className="font-label text-[9px] px-1.5 py-0.5 border border-emerald-900/50 text-emerald-600"
                          >
                            [{tag.label.toUpperCase().replace(/ /g, '-')}]
                          </span>
                        ))}
                      {pol.juiceBoxTier !== 'none' && (
                        <span className="font-label text-[9px] px-1.5 py-0.5 border border-on-tertiary-container/50 text-on-tertiary-container">
                          [JUICE-BOX:{pol.juiceBoxTier.toUpperCase()}]
                        </span>
                      )}
                    </div>

                    {/* View Dossier Button */}
                    <Link
                      href={`/politician/${pol.id}`}
                      className="block text-center font-label text-xs font-bold py-3 bg-emerald-900/10 text-primary-container border border-emerald-900/30 hover:bg-primary-container hover:text-on-primary"
                    >
                      &gt; VIEW DOSSIER &rarr;
                    </Link>
                  </div>
                );
              })}

            {/* Redacted Placeholder Cards */}
            <div className="bg-black/40 border border-emerald-900/20 border-dashed p-10 flex flex-col items-center justify-center text-center opacity-30">
              <span className="material-symbols-outlined text-4xl text-emerald-900 mb-2">
                lock
              </span>
              <p className="font-label text-[10px] text-emerald-900 uppercase tracking-widest">
                DATA_REDACTED_BY_FED_COURT
              </p>
              <p className="font-label text-[8px] text-emerald-900/50 mt-1">ID: [HIDDEN]</p>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full bg-slate-950 border-t border-emerald-900/50 flex justify-between items-center px-6 py-2 mt-6">
        <div className="font-label text-[10px] tracking-widest text-emerald-900 uppercase">
          SYSTEM_STATUS:{' '}
          <span className="text-emerald-500">OPERATIONAL</span> | LATENCY:{' '}
          <span className="text-emerald-500">12MS</span> | NODE_SYNC:{' '}
          <span className="text-emerald-500">100%</span>
        </div>
        <div className="flex gap-6">
          <Link
            href="/"
            className="font-label text-[10px] tracking-widest text-emerald-900 hover:text-emerald-200 uppercase transition-none"
          >
            DASHBOARD
          </Link>
          <Link
            href="/juicebox"
            className="font-label text-[10px] tracking-widest text-emerald-900 hover:text-emerald-200 uppercase transition-none"
          >
            JUICE_BOX
          </Link>
          <Link
            href="/hierarchy"
            className="font-label text-[10px] tracking-widest text-emerald-900 hover:text-emerald-200 uppercase transition-none underline"
          >
            HIERARCHY
          </Link>
        </div>
      </footer>
    </>
  );
}

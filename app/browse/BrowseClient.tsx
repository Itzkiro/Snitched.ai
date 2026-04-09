'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { Politician } from '@/lib/types';

interface BrowseClientProps {
  politicians: Politician[];
}

type GradeFilter = 'all' | 'A-C' | 'D' | 'F';
type LevelGroup = 'all' | 'federal' | 'state' | 'county';
type SortOption = 'name' | 'score' | 'funding' | 'israel';

const FEDERAL_LEVELS = ['US Senator', 'US Representative'];
const STATE_LEVELS = ['Governor', 'State Senator', 'State Representative'];
const COUNTY_LEVELS = [
  'County Commissioner', 'Sheriff', 'Clerk of Court', 'Property Appraiser',
  'Tax Collector', 'Supervisor of Elections', 'Mayor', 'City Council',
  'School Board', 'Judge', 'City Commissioner', 'State Attorney',
  'Public Defender', 'Soil & Water', 'Superintendent',
];

function getCorruptionGrade(score: number): string {
  if (score <= 20) return 'A';
  if (score <= 40) return 'B';
  if (score <= 60) return 'C';
  if (score <= 80) return 'D';
  return 'F';
}

function getCorruptionColor(score: number): string {
  if (score < 30) return '#00FF88';
  if (score < 60) return '#FFD166';
  return '#FF3B5C';
}

function getPartyTag(party: string, jurisdiction: string): { label: string; bg: string; text: string; border: string } {
  const state = jurisdiction?.split(',')[0]?.trim() || 'FL';
  switch (party) {
    case 'Republican':
      return { label: `REP - ${state}`, bg: 'bg-[#FF3B5C]/10', text: 'text-[#FF3B5C]', border: 'border-[#FF3B5C]/40' };
    case 'Democrat':
      return { label: `DEM - ${state}`, bg: 'bg-[#4DA6FF]/10', text: 'text-[#4DA6FF]', border: 'border-[#4DA6FF]/40' };
    case 'Independent':
      return { label: `IND - ${state}`, bg: 'bg-[#e2e2e6]/10', text: 'text-[#e2e2e6]', border: 'border-[#e2e2e6]/40' };
    default:
      return { label: `${party.charAt(0).toUpperCase()} - ${state}`, bg: 'bg-[#e2e2e6]/10', text: 'text-[#e2e2e6]', border: 'border-[#e2e2e6]/40' };
  }
}

function getPartyShort(party: string): string {
  switch (party) {
    case 'Republican': return 'R';
    case 'Democrat': return 'D';
    case 'Independent': return 'I';
    default: return party.charAt(0);
  }
}

function buildTagBadges(politician: Politician): Array<{ label: string; color: string }> {
  const badges: Array<{ label: string; color: string }> = [];

  if (politician.tags && politician.tags.length > 0) {
    for (const tag of politician.tags.slice(0, 3)) {
      badges.push({ label: `[${tag.label}]`, color: tag.color });
    }
    return badges;
  }

  if ((politician.israelLobbyTotal ?? 0) > 10000) {
    badges.push({ label: '[AIPAC-FUNDED]', color: '#FFD166' });
  }
  if ((politician.aipacFunding ?? 0) > 50000) {
    badges.push({ label: '[PAC-HEAVY]', color: '#FFD166' });
  }
  if (politician.corruptionScore >= 70) {
    badges.push({ label: '[HIGH-RISK]', color: '#FF3B5C' });
  }
  if (politician.corruptionScore < 30) {
    badges.push({ label: '[LOW-RISK]', color: '#00FF88' });
  }

  return badges.slice(0, 3);
}

function matchesLevelGroup(officeLevel: string, group: LevelGroup): boolean {
  if (group === 'all') return true;
  if (group === 'federal') return FEDERAL_LEVELS.includes(officeLevel);
  if (group === 'state') return STATE_LEVELS.includes(officeLevel);
  if (group === 'county') return COUNTY_LEVELS.includes(officeLevel);
  return true;
}

function matchesGradeFilter(score: number, filter: GradeFilter): boolean {
  if (filter === 'all') return true;
  const grade = getCorruptionGrade(score);
  if (filter === 'A-C') return ['A', 'B', 'C'].includes(grade);
  if (filter === 'D') return grade === 'D';
  if (filter === 'F') return grade === 'F';
  return true;
}

export default function BrowseClient({ politicians }: BrowseClientProps) {
  const [filterLevel, setFilterLevel] = useState<LevelGroup>('all');
  const [filterParty, setFilterParty] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [filterGrade, setFilterGrade] = useState<GradeFilter>('all');

  const filteredPoliticians = useMemo(() => {
    return politicians.filter(p => {
      if (!p || !p.isActive) return false;
      if (!matchesLevelGroup(p.officeLevel, filterLevel)) return false;
      if (filterParty !== 'all' && p.party !== filterParty) return false;
      if (!matchesGradeFilter(p.corruptionScore, filterGrade)) return false;
      if (searchQuery && p.name && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    }).sort((a, b) => {
      switch (sortBy) {
        case 'score': return (b.corruptionScore || 0) - (a.corruptionScore || 0);
        case 'funding': return (b.totalFundsRaised || 0) - (a.totalFundsRaised || 0);
        case 'israel': return (b.israelLobbyTotal || 0) - (a.israelLobbyTotal || 0);
        default: return (a.name || '').localeCompare(b.name || '');
      }
    });
  }, [politicians, filterLevel, filterParty, filterGrade, searchQuery, sortBy]);

  const partyOptions: Array<{ value: string; label: string }> = [
    { value: 'all', label: 'ALL' },
    { value: 'Republican', label: 'R' },
    { value: 'Democrat', label: 'D' },
    { value: 'Independent', label: 'I' },
  ];

  const levelOptions: Array<{ value: LevelGroup; label: string }> = [
    { value: 'all', label: 'ALL' },
    { value: 'federal', label: 'FEDERAL' },
    { value: 'state', label: 'STATE' },
    { value: 'county', label: 'COUNTY' },
  ];

  const gradeOptions: Array<{ value: GradeFilter; label: string }> = [
    { value: 'all', label: 'ALL' },
    { value: 'A-C', label: 'A-C' },
    { value: 'D', label: 'D' },
    { value: 'F', label: 'F' },
  ];

  const sortOptions: Array<{ value: SortOption; label: string }> = [
    { value: 'name', label: 'NAME' },
    { value: 'score', label: 'RISK' },
    { value: 'funding', label: 'FUNDS' },
    { value: 'israel', label: 'LOBBY' },
  ];

  const activeCount = politicians.filter(p => p.isActive).length;

  return (
    <div className="min-h-screen relative">
      {/* Page Header */}
      <div className="px-8 py-10 border-b border-[#00FF88]/10 bg-surface-container-low/50">
        <h1 className="font-headline text-3xl md:text-5xl font-bold tracking-tighter text-[#C8D8E8] mb-4">
          &gt; QUERY DATABASE_<span className="inline-block w-2 h-[1.2em] bg-[#00FF88] align-middle ml-1 animate-pulse" />
        </h1>
        <p className="font-mono text-xs text-[#00FF88] opacity-60 uppercase tracking-widest">
          REAL-TIME ACCESS PROTOCOL ENABLED // SEC_LEVEL: TOP_SECRET // {filteredPoliticians.length} / {activeCount} RECORDS
        </p>
      </div>

      {/* Terminal Search & Filters - Sticky */}
      <div className="px-8 py-6 sticky top-0 z-30 bg-[#080A0D]/80 backdrop-blur-md border-b border-[#00FF88]/10">
        <div className="flex flex-col gap-6">
          {/* Search Prompt */}
          <div className="flex items-center gap-4 bg-surface-container-low px-4 py-3 border-b border-[#00FF88]">
            <span className="font-mono text-[#00FF88] text-sm shrink-0">[SEARCH]:</span>
            <input
              className="bg-transparent border-none focus:ring-0 focus:outline-none w-full font-mono text-sm text-[#C8D8E8] placeholder:text-[#C8D8E8]/20"
              placeholder="ENTER ENTITY NAME OR IDENTIFIER..."
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Filter Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* Party Filter */}
            <div className="flex flex-col gap-2">
              <label className="font-mono text-[0.65rem] text-[#00FF88] uppercase opacity-60">PARTY_AFFILIATION</label>
              <div className="flex">
                {partyOptions.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setFilterParty(opt.value)}
                    className={`flex-1 font-mono text-[0.7rem] py-2 transition-colors ${
                      filterParty === opt.value
                        ? 'bg-[#00FF88] text-[#080A0D] font-bold'
                        : 'border border-[#00FF88]/20 text-[#C8D8E8]/60 hover:bg-[#00FF88]/10'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Level Filter */}
            <div className="flex flex-col gap-2">
              <label className="font-mono text-[0.65rem] text-[#00FF88] uppercase opacity-60">GOVERNANCE_LEVEL</label>
              <div className="flex">
                {levelOptions.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setFilterLevel(opt.value)}
                    className={`flex-1 font-mono text-[0.7rem] py-2 transition-colors ${
                      filterLevel === opt.value
                        ? 'bg-[#00FF88] text-[#080A0D] font-bold'
                        : 'border border-[#00FF88]/20 text-[#C8D8E8]/60 hover:bg-[#00FF88]/10'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Grade Filter */}
            <div className="flex flex-col gap-2">
              <label className="font-mono text-[0.65rem] text-[#00FF88] uppercase opacity-60">CORRUPTION_GRADE</label>
              <div className="flex">
                {gradeOptions.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setFilterGrade(opt.value)}
                    className={`flex-1 font-mono text-[0.7rem] py-2 transition-colors ${
                      filterGrade === opt.value
                        ? opt.value === 'F'
                          ? 'border border-error/50 text-error bg-error/10 font-bold'
                          : 'bg-[#00FF88] text-[#080A0D] font-bold'
                        : 'border border-[#00FF88]/20 text-[#C8D8E8]/60 hover:bg-[#00FF88]/10'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sort By */}
            <div className="flex flex-col gap-2">
              <label className="font-mono text-[0.65rem] text-[#00FF88] uppercase opacity-60">SORT_PROTOCOL</label>
              <div className="flex">
                {sortOptions.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setSortBy(opt.value)}
                    className={`flex-1 font-mono text-[0.7rem] py-2 transition-colors ${
                      sortBy === opt.value
                        ? 'bg-[#00FF88]/10 text-[#00FF88] font-bold border border-[#00FF88]/20'
                        : 'border border-[#00FF88]/20 text-[#C8D8E8]/60 hover:bg-[#00FF88]/10'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Intelligence Grid */}
      <div className="px-8 py-8">
        {filteredPoliticians.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[350px] bg-surface-container-low border-l-4 border-[#00FF88]/20 border-dashed opacity-60">
            <span className="text-4xl mb-4 text-[#00FF88]/20">&#x1F50D;</span>
            <p className="font-mono text-[0.7rem] text-[#00FF88]/40 mb-2">NO_RECORDS_MATCHING_QUERY</p>
            <p className="font-mono text-[0.5rem] text-[#C8D8E8]/30">
              ADJUST FILTERS OR MODIFY SEARCH PARAMETERS
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredPoliticians
              .filter(p => p && p.id && p.name && p.office && p.party)
              .map(politician => (
                <PoliticianIntelCard key={politician.id} politician={politician} />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PoliticianIntelCard - Obsidian Signal design                      */
/* ------------------------------------------------------------------ */

function PoliticianIntelCard({ politician }: { politician: Politician }) {
  const corruptionPct = Math.min(politician.corruptionScore, 100);
  const corruptionColor = getCorruptionColor(corruptionPct);
  const partyTag = getPartyTag(politician.party, politician.jurisdiction);
  const tagBadges = buildTagBadges(politician);
  const termInfo = politician.termStart
    ? `${politician.termStart.split('-')[0]}-${politician.termEnd ? politician.termEnd.split('-')[0] : 'PRESENT'}`
    : politician.yearsInOffice
      ? `${politician.yearsInOffice} YRS`
      : '';

  return (
    <div className="bg-surface-container-low border-l-4 border-[#00FF88] relative overflow-hidden group">
      <div className="p-6">
        {/* Photo + Party Tag */}
        <div className="flex justify-between items-start mb-4">
          <div className="w-16 h-16 bg-surface-container-high border border-[#00FF88]/10 overflow-hidden flex items-center justify-center">
            {politician.photoUrl ? (
              <Image
                src={politician.photoUrl}
                alt={politician.name}
                width={64}
                height={64}
                className="w-full h-full object-cover grayscale brightness-75 contrast-125"
              />
            ) : (
              <span className="font-headline font-bold text-2xl text-[#00FF88]/60">
                {politician.name.charAt(0)}
              </span>
            )}
          </div>
          <span className={`font-mono text-[0.6rem] px-2 py-1 ${partyTag.bg} ${partyTag.text} border ${partyTag.border}`}>
            {partyTag.label}
          </span>
        </div>

        {/* Name */}
        <h2 className="font-mono font-bold text-lg text-[#C8D8E8] mb-1 uppercase tracking-tight">
          {politician.name}
        </h2>

        {/* Office + Term */}
        <p className="font-mono text-[0.65rem] text-[#00FF88] uppercase tracking-tighter mb-4 opacity-70">
          {politician.office}
          {termInfo ? ` // TERM: ${termInfo}` : ''}
        </p>

        {/* Corruption Meter */}
        <div className="mb-6">
          <div className="flex justify-between mb-1">
            <span className="font-mono text-[0.6rem] text-[#C8D8E8]/60">CORRUPTION_INDEX</span>
            <span className="font-mono text-[0.6rem]" style={{ color: corruptionColor }}>
              {corruptionPct.toFixed(1)}%
            </span>
          </div>
          <div className="h-2 bg-surface-container-high flex">
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${corruptionPct}%`,
                backgroundColor: corruptionColor,
                boxShadow: `0 0 10px ${corruptionColor}66`,
              }}
            />
          </div>
        </div>

        {/* Tag Badges */}
        {tagBadges.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-8">
            {tagBadges.map((badge, idx) => (
              <span
                key={idx}
                className="font-mono text-[0.55rem] px-1.5 py-0.5 border"
                style={{
                  backgroundColor: `${badge.color}1A`,
                  color: badge.color,
                  borderColor: `${badge.color}4D`,
                }}
              >
                {badge.label}
              </span>
            ))}
          </div>
        )}

        {/* Funding Line */}
        {(politician.totalFundsRaised ?? 0) > 0 && (
          <div className="flex justify-between items-center mb-4 font-mono text-[0.6rem]">
            <span className="text-[#C8D8E8]/40">TOTAL_FUNDS</span>
            <span className="text-[#FFD166] font-bold">
              ${(politician.totalFundsRaised ?? 0) >= 1_000_000
                ? `${((politician.totalFundsRaised ?? 0) / 1_000_000).toFixed(1)}M`
                : `${((politician.totalFundsRaised ?? 0) / 1_000).toFixed(0)}K`}
            </span>
          </div>
        )}

        {/* View Dossier Button */}
        <Link
          href={`/politician/${politician.id}`}
          className="block text-center font-mono text-[0.7rem] font-bold py-3 bg-[#00FF88]/10 text-[#00FF88] hover:bg-[#00FF88] hover:text-[#080A0D] transition-all group-hover:shadow-[0_0_20px_rgba(0,255,136,0.2)]"
        >
          &gt; VIEW DOSSIER &rarr;
        </Link>
      </div>
    </div>
  );
}

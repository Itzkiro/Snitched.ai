'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { Politician } from '@/lib/types';

// ---------------------------------------------------------------------------
// Voting Record Types — unified shape for both federal and state votes
// ---------------------------------------------------------------------------
interface VotingRecord {
  id: string;
  billNumber: string;
  billTitle: string;
  billDescription?: string;
  voteDate: string;
  votePosition: 'Yea' | 'Nay' | 'NV' | 'Absent' | 'Yes' | 'No' | 'Not Voting' | string;
  category?: string;
  result?: string;
  chamber?: string;
  passed?: boolean;
  source: 'congress' | 'legiscan' | 'supabase';
  billUrl?: string;
}

interface VoteBreakdown {
  yea: number;
  nay: number;
  abstain: number;
  absent: number;
}

type VoteCategoryFilter = 'all' | 'israel' | 'defense' | 'domestic' | 'foreign' | 'anti-america-first';

export default function PoliticianPage() {
  const params = useParams();
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [politician, setPolitician] = useState<Politician | null>(null);
  const [politicianLoading, setPoliticianLoading] = useState(true);

  // Voting tab state
  const [votingRecords, setVotingRecords] = useState<VotingRecord[]>([]);
  const [votesLoading, setVotesLoading] = useState(false);
  const [votesError, setVotesError] = useState<string | null>(null);
  const [voteCategoryFilter, setVoteCategoryFilter] = useState<VoteCategoryFilter>('all');
  const [voteSearchQuery, setVoteSearchQuery] = useState<string>('');
  const [votesFetched, setVotesFetched] = useState(false);

  // Load politician data from API route
  useEffect(() => {
    async function loadPolitician() {
      try {
        const politicianId = typeof params.id === 'string' ? params.id : params.id?.[0] ?? '';
        const res = await fetch(`/api/politicians/${encodeURIComponent(politicianId)}`);
        if (res.status === 404) {
          setPolitician(null);
          return;
        }
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const found: Politician = await res.json();
        setPolitician(found);
      } catch (error) {
        console.error('Error loading politician:', error);
        setPolitician(null);
      } finally {
        setPoliticianLoading(false);
      }
    }
    loadPolitician();
  }, [params.id]);

  // ---------------------------------------------------------------------------
  // Determine whether this is a federal or state politician
  // ---------------------------------------------------------------------------
  const isFederal = !!(politician?.source_ids?.bioguide_id);
  const isStateLeg = !isFederal && !!(
    politician?.officeLevel === 'State Senator' ||
    politician?.officeLevel === 'State Representative' ||
    politician?.officeLevel === 'Governor'
  );

  // ---------------------------------------------------------------------------
  // Fetch voting records when the Votes tab becomes active
  // ---------------------------------------------------------------------------
  const fetchVotingRecords = useCallback(async () => {
    if (!politician || votesFetched || votesLoading) return;

    setVotesLoading(true);
    setVotesError(null);

    try {
      let records: VotingRecord[] = [];

      if (isFederal) {
        // --- Federal path: try Supabase first, then Congress.gov sponsored bills ---
        const bioguideId = politician.source_ids!.bioguide_id!;

        // 1. Try the Supabase-backed votes endpoint
        const supaRes = await fetch(`/api/politicians/votes?bioguideId=${encodeURIComponent(bioguideId)}`);
        if (supaRes.ok) {
          const supaData = await supaRes.json();
          if (Array.isArray(supaData) && supaData.length > 0) {
            records = supaData.map((row: Record<string, unknown>, idx: number) => {
              const votes = row.votes as Record<string, unknown> | undefined;
              const bills = votes?.bills as Record<string, unknown> | undefined;
              const pv = (row.politician_votes ?? [row]) as Array<Record<string, unknown>>;
              const position = (pv[0]?.position as string) || 'NV';
              return {
                id: `supa-${idx}`,
                billNumber: (bills?.bill_number as string) || (votes?.vote_number as string) || '',
                billTitle: (bills?.title as string) || (votes?.description as string) || '',
                billDescription: (bills?.summary as string) || '',
                voteDate: (votes?.vote_date as string) || '',
                votePosition: position,
                category: (bills?.ai_primary_category as string) || '',
                result: (votes?.result as string) || '',
                chamber: (votes?.chamber as string) || '',
                source: 'supabase' as const,
              };
            });
          }
        }

        // 2. If Supabase had nothing, fall back to Congress.gov sponsored legislation
        if (records.length === 0) {
          const congressRes = await fetch(
            `/api/congress/bills?sponsor=${encodeURIComponent(bioguideId)}&limit=50`
          );
          if (congressRes.ok) {
            const congressData = await congressRes.json();
            const bills = congressData.bills || [];
            records = bills.map((bill: Record<string, unknown>, idx: number) => ({
              id: `cong-${idx}`,
              billNumber: `${bill.type || ''} ${bill.number || ''}`.trim(),
              billTitle: (bill.title as string) || '',
              billDescription: '',
              voteDate: ((bill.latestAction as Record<string, unknown>)?.date as string) || (bill.updateDate as string) || '',
              votePosition: 'Sponsor',
              category: (bill.policyArea as string) || '',
              result: ((bill.latestAction as Record<string, unknown>)?.text as string) || '',
              chamber: (bill.originChamber as string) || '',
              source: 'congress' as const,
            }));
          }
        }
      } else if (isStateLeg) {
        // --- State path: LegiScan sponsored list or search ---
        // Try search by politician name
        const nameQuery = politician.name.split(' ').slice(-1)[0]; // last name
        const state = politician.jurisdiction?.length === 2
          ? politician.jurisdiction
          : 'FL'; // default to FL

        const searchRes = await fetch(
          `/api/legiscan?op=getSearch&state=${encodeURIComponent(state)}&query=${encodeURIComponent(nameQuery)}`
        );
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const results = searchData?.searchresult || {};
          // LegiScan returns results as numbered keys + a summary key
          const billEntries = Object.entries(results).filter(
            ([key]) => key !== 'summary' && !isNaN(Number(key))
          );

          records = billEntries.slice(0, 50).map(([, val], idx) => {
            const bill = val as Record<string, unknown>;
            return {
              id: `ls-${idx}`,
              billNumber: (bill.bill_number as string) || '',
              billTitle: (bill.title as string) || '',
              billDescription: (bill.description as string) || '',
              voteDate: (bill.last_action_date as string) || (bill.status_date as string) || '',
              votePosition: 'N/A',
              category: '',
              result: (bill.last_action as string) || '',
              source: 'legiscan' as const,
              billUrl: (bill.url as string) || '',
            };
          });
        }
      }

      setVotingRecords(records);
      setVotesFetched(true);
    } catch (error) {
      console.error('Error fetching voting records:', error);
      setVotesError(error instanceof Error ? error.message : 'Failed to load voting records');
    } finally {
      setVotesLoading(false);
    }
  }, [politician, votesFetched, votesLoading, isFederal, isStateLeg]);

  useEffect(() => {
    if (activeTab === 'votes' && politician && !votesFetched && !votesLoading) {
      fetchVotingRecords();
    }
  }, [activeTab, politician, votesFetched, votesLoading, fetchVotingRecords]);

  // ---------------------------------------------------------------------------
  // Vote display helpers
  // ---------------------------------------------------------------------------

  /** Normalize any vote position string to a canonical form */
  const normalizePosition = (pos: string): string => {
    const p = pos.toLowerCase().trim();
    if (['yes', 'yea', 'aye'].includes(p)) return 'YEA';
    if (['no', 'nay'].includes(p)) return 'NAY';
    if (['nv', 'not voting', 'present', 'abstain'].includes(p)) return 'ABSTAIN';
    if (['absent'].includes(p)) return 'ABSENT';
    if (p === 'sponsor') return 'SPONSOR';
    if (p === 'n/a') return 'N/A';
    return pos.toUpperCase();
  };

  /** Color for a vote position badge */
  const getVoteColor = (position: string): string => {
    const norm = normalizePosition(position);
    if (norm === 'YEA' || norm === 'SPONSOR') return '#00FF88';
    if (norm === 'NAY') return '#FF3B5C';
    if (norm === 'ABSTAIN') return '#FFD166';
    return '#849585';
  };

  /** Calculate aggregate vote breakdown */
  const calculateBreakdown = (records: VotingRecord[]): VoteBreakdown => {
    return records.reduce(
      (acc, r) => {
        const norm = normalizePosition(r.votePosition);
        if (norm === 'YEA' || norm === 'SPONSOR') acc.yea++;
        else if (norm === 'NAY') acc.nay++;
        else if (norm === 'ABSTAIN') acc.abstain++;
        else acc.absent++;
        return acc;
      },
      { yea: 0, nay: 0, abstain: 0, absent: 0 }
    );
  };

  /** Filter records by category keyword preset */
  const filterByCategory = (records: VotingRecord[], filter: VoteCategoryFilter): VotingRecord[] => {
    if (filter === 'all') return records;

    return records.filter(r => {
      const text = `${r.billTitle} ${r.billDescription || ''} ${r.category || ''}`.toLowerCase();

      switch (filter) {
        case 'israel':
          return /israel|gaza|palestin|middle east|zion/.test(text);
        case 'defense':
          return /defense|military|armed forces|national security|weapon|armed services/.test(text);
        case 'foreign':
          return /foreign|international|state department|embassy|diplomatic|treaty|alliance|united nations|nato|trade agreement|sanctions|humanitarian aid|ukraine|russia|china/.test(text);
        case 'anti-america-first':
          return /united nations|un funding|who funding|paris agreement|global climate|international court|global tax|multilateral|world bank|imf|refugee admission|migration compact|open border/.test(text);
        case 'domestic':
          return !/foreign|international|immigration/.test(text);
        default:
          return true;
      }
    });
  };

  /** Filter records by free-text search */
  const filterBySearch = (records: VotingRecord[], query: string): VotingRecord[] => {
    if (!query.trim()) return records;
    const q = query.toLowerCase().trim();
    return records.filter(r => {
      const text = `${r.billNumber} ${r.billTitle} ${r.billDescription || ''} ${r.category || ''}`.toLowerCase();
      return text.includes(q);
    });
  };

  /** Apply both category and keyword filters */
  const getFilteredRecords = (): VotingRecord[] => {
    let filtered = filterByCategory(votingRecords, voteCategoryFilter);
    filtered = filterBySearch(filtered, voteSearchQuery);
    return filtered;
  };

  if (politicianLoading) {
    return (
      <main className="pt-[82px] min-h-screen bg-background text-on-surface flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-2 border-outline-variant border-t-primary-container mx-auto animate-spin" />
          <div className="font-label text-[0.75rem] text-primary-container/60 tracking-widest uppercase">LOADING_DOSSIER...</div>
        </div>
      </main>
    );
  }

  if (!politician) {
    return (
      <main className="pt-[82px] min-h-screen bg-background text-on-surface">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
          <div className="w-20 h-20 bg-surface-container-low border border-outline-variant/10 flex items-center justify-center">
            <span className="font-headline text-4xl text-error">?</span>
          </div>
          <div className="text-center space-y-2">
            <h1 className="font-headline font-bold text-2xl text-on-surface uppercase tracking-tight">ENTITY NOT FOUND</h1>
            <p className="font-label text-[0.7rem] text-on-surface-variant tracking-widest uppercase">Record does not exist in database</p>
          </div>
          <Link href="/" className="bg-primary-container px-6 py-3 font-label text-[0.7rem] font-bold text-on-primary tracking-widest uppercase hover:bg-primary-fixed-dim transition-none">
            RETURN TO DATABASE
          </Link>
        </div>
      </main>
    );
  }

  const getScoreColor = (score: number) => {
    if (score < 40) return '#00FF88';
    if (score < 60) return '#FFD166';
    return '#FF3B5C';
  };

  const getJuiceBoxLabel = (tier: string) => {
    if (tier === 'owned') return 'FULLY OWNED';
    if (tier === 'bought') return 'BOUGHT & PAID FOR';
    if (tier === 'compromised') return 'COMPROMISED';
    return 'CLEAN';
  };

  const getJuiceBoxTierNum = (tier: string) => {
    if (tier === 'owned') return '1';
    if (tier === 'bought') return '2';
    if (tier === 'compromised') return '3';
    return '0';
  };

  const getRiskLabel = (score: number) => {
    if (score <= 20) return 'LOW RISK';
    if (score <= 40) return 'MODERATE';
    if (score <= 60) return 'ELEVATED';
    if (score <= 80) return 'HIGH RISK';
    return 'CRITICAL VOLATILITY';
  };

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A': return '#00FF88';
      case 'B': return '#00E479';
      case 'C': return '#FFD166';
      case 'D': return '#FF3B5C';
      case 'F': return '#FF3B5C';
      default: return '#849585';
    }
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high': return '#00FF88';
      case 'medium': return '#FFD166';
      case 'low': return '#849585';
      default: return '#849585';
    }
  };

  const tabs = [
    { id: 'overview', label: 'OVERVIEW' },
    { id: 'score', label: 'RISK_SCORE' },
    { id: 'funding', label: 'FUNDING' },
    { id: 'votes', label: 'VOTES' },
    { id: 'social', label: 'SOCIAL' },
    { id: 'network', label: 'CONNECTIONS' },
    { id: 'legal', label: 'LEGAL' },
  ];

  return (
    <main className="pt-[82px] min-h-screen bg-background text-on-surface grid-bg relative">
      {/* Dossier Header */}
      <div className="border-b border-outline-variant/20 pb-8">
        <div className="flex flex-col md:flex-row justify-between items-start gap-6 p-6">
          <div className="flex flex-col md:flex-row gap-6 items-start">
            {/* Photo / Initial */}
            <div className="relative w-36 h-36 md:w-40 md:h-40 bg-surface-container-low border-2 border-primary-container/20 flex-shrink-0">
              <div className="w-full h-full flex items-center justify-center bg-surface-container">
                <span className="font-headline font-bold text-7xl text-primary-container/30">{politician.name.charAt(0)}</span>
              </div>
              <div className="absolute inset-0 border border-primary-container/40 pointer-events-none" />
              <div className="absolute bottom-2 left-2 bg-black/80 px-2 py-0.5 font-label text-[0.6rem] text-primary-container">
                ENTITY_ID: {politician.id?.substring(0, 12).toUpperCase()}
              </div>
            </div>

            {/* Name and badges */}
            <div className="space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="bg-primary-container/10 text-primary-container border border-primary-container/30 px-2 py-0.5 font-label text-[0.65rem] tracking-wider uppercase">
                  {politician.isActive ? 'ACTIVE DOSSIER' : 'INACTIVE DOSSIER'}
                </span>
                {politician.dataStatus && (
                  <span className={`font-label text-[0.65rem] px-2 py-0.5 border ${
                    politician.dataStatus === 'live'
                      ? 'bg-primary-container/10 text-primary-container border-primary-container/30'
                      : 'bg-[#FFD166]/10 text-[#FFD166] border-[#FFD166]/30'
                  }`}>
                    {politician.dataStatus === 'live' ? 'LIVE_DATA' : 'MOCK_DATA'}
                  </span>
                )}
              </div>

              <h1 className="font-headline font-bold text-4xl md:text-5xl lg:text-6xl text-white tracking-tighter uppercase">
                {politician.name}
              </h1>

              <div className="flex flex-wrap items-center gap-4 font-label text-[0.8rem]">
                <div className="flex items-center gap-2">
                  <span className="text-primary-container/40 uppercase">OFFICE:</span>
                  <span className="text-on-surface">{politician.office.toUpperCase()}</span>
                </div>
                <div className="w-[1px] h-3 bg-outline-variant/30" />
                <div className="flex items-center gap-2">
                  <span className="text-primary-container/40 uppercase">PARTY:</span>
                  <span className="text-on-surface">{politician.party.toUpperCase()} ({politician.party === 'Republican' ? 'R' : politician.party === 'Democrat' ? 'D' : 'I'})</span>
                </div>
                <div className="w-[1px] h-3 bg-outline-variant/30" />
                <div className="flex items-center gap-2">
                  <span className="text-primary-container/40 uppercase">STATE:</span>
                  <span className="text-on-surface">{(politician.district || politician.jurisdiction || '').toUpperCase()}</span>
                </div>
              </div>

              <div className="pt-4 flex flex-wrap gap-3">
                {politician.juiceBoxTier !== 'none' && (
                  <div className="bg-[#FFD166]/10 border border-[#FFD166]/40 text-[#FFD166] px-4 py-2 flex items-center gap-2">
                    <span className="font-label text-[0.7rem] font-bold tracking-widest uppercase">
                      JUICE BOX -- TIER {getJuiceBoxTierNum(politician.juiceBoxTier)}
                    </span>
                  </div>
                )}
                {politician.tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="font-label text-[0.65rem] font-bold tracking-wider uppercase px-3 py-1.5 border"
                    style={{ background: `${tag.color}15`, color: tag.color, borderColor: `${tag.color}40` }}
                  >
                    {tag.label}
                  </span>
                ))}
                <button
                  onClick={() => {
                    const url = window.location.href;
                    const text = `${politician.name} — ${politician.office} | Corruption Score: ${politician.corruptionScore}/100`;
                    if (navigator.share) {
                      navigator.share({ title: text, url });
                    } else {
                      navigator.clipboard.writeText(url);
                      alert('Link copied to clipboard');
                    }
                  }}
                  className="bg-primary-container px-4 py-2 font-label text-[0.7rem] font-bold text-on-primary hover:bg-primary-fixed-dim transition-none"
                >
                  SHARE_DOSSIER
                </button>
              </div>
            </div>
          </div>

          {/* Score Box */}
          <div className="flex-shrink-0 flex flex-col items-center gap-2">
            <div className="relative w-28 h-28 md:w-32 md:h-32 border-2 flex items-center justify-center" style={{ borderColor: getScoreColor(politician.corruptionScore), background: `${getScoreColor(politician.corruptionScore)}10` }}>
              <div className="flex flex-col items-center">
                <span className="font-headline font-bold text-4xl" style={{ color: getScoreColor(politician.corruptionScore) }}>{politician.corruptionScore}</span>
                <span className="font-label text-[0.55rem] tracking-widest" style={{ color: `${getScoreColor(politician.corruptionScore)}99` }}>RISK_SCORE</span>
              </div>
            </div>
            <span className="font-label text-[0.6rem] uppercase tracking-tighter" style={{ color: getScoreColor(politician.corruptionScore) }}>{getRiskLabel(politician.corruptionScore)}</span>
            {politician.corruptionScoreDetails?.grade && (
              <span className="font-headline font-bold text-lg" style={{ color: getGradeColor(politician.corruptionScoreDetails.grade) }}>GRADE {politician.corruptionScoreDetails.grade}</span>
            )}
          </div>
        </div>
        <div className="px-6 mt-2">
          <Link href="/browse" className="font-label text-[0.7rem] text-primary-container/60 hover:text-primary-container tracking-widest uppercase transition-none">&lt; BACK_TO_DATABASE</Link>
        </div>
      </div>

      {/* Bento Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 pb-20">
        {/* Left Column: RISK_MATRIX */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-surface-container-low p-6 border border-outline-variant/10">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-label text-[0.8rem] font-bold text-primary-container tracking-widest uppercase">RISK_MATRIX</h3>
            </div>
            <div className="space-y-5">
              {politician.corruptionScoreDetails?.factors ? (
                [...politician.corruptionScoreDetails.factors]
                  .sort((a, b) => b.rawScore - a.rawScore)
                  .map((factor) => (
                    <div key={factor.key} className="space-y-2">
                      <div className="flex justify-between font-label text-[0.6rem]">
                        <span className="text-on-surface/60 uppercase">{factor.label}</span>
                        <span className="text-primary-container">{factor.rawScore}%</span>
                      </div>
                      <div className="h-1 bg-surface-container-highest w-full">
                        <div className="h-full bg-primary-container" style={{ width: `${factor.rawScore}%` }} />
                      </div>
                    </div>
                  ))
              ) : (
                <>
                  {[
                    { label: 'Funding Risk', value: Math.min(100, Math.round((politician.aipacFunding / 10000) * 100) || 30) },
                    { label: 'Legal Record', value: 30 },
                    { label: 'Voting Pattern', value: 30 },
                    { label: 'Social Media', value: 30 },
                    { label: 'Forensic Connections', value: Math.min(100, politician.corruptionScore || 30) },
                  ].map((item) => (
                    <div key={item.label} className="space-y-2">
                      <div className="flex justify-between font-label text-[0.6rem]">
                        <span className="text-on-surface/60 uppercase">{item.label}</span>
                        <span className="text-primary-container">{item.value}%</span>
                      </div>
                      <div className="h-1 bg-surface-container-highest w-full">
                        <div className="h-full bg-primary-container" style={{ width: `${item.value}%` }} />
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
            <div className="mt-8 p-4 bg-background border border-primary-container/10">
              <p className="font-label text-[0.65rem] text-primary-container/70 leading-relaxed">
                <span className="text-primary-container font-bold">ANALYSIS:</span>{' '}
                {politician.corruptionScore >= 60
                  ? `High-risk profile detected. Score ${politician.corruptionScore}/100. ${politician.aipacFunding > 0 ? `Israel lobby funding $${(politician.aipacFunding / 1000).toFixed(0)}K flagged.` : ''}`
                  : politician.corruptionScore >= 40
                    ? `Elevated risk indicators. Score ${politician.corruptionScore}/100. Data coverage ${politician.corruptionScoreDetails?.dataCompleteness || '--'}%.`
                    : `Risk profile within parameters. Score ${politician.corruptionScore}/100.`
                }
              </p>
            </div>
          </div>
          <div className="bg-surface-container-low p-6 border border-outline-variant/10 space-y-4">
            <h3 className="font-label text-[0.8rem] font-bold text-primary-container tracking-widest uppercase mb-4">ENTITY_STATS</h3>
            <div className="flex justify-between items-baseline">
              <span className="font-label text-[0.65rem] text-on-surface/40 uppercase">AIPAC Funding</span>
              <span className="font-label text-[0.9rem] font-bold" style={{ color: politician.aipacFunding > 0 ? '#FF3B5C' : '#00FF88' }}>${(politician.aipacFunding / 1000).toFixed(0)}K</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="font-label text-[0.65rem] text-on-surface/40 uppercase">Years in Office</span>
              <span className="font-label text-[0.9rem] font-bold text-on-surface">{politician.yearsInOffice}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="font-label text-[0.65rem] text-on-surface/40 uppercase">Status</span>
              <span className={`font-label text-[0.75rem] font-bold ${politician.isActive ? 'text-primary-container' : 'text-on-surface/40'}`}>{politician.isActive ? 'ACTIVE' : 'INACTIVE'}</span>
            </div>
            {politician.lastUpdated && (
              <div className="pt-3 border-t border-outline-variant/10">
                <span className="font-label text-[0.55rem] text-primary-container/30 uppercase block">LAST_SYNC_TS</span>
                <span className="font-label text-[0.65rem] text-primary-container/60">{new Date(politician.lastUpdated).toISOString().replace('T', ' ').substring(0, 19)} UTC</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Tabs */}
        <div className="lg:col-span-8 space-y-6">
          <div className="flex border-b border-outline-variant/20 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-4 font-label text-[0.75rem] tracking-widest transition-none border-b-2 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'font-bold text-primary-container border-primary-container bg-primary-container/5'
                    : 'text-on-surface/40 hover:text-primary-container border-transparent'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="bg-surface-container-low p-6 border border-outline-variant/10">
                <h3 className="font-label text-[0.8rem] font-bold text-primary-container tracking-widest uppercase mb-4">
                  BIOGRAPHICAL_DATA
                </h3>
                <p className="font-body text-[0.85rem] leading-relaxed text-on-surface/80 mb-4">
                  {politician.bio || `${politician.name} serves as ${politician.office} representing ${politician.district || politician.jurisdiction}.`}
                </p>
                <div className="grid grid-cols-[140px_1fr] gap-3 font-label text-[0.75rem]">
                  <div className="text-on-surface/40 uppercase">Office:</div>
                  <div className="text-on-surface">{politician.office}</div>
                  <div className="text-on-surface/40 uppercase">Jurisdiction:</div>
                  <div className="text-on-surface">{politician.district || politician.jurisdiction}</div>
                  <div className="text-on-surface/40 uppercase">Party:</div>
                  <div className="text-on-surface">{politician.party}</div>
                  <div className="text-on-surface/40 uppercase">Term Start:</div>
                  <div className="text-on-surface">{politician.termStart}</div>
                  {politician.termEnd && (
                    <>
                      <div className="text-on-surface/40 uppercase">Term End:</div>
                      <div className="text-on-surface">{politician.termEnd}</div>
                    </>
                  )}
                </div>
              </div>

              {/* Social Media */}
              {politician.socialMedia && Object.keys(politician.socialMedia).length > 0 && (
                <div className="bg-surface-container-low p-6 border border-outline-variant/10">
                  <h3 className="font-label text-[0.8rem] font-bold text-primary-container tracking-widest uppercase mb-4">SOCIAL_ACCOUNTS</h3>
                  <div className="flex flex-col gap-3 font-label text-[0.75rem]">
                    {politician.socialMedia.twitterHandle && (
                      <div className="flex items-center gap-4">
                        <span className="text-on-surface/40 uppercase w-[100px]">Twitter:</span>
                        <a href={`https://twitter.com/${politician.socialMedia.twitterHandle}`} target="_blank" rel="noopener noreferrer" className="text-primary-container hover:text-primary-fixed-dim transition-none">@{politician.socialMedia.twitterHandle}</a>
                      </div>
                    )}
                    {politician.socialMedia.facebookPageUrl && (
                      <div className="flex items-center gap-4">
                        <span className="text-on-surface/40 uppercase w-[100px]">Facebook:</span>
                        <a href={politician.socialMedia.facebookPageUrl} target="_blank" rel="noopener noreferrer" className="text-primary-container hover:text-primary-fixed-dim transition-none">Page</a>
                      </div>
                    )}
                    {politician.socialMedia.instagramHandle && (
                      <div className="flex items-center gap-4">
                        <span className="text-on-surface/40 uppercase w-[100px]">Instagram:</span>
                        <a href={`https://instagram.com/${politician.socialMedia.instagramHandle}`} target="_blank" rel="noopener noreferrer" className="text-primary-container hover:text-primary-fixed-dim transition-none">@{politician.socialMedia.instagramHandle}</a>
                      </div>
                    )}
                    {politician.socialMedia.youtubeChannelId && (
                      <div className="flex items-center gap-4">
                        <span className="text-on-surface/40 uppercase w-[100px]">YouTube:</span>
                        <a href={`https://youtube.com/channel/${politician.socialMedia.youtubeChannelId}`} target="_blank" rel="noopener noreferrer" className="text-primary-container hover:text-primary-fixed-dim transition-none">Channel</a>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Corruption Score Breakdown Tab */}
          {activeTab === 'score' && (
            <div className="space-y-6">
              {/* Score Summary Card */}
              <div className="bg-surface-container-low p-6 border border-outline-variant/10">
                <div className="flex gap-8 items-center flex-wrap">
                  {/* Big Score Box */}
                  <div className="w-[120px] h-[120px] border-2 flex flex-col items-center justify-center flex-shrink-0"
                    style={{ borderColor: getScoreColor(politician.corruptionScore), background: `${getScoreColor(politician.corruptionScore)}10` }}>
                    <span className="font-headline font-bold text-5xl leading-none" style={{ color: getScoreColor(politician.corruptionScore) }}>
                      {politician.corruptionScore}
                    </span>
                    <span className="font-label text-[0.6rem] text-on-surface/40">/100</span>
                  </div>

                  {/* Grade + Confidence */}
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-3">
                      {politician.corruptionScoreDetails?.grade && (
                        <span className="font-headline font-bold text-5xl leading-none" style={{ color: getGradeColor(politician.corruptionScoreDetails.grade) }}>
                          {politician.corruptionScoreDetails.grade}
                        </span>
                      )}
                      <div>
                        <div className="font-headline font-bold text-xl text-white uppercase">{getRiskLabel(politician.corruptionScore)}</div>
                        <div className="font-label text-[0.65rem] text-on-surface/40 mt-1">Score computed from 5 weighted factors using available data</div>
                      </div>
                    </div>
                    {politician.corruptionScoreDetails?.confidence && (
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 border"
                        style={{ background: `${getConfidenceColor(politician.corruptionScoreDetails.confidence)}15`, borderColor: getConfidenceColor(politician.corruptionScoreDetails.confidence) }}>
                        <span className="w-2 h-2" style={{ background: getConfidenceColor(politician.corruptionScoreDetails.confidence) }} />
                        <span className="font-label text-[0.65rem] font-bold uppercase tracking-wider"
                          style={{ color: getConfidenceColor(politician.corruptionScoreDetails.confidence) }}>
                          {politician.corruptionScoreDetails.confidence} confidence -- {politician.corruptionScoreDetails.dataCompleteness}% data coverage
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Factor Breakdown */}
              <div className="bg-surface-container-low p-6 border border-outline-variant/10">
                <h3 className="font-label text-[0.8rem] font-bold text-primary-container tracking-widest uppercase mb-6">SCORE_FACTOR_BREAKDOWN</h3>
                {politician.corruptionScoreDetails?.factors ? (
                  <div className="flex flex-col gap-5">
                    {[...politician.corruptionScoreDetails.factors]
                      .sort((a, b) => b.weightedScore - a.weightedScore)
                      .map((factor) => (
                      <div key={factor.key} className="p-5 bg-surface-container border border-outline-variant/10">
                        <div className="flex justify-between items-center mb-3">
                          <div className="flex items-center gap-3">
                            <span className="font-label text-[0.8rem] font-bold text-on-surface">{factor.label}</span>
                            <span className={`font-label text-[0.55rem] px-1.5 py-0.5 border font-bold uppercase ${
                              factor.dataAvailable ? 'bg-primary-container/15 text-primary-container border-primary-container/30' : 'bg-outline/15 text-outline border-outline/30'
                            }`}>{factor.dataAvailable ? 'REAL DATA' : 'PLACEHOLDER'}</span>
                          </div>
                          <div className="flex items-baseline gap-2">
                            <span className="font-headline font-bold text-2xl" style={{ color: getScoreColor(factor.rawScore) }}>{factor.rawScore}</span>
                            <span className="font-label text-[0.6rem] text-on-surface/40">/100 x{(factor.weight * 100).toFixed(0)}% = {factor.weightedScore.toFixed(1)}</span>
                          </div>
                        </div>
                        <div className="w-full h-1 bg-surface-container-highest mb-3">
                          <div className="h-full" style={{ width: `${factor.rawScore}%`, background: getScoreColor(factor.rawScore) }} />
                        </div>
                        <div className="font-label text-[0.65rem] text-on-surface/50 leading-relaxed">{factor.explanation}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-on-surface/40 font-label text-[0.75rem]">Score breakdown not available for this politician.</div>
                )}
              </div>

              {/* Methodology Note */}
              <div className="bg-[#FFD166]/5 p-6 border border-[#FFD166]/20">
                <h3 className="font-label text-[0.75rem] font-bold text-[#FFD166] tracking-widest uppercase mb-3">METHODOLOGY -- V1_ALGORITHM</h3>
                <div className="font-label text-[0.65rem] text-on-surface/50 leading-relaxed space-y-2">
                  <p>The corruption score is a composite of 5 weighted factors: PAC/Lobby Funding Ratio (30%), Lobbying Connections (20%), Voting Alignment with Donors (25%), Transparency &amp; Disclosure (10%), and Campaign Finance Red Flags (15%).</p>
                  <p>Factors marked &quot;PLACEHOLDER&quot; use a neutral baseline score of 30 because the required data has not yet been linked. As more data sources come online, these factors will switch to real data and accuracy will improve.</p>
                  <p>Confidence level reflects how many factors use real data. HIGH = 4-5 factors, MEDIUM = 2-3, LOW = 0-1.</p>
                </div>
              </div>
            </div>
          )}

          {/* Funding & Financial Tab */}
          {activeTab === 'funding' && (
            <div>
              {politician.totalFundsRaised ? (
                <div className="space-y-6">
                  {/* Total Funds Card */}
                  <div className="bg-surface-container-low border border-outline-variant/10 overflow-hidden">
                    <div className="p-6 flex justify-between items-end border-b border-outline-variant/10">
                      <div>
                        <h2 className="font-label text-[0.65rem] text-primary-container/50 uppercase tracking-[0.2em] mb-1">AGGREGATE_CAPITAL_FLOW</h2>
                        <div className="font-headline font-bold text-4xl text-white tracking-tight">
                          ${politician.totalFundsRaised >= 1000000
                            ? `${(politician.totalFundsRaised / 1000000).toFixed(2)}M`
                            : `${(politician.totalFundsRaised / 1000).toFixed(0)}K`}
                        </div>
                      </div>
                      {politician.lastUpdated && (
                        <div className="text-right">
                          <span className="font-label text-[0.6rem] text-primary-container/50 uppercase block">LAST_SYNC_TS</span>
                          <span className="font-label text-[0.7rem] text-primary-container">{new Date(politician.lastUpdated).toISOString().replace('T', ' ').substring(0, 19)} UTC</span>
                        </div>
                      )}
                    </div>
                    {/* Israel Lobby Total */}
                    {politician.israelLobbyTotal && politician.israelLobbyTotal > 0 && (
                      <div className="p-6 bg-[#FFD166]/5 border-b border-[#FFD166]/20">
                        <div className="font-label text-[0.7rem] text-[#FFD166] mb-2 uppercase tracking-widest font-bold">ISRAEL_LOBBY_TOTAL</div>
                        <div className="font-headline font-bold text-3xl text-[#FFD166] tracking-tight mb-4">
                          ${politician.israelLobbyTotal >= 1000000
                            ? `${(politician.israelLobbyTotal / 1000000).toFixed(2)}M`
                            : `${(politician.israelLobbyTotal / 1000).toFixed(0)}K`}
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="p-3 bg-[#FF3B5C]/10 border border-[#FF3B5C]/20">
                            <div className="font-label text-[0.6rem] text-on-surface/40 mb-1 uppercase">PACs</div>
                            <div className="font-label text-[1rem] font-bold text-[#FF3B5C]">
                              ${politician.israelLobbyBreakdown?.pacs
                                ? (politician.israelLobbyBreakdown.pacs >= 1000000 ? `${(politician.israelLobbyBreakdown.pacs / 1000000).toFixed(0)}M` : `${(politician.israelLobbyBreakdown.pacs / 1000).toFixed(0)}K`) : '0'}
                            </div>
                          </div>
                          <div className="p-3 bg-[#FF3B5C]/10 border border-[#FF3B5C]/20">
                            <div className="font-label text-[0.6rem] text-on-surface/40 mb-1 uppercase">IE</div>
                            <div className="font-label text-[1rem] font-bold text-[#FF3B5C]">
                              ${politician.israelLobbyBreakdown?.ie
                                ? (politician.israelLobbyBreakdown.ie >= 1000000 ? `${(politician.israelLobbyBreakdown.ie / 1000000).toFixed(0)}M` : `${(politician.israelLobbyBreakdown.ie / 1000).toFixed(0)}K`) : '0'}
                            </div>
                          </div>
                          <div className="p-3 bg-[#FF3B5C]/10 border border-[#FF3B5C]/20">
                            <div className="font-label text-[0.6rem] text-on-surface/40 mb-1 uppercase">Bundlers</div>
                            <div className="font-label text-[1rem] font-bold text-[#FF3B5C]">
                              ${politician.israelLobbyBreakdown?.bundlers
                                ? (politician.israelLobbyBreakdown.bundlers >= 1000000 ? `${(politician.israelLobbyBreakdown.bundlers / 1000000).toFixed(0)}M` : `${(politician.israelLobbyBreakdown.bundlers / 1000).toFixed(0)}K`) : '0'}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Top 5 Donors Card */}
                  <div className="bg-surface-container-low p-6 border border-outline-variant/10">
                    <h3 className="font-label text-[0.8rem] font-bold text-primary-container tracking-widest uppercase mb-6">TOP_5_DONORS</h3>
                    {politician.top5Donors && politician.top5Donors.length > 0 ? (
                      <div className="divide-y divide-outline-variant/10">
                        {politician.top5Donors.map((donor, index) => {
                          const isIsrael = donor.type === 'Israel-PAC';
                          return (
                            <div key={index} className={`p-4 flex items-center justify-between gap-4 hover:bg-primary-container/5 transition-none ${isIsrael ? 'bg-[#FFD166]/5 border-y border-[#FFD166]/20' : ''}`}>
                              <div className="flex-1 min-w-0">
                                <div className={`font-label text-[0.8rem] font-bold uppercase tracking-tight ${isIsrael ? 'text-[#FFD166]' : 'text-on-surface'}`}>
                                  {donor.name}
                                  {isIsrael && <span className="ml-2 font-label text-[0.55rem] text-[#FFD166] border border-[#FFD166]/40 px-1.5 py-0.5 bg-[#FFD166]/20">FLAGGED</span>}
                                </div>
                                <div className="font-label text-[0.6rem] text-on-surface/40 uppercase mt-1">{donor.type}</div>
                              </div>
                              <div className={`font-label text-[0.9rem] font-bold text-right ${isIsrael ? 'text-[#FFD166]' : 'text-primary-container'}`}>
                                ${donor.amount >= 1000000 ? `${(donor.amount / 1000000).toFixed(2)}M` : `${(donor.amount / 1000).toFixed(0)}K`}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-8 text-center text-on-surface/40 font-label text-[0.75rem]">No donor data available</div>
                    )}
                  </div>

                  {/* Contribution Breakdown Card */}
                  {politician.contributionBreakdown && (
                    <div className="bg-surface-container-low p-6 border border-outline-variant/10">
                      <h3 className="font-label text-[0.8rem] font-bold text-primary-container tracking-widest uppercase mb-6">FUNDING_BREAKDOWN</h3>
                      {(() => {
                        const b = politician.contributionBreakdown;
                        const total = (b.individuals || 0) + (b.otherPACs || 0) + (b.corporate || 0) + (b.aipac || 0);
                        if (total === 0) return null;
                        const segments = [
                          { label: 'Individuals', amount: b.individuals || 0, color: '#00FF88' },
                          { label: 'PACs', amount: b.otherPACs || 0, color: '#FFD166' },
                          { label: 'Corporate', amount: b.corporate || 0, color: '#4DA6FF' },
                          ...(b.aipac > 0 ? [{ label: 'Israel Lobby', amount: b.aipac, color: '#FF3B5C' }] : []),
                        ].filter(s => s.amount > 0).sort((a, b) => b.amount - a.amount);
                        return (
                          <div className="flex flex-col gap-4">
                            {/* Stacked bar */}
                            <div className="flex h-2 overflow-hidden">
                              {segments.map((s, i) => (
                                <div key={i} style={{
                                  width: `${(s.amount / total) * 100}%`,
                                  background: s.color,
                                  minWidth: s.amount > 0 ? '4px' : '0',
                                }} title={`${s.label}: $${s.amount.toLocaleString()}`} />
                              ))}
                            </div>
                            {/* Legend */}
                            <div className="flex flex-col gap-3">
                              {segments.map((s, i) => (
                                <div key={i} className="flex justify-between items-center">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2" style={{ background: s.color }} />
                                    <span className="font-label text-[0.75rem] text-on-surface">{s.label}</span>
                                    <span className="font-label text-[0.65rem] text-on-surface/40">
                                      ({((s.amount / total) * 100).toFixed(1)}%)
                                    </span>
                                  </div>
                                  <span className="font-label text-[0.85rem] font-bold" style={{ color: s.color }}>
                                    ${s.amount >= 1000000
                                      ? `${(s.amount / 1000000).toFixed(1)}M`
                                      : s.amount >= 10000
                                        ? `${(s.amount / 1000).toFixed(0)}K`
                                        : s.amount.toLocaleString()}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Independent Expenditures Card */}
                  <div className="bg-surface-container-low p-6 border border-outline-variant/10">
                    <h3 className="font-label text-[0.8rem] font-bold text-primary-container tracking-widest uppercase mb-2">INDEPENDENT_EXPENDITURES</h3>
                    <div className="font-label text-[0.65rem] text-on-surface/40 mb-6">Third-party spending for or against this politician (FEC Schedule E)</div>
                    {politician.israelLobbyBreakdown?.ie_details && politician.israelLobbyBreakdown.ie_details.length > 0 ? (
                      <div className="divide-y divide-outline-variant/10">
                        {politician.israelLobbyBreakdown.ie_details
                          .sort((a, b) => b.amount - a.amount)
                          .map((ie, index) => (
                          <div key={index} className={`p-4 flex justify-between items-center gap-4 hover:bg-primary-container/5 transition-none ${ie.is_israel_lobby ? 'bg-[#FFD166]/5' : ''}`}>
                            <div className="flex-1 min-w-0">
                              <div className={`font-label text-[0.8rem] font-bold truncate ${ie.is_israel_lobby ? 'text-[#FFD166]' : 'text-on-surface'}`}>
                                {ie.committee_name}
                                {ie.is_israel_lobby && <span className="ml-2 font-label text-[0.55rem] text-[#FFD166] border border-[#FFD166]/40 px-1.5 py-0.5 bg-[#FFD166]/20">FLAGGED</span>}
                              </div>
                              <div className="flex gap-3 font-label text-[0.65rem] mt-1">
                                <span className={`font-bold uppercase ${ie.support_oppose === 'support' ? 'text-primary-container' : 'text-error'}`}>
                                  {ie.support_oppose === 'support' ? '+ SUPPORT' : '- OPPOSE'}
                                </span>
                                <span className="text-on-surface/30">{ie.committee_id}</span>
                              </div>
                            </div>
                            <div className={`font-label text-[1rem] font-bold whitespace-nowrap ${ie.is_israel_lobby ? 'text-[#FFD166]' : 'text-primary-container'}`}>
                              ${ie.amount >= 1000000
                                ? `${(ie.amount / 1000000).toFixed(1)}M`
                                : ie.amount >= 1000
                                  ? `${(ie.amount / 1000).toFixed(0)}K`
                                  : ie.amount.toLocaleString()}
                            </div>
                          </div>
                        ))}
                        <div className="p-4 flex justify-between items-center bg-surface-container">
                          <span className="font-label text-[0.7rem] font-bold text-on-surface/40 uppercase">TOTAL_IE_SPENDING</span>
                          <span className="font-label text-[1.1rem] font-bold text-primary-container">
                            ${politician.israelLobbyBreakdown.ie_details.reduce((sum, ie) => sum + ie.amount, 0).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-8 text-center text-on-surface/40 font-label text-[0.75rem]">No independent expenditures on record</div>
                    )}
                  </div>

                </div>
              ) : (
                <div className="bg-surface-container-low p-16 border border-outline-variant/10 text-center">
                  {['US Senator', 'US Representative', 'State Senator', 'State Representative'].includes(politician.officeLevel) ? (
                    <>
                      <div className="font-headline text-4xl text-primary-container mb-4">--</div>
                      <div className="font-headline font-bold text-lg text-primary-container mb-2">NO CONTRIBUTIONS FOUND</div>
                      <div className="font-label text-[0.7rem] text-on-surface/40">No foreign lobby funding or major PAC contributions detected.</div>
                    </>
                  ) : (
                    <>
                      <div className="font-headline text-4xl text-on-surface/30 mb-4">--</div>
                      <div className="font-headline font-bold text-lg text-on-surface/60 mb-2">CAMPAIGN FINANCE DATA PENDING</div>
                      <div className="font-label text-[0.7rem] text-on-surface/40">County and local campaign finance records are not yet available.</div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Voting & Policy Tab */}
          {activeTab === 'votes' && (
            <div>
              {votesError ? (
                <div className="bg-surface-container-low p-16 border border-outline-variant/10 text-center">
                  <div className="font-headline text-2xl text-error mb-4">!</div>
                  <div className="font-headline font-bold text-lg text-error mb-2">ERROR LOADING VOTING RECORDS</div>
                  <div className="font-label text-[0.7rem] text-on-surface/40 mt-4">{votesError}</div>
                  <button onClick={() => { setVotesFetched(false); setVotesError(null); }} className="mt-6 bg-primary-container px-6 py-2 font-label text-[0.7rem] font-bold text-on-primary tracking-widest uppercase hover:bg-primary-fixed-dim transition-none">RETRY</button>
                </div>
              ) : votesLoading ? (
                <div className="bg-surface-container-low p-16 border border-outline-variant/10 text-center">
                  <div className="w-12 h-12 mx-auto mb-6 border-2 border-outline-variant border-t-primary-container animate-spin" />
                  <div className="font-label text-[0.8rem] font-bold text-on-surface mb-2">LOADING VOTING RECORDS...</div>
                  <div className="font-label text-[0.7rem] text-on-surface/40">{isFederal ? 'Querying Congress.gov / Supabase' : isStateLeg ? 'Querying LegiScan API' : 'Searching records'}</div>
                </div>
              ) : !isFederal && !isStateLeg ? (
                <div className="bg-surface-container-low p-16 border border-outline-variant/10 text-center">
                  <div className="font-headline text-2xl text-on-surface/30 mb-4">--</div>
                  <div className="font-headline font-bold text-lg text-on-surface mb-2">NO VOTING DATA SOURCE</div>
                  <div className="font-label text-[0.7rem] text-on-surface/40 max-w-[500px] mx-auto leading-relaxed">
                    Voting records are available for federal legislators (Congress.gov) and state legislators (LegiScan). This official&apos;s role ({politician.office}) does not have a legislative voting record.
                  </div>
                </div>
              ) : votingRecords.length === 0 ? (
                <div className="bg-surface-container-low p-16 border border-outline-variant/10 text-center">
                  <div className="font-headline text-2xl text-on-surface/30 mb-4">[ ]</div>
                  <div className="font-headline font-bold text-lg text-on-surface mb-2">NO VOTING RECORDS FOUND</div>
                  <div className="font-label text-[0.7rem] text-on-surface/40">{isFederal ? `No vote data returned for Bioguide ID ${politician.source_ids?.bioguide_id}.` : `No legislative activity found in LegiScan for ${politician.name}.`}</div>
                  <button onClick={() => { setVotesFetched(false); }} className="mt-6 border border-outline-variant/30 px-4 py-2 font-label text-[0.65rem] font-bold text-on-surface/60 tracking-widest uppercase hover:text-primary-container transition-none">RETRY</button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="bg-surface-container-low p-6 border border-outline-variant/10">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-label text-[0.7rem] font-bold text-primary-container uppercase tracking-widest">RECENT_VOTING_RECORD ({votingRecords.length})</h3>
                      <div className="flex gap-4">
                        <div className="flex items-center gap-2"><div className="w-2 h-2 bg-primary-container" /><span className="font-label text-[0.55rem] text-primary-container/60">YES_CONCUR</span></div>
                        <div className="flex items-center gap-2"><div className="w-2 h-2 bg-error" /><span className="font-label text-[0.55rem] text-error/60">NO_DISSENT</span></div>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                      {(() => { const bd = calculateBreakdown(votingRecords); return (<>
                        <div><div className="font-label text-[0.6rem] text-on-surface/40 uppercase tracking-widest mb-2">YEA</div><div className="font-headline font-bold text-3xl text-primary-container">{bd.yea}</div></div>
                        <div><div className="font-label text-[0.6rem] text-on-surface/40 uppercase tracking-widest mb-2">NAY</div><div className="font-headline font-bold text-3xl text-error">{bd.nay}</div></div>
                        <div><div className="font-label text-[0.6rem] text-on-surface/40 uppercase tracking-widest mb-2">ABSTAIN</div><div className="font-headline font-bold text-3xl text-[#FFD166]">{bd.abstain}</div></div>
                        <div><div className="font-label text-[0.6rem] text-on-surface/40 uppercase tracking-widest mb-2">ABSENT</div><div className="font-headline font-bold text-3xl text-on-surface/30">{bd.absent}</div></div>
                      </>); })()}
                    </div>
                  </div>
                  <div className="bg-surface-container p-4 border border-outline-variant/10 space-y-3">
                    <div className="flex gap-2 flex-wrap items-center">
                      <div className="font-label text-[0.65rem] text-on-surface/40 uppercase tracking-widest mr-2">FILTER:</div>
                      {(['all', 'israel', 'defense', 'foreign', 'anti-america-first', 'domestic'] as VoteCategoryFilter[]).map((f) => (
                        <button key={f} onClick={() => setVoteCategoryFilter(f)} className={`px-3 py-1.5 font-label text-[0.6rem] font-bold uppercase tracking-wider transition-none border ${voteCategoryFilter === f ? 'bg-primary-container text-on-primary border-primary-container' : 'bg-transparent text-on-surface/60 border-outline-variant/20 hover:text-primary-container'}`}>
                          {f.toUpperCase().replace(/-/g, ' ')}{f !== 'all' && ` (${filterByCategory(votingRecords, f).length})`}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-label text-[0.65rem] text-on-surface/40 uppercase tracking-widest flex-shrink-0">SEARCH:</span>
                      <input type="text" value={voteSearchQuery} onChange={(e) => setVoteSearchQuery(e.target.value)} placeholder="keyword, bill number..." className="flex-1 px-3 py-2 bg-background border-b border-primary-container/30 text-on-surface font-label text-[0.7rem] focus:outline-none focus:border-primary-container placeholder:text-on-surface/20" />
                      {voteSearchQuery && <button onClick={() => setVoteSearchQuery('')} className="px-3 py-1.5 border border-outline-variant/20 font-label text-[0.6rem] text-on-surface/40 hover:text-primary-container transition-none">CLEAR</button>}
                    </div>
                  </div>
                  <div className="bg-surface-container-low border border-outline-variant/10 overflow-hidden">
                    {(() => {
                      const filtered = getFilteredRecords();
                      if (filtered.length === 0) return <div className="p-12 text-center text-on-surface/40 font-label text-[0.75rem]">No records match the current filters.{voteSearchQuery && ' Try a different keyword.'}</div>;
                      return (
                        <div className="divide-y divide-outline-variant/10">
                          {filtered.map((record) => { const posColor = getVoteColor(record.votePosition); const posLabel = normalizePosition(record.votePosition); return (
                            <div key={record.id} className="p-6 flex items-center justify-between hover:bg-surface-container-high transition-none">
                              <div className="space-y-1 flex-1 min-w-0">
                                <div className="font-label text-[0.8rem] font-bold uppercase tracking-tight text-on-surface">
                                  {record.billUrl ? <a href={record.billUrl} target="_blank" rel="noopener noreferrer" className="text-on-surface hover:text-primary-container transition-none">{record.billTitle}</a> : record.billTitle}
                                </div>
                                <div className="flex items-center gap-3 font-label text-[0.6rem] text-on-surface/30 flex-wrap">
                                  {record.voteDate && <span>{new Date(record.voteDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}</span>}
                                  {record.billNumber && <><span className="w-1 h-1 bg-outline-variant/40 rounded-full" /><span>{record.billNumber}</span></>}
                                  {record.category && <><span className="w-1 h-1 bg-outline-variant/40 rounded-full" /><span className="text-secondary/60">CATEGORY: {record.category.toUpperCase()}</span></>}
                                  {record.chamber && <><span className="w-1 h-1 bg-outline-variant/40 rounded-full" /><span>{record.chamber}</span></>}
                                  <span className="w-1 h-1 bg-outline-variant/40 rounded-full" /><span>src: {record.source}</span>
                                </div>
                                {record.billDescription && <div className="font-label text-[0.65rem] text-on-surface/40 leading-relaxed mt-1">{record.billDescription.length > 250 ? record.billDescription.substring(0, 250) + '...' : record.billDescription}</div>}
                              </div>
                              <div className="px-4 py-1 font-label font-bold text-[0.7rem] flex-shrink-0 ml-4" style={{ background: posColor, color: '#000' }}>{posLabel}</div>
                            </div>
                          ); })}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="p-3 bg-primary-container/5 border border-primary-container/10 font-label text-[0.6rem] flex items-center gap-2 flex-wrap">
                    <span className="text-primary-container font-bold">DATA_SOURCE</span>
                    <span className="text-on-surface/40">{isFederal ? `Congress.gov / Supabase | Bioguide: ${politician.source_ids?.bioguide_id}` : `LegiScan | State: ${politician.jurisdiction || 'FL'}`}{` | ${votingRecords.length} records loaded`}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Network / Connections Tab */}
          {activeTab === 'network' && (
            <ConnectionsTree politician={politician} />
          )}

          {/* Social / News Tab */}
          {activeTab === 'social' && (
            <SocialTab politicianId={politician.id} politicianName={politician.name} />
          )}

          {/* Legal tab not yet available */}
          {activeTab === 'legal' && (
            <div className="bg-surface-container-low p-16 border border-outline-variant/10 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-surface-container-high border border-outline-variant/10 flex items-center justify-center">
                <span className="font-headline text-2xl text-on-surface/30">--</span>
              </div>
              <div className="font-headline font-bold text-lg text-on-surface/60 mb-2">NOT YET AVAILABLE</div>
              <div className="font-label text-[0.7rem] text-on-surface/40">Court cases, ethics complaints, and legal records will appear here when data sources are integrated.</div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 w-full z-40 py-2 px-6 flex justify-between items-center bg-black/80 border-t border-primary-container/5">
        <div className="font-label text-[0.65rem] text-primary-container/50">
          DATA SYNC: REAL-TIME // FEC SOURCE CITATIONS ENABLED
          {politician.lastUpdated && (
            <span> // LAST UPDATED: {new Date(politician.lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          )}
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Social Tab Component — fetches posts for this politician
// ---------------------------------------------------------------------------

function SocialTab({ politicianId, politicianName }: { politicianId: string; politicianName: string }) {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/social-posts?politician_id=${encodeURIComponent(politicianId)}&limit=50&order=desc`)
      .then(res => res.ok ? res.json() : { posts: [] })
      .then(data => setPosts(data.posts || []))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, [politicianId]);

  if (loading) {
    return (
      <div className="bg-surface-container-low p-6 border border-outline-variant/10" style={{ textAlign: 'center', padding: '3rem' }}>
        <div style={{ color: 'var(--terminal-text-dim)' }}>Loading social intelligence...</div>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="bg-surface-container-low p-6 border border-outline-variant/10" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📡</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--terminal-text-dim)' }}>
          NO SOCIAL INTELLIGENCE
        </div>
        <div style={{ color: 'var(--terminal-text-dim)' }}>
          No news mentions, press releases, or social media posts found for {politicianName}.
        </div>
      </div>
    );
  }

  const platformIcon = (p: string) => {
    switch (p) {
      case 'news': return '📰';
      case 'press': return '🏛️';
      case 'rss': return '📡';
      case 'twitter': return '𝕏';
      default: return '📄';
    }
  };

  const platformLabel = (p: string) => {
    switch (p) {
      case 'news': return 'NEWS';
      case 'press': return 'PRESS RELEASE';
      case 'rss': return 'RSS';
      case 'twitter': return 'TWITTER/X';
      default: return p.toUpperCase();
    }
  };

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <div className="bg-surface-container-low p-6 border border-outline-variant/10">
        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--terminal-amber)' }}>
          📡 SOCIAL INTELLIGENCE
        </h3>
        <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginBottom: '1.5rem' }}>
          {posts.length} items from news mentions, press releases, and public statements
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {posts.map((post, i) => (
            <div key={post.id || i} style={{
              padding: '1rem',
              background: 'rgba(156, 163, 175, 0.05)',
              border: '1px solid var(--terminal-border)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--terminal-cyan)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {platformIcon(post.platform)} {platformLabel(post.platform)}
                </span>
                {post.posted_at && (
                  <span style={{ fontSize: '0.65rem', color: 'var(--terminal-text-dim)' }}>
                    {new Date(post.posted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.85rem', lineHeight: 1.5, color: 'var(--terminal-text)' }}>
                {(post.content || '').substring(0, 300)}
                {(post.content || '').length > 300 ? '...' : ''}
              </div>
              {post.post_url && (
                <a href={post.post_url} target="_blank" rel="noopener noreferrer" style={{
                  display: 'inline-block',
                  marginTop: '0.5rem',
                  fontSize: '0.7rem',
                  color: 'var(--terminal-blue)',
                  textDecoration: 'none',
                }}>
                  VIEW SOURCE →
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connections Tree — Interactive network visualization
// ---------------------------------------------------------------------------

interface TreeNode {
  id: string;
  label: string;
  sublabel?: string;
  amount?: number;
  color: string;
  icon: string;
  children?: TreeNode[];
  tag?: string;
}

function formatAmount(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function ConnectionsTree({ politician }: { politician: Politician }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['root', 'funding', 'lobbying']));

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    const allIds: string[] = ['root'];
    const collect = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        allIds.push(n.id);
        if (n.children) collect(n.children);
      }
    };
    collect(tree);
    setExpanded(new Set(allIds));
  };

  const collapseAll = () => setExpanded(new Set(['root']));

  // Build the tree from politician data
  const tree: TreeNode[] = [];

  // --- FUNDING SOURCES ---
  const donors = politician.top5Donors || [];
  const breakdown = politician.contributionBreakdown;
  const fundingChildren: TreeNode[] = [];

  if (breakdown) {
    if (breakdown.individuals > 0) {
      const indivDonors = donors.filter(d => d.type === 'Individual');
      fundingChildren.push({
        id: 'funding-individuals',
        label: 'Individual Donors',
        amount: breakdown.individuals,
        color: 'var(--terminal-green)',
        icon: '👤',
        children: indivDonors.map((d, i) => ({
          id: `donor-indiv-${i}`,
          label: d.name,
          amount: d.amount,
          color: 'var(--terminal-green)',
          icon: '·',
        })),
      });
    }
    if (breakdown.otherPACs > 0) {
      const pacDonors = donors.filter(d => d.type === 'PAC');
      fundingChildren.push({
        id: 'funding-pacs',
        label: 'Political Action Committees',
        amount: breakdown.otherPACs,
        color: 'var(--terminal-amber)',
        icon: '🏛️',
        children: pacDonors.map((d, i) => ({
          id: `donor-pac-${i}`,
          label: d.name,
          amount: d.amount,
          color: 'var(--terminal-amber)',
          icon: '·',
        })),
      });
    }
    if (breakdown.corporate > 0) {
      const corpDonors = donors.filter(d => d.type === 'Corporate');
      fundingChildren.push({
        id: 'funding-corporate',
        label: 'Corporate Donors',
        amount: breakdown.corporate,
        color: '#60a5fa',
        icon: '🏢',
        children: corpDonors.map((d, i) => ({
          id: `donor-corp-${i}`,
          label: d.name,
          amount: d.amount,
          color: '#60a5fa',
          icon: '·',
        })),
      });
    }
    if (breakdown.aipac > 0 || (politician.israelLobbyTotal || 0) > 0) {
      const israelDonors = donors.filter(d => d.type === 'Israel-PAC' || (d as any).is_israel_lobby);
      const ieDetails = politician.israelLobbyBreakdown?.ie_details || [];
      const israelChildren: TreeNode[] = [
        ...israelDonors.map((d, i) => ({
          id: `donor-israel-${i}`,
          label: d.name,
          amount: d.amount,
          color: '#ef4444',
          icon: '·',
          tag: 'DIRECT',
        })),
        ...ieDetails.map((ie, i) => ({
          id: `ie-israel-${i}`,
          label: ie.committee_name,
          sublabel: ie.support_oppose === 'support' ? 'SUPPORTED' : 'OPPOSED',
          amount: ie.amount,
          color: '#ef4444',
          icon: ie.support_oppose === 'support' ? '+' : '-',
          tag: 'IE',
        })),
      ];
      fundingChildren.push({
        id: 'funding-israel',
        label: 'Israel Lobby',
        amount: politician.israelLobbyTotal || breakdown.aipac,
        color: '#ef4444',
        icon: '🇮🇱',
        children: israelChildren.length > 0 ? israelChildren : undefined,
      });
    }
  } else if (donors.length > 0) {
    for (const [i, d] of donors.entries()) {
      fundingChildren.push({
        id: `donor-${i}`,
        label: d.name,
        amount: d.amount,
        color: d.type === 'Israel-PAC' ? '#ef4444' : 'var(--terminal-amber)',
        icon: d.type === 'PAC' ? '🏛️' : d.type === 'Corporate' ? '🏢' : '👤',
        tag: d.type,
      });
    }
  }

  if (fundingChildren.length > 0) {
    tree.push({
      id: 'funding',
      label: 'CAMPAIGN FUNDING',
      amount: politician.totalFundsRaised,
      color: 'var(--terminal-amber)',
      icon: '💰',
      children: fundingChildren,
    });
  }

  // --- LOBBYING CONNECTIONS ---
  const lobbyRecords = politician.lobbyingRecords || [];
  if (lobbyRecords.length > 0) {
    // Group by registrant (lobbying firm)
    const byFirm: Record<string, { income: number; clients: Set<string>; revolvingDoor: string[]; years: Set<number> }> = {};
    for (const r of lobbyRecords as any[]) {
      const firm = r.registrantName || 'Unknown';
      if (!byFirm[firm]) byFirm[firm] = { income: 0, clients: new Set(), revolvingDoor: [], years: new Set() };
      byFirm[firm].income += r.income || 0;
      if (r.clientName) byFirm[firm].clients.add(r.clientName);
      if (r.filingYear) byFirm[firm].years.add(r.filingYear);
      if (r.revolvingDoor) {
        for (const rd of r.revolvingDoor) {
          if (!byFirm[firm].revolvingDoor.includes(rd)) byFirm[firm].revolvingDoor.push(rd);
        }
      }
    }

    const firmNodes: TreeNode[] = Object.entries(byFirm)
      .sort((a, b) => b[1].income - a[1].income)
      .slice(0, 25)
      .map(([firm, data], i) => {
        const children: TreeNode[] = [];
        // Clients
        for (const client of [...data.clients].slice(0, 10)) {
          if (client !== firm) {
            children.push({ id: `lobby-client-${i}-${children.length}`, label: client, color: '#a78bfa', icon: '·', tag: 'CLIENT' });
          }
        }
        // Revolving door
        for (const rd of data.revolvingDoor.slice(0, 5)) {
          children.push({ id: `lobby-rd-${i}-${children.length}`, label: rd.substring(0, 80), color: '#f97316', icon: '🔄', tag: 'REVOLVING DOOR' });
        }
        return {
          id: `lobby-firm-${i}`,
          label: firm,
          sublabel: `${data.clients.size} clients | ${[...data.years].sort().join(', ')}`,
          amount: data.income,
          color: '#a78bfa',
          icon: '🏛️',
          children: children.length > 0 ? children : undefined,
        };
      });

    const totalLobbyIncome = Object.values(byFirm).reduce((s, d) => s + d.income, 0);
    const totalRevDoor = Object.values(byFirm).reduce((s, d) => s + d.revolvingDoor.length, 0);

    tree.push({
      id: 'lobbying',
      label: 'LOBBYING CONNECTIONS',
      sublabel: `${Object.keys(byFirm).length} firms | ${totalRevDoor} revolving door`,
      amount: totalLobbyIncome,
      color: '#a78bfa',
      icon: '🔗',
      children: firmNodes,
    });
  }

  // --- INDEPENDENT EXPENDITURES ---
  const ieDetails = politician.israelLobbyBreakdown?.ie_details || [];
  if (ieDetails.length > 0) {
    const ieNodes: TreeNode[] = ieDetails
      .sort((a, b) => b.amount - a.amount)
      .map((ie, i) => ({
        id: `ie-${i}`,
        label: ie.committee_name,
        sublabel: ie.committee_id,
        amount: ie.amount,
        color: ie.support_oppose === 'support' ? 'var(--terminal-green)' : '#ef4444',
        icon: ie.support_oppose === 'support' ? '✓' : '✗',
        tag: ie.is_israel_lobby ? 'ISRAEL LOBBY' : ie.support_oppose === 'support' ? 'SUPPORT' : 'OPPOSE',
      }));

    tree.push({
      id: 'ie',
      label: 'INDEPENDENT EXPENDITURES',
      sublabel: 'Third-party spending for/against',
      amount: ieDetails.reduce((s, ie) => s + ie.amount, 0),
      color: 'var(--terminal-cyan)',
      icon: '📡',
      children: ieNodes,
    });
  }

  // No data at all
  if (tree.length === 0) {
    return (
      <div className="bg-surface-container-low p-6 border border-outline-variant/10" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🔗</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--terminal-text-dim)' }}>
          NO CONNECTIONS DATA
        </div>
        <div style={{ color: 'var(--terminal-text-dim)' }}>
          {['US Senator', 'US Representative'].includes(politician.officeLevel)
            ? 'Connection data is being processed for this politician.'
            : 'Connection mapping is available for federal politicians with campaign finance and lobbying data.'}
        </div>
      </div>
    );
  }

  // Render tree
  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button className="bg-primary-container px-4 py-2 font-label text-[0.7rem] font-bold text-on-primary hover:bg-primary-fixed-dim transition-none uppercase tracking-wider" onClick={expandAll} style={{ padding: '0.4rem 0.75rem', fontSize: '0.7rem' }}>EXPAND ALL</button>
        <button className="bg-primary-container px-4 py-2 font-label text-[0.7rem] font-bold text-on-primary hover:bg-primary-fixed-dim transition-none uppercase tracking-wider" onClick={collapseAll} style={{ padding: '0.4rem 0.75rem', fontSize: '0.7rem' }}>COLLAPSE ALL</button>
      </div>

      {/* Root node */}
      <div className="bg-surface-container-low p-6 border border-outline-variant/10" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Politician header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          background: 'rgba(0, 191, 255, 0.1)',
          borderBottom: '2px solid var(--terminal-blue)',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
        }}>
          <div style={{
            width: '40px', height: '40px',
            border: '2px solid var(--terminal-blue)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.25rem', fontWeight: 700, color: 'var(--terminal-blue)',
            fontFamily: 'Bebas Neue, sans-serif', flexShrink: 0,
          }}>
            {politician.name.charAt(0)}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--terminal-text)' }}>{politician.name}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dim)' }}>{politician.office} | {politician.party}</div>
          </div>
        </div>

        {/* Tree branches */}
        <div style={{ padding: '0.5rem 0' }}>
          {tree.map((branch, bi) => (
            <TreeBranch key={branch.id} node={branch} depth={0} expanded={expanded} toggle={toggle} isLast={bi === tree.length - 1} />
          ))}
        </div>
      </div>

      {/* Glossary */}
      <div className="bg-surface-container-low p-6 border border-outline-variant/10" style={{ marginTop: '1.5rem' }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--terminal-amber)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          📖 GLOSSARY
        </h3>
        <div style={{ display: 'grid', gap: '0.75rem', fontSize: '0.8rem' }}>
          <div>
            <span style={{ fontWeight: 700, color: '#a78bfa' }}>🔄 Revolving Door</span>
            <span style={{ color: 'var(--terminal-text-dim)', marginLeft: '0.5rem' }}>
              — A lobbyist who previously worked for the politician (or their office) and now lobbies them on behalf of private clients. This creates a direct personal connection between the lobbying firm and the politician&apos;s inner circle.
            </span>
          </div>
          <div>
            <span style={{ fontWeight: 700, color: 'var(--terminal-amber)' }}>🏛️ PAC (Political Action Committee)</span>
            <span style={{ color: 'var(--terminal-text-dim)', marginLeft: '0.5rem' }}>
              — An organization that pools campaign contributions from members and donates to campaigns. Super PACs can raise unlimited funds for independent expenditures but cannot coordinate directly with candidates.
            </span>
          </div>
          <div>
            <span style={{ fontWeight: 700, color: 'var(--terminal-cyan)' }}>📡 Independent Expenditure (IE)</span>
            <span style={{ color: 'var(--terminal-text-dim)', marginLeft: '0.5rem' }}>
              — Money spent by outside groups to support or oppose a candidate without coordinating with their campaign. Often used by Super PACs and dark money groups to influence elections.
            </span>
          </div>
          <div>
            <span style={{ fontWeight: 700, color: '#ef4444' }}>🇮🇱 Israel Lobby</span>
            <span style={{ color: 'var(--terminal-text-dim)', marginLeft: '0.5rem' }}>
              — PACs, Super PACs, and organizations affiliated with pro-Israel advocacy groups (e.g., AIPAC, United Democracy Project, Democratic Majority for Israel). Tracked separately due to significant influence on US foreign policy.
            </span>
          </div>
          <div>
            <span style={{ fontWeight: 700, color: '#a78bfa' }}>🏛️ Lobbying Firm / Registrant</span>
            <span style={{ color: 'var(--terminal-text-dim)', marginLeft: '0.5rem' }}>
              — A company or individual registered under the Lobbying Disclosure Act (LDA) to influence government decisions on behalf of paying clients. They must file quarterly reports disclosing their activities.
            </span>
          </div>
          <div>
            <span style={{ fontWeight: 700, color: '#a78bfa' }}>CLIENT</span>
            <span style={{ color: 'var(--terminal-text-dim)', marginLeft: '0.5rem' }}>
              — The corporation, trade association, or entity that hired the lobbying firm to advocate on their behalf. The client pays the firm; the firm contacts the politician.
            </span>
          </div>
          <div>
            <span style={{ fontWeight: 700, color: 'var(--terminal-green)' }}>👤 Individual Donor</span>
            <span style={{ color: 'var(--terminal-text-dim)', marginLeft: '0.5rem' }}>
              — A person who contributed directly to the politician&apos;s campaign. Federal law limits individual contributions to $3,300 per election cycle.
            </span>
          </div>
          <div>
            <span style={{ fontWeight: 700, color: '#60a5fa' }}>🏢 Corporate Donor</span>
            <span style={{ color: 'var(--terminal-text-dim)', marginLeft: '0.5rem' }}>
              — Contributions from corporations, LLCs, or business entities. At the federal level, direct corporate contributions are banned — they flow through PACs instead. Florida state elections allow direct corporate contributions.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TreeBranch({ node, depth, expanded, toggle, isLast }: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
  isLast: boolean;
}) {
  const isOpen = expanded.has(node.id);
  const hasChildren = node.children && node.children.length > 0;
  const indent = depth * 24;

  return (
    <div>
      <div
        onClick={() => hasChildren && toggle(node.id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.6rem 1rem',
          paddingLeft: `${indent + 16}px`,
          cursor: hasChildren ? 'pointer' : 'default',
          borderLeft: depth > 0 ? `1px solid var(--terminal-border)` : 'none',
          marginLeft: depth > 0 ? `${(depth - 1) * 24 + 28}px` : 0,
          transition: 'background 0.15s',
          ...(hasChildren ? {} : {}),
        }}
        onMouseEnter={e => { if (hasChildren) (e.currentTarget as HTMLElement).style.background = 'rgba(0,191,255,0.05)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        {/* Expand/collapse indicator */}
        <span style={{ width: '14px', fontSize: '0.7rem', color: 'var(--terminal-text-dim)', textAlign: 'center', flexShrink: 0 }}>
          {hasChildren ? (isOpen ? '▼' : '▶') : (depth > 0 ? (isLast ? '└' : '├') : '')}
        </span>

        {/* Icon */}
        <span style={{ fontSize: depth === 0 ? '1rem' : '0.8rem', flexShrink: 0 }}>{node.icon}</span>

        {/* Label */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            fontWeight: depth === 0 ? 700 : 600,
            fontSize: depth === 0 ? '0.9rem' : '0.8rem',
            color: depth === 0 ? node.color : 'var(--terminal-text)',
            letterSpacing: depth === 0 ? '0.05em' : 'normal',
          }}>
            {node.label}
          </span>
          {node.sublabel && (
            <span style={{ fontSize: '0.65rem', color: 'var(--terminal-text-dim)', marginLeft: '0.5rem' }}>
              {node.sublabel}
            </span>
          )}
          {node.tag && (
            <span style={{
              fontSize: '0.55rem',
              padding: '1px 4px',
              marginLeft: '0.5rem',
              background: `${node.color}20`,
              color: node.color,
              border: `1px solid ${node.color}40`,
              fontWeight: 700,
              letterSpacing: '0.05em',
              verticalAlign: 'middle',
            }}>
              {node.tag}
            </span>
          )}
        </div>

        {/* Amount */}
        {node.amount != null && node.amount > 0 && (
          <span style={{
            fontWeight: 700,
            fontFamily: 'Bebas Neue, sans-serif',
            fontSize: depth === 0 ? '1.1rem' : '0.9rem',
            color: node.color,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            {formatAmount(node.amount)}
          </span>
        )}

        {/* Child count badge */}
        {hasChildren && (
          <span style={{
            fontSize: '0.6rem',
            padding: '1px 5px',
            background: 'var(--terminal-surface)',
            border: '1px solid var(--terminal-border)',
            color: 'var(--terminal-text-dim)',
            borderRadius: '2px',
            flexShrink: 0,
          }}>
            {node.children!.length}
          </span>
        )}
      </div>

      {/* Children */}
      {isOpen && hasChildren && (
        <div>
          {node.children!.map((child, ci) => (
            <TreeBranch
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
              isLast={ci === node.children!.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

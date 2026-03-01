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
        const res = await fetch('/api/politicians');
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const allPoliticians: Politician[] = await res.json();
        const found = allPoliticians.find(p => p.id === params.id);
        setPolitician(found || null);
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
    if (norm === 'YEA' || norm === 'SPONSOR') return 'var(--terminal-green)';
    if (norm === 'NAY') return 'var(--terminal-red)';
    if (norm === 'ABSTAIN') return 'var(--terminal-amber)';
    return 'var(--terminal-text-dim)';
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
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'white' }}>Loading...</div>;
  }

  if (!politician) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--terminal-bg)', color: 'var(--terminal-text)' }}>
        <div className="terminal-title">
          <div>
            <h1>🔍 POLITICIAN NOT FOUND</h1>
            <div className="terminal-subtitle">
              Record Does Not Exist in Database
            </div>
          </div>
        </div>
        <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>⚠️</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem' }}>
            RECORD NOT FOUND
          </div>
          <Link href="/" style={{ 
            display: 'inline-block',
            padding: '1rem 2rem',
            background: 'var(--terminal-amber)',
            color: '#000',
            textDecoration: 'none',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            fontSize: '0.875rem',
            fontFamily: 'JetBrains Mono, monospace',
          }}>
            ← RETURN TO DATABASE
          </Link>
        </div>
      </div>
    );
  }

  const getScoreColor = (score: number) => {
    if (score < 40) return 'var(--terminal-green)';
    if (score < 60) return 'var(--terminal-amber)';
    return 'var(--terminal-red)';
  };

  const getJuiceBoxLabel = (tier: string) => {
    if (tier === 'owned') return '👑 FULLY OWNED';
    if (tier === 'bought') return '💰 BOUGHT & PAID FOR';
    if (tier === 'compromised') return '💸 COMPROMISED';
    return 'CLEAN';
  };

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A': return '#10b981';
      case 'B': return '#22c55e';
      case 'C': return '#f59e0b';
      case 'D': return '#ef4444';
      case 'F': return '#dc2626';
      default: return '#6b7280';
    }
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high': return '#10b981';
      case 'medium': return '#f59e0b';
      case 'low': return '#6b7280';
      default: return '#6b7280';
    }
  };

  const tabs = [
    { id: 'overview', label: 'OVERVIEW', icon: '📋' },
    { id: 'score', label: 'CORRUPTION SCORE', icon: '🎯' },
    { id: 'funding', label: 'FUNDING & FINANCIAL', icon: '💰' },
    { id: 'legal', label: 'LEGAL & COURT RECORDS', icon: '⚖️' },
    { id: 'votes', label: 'VOTING & POLICY', icon: '🗳️' },
    { id: 'social', label: 'SOCIAL MEDIA', icon: '📱' },
    { id: 'network', label: 'CONNECTIONS', icon: '🔗' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--terminal-bg)', color: 'var(--terminal-text)' }}>
      {/* Terminal Title */}
      <div className="terminal-title">
        <div>
          <h1>🎯 DOSSIER: {politician.name.toUpperCase()}</h1>
          <div className="terminal-subtitle">
            {politician.office} • {politician.party === 'Republican' ? '🐘 Republican' : politician.party === 'Democrat' ? '🫏 Democrat' : politician.party} • {politician.district || politician.jurisdiction}
          </div>
        </div>
      </div>

      {/* Alert */}
      <div style={{ padding: '2rem', borderBottom: '1px solid var(--terminal-border)' }}>
        <div className="alert-level">
          <span className="alert-icon">
            {politician.corruptionScore >= 60 ? '🚨' : politician.corruptionScore >= 40 ? '⚠️' : '✓'}
          </span>
          <span>
            CORRUPTION SCORE: {politician.corruptionScore}/100 — GRADE {politician.corruptionScoreDetails?.grade ?? '--'} — {
              politician.corruptionScore <= 20 ? 'LOW RISK' :
              politician.corruptionScore <= 40 ? 'MODERATE' :
              politician.corruptionScore <= 60 ? 'ELEVATED' :
              politician.corruptionScore <= 80 ? 'HIGH RISK' :
              'SEVERE'
            }
          </span>
          <span style={{ fontSize: '0.875rem', color: 'var(--terminal-text-dim)', marginLeft: '1rem' }}>
            {politician.corruptionScoreDetails?.confidence
              ? `${politician.corruptionScoreDetails.confidence.toUpperCase()} CONFIDENCE (${politician.corruptionScoreDetails.dataCompleteness}% data)`
              : ''}
            {politician.juiceBoxTier !== 'none'
              ? ` | ${getJuiceBoxLabel(politician.juiceBoxTier)} - $${(politician.aipacFunding / 1000).toFixed(0)}K AIPAC`
              : ''}
          </span>
        </div>
      </div>

      <div style={{ padding: '2rem' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          {/* Back Button */}
          <Link 
            href="/browse" 
            style={{ 
              display: 'inline-block',
              marginBottom: '2rem',
              color: 'var(--terminal-amber)',
              textDecoration: 'none',
              fontSize: '0.875rem',
              fontFamily: 'JetBrains Mono, monospace',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            ← BACK TO DATABASE
          </Link>

          {/* Profile Header Card */}
          <div className="terminal-card" style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', gap: '2rem', alignItems: 'start' }}>
              {/* Initial/Photo */}
              <div 
                style={{
                  width: '120px',
                  height: '120px',
                  border: `3px solid ${getScoreColor(politician.corruptionScore)}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '4rem',
                  fontWeight: 700,
                  color: getScoreColor(politician.corruptionScore),
                  flexShrink: 0,
                  fontFamily: 'Bebas Neue, sans-serif',
                }}
              >
                {politician.name.charAt(0)}
              </div>

              {/* Details */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: '0.875rem',
                    padding: '0.5rem 1rem',
                    background: politician.party === 'Republican' ? '#dc2626' : politician.party === 'Democrat' ? '#2563eb' : '#6b7280',
                    color: '#fff',
                    borderRadius: '12px',
                    fontWeight: 600,
                  }}>
                    {politician.party === 'Republican' ? '🐘 Republican' : politician.party === 'Democrat' ? '🫏 Democrat' : politician.party}
                  </span>
                  {politician.juiceBoxTier !== 'none' && (
                    <span className={`tag tag-${politician.juiceBoxTier.replace('_', '-')}`}>
                      {getJuiceBoxLabel(politician.juiceBoxTier)}
                    </span>
                  )}
                  {politician.tags.map((tag, idx) => (
                    <span 
                      key={idx}
                      style={{
                        fontSize: '0.625rem',
                        padding: '0.25rem 0.5rem',
                        background: `${tag.color}20`,
                        color: tag.color,
                        border: `1px solid ${tag.color}`,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {tag.label}
                    </span>
                  ))}
                </div>

                {/* Stats Grid */}
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                  gap: '1rem',
                  marginTop: '1.5rem',
                }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      Corruption Score
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                      <span style={{ fontSize: '2rem', fontWeight: 700, color: getScoreColor(politician.corruptionScore), fontFamily: 'Bebas Neue, sans-serif' }}>
                        {politician.corruptionScore}/100
                      </span>
                      {politician.corruptionScoreDetails?.grade && (
                        <span style={{
                          fontSize: '1.5rem',
                          fontWeight: 700,
                          color: getGradeColor(politician.corruptionScoreDetails.grade),
                          fontFamily: 'Bebas Neue, sans-serif',
                        }}>
                          {politician.corruptionScoreDetails.grade}
                        </span>
                      )}
                    </div>
                    {politician.corruptionScoreDetails?.confidence && (
                      <div style={{
                        fontSize: '0.6rem',
                        color: getConfidenceColor(politician.corruptionScoreDetails.confidence),
                        marginTop: '0.25rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}>
                        {politician.corruptionScoreDetails.confidence} confidence
                      </div>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      AIPAC Funding
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 700, color: politician.aipacFunding > 0 ? 'var(--terminal-red)' : 'var(--terminal-green)', fontFamily: 'Bebas Neue, sans-serif' }}>
                      ${(politician.aipacFunding / 1000).toFixed(0)}K
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      Years in Office
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'Bebas Neue, sans-serif' }}>
                      {politician.yearsInOffice}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      Status
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: politician.isActive ? 'var(--terminal-green)' : 'var(--terminal-text-dim)' }}>
                      {politician.isActive ? '● ACTIVE' : '○ INACTIVE'}
                    </div>
                  </div>
                </div>

                {/* Data Source Badge */}
                {politician.dataStatus && (
                  <div style={{ 
                    marginTop: '1.5rem',
                    padding: '0.75rem',
                    background: politician.dataStatus === 'live' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                    border: `1px solid ${politician.dataStatus === 'live' ? '#10b981' : '#f59e0b'}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{
                        fontSize: '0.625rem',
                        color: politician.dataStatus === 'live' ? '#10b981' : '#f59e0b',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                      }}>
                          {politician.dataStatus === 'live' ? '✓ LIVE DATA' : '⚠ MOCK DATA'}
                        {politician.dataSource && (
                          <span style={{ marginLeft: '0.5rem', fontWeight: 400, fontSize: '0.6rem', color: 'var(--terminal-text-dim)' }}>
                            — {politician.dataSource}
                          </span>
                        )}
                      </span>
                      {politician.lastUpdated && (
                        <span style={{
                          fontSize: '0.625rem',
                          color: 'var(--terminal-text-dim)',
                          textTransform: 'uppercase',
                        }}>
                          Last Updated: {new Date(politician.lastUpdated).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div style={{ 
            display: 'flex', 
            gap: '0.5rem', 
            marginBottom: '2rem',
            overflowX: 'auto',
            borderBottom: '2px solid var(--terminal-border)',
          }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '1rem 1.5rem',
                  background: activeTab === tab.id ? 'var(--terminal-amber)' : 'transparent',
                  border: 'none',
                  borderBottom: activeTab === tab.id ? '2px solid var(--terminal-amber)' : '2px solid transparent',
                  color: activeTab === tab.id ? '#000' : 'var(--terminal-text)',
                  fontSize: '0.875rem',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== tab.id) {
                    e.currentTarget.style.background = 'var(--terminal-bg)';
                    e.currentTarget.style.color = 'var(--terminal-amber)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== tab.id) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--terminal-text)';
                  }
                }}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === 'overview' && (
            <div>
              <div className="terminal-card" style={{ marginBottom: '2rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--terminal-amber)' }}>
                  📋 BIOGRAPHICAL INFORMATION
                </h3>
                <p style={{ lineHeight: 1.7, color: 'var(--terminal-text)', marginBottom: '1rem' }}>
                  {politician.bio || `${politician.name} serves as ${politician.office} representing ${politician.district || politician.jurisdiction}.`}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '0.75rem', fontSize: '0.875rem' }}>
                  <div style={{ color: 'var(--terminal-text-dim)' }}>Office:</div>
                  <div>{politician.office}</div>
                  <div style={{ color: 'var(--terminal-text-dim)' }}>Jurisdiction:</div>
                  <div>{politician.district || politician.jurisdiction}</div>
                  <div style={{ color: 'var(--terminal-text-dim)' }}>Party:</div>
                  <div>{politician.party}</div>
                  <div style={{ color: 'var(--terminal-text-dim)' }}>Term Start:</div>
                  <div>{politician.termStart}</div>
                  {politician.termEnd && (
                    <>
                      <div style={{ color: 'var(--terminal-text-dim)' }}>Term End:</div>
                      <div>{politician.termEnd}</div>
                    </>
                  )}
                </div>
              </div>

              {/* Social Media */}
              {politician.socialMedia && Object.keys(politician.socialMedia).length > 0 && (
                <div className="terminal-card">
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--terminal-amber)' }}>
                    📱 SOCIAL MEDIA ACCOUNTS
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem' }}>
                    {politician.socialMedia.twitterHandle && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{ color: 'var(--terminal-text-dim)', width: '100px' }}>Twitter:</span>
                        <a href={`https://twitter.com/${politician.socialMedia.twitterHandle}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--terminal-amber)', textDecoration: 'none' }}>
                          @{politician.socialMedia.twitterHandle}
                        </a>
                      </div>
                    )}
                    {politician.socialMedia.facebookPageUrl && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{ color: 'var(--terminal-text-dim)', width: '100px' }}>Facebook:</span>
                        <a href={politician.socialMedia.facebookPageUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--terminal-amber)', textDecoration: 'none' }}>
                          Page
                        </a>
                      </div>
                    )}
                    {politician.socialMedia.instagramHandle && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{ color: 'var(--terminal-text-dim)', width: '100px' }}>Instagram:</span>
                        <a href={`https://instagram.com/${politician.socialMedia.instagramHandle}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--terminal-amber)', textDecoration: 'none' }}>
                          @{politician.socialMedia.instagramHandle}
                        </a>
                      </div>
                    )}
                    {politician.socialMedia.youtubeChannelId && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{ color: 'var(--terminal-text-dim)', width: '100px' }}>YouTube:</span>
                        <a href={`https://youtube.com/channel/${politician.socialMedia.youtubeChannelId}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--terminal-amber)', textDecoration: 'none' }}>
                          Channel
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Corruption Score Breakdown Tab */}
          {activeTab === 'score' && (
            <div>
              {/* Score Summary Card */}
              <div className="terminal-card" style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* Big Score Circle */}
                  <div style={{
                    width: '120px',
                    height: '120px',
                    borderRadius: '50%',
                    border: `4px solid ${getScoreColor(politician.corruptionScore)}`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <span style={{
                      fontSize: '2.5rem',
                      fontWeight: 700,
                      color: getScoreColor(politician.corruptionScore),
                      fontFamily: 'Bebas Neue, sans-serif',
                      lineHeight: 1,
                    }}>
                      {politician.corruptionScore}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)' }}>/100</span>
                  </div>

                  {/* Grade + Confidence */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
                      {politician.corruptionScoreDetails?.grade && (
                        <span style={{
                          fontSize: '3rem',
                          fontWeight: 700,
                          color: getGradeColor(politician.corruptionScoreDetails.grade),
                          fontFamily: 'Bebas Neue, sans-serif',
                          lineHeight: 1,
                        }}>
                          {politician.corruptionScoreDetails.grade}
                        </span>
                      )}
                      <div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--terminal-text)' }}>
                          {politician.corruptionScore <= 20 ? 'LOW RISK' :
                           politician.corruptionScore <= 40 ? 'MODERATE RISK' :
                           politician.corruptionScore <= 60 ? 'ELEVATED RISK' :
                           politician.corruptionScore <= 80 ? 'HIGH RISK' :
                           'SEVERE RISK'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginTop: '0.25rem' }}>
                          Score computed from 5 weighted factors using available data
                        </div>
                      </div>
                    </div>
                    {politician.corruptionScoreDetails?.confidence && (
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.4rem 0.8rem',
                        background: `${getConfidenceColor(politician.corruptionScoreDetails.confidence)}15`,
                        border: `1px solid ${getConfidenceColor(politician.corruptionScoreDetails.confidence)}`,
                      }}>
                        <span style={{
                          width: '8px', height: '8px', borderRadius: '50%',
                          background: getConfidenceColor(politician.corruptionScoreDetails.confidence),
                        }} />
                        <span style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          color: getConfidenceColor(politician.corruptionScoreDetails.confidence),
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}>
                          {politician.corruptionScoreDetails.confidence} confidence — {politician.corruptionScoreDetails.dataCompleteness}% data coverage
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Factor Breakdown */}
              <div className="terminal-card" style={{ marginBottom: '2rem' }}>
                <h3 style={{
                  fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem',
                  color: 'var(--terminal-amber)',
                  fontFamily: 'JetBrains Mono, monospace',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  SCORE FACTOR BREAKDOWN
                </h3>

                {politician.corruptionScoreDetails?.factors ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {[...politician.corruptionScoreDetails.factors]
                      .sort((a, b) => b.weightedScore - a.weightedScore)
                      .map((factor) => (
                      <div key={factor.key} style={{
                        padding: '1.25rem',
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid var(--terminal-border)',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{
                              fontSize: '0.875rem', fontWeight: 700,
                              color: 'var(--terminal-text)',
                              fontFamily: 'JetBrains Mono, monospace',
                            }}>
                              {factor.label}
                            </span>
                            <span style={{
                              fontSize: '0.6rem',
                              padding: '0.15rem 0.4rem',
                              background: factor.dataAvailable ? 'rgba(16, 185, 129, 0.15)' : 'rgba(107, 114, 128, 0.15)',
                              color: factor.dataAvailable ? '#10b981' : '#6b7280',
                              border: `1px solid ${factor.dataAvailable ? '#10b981' : '#6b7280'}`,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                            }}>
                              {factor.dataAvailable ? 'REAL DATA' : 'PLACEHOLDER'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                            <span style={{
                              fontSize: '1.5rem', fontWeight: 700,
                              color: getScoreColor(factor.rawScore),
                              fontFamily: 'Bebas Neue, sans-serif',
                            }}>
                              {factor.rawScore}
                            </span>
                            <span style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dim)' }}>
                              /100 x{(factor.weight * 100).toFixed(0)}% = {factor.weightedScore.toFixed(1)}
                            </span>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div style={{
                          width: '100%', height: '6px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          marginBottom: '0.5rem',
                        }}>
                          <div style={{
                            width: `${factor.rawScore}%`, height: '100%',
                            background: getScoreColor(factor.rawScore),
                            transition: 'width 0.3s ease',
                          }} />
                        </div>

                        <div style={{
                          fontSize: '0.7rem',
                          color: 'var(--terminal-text-dim)',
                          fontFamily: 'JetBrains Mono, monospace',
                          lineHeight: 1.5,
                        }}>
                          {factor.explanation}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--terminal-text-dim)' }}>
                    Score breakdown not available for this politician.
                  </div>
                )}
              </div>

              {/* Methodology Note */}
              <div className="terminal-card" style={{
                background: 'rgba(245, 158, 11, 0.05)',
                border: '1px solid rgba(245, 158, 11, 0.2)',
              }}>
                <h3 style={{
                  fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.75rem',
                  color: 'var(--terminal-amber)',
                  fontFamily: 'JetBrains Mono, monospace',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  METHODOLOGY — v1 ALGORITHM
                </h3>
                <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', lineHeight: 1.7, fontFamily: 'JetBrains Mono, monospace' }}>
                  <p style={{ marginBottom: '0.5rem' }}>
                    The corruption score is a composite of 5 weighted factors: PAC/Lobby Funding Ratio (30%),
                    Lobbying Connections (20%), Voting Alignment with Donors (25%), Transparency &amp; Disclosure (10%),
                    and Campaign Finance Red Flags (15%).
                  </p>
                  <p style={{ marginBottom: '0.5rem' }}>
                    Factors marked &quot;PLACEHOLDER&quot; use a neutral baseline score of 30 because the required data
                    has not yet been linked. As more data sources come online (lobbying disclosures, voting records,
                    FEC complaints), these factors will switch to real data and accuracy will improve.
                  </p>
                  <p>
                    Confidence level reflects how many factors use real data. HIGH = 4-5 factors with data,
                    MEDIUM = 2-3 factors, LOW = 0-1 factors.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Funding & Financial Tab */}
          {activeTab === 'funding' && (
            <div>
              {politician.totalFundsRaised ? (
                <div style={{ display: 'grid', gap: '2rem' }}>
                  {/* Total Funds Collected Card */}
                  <div className="terminal-card">
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--terminal-amber)' }}>
                      💰 TOTAL FUNDS RAISED
                    </h3>
                    <div style={{
                      fontSize: '4rem',
                      fontWeight: 700, 
                      marginBottom: '0.5rem',
                      color: 'var(--terminal-amber)',
                      fontFamily: 'Bebas Neue, sans-serif',
                    }}>
                      ${politician.totalFundsRaised >= 1000000 
                        ? `${(politician.totalFundsRaised / 1000000).toFixed(0)}M`
                        : `${(politician.totalFundsRaised / 1000).toFixed(0)}K`}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--terminal-text-dim)', marginBottom: '2rem' }}>
                      Total Campaign Contributions
                    </div>
                    {/* Israel Lobby Total - RED HIGHLIGHT */}
                    {politician.israelLobbyTotal && politician.israelLobbyTotal > 0 && (
                      <div style={{ 
                        borderTop: '2px solid var(--terminal-red)',
                        paddingTop: '1.5rem',
                        marginTop: '1rem',
                      }}>
                        <div style={{ fontSize: '0.875rem', color: 'var(--terminal-red)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
                          🇮🇱 ISRAEL LOBBY TOTAL
                        </div>
                        <div style={{ 
                          fontSize: '3rem', 
                          fontWeight: 700, 
                          color: '#ef4444',
                          fontFamily: 'Bebas Neue, sans-serif',
                          marginBottom: '1.5rem',
                        }}>
                          ${politician.israelLobbyTotal >= 1000000 
                            ? `${(politician.israelLobbyTotal / 1000000).toFixed(0)}M`
                            : `${(politician.israelLobbyTotal / 1000).toFixed(0)}K`}
                        </div>
                        
                        {/* Breakdown */}
                        <div style={{ 
                          display: 'grid', 
                          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
                          gap: '1rem',
                        }}>
                          <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginBottom: '0.25rem' }}>PACs</div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ef4444', fontFamily: 'Bebas Neue, sans-serif' }}>
                              ${politician.israelLobbyBreakdown?.pacs 
                                ? (politician.israelLobbyBreakdown.pacs >= 1000000 
                                  ? `${(politician.israelLobbyBreakdown.pacs / 1000000).toFixed(0)}M`
                                  : `${(politician.israelLobbyBreakdown.pacs / 1000).toFixed(0)}K`)
                                : '$0'}
                            </div>
                          </div>
                          <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginBottom: '0.25rem' }}>IE</div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ef4444', fontFamily: 'Bebas Neue, sans-serif' }}>
                              ${politician.israelLobbyBreakdown?.ie 
                                ? (politician.israelLobbyBreakdown.ie >= 1000000 
                                  ? `${(politician.israelLobbyBreakdown.ie / 1000000).toFixed(0)}M`
                                  : `${(politician.israelLobbyBreakdown.ie / 1000).toFixed(0)}K`)
                                : '$0'}
                            </div>
                          </div>
                          <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginBottom: '0.25rem' }}>Bundlers</div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ef4444', fontFamily: 'Bebas Neue, sans-serif' }}>
                              ${politician.israelLobbyBreakdown?.bundlers 
                                ? (politician.israelLobbyBreakdown.bundlers >= 1000000 
                                  ? `${(politician.israelLobbyBreakdown.bundlers / 1000000).toFixed(0)}M`
                                  : `${(politician.israelLobbyBreakdown.bundlers / 1000).toFixed(0)}K`)
                                : '$0'}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Top 5 Donors Card */}
                  <div className="terminal-card">
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--terminal-amber)' }}>
                      🏆 TOP 5 DONORS
                    </h3>
                    {politician.top5Donors && politician.top5Donors.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {politician.top5Donors.map((donor, index) => (
                          <div key={index} style={{ 
                            padding: '1.5rem',
                            background: index === 0 ? 'rgba(245, 158, 11, 0.1)' : donor.type === 'Israel-PAC' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(156, 163, 175, 0.05)',
                            border: index === 0 ? '2px solid var(--terminal-amber)' : donor.type === 'Israel-PAC' ? '1px solid #ef4444' : '1px solid var(--terminal-border)',
                            position: 'relative',
                          }}>
                            <div style={{ 
                              position: 'absolute',
                              top: '-12px',
                              left: '1rem',
                              background: 'var(--terminal-bg)',
                              padding: '0 0.5rem',
                              fontSize: '0.75rem',
                              color: index === 0 ? 'var(--terminal-amber)' : donor.type === 'Israel-PAC' ? '#ef4444' : 'var(--terminal-text-dim)',
                              fontWeight: 700,
                              letterSpacing: '0.1em',
                            }}>
                              #{index + 1}
                            </div>
                            <div style={{ 
                              fontSize: index === 0 ? '1.25rem' : '1rem', 
                              fontWeight: 700, 
                              marginBottom: '0.5rem', 
                              color: index === 0 ? 'var(--terminal-amber)' : donor.type === 'Israel-PAC' ? '#ef4444' : 'var(--terminal-text)',
                            }}>
                              {donor.name}
                              {donor.type === 'Israel-PAC' && (
                                <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#ef4444', fontWeight: 700 }}>
                                  🇮🇱 ISRAEL-PAC
                                </span>
                              )}
                            </div>
                            <div style={{ 
                              fontSize: index === 0 ? '2rem' : '1.5rem', 
                              fontWeight: 700, 
                              color: index === 0 ? 'var(--terminal-amber)' : donor.type === 'Israel-PAC' ? '#ef4444' : 'var(--terminal-text)', 
                              fontFamily: 'Bebas Neue, sans-serif',
                            }}>
                              ${donor.amount >= 1000000 
                                ? `${(donor.amount / 1000000).toFixed(0)}M`
                                : `${(donor.amount / 1000).toFixed(0)}K`}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginTop: '0.5rem', textTransform: 'uppercase' }}>
                              {donor.type}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--terminal-text-dim)' }}>
                        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📊</div>
                        <div>No donor data available</div>
                      </div>
                    )}
                  </div>

                </div>
              ) : (
                <div className="terminal-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                  <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✓</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--terminal-green)' }}>
                    NO CONTRIBUTIONS FOUND
                  </div>
                  <div style={{ color: 'var(--terminal-text-dim)' }}>
                    No foreign lobby funding or major PAC contributions detected for this politician.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Voting & Policy Tab */}
          {activeTab === 'votes' && (
            <div>
              {/* Error state */}
              {votesError ? (
                <div className="terminal-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '1rem', color: 'var(--terminal-red)' }}>!</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--terminal-text)' }}>
                    CONGRESS API DATA AVAILABLE FOR FEDERAL OFFICIALS ONLY
                  </div>
                  <div style={{ color: 'var(--terminal-text-dim)', marginTop: '1rem' }}>
                    Voting records require a Congress.gov bioguide ID.<br />
                    This politician is {politician.office.toLowerCase()} and may not have federal voting records.
                  </div>
                </div>
              ) : votesError ? (
                // JFK-VOTING: Error state
                <div className="terminal-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                  <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>⚠️</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--terminal-red)' }}>
                    ERROR LOADING VOTING RECORDS
                  </div>
                  <div style={{ color: 'var(--terminal-text-dim)', marginTop: '1rem', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.875rem' }}>
                    {votesError}
                  </div>
                  <button
                    onClick={() => fetchVotingRecords()}
                    style={{
                      marginTop: '2rem',
                      padding: '1rem 2rem',
                      background: 'var(--terminal-amber)',
                      color: '#000',
                      border: 'none',
                      fontFamily: 'JetBrains Mono, monospace',
                      fontWeight: 700,
                      fontSize: '0.875rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                    }}
                  >
                    🔄 RETRY
                  </button>
                </div>
              ) : votesLoading ? (
                // JFK-VOTING: Loading state
                <div className="terminal-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                  <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>⏳</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem', fontFamily: 'JetBrains Mono, monospace' }}>
                    LOADING VOTING RECORDS...
                  </div>
                  <div style={{ color: 'var(--terminal-text-dim)', marginTop: '1rem', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.875rem' }}>
                    Fetching data from Congress.gov API
                  </div>
                </div>
              ) : (
                // JFK-VOTING: Display votes
                <div style={{ display: 'grid', gap: '2rem' }}>
                  {/* JFK-VOTING: Vote Breakdown Statistics */}
                  <div className="terminal-card">
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--terminal-amber)', fontFamily: 'JetBrains Mono, monospace' }}>
                      📊 VOTE BREAKDOWN (LAST {votingRecords.length} VOTES)
                    </h3>
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
                      gap: '1.5rem',
                    }}>
                      {(() => {
                        const breakdown = calculateBreakdown(votingRecords);
                        return (
                          <>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'JetBrains Mono, monospace' }}>
                                YES
                              </div>
                              <div style={{ fontSize: '3rem', fontWeight: 700, color: 'var(--terminal-green)', fontFamily: 'JetBrains Mono, monospace' }}>
                                {breakdown.yea}
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'JetBrains Mono, monospace' }}>
                                NO
                              </div>
                              <div style={{ fontSize: '3rem', fontWeight: 700, color: 'var(--terminal-red)', fontFamily: 'JetBrains Mono, monospace' }}>
                                {breakdown.nay}
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'JetBrains Mono, monospace' }}>
                                ABSTAIN
                              </div>
                              <div style={{ fontSize: '3rem', fontWeight: 700, color: 'var(--terminal-amber)', fontFamily: 'JetBrains Mono, monospace' }}>
                                {breakdown.abstain}
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'JetBrains Mono, monospace' }}>
                                ABSENT
                              </div>
                              <div style={{ fontSize: '3rem', fontWeight: 700, color: 'var(--terminal-text-dim)', fontFamily: 'JetBrains Mono, monospace' }}>
                                {breakdown.absent}
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* JFK-VOTING: Filter Buttons */}
                  <div style={{ 
                    display: 'flex', 
                    gap: '0.5rem', 
                    flexWrap: 'wrap',
                    padding: '1rem',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--terminal-border)',
                  }}>
                    <div style={{ 
                      fontSize: '0.75rem', 
                      color: 'var(--terminal-text-dim)', 
                      textTransform: 'uppercase', 
                      letterSpacing: '0.1em',
                      fontFamily: 'JetBrains Mono, monospace',
                      display: 'flex',
                      alignItems: 'center',
                      marginRight: '1rem',
                    }}>
                      FILTER:
                    </div>
                    {(['all', 'israel', 'defense', 'foreign', 'anti-america-first', 'domestic'] as VoteCategoryFilter[]).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setVoteCategoryFilter(filter)}
                        style={{
                          padding: '0.5rem 1rem',
                          background: voteCategoryFilter === filter ? 'var(--terminal-amber)' : 'transparent',
                          border: `1px solid ${voteCategoryFilter === filter ? 'var(--terminal-amber)' : 'var(--terminal-border)'}`,
                          color: voteCategoryFilter === filter ? '#000' : 'var(--terminal-text)',
                          fontSize: '0.75rem',
                          fontFamily: 'JetBrains Mono, monospace',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                      >
                        {filter === 'israel' && '🇮🇱 '}
                        {filter === 'defense' && '🛡️ '}
                        {filter === 'foreign' && '🌍 '}
                        {filter === 'anti-america-first' && '🌐 '}
                        {filter === 'domestic' && '🏛️ '}
                        {filter === 'all' && '📋 '}
                        {filter.toUpperCase()}
                        {filter !== 'all' && ` (${filterByCategory(votingRecords, filter).length})`}
                      </button>
                    ))}
                  </div>

                  {/* JFK-VOTING: Recent Votes Grid */}
                  <div className="terminal-card">
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--terminal-amber)', fontFamily: 'JetBrains Mono, monospace' }}>
                      🗳️ RECENT VOTES
                    </h3>
                    {(() => {
                      const filteredVotes = filterByCategory(votingRecords, voteCategoryFilter);
                      
                      if (filteredVotes.length === 0) {
                        return (
                          <div style={{ textAlign: 'center', padding: '3rem 2rem', color: 'var(--terminal-text-dim)' }}>
                            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔍</div>
                            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.875rem' }}>
                              No votes found for filter: {voteCategoryFilter.toUpperCase()}
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div style={{ display: 'grid', gap: '1rem' }}>
                          {filteredVotes.map((vote, idx) => (
                            <div
                              key={idx}
                              style={{
                                padding: '1.5rem',
                                background: 'rgba(255, 255, 255, 0.02)',
                                border: `1px solid ${getVoteColor(vote.votePosition)}`,
                                borderLeft: `4px solid ${getVoteColor(vote.votePosition)}`,
                                fontFamily: 'JetBrains Mono, monospace',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '1rem', marginBottom: '1rem' }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                    {vote.billNumber || 'PROCEDURAL VOTE'}
                                  </div>
                                  <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--terminal-text)' }}>
                                    {vote.billTitle}
                                  </div>
                                  {/* Show bill description (what the bill is about) */}
                                  {vote.billDescription && (
                                    <div style={{ fontSize: '0.875rem', color: '#fff', marginBottom: '0.75rem', lineHeight: 1.6 }}>
                                      {vote.billDescription}
                                    </div>
                                  )}
                                  <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)' }}>
                                    {new Date(vote.voteDate).toLocaleDateString('en-US', { 
                                      month: 'short', 
                                      day: 'numeric',
                                      year: 'numeric'
                                    })} • Result: {vote.result}
                                  </div>
                                </div>
                                <div style={{ 
                                  padding: '0.75rem 1.5rem',
                                  background: getVoteColor(vote.votePosition),
                                  color: '#000',
                                  fontWeight: 700,
                                  fontSize: '1rem',
                                  textAlign: 'center',
                                  minWidth: '100px',
                                  letterSpacing: '0.05em',
                                }}>
                                  {normalizePosition(vote.votePosition)}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  {/* JFK-VOTING: Data Source Info */}
                  <div style={{ 
                    padding: '1rem',
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid #10b981',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '0.75rem',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ color: '#10b981', fontWeight: 700 }}>✓ LIVE DATA</span>
                      <span style={{ color: 'var(--terminal-text-dim)' }}>
                        • Powered by Congress.gov API • Bioguide ID: {politician.source_ids?.bioguide_id}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Other tabs show Phase 2 placeholder */}
          {activeTab !== 'overview' && activeTab !== 'funding' && activeTab !== 'votes' && (
            <div className="terminal-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🔒</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                PHASE 2 COMING SOON
              </div>
              <div style={{ color: 'var(--terminal-text-dim)' }}>
                {activeTab === 'legal' && 'Court cases, ethics complaints, and legal records'}
                {activeTab === 'social' && 'Social media posts, deleted content, and engagement analytics'}
                {activeTab === 'network' && 'Donor networks, PAC connections, and relationship graphs'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="classified-footer">
        ALL DATA ACQUIRED VIA OSINT // PUBLIC RECORDS: FEC, SOCIAL MEDIA, NEWS OUTLETS // POLITICIAN DOSSIER DIVISION
      </div>
    </div>
  );
}

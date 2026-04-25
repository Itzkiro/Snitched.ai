'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { Politician } from '@/lib/types';
import { computeCorruptionScore, getGradeColor as libGetGradeColor, getConfidenceColor, getBinaryScoreColor } from '@/lib/corruption-score';
import {
  getCorruptionScore,
  getProIsraelLobbyAmount,
  formatLobbyAmount,
  PRO_ISRAEL_LOBBY_LABEL,
} from '@/lib/politician-display';
import ConnectionsGraph from '@/components/ConnectionsGraph';
import ShareDossier from '@/components/ShareDossier';
import DownloadDossier from '@/components/DownloadDossier';

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
  // Score card has two faces: numeric score and red-flag bullet list. Click to flip.
  const [scoreView, setScoreView] = useState<'score' | 'flags'>('score');

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
        // v6.4: DO NOT recompute the corruption score client-side. The DB
        // value is authoritative — it was computed by sync-corruption-scores.ts
        // with the full v6.3+ algorithm (multi-cycle multiplier, tier floors,
        // forensics) using data we don't always ship to the client. Rerunning
        // computeCorruptionScore here with incomplete fields produced a score
        // that disagreed with every other page on the site. The factor break-
        // down is still computed so the detail view can show explanations —
        // but the top-line score stays whatever the DB says.
        const scoreResult = computeCorruptionScore(found);
        found.corruptionScoreDetails = scoreResult;
        // Preserve DB-side corruption_score; computed value is for the factor
        // breakdown UI only.
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

  // Sync active tab with URL hash on mount (D-12) so share-links / browser-back
  // work. Hash is validated against an allow-list to close the T-10-11 tamper
  // threat — unknown hash falls back to the default tab (overview).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const allowedTabs = ['overview', 'score', 'funding', 'legal', 'votes', 'social', 'network'];
    const raw = window.location.hash.replace(/^#/, '');
    if (raw && allowedTabs.includes(raw)) {
      setActiveTab(raw);
    }
    // Keep tab in sync when user navigates with browser back/forward
    const onHashChange = () => {
      const h = window.location.hash.replace(/^#/, '');
      if (h && allowedTabs.includes(h)) {
        setActiveTab(h);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

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

  // When a politician has flagged red_flags, score box / number / grade all
  // render red regardless of numeric score (overrides the green/amber bands).
  const redFlags = politician.source_ids?.red_flags ?? [];
  const hasRedFlags = redFlags.length > 0;
  const getScoreColor = (score: number) => {
    if (hasRedFlags) return 'var(--terminal-red)';
    if (score < 40) return 'var(--terminal-green)';
    if (score < 60) return 'var(--terminal-amber)';
    return 'var(--terminal-red)';
  };
  // Binary dossier rule (2026-04-21): score 0 → all green, >0 → all red.
  // Red flags always force red regardless of score.
  const getGradeColor = (_grade: 'A' | 'B' | 'C' | 'D' | 'F') => {
    if (hasRedFlags) return 'var(--terminal-red)';
    return getBinaryScoreColor(Number(politician?.corruptionScore) || 0);
  };
  void libGetGradeColor; // kept for factor-breakdown tiering if needed later

  const getJuiceBoxLabel = (tier: string) => {
    if (tier === 'owned') return '👑 FULLY OWNED';
    if (tier === 'bought') return '💰 BOUGHT & PAID FOR';
    if (tier === 'compromised') return '💸 COMPROMISED';
    return 'CLEAN';
  };

  // getGradeColor and getConfidenceColor imported from @/lib/corruption-score

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
            {getCorruptionScore(politician) >= 60 ? '🚨' : getCorruptionScore(politician) >= 40 ? '⚠️' : '✓'}
          </span>
          <span>
            CORRUPTION SCORE: {getCorruptionScore(politician)}/100 — GRADE {politician.corruptionScoreDetails?.grade ?? '--'} — {
              getCorruptionScore(politician) <= 20 ? 'LOW RISK' :
              getCorruptionScore(politician) <= 40 ? 'MODERATE' :
              getCorruptionScore(politician) <= 60 ? 'ELEVATED' :
              getCorruptionScore(politician) <= 80 ? 'HIGH RISK' :
              'SEVERE'
            }
          </span>
          <span style={{ fontSize: '0.875rem', color: 'var(--terminal-text-dim)', marginLeft: '1rem' }}>
            {politician.corruptionScoreDetails?.confidence
              ? `${politician.corruptionScoreDetails.confidence.toUpperCase()} CONFIDENCE (${politician.corruptionScoreDetails.dataCompleteness}% data)`
              : ''}
            {politician.juiceBoxTier !== 'none'
              ? ` | ${getJuiceBoxLabel(politician.juiceBoxTier)} - ${formatLobbyAmount(getProIsraelLobbyAmount(politician))} ${PRO_ISRAEL_LOBBY_LABEL}`
              : (getProIsraelLobbyAmount(politician) === 0 && !hasRedFlags)
                ? ` | ✓ NO FOREIGN INFLUENCE DETECTED`
                : ''}
          </span>
        </div>
      </div>

      <div style={{ padding: '1rem' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          {/* Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
            <Link
              href="/browse"
              style={{
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
            <ShareDossier politician={politician} />
            <DownloadDossier politician={politician} />
            <a
              href={`/api/export?format=csv&type=all`}
              download
              className="terminal-btn"
              style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', textDecoration: 'none' }}
            >
              EXPORT CSV
            </a>
          </div>

          {/* Profile Header Card */}
          <div className="terminal-card" style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'start', flexWrap: 'wrap' }}>
              {/* Score/Grade Badge */}
              <div
                style={{
                  width: '80px',
                  height: '80px',
                  border: `3px solid ${getScoreColor(getCorruptionScore(politician))}`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: getScoreColor(getCorruptionScore(politician)),
                  flexShrink: 0,
                  fontFamily: 'Bebas Neue, sans-serif',
                  lineHeight: 1,
                }}
                aria-label={`Corruption score ${getCorruptionScore(politician)} of 100, grade ${politician.corruptionScoreDetails?.grade ?? '--'}`}
              >
                <span style={{ fontSize: '2.25rem', fontWeight: 700 }}>
                  {getCorruptionScore(politician)}
                </span>
                {politician.corruptionScoreDetails?.grade && (
                  <span
                    style={{
                      fontSize: '1.1rem',
                      fontWeight: 700,
                      color: getGradeColor(politician.corruptionScoreDetails.grade),
                      marginTop: '0.15rem',
                    }}
                  >
                    {politician.corruptionScoreDetails.grade}
                  </span>
                )}
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
                  {/* Corruption Score / Red Flags — 2-page card. Click header tab or card body to flip. */}
                  <div
                    onClick={() => hasRedFlags && setScoreView(v => v === 'score' ? 'flags' : 'score')}
                    style={{
                      cursor: hasRedFlags ? 'pointer' : 'default',
                      padding: hasRedFlags ? '0.5rem' : 0,
                      border: hasRedFlags ? '1px dashed rgba(220,38,38,0.4)' : 'none',
                      transition: 'background 0.15s',
                    }}
                    title={hasRedFlags ? 'Click to flip between score and red flags' : ''}
                  >
                    {hasRedFlags && (
                      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        {(['score', 'flags'] as const).map(v => (
                          <button
                            key={v}
                            onClick={(e) => { e.stopPropagation(); setScoreView(v); }}
                            style={{
                              fontSize: '0.625rem',
                              fontWeight: 700,
                              letterSpacing: '0.1em',
                              padding: '0.25rem 0.6rem',
                              background: scoreView === v ? 'var(--terminal-red)' : 'transparent',
                              color: scoreView === v ? '#000' : 'var(--terminal-red)',
                              border: '1px solid var(--terminal-red)',
                              cursor: 'pointer',
                              fontFamily: 'JetBrains Mono, monospace',
                              textTransform: 'uppercase',
                            }}
                          >
                            {v === 'score' ? 'SCORE' : `⚠ FLAGS (${redFlags.length})`}
                          </button>
                        ))}
                      </div>
                    )}
                    {(!hasRedFlags || scoreView === 'score') && (
                      <>
                        <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                          Corruption Score
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                          <span style={{ fontSize: '2rem', fontWeight: 700, color: getScoreColor(getCorruptionScore(politician)), fontFamily: 'Bebas Neue, sans-serif' }}>
                            {getCorruptionScore(politician)}/100
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
                      </>
                    )}
                    {hasRedFlags && scoreView === 'flags' && (
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                        {redFlags.map((f, i) => (
                          <li key={i} style={{
                            color: 'var(--terminal-text)',
                            fontSize: '0.75rem',
                            lineHeight: '1.5',
                            paddingLeft: '0.5rem',
                            borderLeft: `3px solid ${f.severity === 'high' ? 'var(--terminal-red)' : '#f59e0b'}`,
                            marginBottom: '0.4rem',
                          }}>
                            <span style={{
                              display: 'inline-block',
                              fontSize: '0.55rem',
                              fontWeight: 700,
                              color: f.severity === 'high' ? 'var(--terminal-red)' : '#f59e0b',
                              letterSpacing: '0.1em',
                              marginRight: '0.4rem',
                            }}>{f.severity === 'high' ? '[HIGH]' : '[MED]'}</span>
                            {f.label}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      {PRO_ISRAEL_LOBBY_LABEL}
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 700, color: getProIsraelLobbyAmount(politician) > 0 ? 'var(--terminal-red)' : 'var(--terminal-green)', fontFamily: 'Bebas Neue, sans-serif' }}>
                      {formatLobbyAmount(getProIsraelLobbyAmount(politician))}
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

          {/* (Red Flags now live inside the score-card toggle in the header.) */}

          {/* Tab Navigation — sticky scroll-snap strip per UI-SPEC §6 + D-10/D-11/D-12 */}
          <div className="relative mb-8">
            <div
              className="sticky top-[56px] z-30 flex overflow-x-auto snap-x snap-mandatory border-b-2 border-[var(--terminal-border)] bg-black/85 backdrop-blur"
              role="tablist"
            >
              {tabs.map(tab => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-current={isActive ? 'page' : undefined}
                    aria-selected={isActive}
                    onClick={() => {
                      setActiveTab(tab.id);
                      if (typeof window !== 'undefined') {
                        window.history.replaceState(null, '', '#' + tab.id);
                      }
                    }}
                    className={`snap-start min-h-[44px] px-4 py-2 text-sm font-mono uppercase tracking-[0.08em] whitespace-nowrap cursor-pointer transition-colors ${
                      isActive
                        ? 'border-b-2 border-[var(--terminal-amber)] text-[var(--terminal-amber)] bg-[var(--terminal-amber)]/10'
                        : 'border-b-2 border-transparent text-[var(--terminal-text-dim)] hover:text-[var(--terminal-amber)]'
                    }`}
                    style={{ fontWeight: 700 }}
                  >
                    {tab.icon} {tab.label}
                  </button>
                );
              })}
            </div>
            {/* Right-edge gradient — scroll affordance per UI-SPEC §6 */}
            <div
              aria-hidden
              className="pointer-events-none absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-black to-transparent"
            />
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
                <div className="flex flex-col gap-2 sm:grid sm:grid-cols-[150px_1fr] sm:gap-x-4 sm:gap-y-2 text-sm">
                  <div className="font-mono text-xs uppercase text-[var(--terminal-text-dim)] sm:normal-case sm:text-sm">Office:</div>
                  <div>{politician.office}</div>
                  <div className="font-mono text-xs uppercase text-[var(--terminal-text-dim)] sm:normal-case sm:text-sm">Jurisdiction:</div>
                  <div>{politician.district || politician.jurisdiction}</div>
                  <div className="font-mono text-xs uppercase text-[var(--terminal-text-dim)] sm:normal-case sm:text-sm">Party:</div>
                  <div>{politician.party}</div>
                  <div className="font-mono text-xs uppercase text-[var(--terminal-text-dim)] sm:normal-case sm:text-sm">Term Start:</div>
                  <div>{politician.termStart}</div>
                  {politician.termEnd && (
                    <>
                      <div className="font-mono text-xs uppercase text-[var(--terminal-text-dim)] sm:normal-case sm:text-sm">Term End:</div>
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
                  <div className="flex flex-col gap-3 text-sm">
                    {politician.socialMedia.twitterHandle && (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 py-1">
                        <span className="sm:min-w-[100px] font-mono text-xs uppercase text-[var(--terminal-text-dim)]">Twitter:</span>
                        <a href={`https://twitter.com/${politician.socialMedia.twitterHandle}`} target="_blank" rel="noopener noreferrer" className="font-mono text-sm text-[var(--terminal-amber)] break-all no-underline">
                          @{politician.socialMedia.twitterHandle}
                        </a>
                      </div>
                    )}
                    {politician.socialMedia.facebookPageUrl && (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 py-1">
                        <span className="sm:min-w-[100px] font-mono text-xs uppercase text-[var(--terminal-text-dim)]">Facebook:</span>
                        <a href={politician.socialMedia.facebookPageUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-sm text-[var(--terminal-amber)] break-all no-underline">
                          Page
                        </a>
                      </div>
                    )}
                    {politician.socialMedia.instagramHandle && (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 py-1">
                        <span className="sm:min-w-[100px] font-mono text-xs uppercase text-[var(--terminal-text-dim)]">Instagram:</span>
                        <a href={`https://instagram.com/${politician.socialMedia.instagramHandle}`} target="_blank" rel="noopener noreferrer" className="font-mono text-sm text-[var(--terminal-amber)] break-all no-underline">
                          @{politician.socialMedia.instagramHandle}
                        </a>
                      </div>
                    )}
                    {politician.socialMedia.youtubeChannelId && (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 py-1">
                        <span className="sm:min-w-[100px] font-mono text-xs uppercase text-[var(--terminal-text-dim)]">YouTube:</span>
                        <a href={`https://youtube.com/channel/${politician.socialMedia.youtubeChannelId}`} target="_blank" rel="noopener noreferrer" className="font-mono text-sm text-[var(--terminal-amber)] break-all no-underline">
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
                    border: `4px solid ${getScoreColor(getCorruptionScore(politician))}`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <span style={{
                      fontSize: '2.5rem',
                      fontWeight: 700,
                      color: getScoreColor(getCorruptionScore(politician)),
                      fontFamily: 'Bebas Neue, sans-serif',
                      lineHeight: 1,
                    }}>
                      {getCorruptionScore(politician)}
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
                          {getCorruptionScore(politician) <= 20 ? 'LOW RISK' :
                           getCorruptionScore(politician) <= 40 ? 'MODERATE RISK' :
                           getCorruptionScore(politician) <= 60 ? 'ELEVATED RISK' :
                           getCorruptionScore(politician) <= 80 ? 'HIGH RISK' :
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
                  METHODOLOGY — v2 ALGORITHM
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
                  {/* Total Funding Card — receipts + IE support combined */}
                  <div className="terminal-card">
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--terminal-amber)' }}>
                      💰 TOTAL FUNDING BEHIND CANDIDATE
                    </h3>
                    {(() => {
                      const receipts = Number(politician.totalFundsRaised) || 0;
                      const ie = Number(politician.israelLobbyBreakdown?.ie) || 0;
                      const combined = receipts + ie;
                      return (
                        <>
                          <div style={{
                            fontSize: '4rem',
                            fontWeight: 700,
                            marginBottom: '0.5rem',
                            color: 'var(--terminal-amber)',
                            fontFamily: 'Bebas Neue, sans-serif',
                          }}>
                            {formatLobbyAmount(combined)}
                          </div>
                          <div style={{ fontSize: '0.875rem', color: 'var(--terminal-text-dim)', marginBottom: '1rem' }}>
                            Direct committee receipts + Independent Expenditures supporting this candidate
                          </div>
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: '0.75rem',
                            marginBottom: '2rem',
                          }}>
                            <div style={{ padding: '0.75rem', background: 'rgba(251, 191, 36, 0.08)', border: '1px solid rgba(251, 191, 36, 0.25)' }}>
                              <div style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dim)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Committee Receipts (FEC)</div>
                              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--terminal-amber)', fontFamily: 'Bebas Neue, sans-serif' }}>
                                {formatLobbyAmount(receipts)}
                              </div>
                            </div>
                            <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                              <div style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dim)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Independent Expenditures</div>
                              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ef4444', fontFamily: 'Bebas Neue, sans-serif' }}>
                                {formatLobbyAmount(ie)}
                              </div>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                    {/* Israel Lobby Total - RED HIGHLIGHT */}
                    {politician.israelLobbyTotal && politician.israelLobbyTotal > 0 && (
                      <div style={{
                        borderTop: '2px solid var(--terminal-red)',
                        paddingTop: '1.5rem',
                        marginTop: '1rem',
                      }}>
                        <div style={{ fontSize: '0.875rem', color: 'var(--terminal-red)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
                          🇮🇱 TOTAL PRO-ISRAEL LOBBY
                        </div>
                        <div style={{
                          fontSize: '3rem',
                          fontWeight: 700,
                          color: '#ef4444',
                          fontFamily: 'Bebas Neue, sans-serif',
                          marginBottom: '1.5rem',
                        }}>
                          {formatLobbyAmount(politician.israelLobbyTotal)}
                        </div>

                        {/* Breakdown — responsive grid per UI-SPEC §2/D-24 section padding, D-22 in-scope conversion */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 p-3 sm:p-6 lg:p-8">
                          <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                            <div className="break-words" style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginBottom: '0.25rem' }} title="Direct contributions from pro-Israel lobby PACs (AIPAC PAC, United Democracy Project, DMFI, NORPAC, RJC, etc.)">Pro-Israel Lobby PACs</div>
                            <div className="break-words" style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ef4444', fontFamily: 'Bebas Neue, sans-serif' }}>
                              {formatLobbyAmount(Number(politician.israelLobbyBreakdown?.pacs) || 0)}
                            </div>
                          </div>
                          <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                            <div className="break-words" style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginBottom: '0.25rem' }} title="Independent expenditures by pro-Israel lobby Super PACs supporting or opposing this candidate">Pro-Israel Lobby IE</div>
                            <div className="break-words" style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ef4444', fontFamily: 'Bebas Neue, sans-serif' }}>
                              {formatLobbyAmount(Number(politician.israelLobbyBreakdown?.ie) || 0)}
                            </div>
                          </div>
                          <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                            <div className="break-words" style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginBottom: '0.25rem' }} title="Individuals who donated to this candidate AND have a history of heavy donations to pro-Israel lobby PACs">Pro-Israel Lobby-Tied Donors</div>
                            <div className="break-words" style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ef4444', fontFamily: 'Bebas Neue, sans-serif' }}>
                              {formatLobbyAmount(Number(politician.israelLobbyBreakdown?.bundlers) || 0)}
                            </div>
                          </div>
                        </div>
                        {/* Affiliated Organizations */}
                        {(politician.israelLobbyBreakdown as any)?.orgs && (politician.israelLobbyBreakdown as any).orgs.length > 0 && (
                          <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--terminal-text-dim)' }}>
                            <span style={{ fontWeight: 700 }}>AFFILIATED ORGS: </span>
                            {(politician.israelLobbyBreakdown as any).orgs.join(', ')}
                          </div>
                        )}
                        <div style={{ marginTop: '0.75rem', fontSize: '0.65rem', color: 'var(--terminal-text-dimmer)' }}>
                          Source: FEC filings &amp; public disclosure records
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
                              {formatLobbyAmount(donor.amount)}
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

                  {/* Contribution Breakdown Card */}
                  {politician.contributionBreakdown && (
                    <div className="terminal-card">
                      <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--terminal-amber)' }}>
                        📊 FUNDING BREAKDOWN
                      </h3>
                      {(() => {
                        const b = politician.contributionBreakdown;
                        const total = (b.individuals || 0) + (b.otherPACs || 0) + (b.corporate || 0) + (b.aipac || 0);
                        if (total === 0) return null;
                        const segments = [
                          { label: 'Individuals', amount: b.individuals || 0, color: 'var(--terminal-green)' },
                          { label: 'PACs', amount: b.otherPACs || 0, color: 'var(--terminal-amber)' },
                          { label: 'Corporate', amount: b.corporate || 0, color: '#60a5fa' },
                          ...(b.aipac > 0 ? [{ label: 'Pro-Israel Lobby', amount: b.aipac, color: '#ef4444' }] : []),
                        ].filter(s => s.amount > 0).sort((a, b) => b.amount - a.amount);
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {/* Stacked bar */}
                            <div style={{ display: 'flex', height: '24px', borderRadius: '2px', overflow: 'hidden' }}>
                              {segments.map((s, i) => (
                                <div key={i} style={{
                                  width: `${(s.amount / total) * 100}%`,
                                  background: s.color,
                                  minWidth: s.amount > 0 ? '4px' : '0',
                                }} title={`${s.label}: $${s.amount.toLocaleString()}`} />
                              ))}
                            </div>
                            {/* Legend */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                              {segments.map((s, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <div style={{ width: '12px', height: '12px', background: s.color, borderRadius: '2px' }} />
                                    <span style={{ fontSize: '0.875rem', color: 'var(--terminal-text)' }}>{s.label}</span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)' }}>
                                      ({((s.amount / total) * 100).toFixed(1)}%)
                                    </span>
                                  </div>
                                  <span style={{ fontWeight: 700, fontFamily: 'Bebas Neue, sans-serif', color: s.color, fontSize: '1.1rem' }}>
                                    {formatLobbyAmount(s.amount)}
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
                  <div className="terminal-card">
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--terminal-amber)' }}>
                      📡 INDEPENDENT EXPENDITURES
                    </h3>
                    <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginBottom: '1.5rem' }}>
                      Third-party spending for or against this politician (FEC Schedule E)
                    </div>
                    {politician.israelLobbyBreakdown?.ie_details && politician.israelLobbyBreakdown.ie_details.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {politician.israelLobbyBreakdown.ie_details
                          .sort((a, b) => b.amount - a.amount)
                          .map((ie, index) => (
                          <div key={index} style={{
                            padding: '1.25rem',
                            background: ie.is_israel_lobby ? 'rgba(239, 68, 68, 0.08)' : 'rgba(156, 163, 175, 0.05)',
                            border: ie.is_israel_lobby ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid var(--terminal-border)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '1rem',
                          }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{
                                fontWeight: 700,
                                fontSize: '0.9rem',
                                color: ie.is_israel_lobby ? '#ef4444' : 'var(--terminal-text)',
                                marginBottom: '0.25rem',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}>
                                {ie.committee_name}
                                {ie.is_israel_lobby && (
                                  <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: '#ef4444' }}>
                                    🇮🇱
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem' }}>
                                <span style={{
                                  color: ie.support_oppose === 'support' ? 'var(--terminal-green)' : '#ef4444',
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                }}>
                                  {ie.support_oppose === 'support' ? '+ SUPPORT' : '- OPPOSE'}
                                </span>
                                <span style={{ color: 'var(--terminal-text-dim)' }}>
                                  {ie.committee_id}
                                </span>
                              </div>
                            </div>
                            <div style={{
                              fontSize: '1.5rem',
                              fontWeight: 700,
                              fontFamily: 'Bebas Neue, sans-serif',
                              color: ie.is_israel_lobby ? '#ef4444' : 'var(--terminal-amber)',
                              whiteSpace: 'nowrap',
                            }}>
                              {formatLobbyAmount(ie.amount)}
                            </div>
                          </div>
                        ))}
                        {/* IE Total Summary */}
                        <div style={{
                          borderTop: '2px solid var(--terminal-border)',
                          paddingTop: '1rem',
                          marginTop: '0.5rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}>
                          <span style={{ fontWeight: 700, color: 'var(--terminal-text-dim)', textTransform: 'uppercase', fontSize: '0.85rem' }}>
                            Total IE Spending
                          </span>
                          <span style={{
                            fontSize: '1.5rem',
                            fontWeight: 700,
                            fontFamily: 'Bebas Neue, sans-serif',
                            color: 'var(--terminal-amber)',
                          }}>
                            ${politician.israelLobbyBreakdown.ie_details
                              .reduce((sum, ie) => sum + ie.amount, 0)
                              .toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--terminal-text-dim)' }}>
                        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📭</div>
                        <div>No independent expenditures on record</div>
                      </div>
                    )}
                  </div>

                </div>
              ) : (
                <div className="terminal-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                  {['US Senator', 'US Representative', 'State Senator', 'State Representative'].includes(politician.officeLevel) ? (
                    <>
                      <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✓</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--terminal-green)' }}>
                        NO CONTRIBUTIONS FOUND
                      </div>
                      <div style={{ color: 'var(--terminal-text-dim)' }}>
                        No foreign lobby funding or major PAC contributions detected for this politician.
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📋</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--terminal-text-dim)' }}>
                        CAMPAIGN FINANCE DATA PENDING
                      </div>
                      <div style={{ color: 'var(--terminal-text-dim)' }}>
                        County and local campaign finance records are not yet available.
                        Data is sourced from the FL Division of Elections as it becomes available.
                      </div>
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
                <div className="terminal-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '1rem', color: 'var(--terminal-red)' }}>!</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--terminal-red)' }}>ERROR LOADING VOTING RECORDS</div>
                  <div style={{ color: 'var(--terminal-text-dim)', marginTop: '1rem', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.875rem' }}>{votesError}</div>
                  <button onClick={() => { setVotesFetched(false); setVotesError(null); }} style={{ marginTop: '2rem', padding: '1rem 2rem', background: 'var(--terminal-amber)', color: '#000', border: 'none', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer' }}>RETRY</button>
                </div>
              ) : votesLoading ? (
                <div className="terminal-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                  <div style={{ width: '48px', height: '48px', margin: '0 auto 1.5rem', border: '3px solid var(--terminal-border)', borderTop: '3px solid var(--terminal-amber)', borderRadius: '50%', animation: 'voteSpin 1s linear infinite' }} />
                  <style>{`@keyframes voteSpin { to { transform: rotate(360deg); } }`}</style>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', fontFamily: 'JetBrains Mono, monospace' }}>LOADING VOTING RECORDS...</div>
                  <div style={{ color: 'var(--terminal-text-dim)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.875rem' }}>{isFederal ? 'Querying Congress.gov / Supabase' : isStateLeg ? 'Querying LegiScan API' : 'Searching records'}</div>
                </div>
              ) : !isFederal && !isStateLeg ? (
                <div className="terminal-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '1rem', color: 'var(--terminal-text-dim)' }}>--</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--terminal-text)' }}>NO VOTING DATA SOURCE</div>
                  <div style={{ color: 'var(--terminal-text-dim)', marginTop: '0.5rem', maxWidth: '500px', margin: '0.5rem auto 0', lineHeight: 1.7 }}>
                    Voting records are available for federal legislators (Congress.gov) and state legislators (LegiScan). This official&apos;s role ({politician.office}) does not have a legislative voting record.
                  </div>
                </div>
              ) : votingRecords.length === 0 ? (
                <div className="terminal-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '1rem', color: 'var(--terminal-text-dim)' }}>[ ]</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--terminal-text)' }}>NO VOTING RECORDS FOUND</div>
                  <div style={{ color: 'var(--terminal-text-dim)', marginTop: '0.5rem' }}>{isFederal ? `No vote data returned for Bioguide ID ${politician.source_ids?.bioguide_id}. The data source may be temporarily unavailable.` : `No legislative activity found in LegiScan for ${politician.name}.`}</div>
                  <button onClick={() => { setVotesFetched(false); }} style={{ marginTop: '2rem', padding: '0.75rem 1.5rem', background: 'transparent', border: '1px solid var(--terminal-border)', color: 'var(--terminal-text)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer' }}>RETRY</button>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '2rem' }}>
                  <div className="terminal-card">
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--terminal-amber)', fontFamily: 'JetBrains Mono, monospace' }}>VOTE BREAKDOWN ({votingRecords.length} RECORDS)</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1.5rem' }}>
                      {(() => { const bd = calculateBreakdown(votingRecords); return (<>
                        <div><div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'JetBrains Mono, monospace' }}>YEA</div><div style={{ fontSize: '3rem', fontWeight: 700, color: 'var(--terminal-green)', fontFamily: 'JetBrains Mono, monospace' }}>{bd.yea}</div></div>
                        <div><div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'JetBrains Mono, monospace' }}>NAY</div><div style={{ fontSize: '3rem', fontWeight: 700, color: 'var(--terminal-red)', fontFamily: 'JetBrains Mono, monospace' }}>{bd.nay}</div></div>
                        <div><div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'JetBrains Mono, monospace' }}>ABSTAIN</div><div style={{ fontSize: '3rem', fontWeight: 700, color: 'var(--terminal-amber)', fontFamily: 'JetBrains Mono, monospace' }}>{bd.abstain}</div></div>
                        <div><div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'JetBrains Mono, monospace' }}>ABSENT</div><div style={{ fontSize: '3rem', fontWeight: 700, color: 'var(--terminal-text-dim)', fontFamily: 'JetBrains Mono, monospace' }}>{bd.absent}</div></div>
                      </>); })()}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--terminal-border)' }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'JetBrains Mono, monospace', marginRight: '0.5rem' }}>FILTER:</div>
                      {/* Vote filter buttons — 44 px tap targets per AUDIT §1.4 + D-03; wrap on base, scroll-snap on sm+ */}
                      <div className="flex flex-wrap gap-2 sm:flex-nowrap sm:overflow-x-auto sm:snap-x sm:snap-mandatory pb-2 w-full sm:w-auto">
                        {(['all', 'israel', 'defense', 'foreign', 'anti-america-first', 'domestic'] as VoteCategoryFilter[]).map((f) => {
                          const isActive = voteCategoryFilter === f;
                          return (
                            <button
                              key={f}
                              onClick={() => setVoteCategoryFilter(f)}
                              className={`min-h-[44px] px-3 py-2 text-xs font-mono uppercase tracking-[0.08em] border rounded-sm snap-start whitespace-nowrap cursor-pointer transition-colors ${
                                isActive
                                  ? 'bg-[var(--terminal-amber)] text-black border-[var(--terminal-amber)]'
                                  : 'bg-transparent text-[var(--terminal-text)] border-[var(--terminal-border)]'
                              }`}
                              style={{ fontWeight: 700 }}
                            >
                              {f.toUpperCase().replace(/-/g, ' ')}{f !== 'all' && ` (${filterByCategory(votingRecords, f).length})`}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.1em', flexShrink: 0 }}>SEARCH:</span>
                      <input type="text" value={voteSearchQuery} onChange={(e) => setVoteSearchQuery(e.target.value)} placeholder="keyword, bill number..." style={{ flex: 1, padding: '0.5rem 0.75rem', background: 'var(--terminal-bg)', border: '1px solid var(--terminal-border)', color: 'var(--terminal-text)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem', outline: 'none' }} />
                      {voteSearchQuery && (<button onClick={() => setVoteSearchQuery('')} className="min-h-[44px] px-3 py-2 text-xs font-mono uppercase bg-transparent border border-[var(--terminal-border)] text-[var(--terminal-text-dim)] cursor-pointer" style={{ fontWeight: 700 }}>CLEAR</button>)}
                    </div>
                  </div>
                  <div className="terminal-card">
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--terminal-amber)', fontFamily: 'JetBrains Mono, monospace' }}>VOTING RECORDS</h3>
                    {(() => {
                      const filtered = getFilteredRecords();
                      if (filtered.length === 0) return (<div style={{ textAlign: 'center', padding: '3rem 2rem', color: 'var(--terminal-text-dim)' }}><div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>--</div><div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.875rem' }}>No records match the current filters.{voteSearchQuery && ' Try a different keyword.'}</div></div>);
                      return (<div style={{ display: 'grid', gap: '0.75rem' }}>
                        {filtered.map((record) => { const posColor = getVoteColor(record.votePosition); const posLabel = normalizePosition(record.votePosition); return (
                          <div
                            key={record.id}
                            className="flex flex-col sm:flex-row gap-2 p-3 sm:p-4 font-mono"
                            style={{ background: 'rgba(255, 255, 255, 0.02)', border: `1px solid ${posColor}40`, borderLeft: `4px solid ${posColor}` }}
                          >
                            {/* Badge — chip above bill title on (base), right-side on sm+ per UI-SPEC §7 Strategy A */}
                            <div
                              className="order-first sm:order-last self-start sm:self-center sm:ml-auto sm:min-w-[90px] sm:text-right px-2 py-0.5 sm:px-4 sm:py-2 text-xs font-mono uppercase tracking-[0.08em]"
                              style={{ background: posColor, color: '#000', fontWeight: 700 }}
                            >
                              {posLabel}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap gap-3 text-[0.7rem] uppercase tracking-[0.1em] text-[var(--terminal-text-dim)] mb-1">
                                <span>{record.billNumber || 'VOTE'}</span>
                                {record.category && (<span style={{ color: 'var(--terminal-cyan)', padding: '0 0.4rem', border: '1px solid var(--terminal-cyan)', fontSize: '0.6rem' }}>{record.category}</span>)}
                              </div>
                              <div className="font-mono text-sm sm:text-base text-[var(--terminal-text)] break-words mb-1" style={{ fontWeight: 700, lineHeight: 1.4 }}>
                                {record.billUrl ? (<a href={record.billUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--terminal-text)', textDecoration: 'none', borderBottom: '1px dashed var(--terminal-text-dim)' }}>{record.billTitle}</a>) : record.billTitle}
                              </div>
                              {record.billDescription && (<div className="break-words" style={{ fontSize: '0.8rem', color: 'var(--terminal-text-dim)', marginBottom: '0.5rem', lineHeight: 1.5 }}>{record.billDescription.length > 250 ? record.billDescription.substring(0, 250) + '...' : record.billDescription}</div>)}
                              <div className="break-words" style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dimmer)' }}>
                                {record.voteDate && <span>{new Date(record.voteDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                                {record.chamber && <span> | {record.chamber}</span>}
                                {record.result && <span> | {record.result}</span>}
                                <span> | src: {record.source}</span>
                              </div>
                            </div>
                          </div>
                        ); })}
                      </div>);
                    })()}
                  </div>
                  <div style={{ padding: '0.75rem 1rem', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ color: '#10b981', fontWeight: 700 }}>DATA SOURCE</span>
                    <span style={{ color: 'var(--terminal-text-dim)' }}>{isFederal ? `Congress.gov / Supabase | Bioguide: ${politician.source_ids?.bioguide_id}` : `LegiScan | State: ${politician.jurisdiction || 'FL'}`}{` | ${votingRecords.length} records loaded`}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Network / Connections Tab */}
          {activeTab === 'network' && (
            <div>
              <ConnectionsGraph politician={politician} />
              <ConnectionsTree politician={politician} />
            </div>
          )}

          {/* Social / News Tab */}
          {activeTab === 'social' && (
            <SocialTab politicianId={politician.id} politicianName={politician.name} />
          )}

          {/* Legal / Court Records Tab */}
          {activeTab === 'legal' && (
            <div>
              {politician.courtCases && politician.courtCases.length > 0 ? (
                <>
                  <div style={{ marginBottom: '1rem', fontSize: '0.75rem', color: 'var(--terminal-text-dim)' }}>
                    {politician.courtCases.length} court record{politician.courtCases.length !== 1 ? 's' : ''} found via CourtListener
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {politician.courtCases.map((c, i) => {
                      const card = (
                        <div className="terminal-card" style={{
                          padding: '1rem',
                          cursor: c.url ? 'pointer' : 'default',
                          transition: 'border-color 0.2s',
                        }}
                          onMouseEnter={e => { if (c.url) e.currentTarget.style.borderColor = 'var(--terminal-blue)'; }}
                          onMouseLeave={e => { if (c.url) e.currentTarget.style.borderColor = 'var(--terminal-border)'; }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {c.summary || 'Untitled Case'}
                                {c.url && <span style={{ fontSize: '0.65rem', color: 'var(--terminal-blue)', fontWeight: 400 }}>&#8599;</span>}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.35rem' }}>
                                {c.court && <span>{c.court}</span>}
                                {c.caseNumber && <span>Docket: {c.caseNumber}</span>}
                                {c.caseType && c.caseType !== 'Civil' && <span>Type: {c.caseType}</span>}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
                              <span style={{
                                fontSize: '0.65rem', fontWeight: 700, padding: '0.2rem 0.5rem',
                                background: c.status === 'Active' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(0, 191, 255, 0.08)',
                                color: c.status === 'Active' ? 'var(--terminal-amber)' : 'var(--terminal-blue)',
                                border: c.status === 'Active' ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(0, 191, 255, 0.2)',
                                textTransform: 'uppercase',
                              }}>
                                {c.status}
                              </span>
                            </div>
                          </div>
                          <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', color: 'var(--terminal-text-dim)', borderTop: '1px solid var(--terminal-border)', paddingTop: '0.4rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <span>
                              {c.filedDate && `Filed: ${new Date(c.filedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                              {c.filedDate && c.dateTerminated && ' — '}
                              {c.dateTerminated && `Terminated: ${new Date(c.dateTerminated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                            </span>
                            {c.url && (
                              <span style={{ color: 'var(--terminal-blue)', fontSize: '0.65rem' }}>
                                View on CourtListener &#8599;
                              </span>
                            )}
                          </div>
                        </div>
                      );
                      return c.url ? (
                        <a key={c.id || i} href={c.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
                          {card}
                        </a>
                      ) : (
                        <div key={c.id || i}>{card}</div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: '1rem', fontSize: '0.65rem', color: 'var(--terminal-text-dim)' }}>
                    Source: CourtListener (courtlistener.com) — federal court dockets and opinions
                  </div>
                </>
              ) : (
                <div className="terminal-card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>&#9878;</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--terminal-text-dim)' }}>
                    NO COURT RECORDS FOUND
                  </div>
                  <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.8rem' }}>
                    No federal court cases found for this official in the CourtListener database.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="classified-footer">
        ALL DATA ACQUIRED VIA OSINT // PUBLIC RECORDS: FEC, FL DOE, LDA, LEGISCAN
        {politician.lastUpdated && (
          <span> // LAST UPDATED: {new Date(politician.lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        )}
      </div>
    </div>
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
      <div className="terminal-card" style={{ textAlign: 'center', padding: '3rem' }}>
        <div style={{ color: 'var(--terminal-text-dim)' }}>Loading social intelligence...</div>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="terminal-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
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
      <div className="terminal-card">
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
  // Raw dollars only — no K/M rounding so numbers match across the whole page
  // and citizens verifying against FEC see exact figures.
  if (!Number.isFinite(n)) return '$0';
  const r = Math.round(n);
  return `${r < 0 ? '-' : ''}$${Math.abs(r).toLocaleString('en-US')}`;
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
        label: 'Pro-Israel Lobby',
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
        tag: ie.is_israel_lobby ? 'PRO-ISRAEL LOBBY' : ie.support_oppose === 'support' ? 'SUPPORT' : 'OPPOSE',
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
      <div className="terminal-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
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

  // Render tree — wrap in overflow-x-auto so deep nesting doesn't overflow viewport on mobile (UI-SPEC §10, D-39)
  return (
    <div className="overflow-x-auto">
      {/* Controls */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button className="terminal-btn" onClick={expandAll} style={{ padding: '0.4rem 0.75rem', fontSize: '0.7rem' }}>EXPAND ALL</button>
        <button className="terminal-btn" onClick={collapseAll} style={{ padding: '0.4rem 0.75rem', fontSize: '0.7rem' }}>COLLAPSE ALL</button>
      </div>

      {/* Root node */}
      <div className="terminal-card" style={{ padding: 0, overflow: 'hidden' }}>
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
      <div className="terminal-card" style={{ marginTop: '1.5rem' }}>
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
            <span style={{ fontWeight: 700, color: '#ef4444' }}>🇮🇱 Pro-Israel Lobby</span>
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
  // Per UI-SPEC §10 / PLAN-spec: pl-3 (12 px) per nesting level instead of the
  // old varying paddingLeft math. Keeps nesting readable on narrow viewports.
  const indent = depth * 12;

  return (
    <div>
      <div
        onClick={() => hasChildren && toggle(node.id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.6rem 1rem',
          paddingLeft: `${indent + 12}px`,
          cursor: hasChildren ? 'pointer' : 'default',
          borderLeft: depth > 0 ? `1px solid var(--terminal-border)` : 'none',
          marginLeft: depth > 0 ? `${(depth - 1) * 12 + 16}px` : 0,
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

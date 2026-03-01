'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getAllPoliticians } from '@/lib/real-data';

// JFK-VOTING: Congress API configuration
const JFK_CONGRESS_API_KEY = process.env.NEXT_PUBLIC_CONGRESS_API_KEY || '';
const JFK_CONGRESS_API_BASE = 'https://api.congress.gov/v3';

// JFK-VOTING: Types for vote data
interface JFKVoteRecord {
  date: string;
  question: string;
  description?: string;
  result: string;
  voteNumber?: string;
  member?: {
    votePosition: string;
  };
  bill?: {
    number: string;
    title: string;
    description?: string;
    type: string;
  };
  amendment?: {
    number: string;
  };
  nomination?: {
    number: string;
  };
}

interface JFKVoteBreakdown {
  yes: number;
  no: number;
  abstain: number;
  absent: number;
}

type JFKBillFilter = 'all' | 'israel' | 'defense' | 'domestic' | 'foreign' | 'anti-america-first';

export default function PoliticianPage() {
  const params = useParams();
  const [activeTab, setActiveTab] = useState<string>('overview');

  // JFK-VOTING: State for votes data
  const [jfkVotes, setJfkVotes] = useState<JFKVoteRecord[]>([]);
  const [jfkVotesLoading, setJfkVotesLoading] = useState(false);
  const [jfkVotesError, setJfkVotesError] = useState<string | null>(null);
  const [jfkBillFilter, setJfkBillFilter] = useState<JFKBillFilter>('all');

  const politician = getAllPoliticians().find(p => p.id === params.id);

  // JFK-VOTING: Fetch votes when votes tab is active
  useEffect(() => {
    const bioguideId = politician?.source_ids?.bioguide_id;
    if (activeTab === 'votes' && bioguideId && jfkVotes.length === 0 && !jfkVotesLoading) {
      jfkFetchVotingRecords(bioguideId);
    }
  }, [activeTab, politician]);

  // JFK-VOTING: Fetch voting records from Congress API
  const jfkFetchVotingRecords = async (bioguideId: string) => {
    setJfkVotesLoading(true);
    setJfkVotesError(null);

    try {
      const response = await fetch(
        `${JFK_CONGRESS_API_BASE}/house-vote/119/1?limit=50&sort=updateDate+desc&api_key=${JFK_CONGRESS_API_KEY}`
      );

      if (!response.ok) {
        throw new Error(`Congress API error: ${response.status}`);
      }

      const data = await response.json();
      const houseVotes = data.houseRollCallVotes ?? data.houseVotes ?? data.votes ?? [];

      if (!Array.isArray(houseVotes) || houseVotes.length === 0) {
        setJfkVotes([]);
        return;
      }

      const memberVotePromises = houseVotes.map(async (vote: any): Promise<JFKVoteRecord | null> => {
        const voteNumber = vote.rollCallNumber || vote.rollNumber || vote.voteNumber;
        if (!voteNumber) return null;

        try {
          // JFK-VOTING: Fetch vote details, member votes, AND bill summary
          const [voteDetailResponse, membersResponse] = await Promise.all([
            fetch(`${JFK_CONGRESS_API_BASE}/house-vote/119/1/${voteNumber}?api_key=${JFK_CONGRESS_API_KEY}`),
            fetch(`${JFK_CONGRESS_API_BASE}/house-vote/119/1/${voteNumber}/members?api_key=${JFK_CONGRESS_API_KEY}`)
          ]);

          // Get vote details (contains voteQuestion)
          let voteQuestion = '';
          let voteDetail: any = {};
          if (voteDetailResponse.ok) {
            voteDetail = await voteDetailResponse.json();
            const voteData = voteDetail.houseRollCallVote || voteDetail;
            voteQuestion = voteData.voteQuestion || '';
          }

          // JFK-VOTING: Fetch bill summary if bill number exists
          let billSummary = '';
          let billTitle = '';
          if (vote.legislationType && vote.legislationNumber) {
            try {
              const billResponse = await fetch(
                `${JFK_CONGRESS_API_BASE}/bill/119/${vote.legislationType.toLowerCase()}/${vote.legislationNumber}/summaries?api_key=${JFK_CONGRESS_API_KEY}`
              );
              if (billResponse.ok) {
                const billData = await billResponse.json();
                const summaries = billData.summaries || [];
                if (summaries.length > 0) {
                  // Strip HTML tags from summary text
                  const rawText = summaries[0].text || '';
                  billSummary = rawText.replace(/<[^>]*>/g, '').substring(0, 300) + (rawText.length > 300 ? '...' : '');
                }
              }
              // Also fetch bill title
              const billDetailResponse = await fetch(
                `${JFK_CONGRESS_API_BASE}/bill/119/${vote.legislationType.toLowerCase()}/${vote.legislationNumber}?api_key=${JFK_CONGRESS_API_KEY}`
              );
              if (billDetailResponse.ok) {
                const billDetail = await billDetailResponse.json();
                billTitle = billDetail.bill?.title || '';
              }
            } catch (e) {
              // Bill fetch failed, continue without summary
              console.log('Bill fetch failed:', e);
            }
          }

          // Get member position
          if (!membersResponse.ok) return null;

          const membersData = await membersResponse.json();
          const voteData = membersData.houseRollCallVoteMemberVotes || membersData;
          const members = voteData.results ?? voteData.members ?? [];
          if (!Array.isArray(members)) return null;

          const matchedMember = members.find((member: any) => {
            const memberBioguide = member.bioguideID || member.bioguideId || member.member?.bioguideId;
            return memberBioguide === bioguideId;
          });

          if (!matchedMember) return null;

          const votePosition =
            matchedMember.voteCast || matchedMember.partyVote || matchedMember.votePosition || matchedMember.position;

          return {
            date: vote.updateDate || vote.startDate || vote.actionDate || vote.date || new Date().toISOString(),
            question: voteQuestion || `${vote.legislationType || 'HR'} ${vote.legislationNumber || voteNumber}`,
            result: vote.result || vote.voteResult || 'Unknown',
            voteNumber: String(voteNumber),
            member: {
              votePosition: votePosition || 'Not Voting',
            },
            bill: vote.legislationUrl
              ? {
                  number: `${vote.legislationType} ${vote.legislationNumber}`,
                  title: billTitle || voteQuestion || `${vote.legislationType} ${vote.legislationNumber}`,
                  description: billSummary || voteQuestion || undefined,
                  type: vote.legislationType || '',
                }
              : undefined,
          };
        } catch {
          // keep partial results if one vote-member request fails
          return null;
        }
      });

      const votesWithMember = (await Promise.all(memberVotePromises))
        .filter((vote): vote is JFKVoteRecord => Boolean(vote))
        .slice(0, 20);

      setJfkVotes(votesWithMember);
    } catch (error) {
      console.error('JFK-VOTING: Error fetching votes:', error);
      setJfkVotesError(error instanceof Error ? error.message : 'Failed to load voting records');
    } finally {
      setJfkVotesLoading(false);
    }
  };

  // JFK-VOTING: Calculate vote breakdown statistics
  const jfkCalculateVoteBreakdown = (votes: JFKVoteRecord[]): JFKVoteBreakdown => {
    return votes.reduce(
      (acc, vote) => {
        // JFK-VOTING: Handle missing member data
        if (!vote.member?.votePosition) {
          acc.absent++;
          return acc;
        }
        
        const position = vote.member.votePosition.toLowerCase();
        if (position === 'yes' || position === 'yea' || position === 'aye') {
          acc.yes++;
        } else if (position === 'no' || position === 'nay') {
          acc.no++;
        } else if (position === 'present' || position === 'not voting') {
          acc.abstain++;
        } else {
          acc.absent++;
        }
        return acc;
      },
      { yes: 0, no: 0, abstain: 0, absent: 0 }
    );
  };

  // JFK-VOTING: Filter votes by bill type
  const jfkFilterVotes = (votes: JFKVoteRecord[], filter: JFKBillFilter): JFKVoteRecord[] => {
    if (filter === 'all') return votes;

    return votes.filter(vote => {
      const title = (vote.bill?.title || vote.question || '').toLowerCase();
      const description = (vote.bill?.description || '').toLowerCase();
      const fullText = title + ' ' + description;
      
      if (filter === 'israel') {
        return title.includes('israel') || title.includes('gaza') || title.includes('palestine') || title.includes('middle east');
      } else if (filter === 'defense') {
        return title.includes('defense') || title.includes('military') || title.includes('armed forces') || title.includes('national security') || title.includes('weapon') || title.includes('armed services');
      } else if (filter === 'domestic') {
        return !title.includes('foreign') && !title.includes('international') && !title.includes('immigration');
      } else if (filter === 'foreign') {
        // Foreign Affairs - broad foreign policy votes
        return fullText.includes('foreign') || 
               fullText.includes('international') ||
               fullText.includes('state department') ||
               fullText.includes('embassy') ||
               fullText.includes('diplomatic') ||
               fullText.includes('treaty') ||
               fullText.includes('alliance') ||
               fullText.includes('united nations') ||
               fullText.includes('nato') ||
               fullText.includes('trade agreement') ||
               fullText.includes('sanctions') ||
               fullText.includes('humanitarian aid') ||
               title.includes('ukraine') ||
               title.includes('russia') ||
               title.includes('china');
      } else if (filter === 'anti-america-first') {
        // Anti-America First - globalist/internationalist policies
        return fullText.includes('united nations') ||
               fullText.includes('un funding') ||
               fullText.includes('who funding') ||
               fullText.includes('paris agreement') ||
               fullText.includes('global climate') ||
               fullText.includes('international court') ||
               fullText.includes('global tax') ||
               fullText.includes('foreign aid') && !fullText.includes('israel') ||
               fullText.includes('multilateral') ||
               fullText.includes('world bank') ||
               fullText.includes('imf') ||
               fullText.includes('refugee admission') ||
               fullText.includes('migration compact') ||
               fullText.includes('open border');
      }
      
      return true;
    });
  };

  // JFK-VOTING: Format vote position with color
  const jfkGetVoteColor = (position?: string) => {
    if (!position) return 'var(--terminal-text-dim)';
    const pos = position.toLowerCase();
    if (pos === 'yes' || pos === 'yea' || pos === 'aye') return 'var(--terminal-green)';
    if (pos === 'no' || pos === 'nay') return 'var(--terminal-red)';
    if (pos === 'present' || pos === 'not voting') return 'var(--terminal-amber)';
    return 'var(--terminal-text-dim)';
  };

  // JFK-VOTING: Format vote position label
  const jfkFormatVotePosition = (position?: string) => {
    if (!position) return 'UNKNOWN';
    const pos = position.toLowerCase();
    if (pos === 'yea' || pos === 'aye') return 'YES';
    if (pos === 'nay') return 'NO';
    if (pos === 'not voting') return 'ABSENT';
    return position.toUpperCase();
  };

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

  const tabs = [
    { id: 'overview', label: 'OVERVIEW', icon: '📋' },
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
            CORRUPTION RISK: {politician.corruptionScore}/100 - {
              politician.corruptionScore < 40 ? 'LOW' : 
              politician.corruptionScore < 60 ? 'MEDIUM' : 
              'HIGH'
            }
          </span>
          <span style={{ fontSize: '0.875rem', color: 'var(--terminal-text-dim)', marginLeft: '1rem' }}>
            {politician.juiceBoxTier !== 'none' 
              ? `${getJuiceBoxLabel(politician.juiceBoxTier)} - $${(politician.aipacFunding / 1000).toFixed(0)}K AIPAC`
              : 'NO FOREIGN LOBBY FUNDING DETECTED'}
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
                      Corruption Risk
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 700, color: getScoreColor(politician.corruptionScore), fontFamily: 'Bebas Neue, sans-serif' }}>
                      {politician.corruptionScore}/100
                    </div>
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

          {/* JFK-VOTING: Voting & Policy Tab */}
          {activeTab === 'votes' && (
            <div>
              {!politician.source_ids?.bioguide_id ? (
                // JFK-VOTING: No bioguide ID available
                <div className="terminal-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                  <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>ℹ️</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--terminal-text)' }}>
                    CONGRESS API DATA AVAILABLE FOR FEDERAL OFFICIALS ONLY
                  </div>
                  <div style={{ color: 'var(--terminal-text-dim)', marginTop: '1rem' }}>
                    Voting records require a Congress.gov bioguide ID.<br />
                    This politician is {politician.office.toLowerCase()} and may not have federal voting records.
                  </div>
                </div>
              ) : jfkVotesError ? (
                // JFK-VOTING: Error state
                <div className="terminal-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                  <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>⚠️</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--terminal-red)' }}>
                    ERROR LOADING VOTING RECORDS
                  </div>
                  <div style={{ color: 'var(--terminal-text-dim)', marginTop: '1rem', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.875rem' }}>
                    {jfkVotesError}
                  </div>
                  <button
                    onClick={() => politician.source_ids?.bioguide_id && jfkFetchVotingRecords(politician.source_ids.bioguide_id)}
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
              ) : jfkVotesLoading ? (
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
                      📊 VOTE BREAKDOWN (LAST {jfkVotes.length} VOTES)
                    </h3>
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
                      gap: '1.5rem',
                    }}>
                      {(() => {
                        const breakdown = jfkCalculateVoteBreakdown(jfkVotes);
                        return (
                          <>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'JetBrains Mono, monospace' }}>
                                YES
                              </div>
                              <div style={{ fontSize: '3rem', fontWeight: 700, color: 'var(--terminal-green)', fontFamily: 'JetBrains Mono, monospace' }}>
                                {breakdown.yes}
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'JetBrains Mono, monospace' }}>
                                NO
                              </div>
                              <div style={{ fontSize: '3rem', fontWeight: 700, color: 'var(--terminal-red)', fontFamily: 'JetBrains Mono, monospace' }}>
                                {breakdown.no}
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
                    {(['all', 'israel', 'defense', 'foreign', 'anti-america-first', 'domestic'] as JFKBillFilter[]).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setJfkBillFilter(filter)}
                        style={{
                          padding: '0.5rem 1rem',
                          background: jfkBillFilter === filter ? 'var(--terminal-amber)' : 'transparent',
                          border: `1px solid ${jfkBillFilter === filter ? 'var(--terminal-amber)' : 'var(--terminal-border)'}`,
                          color: jfkBillFilter === filter ? '#000' : 'var(--terminal-text)',
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
                        {filter !== 'all' && ` (${jfkFilterVotes(jfkVotes, filter).length})`}
                      </button>
                    ))}
                  </div>

                  {/* JFK-VOTING: Recent Votes Grid */}
                  <div className="terminal-card">
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--terminal-amber)', fontFamily: 'JetBrains Mono, monospace' }}>
                      🗳️ RECENT VOTES
                    </h3>
                    {(() => {
                      const filteredVotes = jfkFilterVotes(jfkVotes, jfkBillFilter);
                      
                      if (filteredVotes.length === 0) {
                        return (
                          <div style={{ textAlign: 'center', padding: '3rem 2rem', color: 'var(--terminal-text-dim)' }}>
                            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔍</div>
                            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.875rem' }}>
                              No votes found for filter: {jfkBillFilter.toUpperCase()}
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
                                border: `1px solid ${jfkGetVoteColor(vote.member?.votePosition)}`,
                                borderLeft: `4px solid ${jfkGetVoteColor(vote.member?.votePosition)}`,
                                fontFamily: 'JetBrains Mono, monospace',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '1rem', marginBottom: '1rem' }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                    {vote.bill?.number || vote.amendment?.number || vote.nomination?.number || 'PROCEDURAL VOTE'}
                                  </div>
                                  <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--terminal-text)' }}>
                                    {vote.bill?.title || vote.question}
                                  </div>
                                  {/* Show bill description (what the bill is about) */}
                                  {vote.bill?.description && (
                                    <div style={{ fontSize: '0.875rem', color: '#fff', marginBottom: '0.75rem', lineHeight: 1.6 }}>
                                      {vote.bill.description}
                                    </div>
                                  )}
                                  {/* Show procedural question in dimmer text */}
                                  {vote.question && (
                                    <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginBottom: '0.5rem', fontStyle: 'italic' }}>
                                      Vote: {vote.question}
                                    </div>
                                  )}
                                  <div style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)' }}>
                                    {new Date(vote.date).toLocaleDateString('en-US', { 
                                      month: 'short', 
                                      day: 'numeric',
                                      year: 'numeric'
                                    })} • Result: {vote.result}
                                  </div>
                                </div>
                                <div style={{ 
                                  padding: '0.75rem 1.5rem',
                                  background: jfkGetVoteColor(vote.member?.votePosition),
                                  color: '#000',
                                  fontWeight: 700,
                                  fontSize: '1rem',
                                  textAlign: 'center',
                                  minWidth: '100px',
                                  letterSpacing: '0.05em',
                                }}>
                                  {jfkFormatVotePosition(vote.member?.votePosition)}
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

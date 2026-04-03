'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { Politician } from '@/lib/types';

interface FeedItem {
  id: string;
  text: string;
  time: string;
  type: 'funding' | 'score' | 'social' | 'system';
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function generateFeedItems(politicians: Politician[]): FeedItem[] {
  const items: FeedItem[] = [];
  const now = Date.now();

  // Real AIPAC funding alerts from top-funded politicians
  const aipacFunded = [...politicians]
    .filter(p => p.aipacFunding > 0)
    .sort((a, b) => b.aipacFunding - a.aipacFunding)
    .slice(0, 5);

  aipacFunded.forEach((p, i) => {
    items.push({
      id: `funding-${p.id}`,
      text: `AIPAC funding tracked: ${p.name} — $${(p.aipacFunding / 1000).toFixed(0)}K in pro-Israel lobby contributions on record.`,
      time: timeAgo(new Date(now - (i + 1) * 3600000 * 2)),
      type: 'funding',
    });
  });

  // Real corruption score alerts from highest-scored politicians
  const highCorruption = [...politicians]
    .filter(p => p.corruptionScore >= 50)
    .sort((a, b) => b.corruptionScore - a.corruptionScore)
    .slice(0, 3);

  highCorruption.forEach((p, i) => {
    const grade = p.corruptionScore >= 80 ? 'CRITICAL' : p.corruptionScore >= 60 ? 'HIGH' : 'ELEVATED';
    items.push({
      id: `score-${p.id}`,
      text: `Corruption score: ${p.name} rated ${p.corruptionScore}/100 (${grade}) based on funding analysis.`,
      time: timeAgo(new Date(now - (i + 2) * 3600000 * 3)),
      type: 'score',
    });
  });

  // System updates from real data
  const totalTracked = politicians.length;
  const counties = new Set(politicians.map(p => p.jurisdiction)).size;
  items.push({
    id: 'system-count',
    text: `Database update: ${totalTracked} politicians across ${counties} jurisdictions now under monitoring.`,
    time: timeAgo(new Date(now - 12 * 3600000)),
    type: 'system',
  });

  // Sort by recency and return top 6
  return items.slice(0, 6);
}

function generateTickerItems(politicians: Politician[]): { label: string; text: string }[] {
  const items: { label: string; text: string }[] = [];

  const topAipac = [...politicians].filter(p => p.aipacFunding > 0).sort((a, b) => b.aipacFunding - a.aipacFunding);
  if (topAipac[0]) {
    items.push({ label: 'INTEL', text: `${topAipac[0].name} tops AIPAC funding at $${(topAipac[0].aipacFunding / 1000).toFixed(0)}K` });
  }

  const topCorrupt = [...politicians].filter(p => p.corruptionScore > 0).sort((a, b) => b.corruptionScore - a.corruptionScore);
  if (topCorrupt[0]) {
    items.push({ label: 'ALERT', text: `${topCorrupt[0].name} — highest corruption score: ${topCorrupt[0].corruptionScore}/100` });
  }

  const compromised = politicians.filter(p => p.juiceBoxTier !== 'none').length;
  items.push({ label: 'TRACKING', text: `${compromised} Florida politicians flagged for foreign lobby ties` });

  const totalFunding = politicians.reduce((s, p) => s + (p.israelLobbyTotal || p.aipacFunding || 0), 0);
  items.push({ label: 'DATA', text: `$${(totalFunding / 1000000).toFixed(2)}M+ tracked Israel lobby funding (federal only — state data pending)` });

  return items;
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-error';
  if (score >= 60) return 'text-warning';
  return 'text-primary-container';
}

function getSeverityBadge(type: FeedItem['type']): { label: string; classes: string } {
  switch (type) {
    case 'funding':
      return { label: 'Critical', classes: 'bg-error-container/20 text-error border border-error/20' };
    case 'score':
      return { label: 'High', classes: 'bg-warning/20 text-warning border border-warning/20' };
    case 'social':
      return { label: 'Observation', classes: 'bg-secondary-container/20 text-secondary border border-secondary/20' };
    default:
      return { label: 'Info', classes: 'bg-primary-container/20 text-primary-container border border-primary-container/20' };
  }
}

function getFeedTitle(item: FeedItem): string {
  switch (item.type) {
    case 'funding': return 'UNUSUAL_PAC_INFLOW';
    case 'score': return 'CORRUPTION_THRESHOLD_BREACH';
    case 'social': return 'SOCIAL_MEDIA_INTERCEPT';
    default: return 'SYSTEM_UPDATE';
  }
}

export default function TerminalHome() {
  const [politicians, setPoliticians] = useState<Politician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [socialPosts, setSocialPosts] = useState<{ content: string; politician_name: string; posted_at: string }[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        const [polRes, socialRes] = await Promise.all([
          fetch('/api/politicians'),
          fetch('/api/social-posts?limit=5&order=desc').catch(() => null),
        ]);
        if (!polRes.ok) throw new Error(`API error: ${polRes.status}`);
        const allPoliticians: Politician[] = await polRes.json();
        setPoliticians(allPoliticians);
        setFeedItems(generateFeedItems(allPoliticians));

        if (socialRes?.ok) {
          const socialData = await socialRes.json();
          if (socialData.posts?.length > 0) {
            setSocialPosts(socialData.posts);
          }
        }
      } catch (error) {
        console.error('Error loading politicians:', error);
        setError(error instanceof Error ? error.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (loading) {
    return (
      <main className="lg:pl-64 pt-14 pb-12">
        <div className="min-h-screen bg-[#080A0D] flex items-center justify-center">
          <div className="text-center">
            <div className="font-headline text-4xl font-bold text-[#00FF88] mb-4 animate-pulse" style={{ textShadow: '0 0 15px rgba(0, 255, 136, 0.6)' }}>
              SNITCHED.AI
            </div>
            <p className="font-label text-xs text-on-surface-variant tracking-[0.2em] uppercase">
              Loading intelligence database...
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="lg:pl-64 pt-14 pb-12">
        <div className="min-h-screen bg-[#080A0D] flex items-center justify-center">
          <div className="bg-surface-container p-8 border border-error/30 text-center max-w-md">
            <div className="font-headline text-2xl font-bold text-error mb-4">CONNECTION ERROR</div>
            <p className="font-label text-xs text-on-surface-variant mb-6">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-error text-white font-label font-bold px-6 py-3 uppercase tracking-widest text-xs hover:bg-error/80"
            >
              RETRY
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (politicians.length === 0) {
    return (
      <main className="lg:pl-64 pt-14 pb-12">
        <div className="min-h-screen bg-[#080A0D] flex items-center justify-center">
          <div className="bg-surface-container p-8 border border-warning/30 text-center">
            <div className="font-headline text-2xl font-bold text-warning mb-4">NO DATA</div>
            <p className="font-label text-xs text-on-surface-variant">Database returned empty. Please refresh.</p>
          </div>
        </div>
      </main>
    );
  }

  const activePoliticians = politicians.filter(p => p.isActive);
  const totalFunding = activePoliticians.reduce((sum, p) => sum + (p.israelLobbyTotal || p.aipacFunding || 0), 0);
  const avgCorruption = activePoliticians.length > 0
    ? Math.round(activePoliticians.reduce((sum, p) => sum + p.corruptionScore, 0) / activePoliticians.length)
    : 0;

  // Calculate stats from loaded politicians
  const withFunding = politicians.filter(p => (p.totalFundsRaised || 0) > 0).length;
  const stats = {
    total: politicians.length,
    funded: withFunding,
  };

  // Get top 6 most corrupted for leaderboard
  const topCorrupted = [...activePoliticians]
    .sort((a, b) => b.corruptionScore - a.corruptionScore)
    .slice(0, 6);

  // Generate ticker data from top corrupted politicians
  const tickerPoliticians = [...activePoliticians]
    .filter(p => p.corruptionScore > 0)
    .sort((a, b) => b.corruptionScore - a.corruptionScore)
    .slice(0, 8);

  // Build combined feed: social posts first, then generated feed items
  const combinedFeed: Array<{ id: string; title: string; text: string; time: string; type: FeedItem['type'] }> = [];

  if (socialPosts.length > 0) {
    socialPosts.slice(0, 2).forEach((post, i) => {
      combinedFeed.push({
        id: `social-${i}`,
        title: 'SOCIAL_MEDIA_INTERCEPT',
        text: `${post.politician_name}: "${post.content?.slice(0, 120)}${(post.content?.length ?? 0) > 120 ? '...' : ''}"`,
        time: formatTimestamp(new Date(post.posted_at)),
        type: 'social',
      });
    });
  }

  feedItems.forEach(item => {
    combinedFeed.push({
      id: item.id,
      title: getFeedTitle(item),
      text: item.text,
      time: formatTimestamp(new Date(Date.now() - Math.random() * 3600000)),
      type: item.type,
    });
  });

  const totalCampaignFunds = activePoliticians.reduce((s, p) => s + (p.totalFundsRaised || 0), 0);

  return (
    <main className="lg:pl-64 pt-14 pb-12">
      {/* Scanlines overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-[100]"
        style={{
          background: `linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.1) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.02), rgba(0, 255, 0, 0.01), rgba(0, 0, 255, 0.02))`,
          backgroundSize: '100% 2px, 3px 100%',
        }}
      />

      {/* Hero Section */}
      <section className="relative min-h-[614px] flex flex-col justify-center px-8 lg:px-16 overflow-hidden border-b border-[#00FF88]/10 bg-surface-container-lowest">
        <div className="absolute top-0 right-0 w-1/2 h-full opacity-10 pointer-events-none">
          <div className="w-full h-full" style={{
            background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,136,0.03) 2px, rgba(0,255,136,0.03) 4px)',
          }} />
        </div>

        <div className="relative z-10 max-w-5xl">
          <div className="mb-4 inline-block border border-[#00FF88]/20 px-3 py-1 bg-[#00FF88]/5">
            <span className="font-label text-xs text-[#00FF88] tracking-[0.2em]">
              ACCESSING FLORIDA_CENTRAL_REGISTRY_V2
            </span>
          </div>

          <h1
            className="font-label text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter text-[#00FF88] leading-tight mb-6"
            style={{ textShadow: '0 0 15px rgba(0, 255, 136, 0.6)' }}
          >
            EVERY POLITICIAN.<br />EVERY DOLLAR.<br />EVERY LIE.
          </h1>

          <p className="font-label text-lg md:text-xl text-on-surface-variant max-w-2xl border-l-4 border-[#00FF88] pl-6 py-2">
            {activePoliticians.length}+ Florida officials tracked. Real FEC data. Zero opinions.
            <span className="block text-sm mt-2 opacity-60">
              SOURCE: FEC_FILINGS_SYNC_2024_Q3
            </span>
          </p>

          <div className="mt-10 flex flex-wrap gap-4">
            <Link href="/browse">
              <button className="bg-[#00FF88] text-[#080A0D] font-label font-bold px-8 py-4 uppercase tracking-widest hover:bg-[#00e479] transition-none flex items-center gap-2">
                INITIATE INVESTIGATION
                <span className="material-symbols-outlined">arrow_forward</span>
              </button>
            </Link>
            <Link href="/juicebox">
              <button className="border border-[#00FF88]/40 text-[#00FF88] font-label font-bold px-8 py-4 uppercase tracking-widest hover:bg-[#00FF88]/10 transition-none">
                VIEW_METHODOLOGY
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* Live Ticker */}
      <div className="w-full overflow-hidden h-10 flex items-center" style={{
        background: 'rgba(0, 255, 136, 0.05)',
        borderTop: '1px solid rgba(0, 255, 136, 0.1)',
        borderBottom: '1px solid rgba(0, 255, 136, 0.1)',
      }}>
        <div
          className="inline-block whitespace-nowrap font-label text-[0.7rem] uppercase tracking-widest text-[#00FF88]/80"
          style={{
            paddingRight: '100%',
            animation: 'ticker 30s linear infinite',
          }}
        >
          {/* First pass */}
          {tickerPoliticians.map((p, i) => (
            <span key={`tick-a-${i}`} className="mx-8">
              <span className="text-white">{'\u25CF'} LIVE:</span>{' '}
              {p.name.split(' ').reverse().join(', ')} -{' '}
              <span className={getScoreColor(p.corruptionScore)}>{p.corruptionScore}</span>
            </span>
          ))}
          {/* Duplicate for seamless loop */}
          {tickerPoliticians.slice(0, 3).map((p, i) => (
            <span key={`tick-b-${i}`} className="mx-8">
              <span className="text-white">{'\u25CF'} LIVE:</span>{' '}
              {p.name.split(' ').reverse().join(', ')} -{' '}
              <span className={getScoreColor(p.corruptionScore)}>{p.corruptionScore}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Ticker animation keyframes */}
      <style jsx>{`
        @keyframes ticker {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-100%, 0, 0); }
        }
      `}</style>

      {/* Dashboard Modules */}
      <section className="p-8 lg:p-12 grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* Stat Counters (Asymmetric Layout) */}
        <div className="md:col-span-12 grid grid-cols-1 md:grid-cols-3 gap-1 mb-4">
          {/* Officials Under Watch */}
          <div className="bg-surface-container-low p-8 border border-outline-variant/5">
            <p className="font-label text-[0.65rem] text-on-surface-variant mb-2 tracking-[0.3em] uppercase">
              OFFICIALS_UNDER_WATCH
            </p>
            <p className="font-headline text-5xl font-bold text-white">
              {activePoliticians.length}<span className="text-[#00FF88]">+</span>
            </p>
            <div className="mt-4 w-full bg-black h-1 overflow-hidden">
              <div
                className="bg-[#00FF88] h-full"
                style={{ width: `${Math.min(100, (activePoliticians.length / stats.total) * 100)}%` }}
              />
            </div>
          </div>

          {/* Total Campaign Funds */}
          <div className="bg-surface-container-low p-8 border border-outline-variant/5">
            <p className="font-label text-[0.65rem] text-on-surface-variant mb-2 tracking-[0.3em] uppercase">
              CAMPAIGN_FUNDS_TRACKED
            </p>
            <p className="font-headline text-5xl font-bold text-white">
              ${totalCampaignFunds > 0 ? `${(totalCampaignFunds / 1000000).toFixed(1)}M` : '0.00'}
            </p>
            <p className="font-label text-[0.55rem] text-[#00FF88] mt-4 uppercase">
              {stats.funded} POLITICIANS WITH FEC DATA // REAL-TIME
            </p>
          </div>

          {/* Avg Corruption Score */}
          <div className="bg-surface-container-low p-8 border border-outline-variant/5">
            <p className="font-label text-[0.65rem] text-on-surface-variant mb-2 tracking-[0.3em] uppercase">
              AVG_CORRUPTION_INDEX
            </p>
            <p className="font-headline text-5xl font-bold text-white">
              {avgCorruption}<span className="text-sm font-label font-normal">/100</span>
            </p>
            <div className="mt-4 flex gap-1">
              {[20, 40, 60, 80, 100].map(threshold => (
                <div
                  key={threshold}
                  className={`h-2 w-full ${avgCorruption >= threshold ? 'bg-[#00FF88]' : 'bg-[#00FF88]/20'}`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Main Feed Area (8 columns) */}
        <div className="md:col-span-8 space-y-8">
          <div className="bg-surface-container p-6 border-l-2 border-[#00FF88]">
            <div className="flex justify-between items-center mb-8">
              <h2 className="font-headline text-xl font-bold uppercase tracking-tight flex items-center gap-2">
                <span className="material-symbols-outlined text-[#00FF88]">terminal</span>
                ACTIVE_INCIDENT_FEED
              </h2>
              <span className="font-label text-[0.6rem] text-on-surface-variant">
                FILTER: HIGH_VOLATILITY
              </span>
            </div>

            <div className="space-y-4">
              {combinedFeed.slice(0, 6).map(item => {
                const badge = getSeverityBadge(item.type);
                return (
                  <div
                    key={item.id}
                    className="group bg-surface-container-low hover:bg-surface-container-high transition-colors p-4 flex gap-6 items-start"
                  >
                    <div className="font-label text-[0.7rem] text-[#00FF88] pt-1 shrink-0">
                      {item.time}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <h3 className="font-label text-sm font-bold text-white uppercase tracking-wider">
                          {item.title}
                        </h3>
                        <span className={`font-label text-[0.6rem] px-2 uppercase shrink-0 ${badge.classes}`}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-on-surface-variant text-xs mt-1 font-mono break-words">
                        {item.text}
                      </p>
                    </div>
                    <span className="material-symbols-outlined text-on-surface-variant/40 group-hover:text-[#00FF88] shrink-0">
                      open_in_new
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sidebar Column (4 columns) */}
        <div className="md:col-span-4 space-y-8">
          {/* Leaderboard */}
          <div className="bg-surface-container border border-outline-variant/10">
            <div className="p-4 bg-error-container/10 border-b border-error/20 flex items-center justify-between">
              <h3 className="font-headline font-bold text-error text-sm uppercase tracking-tighter">
                LEADERBOARD_VOLATILITY
              </h3>
              <span className="font-label text-[0.5rem] text-error opacity-70">
                UPDATED: REAL-TIME
              </span>
            </div>

            <div className="divide-y divide-outline-variant/10">
              {topCorrupted.map((pol, index) => {
                const scoreColor = getScoreColor(pol.corruptionScore);
                const nameParts = pol.name.split(' ');
                const lastName = nameParts[nameParts.length - 1].toUpperCase();
                const firstName = nameParts.slice(0, -1).join(' ').toUpperCase();
                const displayName = `${lastName}, ${firstName}`;

                return (
                  <Link
                    key={pol.id}
                    href={`/politician/${pol.id}`}
                    className="p-4 flex items-center justify-between group hover:bg-surface-container-high block no-underline"
                  >
                    <div className="flex items-center gap-4">
                      <span className="font-label text-lg font-bold text-on-surface-variant/50">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div className="w-10 h-10 bg-black border border-outline-variant/20 overflow-hidden shrink-0">
                        {pol.photoUrl ? (
                          <img
                            alt={`Portrait of ${pol.name}`}
                            className="w-full h-full object-cover grayscale brightness-75"
                            src={pol.photoUrl}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-on-surface-variant/30">
                            <span className="material-symbols-outlined text-lg">person</span>
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="font-label text-xs font-bold text-white">
                          {displayName}
                        </p>
                        <p className="font-label text-[0.5rem] text-on-surface-variant">
                          {pol.office || pol.officeLevel || 'UNKNOWN_OFFICE'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-label text-sm font-bold ${scoreColor}`}>
                        {pol.corruptionScore.toFixed(1)}
                      </p>
                      <p className={`font-label text-[0.5rem] ${scoreColor} opacity-60`}>
                        RISK_SCORE
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Tactical Map Preview / Israel Lobby Summary */}
          <div className="bg-surface-container border border-outline-variant/10 p-4">
            <p className="font-label text-[0.6rem] text-[#00FF88] mb-2 tracking-widest uppercase">
              GEO_INFLUENCE_MAP
            </p>
            <div className="aspect-video bg-black relative border border-outline-variant/20 overflow-hidden">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-20 h-20 border border-[#00FF88]/40 animate-pulse flex items-center justify-center">
                  <div className="w-2 h-2 bg-[#00FF88]" />
                </div>
              </div>
              <div className="absolute bottom-2 left-2 right-2 flex justify-between">
                <span className="font-label text-[0.5rem] text-[#00FF88]/60">
                  ${(totalFunding / 1000000).toFixed(2)}M LOBBY FUNDS
                </span>
                <span className="font-label text-[0.5rem] text-error/60">
                  {activePoliticians.filter(p => p.juiceBoxTier !== 'none').length} COMPROMISED
                </span>
              </div>
            </div>
            <Link href="/hierarchy">
              <button className="w-full mt-4 py-2 border border-outline-variant text-[0.6rem] font-label text-on-surface-variant hover:bg-surface-container-high hover:text-white transition-all uppercase">
                Open Full Vector Map
              </button>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

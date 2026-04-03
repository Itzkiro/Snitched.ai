'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

interface SocialPost {
  id: string;
  politician_id: string;
  politician_name: string;
  platform: string;
  handle: string;
  content: string;
  post_url: string;
  posted_at: string;
  likes_count: number;
  shares_count: number;
  comments_count: number;
  views_count: number;
  sentiment_score: number | null;
  is_deleted: boolean;
  scraped_at: string;
}

interface DaemonStatus {
  status: string;
  lastRun: { started_at: string; posts_found: number; status: string } | null;
  lastRunMinutesAgo: number;
  totalPosts: number;
}

const PLATFORM_ICONS: Record<string, string> = {
  twitter: 'X',
  facebook: 'FB',
  instagram: 'IG',
  tiktok: 'TT',
  youtube: 'YT',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '00:00:00';
  }
}

function sentimentTag(score: number | null): { text: string; bgClass: string; textClass: string } {
  if (score == null) return { text: 'NEUTRAL', bgClass: 'bg-outline-variant', textClass: 'text-on-surface' };
  if (score > 0.5) return { text: 'BULLISH', bgClass: 'bg-primary-container', textClass: 'text-on-primary-fixed' };
  if (score > 0.3) return { text: 'TRENDING', bgClass: 'bg-primary-container/20', textClass: 'text-primary-container' };
  if (score < -0.5) return { text: 'HOT_SPIKE', bgClass: 'bg-on-tertiary-container', textClass: 'text-white' };
  if (score < -0.3) return { text: 'BEARISH', bgClass: 'bg-on-tertiary-container', textClass: 'text-white' };
  return { text: 'NEUTRAL', bgClass: 'bg-outline-variant', textClass: 'text-on-surface' };
}

/** Derive word-cloud terms from post content */
function extractCloudTerms(posts: SocialPost[]): Array<{ term: string; weight: number }> {
  const freq: Record<string, number> = {};
  for (const post of posts) {
    const words = post.content
      .split(/\s+/)
      .map(w => w.replace(/[^a-zA-Z0-9#@_]/g, '').toUpperCase())
      .filter(w => w.length > 3);
    for (const w of words) {
      freq[w] = (freq[w] || 0) + 1;
    }
  }
  return Object.entries(freq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 12)
    .map(([term, count]) => ({ term, weight: count }));
}

/** Font size classes based on weight rank */
const CLOUD_SIZES = [
  'text-5xl font-extrabold',
  'text-4xl font-black',
  'text-3xl font-bold',
  'text-2xl font-medium',
  'text-xl',
  'text-lg',
  'text-md',
  'text-sm',
  'text-xs',
  'text-xs',
  'text-[10px]',
  'text-[10px]',
];

/** Anomaly detection: find posts with highest engagement or sentiment extremes */
function detectAnomalies(posts: SocialPost[]): SocialPost[] {
  if (posts.length === 0) return [];
  const sorted = [...posts].sort((a, b) => {
    const engA = a.likes_count + a.shares_count + a.comments_count;
    const engB = b.likes_count + b.shares_count + b.comments_count;
    return engB - engA;
  });
  return sorted.slice(0, 3);
}

export default function SocialPage() {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [daemonStatus, setDaemonStatus] = useState<DaemonStatus | null>(null);
  const [platform, setPlatform] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPosts = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (platform) params.set('platform', platform);
      const res = await fetch(`/api/social-posts?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts || []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [platform]);

  const fetchDaemonStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/daemon-status');
      if (res.ok) {
        setDaemonStatus(await res.json());
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchPosts();
    fetchDaemonStatus();
  }, [fetchPosts, fetchDaemonStatus]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        fetchPosts();
        fetchDaemonStatus();
      }, 30_000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, fetchPosts, fetchDaemonStatus]);

  const cloudTerms = useMemo(() => extractCloudTerms(posts), [posts]);
  const anomalies = useMemo(() => detectAnomalies(posts), [posts]);

  const avgSentiment = useMemo(() => {
    const scored = posts.filter(p => p.sentiment_score != null);
    if (scored.length === 0) return 0;
    return scored.reduce((s, p) => s + (p.sentiment_score || 0), 0) / scored.length;
  }, [posts]);

  const anomalyScore = useMemo(() => {
    if (posts.length === 0) return 0;
    const maxEngagement = Math.max(...posts.map(p => p.likes_count + p.shares_count + p.comments_count));
    return Math.min(1, maxEngagement / 1000);
  }, [posts]);

  // Sparkline data from post engagement
  const sparklineData = useMemo(() => {
    return posts.slice(0, 30).map(p => {
      const eng = p.likes_count + p.shares_count + p.comments_count;
      return Math.min(100, eng);
    });
  }, [posts]);
  const maxSpark = Math.max(1, ...sparklineData);

  return (
    <main className="pt-[82px] pb-12 px-6 min-h-screen bg-surface-container-lowest">
      {/* Three-Column Layout */}
      <div className="grid grid-cols-12 gap-1 min-h-[calc(100vh-82px)]">

        {/* LEFT: LIVE_SENTIMENT_FEED */}
        <section className="col-span-12 lg:col-span-3 flex flex-col bg-surface-container-low border border-outline-variant/30 relative">
          <div className="absolute -top-1 -left-1 w-2 h-2 border-t border-l border-primary-container" />
          <div className="p-4 border-b border-outline-variant/30 flex items-center justify-between">
            <h2 className="font-headline font-bold text-sm tracking-tight uppercase text-on-surface">
              LIVE_SENTIMENT_FEED
            </h2>
            <span className={`w-2 h-2 bg-primary-container ${autoRefresh ? 'animate-pulse' : ''}`} style={{ borderRadius: '9999px' }} />
          </div>

          {/* Platform Filter */}
          <div className="flex gap-1 p-2 border-b border-outline-variant/10">
            <button
              onClick={() => setPlatform('')}
              className={`px-2 py-0.5 font-label text-[9px] uppercase ${
                !platform ? 'bg-primary-container text-on-primary-fixed' : 'text-emerald-900 hover:text-primary-container'
              } transition-none`}
            >
              ALL
            </button>
            {Object.entries(PLATFORM_ICONS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setPlatform(key)}
                className={`px-2 py-0.5 font-label text-[9px] uppercase ${
                  platform === key ? 'bg-primary-container text-on-primary-fixed' : 'text-emerald-900 hover:text-primary-container'
                } transition-none`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto max-h-[768px] no-scrollbar">
            {loading ? (
              <div className="p-4 font-label text-[10px] text-primary-container animate-pulse">
                LOADING_FEED...
              </div>
            ) : posts.length === 0 ? (
              <div className="p-4 font-label text-[10px] text-emerald-900">
                NO_SOCIAL_DATA_DETECTED
              </div>
            ) : (
              posts.map((post) => {
                const tag = sentimentTag(post.sentiment_score);
                const isAlert = post.sentiment_score != null && post.sentiment_score < -0.5;
                return (
                  <div
                    key={post.id}
                    className={`p-3 border-b border-outline-variant/10 hover:bg-surface-container transition-none group ${
                      isAlert ? 'bg-on-tertiary-container/5' : ''
                    }`}
                  >
                    <div className="flex justify-between font-label text-[10px] mb-1">
                      <span className={isAlert ? 'text-on-tertiary-container' : 'text-primary-container/60'}>
                        {isAlert ? 'CRITICAL_ALERT' : `UID: ${post.id.slice(0, 6)}`}
                      </span>
                      <span className={isAlert ? 'text-on-tertiary-container' : 'text-primary-container/40'}>
                        {formatTime(post.posted_at)}
                      </span>
                    </div>
                    <p className="font-label text-[11px] leading-tight text-on-surface mb-2">
                      {post.content?.length > 140 ? post.content.slice(0, 140) + '...' : post.content}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-label px-1 ${tag.bgClass} ${tag.textClass}`}>
                        {tag.text}
                      </span>
                      <span className="text-[9px] font-label px-1 bg-primary-container/20 text-primary-container">
                        {PLATFORM_ICONS[post.platform] || post.platform.toUpperCase()}
                      </span>
                      <span className="text-[9px] font-label text-emerald-900">
                        {post.politician_name}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* CENTER: INFLUENCE_CLOUD */}
        <section className="col-span-12 lg:col-span-6 flex flex-col bg-surface-container border border-outline-variant/30 p-6 relative">
          <div className="absolute -top-1 -right-1 w-2 h-2 border-t border-r border-primary-container" />

          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-headline font-bold text-2xl tracking-tighter uppercase text-primary-container">
                INFLUENCE_CLOUD
              </h2>
              <div className="font-label text-[10px] text-outline px-2 py-1 border border-outline-variant">
                VIEW: SPATIAL_RELATION
              </div>
            </div>

            {/* Word Cloud Visualization */}
            <div className="relative h-[500px] w-full border border-primary-container/10 bg-surface-container-lowest overflow-hidden flex items-center justify-center">
              {/* Dot grid background */}
              <div
                className="absolute inset-0 opacity-10"
                style={{ backgroundImage: 'radial-gradient(#00ff88 1px, transparent 0)', backgroundSize: '40px 40px' }}
              />

              {/* Terms */}
              <div className="relative z-10 flex flex-wrap gap-4 items-center justify-center p-12 max-w-2xl">
                {cloudTerms.length > 0 ? (
                  cloudTerms.map((item, idx) => {
                    const sizeClass = CLOUD_SIZES[Math.min(idx, CLOUD_SIZES.length - 1)];
                    const isHot = idx < 2;
                    return (
                      <span
                        key={item.term}
                        className={`font-headline ${sizeClass} tracking-tighter cursor-crosshair ${
                          isHot
                            ? 'text-primary-container crt-glow-intense'
                            : idx < 5
                            ? 'text-white/80'
                            : 'text-on-surface-variant hover:text-primary-container'
                        }`}
                      >
                        {item.term}
                      </span>
                    );
                  })
                ) : (
                  <>
                    <span className="font-headline text-5xl font-extrabold text-primary-container crt-glow tracking-tighter cursor-crosshair">#JUICEBOX</span>
                    <span className="font-label text-lg text-on-surface-variant hover:text-primary-container cursor-crosshair">FEC_FRAUD</span>
                    <span className="font-headline text-3xl font-bold text-white/80 tracking-tight cursor-crosshair uppercase">ELECTION_TAMPER</span>
                    <span className="font-label text-sm text-outline-variant hover:text-white cursor-crosshair">OFFSHORE_TX</span>
                    <span className="font-label text-xl text-primary-container/60 cursor-crosshair uppercase tracking-widest">WHISTLEBLOWER</span>
                    <span className="font-headline text-4xl font-black text-on-tertiary-container crt-glow cursor-crosshair tracking-tighter">#SCANDAL_LAKE</span>
                    <span className="font-label text-md text-on-surface-variant cursor-crosshair">PROX_VOTING</span>
                    <span className="font-label text-xs text-outline cursor-crosshair uppercase tracking-tighter">lobbyist_sync</span>
                    <span className="font-headline text-2xl font-medium text-white cursor-crosshair tracking-tight uppercase">DARK_MONEY</span>
                    <span className="font-label text-lg text-primary-container cursor-crosshair uppercase">PAC_SPIKE</span>
                  </>
                )}
              </div>

              {/* Axis Lines */}
              <div className="absolute h-px w-full bg-primary-container/20 top-1/4" />
              <div className="absolute h-px w-full bg-primary-container/20 top-3/4" />
              <div className="absolute w-px h-full bg-primary-container/20 left-1/2" />
              <div className="absolute bottom-4 right-4 flex flex-col font-label text-[10px] text-primary-container/50 text-right">
                <span>X_AXIS: VELOCITY</span>
                <span>Y_AXIS: SENTIMENT_MASS</span>
              </div>
            </div>
          </div>

          {/* Juice Box Telemetry Bar */}
          <div className="mt-auto border border-primary-container p-4 bg-surface-container-high">
            <div className="flex items-center justify-between mb-4">
              <span className="font-label text-xs text-primary-container font-bold uppercase tracking-widest">
                TELEMETRY: JUICE_BOX_ACTIVE
              </span>
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`font-label text-[10px] px-2 py-0.5 border transition-none ${
                  autoRefresh
                    ? 'border-primary-container text-primary-container'
                    : 'border-outline-variant text-outline'
                }`}
              >
                {autoRefresh ? 'LIVE' : 'PAUSED'}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <div className="font-label text-[9px] text-outline uppercase">Aggregate Sentiment</div>
                <div className="font-headline text-xl font-bold text-primary-container">
                  {((avgSentiment + 1) * 50).toFixed(1)}%{' '}
                  <span className="text-[10px] font-normal">
                    {avgSentiment > 0.3 ? 'POSITIVE' : avgSentiment < -0.3 ? 'NEGATIVE' : 'NEUTRAL'}
                  </span>
                </div>
              </div>
              <div>
                <div className="font-label text-[9px] text-outline uppercase">Anomaly Score</div>
                <div className="font-headline text-xl font-bold text-on-tertiary-container">
                  {anomalyScore.toFixed(2)}{' '}
                  <span className="text-[10px] font-normal">
                    {anomalyScore > 0.7 ? 'HIGH' : anomalyScore > 0.3 ? 'MEDIUM' : 'LOW'}
                  </span>
                </div>
              </div>
              <div>
                <div className="font-label text-[9px] text-outline uppercase">Data Nodes</div>
                <div className="font-headline text-xl font-bold text-on-surface">
                  {(daemonStatus?.totalPosts || posts.length).toLocaleString()}
                </div>
              </div>
            </div>
            {/* Sparkline */}
            <div className="h-12 w-full flex items-end gap-1 px-1 overflow-hidden">
              {sparklineData.map((val, idx) => {
                const pct = (val / maxSpark) * 100;
                const isHot = pct > 80;
                return (
                  <div
                    key={idx}
                    className={`w-1 ${isHot ? 'bg-on-tertiary-container' : 'bg-primary-container'}`}
                    style={{ height: `${Math.max(5, pct)}%` }}
                  />
                );
              })}
              {sparklineData.length === 0 && (
                // Placeholder sparkline
                Array.from({ length: 20 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-1 bg-primary-container/30"
                    style={{ height: `${20 + Math.random() * 60}%` }}
                  />
                ))
              )}
            </div>
          </div>
        </section>

        {/* RIGHT: ANOMALY_DETECTION */}
        <section className="col-span-12 lg:col-span-3 flex flex-col gap-1">
          <div className="bg-surface-container-low border border-outline-variant/30 p-4 flex-1 relative">
            <div className="absolute -bottom-1 -right-1 w-2 h-2 border-b border-r border-primary-container" />
            <h2 className="font-headline font-bold text-sm tracking-tight uppercase text-on-surface mb-6 border-b border-outline-variant/30 pb-2">
              ANOMALY_DETECTION
            </h2>
            <div className="space-y-6">
              {anomalies.length > 0 ? (
                anomalies.map((post, idx) => {
                  const engagement = post.likes_count + post.shares_count + post.comments_count;
                  const isSpike = engagement > 100 || (post.sentiment_score != null && post.sentiment_score < -0.5);
                  return (
                    <div key={post.id} className={`group cursor-pointer ${idx > 0 ? 'opacity-80 hover:opacity-100' : ''}`}>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-label text-[10px] text-primary-container">
                            TARGET: {post.politician_id.slice(0, 5).toUpperCase()}
                          </div>
                          <div className="font-headline font-bold text-lg text-white">
                            {post.politician_name}
                          </div>
                        </div>
                        <span className={`font-label text-xs ${
                          isSpike ? 'text-on-tertiary-container animate-pulse' : 'text-primary-container'
                        }`}>
                          {isSpike ? '!! SPIKE' : 'MONITORING'}
                        </span>
                      </div>
                      <div className={`p-2 border-l-2 ${
                        isSpike
                          ? 'bg-on-tertiary-container/10 border-on-tertiary-container'
                          : 'bg-primary-container/10 border-primary-container'
                      }`}>
                        <div className={`font-label text-[10px] mb-1 ${
                          isSpike ? 'text-on-tertiary-container' : 'text-primary-container'
                        }`}>
                          {isSpike
                            ? `SUSPICIOUS_VOLUME: ${engagement.toLocaleString()} engagements`
                            : `ENGAGEMENT: ${engagement.toLocaleString()}`
                          }
                        </div>
                        <div className="text-[11px] font-body text-on-surface-variant">
                          {post.content?.length > 100 ? post.content.slice(0, 100) + '...' : post.content}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="font-label text-[10px] text-emerald-900">NO_ANOMALIES_DETECTED</div>
              )}
            </div>
          </div>

          {/* Global Risk Metric */}
          <div className="bg-on-tertiary-container p-4 flex items-center justify-between">
            <div>
              <div className="font-label text-[9px] text-white/60 uppercase">Global Social Volatility</div>
              <div className="font-headline text-3xl font-black text-white">
                {anomalyScore > 0.7 ? 'CRITICAL' : anomalyScore > 0.3 ? 'ELEVATED' : 'NOMINAL'}
              </div>
            </div>
            <div className="w-16 h-16 border-4 border-white/20 flex items-center justify-center" style={{ borderRadius: '9999px' }}>
              <span className="font-label text-xl font-bold text-white">
                {Math.round(anomalyScore * 100)}
              </span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

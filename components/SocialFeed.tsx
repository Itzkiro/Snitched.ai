'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

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

const PLATFORM_COLORS: Record<string, string> = {
  twitter: '#1DA1F2',
  facebook: '#4267B2',
  instagram: '#E1306C',
  tiktok: '#00F2EA',
  youtube: '#FF0000',
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

function sentimentLabel(score: number | null): { text: string; color: string } {
  if (score == null) return { text: 'N/A', color: 'var(--terminal-text-dim)' };
  if (score > 0.3) return { text: 'POSITIVE', color: 'var(--terminal-green)' };
  if (score < -0.3) return { text: 'NEGATIVE', color: 'var(--terminal-red)' };
  return { text: 'NEUTRAL', color: 'var(--terminal-amber)' };
}

export default function SocialFeed({
  politicianId,
  compact = false,
}: {
  politicianId?: string;
  compact?: boolean;
}) {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [daemonStatus, setDaemonStatus] = useState<DaemonStatus | null>(null);
  const [platform, setPlatform] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPosts = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: compact ? '10' : '50' });
      if (politicianId) params.set('politician_id', politicianId);
      if (platform) params.set('platform', platform);

      const res = await fetch(`/api/social-posts?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts || []);
      }
    } catch (err) {
      console.error('Failed to fetch social posts:', err);
    } finally {
      setLoading(false);
    }
  }, [politicianId, platform, compact]);

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

  // Auto-refresh every 30 seconds
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

  const statusColor =
    daemonStatus?.status === 'online'
      ? 'var(--terminal-green)'
      : daemonStatus?.status === 'delayed'
        ? 'var(--terminal-amber)'
        : 'var(--terminal-red)';

  return (
    <div style={{ fontFamily: 'var(--font-terminal)' }}>
      {/* Status Bar */}
      {!compact && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.75rem 1rem',
            background: 'var(--terminal-surface)',
            border: '1px solid var(--terminal-border)',
            marginBottom: '1rem',
            fontSize: '11px',
            textTransform: 'uppercase',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ color: 'var(--terminal-text-dim)' }}>SOCIAL MONITOR</span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                color: statusColor,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: statusColor,
                  display: 'inline-block',
                  animation:
                    daemonStatus?.status === 'online'
                      ? 'pulse 2s infinite'
                      : 'none',
                }}
              />
              {daemonStatus?.status?.toUpperCase() || 'UNKNOWN'}
            </span>
            {daemonStatus?.lastRunMinutesAgo != null && daemonStatus.lastRunMinutesAgo >= 0 && (
              <span style={{ color: 'var(--terminal-text-dimmer)' }}>
                LAST RUN: {daemonStatus.lastRunMinutesAgo}M AGO
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ color: 'var(--terminal-text-dim)' }}>
              {daemonStatus?.totalPosts || 0} POSTS TRACKED
            </span>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              style={{
                background: 'none',
                border: `1px solid ${autoRefresh ? 'var(--terminal-green)' : 'var(--terminal-border)'}`,
                color: autoRefresh ? 'var(--terminal-green)' : 'var(--terminal-text-dim)',
                padding: '2px 8px',
                fontSize: '10px',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {autoRefresh ? 'LIVE' : 'PAUSED'}
            </button>
          </div>
        </div>
      )}

      {/* Platform Filter */}
      {!compact && (
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            marginBottom: '1rem',
            fontSize: '11px',
          }}
        >
          <button
            onClick={() => setPlatform('')}
            style={{
              background: !platform ? 'var(--terminal-blue)' : 'transparent',
              color: !platform ? '#000' : 'var(--terminal-text-dim)',
              border: `1px solid ${!platform ? 'var(--terminal-blue)' : 'var(--terminal-border)'}`,
              padding: '4px 12px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '11px',
            }}
          >
            ALL
          </button>
          {Object.entries(PLATFORM_ICONS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setPlatform(key)}
              style={{
                background: platform === key ? PLATFORM_COLORS[key] : 'transparent',
                color: platform === key ? '#fff' : 'var(--terminal-text-dim)',
                border: `1px solid ${platform === key ? PLATFORM_COLORS[key] : 'var(--terminal-border)'}`,
                padding: '4px 12px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '11px',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Posts */}
      {loading ? (
        <div
          style={{
            padding: '2rem',
            textAlign: 'center',
            color: 'var(--terminal-text-dim)',
            fontSize: '12px',
          }}
        >
          LOADING SOCIAL FEED...
        </div>
      ) : posts.length === 0 ? (
        <div
          style={{
            padding: '2rem',
            textAlign: 'center',
            color: 'var(--terminal-text-dim)',
            fontSize: '12px',
            border: '1px dashed var(--terminal-border)',
          }}
        >
          NO POSTS YET — START THE DAEMON TO BEGIN MONITORING
          <br />
          <code style={{ fontSize: '10px', color: 'var(--terminal-cyan)' }}>
            ./scripts/start-social-daemon.sh
          </code>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {posts.map((post) => {
            const sentiment = sentimentLabel(post.sentiment_score);
            const platformColor = PLATFORM_COLORS[post.platform] || 'var(--terminal-text-dim)';

            return (
              <div
                key={post.id}
                style={{
                  background: 'var(--terminal-card)',
                  border: '1px solid var(--terminal-border)',
                  padding: '0.75rem 1rem',
                  fontSize: '12px',
                }}
              >
                {/* Header */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.5rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span
                      style={{
                        background: platformColor,
                        color: '#fff',
                        padding: '1px 6px',
                        fontSize: '10px',
                        fontWeight: 700,
                      }}
                    >
                      {PLATFORM_ICONS[post.platform] || post.platform.toUpperCase()}
                    </span>
                    <span style={{ color: 'var(--terminal-cyan)', fontWeight: 600 }}>
                      {post.politician_name}
                    </span>
                    <span style={{ color: 'var(--terminal-text-dimmer)' }}>@{post.handle}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ color: sentiment.color, fontSize: '10px' }}>
                      {sentiment.text}
                    </span>
                    <span style={{ color: 'var(--terminal-text-dimmer)', fontSize: '10px' }}>
                      {timeAgo(post.posted_at)}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <p
                  style={{
                    color: 'var(--terminal-text)',
                    lineHeight: 1.5,
                    marginBottom: '0.5rem',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {post.content?.length > 300
                    ? post.content.slice(0, 300) + '...'
                    : post.content}
                </p>

                {/* Footer */}
                <div
                  style={{
                    display: 'flex',
                    gap: '1.5rem',
                    color: 'var(--terminal-text-dimmer)',
                    fontSize: '10px',
                  }}
                >
                  {post.likes_count > 0 && <span>{post.likes_count.toLocaleString()} likes</span>}
                  {post.shares_count > 0 && (
                    <span>{post.shares_count.toLocaleString()} shares</span>
                  )}
                  {post.comments_count > 0 && (
                    <span>{post.comments_count.toLocaleString()} comments</span>
                  )}
                  {post.views_count > 0 && (
                    <span>{post.views_count.toLocaleString()} views</span>
                  )}
                  {post.is_deleted && (
                    <span style={{ color: 'var(--terminal-red)' }}>DELETED</span>
                  )}
                  <a
                    href={post.post_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--terminal-blue)', textDecoration: 'none' }}
                  >
                    VIEW
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

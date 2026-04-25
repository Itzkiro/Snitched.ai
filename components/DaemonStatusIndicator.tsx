'use client';

import { useState, useEffect } from 'react';

export interface DaemonStatus {
  status: string;
  lastRun: { started_at: string; posts_found: number; status: string } | null;
  lastRunMinutesAgo: number;
  totalPosts: number;
}

interface DaemonStatusIndicatorProps {
  variant?: 'compact' | 'full';
}

/**
 * DaemonStatusIndicator — fetches /api/daemon-status and renders a colored dot
 * + state label. Used by both MobileNavDrawer (variant="compact") and
 * SocialFeed (variant="full"). Honors prefers-reduced-motion for the pulse
 * animation per D-04.
 *
 * variant="compact": single-line "DAEMON: ONLINE · LAST RUN: 5M AGO" for the
 *   drawer footer. Single fetch on mount.
 * variant="full": matches SocialFeed status-bar row exactly. Polls every 60s
 *   only when viewport is sm:+ (≥640 px).
 */
export default function DaemonStatusIndicator({
  variant = 'compact',
}: DaemonStatusIndicatorProps) {
  const [daemonStatus, setDaemonStatus] = useState<DaemonStatus | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  // Fetch once on mount; poll only when full + sm:+
  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function fetchStatus() {
      try {
        const res = await fetch('/api/daemon-status');
        if (res.ok && !cancelled) {
          const data = (await res.json()) as DaemonStatus;
          if (!cancelled) setDaemonStatus(data);
        }
      } catch {
        // ignore — UI shows UNKNOWN
      }
    }

    fetchStatus();

    if (
      variant === 'full' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(min-width: 640px)').matches
    ) {
      intervalId = setInterval(fetchStatus, 60_000);
    }

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [variant]);

  // Detect prefers-reduced-motion (D-04)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mql.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const statusColor =
    daemonStatus?.status === 'online'
      ? 'var(--terminal-green)'
      : daemonStatus?.status === 'delayed'
        ? 'var(--terminal-amber)'
        : 'var(--terminal-red)';

  const stateLabel = daemonStatus?.status?.toUpperCase() || 'UNKNOWN';
  const showPulse = daemonStatus?.status === 'online' && !reducedMotion;

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-2 text-xs font-mono text-terminal-text-dim uppercase tracking-[0.08em]">
        <span
          aria-hidden="true"
          className="motion-reduce:animate-none"
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: statusColor,
            display: 'inline-block',
            animation: showPulse ? 'pulse 2s infinite' : 'none',
          }}
        />
        <span style={{ color: statusColor }}>DAEMON: {stateLabel}</span>
        {daemonStatus?.lastRunMinutesAgo != null &&
          daemonStatus.lastRunMinutesAgo >= 0 && (
            <span style={{ color: 'var(--terminal-text-dimmer)' }}>
              · LAST RUN: {daemonStatus.lastRunMinutesAgo}M AGO
            </span>
          )}
      </div>
    );
  }

  // variant === 'full' — drop-in replacement for SocialFeed status row
  return (
    <span
      className="motion-reduce:[animation:none]"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        color: statusColor,
      }}
    >
      <span
        aria-hidden="true"
        className="motion-reduce:animate-none"
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: statusColor,
          display: 'inline-block',
          animation: showPulse ? 'pulse 2s infinite' : 'none',
        }}
      />
      {stateLabel}
      {daemonStatus?.lastRunMinutesAgo != null &&
        daemonStatus.lastRunMinutesAgo >= 0 && (
          <span style={{ color: 'var(--terminal-text-dimmer)', marginLeft: '1rem' }}>
            LAST RUN: {daemonStatus.lastRunMinutesAgo}M AGO
          </span>
        )}
    </span>
  );
}

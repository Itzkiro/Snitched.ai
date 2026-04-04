'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { Politician } from '@/lib/types';

interface FeedItem {
  id: string;
  text: string;
  time: string;
  type: 'funding' | 'score' | 'social' | 'system';
  severity: 'critical' | 'warning' | 'info';
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
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
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
      text: `PAC_TRANSFER: $${(p.aipacFunding / 1000).toFixed(0)}K TRACKED TO ${p.name.toUpperCase()}`,
      time: formatTimestamp(new Date(now - (i + 1) * 3600000 * 2)),
      type: 'funding',
      severity: p.aipacFunding > 100000 ? 'critical' : 'warning',
    });
  });

  // Real corruption score alerts from highest-scored politicians
  const highCorruption = [...politicians]
    .filter(p => p.corruptionScore >= 50)
    .sort((a, b) => b.corruptionScore - a.corruptionScore)
    .slice(0, 3);

  highCorruption.forEach((p, i) => {
    items.push({
      id: `score-${p.id}`,
      text: `ANOMALY: CORRUPTION_INDEX_${p.corruptionScore} [${p.name.toUpperCase().replace(/ /g, '_')}]`,
      time: formatTimestamp(new Date(now - (i + 2) * 3600000 * 3)),
      type: 'score',
      severity: p.corruptionScore >= 80 ? 'critical' : 'warning',
    });
  });

  // System updates from real data
  const totalTracked = politicians.length;
  const counties = new Set(politicians.map(p => p.jurisdiction)).size;
  items.push({
    id: 'system-count',
    text: `DATABASE: ${totalTracked} ENTITIES ACROSS ${counties} JURISDICTIONS SYNCED`,
    time: formatTimestamp(new Date(now - 12 * 3600000)),
    type: 'system',
    severity: 'info',
  });

  items.push({
    id: 'system-social',
    text: `SOCIAL: SENTIMENT_ANALYSIS_CYCLE COMPLETE`,
    time: formatTimestamp(new Date(now - 8 * 3600000)),
    type: 'system',
    severity: 'info',
  });

  return items.slice(0, 7);
}

export default function TerminalHome() {
  const [politicians, setPoliticians] = useState<Politician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        const polRes = await fetch('/api/politicians');
        if (!polRes.ok) throw new Error(`API error: ${polRes.status}`);
        const allPoliticians: Politician[] = await polRes.json();
        setPoliticians(allPoliticians);
        setFeedItems(generateFeedItems(allPoliticians));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (loading) {
    return (
      <main className="pt-[82px] pb-12 px-6 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="font-headline text-4xl text-primary-container crt-glow mb-4 animate-pulse">
            SNITCHED.AI
          </div>
          <div className="font-label text-xs text-emerald-700 uppercase tracking-[0.3em]">
            INITIALIZING INTELLIGENCE DATABASE...
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="pt-[82px] pb-12 px-6 min-h-screen flex items-center justify-center">
        <div className="bg-surface-container border border-emerald-900/30 p-8 text-center max-w-md">
          <div className="font-headline text-2xl text-on-tertiary-container mb-4">CONNECTION ERROR</div>
          <div className="font-label text-xs text-outline mb-4">{error}</div>
          <button
            className="terminal-btn"
            onClick={() => window.location.reload()}
          >
            RETRY_CONNECTION
          </button>
        </div>
      </main>
    );
  }

  if (politicians.length === 0) {
    return (
      <main className="pt-[82px] pb-12 px-6 min-h-screen flex items-center justify-center">
        <div className="bg-surface-container border border-emerald-900/30 p-8 text-center">
          <div className="font-headline text-xl text-primary-container mb-2">NO DATA</div>
          <div className="font-label text-xs text-outline">
            Database returned empty. Please refresh.
          </div>
        </div>
      </main>
    );
  }

  const activePoliticians = politicians.filter(p => p.isActive);
  const totalFunding = activePoliticians.reduce(
    (sum, p) => sum + (p.israelLobbyTotal || p.aipacFunding || 0),
    0
  );
  const avgCorruption =
    activePoliticians.length > 0
      ? Math.round(
          activePoliticians.reduce((sum, p) => sum + p.corruptionScore, 0) /
            activePoliticians.length
        )
      : 0;

  // Stats
  const federal = politicians.filter(
    p => p.officeLevel === 'US Senator' || p.officeLevel === 'US Representative'
  );
  const state = politicians.filter(
    p =>
      p.officeLevel === 'State Senator' ||
      p.officeLevel === 'State Representative' ||
      p.officeLevel === 'Governor'
  );
  const county = politicians.filter(
    p => p.jurisdictionType === 'county' || p.jurisdictionType === 'municipal'
  );

  // Get top corrupted for leaderboard
  const topCorrupted = [...activePoliticians]
    .sort((a, b) => b.corruptionScore - a.corruptionScore)
    .slice(0, 5);

  return (
    <>
      <main className="pt-[82px] pb-12 px-6 min-h-screen">
        {/* ====================================================
            HERO: The Panopticon Lens
            ==================================================== */}
        <section className="relative w-full border border-emerald-900/50 bg-surface-container-lowest overflow-hidden mb-6 p-12 flex flex-col items-center justify-center text-center">
          {/* Radial glow background */}
          <div
            className="absolute inset-0 opacity-10 pointer-events-none"
            style={{
              backgroundImage:
                'radial-gradient(circle at center, #00ff88 0%, transparent 70%)',
            }}
          />

          <h1 className="font-headline text-7xl md:text-8xl font-black tracking-tighter text-primary-container crt-glow uppercase mb-4 leading-none">
            EVERY POLITICIAN.
            <br />
            EVERY DOLLAR.
            <br />
            EVERY LIE.
          </h1>

          <p className="font-label text-emerald-600 text-sm tracking-[0.5em] mb-8">
            TOTAL TRANSPARENCY THROUGH MACHINE INTELLIGENCE
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-wrap gap-4 mb-8 justify-center">
            <Link
              href="/browse"
              className="bg-emerald-400 text-slate-950 font-label font-bold px-8 py-4 uppercase tracking-widest text-sm hover:bg-emerald-300 transition-none flex items-center gap-2"
            >
              INITIATE INVESTIGATION <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </Link>
            <Link
              href="/juicebox"
              className="border border-emerald-400/40 text-emerald-400 font-label font-bold px-8 py-4 uppercase tracking-widest text-sm hover:bg-emerald-400/10 transition-none"
            >
              VIEW_METHODOLOGY
            </Link>
          </div>

          {/* Wireframe Visualization Area */}
          <div className="w-full max-w-5xl h-64 relative border border-outline-variant/20 bg-black/40">
            {/* Mesh network visualization placeholder */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="border border-primary-container/40 p-2 font-label text-[10px] text-primary-container bg-slate-950/80">
                SCANNING_NEURAL_CLUSTER: {politicians.length} NODES ACTIVE...
              </div>
            </div>
            {/* Decorative grid lines */}
            <svg className="absolute inset-0 w-full h-full opacity-20" preserveAspectRatio="none">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#00ff88" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
              <path
                d="M0 200 Q200 100 400 180 T800 120 T1200 160"
                fill="none"
                stroke="#00ff88"
                strokeWidth="1.5"
                opacity="0.5"
              />
              <path
                d="M0 160 Q150 220 350 140 T750 200 T1200 130"
                fill="none"
                stroke="#00ff88"
                strokeWidth="1"
                opacity="0.3"
              />
            </svg>
          </div>
        </section>

        {/* ====================================================
            DATA GRID: 3-Column Layout
            ==================================================== */}
        <div className="grid grid-cols-12 gap-6">
          {/* ---- LIVE THREAT FEED (Left Column) ---- */}
          <div className="col-span-12 lg:col-span-4 flex flex-col">
            <div className="bg-surface-container border border-emerald-900/30 h-full relative p-4 ghost-bracket-tl ghost-bracket-br">
              <div className="flex justify-between items-center mb-4 border-b border-outline-variant/30 pb-2">
                <h2 className="font-label text-xs font-bold text-primary-container tracking-widest flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">sensors</span>
                  LIVE_THREAT_FEED
                </h2>
                <span className="font-label text-[10px] text-emerald-900">REALTIME_LOGS</span>
              </div>
              <div className="space-y-3 font-label text-[11px] h-[400px] overflow-hidden">
                {feedItems.map((item) => {
                  const isCritical = item.severity === 'critical';
                  const isWarning = item.severity === 'warning';
                  return (
                    <div
                      key={item.id}
                      className={`flex gap-3 pl-2 py-1 ${
                        isCritical
                          ? 'text-on-tertiary-container border-l border-on-tertiary-container bg-on-tertiary-container/5'
                          : isWarning
                          ? 'text-emerald-400 border-l border-emerald-400 bg-emerald-400/5'
                          : 'text-emerald-600'
                      }`}
                    >
                      <span className="shrink-0 opacity-50">[{item.time}]</span>
                      <span
                        className={`uppercase tracking-tight ${
                          isCritical ? 'font-bold flicker-alert' : ''
                        }`}
                      >
                        {item.text}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ---- CORRUPTION LEADERBOARD (Center Column) ---- */}
          <div className="col-span-12 lg:col-span-5">
            <div className="bg-surface-container-high border border-emerald-900/30 h-full p-4 relative ghost-bracket-tr ghost-bracket-bl">
              <div className="flex justify-between items-center mb-6 border-b border-outline-variant/30 pb-2">
                <h2 className="font-label text-xs font-bold text-primary-container tracking-widest flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">trending_up</span>
                  CORRUPTION_LEADERBOARD
                </h2>
                <div className="flex gap-2 items-center">
                  <span className="w-2 h-2 bg-on-tertiary-container flicker-alert" />
                  <span className="font-label text-[10px] text-on-tertiary-container">
                    HIGH_ALERT
                  </span>
                </div>
              </div>
              <div className="space-y-4">
                {topCorrupted.map((pol) => {
                  const isCritical = pol.corruptionScore >= 80;
                  const partyShort =
                    pol.party === 'Republican'
                      ? 'R'
                      : pol.party === 'Democrat'
                      ? 'D'
                      : 'I';
                  return (
                    <Link
                      key={pol.id}
                      href={`/politician/${pol.id}`}
                      className="group cursor-pointer hover:bg-surface-bright/20 border-b border-outline-variant/10 pb-4 flex justify-between items-end"
                    >
                      <div className="flex gap-4 items-center">
                        <div className="w-12 h-12 border border-emerald-900 overflow-hidden bg-slate-900 flex items-center justify-center">
                          {pol.photoUrl ? (
                            <img
                              className="w-full h-full object-cover grayscale brightness-50 contrast-125"
                              src={pol.photoUrl}
                              alt={pol.name}
                            />
                          ) : (
                            <span className="font-headline text-lg text-emerald-800 font-bold">
                              {pol.name.charAt(0)}
                            </span>
                          )}
                        </div>
                        <div>
                          <div className="font-label text-[10px] text-emerald-700 tracking-tighter">
                            ID: {pol.id.slice(0, 8).toUpperCase()} // {pol.officeLevel.toUpperCase().replace(/ /g, '_')}
                          </div>
                          <div className="font-headline font-bold text-lg text-white leading-tight">
                            {pol.name.toUpperCase()}
                          </div>
                          <div className="font-label text-[10px] text-emerald-500 uppercase">
                            {pol.party.toUpperCase()} ({partyShort}) // {pol.jurisdiction.toUpperCase()}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className={`font-label text-[10px] uppercase tracking-widest ${
                            isCritical
                              ? 'text-on-tertiary-container font-black flicker-alert'
                              : 'text-outline'
                          }`}
                        >
                          {isCritical ? 'FLICKER_ALERT' : pol.corruptionScore >= 60 ? 'RISING_RANK' : 'STABLE_RISK'}
                        </div>
                        <div
                          className={`font-label text-2xl font-black ${
                            isCritical ? 'text-on-tertiary-container' : 'text-primary-container'
                          }`}
                        >
                          {pol.corruptionScore}%
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ---- GEO INFLUENCE + JUICE BOX (Right Column) ---- */}
          <div className="col-span-12 lg:col-span-3 flex flex-col gap-6">
            {/* Geo Influence Map */}
            <div className="bg-surface-container border border-emerald-900/30 flex-1 p-4 relative ghost-bracket-tl ghost-bracket-tr ghost-bracket-bl ghost-bracket-br overflow-hidden">
              <div className="flex justify-between items-center mb-2">
                <h2 className="font-label text-[10px] font-bold text-primary-container tracking-widest">
                  GEO_INFLUENCE
                </h2>
                <span className="material-symbols-outlined text-xs text-emerald-700">language</span>
              </div>
              <div className="w-full h-40 bg-slate-900 border border-emerald-900/50 relative">
                {/* Map placeholder with data overlay */}
                <svg className="absolute inset-0 w-full h-full opacity-30" viewBox="0 0 200 100" preserveAspectRatio="none">
                  <rect x="60" y="10" width="80" height="60" fill="none" stroke="#00ff88" strokeWidth="0.5" opacity="0.4" />
                  <circle cx="100" cy="40" r="3" fill="#00ff88" opacity="0.8" />
                  <circle cx="80" cy="35" r="2" fill="#00ff88" opacity="0.5" />
                  <circle cx="120" cy="45" r="2" fill="#00ff88" opacity="0.5" />
                  <circle cx="90" cy="50" r="1.5" fill="#00ff88" opacity="0.4" />
                  <line x1="100" y1="40" x2="80" y2="35" stroke="#00ff88" strokeWidth="0.3" opacity="0.3" />
                  <line x1="100" y1="40" x2="120" y2="45" stroke="#00ff88" strokeWidth="0.3" opacity="0.3" />
                </svg>
                <div className="absolute top-2 left-2 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-primary-container" />
                  <span className="font-label text-[8px] text-primary-container tracking-widest">
                    NODE_ACTIVE
                  </span>
                </div>
              </div>
              <div className="mt-2 font-label text-[9px] text-emerald-700 space-y-1">
                <div className="flex justify-between">
                  <span>FEDERAL_NODES:</span>
                  <span>{federal.length} TRACKED</span>
                </div>
                <div className="flex justify-between">
                  <span>STATE_NODES:</span>
                  <span>{state.length} TRACKED</span>
                </div>
                <div className="flex justify-between">
                  <span>LOCAL_NODES:</span>
                  <span>{county.length} TRACKED</span>
                </div>
              </div>
            </div>

            {/* Juice Box Telemetry */}
            <div className="bg-slate-950 border-2 border-primary-container p-4 relative overflow-hidden">
              <div className="font-label text-xs font-bold text-primary-container tracking-widest mb-2">
                JUICE_BOX_TELEMETRY
              </div>
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div>
                  <div className="font-label text-[8px] text-emerald-900 uppercase">
                    AVG_CORRUPTION
                  </div>
                  <div className="font-label text-xl text-primary-container font-bold">
                    {avgCorruption}%
                  </div>
                </div>
                <div>
                  <div className="font-label text-[8px] text-emerald-900 uppercase">
                    LOBBY_$_TOTAL
                  </div>
                  <div className="font-label text-xl text-primary-container font-bold">
                    ${(totalFunding / 1000000).toFixed(1)}M
                  </div>
                </div>
              </div>
              {/* Sparkline */}
              <div className="h-8 w-full bg-primary-container/10 relative">
                <svg
                  className="absolute inset-0 w-full h-full"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M0 20 L20 10 L40 25 L60 5 L80 18 L100 12 L120 28 L140 10 L160 22 L180 15 L200 30"
                    fill="none"
                    stroke="#00ff88"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              </div>
              <div className="mt-2 text-[8px] font-label text-primary-container/50 uppercase tracking-widest">
                REALTIME_LIQUIDITY_INDEX
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ====================================================
          FOOTER BAR
          ==================================================== */}
      <footer className="w-full bg-slate-950 border-t border-emerald-900/50 flex justify-between items-center px-6 py-2 mt-6">
        <div className="font-label text-[10px] tracking-widest text-emerald-900 uppercase">
          SYSTEM_STATUS:{' '}
          <span className="text-emerald-500">OPERATIONAL</span> | LATENCY:{' '}
          <span className="text-emerald-500">14MS</span> | NODE_SYNC:{' '}
          <span className="text-emerald-500">100%</span>
        </div>
        <div className="flex gap-6">
          <Link
            href="/browse"
            className="font-label text-[10px] tracking-widest text-emerald-900 hover:text-emerald-200 uppercase transition-none"
          >
            DATABASE
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

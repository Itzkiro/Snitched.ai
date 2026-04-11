'use client';

import { useState, useEffect } from 'react';

const BOOT_LINES = [
  { text: 'SNITCHED.AI v4.0 — Public Intelligence Platform', delay: 0, color: '#00FF41' },
  { text: '================================================', delay: 200, color: '#3d5a3d' },
  { text: '', delay: 300, color: '' },
  { text: '$ init --secure-channel', delay: 400, color: '#6b8a6b' },
  { text: '  [OK] TLS 1.3 handshake complete', delay: 700, color: '#00cc33' },
  { text: '  [OK] Certificate verified: snitched.ai', delay: 900, color: '#00cc33' },
  { text: '', delay: 1000, color: '' },
  { text: '$ connect --database supabase://politicians', delay: 1100, color: '#6b8a6b' },
  { text: '  [OK] Connection pool established (3 workers)', delay: 1400, color: '#00cc33' },
  { text: '  [OK] Row-level security verified', delay: 1600, color: '#00cc33' },
  { text: '', delay: 1700, color: '' },
  { text: '$ load --module fec-client', delay: 1800, color: '#6b8a6b' },
  { text: '  [OK] FEC API key validated', delay: 2100, color: '#00cc33' },
  { text: '  [OK] Rate limit: 1,000 req/hr', delay: 2300, color: '#00cc33' },
  { text: '', delay: 2400, color: '' },
  { text: '$ load --module israel-lobby-tracker', delay: 2500, color: '#6b8a6b' },
  { text: '  [OK] AIPAC PAC database loaded', delay: 2800, color: '#00cc33' },
  { text: '  [OK] Bundled donor network mapped', delay: 3000, color: '#00cc33' },
  { text: '  [OK] Independent expenditure feeds active', delay: 3200, color: '#00cc33' },
  { text: '', delay: 3300, color: '' },
  { text: '$ load --module corruption-engine', delay: 3400, color: '#6b8a6b' },
  { text: '  [OK] 4-factor scoring algorithm initialized', delay: 3700, color: '#00cc33' },
  { text: '  [OK] PAC ratio analyzer ready', delay: 3900, color: '#00cc33' },
  { text: '  [OK] Lobby connection mapper ready', delay: 4100, color: '#00cc33' },
  { text: '', delay: 4200, color: '' },
  { text: '$ query --count politicians', delay: 4300, color: '#6b8a6b' },
  { text: '  RESULT: 6,731 targets loaded across 11 states', delay: 4600, color: '#FFB627' },
  { text: '  RESULT: $618M campaign funds tracked', delay: 4800, color: '#FFB627' },
  { text: '', delay: 4900, color: '' },
  { text: '$ scan --module threat-assessment', delay: 5000, color: '#6b8a6b' },
  { text: '  [WARN] 247 officials flagged for foreign lobby ties', delay: 5300, color: '#FF0844' },
  { text: '  [WARN] $20.5M+ Israel lobby funding detected', delay: 5500, color: '#FF0844' },
  { text: '', delay: 5600, color: '' },
  { text: '$ render --interface terminal', delay: 5700, color: '#6b8a6b' },
  { text: '  [OK] UI components compiled', delay: 6000, color: '#00cc33' },
  { text: '  [OK] State dashboards ready', delay: 6200, color: '#00cc33' },
  { text: '', delay: 6300, color: '' },
  { text: 'ALL SYSTEMS OPERATIONAL. LOADING INTERFACE...', delay: 6500, color: '#00FF41' },
];

export default function Loading() {
  const [visibleLines, setVisibleLines] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    BOOT_LINES.forEach((line, i) => {
      timers.push(setTimeout(() => {
        setVisibleLines(i + 1);
        setProgress(Math.round(((i + 1) / BOOT_LINES.length) * 100));
      }, line.delay));
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div style={{
      minHeight: '100vh', background: '#000', display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'JetBrains Mono', monospace", color: '#00FF41',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Scanlines */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.03,
        background: 'repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(0,255,65,0.08) 2px, rgba(0,255,65,0.08) 4px)',
        pointerEvents: 'none',
      }} />

      {/* CRT vignette */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.7) 100%)',
      }} />

      <style>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes glitch {
          0%, 100% { text-shadow: 0 0 10px rgba(0,255,65,0.3); }
          20% { text-shadow: -2px 0 rgba(255,8,68,0.5), 2px 0 rgba(0,255,65,0.5); transform: translate(1px, 0); }
          40% { text-shadow: 2px 0 rgba(0,255,65,0.3); transform: translate(-1px, 0); }
          60% { text-shadow: -1px 0 rgba(255,8,68,0.3), 1px 0 rgba(255,182,39,0.3); transform: translate(0, 1px); }
          80% { text-shadow: 0 0 15px rgba(0,255,65,0.5); transform: translate(0, 0); }
        }
        @keyframes scanDown { 0% { top: -5%; } 100% { top: 105%; } }
      `}</style>

      {/* Moving scan line */}
      <div style={{
        position: 'absolute', left: 0, right: 0, height: '2px',
        background: 'linear-gradient(90deg, transparent 0%, rgba(0,255,65,0.15) 50%, transparent 100%)',
        animation: 'scanDown 3s linear infinite', pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', width: '100%', maxWidth: '550px', padding: '2rem' }}>
        {/* Logo */}
        <div style={{
          fontSize: '2rem', fontWeight: 700, marginBottom: '1.5rem',
          animation: 'glitch 4s infinite', textAlign: 'center',
        }}>
          <span style={{ color: '#00FF41' }}>SNITCHED</span>
          <span style={{ color: '#3d5a3d' }}>.AI</span>
        </div>

        {/* Terminal window */}
        <div style={{
          background: 'rgba(0,255,65,0.02)', border: '1px solid rgba(0,255,65,0.12)',
          padding: '1rem', marginBottom: '1.5rem',
        }}>
          {/* Window bar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            paddingBottom: '0.75rem', marginBottom: '0.75rem',
            borderBottom: '1px solid rgba(0,255,65,0.08)',
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF0844' }} />
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#FFB627' }} />
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00FF41' }} />
            <span style={{ marginLeft: '0.5rem', fontSize: '0.55rem', color: '#3d5a3d', letterSpacing: '0.1em' }}>
              snitched@terminal ~ boot
            </span>
          </div>

          {/* Boot output */}
          <div style={{
            fontSize: '0.6rem', lineHeight: 1.6,
            maxHeight: '320px', overflowY: 'auto',
          }}>
            {BOOT_LINES.slice(0, visibleLines).map((line, i) => (
              <div key={i} style={{ color: line.color || 'transparent', minHeight: line.text ? 'auto' : '0.6rem' }}>
                {line.text}
              </div>
            ))}
            {visibleLines < BOOT_LINES.length && (
              <span style={{ color: '#00FF41', animation: 'blink 0.8s infinite' }}>_</span>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: '0.5rem' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: '0.55rem', color: '#3d5a3d', marginBottom: '0.3rem',
          }}>
            <span>BOOT PROGRESS</span>
            <span style={{ color: '#00FF41' }}>{progress}%</span>
          </div>
          <div style={{ height: '3px', background: 'rgba(0,255,65,0.08)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${progress}%`,
              background: progress >= 80 ? '#00FF41' : '#00cc33',
              boxShadow: `0 0 8px rgba(0,255,65,0.4)`,
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>

        <div style={{
          textAlign: 'center', fontSize: '0.5rem', color: '#3d5a3d',
          letterSpacing: '0.25em', textTransform: 'uppercase',
        }}>
          {progress < 30 ? 'ESTABLISHING SECURE CHANNEL' :
           progress < 60 ? 'LOADING INTELLIGENCE MODULES' :
           progress < 90 ? 'SCANNING THREAT DATABASE' :
           'INITIALIZING INTERFACE'}
        </div>
      </div>
    </div>
  );
}

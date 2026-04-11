'use client';

import { useState, useEffect } from 'react';

const BOOT_LINES = [
  { text: 'SNITCHED.AI v4.0 — Public Intelligence Platform', delay: 0, color: '#00FF41' },
  { text: '================================================', delay: 150, color: '#3d5a3d' },
  { text: '', delay: 250, color: '' },
  { text: '$ init --secure-channel', delay: 350, color: '#6b8a6b' },
  { text: '  [OK] TLS 1.3 handshake complete', delay: 550, color: '#00cc33' },
  { text: '  [OK] Certificate verified: snitched.ai', delay: 700, color: '#00cc33' },
  { text: '', delay: 800, color: '' },
  { text: '$ connect --database supabase://politicians', delay: 900, color: '#6b8a6b' },
  { text: '  [OK] Connection pool established (3 workers)', delay: 1150, color: '#00cc33' },
  { text: '  [OK] Row-level security verified', delay: 1300, color: '#00cc33' },
  { text: '', delay: 1400, color: '' },
  { text: '$ load --module fec-client', delay: 1500, color: '#6b8a6b' },
  { text: '  [OK] FEC API key validated', delay: 1700, color: '#00cc33' },
  { text: '  [OK] Rate limit: 1,000 req/hr', delay: 1850, color: '#00cc33' },
  { text: '', delay: 1950, color: '' },
  { text: '$ load --module israel-lobby-tracker', delay: 2050, color: '#6b8a6b' },
  { text: '  [OK] AIPAC PAC database loaded', delay: 2300, color: '#00cc33' },
  { text: '  [OK] Bundled donor network mapped', delay: 2450, color: '#00cc33' },
  { text: '  [OK] Independent expenditure feeds active', delay: 2600, color: '#00cc33' },
  { text: '', delay: 2700, color: '' },
  { text: '$ load --module corruption-engine', delay: 2800, color: '#6b8a6b' },
  { text: '  [OK] 4-factor scoring algorithm initialized', delay: 3050, color: '#00cc33' },
  { text: '  [OK] PAC ratio analyzer ready', delay: 3200, color: '#00cc33' },
  { text: '  [OK] Lobby connection mapper ready', delay: 3350, color: '#00cc33' },
  { text: '', delay: 3450, color: '' },
  { text: '$ query --count politicians', delay: 3550, color: '#6b8a6b' },
  { text: '  RESULT: 6,731 targets loaded across 11 states', delay: 3800, color: '#FFB627' },
  { text: '  RESULT: $618M campaign funds tracked', delay: 3950, color: '#FFB627' },
  { text: '', delay: 4050, color: '' },
  { text: '$ scan --module threat-assessment', delay: 4150, color: '#6b8a6b' },
  { text: '  [WARN] 247 officials flagged for foreign lobby ties', delay: 4400, color: '#FF0844' },
  { text: '  [WARN] $20.5M+ Israel lobby funding detected', delay: 4550, color: '#FF0844' },
  { text: '', delay: 4650, color: '' },
  { text: '$ render --interface terminal', delay: 4750, color: '#6b8a6b' },
  { text: '  [OK] UI components compiled', delay: 4950, color: '#00cc33' },
  { text: '  [OK] State dashboards ready', delay: 5100, color: '#00cc33' },
  { text: '', delay: 5200, color: '' },
  { text: 'ALL SYSTEMS OPERATIONAL. LOADING INTERFACE...', delay: 5400, color: '#00FF41' },
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
      <style>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes glitch {
          0%, 100% { text-shadow: 0 0 10px rgba(0,255,65,0.3); transform: translate(0); }
          10% { text-shadow: -3px 0 rgba(255,8,68,0.7), 3px 0 rgba(0,255,65,0.7); transform: translate(2px, -1px); }
          20% { text-shadow: 3px 0 rgba(0,255,65,0.5); transform: translate(-2px, 1px); }
          30% { text-shadow: 0 0 20px rgba(0,255,65,0.8); transform: translate(0); }
          40% { text-shadow: -2px 0 rgba(255,8,68,0.4), 1px 0 rgba(255,182,39,0.5); transform: translate(1px, 0); }
          50% { text-shadow: 0 0 10px rgba(0,255,65,0.3); transform: translate(0); }
        }
        @keyframes scanDown { 0% { top: -5%; } 100% { top: 105%; } }
        @keyframes matrixFall {
          0% { transform: translateY(-100%); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(100vh); opacity: 0; }
        }
        @keyframes hexPulse {
          0%, 100% { opacity: 0.02; }
          50% { opacity: 0.06; }
        }
        @keyframes borderGlow {
          0%, 100% { box-shadow: 0 0 5px rgba(0,255,65,0.1), inset 0 0 5px rgba(0,255,65,0.05); }
          50% { box-shadow: 0 0 15px rgba(0,255,65,0.2), inset 0 0 10px rgba(0,255,65,0.08); }
        }
        @keyframes fadeInLine {
          0% { opacity: 0; transform: translateX(-5px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        @keyframes warningFlash {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes progressGlow {
          0%, 100% { box-shadow: 0 0 5px rgba(0,255,65,0.3); }
          50% { box-shadow: 0 0 20px rgba(0,255,65,0.6), 0 0 40px rgba(0,255,65,0.2); }
        }
        @keyframes cornerPulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.8; }
        }
      `}</style>

      {/* Matrix rain columns */}
      {Array.from({ length: 15 }).map((_, i) => (
        <div key={i} style={{
          position: 'absolute', top: 0, left: `${(i / 15) * 100}%`,
          width: '1px', height: '100%', opacity: 0.04, pointerEvents: 'none',
          background: 'linear-gradient(180deg, transparent, #00FF41 20%, #00FF41 80%, transparent)',
          animation: `matrixFall ${3 + (i % 4)}s linear ${(i * 0.3) % 2}s infinite`,
        }} />
      ))}

      {/* Scanlines */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.04,
        background: 'repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(0,255,65,0.1) 2px, rgba(0,255,65,0.1) 4px)',
        pointerEvents: 'none',
      }} />

      {/* CRT vignette */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.8) 100%)',
      }} />

      {/* Hex grid background */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='49' viewBox='0 0 28 49'%3E%3Cg fill-rule='evenodd'%3E%3Cg fill='%2300FF41' fill-opacity='0.03'%3E%3Cpath d='M13.99 9.25l13 7.5v15l-13 7.5L1 31.75v-15l12.99-7.5zM3 17.9v12.7l10.99 6.34 11-6.35V17.9l-11-6.34L3 17.9z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        animation: 'hexPulse 4s ease infinite',
      }} />

      {/* Moving scan line */}
      <div style={{
        position: 'absolute', left: 0, right: 0, height: '2px',
        background: 'linear-gradient(90deg, transparent 0%, rgba(0,255,65,0.25) 30%, rgba(0,255,65,0.4) 50%, rgba(0,255,65,0.25) 70%, transparent 100%)',
        animation: 'scanDown 2.5s linear infinite', pointerEvents: 'none',
        boxShadow: '0 0 15px rgba(0,255,65,0.3)',
      }} />

      <div style={{ position: 'relative', width: '100%', maxWidth: '550px', padding: '2rem' }}>
        {/* Logo with glitch */}
        <div style={{
          fontSize: 'clamp(1.8rem, 5vw, 2.5rem)', fontWeight: 700, marginBottom: '1.5rem',
          animation: 'glitch 3s infinite', textAlign: 'center',
          letterSpacing: '0.05em',
        }}>
          <span style={{ color: '#00FF41' }}>SNITCHED</span>
          <span style={{ color: '#3d5a3d' }}>.AI</span>
        </div>

        {/* Terminal window */}
        <div style={{
          background: 'rgba(0,15,0,0.6)',
          border: '1px solid rgba(0,255,65,0.15)',
          padding: '1rem', marginBottom: '1.5rem',
          animation: 'borderGlow 3s ease infinite',
          backdropFilter: 'blur(4px)',
        }}>
          {/* Window chrome */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            paddingBottom: '0.75rem', marginBottom: '0.75rem',
            borderBottom: '1px solid rgba(0,255,65,0.08)',
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF0844', boxShadow: '0 0 4px rgba(255,8,68,0.5)' }} />
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#FFB627', boxShadow: '0 0 4px rgba(255,182,39,0.5)' }} />
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00FF41', boxShadow: '0 0 4px rgba(0,255,65,0.5)' }} />
            <span style={{ marginLeft: '0.5rem', fontSize: '0.5rem', color: '#3d5a3d', letterSpacing: '0.1em' }}>
              snitched@intel ~ boot.sh
            </span>
          </div>

          {/* Boot output with line animations */}
          <div style={{
            fontSize: '0.58rem', lineHeight: 1.7,
            maxHeight: '300px', overflowY: 'auto',
          }}>
            {BOOT_LINES.slice(0, visibleLines).map((line, i) => (
              <div key={i} style={{
                color: line.color || 'transparent',
                minHeight: line.text ? 'auto' : '0.5rem',
                animation: line.text ? 'fadeInLine 0.15s ease-out' : 'none',
                ...(line.color === '#FF0844' ? { animation: 'warningFlash 1s ease infinite' } : {}),
              }}>
                {line.text}
              </div>
            ))}
            {visibleLines < BOOT_LINES.length && (
              <span style={{ color: '#00FF41', animation: 'blink 0.6s infinite', fontSize: '0.7rem' }}>&#9608;</span>
            )}
          </div>
        </div>

        {/* Progress section */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: '0.5rem', color: '#3d5a3d', marginBottom: '0.4rem',
            letterSpacing: '0.15em',
          }}>
            <span>SYSTEM BOOT</span>
            <span style={{ color: progress === 100 ? '#00FF41' : '#00cc33', fontWeight: 700 }}>{progress}%</span>
          </div>

          {/* Progress bar with glow */}
          <div style={{
            height: '4px', background: 'rgba(0,255,65,0.06)',
            overflow: 'hidden', position: 'relative',
            border: '1px solid rgba(0,255,65,0.08)',
          }}>
            <div style={{
              height: '100%', width: `${progress}%`,
              background: progress >= 90 ? '#00FF41' : progress >= 50 ? '#00cc33' : '#008f11',
              transition: 'width 0.2s ease, background 0.5s ease',
              animation: progress > 0 ? 'progressGlow 2s ease infinite' : 'none',
            }} />
            {/* Shimmer effect on progress bar */}
            {progress > 0 && progress < 100 && (
              <div style={{
                position: 'absolute', top: 0, height: '100%', width: '30%',
                background: 'linear-gradient(90deg, transparent, rgba(0,255,65,0.3), transparent)',
                animation: `scanDown 1s linear infinite`,
                left: `${progress - 30}%`,
              }} />
            )}
          </div>

          {/* Sub-progress segments */}
          <div style={{ display: 'flex', gap: '2px', marginTop: '4px' }}>
            {['NET', 'DB', 'FEC', 'LOBBY', 'ENGINE', 'UI'].map((label, i) => {
              const segProgress = Math.min(100, Math.max(0, (progress - i * 16) * 6));
              return (
                <div key={label} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{
                    height: '2px', background: 'rgba(0,255,65,0.06)',
                    marginBottom: '2px', overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%', width: `${segProgress}%`,
                      background: segProgress >= 100 ? '#00FF41' : '#008f11',
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                  <div style={{
                    fontSize: '0.35rem', letterSpacing: '0.1em',
                    color: segProgress >= 100 ? '#00FF41' : '#3d5a3d',
                  }}>{label}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Status text */}
        <div style={{
          textAlign: 'center', fontSize: '0.5rem', color: '#3d5a3d',
          letterSpacing: '0.25em', textTransform: 'uppercase',
        }}>
          {progress < 20 ? 'ESTABLISHING SECURE CHANNEL' :
           progress < 40 ? 'CONNECTING TO DATABASE' :
           progress < 60 ? 'LOADING INTELLIGENCE MODULES' :
           progress < 80 ? 'SCANNING THREAT DATABASE' :
           progress < 100 ? 'COMPILING INTERFACE' :
           'READY'}
        </div>

        {/* Corner decorations */}
        {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(pos => (
          <div key={pos} style={{
            position: 'fixed',
            top: pos.includes('top') ? '10px' : 'auto',
            bottom: pos.includes('bottom') ? '10px' : 'auto',
            left: pos.includes('left') ? '10px' : 'auto',
            right: pos.includes('right') ? '10px' : 'auto',
            width: '20px', height: '20px',
            borderTop: pos.includes('top') ? '1px solid rgba(0,255,65,0.2)' : 'none',
            borderBottom: pos.includes('bottom') ? '1px solid rgba(0,255,65,0.2)' : 'none',
            borderLeft: pos.includes('left') ? '1px solid rgba(0,255,65,0.2)' : 'none',
            borderRight: pos.includes('right') ? '1px solid rgba(0,255,65,0.2)' : 'none',
            animation: 'cornerPulse 2s ease infinite',
          }} />
        ))}
      </div>
    </div>
  );
}

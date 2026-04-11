export default function Loading() {
  return (
    <div style={{
      minHeight: '100vh', background: '#000', display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'JetBrains Mono', monospace", color: '#00FF41',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Scanlines */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.04,
        background: 'repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(0,255,65,0.1) 2px, rgba(0,255,65,0.1) 4px)',
        pointerEvents: 'none',
      }} />

      {/* Matrix rain columns */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.06, pointerEvents: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='200'%3E%3Ctext x='2' y='20' fill='%2300FF41' font-size='14' font-family='monospace'%3E1%3C/text%3E%3Ctext x='2' y='45' fill='%2300FF41' font-size='14' font-family='monospace'%3E0%3C/text%3E%3Ctext x='2' y='70' fill='%2300FF41' font-size='14' font-family='monospace'%3E1%3C/text%3E%3Ctext x='2' y='95' fill='%2300FF41' font-size='14' font-family='monospace'%3E0%3C/text%3E%3Ctext x='2' y='120' fill='%2300FF41' font-size='14' font-family='monospace'%3E1%3C/text%3E%3Ctext x='2' y='145' fill='%2300FF41' font-size='14' font-family='monospace'%3E0%3C/text%3E%3Ctext x='2' y='170' fill='%2300FF41' font-size='14' font-family='monospace'%3E1%3C/text%3E%3Ctext x='2' y='195' fill='%2300FF41' font-size='14' font-family='monospace'%3E0%3C/text%3E%3C/svg%3E")`,
        backgroundSize: '20px 200px',
        animation: 'matrixRain 4s linear infinite',
      }} />

      <style>{`
        @keyframes matrixRain { 0% { background-position: 0 0; } 100% { background-position: 0 200px; } }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes typeIn { 0% { width: 0; } 100% { width: 100%; } }
        @keyframes glitch {
          0%, 100% { text-shadow: 0 0 10px rgba(0,255,65,0.3); }
          25% { text-shadow: -2px 0 rgba(255,8,68,0.4), 2px 0 rgba(0,255,65,0.4); }
          50% { text-shadow: 2px 0 rgba(255,8,68,0.2), -1px 0 rgba(0,255,65,0.6); }
          75% { text-shadow: -1px 0 rgba(0,255,65,0.4), 1px 0 rgba(255,182,39,0.3); }
        }
        @keyframes progressBar { 0% { width: 0; } 100% { width: 100%; } }
      `}</style>

      <div style={{ position: 'relative', textAlign: 'center' }}>
        {/* Logo */}
        <div style={{
          fontSize: '2.5rem', fontWeight: 700, marginBottom: '2rem',
          animation: 'glitch 3s infinite',
        }}>
          <span style={{ color: '#00FF41' }}>SNITCHED</span>
          <span style={{ color: '#3d5a3d' }}>.AI</span>
        </div>

        {/* Terminal output */}
        <div style={{
          textAlign: 'left', fontSize: '0.7rem', color: '#6b8a6b',
          maxWidth: '400px', margin: '0 auto 1.5rem',
          lineHeight: 2,
        }}>
          <div><span style={{ color: '#00FF41' }}>$</span> Initializing secure connection...</div>
          <div><span style={{ color: '#00FF41' }}>$</span> Loading politician database...</div>
          <div><span style={{ color: '#00FF41' }}>$</span> Decrypting FEC financial records...</div>
          <div><span style={{ color: '#00FF41' }}>$</span> Mapping lobby connections...</div>
          <div style={{ color: '#00FF41' }}>
            <span>$</span> Rendering interface
            <span style={{ animation: 'blink 1s infinite' }}>_</span>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{
          width: '300px', height: '2px', background: 'rgba(0,255,65,0.1)',
          margin: '0 auto', overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', background: '#00FF41',
            boxShadow: '0 0 10px rgba(0,255,65,0.5)',
            animation: 'progressBar 2s ease-in-out infinite',
          }} />
        </div>

        <div style={{
          marginTop: '1rem', fontSize: '0.55rem', color: '#3d5a3d',
          letterSpacing: '0.2em', textTransform: 'uppercase',
        }}>
          ESTABLISHING SECURE CHANNEL
        </div>
      </div>
    </div>
  );
}

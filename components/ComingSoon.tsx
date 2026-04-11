import Link from 'next/link';
import { getStateName } from '@/lib/state-utils';

const LIVE_STATES = new Set(['FL', 'OH']);

export function isStateLive(stateCode: string | null | undefined): boolean {
  if (!stateCode || stateCode === 'ALL') return true;
  return LIVE_STATES.has(stateCode.toUpperCase());
}

export default function ComingSoon({ stateCode }: { stateCode: string }) {
  const stateName = getStateName(stateCode);

  return (
    <div style={{
      minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      <div style={{ textAlign: 'center', maxWidth: '500px', padding: '2rem' }}>
        {/* Glitch title */}
        <div style={{
          fontSize: '2.5rem', fontWeight: 700, color: '#00FF41', marginBottom: '1rem',
          textShadow: '0 0 20px rgba(0,255,65,0.3)',
        }}>
          {stateName.toUpperCase()}
        </div>

        {/* Status badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.4rem 1rem', marginBottom: '2rem',
          border: '1px solid rgba(255,182,39,0.3)', background: 'rgba(255,182,39,0.06)',
          fontSize: '0.7rem', color: '#FFB627', letterSpacing: '0.15em',
        }}>
          <span style={{ animation: 'pulse 2s infinite' }}>&#9679;</span>
          COMING SOON
        </div>

        {/* Terminal output */}
        <div style={{
          textAlign: 'left', padding: '1.25rem',
          background: 'rgba(0,255,65,0.02)', border: '1px solid rgba(0,255,65,0.1)',
          fontSize: '0.7rem', color: '#6b8a6b', lineHeight: 2, marginBottom: '2rem',
        }}>
          <div><span style={{ color: '#00FF41' }}>$</span> query --state {stateCode}</div>
          <div><span style={{ color: '#FFB627' }}>[PENDING]</span> {stateName} data collection in progress</div>
          <div><span style={{ color: '#FFB627' }}>[PENDING]</span> Federal officials seeding queued</div>
          <div><span style={{ color: '#FFB627' }}>[PENDING]</span> State legislature mapping queued</div>
          <div><span style={{ color: '#FFB627' }}>[PENDING]</span> County officials research queued</div>
          <div><span style={{ color: '#00FF41' }}>$</span> status: <span style={{ color: '#FFB627' }}>INDEXING</span></div>
        </div>

        <p style={{ fontSize: '0.8rem', color: '#6b8a6b', lineHeight: 1.7, marginBottom: '2rem' }}>
          We&apos;re actively building the {stateName} corruption database. Florida and Ohio are fully live
          with 6,700+ politicians tracked. {stateName} is next in the pipeline.
        </p>

        {/* CTA buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/officials?state=FL" style={{
            padding: '0.6rem 1.25rem', border: '1px solid #00FF41',
            color: '#00FF41', fontSize: '0.7rem', fontWeight: 700,
            textDecoration: 'none', letterSpacing: '0.1em',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            VIEW FLORIDA
          </Link>
          <Link href="/officials?state=OH" style={{
            padding: '0.6rem 1.25rem', border: '1px solid #00FF41',
            color: '#00FF41', fontSize: '0.7rem', fontWeight: 700,
            textDecoration: 'none', letterSpacing: '0.1em',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            VIEW OHIO
          </Link>
          <Link href="/" style={{
            padding: '0.6rem 1.25rem', border: '1px solid rgba(0,255,65,0.2)',
            color: '#6b8a6b', fontSize: '0.7rem', fontWeight: 700,
            textDecoration: 'none', letterSpacing: '0.1em',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            HOME
          </Link>
        </div>
      </div>
    </div>
  );
}

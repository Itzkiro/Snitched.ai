'use client';

import Link from 'next/link';
import { getAllPoliticians } from '@/lib/real-data';
import PoliticianCard from '@/components/PoliticianCard';

export default function Home() {
  const activePoliticians = getAllPoliticians().filter(p => p.isActive);
  const juiceBoxCount = activePoliticians.filter(p => p.juiceBoxTier !== 'none').length;
  const totalFunding = activePoliticians.reduce((sum, p) => sum + p.aipacFunding, 0);

  return (
    <div style={{ minHeight: '100vh', position: 'relative' }}>
      {/* Grid Overlay */}
      <div className="grid-overlay" />

      {/* Hero Section */}
      <section 
        className="scan-effect"
        style={{
          padding: '6rem 2rem',
          textAlign: 'center',
          position: 'relative',
          borderBottom: '2px solid var(--border-red)',
        }}
      >
        <div className="warning-stripe" style={{ marginBottom: '3rem' }} />
        
        <div style={{ maxWidth: '1200px', margin: '0 auto', position: 'relative', zIndex: 2 }}>
          <div 
            style={{
              fontSize: '0.875rem',
              color: 'var(--red-blood)',
              marginBottom: '1rem',
              letterSpacing: '0.2em',
              fontWeight: 700,
            }}
          >
            [ CLASSIFIED INTELLIGENCE ]
          </div>
          
          <h1 
            style={{
              fontSize: '5rem',
              fontWeight: 400,
              marginBottom: '1rem',
              lineHeight: 0.9,
              color: 'white',
            }}
          >
            EVERY POLITICIAN.<br />
            EVERY DOLLAR.<br />
            <span className="text-glow-red" style={{ color: 'var(--red-blood)' }}>
              EVERY LIE.
            </span>
          </h1>
          
          <div 
            style={{
              height: '2px',
              width: '200px',
              background: 'var(--red-blood)',
              margin: '2rem auto',
              boxShadow: '0 0 10px var(--red-blood)',
            }}
          />
          
          <p 
            style={{
              fontSize: '1.25rem',
              color: 'var(--text-secondary)',
              marginBottom: '3rem',
              fontWeight: 500,
              letterSpacing: '0.05em',
            }}
          >
            FLORIDA POLITICAL TRANSPARENCY PLATFORM
          </p>
          
          <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/browse">
              <button className="btn btn-primary">
                ACCESS DATABASE
              </button>
            </Link>
            <Link href="/juicebox">
              <button className="btn btn-secondary">
                🧃 AIPAC LEADERBOARD
              </button>
            </Link>
          </div>
        </div>
        
        <div className="warning-stripe" style={{ marginTop: '3rem' }} />
      </section>

      {/* Stats Section */}
      <section style={{ padding: '4rem 2rem', maxWidth: '1200px', margin: '0 auto', position: 'relative', zIndex: 2 }}>
        <div 
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '2rem',
          }}
        >
          <div className="card">
            <div 
              style={{
                fontSize: '0.75rem',
                color: 'var(--red-blood)',
                marginBottom: '1rem',
                letterSpacing: '0.2em',
                fontWeight: 700,
              }}
            >
              [ TARGETS TRACKED ]
            </div>
            <div 
              className="corruption-score"
              style={{
                color: 'white',
                marginBottom: '0.5rem',
              }}
            >
              {getAllPoliticians().length}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textTransform: 'uppercase' }}>
              Politicians Monitored
            </div>
          </div>

          <div className="card card-danger">
            <div 
              style={{
                fontSize: '0.75rem',
                color: 'var(--red-blood)',
                marginBottom: '1rem',
                letterSpacing: '0.2em',
                fontWeight: 700,
              }}
            >
              [ COMPROMISED OFFICIALS ]
            </div>
            <div 
              className="corruption-score"
              style={{
                color: 'var(--red-blood)',
                marginBottom: '0.5rem',
              }}
            >
              {juiceBoxCount}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textTransform: 'uppercase' }}>
              AIPAC-Funded Targets
            </div>
          </div>

          <div className="card card-danger">
            <div 
              style={{
                fontSize: '0.75rem',
                color: 'var(--red-blood)',
                marginBottom: '1rem',
                letterSpacing: '0.2em',
                fontWeight: 700,
              }}
            >
              [ FOREIGN INFLUENCE ]
            </div>
            <div 
              className="corruption-score"
              style={{
                color: 'var(--red-bright)',
                marginBottom: '0.5rem',
              }}
            >
              ${(totalFunding / 1000000).toFixed(1)}M
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textTransform: 'uppercase' }}>
              AIPAC Money Tracked
            </div>
          </div>
        </div>
      </section>

      {/* Featured Politicians */}
      <section style={{ padding: '4rem 2rem', maxWidth: '1400px', margin: '0 auto', position: 'relative', zIndex: 2 }}>
        <div style={{ marginBottom: '3rem', textAlign: 'center' }}>
          <div className="warning-stripe" style={{ margin: '0 auto 2rem', width: '100px' }} />
          <h2 
            style={{
              fontSize: '3rem',
              fontWeight: 400,
              marginBottom: '1rem',
              color: 'white',
            }}
          >
            EXPOSED TARGETS
          </h2>
          <p style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            High-Priority Officials Under Investigation
          </p>
        </div>

        <div 
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
            gap: '2rem',
          }}
        >
          {activePoliticians
            .filter(p => p.juiceBoxTier !== 'none')
            .sort((a, b) => b.aipacFunding - a.aipacFunding)
            .slice(0, 6)
            .map(politician => (
              <PoliticianCard key={politician.id} politician={politician} />
            ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: '4rem' }}>
          <Link href="/browse">
            <button className="btn btn-secondary">
              VIEW FULL DATABASE →
            </button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer 
        style={{
          background: 'var(--bg-secondary)',
          borderTop: '2px solid var(--border-red)',
          padding: '3rem 2rem',
          marginTop: '6rem',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <div className="warning-stripe" style={{ marginBottom: '2rem' }} />
        <div 
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '2rem',
          }}
        >
          <div>
            <div 
              style={{
                fontSize: '2rem',
                fontWeight: 400,
                color: 'white',
                marginBottom: '0.5rem',
              }}
            >
              SNITCHED.AI
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              © 2026 The AI Dudes • Political Transparency Platform
            </div>
          </div>
          <div style={{ display: 'flex', gap: '2rem', fontSize: '0.875rem' }}>
            <a 
              href="#"
              style={{
                color: 'var(--text-muted)',
                textDecoration: 'none',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                transition: 'color 0.2s ease',
              }}
            >
              About
            </a>
            <a 
              href="#"
              style={{
                color: 'var(--text-muted)',
                textDecoration: 'none',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                transition: 'color 0.2s ease',
              }}
            >
              Methodology
            </a>
            <a 
              href="#"
              style={{
                color: 'var(--red-blood)',
                textDecoration: 'none',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                transition: 'color 0.2s ease',
                fontWeight: 700,
              }}
            >
              Submit Intel
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

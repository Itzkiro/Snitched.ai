import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Candidates | SNITCHED.AI',
  description: 'Track Florida political candidates, their campaign filings, and election timelines. Real-time data from FL Division of Elections.',
};
import { getServerSupabase } from '@/lib/supabase-server';
import type { Politician } from '@/lib/types';

// ISR: revalidate every 5 minutes
export const revalidate = 300;

async function getPoliticians(): Promise<Politician[]> {
  const client = getServerSupabase();
  if (!client) {
    const { getAllPoliticians } = await import('@/lib/real-data');
    return getAllPoliticians();
  }

  const { data, error } = await client
    .from('politicians')
    .select('bioguide_id, name, office, office_level, party, district, jurisdiction, jurisdiction_type, corruption_score, aipac_funding, is_active, term_start, term_end, total_funds')
    .eq('is_active', false)
    .order('name');

  if (error || !data || data.length === 0) {
    const { getAllPoliticians } = await import('@/lib/real-data');
    return getAllPoliticians().filter(p => !p.isActive);
  }

  return data.map((row: Record<string, unknown>) => ({
    id: row.bioguide_id as string,
    name: row.name as string,
    office: row.office as string,
    officeLevel: row.office_level as Politician['officeLevel'],
    party: row.party as Politician['party'],
    district: row.district as string | undefined,
    jurisdiction: row.jurisdiction as string,
    jurisdictionType: row.jurisdiction_type as Politician['jurisdictionType'],
    corruptionScore: Number(row.corruption_score) || 0,
    aipacFunding: Number(row.aipac_funding) || 0,
    isActive: row.is_active as boolean,
    termStart: row.term_start as string,
    termEnd: row.term_end as string | undefined,
    totalFundsRaised: Number(row.total_funds) || 0,
  })) as Politician[];
}

export default async function CandidatesPage() {
  const candidates = await getPoliticians();

  return (
    <div style={{ minHeight: '100vh', paddingBottom: '4rem' }}>
      {/* Title */}
      <div style={{ padding: '2rem', borderBottom: '1px solid var(--terminal-border)' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 400, letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
          CANDIDATES RUNNING
        </h1>
        <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          2026 Election Cycle | Campaign Finance Monitoring Active
        </div>
      </div>

      {/* Alert */}
      <div style={{ padding: '2rem', background: 'rgba(0, 191, 255, 0.05)', borderBottom: '1px solid var(--terminal-border)' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          padding: '1rem',
          background: 'var(--terminal-card)',
          border: '1px solid var(--terminal-blue)'
        }}>
          <span style={{ fontSize: '2rem' }}>📢</span>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--terminal-blue)', marginBottom: '0.25rem' }}>
              ELECTION INTELLIGENCE ALERT
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--terminal-text-dim)' }}>
              Tracking {candidates.length} candidates | Live FEC data integration | AIPAC funding monitoring enabled
            </div>
          </div>
        </div>
      </div>

      {candidates.length > 0 ? (
        <div style={{ padding: '2rem' }}>
          <div className="data-grid" style={{ padding: 0 }}>
            {candidates
              .filter(pol => pol && pol.id && pol.name && pol.office && pol.party)
              .map((pol) => (
              <Link
                key={pol.id}
                href={`/politician/${pol.id}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div className="terminal-card">
                  <div className="card-header">
                    <div>
                      <div className="card-title">{pol.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--terminal-text-dim)', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span>Running for: {pol.office}</span>
                        <span style={{
                          fontSize: '10px',
                          padding: '0.3rem 0.6rem',
                          background: pol.party === 'Republican' ? '#dc2626' : pol.party === 'Democrat' ? '#2563eb' : '#6b7280',
                          color: '#fff',
                          borderRadius: '10px',
                          fontWeight: 600,
                        }}>
                          {pol.party === 'Republican' ? '🐘 R' : pol.party === 'Democrat' ? '🫏 D' : pol.party}
                        </span>
                      </div>
                    </div>
                    <div className="card-status">
                      CANDIDATE
                    </div>
                  </div>

                  <div style={{ marginTop: '1rem' }}>
                    <div style={{ fontSize: '10px', color: 'var(--terminal-text-dim)', marginBottom: '0.5rem' }}>
                      BACKGROUND CHECK
                    </div>
                    <div style={{
                      fontSize: '1.5rem',
                      fontWeight: 700,
                      color: pol.corruptionScore >= 60 ? 'var(--terminal-red)' :
                             pol.corruptionScore >= 40 ? 'var(--terminal-amber)' : 'var(--terminal-green)'
                    }}>
                      SCORE: {pol.corruptionScore}/100
                    </div>
                  </div>

                  {pol.aipacFunding > 0 && (
                    <div style={{
                      padding: '0.75rem',
                      background: 'rgba(255, 8, 68, 0.1)',
                      border: '1px solid var(--terminal-red)',
                      marginTop: '1rem'
                    }}>
                      <div style={{ fontSize: '10px', color: 'var(--terminal-text-dim)', marginBottom: '0.25rem' }}>
                        ⚠️ CAMPAIGN FINANCE ALERT
                      </div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--terminal-red)' }}>
                        ${(pol.aipacFunding / 1000).toFixed(0)}K AIPAC FUNDING
                      </div>
                    </div>
                  )}

                  {pol.termEnd && pol.termStart && (
                    <div style={{ marginTop: '1rem', fontSize: '11px', color: 'var(--terminal-text-dim)' }}>
                      Previously served: {new Date(pol.termStart).getFullYear()} - {new Date(pol.termEnd).getFullYear()}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div style={{
          padding: '4rem 2rem',
          textAlign: 'center',
          color: 'var(--terminal-text-dim)'
        }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📊</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--terminal-blue)', marginBottom: '1rem' }}>
            NO ACTIVE CANDIDATES DETECTED
          </div>
          <div style={{ fontSize: '0.875rem', maxWidth: '600px', margin: '0 auto', lineHeight: 1.6 }}>
            Candidate monitoring is active. New filings with Florida Division of Elections and FEC will be automatically detected and indexed.
            System will alert when 2026 primary filing period opens.
          </div>
          <div style={{ marginTop: '2rem' }}>
            <Link href="/officials">
              <button className="terminal-btn">
                VIEW SEATED OFFICIALS →
              </button>
            </Link>
          </div>
        </div>
      )}

      {/* Filing information */}
      <div style={{ padding: '2rem', background: 'var(--terminal-surface)', borderTop: '1px solid var(--terminal-border)' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h3 style={{
            fontSize: '1rem',
            fontWeight: 700,
            color: 'var(--terminal-blue)',
            marginBottom: '1rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em'
          }}>
            📋 2026 FILING CALENDAR
          </h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '1rem',
            fontSize: '11px'
          }}>
            <div className="terminal-card">
              <div style={{ color: 'var(--terminal-text-dim)', marginBottom: '0.5rem' }}>PRIMARY FILING DEADLINE</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>JUN 14, 2026</div>
            </div>
            <div className="terminal-card">
              <div style={{ color: 'var(--terminal-text-dim)', marginBottom: '0.5rem' }}>PRIMARY ELECTION</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>AUG 18, 2026</div>
            </div>
            <div className="terminal-card">
              <div style={{ color: 'var(--terminal-text-dim)', marginBottom: '0.5rem' }}>GENERAL FILING DEADLINE</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>SEP 15, 2026</div>
            </div>
            <div className="terminal-card">
              <div style={{ color: 'var(--terminal-text-dim)', marginBottom: '0.5rem' }}>GENERAL ELECTION</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>NOV 3, 2026</div>
            </div>
          </div>
        </div>
      </div>

      {/* Data source footer */}
      <div className="classified-footer">
        ALL DATA ACQUIRED VIA OSINT // PUBLIC RECORDS: FEC, SOCIAL MEDIA, NEWS OUTLETS // CAMPAIGN MONITORING DIVISION
      </div>
    </div>
  );
}

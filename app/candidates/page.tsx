import type { Metadata } from 'next';
import Link from 'next/link';
import { getServiceRoleSupabase, getServerSupabase } from '@/lib/supabase-server';
import type { Politician } from '@/lib/types';
import { filterByState, getStateName } from '@/lib/state-utils';

export const metadata: Metadata = {
  title: 'Candidates',
  description: 'Track political candidates, their campaign filings, and election timelines. Real-time data from FEC and state election databases.',
};

export const dynamic = 'force-dynamic';

async function getCandidates(): Promise<Politician[]> {
  const client = getServiceRoleSupabase() || getServerSupabase();
  if (!client) {
    const { getAllPoliticians } = await import('@/lib/real-data');
    return getAllPoliticians();
  }

  const { data, error } = await client.rpc('get_candidates');

  if (error) {
    console.error('Candidates query error:', error.message);
    return [];
  }
  if (!data || data.length === 0) {
    return [];
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
    isCandidate: row.is_candidate as boolean,
    runningFor: row.running_for as string | undefined,
    termStart: row.term_start as string,
    termEnd: row.term_end as string | undefined,
    totalFundsRaised: Number(row.total_funds) || 0,
  })) as Politician[];
}

function CandidateCard({ pol }: { pol: Politician }) {
  return (
    <Link href={`/politician/${pol.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="terminal-card">
        <div className="card-header">
          <div>
            <div className="card-title">{pol.name}</div>
            <div style={{ fontSize: '11px', color: 'var(--terminal-text-dim)', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span>{pol.runningFor || pol.office}</span>
              <span style={{
                fontSize: '10px', padding: '0.3rem 0.6rem',
                background: pol.party === 'Republican' ? '#dc2626' : pol.party === 'Democrat' ? '#2563eb' : '#6b7280',
                color: '#fff', fontWeight: 600,
              }}>
                {pol.party === 'Republican' ? 'R' : pol.party === 'Democrat' ? 'D' : pol.party}
              </span>
            </div>
          </div>
          <div className="card-status" style={{
            fontSize: '10px',
            color: pol.isActive ? 'var(--terminal-amber)' : 'var(--terminal-green)',
            background: pol.isActive ? 'rgba(255,182,39,0.1)' : 'rgba(0,255,65,0.1)',
            border: pol.isActive ? '1px solid rgba(255,182,39,0.3)' : '1px solid var(--terminal-green)',
          }}>
            {pol.isActive ? 'INCUMBENT' : 'CHALLENGER'}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--terminal-text-dim)' }}>CORRUPTION SCORE</div>
            <div style={{
              fontSize: '1.5rem', fontWeight: 700,
              color: pol.corruptionScore >= 60 ? 'var(--terminal-red)' :
                     pol.corruptionScore >= 40 ? 'var(--terminal-amber)' : 'var(--terminal-green)',
            }}>
              {pol.corruptionScore}/100
            </div>
          </div>
          {pol.aipacFunding > 0 && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '10px', color: 'var(--terminal-text-dim)' }}>ISRAEL LOBBY</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--terminal-red)', fontFamily: 'Bebas Neue, sans-serif' }}>
                {pol.aipacFunding >= 1000000
                  ? `$${(pol.aipacFunding / 1000000).toFixed(1)}M`
                  : `$${(pol.aipacFunding / 1000).toFixed(0)}K`}
              </div>
            </div>
          )}
        </div>

        {pol.jurisdiction && (
          <div style={{ marginTop: '0.75rem', fontSize: '10px', color: 'var(--terminal-text-dim)', padding: '0.4rem 0', borderTop: '1px solid var(--terminal-border)' }}>
            {pol.jurisdiction} {pol.district ? `| District ${pol.district}` : ''}
          </div>
        )}
      </div>
    </Link>
  );
}

function SectionHeader({ title, count, icon }: { title: string; count: number; icon: string }) {
  return (
    <div style={{ padding: '2rem 2rem 1rem', borderTop: '1px solid var(--terminal-border)' }}>
      <h2 style={{
        fontSize: '1.25rem', fontWeight: 600, color: 'var(--terminal-green)',
        textTransform: 'uppercase', letterSpacing: '0.1em',
        display: 'flex', alignItems: 'center', gap: '0.5rem',
      }}>
        <span>{icon}</span> {title} ({count})
      </h2>
    </div>
  );
}

export default async function CandidatesPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state: stateParam } = await searchParams;
  const allCandidates = await getCandidates();
  const candidates = filterByState(allCandidates, stateParam);
  const stateName = getStateName(stateParam);

  const byLevel = {
    federal: candidates.filter(p => p.officeLevel === 'US Senator' || p.officeLevel === 'US Representative'),
    state: candidates.filter(p => p.officeLevel === 'Governor' || p.officeLevel === 'State Senator' || p.officeLevel === 'State Representative'),
    local: candidates.filter(p =>
      p.officeLevel !== 'US Senator' && p.officeLevel !== 'US Representative' &&
      p.officeLevel !== 'Governor' && p.officeLevel !== 'State Senator' && p.officeLevel !== 'State Representative'
    ),
  };

  const totalAipac = candidates.reduce((s, p) => s + (p.aipacFunding || 0), 0);

  return (
    <div style={{ minHeight: '100vh', paddingBottom: '4rem' }}>
      {/* Title */}
      <div style={{ padding: '2rem', borderBottom: '1px solid var(--terminal-border)' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 400, letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
          CANDIDATES
        </h1>
        <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {stateName} | 2026 Election Cycle | Campaign Finance Monitoring Active
        </div>
      </div>

      {/* Stats bar */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '1rem', padding: '1rem 2rem', borderBottom: '1px solid var(--terminal-border)',
      }}>
        <div className="terminal-card" style={{ padding: '1rem' }}>
          <div className="stat-value">{candidates.length}</div>
          <div className="stat-label">TOTAL CANDIDATES</div>
        </div>
        <div className="terminal-card" style={{ padding: '1rem' }}>
          <div className="stat-value" style={{ color: 'var(--terminal-green)' }}>{byLevel.federal.length}</div>
          <div className="stat-label">FEDERAL</div>
        </div>
        <div className="terminal-card" style={{ padding: '1rem' }}>
          <div className="stat-value" style={{ color: 'var(--terminal-amber)' }}>{byLevel.state.length}</div>
          <div className="stat-label">STATE</div>
        </div>
        <div className="terminal-card" style={{ padding: '1rem' }}>
          <div className="stat-value" style={{ color: 'var(--terminal-text-dim)' }}>{byLevel.local.length}</div>
          <div className="stat-label">LOCAL</div>
        </div>
        {totalAipac > 0 && (
          <div className="terminal-card" style={{ padding: '1rem' }}>
            <div className="stat-value danger">
              {totalAipac >= 1000000 ? `$${(totalAipac / 1000000).toFixed(1)}M` : `$${(totalAipac / 1000).toFixed(0)}K`}
            </div>
            <div className="stat-label">AIPAC FUNDING</div>
          </div>
        )}
      </div>

      {candidates.length > 0 ? (
        <>
          {/* Federal Candidates */}
          {byLevel.federal.length > 0 && (
            <>
              <SectionHeader title="FEDERAL CANDIDATES" count={byLevel.federal.length} icon="&#127963;" />
              <div className="data-grid" style={{ padding: '0 2rem 1rem' }}>
                {byLevel.federal
                  .filter(p => p.id && p.name && p.office && p.party)
                  .map(pol => <CandidateCard key={pol.id} pol={pol} />)}
              </div>
            </>
          )}

          {/* State Candidates */}
          {byLevel.state.length > 0 && (
            <>
              <SectionHeader title="STATE CANDIDATES" count={byLevel.state.length} icon="&#9878;&#65039;" />
              <div className="data-grid" style={{ padding: '0 2rem 1rem' }}>
                {byLevel.state
                  .filter(p => p.id && p.name && p.office && p.party)
                  .map(pol => <CandidateCard key={pol.id} pol={pol} />)}
              </div>
            </>
          )}

          {/* Local Candidates */}
          {byLevel.local.length > 0 && (
            <>
              <SectionHeader title="LOCAL CANDIDATES" count={byLevel.local.length} icon="&#127970;" />
              <div className="data-grid" style={{ padding: '0 2rem 1rem' }}>
                {byLevel.local
                  .filter(p => p.id && p.name && p.office && p.party)
                  .map(pol => <CandidateCard key={pol.id} pol={pol} />)}
              </div>
            </>
          )}
        </>
      ) : (
        <div style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--terminal-text-dim)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>&#128269;</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--terminal-green)', marginBottom: '1rem' }}>
            NO ACTIVE CANDIDATES DETECTED
          </div>
          <div style={{ fontSize: '0.875rem', maxWidth: '500px', margin: '0 auto', lineHeight: 1.6 }}>
            Candidate monitoring is active for {stateName}. New filings with FEC and state election
            databases will be automatically detected and indexed when the 2026 filing period opens.
          </div>
          <div style={{ marginTop: '2rem' }}>
            <Link href={`/officials${stateParam ? `?state=${stateParam}` : ''}`}>
              <button className="terminal-btn">VIEW SEATED OFFICIALS</button>
            </Link>
          </div>
        </div>
      )}

      {/* Filing Calendar */}
      <div style={{ padding: '2rem', background: 'var(--terminal-surface)', borderTop: '1px solid var(--terminal-border)' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h3 style={{
            fontSize: '0.85rem', fontWeight: 700, color: 'var(--terminal-green)',
            marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.1em',
          }}>
            2026 FILING CALENDAR
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', fontSize: '11px' }}>
            {[
              { label: 'PRIMARY FILING DEADLINE', date: 'JUN 14, 2026' },
              { label: 'PRIMARY ELECTION', date: 'AUG 18, 2026' },
              { label: 'GENERAL FILING DEADLINE', date: 'SEP 15, 2026' },
              { label: 'GENERAL ELECTION', date: 'NOV 3, 2026' },
            ].map(d => (
              <div key={d.label} className="terminal-card" style={{ padding: '0.75rem' }}>
                <div style={{ color: 'var(--terminal-text-dim)', marginBottom: '0.3rem', fontSize: '0.6rem', letterSpacing: '0.1em' }}>{d.label}</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{d.date}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="classified-footer">
        ALL DATA ACQUIRED VIA OSINT // PUBLIC RECORDS: FEC, STATE ELECTION DATABASES // CAMPAIGN MONITORING DIVISION
      </div>
    </div>
  );
}

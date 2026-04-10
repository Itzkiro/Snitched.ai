import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Seated Officials | SNITCHED.AI',
  description: 'Florida seated officials — US Senators, Representatives, State Legislators, and County Officials. Corruption scores, campaign finance, and voting records.',
};
import { getServerSupabase } from '@/lib/supabase-server';
import type { Politician } from '@/lib/types';

// ISR: revalidate every 5 minutes
export const revalidate = 300;

async function getOfficials(): Promise<Politician[]> {
  const client = getServerSupabase();
  if (!client) {
    const { getAllPoliticians } = await import('@/lib/real-data');
    return getAllPoliticians().filter(p => p.isActive);
  }

  const { data, error } = await client
    .from('politicians')
    .select('bioguide_id, name, office, office_level, party, district, jurisdiction, jurisdiction_type, corruption_score, aipac_funding, juice_box_tier, is_active, total_funds')
    .eq('is_active', true)
    .order('name');

  if (error || !data || data.length === 0) {
    const { getAllPoliticians } = await import('@/lib/real-data');
    return getAllPoliticians().filter(p => p.isActive);
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
    juiceBoxTier: (row.juice_box_tier as Politician['juiceBoxTier']) || 'none',
    isActive: row.is_active as boolean,
    totalFundsRaised: Number(row.total_funds) || 0,
  })) as Politician[];
}

export default async function OfficialsPage() {
  const seatedOfficials = await getOfficials();

  const byLevel = {
    federal: seatedOfficials.filter(p => p.officeLevel === 'US Senator' || p.officeLevel === 'US Representative'),
    state: seatedOfficials.filter(p => p.officeLevel === 'Governor' || p.officeLevel === 'State Senator' || p.officeLevel === 'State Representative'),
    county: seatedOfficials.filter(p => p.officeLevel === 'County Commissioner' || p.officeLevel === 'Sheriff' || p.officeLevel === 'Clerk of Court' || p.officeLevel === 'Property Appraiser' || p.officeLevel === 'Tax Collector' || p.officeLevel === 'Supervisor of Elections'),
  };

  return (
    <div style={{ minHeight: '100vh', paddingBottom: '4rem' }}>
      {/* Title */}
      <div style={{ padding: '2rem', borderBottom: '1px solid var(--terminal-border)' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 400, letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
          SEATED OFFICIALS
        </h1>
        <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Currently serving elected officials | Live monitoring active
        </div>
      </div>

      {/* Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '1rem',
        padding: '1rem',
        borderBottom: '1px solid var(--terminal-border)'
      }}>
        <div className="terminal-card">
          <div className="stat-value">{seatedOfficials.length}</div>
          <div className="stat-label">TOTAL OFFICIALS</div>
        </div>
        <div className="terminal-card">
          <div className="stat-value danger">{byLevel.federal.length}</div>
          <div className="stat-label">FEDERAL</div>
        </div>
        <div className="terminal-card">
          <div className="stat-value warning">{byLevel.state.length}</div>
          <div className="stat-label">STATE</div>
        </div>
        <div className="terminal-card">
          <div className="stat-value">{byLevel.county.length}</div>
          <div className="stat-label">COUNTY/LOCAL</div>
        </div>
      </div>

      {/* Federal Officials */}
      <div style={{ padding: '2rem' }}>
        <h2 style={{
          fontSize: '1.25rem',
          fontWeight: 600,
          marginBottom: '1.5rem',
          color: 'var(--terminal-blue)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em'
        }}>
          🏛️ FEDERAL DELEGATION ({byLevel.federal.length})
        </h2>
        <div className="data-grid" style={{ padding: 0 }}>
          {byLevel.federal
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
                      <span>{pol.office}</span>
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
                  <div className={`card-status ${pol.juiceBoxTier !== 'none' ? 'compromised' : ''}`}>
                    {pol.juiceBoxTier !== 'none' ? 'COMPROMISED' : 'MONITORED'}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--terminal-text-dim)' }}>CORRUPTION SCORE</div>
                    <div style={{
                      fontSize: '1.5rem',
                      fontWeight: 700,
                      color: pol.corruptionScore >= 60 ? 'var(--terminal-red)' :
                             pol.corruptionScore >= 40 ? 'var(--terminal-amber)' : 'var(--terminal-green)'
                    }}>
                      {pol.corruptionScore}/100
                    </div>
                  </div>
                  {(pol.israelLobbyTotal || pol.aipacFunding || 0) > 0 && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '10px', color: 'var(--terminal-text-dim)' }}>ISRAEL LOBBY</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--terminal-red)', fontFamily: 'Bebas Neue, sans-serif' }}>
                        {(() => { const amt = pol.israelLobbyTotal || pol.aipacFunding || 0; return amt >= 1000000 ? `$${(amt/1000000).toFixed(1)}M` : `$${(amt/1000).toFixed(0)}K`; })()}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* State Officials */}
      <div style={{ padding: '2rem', borderTop: '1px solid var(--terminal-border)' }}>
        <h2 style={{
          fontSize: '1.25rem',
          fontWeight: 600,
          marginBottom: '1.5rem',
          color: 'var(--terminal-blue)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em'
        }}>
          ⚖️ STATE GOVERNMENT ({byLevel.state.length})
        </h2>
        <div className="data-grid" style={{ padding: 0 }}>
          {byLevel.state
            .filter(pol => pol && pol.id && pol.name && pol.office && pol.party)
            .slice(0, 12)
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
                      <span>{pol.office}</span>
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
                </div>
                <div style={{ marginTop: '1rem', fontSize: '1.25rem', fontWeight: 700, color: 'var(--terminal-blue)' }}>
                  SCORE: {pol.corruptionScore}
                </div>
              </div>
            </Link>
          ))}
        </div>
        {byLevel.state.length > 12 && (
          <div style={{ textAlign: 'center', marginTop: '2rem' }}>
            <Link href="/browse?filter=state">
              <button className="terminal-btn">
                VIEW ALL {byLevel.state.length} STATE OFFICIALS →
              </button>
            </Link>
          </div>
        )}
      </div>

      {/* County Officials */}
      <div style={{ padding: '2rem', borderTop: '1px solid var(--terminal-border)' }}>
        <h2 style={{
          fontSize: '1.25rem',
          fontWeight: 600,
          marginBottom: '1.5rem',
          color: 'var(--terminal-blue)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em'
        }}>
          🏛️ COUNTY & LOCAL ({byLevel.county.length})
        </h2>
        <div className="data-grid" style={{ padding: 0 }}>
          {byLevel.county
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
                    <div style={{ fontSize: '11px', color: 'var(--terminal-text-dim)', marginTop: '0.25rem' }}>
                      {pol.office} • {pol.jurisdiction}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: '1rem', fontSize: '1.25rem', fontWeight: 700, color: 'var(--terminal-blue)' }}>
                  SCORE: {pol.corruptionScore}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Data source footer */}
      <div className="classified-footer">
        ALL DATA ACQUIRED VIA OSINT // PUBLIC RECORDS: FEC, SOCIAL MEDIA, NEWS OUTLETS // ACTIVE OFFICIALS MONITORING DIVISION
      </div>
    </div>
  );
}

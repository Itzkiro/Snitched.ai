import type { Metadata } from 'next';
import Link from 'next/link';
import { getServiceRoleSupabase, getServerSupabase } from '@/lib/supabase-server';
import type { Politician } from '@/lib/types';
import { filterByState, getStateName } from '@/lib/state-utils';
import ComingSoon, { isStateLive } from '@/components/ComingSoon';
import CandidateCompare from './CandidateCompare';

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
    israelLobbyTotal: Number(row.israel_lobby_total) || 0,
    isActive: row.is_active as boolean,
    isCandidate: row.is_candidate as boolean,
    runningFor: row.running_for as string | undefined,
    termStart: row.term_start as string,
    termEnd: row.term_end as string | undefined,
    totalFundsRaised: Number(row.total_funds) || 0,
  })) as Politician[];
}

// ── Helpers ──

function fmtMoney(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return n > 0 ? `$${n}` : '$0';
}

function partyColor(party: string): string {
  if (party === 'Republican') return '#dc2626';
  if (party === 'Democrat') return '#2563eb';
  return '#6b7280';
}

function partyTag(party: string): string {
  if (party === 'Republican') return 'R';
  if (party === 'Democrat') return 'D';
  return party?.charAt(0) || '?';
}

/** Group candidates by the seat they're running for */
function groupByRace(candidates: Politician[]): { seat: string; candidates: Politician[] }[] {
  const map = new Map<string, Politician[]>();
  for (const c of candidates) {
    const seat = c.runningFor || c.office || 'Unknown';
    if (!map.has(seat)) map.set(seat, []);
    map.get(seat)!.push(c);
  }
  // Sort races: most candidates first, then alphabetical
  return Array.from(map.entries())
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([seat, cands]) => ({
      seat,
      candidates: cands.sort((a, b) => (b.totalFundsRaised || 0) - (a.totalFundsRaised || 0)),
    }));
}

/** Categorise races by level */
function categoriseRaces(races: { seat: string; candidates: Politician[] }[]) {
  const governor: typeof races = [];
  const senate: typeof races = [];
  const house: typeof races = [];
  const stateLevel: typeof races = [];
  const local: typeof races = [];

  for (const race of races) {
    const seat = race.seat.toLowerCase();
    if (seat.includes('governor')) governor.push(race);
    else if (seat.includes('senate') || seat.includes('u.s. senate')) senate.push(race);
    else if (seat.includes('u.s. house') || seat.includes('house fl-')) house.push(race);
    else if (seat.includes('attorney general') || seat.includes('cfo') || seat.includes('chief financial') ||
             seat.includes('agriculture') || seat.includes('state senate') || seat.includes('state rep'))
      stateLevel.push(race);
    else local.push(race);
  }

  return { governor, senate, house, stateLevel, local };
}

/**
 * Is this candidate the incumbent for the seat they're running for?
 * e.g. Byron Donalds is a US Rep running for Governor → NOT incumbent.
 * Ashley Moody is a US Senator running for US Senate → IS incumbent.
 */
function isIncumbentForSeat(pol: Politician): boolean {
  if (!pol.isActive || !pol.runningFor) return false;
  const seat = pol.runningFor.toLowerCase();
  const office = pol.office.toLowerCase();
  // Direct match: current office contains the seat title or vice versa
  if (office.includes('governor') && seat.includes('governor')) return true;
  if (office.includes('u.s. senate') && seat.includes('senate')) return true;
  if (office.includes('u.s. house') && seat.includes('house') && pol.district && seat.includes(pol.district.toLowerCase())) return true;
  if (office.includes('state senator') && seat.includes('state senate')) return true;
  if (office.includes('state rep') && seat.includes('state rep')) return true;
  if (office.includes('attorney general') && seat.includes('attorney general')) return true;
  if (office.includes('cfo') && seat.includes('cfo')) return true;
  if (office.includes('chief financial') && seat.includes('chief financial')) return true;
  if (office.includes('agriculture') && seat.includes('agriculture')) return true;
  // Fuzzy: if the running_for seat is part of their current office title
  if (office.includes(seat) || seat.includes(office)) return true;
  return false;
}

// ── Components ──

function CandidateCard({ pol, incumbent }: { pol: Politician; incumbent: boolean }) {
  return (
    <Link href={`/politician/${pol.id}`} style={{ textDecoration: 'none', color: 'inherit', flex: '1 1 260px', maxWidth: '400px' }}>
      <div className="terminal-card" style={{ height: '100%' }}>
        <div className="card-header">
          <div>
            <div className="card-title">{pol.name}</div>
            <div style={{ fontSize: '11px', color: 'var(--terminal-text-dim)', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span>{pol.office}</span>
              <span style={{
                fontSize: '10px', padding: '0.3rem 0.6rem',
                background: partyColor(pol.party), color: '#fff', fontWeight: 600,
              }}>
                {partyTag(pol.party)}
              </span>
            </div>
          </div>
          <div className="card-status" style={{
            fontSize: '10px',
            color: incumbent ? 'var(--terminal-amber)' : 'var(--terminal-green)',
            background: incumbent ? 'rgba(255,182,39,0.1)' : 'rgba(0,255,65,0.1)',
            border: incumbent ? '1px solid rgba(255,182,39,0.3)' : '1px solid var(--terminal-green)',
          }}>
            {incumbent ? 'INCUMBENT' : 'CHALLENGER'}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.75rem' }}>
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
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '10px', color: 'var(--terminal-text-dim)' }}>FUNDS RAISED</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--terminal-blue)', fontFamily: 'Bebas Neue, sans-serif' }}>
              {fmtMoney(pol.totalFundsRaised || 0)}
            </div>
          </div>
        </div>

        {(pol.israelLobbyTotal || pol.aipacFunding || 0) > 0 && (
          <div style={{
            marginTop: '0.5rem', padding: '0.4rem 0.5rem',
            background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)',
            fontSize: '0.75rem', color: 'var(--terminal-red)', fontWeight: 700,
          }}>
            {fmtMoney(pol.israelLobbyTotal || pol.aipacFunding || 0)} ISRAEL LOBBY
          </div>
        )}
      </div>
    </Link>
  );
}

function RaceBlock({ seat, candidates }: { seat: string; candidates: Politician[] }) {
  const incumbents = candidates.filter(c => isIncumbentForSeat(c));
  const challengers = candidates.filter(c => !isIncumbentForSeat(c));

  return (
    <div style={{
      marginBottom: '1.5rem', padding: '1.25rem',
      background: 'var(--terminal-card)', border: '1px solid var(--terminal-border)',
    }}>
      {/* Seat header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '1rem', paddingBottom: '0.75rem',
        borderBottom: '1px solid var(--terminal-border)',
      }}>
        <div>
          <div style={{ fontSize: '0.6rem', color: 'var(--terminal-text-dim)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
            RACE
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--terminal-blue)' }}>
            {seat}
          </div>
        </div>
        <div style={{
          fontSize: '0.7rem', padding: '0.3rem 0.75rem',
          background: 'rgba(0, 191, 255, 0.08)', border: '1px solid rgba(0, 191, 255, 0.2)',
          color: 'var(--terminal-blue)', fontWeight: 600,
        }}>
          {candidates.length} CANDIDATE{candidates.length !== 1 ? 'S' : ''}
        </div>
      </div>

      {/* Incumbent sub-section */}
      {incumbents.length > 0 && (
        <div style={{ marginBottom: challengers.length > 0 ? '1rem' : 0 }}>
          <div style={{
            fontSize: '0.6rem', color: 'var(--terminal-amber)', letterSpacing: '0.15em',
            textTransform: 'uppercase', marginBottom: '0.5rem', fontWeight: 700,
          }}>
            CURRENT SEAT HOLDER
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            {incumbents.map(c => <CandidateCard key={c.id} pol={c} incumbent={true} />)}
          </div>
        </div>
      )}

      {/* Challengers sub-section */}
      {challengers.length > 0 && (
        <div>
          <div style={{
            fontSize: '0.6rem', color: 'var(--terminal-green)', letterSpacing: '0.15em',
            textTransform: 'uppercase', marginBottom: '0.5rem', fontWeight: 700,
          }}>
            {incumbents.length > 0 ? 'CHALLENGERS' : 'CANDIDATES'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            {challengers.map(c => <CandidateCard key={c.id} pol={c} incumbent={false} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function RaceSection({ title, icon, races }: { title: string; icon: string; races: { seat: string; candidates: Politician[] }[] }) {
  if (races.length === 0) return null;
  const totalCandidates = races.reduce((s, r) => s + r.candidates.length, 0);
  return (
    <>
      <div style={{ padding: '2rem 2rem 1rem', borderTop: '1px solid var(--terminal-border)' }}>
        <h2 style={{
          fontSize: '1.25rem', fontWeight: 600, color: 'var(--terminal-green)',
          textTransform: 'uppercase', letterSpacing: '0.1em',
          display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}>
          <span>{icon}</span> {title} ({totalCandidates})
        </h2>
        <div style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dim)', marginTop: '0.25rem' }}>
          {races.length} race{races.length !== 1 ? 's' : ''}
        </div>
      </div>
      <div style={{ padding: '0 2rem 1rem' }}>
        {races.map(r => <RaceBlock key={r.seat} seat={r.seat} candidates={r.candidates} />)}
      </div>
    </>
  );
}

// ── Page ──

export default async function CandidatesPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state: stateParam } = await searchParams;
  if (!isStateLive(stateParam)) return <ComingSoon stateCode={stateParam!} />;
  const allCandidates = await getCandidates();
  const candidates = filterByState(allCandidates, stateParam);
  const stateName = getStateName(stateParam);

  const races = groupByRace(candidates);
  const { governor, senate, house, stateLevel, local } = categoriseRaces(races);

  const totalFunds = candidates.reduce((s, p) => s + (p.totalFundsRaised || 0), 0);
  const totalIsrael = candidates.reduce((s, p) => s + (p.israelLobbyTotal || p.aipacFunding || 0), 0);

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
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '1rem', padding: '1rem 2rem', borderBottom: '1px solid var(--terminal-border)',
      }}>
        <div className="terminal-card" style={{ padding: '1rem' }}>
          <div className="stat-value">{candidates.length}</div>
          <div className="stat-label">TOTAL CANDIDATES</div>
        </div>
        <div className="terminal-card" style={{ padding: '1rem' }}>
          <div className="stat-value" style={{ color: 'var(--terminal-red)' }}>{governor.reduce((s, r) => s + r.candidates.length, 0)}</div>
          <div className="stat-label">GOVERNOR</div>
        </div>
        <div className="terminal-card" style={{ padding: '1rem' }}>
          <div className="stat-value" style={{ color: 'var(--terminal-green)' }}>{senate.reduce((s, r) => s + r.candidates.length, 0)}</div>
          <div className="stat-label">SENATE</div>
        </div>
        <div className="terminal-card" style={{ padding: '1rem' }}>
          <div className="stat-value" style={{ color: 'var(--terminal-blue)' }}>{house.reduce((s, r) => s + r.candidates.length, 0)}</div>
          <div className="stat-label">HOUSE</div>
        </div>
        <div className="terminal-card" style={{ padding: '1rem' }}>
          <div className="stat-value" style={{ color: 'var(--terminal-amber)' }}>{stateLevel.reduce((s, r) => s + r.candidates.length, 0) + local.reduce((s, r) => s + r.candidates.length, 0)}</div>
          <div className="stat-label">STATE/LOCAL</div>
        </div>
        <div className="terminal-card" style={{ padding: '1rem' }}>
          <div className="stat-value" style={{ color: 'var(--terminal-green)' }}>{fmtMoney(totalFunds)}</div>
          <div className="stat-label">TOTAL RAISED</div>
        </div>
        {totalIsrael > 0 && (
          <div className="terminal-card" style={{ padding: '1rem' }}>
            <div className="stat-value danger">{fmtMoney(totalIsrael)}</div>
            <div className="stat-label">ISRAEL LOBBY</div>
          </div>
        )}
      </div>

      {candidates.length > 0 ? (
        <>
          {/* Governor Races */}
          <RaceSection title="GOVERNOR RACE" icon="&#127963;" races={governor} />

          {/* Senate Races */}
          <RaceSection title="U.S. SENATE" icon="&#127963;" races={senate} />

          {/* House Races */}
          <RaceSection title="U.S. HOUSE" icon="&#127970;" races={house} />

          {/* State-level Races */}
          <RaceSection title="STATE OFFICES" icon="&#9878;&#65039;" races={stateLevel} />

          {/* Local Races */}
          <RaceSection title="LOCAL RACES" icon="&#128203;" races={local} />

          {/* ── Compare Section ── */}
          <div style={{ padding: '2rem', borderTop: '1px solid var(--terminal-border)', background: 'var(--terminal-surface)' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
              <h2 style={{
                fontSize: '1.25rem', fontWeight: 600, color: 'var(--terminal-blue)',
                textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem',
              }}>
                &#9878; COMPARE CANDIDATES
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--terminal-text-dim)', marginBottom: '1.5rem' }}>
                Select a race to compare candidates side-by-side — corruption scores, funding, Israel lobby money, and more.
              </p>
              <CandidateCompare races={races} />
            </div>
          </div>
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

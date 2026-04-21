import type { Metadata } from 'next';
import Link from 'next/link';
import { getServiceRoleSupabase, getServerSupabase } from '@/lib/supabase-server';
import { filterByState, getStateName } from '@/lib/state-utils';
import ComingSoon, { isStateLive } from '@/components/ComingSoon';

export const metadata: Metadata = {
  title: 'Tools | Snitched.ai',
  description: 'Legally exposed races, candidate comparisons, and corruption analysis tools.',
};

export const dynamic = 'force-dynamic';

// ── Types ──

interface Candidate {
  bioguide_id: string;
  name: string;
  office: string;
  office_level: string;
  party: string;
  running_for: string | null;
  total_funds: number;
  corruption_score: number;
  aipac_funding: number;
  israel_lobby_total: number;
  court_records: Array<{
    id: string;
    url: string;
    court: string;
    source: string;
    case_name: string;
    date_filed: string;
    docket_number: string;
  }> | null;
  is_candidate: boolean;
  bio: string | null;
}

// ── Data Fetching ──

async function getCandidatesWithRecords(statePrefix: string): Promise<Candidate[]> {
  const client = getServiceRoleSupabase() || getServerSupabase();
  if (!client) return [];

  const allCandidates: Candidate[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await client
      .from('politicians')
      .select('bioguide_id, name, office, office_level, party, running_for, total_funds, corruption_score, aipac_funding, israel_lobby_total, court_records, is_candidate, bio')
      .ilike('bioguide_id', `${statePrefix}-%`)
      .eq('is_candidate', true)
      .order('total_funds', { ascending: false })
      .range(from, from + 999);

    if (error || !data?.length) break;
    allCandidates.push(...(data as Candidate[]));
    if (data.length < 1000) break;
    from += 1000;
  }

  return allCandidates;
}

// ── Helpers ──

function fmtMoney(n: number): string {
  // Raw dollars — no K/M rounding.
  if (!Number.isFinite(n) || n <= 0) return '$0';
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function partyColor(party: string): string {
  if (party === 'Republican') return '#dc2626';
  if (party === 'Democrat') return '#2563eb';
  return '#6b7280';
}

function partyTag(party: string): string {
  if (party === 'Republican') return 'R';
  if (party === 'Democrat') return 'D';
  if (party === 'Libertarian') return 'L';
  if (party === 'Independent') return 'I';
  return party?.charAt(0) || '?';
}

function getLegalIssues(c: Candidate): Array<{ source: string; case_name: string; url: string; date_filed: string; court?: string }> {
  if (!c.court_records || !Array.isArray(c.court_records)) return [];
  return c.court_records.filter(r => r.source === 'web_research');
}

function getTotalCases(c: Candidate): number {
  if (!c.court_records || !Array.isArray(c.court_records)) return 0;
  return c.court_records.length;
}

function getRiskLevel(legalCount: number): { label: string; color: string; bg: string } {
  if (legalCount >= 5) return { label: 'CRITICAL', color: '#FF0844', bg: 'rgba(255,8,68,0.15)' };
  if (legalCount >= 3) return { label: 'HIGH', color: '#FF6B35', bg: 'rgba(255,107,53,0.12)' };
  if (legalCount >= 1) return { label: 'ELEVATED', color: '#FFB627', bg: 'rgba(255,182,39,0.12)' };
  return { label: 'CLEAN', color: '#00FF41', bg: 'rgba(0,255,65,0.08)' };
}

function groupByRace(candidates: Candidate[]): Map<string, Candidate[]> {
  const map = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const race = c.running_for || 'Unknown';
    if (!map.has(race)) map.set(race, []);
    map.get(race)!.push(c);
  }
  return map;
}

// Major race ordering
function raceWeight(race: string): number {
  const r = race.toLowerCase();
  if (r.includes('governor')) return 0;
  if (r.includes('senate')) return 1;
  if (r.includes('attorney general')) return 2;
  if (r.includes('secretary of state')) return 3;
  if (r.includes('treasurer')) return 4;
  if (r.includes('auditor')) return 5;
  if (r.includes('us house') || r.includes('oh-')) return 6;
  if (r.includes('supreme court')) return 7;
  if (r.includes('state senate')) return 8;
  if (r.includes('state house')) return 9;
  return 10;
}

// ── Components ──

function RiskBadge({ legalCount }: { legalCount: number }) {
  const { label, color, bg } = getRiskLevel(legalCount);
  return (
    <span style={{
      fontSize: '9px', padding: '2px 6px', fontWeight: 700,
      color, background: bg, border: `1px solid ${color}30`,
      letterSpacing: '0.1em',
    }}>
      {label}
    </span>
  );
}

function CandidateRow({ c, showRace }: { c: Candidate; showRace?: boolean }) {
  const legal = getLegalIssues(c);
  const totalCases = getTotalCases(c);
  const { color: riskColor } = getRiskLevel(legal.length);

  return (
    <Link href={`/politician/${c.bioguide_id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 80px 100px 80px 90px 90px',
        gap: '0.5rem',
        padding: '0.6rem 0.75rem',
        borderBottom: '1px solid var(--terminal-border)',
        alignItems: 'center',
        cursor: 'pointer',
      }}
      >
        {/* Name + Party */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontWeight: 600, fontSize: '12px' }}>{c.name}</span>
            <span style={{
              fontSize: '9px', padding: '1px 5px', fontWeight: 700,
              background: partyColor(c.party), color: '#fff',
            }}>
              {partyTag(c.party)}
            </span>
          </div>
          {showRace && (
            <div style={{ fontSize: '10px', color: 'var(--terminal-text-dim)', marginTop: '2px' }}>
              {c.running_for}
            </div>
          )}
        </div>

        {/* Legal Issues */}
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: '14px', color: legal.length > 0 ? riskColor : 'var(--terminal-text-dim)' }}>
            {legal.length}
          </span>
        </div>

        {/* Risk Level */}
        <div style={{ textAlign: 'center' }}>
          <RiskBadge legalCount={legal.length} />
        </div>

        {/* Federal Cases */}
        <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--terminal-text-dim)' }}>
          {totalCases - legal.length}
        </div>

        {/* Funds */}
        <div style={{ textAlign: 'right', fontSize: '12px', fontWeight: 600, color: 'var(--terminal-blue)' }}>
          {fmtMoney(c.total_funds || 0)}
        </div>

        {/* Israel Lobby */}
        <div style={{ textAlign: 'right', fontSize: '12px', color: c.israel_lobby_total > 0 ? 'var(--terminal-red)' : 'var(--terminal-text-dimmer)' }}>
          {c.israel_lobby_total > 0 ? fmtMoney(c.israel_lobby_total) : '-'}
        </div>
      </div>
    </Link>
  );
}

function TableHeader() {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '2fr 80px 100px 80px 90px 90px',
      gap: '0.5rem',
      padding: '0.5rem 0.75rem',
      borderBottom: '2px solid var(--terminal-border)',
      fontSize: '9px',
      color: 'var(--terminal-text-dim)',
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      fontWeight: 700,
    }}>
      <div>CANDIDATE</div>
      <div style={{ textAlign: 'center' }}>LEGAL</div>
      <div style={{ textAlign: 'center' }}>RISK</div>
      <div style={{ textAlign: 'center' }}>FED CASES</div>
      <div style={{ textAlign: 'right' }}>FUNDS</div>
      <div style={{ textAlign: 'right' }}>ISRAEL $</div>
    </div>
  );
}

function RaceComparison({ race, candidates }: { race: string; candidates: Candidate[] }) {
  const sorted = [...candidates].sort((a, b) => {
    const aLegal = getLegalIssues(a).length;
    const bLegal = getLegalIssues(b).length;
    if (bLegal !== aLegal) return bLegal - aLegal;
    return (b.total_funds || 0) - (a.total_funds || 0);
  });

  const totalLegal = sorted.reduce((s, c) => s + getLegalIssues(c).length, 0);
  const maxLegal = Math.max(...sorted.map(c => getLegalIssues(c).length));

  return (
    <div style={{
      marginBottom: '1.5rem',
      background: 'var(--terminal-card)',
      border: `1px solid ${maxLegal >= 3 ? 'rgba(255,8,68,0.25)' : 'var(--terminal-border)'}`,
    }}>
      {/* Race Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0.75rem 1rem',
        borderBottom: '1px solid var(--terminal-border)',
        background: maxLegal >= 5 ? 'rgba(255,8,68,0.05)' : maxLegal >= 3 ? 'rgba(255,107,53,0.03)' : 'transparent',
      }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--terminal-blue)' }}>
            {race}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--terminal-text-dim)', marginTop: '2px' }}>
            {candidates.length} candidate{candidates.length !== 1 ? 's' : ''} | {totalLegal} legal issue{totalLegal !== 1 ? 's' : ''} found
          </div>
        </div>
        {maxLegal >= 3 && (
          <div style={{
            fontSize: '9px', padding: '3px 8px', fontWeight: 700,
            color: '#FF0844', background: 'rgba(255,8,68,0.12)',
            border: '1px solid rgba(255,8,68,0.3)',
            letterSpacing: '0.1em',
          }}>
            LEGALLY EXPOSED RACE
          </div>
        )}
      </div>

      {/* Table */}
      <TableHeader />
      {sorted.map(c => <CandidateRow key={c.bioguide_id} c={c} />)}
    </div>
  );
}

function LegalIssueCard({ c }: { c: Candidate }) {
  const legal = getLegalIssues(c);
  if (legal.length === 0) return null;

  return (
    <div style={{
      padding: '1rem',
      background: 'var(--terminal-card)',
      border: '1px solid var(--terminal-border)',
      marginBottom: '0.75rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Link href={`/politician/${c.bioguide_id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <span style={{ fontWeight: 700, fontSize: '13px' }}>{c.name}</span>
          </Link>
          <span style={{
            fontSize: '9px', padding: '1px 5px', fontWeight: 700,
            background: partyColor(c.party), color: '#fff',
          }}>
            {partyTag(c.party)}
          </span>
          <RiskBadge legalCount={legal.length} />
        </div>
        <div style={{ fontSize: '10px', color: 'var(--terminal-text-dim)' }}>
          {c.running_for}
        </div>
      </div>
      {legal.map((r, i) => (
        <div key={i} style={{
          padding: '0.4rem 0.6rem', marginBottom: '0.3rem',
          background: 'rgba(255,8,68,0.04)', borderLeft: '2px solid var(--terminal-red)',
          fontSize: '11px',
        }}>
          <div style={{ color: 'var(--terminal-text)', fontWeight: 500 }}>
            {r.case_name}
          </div>
          {r.date_filed && (
            <span style={{ fontSize: '10px', color: 'var(--terminal-text-dim)', marginRight: '0.5rem' }}>
              {r.date_filed}
            </span>
          )}
          {r.court && (
            <span style={{ fontSize: '10px', color: 'var(--terminal-text-dim)' }}>
              {r.court}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Page ──

export default async function ToolsPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state: stateParam } = await searchParams;
  if (!isStateLive(stateParam)) return <ComingSoon stateCode={stateParam!} />;

  const statePrefix = (stateParam || 'FL').toLowerCase();
  const stateName = getStateName(stateParam);
  const candidates = await getCandidatesWithRecords(statePrefix);

  // Build race groups
  const raceMap = groupByRace(candidates);
  const races = Array.from(raceMap.entries())
    .sort((a, b) => raceWeight(a[0]) - raceWeight(b[0]))
    .filter(([, cands]) => cands.length >= 2); // Only races with 2+ candidates for comparison

  // Legally exposed candidates (sorted by legal issue count)
  const legallyExposed = candidates
    .filter(c => getLegalIssues(c).length > 0)
    .sort((a, b) => getLegalIssues(b).length - getLegalIssues(a).length);

  // Stats
  const totalLegal = legallyExposed.reduce((s, c) => s + getLegalIssues(c).length, 0);
  const criticalCount = legallyExposed.filter(c => getLegalIssues(c).length >= 5).length;
  const highCount = legallyExposed.filter(c => getLegalIssues(c).length >= 3 && getLegalIssues(c).length < 5).length;
  const exposedRaces = races.filter(([, cands]) => cands.some(c => getLegalIssues(c).length >= 3));

  return (
    <div style={{ minHeight: '100vh', paddingBottom: '4rem' }}>
      {/* Title */}
      <div style={{ padding: '2rem', borderBottom: '1px solid var(--terminal-border)' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 400, letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
          TOOLS
        </h1>
        <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {stateName} | Legal Exposure Analysis | Race-by-Race Candidate Comparison
        </div>
      </div>

      {/* Stats Bar */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '1rem', padding: '1rem 2rem', borderBottom: '1px solid var(--terminal-border)',
      }}>
        <div className="terminal-card" style={{ padding: '1rem' }}>
          <div className="stat-value" style={{ color: 'var(--terminal-red)' }}>{legallyExposed.length}</div>
          <div className="stat-label">LEGALLY EXPOSED</div>
        </div>
        <div className="terminal-card" style={{ padding: '1rem' }}>
          <div className="stat-value" style={{ color: '#FF0844' }}>{totalLegal}</div>
          <div className="stat-label">TOTAL LEGAL ISSUES</div>
        </div>
        <div className="terminal-card" style={{ padding: '1rem' }}>
          <div className="stat-value" style={{ color: '#FF0844' }}>{criticalCount}</div>
          <div className="stat-label">CRITICAL RISK</div>
        </div>
        <div className="terminal-card" style={{ padding: '1rem' }}>
          <div className="stat-value" style={{ color: '#FF6B35' }}>{highCount}</div>
          <div className="stat-label">HIGH RISK</div>
        </div>
        <div className="terminal-card" style={{ padding: '1rem' }}>
          <div className="stat-value" style={{ color: 'var(--terminal-amber)' }}>{exposedRaces.length}</div>
          <div className="stat-label">EXPOSED RACES</div>
        </div>
        <div className="terminal-card" style={{ padding: '1rem' }}>
          <div className="stat-value">{candidates.length}</div>
          <div className="stat-label">TOTAL CANDIDATES</div>
        </div>
      </div>

      {/* ── Section 1: Legally Exposed Races ── */}
      <div style={{ padding: '2rem', borderBottom: '1px solid var(--terminal-border)' }}>
        <h2 style={{
          fontSize: '1.25rem', fontWeight: 600, color: 'var(--terminal-red)',
          textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.25rem',
        }}>
          LEGALLY EXPOSED RACES
        </h2>
        <p style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dim)', marginBottom: '1.5rem' }}>
          Races where at least one candidate has 3+ verified legal issues — lawsuits, ethics violations, arrests, or scandals.
        </p>

        {exposedRaces.length > 0 ? (
          exposedRaces.map(([race, cands]) => (
            <RaceComparison key={race} race={race} candidates={cands} />
          ))
        ) : (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--terminal-text-dim)', fontSize: '12px' }}>
            No legally exposed races detected for this state.
          </div>
        )}
      </div>

      {/* ── Section 2: All Major Race Comparisons ── */}
      <div style={{ padding: '2rem', borderBottom: '1px solid var(--terminal-border)' }}>
        <h2 style={{
          fontSize: '1.25rem', fontWeight: 600, color: 'var(--terminal-blue)',
          textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.25rem',
        }}>
          ALL RACE COMPARISONS
        </h2>
        <p style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dim)', marginBottom: '1.5rem' }}>
          Side-by-side comparison of every candidate in each race — legal exposure, funding, and lobby connections.
        </p>

        {races.map(([race, cands]) => (
          <RaceComparison key={race} race={race} candidates={cands} />
        ))}
      </div>

      {/* ── Section 3: Legal Issue Details ── */}
      <div style={{ padding: '2rem' }}>
        <h2 style={{
          fontSize: '1.25rem', fontWeight: 600, color: 'var(--terminal-amber)',
          textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.25rem',
        }}>
          LEGAL ISSUE DETAILS
        </h2>
        <p style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dim)', marginBottom: '1.5rem' }}>
          Full breakdown of verified legal issues for every flagged candidate — sourced from court records, news investigations, and ethics filings.
        </p>

        {legallyExposed.map(c => (
          <LegalIssueCard key={c.bioguide_id} c={c} />
        ))}
      </div>

      <div className="classified-footer">
        ALL DATA ACQUIRED VIA OSINT // COURTLISTENER, NEWS INVESTIGATIONS, ETHICS FILINGS // LEGAL ANALYSIS DIVISION
      </div>
    </div>
  );
}

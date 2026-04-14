import { getServerSupabase } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

function fmtMoney(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return n > 0 ? `$${n}` : '$0';
}

function getGrade(score: number): string {
  if (score <= 20) return 'A';
  if (score <= 40) return 'B';
  if (score <= 60) return 'C';
  if (score <= 80) return 'D';
  return 'F';
}

function gradeColor(grade: string): string {
  switch (grade) {
    case 'A': return '#00FF41';
    case 'B': return '#00cc33';
    case 'C': return '#FFB627';
    case 'D': return '#FF6B35';
    case 'F': return '#FF0844';
    default: return '#6b8a6b';
  }
}

function scoreBarColor(score: number): string {
  if (score <= 20) return '#00FF41';
  if (score <= 40) return '#00cc33';
  if (score <= 60) return '#FFB627';
  if (score <= 80) return '#FF6B35';
  return '#FF0844';
}

export default async function EmbedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const client = getServerSupabase();
  if (!client) return notFound();

  const { data: row } = await client
    .from('politicians')
    .select('bioguide_id, name, office, office_level, party, district, jurisdiction, corruption_score, aipac_funding, total_funds, israel_lobby_total, is_active, is_candidate, running_for, years_in_office, top5_donors')
    .eq('bioguide_id', id)
    .single();

  if (!row) return notFound();

  const score = Number(row.corruption_score) || 0;
  const grade = getGrade(score);
  const gc = gradeColor(grade);
  const sbc = scoreBarColor(score);
  const lobby = Number(row.israel_lobby_total) || Number(row.aipac_funding) || 0;
  const funds = Number(row.total_funds) || 0;
  const partyBg = row.party === 'Republican' ? '#dc2626' : row.party === 'Democrat' ? '#2563eb' : '#6b7280';
  const partyTag = row.party === 'Republican' ? 'R' : row.party === 'Democrat' ? 'D' : 'I';
  const url = `https://snitched.ai/politician/${row.bioguide_id}`;

  const isCandidate = row.is_candidate || row.office === 'Candidate' || (row.office || '').includes('(Candidate)');
  const status = isCandidate ? 'CANDIDATE' : row.is_active ? 'IN OFFICE' : 'FORMER';
  const statusColor = isCandidate ? '#FFB627' : row.is_active ? '#00FF41' : '#FF6B35';
  const displayOffice = (row.running_for && isCandidate) ? `Running for: ${row.running_for}` : row.office === 'Candidate' ? (row.running_for || row.office) : row.office;
  const years = row.years_in_office ? `${row.years_in_office} yrs` : '';

  const topDonors = ((row.top5_donors || []) as Array<{ name: string; amount: number; type: string }>).slice(0, 3);

  const lobbyColor = lobby > 0 ? '#FF0844' : '#00FF41';
  const lobbyBg = lobby > 0 ? 'rgba(255,8,68,0.06)' : 'rgba(0,255,65,0.03)';
  const lobbyBorder = lobby > 0 ? 'rgba(255,8,68,0.25)' : 'rgba(0,255,65,0.12)';
  const lobbyIcon = lobby > 0 ? '\u26A0' : '\u2713';
  const lobbyLabel = lobby > 0 ? 'FOREIGN INFLUENCE DETECTED' : 'NO FOREIGN INFLUENCE';

  return (
    <>
        <div style={{
          background: '#000', color: '#c8d6c8', width: '100%', maxWidth: '600px',
          border: '1px solid rgba(0,255,65,0.15)', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            background: 'linear-gradient(90deg,rgba(0,255,65,0.08),rgba(0,255,65,0.02))',
            padding: '8px 16px', borderBottom: '2px solid rgba(0,255,65,0.12)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ fontSize: '11px', color: '#00FF41', letterSpacing: '3px', fontWeight: 700 }}>
              SNITCHED<span style={{ color: '#3d5a3d' }}>.AI</span>
            </div>
            <span style={{
              fontSize: '8px', padding: '2px 8px', border: `1px solid ${statusColor}`,
              color: statusColor, fontWeight: 700, letterSpacing: '1px',
            }}>{status}</span>
          </div>

          {/* Main */}
          <div style={{ padding: '20px' }}>
            {/* Name + Score */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
              <div style={{ flex: 1, paddingRight: '16px' }}>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#fff', marginBottom: '4px', letterSpacing: '0.5px' }}>{row.name}</div>
                <div style={{ fontSize: '12px', color: '#6b8a6b', marginBottom: '6px' }}>{displayOffice}</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '10px', padding: '3px 10px', background: partyBg, color: '#fff', fontWeight: 700 }}>{partyTag} — {row.party}</span>
                  {years && <span style={{ fontSize: '10px', color: '#3d5a3d', border: '1px solid rgba(0,255,65,0.08)', padding: '2px 8px' }}>{years}</span>}
                  <span style={{ fontSize: '10px', color: '#3d5a3d', border: '1px solid rgba(0,255,65,0.08)', padding: '2px 8px' }}>{row.jurisdiction || row.district || '—'}</span>
                </div>
              </div>
              <div style={{
                textAlign: 'center', minWidth: '90px', padding: '8px 12px',
                border: `1px solid ${gc}30`, background: `${gc}08`,
              }}>
                <div style={{ fontSize: '42px', fontWeight: 700, color: gc, lineHeight: 1, textShadow: `0 0 20px ${gc}40` }}>{score}</div>
                <div style={{ fontSize: '9px', color: '#3d5a3d', letterSpacing: '2px', marginTop: '2px' }}>CORRUPTION</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: gc, marginTop: '4px', letterSpacing: '2px' }}>{grade}</div>
              </div>
            </div>

            {/* Score bar */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ height: '4px', background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${score}%`, background: `linear-gradient(90deg,${sbc},${sbc}80)`, boxShadow: `0 0 8px ${sbc}60` }} />
              </div>
            </div>

            {/* Foreign Influence */}
            <div style={{
              padding: '14px 16px', background: lobbyBg, border: `2px solid ${lobbyBorder}`,
              marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: '10px', color: lobbyColor, letterSpacing: '2px', fontWeight: 700 }}>{lobbyIcon} {lobbyLabel}</div>
                <div style={{ fontSize: '9px', color: '#4a5a4a', marginTop: '3px' }}>Israel Lobby / AIPAC / Foreign PACs</div>
              </div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: lobbyColor, textShadow: `0 0 15px ${lobbyColor}40`, letterSpacing: '1px' }}>{fmtMoney(lobby)}</div>
            </div>

            {/* Stats row */}
            <div style={{ display: 'flex', gap: '0', marginBottom: '16px' }}>
              <div style={{ flex: 1, padding: '10px 12px', border: '1px solid rgba(0,255,65,0.08)', borderRight: 'none' }}>
                <div style={{ fontSize: '8px', color: '#3d5a3d', letterSpacing: '2px', marginBottom: '4px' }}>TOTAL RAISED</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#00FF41' }}>{fmtMoney(funds)}</div>
              </div>
              <div style={{ flex: 1, padding: '10px 12px', border: '1px solid rgba(0,255,65,0.08)', borderRight: 'none' }}>
                <div style={{ fontSize: '8px', color: '#3d5a3d', letterSpacing: '2px', marginBottom: '4px' }}>ISRAEL LOBBY</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: lobby > 0 ? '#FF0844' : '#3d5a3d' }}>{fmtMoney(lobby)}</div>
              </div>
              <div style={{ flex: 1, padding: '10px 12px', border: '1px solid rgba(0,255,65,0.08)' }}>
                <div style={{ fontSize: '8px', color: '#3d5a3d', letterSpacing: '2px', marginBottom: '4px' }}>SCORE</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: gc }}>{score}/100</div>
              </div>
            </div>

            {/* Top Donors */}
            <div style={{ marginBottom: '4px' }}>
              <div style={{ fontSize: '9px', color: '#3d5a3d', letterSpacing: '2px', marginBottom: '6px' }}>TOP DONORS</div>
              {topDonors.length > 0 ? topDonors.map((d, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', padding: '3px 0',
                  borderBottom: i < topDonors.length - 1 ? '1px solid rgba(0,255,65,0.06)' : 'none',
                }}>
                  <span style={{ fontSize: '11px', color: '#8a9a8a' }}>{d.name}</span>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: d.type === 'Israel-PAC' ? '#FF0844' : '#00FF41' }}>{fmtMoney(d.amount)}</span>
                </div>
              )) : (
                <div style={{ fontSize: '11px', color: '#3d5a3d' }}>No donor data yet</div>
              )}
            </div>
          </div>

          {/* CTA */}
          <a href={url} target="_blank" rel="noopener" style={{
            display: 'block', padding: '12px 16px',
            background: 'linear-gradient(90deg,rgba(0,255,65,0.08),rgba(0,255,65,0.03))',
            borderTop: '2px solid rgba(0,255,65,0.12)', textAlign: 'center',
          }}>
            <span style={{ fontSize: '11px', color: '#00FF41', letterSpacing: '2px', fontWeight: 700 }}>SEE FULL DOSSIER →</span>
            <span style={{ fontSize: '9px', color: '#3d5a3d', display: 'block', marginTop: '2px' }}>snitched.ai — America First Public Intelligence</span>
          </a>
        </div>
    </>
  );
}

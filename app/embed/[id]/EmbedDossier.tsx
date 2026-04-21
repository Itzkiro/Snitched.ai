'use client';

import { useState } from 'react';

interface Donor { name: string; amount: number; type: string }
interface RedFlag { label: string; severity: 'high' | 'med' }

export interface EmbedDossierProps {
  bioguideId: string;
  name: string;
  party: string | null;
  jurisdiction: string | null;
  district: string | null;
  displayOffice: string | null;
  status: string;
  statusColor: string;
  yearsLabel: string;
  score: number;
  grade: string;
  baselineGradeColor: string;
  baselineScoreBarColor: string;
  funds: number;
  lobby: number;
  topDonors: Donor[];
  redFlags: RedFlag[];
  donationStatus: { label: string; color: string; icon?: string; amount?: number; subtext?: string } | null;
}

function fmtMoney(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '$0';
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export default function EmbedDossier(props: EmbedDossierProps) {
  const {
    bioguideId, name, party, jurisdiction, district, displayOffice,
    status, statusColor, yearsLabel, score, grade,
    baselineGradeColor, baselineScoreBarColor,
    funds, lobby, topDonors, redFlags, donationStatus,
  } = props;

  const hasRedFlags = redFlags.length > 0;
  const [view, setView] = useState<'score' | 'flags'>('score');

  // Force red on score / grade / score-bar when red_flags present.
  const gc = hasRedFlags ? '#FF0844' : baselineGradeColor;
  const sbc = hasRedFlags ? '#FF0844' : baselineScoreBarColor;

  const partyBg = party === 'Republican' ? '#dc2626' : party === 'Democrat' ? '#2563eb' : '#6b7280';
  const partyTag = party === 'Republican' ? 'R' : party === 'Democrat' ? 'D' : 'I';
  const url = `https://snitched.ai/politician/${bioguideId}`;

  // Foreign-influence box: per-candidate donation_status override wins,
  // else derive from israel_lobby_total (red if > 0, green if 0).
  const lobbyColor = donationStatus?.color ?? (lobby > 0 ? '#FF0844' : '#00FF41');
  const hexAlpha = (hex: string, alphaPct: number) => `${hex}${Math.round(alphaPct * 255).toString(16).padStart(2, '0')}`;
  const lobbyBg = donationStatus
    ? hexAlpha(donationStatus.color, 0.08)
    : (lobby > 0 ? 'rgba(255,8,68,0.06)' : 'rgba(0,255,65,0.03)');
  const lobbyBorder = donationStatus
    ? hexAlpha(donationStatus.color, 0.4)
    : (lobby > 0 ? 'rgba(255,8,68,0.25)' : 'rgba(0,255,65,0.12)');
  const lobbyIcon = donationStatus?.icon ?? (lobby > 0 ? '\u26A0' : '\u2713');
  const lobbyLabel = donationStatus?.label ?? (lobby > 0 ? 'FOREIGN INFLUENCE DETECTED' : 'NO FOREIGN INFLUENCE');

  return (
    <div style={{
      background: '#000', color: '#c8d6c8', width: '100%', maxWidth: '600px',
      border: '1px solid rgba(0,255,65,0.15)', overflow: 'hidden',
      fontFamily: "'Courier New','Lucida Console',monospace",
    }}>
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

      <div style={{ padding: '20px' }}>
        {/* Name row — when red_flags are present, the score moves into a
            prominent full-width card below; otherwise it stays in the corner. */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
          <div style={{ flex: 1, paddingRight: '16px' }}>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#fff', marginBottom: '4px', letterSpacing: '0.5px' }}>{name}</div>
            <div style={{ fontSize: '12px', color: '#6b8a6b', marginBottom: '6px' }}>{displayOffice}</div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '10px', padding: '3px 10px', background: partyBg, color: '#fff', fontWeight: 700 }}>{partyTag} — {party}</span>
              {yearsLabel && <span style={{ fontSize: '10px', color: '#3d5a3d', border: '1px solid rgba(0,255,65,0.08)', padding: '2px 8px' }}>{yearsLabel}</span>}
              <span style={{ fontSize: '10px', color: '#3d5a3d', border: '1px solid rgba(0,255,65,0.08)', padding: '2px 8px' }}>{jurisdiction || district || '—'}</span>
            </div>
          </div>
          {!hasRedFlags && (
            <div style={{
              minWidth: '90px', textAlign: 'center', padding: '8px 12px',
              border: `1px solid ${gc}30`, background: `${gc}08`,
            }}>
              <div style={{ fontSize: '42px', fontWeight: 700, color: gc, lineHeight: 1, textShadow: `0 0 20px ${gc}40` }}>{score}</div>
              <div style={{ fontSize: '9px', color: '#3d5a3d', letterSpacing: '2px', marginTop: '2px' }}>CORRUPTION</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: gc, marginTop: '4px', letterSpacing: '2px' }}>{grade}</div>
            </div>
          )}
        </div>

        {/* Prominent score / flags card (matches politician-page style) */}
        {hasRedFlags && (
          <div
            onClick={() => setView(v => v === 'score' ? 'flags' : 'score')}
            style={{
              marginBottom: '16px', padding: '16px',
              border: '1px dashed rgba(255,8,68,0.5)',
              cursor: 'pointer',
            }}
            title="Click to flip between score and red flags"
          >
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              {(['score', 'flags'] as const).map(v => (
                <button
                  key={v}
                  onClick={(e) => { e.stopPropagation(); setView(v); }}
                  style={{
                    fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px',
                    padding: '8px 14px',
                    background: view === v ? '#FF0844' : 'transparent',
                    color: view === v ? '#000' : '#FF0844',
                    border: '1px solid #FF0844',
                    cursor: 'pointer',
                    fontFamily: "'Courier New','Lucida Console',monospace",
                    textTransform: 'uppercase',
                  }}
                >
                  {v === 'score' ? 'SCORE' : `⚠ FLAGS (${redFlags.length})`}
                </button>
              ))}
            </div>
            {view === 'score' && (
              <>
                <div style={{ fontSize: '11px', color: '#6b8a6b', letterSpacing: '2px', marginBottom: '6px', textTransform: 'uppercase' }}>
                  Corruption Score
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                  <span style={{ fontSize: '40px', fontWeight: 700, color: sbc, lineHeight: 1 }}>{score}/100</span>
                  <span style={{ fontSize: '28px', fontWeight: 700, color: sbc, lineHeight: 1 }}>{grade}</span>
                </div>
              </>
            )}
            {view === 'flags' && (
              <>
                <div style={{ fontSize: '11px', color: '#FF0844', letterSpacing: '2px', marginBottom: '10px', fontWeight: 700, textTransform: 'uppercase' }}>
                  ⚠ {redFlags.length} red flag{redFlags.length === 1 ? '' : 's'}
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {redFlags.map((f, i) => (
                    <li key={i} style={{
                      fontSize: '12px', lineHeight: '1.5',
                      padding: '4px 0 4px 10px',
                      borderLeft: `3px solid ${f.severity === 'high' ? '#FF0844' : '#f59e0b'}`,
                      marginBottom: '6px',
                      color: '#c8d6c8',
                    }}>
                      <span style={{
                        fontSize: '9px', fontWeight: 700,
                        color: f.severity === 'high' ? '#FF0844' : '#f59e0b',
                        letterSpacing: '1px', marginRight: '6px',
                      }}>{f.severity === 'high' ? '[HIGH]' : '[MED]'}</span>
                      {f.label}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {/* Score bar */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ height: '4px', background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${score}%`, background: `linear-gradient(90deg,${sbc},${sbc}80)`, boxShadow: `0 0 8px ${sbc}60` }} />
          </div>
        </div>

        {/* Donation status / Foreign Influence */}
        <div style={{
          padding: '14px 16px', background: lobbyBg, border: `2px solid ${lobbyBorder}`,
          marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: '10px', color: lobbyColor, letterSpacing: '2px', fontWeight: 700 }}>{lobbyIcon} {lobbyLabel}</div>
            {(donationStatus?.subtext ?? 'Pro-Israel Lobby / AIPAC / Foreign PACs') && (
              <div style={{ fontSize: '9px', color: '#4a5a4a', marginTop: '3px' }}>
                {donationStatus?.subtext ?? 'Pro-Israel Lobby / AIPAC / Foreign PACs'}
              </div>
            )}
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: lobbyColor, textShadow: `0 0 15px ${lobbyColor}40`, letterSpacing: '1px' }}>
            {fmtMoney(donationStatus?.amount ?? lobby)}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: '0', marginBottom: '16px' }}>
          <div style={{ flex: 1, padding: '10px 12px', border: '1px solid rgba(0,255,65,0.08)', borderRight: 'none' }}>
            <div style={{ fontSize: '8px', color: '#3d5a3d', letterSpacing: '2px', marginBottom: '4px' }}>TOTAL RAISED</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#00FF41' }}>{fmtMoney(funds)}</div>
          </div>
          <div style={{ flex: 1, padding: '10px 12px', border: '1px solid rgba(0,255,65,0.08)', borderRight: 'none' }}>
            <div style={{ fontSize: '8px', color: '#3d5a3d', letterSpacing: '2px', marginBottom: '4px' }}>PRO-ISRAEL LOBBY</div>
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

      <a href={url} target="_blank" rel="noopener" style={{
        display: 'block', padding: '12px 16px',
        background: 'linear-gradient(90deg,rgba(0,255,65,0.08),rgba(0,255,65,0.03))',
        borderTop: '2px solid rgba(0,255,65,0.12)', textAlign: 'center',
        textDecoration: 'none',
      }}>
        <span style={{ fontSize: '11px', color: '#00FF41', letterSpacing: '2px', fontWeight: 700 }}>SEE FULL DOSSIER →</span>
        <span style={{ fontSize: '9px', color: '#3d5a3d', display: 'block', marginTop: '2px' }}>snitched.ai — America First Public Intelligence</span>
      </a>
    </div>
  );
}

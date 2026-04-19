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
}

function fmtMoney(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return n > 0 ? `$${n}` : '$0';
}

export default function EmbedDossier(props: EmbedDossierProps) {
  const {
    bioguideId, name, party, jurisdiction, district, displayOffice,
    status, statusColor, yearsLabel, score, grade,
    baselineGradeColor, baselineScoreBarColor,
    funds, lobby, topDonors, redFlags,
  } = props;

  const hasRedFlags = redFlags.length > 0;
  const [view, setView] = useState<'score' | 'flags'>('score');

  // Force red on score / grade / score-bar when red_flags present.
  const gc = hasRedFlags ? '#FF0844' : baselineGradeColor;
  const sbc = hasRedFlags ? '#FF0844' : baselineScoreBarColor;

  const partyBg = party === 'Republican' ? '#dc2626' : party === 'Democrat' ? '#2563eb' : '#6b7280';
  const partyTag = party === 'Republican' ? 'R' : party === 'Democrat' ? 'D' : 'I';
  const url = `https://snitched.ai/politician/${bioguideId}`;

  const lobbyColor = lobby > 0 ? '#FF0844' : '#00FF41';
  const lobbyBg = lobby > 0 ? 'rgba(255,8,68,0.06)' : 'rgba(0,255,65,0.03)';
  const lobbyBorder = lobby > 0 ? 'rgba(255,8,68,0.25)' : 'rgba(0,255,65,0.12)';
  const lobbyIcon = lobby > 0 ? '\u26A0' : '\u2713';
  const lobbyLabel = lobby > 0 ? 'FOREIGN INFLUENCE DETECTED' : 'NO FOREIGN INFLUENCE';

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
        {/* Name + Score (with toggle) */}
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
          <div style={{
            minWidth: '160px', maxWidth: '220px', padding: '8px 10px',
            border: `1px solid ${gc}30`, background: `${gc}08`,
            cursor: hasRedFlags ? 'pointer' : 'default',
          }}
            onClick={() => hasRedFlags && setView(v => v === 'score' ? 'flags' : 'score')}
            title={hasRedFlags ? 'Click to flip between score and red flags' : ''}
          >
            {hasRedFlags && (
              <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', marginBottom: '6px' }}>
                {(['score', 'flags'] as const).map(v => (
                  <button
                    key={v}
                    onClick={(e) => { e.stopPropagation(); setView(v); }}
                    style={{
                      fontSize: '8px', fontWeight: 700, letterSpacing: '1px',
                      padding: '3px 6px',
                      background: view === v ? '#FF0844' : 'transparent',
                      color: view === v ? '#000' : '#FF0844',
                      border: '1px solid #FF0844',
                      cursor: 'pointer',
                    }}
                  >
                    {v === 'score' ? 'SCORE' : `⚠ FLAGS (${redFlags.length})`}
                  </button>
                ))}
              </div>
            )}
            {(!hasRedFlags || view === 'score') && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '42px', fontWeight: 700, color: gc, lineHeight: 1, textShadow: `0 0 20px ${gc}40` }}>{score}</div>
                <div style={{ fontSize: '9px', color: '#3d5a3d', letterSpacing: '2px', marginTop: '2px' }}>CORRUPTION</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: gc, marginTop: '4px', letterSpacing: '2px' }}>{grade}</div>
              </div>
            )}
            {hasRedFlags && view === 'flags' && (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {redFlags.map((f, i) => (
                  <li key={i} style={{
                    fontSize: '10px', lineHeight: '1.4',
                    padding: '3px 0 3px 6px',
                    borderLeft: `2px solid ${f.severity === 'high' ? '#FF0844' : '#f59e0b'}`,
                    marginBottom: '3px',
                    color: '#c8d6c8',
                  }}>
                    <span style={{
                      fontSize: '8px', fontWeight: 700,
                      color: f.severity === 'high' ? '#FF0844' : '#f59e0b',
                      letterSpacing: '1px', marginRight: '4px',
                    }}>{f.severity === 'high' ? '[H]' : '[M]'}</span>
                    {f.label}
                  </li>
                ))}
              </ul>
            )}
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

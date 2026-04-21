'use client';

import { useState, useRef } from 'react';
import type { Politician } from '@/lib/types';

function fmtMoney(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '$0';
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function getGrade(score: number): string {
  if (score <= 20) return 'A';
  if (score <= 40) return 'B';
  if (score <= 60) return 'C';
  if (score <= 80) return 'D';
  return 'F';
}

// Binary dossier color (2026-04-21 product decision):
// score === 0  → green (clean)
// score >= 1   → red   (any non-zero capture signal)
function binaryColor(score: number): string {
  return (Number(score) || 0) === 0 ? '#00FF41' : '#FF0844';
}

function generateEmbedHTML(p: Politician): string {
  const score = p.corruptionScore || 0;
  const grade = getGrade(score);
  const redFlags = p.source_ids?.red_flags ?? [];
  const hasRedFlags = redFlags.length > 0;
  // Red flags always force red; otherwise 0 = green, anything > 0 = red.
  const gc = hasRedFlags ? '#FF0844' : binaryColor(score);
  const sbc = gc;
  const lobby = p.israelLobbyTotal || p.aipacFunding || 0;
  const funds = p.totalFundsRaised || 0;
  const partyBg = p.party === 'Republican' ? '#dc2626' : p.party === 'Democrat' ? '#2563eb' : '#6b7280';
  const partyTag = p.party === 'Republican' ? 'R' : p.party === 'Democrat' ? 'D' : 'I';
  const url = `https://snitched.ai/politician/${p.id}`;
  const isCandidate = p.isCandidate || p.office === 'Candidate' || (p.office || '').includes('(Candidate)');
  const isSeated = p.isActive && !isCandidate;
  const status = isCandidate ? 'CANDIDATE' : p.isActive ? 'IN OFFICE' : 'FORMER';
  const statusColor = isCandidate ? '#FFB627' : p.isActive ? '#00FF41' : '#FF6B35';
  const displayOffice = (p.runningFor && isCandidate) ? `Running for: ${p.runningFor}` : p.office === 'Candidate' ? (p.runningFor || p.office) : p.office;
  const years = p.yearsInOffice ? `${p.yearsInOffice} yrs` : '';
  const topDonors = (p.top5Donors || p.top3Donors || []).slice(0, 3);

  const donorRows = topDonors.length > 0
    ? topDonors.map(d =>
        `<tr><td style="padding:4px 0;font-size:11px;color:#8a9a8a;">${d.name}</td><td style="padding:4px 0;font-size:11px;font-weight:700;color:${d.type === 'Israel-PAC' ? '#FF0844' : '#00FF41'};text-align:right;">${fmtMoney(d.amount)}</td></tr>`
      ).join('')
    : '<tr><td colspan="2" style="padding:4px 0;font-size:11px;color:#3d5a3d;">No donor data yet</td></tr>';

  const lobbyColor = lobby > 0 ? '#FF0844' : '#00FF41';
  const lobbyBg = lobby > 0 ? 'rgba(255,8,68,0.06)' : 'rgba(0,255,65,0.03)';
  const lobbyBorder = lobby > 0 ? 'rgba(255,8,68,0.25)' : 'rgba(0,255,65,0.12)';
  const lobbyIcon = lobby > 0 ? '⚠' : '✓';
  const lobbyLabel = lobby > 0 ? 'FOREIGN INFLUENCE DETECTED' : 'NO FOREIGN INFLUENCE';

  return `<!-- SNITCHED.AI Dossier — Embed anywhere -->
<div style="font-family:'Courier New','Lucida Console',monospace;background:#000;color:#c8d6c8;width:100%;max-width:600px;border:1px solid rgba(0,255,65,0.15);overflow:hidden;">
  <!-- Header bar -->
  <div style="background:linear-gradient(90deg,rgba(0,255,65,0.08),rgba(0,255,65,0.02));padding:8px 16px;border-bottom:2px solid rgba(0,255,65,0.12);display:flex;justify-content:space-between;align-items:center;">
    <div style="font-size:11px;color:#00FF41;letter-spacing:3px;font-weight:700;">SNITCHED<span style="color:#3d5a3d;">.AI</span></div>
    <div style="display:flex;gap:8px;align-items:center;">
      <span style="font-size:8px;padding:2px 8px;border:1px solid ${statusColor};color:${statusColor};font-weight:700;letter-spacing:1px;">${status}</span>
    </div>
  </div>

  <!-- Main content -->
  <div style="padding:20px;">
    <!-- Name + Score row -->
    <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:16px;">
      <div style="flex:1;padding-right:16px;">
        <div style="font-size:20px;font-weight:700;color:#fff;margin-bottom:4px;letter-spacing:0.5px;">${p.name}</div>
        <div style="font-size:12px;color:#6b8a6b;margin-bottom:6px;">${displayOffice}</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <span style="font-size:10px;padding:3px 10px;background:${partyBg};color:#fff;font-weight:700;letter-spacing:0.5px;">${partyTag} — ${p.party}</span>
          ${years ? `<span style="font-size:10px;color:#3d5a3d;border:1px solid rgba(0,255,65,0.08);padding:2px 8px;">${years}</span>` : ''}
          <span style="font-size:10px;color:#3d5a3d;border:1px solid rgba(0,255,65,0.08);padding:2px 8px;">${p.jurisdiction || p.district || '—'}</span>
        </div>
      </div>
      <div style="text-align:center;min-width:90px;padding:8px 12px;border:1px solid ${gc}30;background:${gc}08;">
        <div style="font-size:42px;font-weight:700;color:${gc};line-height:1;text-shadow:0 0 20px ${gc}40;">${score}</div>
        <div style="font-size:9px;color:#3d5a3d;letter-spacing:2px;margin-top:2px;">CORRUPTION</div>
        <div style="font-size:16px;font-weight:700;color:${gc};margin-top:4px;letter-spacing:2px;">${grade}</div>
      </div>
    </div>

    <!-- Score bar -->
    <div style="margin-bottom:16px;">
      <div style="height:4px;background:rgba(255,255,255,0.05);overflow:hidden;">
        <div style="height:100%;width:${score}%;background:linear-gradient(90deg,${sbc},${sbc}80);box-shadow:0 0 8px ${sbc}60;"></div>
      </div>
    </div>

    <!-- Foreign Influence Box -->
    <div style="padding:14px 16px;background:${lobbyBg};border:2px solid ${lobbyBorder};margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:10px;color:${lobbyColor};letter-spacing:2px;font-weight:700;">${lobbyIcon} ${lobbyLabel}</div>
        <div style="font-size:9px;color:#4a5a4a;margin-top:3px;">Pro-Israel Lobby / AIPAC / Foreign PACs</div>
      </div>
      <div style="font-size:28px;font-weight:700;color:${lobbyColor};text-shadow:0 0 15px ${lobbyColor}40;letter-spacing:1px;">${fmtMoney(lobby)}</div>
    </div>
${hasRedFlags ? `
    <!-- Red Flags -->
    <div style="padding:14px 16px;background:rgba(255,8,68,0.06);border:2px solid rgba(255,8,68,0.35);margin-bottom:16px;">
      <div style="font-size:10px;color:#FF0844;letter-spacing:2px;font-weight:700;margin-bottom:8px;">⚠ RED FLAGS — ${redFlags.length} CONCERN${redFlags.length === 1 ? '' : 'S'}</div>
      <ul style="margin:0;padding:0;list-style:none;">
        ${redFlags.map(f => `<li style="font-size:11px;color:#c8d6c8;line-height:1.5;padding:4px 0 4px 10px;border-left:3px solid ${f.severity === 'high' ? '#FF0844' : '#f59e0b'};margin-bottom:4px;"><span style="font-size:8px;font-weight:700;color:${f.severity === 'high' ? '#FF0844' : '#f59e0b'};letter-spacing:1px;margin-right:6px;">[${f.severity === 'high' ? 'HIGH' : 'MED'}]</span>${f.label}</li>`).join('')}
      </ul>
    </div>` : ''}

    <!-- Stats row -->
    <div style="display:flex;gap:0;margin-bottom:16px;">
      <div style="flex:1;padding:10px 12px;border:1px solid rgba(0,255,65,0.08);border-right:none;">
        <div style="font-size:8px;color:#3d5a3d;letter-spacing:2px;margin-bottom:4px;">TOTAL RAISED</div>
        <div style="font-size:18px;font-weight:700;color:#00FF41;">${fmtMoney(funds)}</div>
      </div>
      <div style="flex:1;padding:10px 12px;border:1px solid rgba(0,255,65,0.08);border-right:none;">
        <div style="font-size:8px;color:#3d5a3d;letter-spacing:2px;margin-bottom:4px;">PRO-ISRAEL LOBBY</div>
        <div style="font-size:18px;font-weight:700;color:${lobby > 0 ? '#FF0844' : '#3d5a3d'};">${fmtMoney(lobby)}</div>
      </div>
      <div style="flex:1;padding:10px 12px;border:1px solid rgba(0,255,65,0.08);">
        <div style="font-size:8px;color:#3d5a3d;letter-spacing:2px;margin-bottom:4px;">SCORE</div>
        <div style="font-size:18px;font-weight:700;color:${gc};">${score}/100</div>
      </div>
    </div>

    <!-- Top Donors -->
    <div style="margin-bottom:4px;">
      <div style="font-size:9px;color:#3d5a3d;letter-spacing:2px;margin-bottom:6px;">TOP DONORS</div>
      <table style="width:100%;border-collapse:collapse;">${donorRows}</table>
    </div>
  </div>

  <!-- CTA Footer -->
  <a href="${url}" target="_blank" rel="noopener" style="display:block;padding:12px 16px;background:linear-gradient(90deg,rgba(0,255,65,0.08),rgba(0,255,65,0.03));border-top:2px solid rgba(0,255,65,0.12);text-decoration:none;text-align:center;">
    <span style="font-size:11px;color:#00FF41;letter-spacing:2px;font-weight:700;">SEE FULL DOSSIER →</span>
    <span style="font-size:9px;color:#3d5a3d;display:block;margin-top:2px;">snitched.ai — America First Public Intelligence</span>
  </a>
</div>`;
}

interface ShareDossierProps {
  politician: Politician;
}

export default function ShareDossier({ politician }: ShareDossierProps) {
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLTextAreaElement>(null);

  const embedHTML = generateEmbedHTML(politician);
  const iframeCode = `<iframe src="https://snitched.ai/embed/${politician.id}" width="100%" height="420" frameborder="0" style="max-width:600px;border:none;"></iframe>`;
  const score = politician.corruptionScore || 0;
  const [embedType, setEmbedType] = useState<'iframe' | 'html'>('iframe');

  const handleCopy = () => {
    navigator.clipboard.writeText(embedType === 'iframe' ? iframeCode : embedHTML);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="terminal-btn"
        style={{ padding: '0.5rem 1rem', fontSize: '0.75rem' }}
      >
        SHARE DOSSIER
      </button>

      {showModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.9)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div style={{
            background: '#0a0f0a', border: '1px solid rgba(0,255,65,0.2)',
            maxWidth: '660px', width: '100%', maxHeight: '90vh', overflowY: 'auto',
          }}>
            {/* Modal header */}
            <div style={{
              padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              borderBottom: '1px solid rgba(0,255,65,0.12)', background: 'rgba(0,255,65,0.04)',
            }}>
              <span style={{ fontSize: '0.7rem', color: '#00FF41', letterSpacing: '0.15em', fontWeight: 700 }}>
                SHARE DOSSIER CARD
              </span>
              <button onClick={() => setShowModal(false)} style={{
                background: 'none', border: 'none', color: '#6b8a6b', cursor: 'pointer',
                fontSize: '1.2rem', fontFamily: 'monospace', lineHeight: 1,
              }}>✕</button>
            </div>

            <div style={{ padding: '1rem' }}>
              <div style={{ fontSize: '0.55rem', color: '#3d5a3d', letterSpacing: '0.2em', marginBottom: '0.5rem' }}>PREVIEW — LIVE DATA FROM DATABASE</div>

              {/* Live iframe preview */}
              <div style={{ marginBottom: '1rem', border: '1px solid rgba(0,255,65,0.1)', overflow: 'hidden' }}>
                <iframe
                  src={`/embed/${politician.id}`}
                  width="100%"
                  height="420"
                  style={{ border: 'none', display: 'block' }}
                />
              </div>

              {/* Embed type toggle */}
              <div style={{ display: 'flex', gap: '0', marginBottom: '0.5rem' }}>
                <button onClick={() => setEmbedType('iframe')} style={{
                  flex: 1, padding: '0.4rem', fontSize: '0.6rem', fontWeight: 700, cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em',
                  background: embedType === 'iframe' ? 'rgba(0,255,65,0.08)' : 'transparent',
                  border: `1px solid ${embedType === 'iframe' ? '#00FF41' : 'rgba(0,255,65,0.1)'}`,
                  color: embedType === 'iframe' ? '#00FF41' : '#3d5a3d',
                  borderRight: 'none',
                }}>IFRAME (LIVE)</button>
                <button onClick={() => setEmbedType('html')} style={{
                  flex: 1, padding: '0.4rem', fontSize: '0.6rem', fontWeight: 700, cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em',
                  background: embedType === 'html' ? 'rgba(0,255,65,0.08)' : 'transparent',
                  border: `1px solid ${embedType === 'html' ? '#00FF41' : 'rgba(0,255,65,0.1)'}`,
                  color: embedType === 'html' ? '#00FF41' : '#3d5a3d',
                }}>STATIC HTML</button>
              </div>

              {/* Embed code */}
              <textarea
                ref={codeRef}
                readOnly
                value={embedType === 'iframe' ? iframeCode : embedHTML}
                style={{
                  width: '100%', height: embedType === 'iframe' ? '50px' : '100px', background: '#000',
                  border: '1px solid rgba(0,255,65,0.1)', color: '#00FF41',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: '0.55rem',
                  padding: '0.5rem', resize: 'vertical', outline: 'none',
                }}
                onClick={() => codeRef.current?.select()}
              />
              <div style={{ fontSize: '0.5rem', color: '#3d5a3d', marginTop: '0.3rem' }}>
                {embedType === 'iframe' ? '↑ Always shows latest data from database' : '↑ Static snapshot — won\'t update when DB changes'}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                <button onClick={handleCopy} style={{
                  flex: 1, padding: '0.7rem', background: copied ? '#00FF41' : 'transparent',
                  border: `2px solid ${copied ? '#00FF41' : 'rgba(0,255,65,0.3)'}`,
                  color: copied ? '#000' : '#00FF41',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: '0.7rem',
                  fontWeight: 700, cursor: 'pointer', letterSpacing: '0.1em',
                  transition: 'all 0.2s',
                }}>
                  {copied ? '✓ COPIED!' : 'COPY EMBED HTML'}
                </button>
                <button onClick={() => {
                  const url = `https://snitched.ai/politician/${politician.id}`;
                  if (navigator.share) {
                    navigator.share({ title: `${politician.name} — Corruption Score: ${score}/100`, url });
                  } else {
                    navigator.clipboard.writeText(url);
                    alert('Link copied!');
                  }
                }} style={{
                  flex: 1, padding: '0.7rem', background: 'transparent',
                  border: '2px solid rgba(0,255,65,0.15)', color: '#6b8a6b',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: '0.7rem',
                  fontWeight: 700, cursor: 'pointer', letterSpacing: '0.1em',
                }}>
                  SHARE LINK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

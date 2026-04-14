'use client';

import { useState, useRef } from 'react';
import type { Politician } from '@/lib/types';

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

function generateEmbedHTML(p: Politician): string {
  const score = p.corruptionScore || 0;
  const grade = getGrade(score);
  const gc = gradeColor(grade);
  const lobby = p.israelLobbyTotal || p.aipacFunding || 0;
  const funds = p.totalFundsRaised || 0;
  const partyBg = p.party === 'Republican' ? '#dc2626' : p.party === 'Democrat' ? '#2563eb' : '#6b7280';
  const partyTag = p.party === 'Republican' ? 'R' : p.party === 'Democrat' ? 'D' : 'I';
  const url = `https://snitched.ai/politician/${p.id}`;
  const status = p.isActive ? 'ACTIVE' : 'FORMER';
  const statusColor = p.isActive ? '#00FF41' : '#6b8a6b';
  const years = p.yearsInOffice ? `${p.yearsInOffice}yr${p.yearsInOffice !== 1 ? 's' : ''}` : '';
  const topDonors = (p.top5Donors || p.top3Donors || []).slice(0, 3);
  const donorsHtml = topDonors.length > 0
    ? topDonors.map((d, i) => `<div style="display:flex;justify-content:space-between;padding:3px 0;${i < topDonors.length - 1 ? 'border-bottom:1px solid rgba(0,255,65,0.06);' : ''}"><span style="font-size:10px;color:#6b8a6b;">${d.name}</span><span style="font-size:10px;font-weight:700;color:${d.type === 'Israel-PAC' ? '#FF0844' : '#00FF41'};">${fmtMoney(d.amount)}</span></div>`).join('')
    : '<div style="font-size:10px;color:#3d5a3d;">No donor data available</div>';
  const lobbyWarning = lobby > 0
    ? `<div style="margin-top:10px;padding:8px 10px;background:rgba(255,8,68,0.06);border:1px solid rgba(255,8,68,0.15);display:flex;justify-content:space-between;align-items:center;"><div style="font-size:9px;color:#FF0844;letter-spacing:1px;font-weight:700;">⚠ ISRAEL LOBBY FUNDING</div><div style="font-size:16px;font-weight:700;color:#FF0844;">${fmtMoney(lobby)}</div></div>`
    : '';

  return `<!-- SNITCHED.AI Dossier Card — Embed this anywhere -->
<div style="font-family:'Courier New',monospace;background:#000;color:#c8d6c8;border:1px solid rgba(0,255,65,0.2);max-width:420px;padding:0;overflow:hidden;">
  <div style="background:rgba(0,255,65,0.06);padding:10px 14px;border-bottom:1px solid rgba(0,255,65,0.12);display:flex;justify-content:space-between;align-items:center;">
    <div style="font-size:10px;color:#00FF41;letter-spacing:2px;font-weight:700;">SNITCHED.AI DOSSIER</div>
    <div style="display:flex;gap:8px;align-items:center;">
      <span style="font-size:8px;padding:2px 6px;background:${statusColor}15;border:1px solid ${statusColor}40;color:${statusColor};font-weight:700;letter-spacing:1px;">${status}</span>
      <span style="font-size:8px;color:#3d5a3d;">CORRUPTION INDEX</span>
    </div>
  </div>
  <div style="padding:14px;">
    <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:10px;">
      <div style="flex:1;">
        <div style="font-size:15px;font-weight:700;color:#c8d6c8;margin-bottom:3px;">${p.name}</div>
        <div style="font-size:10px;color:#6b8a6b;margin-bottom:2px;">${p.office}</div>
        <div style="display:flex;gap:6px;align-items:center;margin-top:5px;">
          <span style="font-size:9px;padding:2px 7px;background:${partyBg};color:#fff;font-weight:700;">${partyTag} — ${p.party}</span>
          ${years ? `<span style="font-size:9px;color:#3d5a3d;">${years} in office</span>` : ''}
        </div>
      </div>
      <div style="text-align:center;min-width:70px;">
        <div style="font-size:38px;font-weight:700;color:${gc};line-height:1;">${score}</div>
        <div style="font-size:8px;color:#3d5a3d;letter-spacing:1px;">/100</div>
        <div style="font-size:13px;font-weight:700;color:${gc};margin-top:2px;">GRADE: ${grade}</div>
      </div>
    </div>
    <div style="border-top:1px solid rgba(0,255,65,0.1);padding-top:10px;display:flex;gap:14px;">
      <div>
        <div style="font-size:8px;color:#3d5a3d;letter-spacing:1px;">TOTAL FUNDS</div>
        <div style="font-size:13px;font-weight:700;color:#00FF41;">${fmtMoney(funds)}</div>
      </div>
      <div>
        <div style="font-size:8px;color:#3d5a3d;letter-spacing:1px;">JURISDICTION</div>
        <div style="font-size:10px;color:#6b8a6b;">${p.jurisdiction || p.district || '—'}</div>
      </div>
    </div>
    ${lobbyWarning}
    <div style="margin-top:10px;">
      <div style="font-size:8px;color:#3d5a3d;letter-spacing:1px;margin-bottom:4px;">TOP DONORS</div>
      ${donorsHtml}
    </div>
  </div>
  <a href="${url}" target="_blank" rel="noopener" style="display:block;padding:10px 14px;background:rgba(0,255,65,0.06);border-top:1px solid rgba(0,255,65,0.12);font-size:10px;color:#00FF41;text-decoration:none;letter-spacing:1px;text-align:center;font-weight:700;">SEE FULL DOSSIER → SNITCHED.AI</a>
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

  const handleCopy = () => {
    navigator.clipboard.writeText(embedHTML);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const score = politician.corruptionScore || 0;

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
            background: 'rgba(0,0,0,0.85)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div style={{
            background: '#0a0f0a', border: '1px solid rgba(0,255,65,0.2)',
            maxWidth: '520px', width: '100%', maxHeight: '90vh', overflowY: 'auto',
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
                fontSize: '1rem', fontFamily: 'monospace',
              }}>✕</button>
            </div>

            {/* Preview */}
            <div style={{ padding: '1rem' }}>
              <div style={{ fontSize: '0.6rem', color: '#3d5a3d', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>PREVIEW</div>

              {/* Live preview — renders the actual embed HTML */}
              <div style={{ marginBottom: '1rem' }} dangerouslySetInnerHTML={{ __html: embedHTML }} />

              {/* Embed code */}
              <div style={{ fontSize: '0.6rem', color: '#3d5a3d', letterSpacing: '0.15em', marginBottom: '0.4rem' }}>EMBED HTML</div>
              <textarea
                ref={codeRef}
                readOnly
                value={embedHTML}
                style={{
                  width: '100%', height: '120px', background: '#000',
                  border: '1px solid rgba(0,255,65,0.12)', color: '#6b8a6b',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: '0.55rem',
                  padding: '0.5rem', resize: 'vertical', outline: 'none',
                }}
                onClick={() => codeRef.current?.select()}
              />

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                <button onClick={handleCopy} style={{
                  flex: 1, padding: '0.6rem', background: copied ? '#00FF41' : 'transparent',
                  border: '1px solid #00FF41', color: copied ? '#000' : '#00FF41',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: '0.7rem',
                  fontWeight: 700, cursor: 'pointer', letterSpacing: '0.1em',
                  transition: 'all 0.2s',
                }}>
                  {copied ? 'COPIED!' : 'COPY HTML'}
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
                  flex: 1, padding: '0.6rem', background: 'transparent',
                  border: '1px solid rgba(0,255,65,0.2)', color: '#6b8a6b',
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

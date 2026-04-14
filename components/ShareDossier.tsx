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

  return `<!-- SNITCHED.AI Dossier Card -->
<div style="font-family:'Courier New',monospace;background:#000;color:#c8d6c8;border:1px solid rgba(0,255,65,0.2);max-width:400px;padding:0;overflow:hidden;">
  <div style="background:rgba(0,255,65,0.06);padding:12px 16px;border-bottom:1px solid rgba(0,255,65,0.12);display:flex;justify-content:space-between;align-items:center;">
    <div style="font-size:10px;color:#00FF41;letter-spacing:2px;font-weight:700;">SNITCHED.AI DOSSIER</div>
    <div style="font-size:9px;color:#3d5a3d;">CORRUPTION INDEX</div>
  </div>
  <div style="padding:16px;">
    <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px;">
      <div>
        <div style="font-size:16px;font-weight:700;color:#c8d6c8;margin-bottom:4px;">${p.name}</div>
        <div style="font-size:11px;color:#6b8a6b;">${p.office}</div>
        <div style="margin-top:6px;display:inline-block;font-size:10px;padding:2px 8px;background:${partyBg};color:#fff;font-weight:700;">${partyTag} — ${p.party}</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:36px;font-weight:700;color:${gc};line-height:1;">${score}</div>
        <div style="font-size:9px;color:#3d5a3d;letter-spacing:1px;">/100</div>
        <div style="font-size:14px;font-weight:700;color:${gc};margin-top:2px;">GRADE: ${grade}</div>
      </div>
    </div>
    <div style="border-top:1px solid rgba(0,255,65,0.1);padding-top:10px;display:flex;gap:16px;">
      <div>
        <div style="font-size:9px;color:#3d5a3d;letter-spacing:1px;">FUNDS RAISED</div>
        <div style="font-size:14px;font-weight:700;color:#00FF41;">${fmtMoney(funds)}</div>
      </div>${lobby > 0 ? `
      <div>
        <div style="font-size:9px;color:#3d5a3d;letter-spacing:1px;">ISRAEL LOBBY</div>
        <div style="font-size:14px;font-weight:700;color:#FF0844;">${fmtMoney(lobby)}</div>
      </div>` : ''}
      <div>
        <div style="font-size:9px;color:#3d5a3d;letter-spacing:1px;">JURISDICTION</div>
        <div style="font-size:11px;color:#6b8a6b;">${p.jurisdiction || p.district || '—'}</div>
      </div>
    </div>
  </div>
  <a href="${url}" target="_blank" rel="noopener" style="display:block;padding:8px 16px;background:rgba(0,255,65,0.04);border-top:1px solid rgba(0,255,65,0.12);font-size:9px;color:#00FF41;text-decoration:none;letter-spacing:1px;text-align:center;">VIEW FULL DOSSIER → SNITCHED.AI</a>
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
  const grade = getGrade(score);
  const gc = gradeColor(grade);
  const lobby = politician.israelLobbyTotal || politician.aipacFunding || 0;
  const funds = politician.totalFundsRaised || 0;
  const partyBg = politician.party === 'Republican' ? '#dc2626' : politician.party === 'Democrat' ? '#2563eb' : '#6b7280';
  const partyTag = politician.party === 'Republican' ? 'R' : politician.party === 'Democrat' ? 'D' : 'I';

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

              {/* Live preview card */}
              <div style={{
                background: '#000', border: '1px solid rgba(0,255,65,0.2)',
                overflow: 'hidden', marginBottom: '1rem',
              }}>
                <div style={{
                  background: 'rgba(0,255,65,0.06)', padding: '10px 14px',
                  borderBottom: '1px solid rgba(0,255,65,0.12)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ fontSize: '9px', color: '#00FF41', letterSpacing: '2px', fontWeight: 700 }}>SNITCHED.AI DOSSIER</span>
                  <span style={{ fontSize: '8px', color: '#3d5a3d' }}>CORRUPTION INDEX</span>
                </div>
                <div style={{ padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '10px' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#c8d6c8', marginBottom: '3px' }}>{politician.name}</div>
                      <div style={{ fontSize: '10px', color: '#6b8a6b' }}>{politician.office}</div>
                      <div style={{
                        marginTop: '5px', display: 'inline-block', fontSize: '9px',
                        padding: '2px 7px', background: partyBg, color: '#fff', fontWeight: 700,
                      }}>{partyTag} — {politician.party}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '32px', fontWeight: 700, color: gc, lineHeight: 1 }}>{score}</div>
                      <div style={{ fontSize: '8px', color: '#3d5a3d', letterSpacing: '1px' }}>/100</div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: gc, marginTop: '2px' }}>GRADE: {grade}</div>
                    </div>
                  </div>
                  <div style={{ borderTop: '1px solid rgba(0,255,65,0.1)', paddingTop: '8px', display: 'flex', gap: '14px' }}>
                    <div>
                      <div style={{ fontSize: '8px', color: '#3d5a3d', letterSpacing: '1px' }}>FUNDS RAISED</div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#00FF41' }}>{fmtMoney(funds)}</div>
                    </div>
                    {lobby > 0 && (
                      <div>
                        <div style={{ fontSize: '8px', color: '#3d5a3d', letterSpacing: '1px' }}>ISRAEL LOBBY</div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#FF0844' }}>{fmtMoney(lobby)}</div>
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: '8px', color: '#3d5a3d', letterSpacing: '1px' }}>JURISDICTION</div>
                      <div style={{ fontSize: '10px', color: '#6b8a6b' }}>{politician.jurisdiction || politician.district || '—'}</div>
                    </div>
                  </div>
                </div>
                <div style={{
                  padding: '7px 14px', background: 'rgba(0,255,65,0.04)',
                  borderTop: '1px solid rgba(0,255,65,0.12)',
                  fontSize: '8px', color: '#00FF41', letterSpacing: '1px', textAlign: 'center',
                }}>VIEW FULL DOSSIER → SNITCHED.AI</div>
              </div>

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

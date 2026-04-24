'use client';

import { useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import EmbedDossier from '@/app/embed/[id]/EmbedDossier';
import { politicianToEmbedProps } from '@/lib/derive-embed-props';
import type { Politician } from '@/lib/types';

interface DownloadDossierProps {
  politician: Politician;
}

export default function DownloadDossier({ politician }: DownloadDossierProps) {
  const [showModal, setShowModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const props = politicianToEmbedProps(politician);

  const slug = politician.id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const filename = `snitched-${slug}.png`;

  const handleDownload = async (): Promise<void> => {
    if (!cardRef.current) return;
    setGenerating(true);
    setDone(false);
    try {
      // 2x pixel ratio for crisp retina/social-media-ready output.
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2,
        backgroundColor: '#000000',
        cacheBust: true,
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename;
      link.click();
      setDone(true);
      setTimeout(() => setDone(false), 2500);
    } catch (e) {
      console.error('DownloadDossier: toPng failed', e);
      alert(`Could not generate PNG: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="terminal-btn"
        style={{ padding: '0.5rem 1rem', fontSize: '0.75rem' }}
      >
        DOWNLOAD CARD
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
            <div style={{
              padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              borderBottom: '1px solid rgba(0,255,65,0.12)', background: 'rgba(0,255,65,0.04)',
            }}>
              <span style={{ fontSize: '0.7rem', color: '#00FF41', letterSpacing: '0.15em', fontWeight: 700 }}>
                DOWNLOAD VISUAL CARD
              </span>
              <button onClick={() => setShowModal(false)} style={{
                background: 'none', border: 'none', color: '#6b8a6b', cursor: 'pointer',
                fontSize: '1.2rem', fontFamily: 'monospace', lineHeight: 1,
              }}>✕</button>
            </div>

            <div style={{ padding: '1rem' }}>
              <div style={{ fontSize: '0.55rem', color: '#3d5a3d', letterSpacing: '0.2em', marginBottom: '0.5rem' }}>
                PREVIEW — CLICK &quot;DOWNLOAD PNG&quot; BELOW
              </div>

              {/* Live captureable card (NOT an iframe — html-to-image can read
                  its DOM directly, cross-origin iframes cannot be captured). */}
              <div ref={cardRef} style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                <EmbedDossier {...props} />
              </div>

              <button
                onClick={handleDownload}
                disabled={generating}
                style={{
                  width: '100%', padding: '0.8rem',
                  background: done ? '#00FF41' : (generating ? 'rgba(0,255,65,0.2)' : 'transparent'),
                  border: `2px solid ${done ? '#00FF41' : 'rgba(0,255,65,0.35)'}`,
                  color: done ? '#000' : '#00FF41',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem',
                  fontWeight: 700, letterSpacing: '0.12em',
                  cursor: generating ? 'wait' : 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {done ? '✓ DOWNLOADED' : generating ? 'GENERATING…' : `↓ DOWNLOAD PNG — ${filename}`}
              </button>

              <div style={{ fontSize: '0.5rem', color: '#3d5a3d', marginTop: '0.5rem', textAlign: 'center' }}>
                2x pixel ratio · transparent-safe · ready for social media
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

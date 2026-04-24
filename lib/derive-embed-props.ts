/**
 * Shared helper: convert a Politician object (or DB row) into the props
 * shape EmbedDossier needs. Used by the iframe embed page and by the
 * client-side DownloadDossier component so the two stay visually identical.
 */

import type { EmbedDossierProps } from '@/app/embed/[id]/EmbedDossier';
import type { Politician } from '@/lib/types';

function getGrade(score: number): string {
  if (score <= 20) return 'A';
  if (score <= 40) return 'B';
  if (score <= 60) return 'C';
  if (score <= 80) return 'D';
  return 'F';
}

// Binary dossier color (2026-04-21 product decision):
// score <= 20 (grade A) → green (clean / negligible)
// score >  20           → red   (measurable capture — B/C/D/F)
function binaryColor(score: number): string {
  return (Number(score) || 0) <= 20 ? '#00FF41' : '#FF0844';
}

export function politicianToEmbedProps(p: Politician): EmbedDossierProps {
  const score = Number(p.corruptionScore) || 0;
  const grade = getGrade(score);
  const lobby = Number(p.israelLobbyTotal) || Number(p.aipacFunding) || 0;
  const funds = Number(p.totalFundsRaised) || 0;

  const isCandidate = p.isCandidate || p.office === 'Candidate' || (p.office || '').includes('(Candidate)');
  const status = isCandidate ? 'CANDIDATE' : p.isActive ? 'IN OFFICE' : 'FORMER';
  const statusColor = isCandidate ? '#FFB627' : p.isActive ? '#00FF41' : '#FF6B35';
  const displayOffice = (p.runningFor && isCandidate)
    ? `Running for: ${p.runningFor}`
    : (p.office === 'Candidate' ? (p.runningFor || p.office) : p.office) || null;
  const yearsLabel = p.yearsInOffice ? `${p.yearsInOffice} yrs` : '';

  const topDonors = ((p.top5Donors || p.top3Donors || []) as Array<{ name: string; amount: number; type: string }>).slice(0, 3);
  const sourceIds = (p.source_ids || {}) as {
    red_flags?: Array<{ label: string; severity: 'high' | 'med' }>;
    donation_status?: { label: string; color: string; icon?: string };
  };
  const redFlagsRaw = sourceIds.red_flags ?? [];
  // Normalize both string-style and {label,severity}-style flags into the shape EmbedDossier expects.
  const redFlags = redFlagsRaw.map(f => {
    if (typeof f === 'string') return { label: f, severity: 'high' as const };
    return { label: f.label, severity: (f.severity === 'med' ? 'med' : 'high') as 'high' | 'med' };
  });
  const donationStatus = sourceIds.donation_status ?? null;

  return {
    bioguideId: p.id,
    name: p.name,
    party: p.party || null,
    jurisdiction: p.jurisdiction || null,
    district: p.district || null,
    displayOffice,
    status,
    statusColor,
    yearsLabel,
    score,
    grade,
    baselineGradeColor: binaryColor(score),
    baselineScoreBarColor: binaryColor(score),
    funds,
    lobby,
    topDonors,
    redFlags,
    donationStatus,
  };
}

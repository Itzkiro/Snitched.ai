import { getServerSupabase } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import EmbedDossier from './EmbedDossier';

export const dynamic = 'force-dynamic';

function getGrade(score: number): string {
  if (score <= 20) return 'A';
  if (score <= 40) return 'B';
  if (score <= 60) return 'C';
  if (score <= 80) return 'D';
  return 'F';
}

// Binary dossier color (2026-04-21 product decision):
// score === 0 → green (clean), anything > 0 → red.
function binaryColor(score: number): string {
  return (Number(score) || 0) === 0 ? '#00FF41' : '#FF0844';
}
function gradeColor(_grade: string): string { return '#FF0844'; /* unused — see binaryColor */ }
function scoreBarColor(score: number): string { return binaryColor(score); }
void gradeColor;

export default async function EmbedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const client = getServerSupabase();
  if (!client) return notFound();

  const { data: row } = await client
    .from('politicians')
    .select('bioguide_id, name, office, office_level, party, district, jurisdiction, corruption_score, aipac_funding, total_funds, israel_lobby_total, is_active, is_candidate, running_for, years_in_office, top5_donors, source_ids')
    .eq('bioguide_id', id)
    .single();

  if (!row) return notFound();

  const score = Number(row.corruption_score) || 0;
  const grade = getGrade(score);
  const lobby = Number(row.israel_lobby_total) || Number(row.aipac_funding) || 0;
  const funds = Number(row.total_funds) || 0;

  const isCandidate = row.is_candidate || row.office === 'Candidate' || (row.office || '').includes('(Candidate)');
  const status = isCandidate ? 'CANDIDATE' : row.is_active ? 'IN OFFICE' : 'FORMER';
  const statusColor = isCandidate ? '#FFB627' : row.is_active ? '#00FF41' : '#FF6B35';
  const displayOffice = (row.running_for && isCandidate) ? `Running for: ${row.running_for}` : row.office === 'Candidate' ? (row.running_for || row.office) : row.office;
  const yearsLabel = row.years_in_office ? `${row.years_in_office} yrs` : '';

  const topDonors = ((row.top5_donors || []) as Array<{ name: string; amount: number; type: string }>).slice(0, 3);
  const sourceIds = (row.source_ids || {}) as {
    red_flags?: Array<{ label: string; severity: 'high' | 'med' }>;
    donation_status?: { label: string; color: string; icon?: string };
  };
  const redFlags = sourceIds.red_flags ?? [];
  const donationStatus = sourceIds.donation_status ?? null;

  return (
    <EmbedDossier
      bioguideId={row.bioguide_id}
      name={row.name}
      party={row.party}
      jurisdiction={row.jurisdiction}
      district={row.district}
      displayOffice={displayOffice}
      status={status}
      statusColor={statusColor}
      yearsLabel={yearsLabel}
      score={score}
      grade={grade}
      baselineGradeColor={gradeColor(grade)}
      baselineScoreBarColor={scoreBarColor(score)}
      funds={funds}
      lobby={lobby}
      topDonors={topDonors}
      redFlags={redFlags}
      donationStatus={donationStatus}
    />
  );
}

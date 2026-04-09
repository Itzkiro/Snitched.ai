import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Candidates | SNITCHED.AI',
  description: 'Track Florida political candidates, their campaign filings, and election timelines. Real-time data from FL Division of Elections.',
};
import { getServerSupabase } from '@/lib/supabase-server';
import type { Politician } from '@/lib/types';

// ISR: revalidate every 5 minutes
export const revalidate = 300;

async function getPoliticians(): Promise<Politician[]> {
  const client = getServerSupabase();
  if (!client) {
    const { getAllPoliticians } = await import('@/lib/real-data');
    return getAllPoliticians();
  }

  const { data, error } = await client
    .from('politicians')
    .select('bioguide_id, name, office, office_level, party, district, jurisdiction, jurisdiction_type, corruption_score, aipac_funding, is_active, term_start, term_end, total_funds')
    .eq('is_active', false)
    .order('name');

  if (error || !data || data.length === 0) {
    const { getAllPoliticians } = await import('@/lib/real-data');
    return getAllPoliticians().filter(p => !p.isActive);
  }

  return data.map((row: Record<string, unknown>) => ({
    id: row.bioguide_id as string,
    name: row.name as string,
    office: row.office as string,
    officeLevel: row.office_level as Politician['officeLevel'],
    party: row.party as Politician['party'],
    district: row.district as string | undefined,
    jurisdiction: row.jurisdiction as string,
    jurisdictionType: row.jurisdiction_type as Politician['jurisdictionType'],
    corruptionScore: Number(row.corruption_score) || 0,
    aipacFunding: Number(row.aipac_funding) || 0,
    isActive: row.is_active as boolean,
    termStart: row.term_start as string,
    termEnd: row.term_end as string | undefined,
    totalFundsRaised: Number(row.total_funds) || 0,
  })) as Politician[];
}

/** Format currency for display */
function formatMoney(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

export default async function CandidatesPage() {
  const candidates = await getPoliticians();
  const totalFunds = candidates.reduce((s, c) => s + (c.totalFundsRaised || 0), 0);
  const highRiskCount = candidates.filter(c => c.corruptionScore >= 60).length;

  return (
    <main className="pt-[82px] min-h-screen bg-surface-container-lowest">
      {/* Terminal Header */}
      <div className="px-6 py-8 border-l-4 border-primary-container ml-6">
        <h1 className="font-headline text-5xl font-extrabold tracking-tight text-on-surface flex items-center gap-4">
          &gt; QUERY CANDIDATES_
          <span
            className="block w-6 h-12 bg-primary-container"
            style={{ animation: 'blink 1s step-end infinite' }}
          />
        </h1>
        <p className="font-label text-sm text-primary-container/50 mt-2 uppercase tracking-widest">
          SUB_DIRECTORY: /ROOT/ELECTORAL_VETTING/2026_CYCLE
        </p>
      </div>

      {/* Stats Row */}
      <div className="mx-6 grid grid-cols-1 md:grid-cols-4 gap-px bg-outline-variant/30 border border-outline-variant/30 mb-12">
        <div className="bg-surface-container p-4">
          <div className="text-[10px] font-label text-outline uppercase tracking-tighter">Total_Scanned</div>
          <div className="text-2xl font-label text-primary-container">{candidates.length.toLocaleString()}</div>
        </div>
        <div className="bg-surface-container p-4">
          <div className="text-[10px] font-label text-outline uppercase tracking-tighter">High_Risk_Flags</div>
          <div className="text-2xl font-label text-on-tertiary-container">{highRiskCount}</div>
        </div>
        <div className="bg-surface-container p-4">
          <div className="text-[10px] font-label text-outline uppercase tracking-tighter">Sum_Raised</div>
          <div className="text-2xl font-label text-primary-container">{formatMoney(totalFunds)}</div>
        </div>
        <div className="bg-surface-container p-4">
          <div className="text-[10px] font-label text-outline uppercase tracking-tighter">Sys_Latency</div>
          <div className="text-2xl font-label text-outline">12MS</div>
        </div>
      </div>

      {/* Candidate Grid */}
      {candidates.length > 0 ? (
        <div className="px-6 pb-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {candidates
              .filter(pol => pol && pol.id && pol.name && pol.office && pol.party)
              .map((pol) => {
                const isHighRisk = pol.corruptionScore >= 60;
                const isMedRisk = pol.corruptionScore >= 40;
                return (
                  <Link
                    key={pol.id}
                    href={`/politician/${pol.id}`}
                    className="bg-surface-container border border-outline-variant p-0 group hover:border-primary-container transition-none relative overflow-hidden block"
                  >
                    {/* Photo placeholder */}
                    <div className="h-48 w-full bg-surface-container-highest relative">
                      <div className="absolute inset-0 bg-gradient-to-t from-surface-container to-transparent" />
                      {/* Status badge */}
                      <div className={`absolute top-4 right-4 font-label text-[10px] px-2 py-0.5 font-bold ${
                        isHighRisk
                          ? 'bg-on-tertiary-container text-white'
                          : 'bg-primary-container text-on-primary-fixed'
                      }`}>
                        {isHighRisk ? '[ALERT]' : isMedRisk ? '[VETTED]' : '[NEW_ENTRY]'}
                      </div>
                    </div>

                    {/* Card body */}
                    <div className="p-6">
                      <div className="mb-4">
                        <div className="text-[10px] font-label text-primary-container/70 mb-1 tracking-widest uppercase">
                          {pol.office}
                        </div>
                        <h3 className="font-headline text-2xl font-bold text-on-surface uppercase leading-none">
                          {pol.name.split(' ').reverse().join(', ')}
                        </h3>
                      </div>

                      <div className="space-y-4 mb-6">
                        {/* Fundraising */}
                        <div className="flex justify-between items-end border-b border-outline-variant pb-2">
                          <span className="text-[10px] font-label text-outline uppercase">Fundraising</span>
                          <span className="text-lg font-label text-primary-container">
                            {formatMoney(pol.totalFundsRaised || pol.aipacFunding || 0)}
                          </span>
                        </div>

                        {/* Corruption Meter */}
                        <div className="space-y-2">
                          <div className="flex justify-between items-center text-[10px] font-label text-outline uppercase">
                            <span>Corruption_Potential</span>
                            <span className={`font-bold ${
                              isHighRisk ? 'text-on-tertiary-container' : 'text-primary-container'
                            }`}>
                              {pol.corruptionScore}%
                            </span>
                          </div>
                          <div className="h-2 w-full bg-surface-container-highest">
                            <div
                              className={`h-full ${
                                isHighRisk
                                  ? 'bg-on-tertiary-container shadow-[0_0_10px_rgba(197,0,57,0.5)]'
                                  : 'bg-primary-container shadow-[0_0_10px_rgba(0,255,136,0.5)]'
                              }`}
                              style={{ width: `${pol.corruptionScore}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Tags */}
                      <div className="flex flex-wrap gap-2">
                        <span className={`text-[10px] font-label px-2 py-0.5 border ${
                          pol.party === 'Republican'
                            ? 'bg-error/10 text-error border-error/30'
                            : pol.party === 'Democrat'
                            ? 'bg-blue-400/10 text-blue-400 border-blue-400/30'
                            : 'bg-outline-variant text-on-surface/60 border-outline-variant'
                        }`}>
                          [{pol.party === 'Republican' ? 'R' : pol.party === 'Democrat' ? 'D' : pol.party.charAt(0)}]
                        </span>
                        {pol.aipacFunding > 0 && (
                          <span className="text-[10px] font-label bg-on-tertiary-container/10 text-on-tertiary-container border border-on-tertiary-container/30 px-2 py-0.5">
                            [DARK_MONEY_RISK]
                          </span>
                        )}
                        {pol.juiceBoxTier && pol.juiceBoxTier !== 'none' && (
                          <span className="text-[10px] font-label bg-primary-container/10 text-primary-container border border-primary-container/30 px-2 py-0.5">
                            [PAC-BACKED]
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Bottom accent bar */}
                    <div className="absolute bottom-0 left-0 w-full h-1 bg-outline-variant group-hover:bg-primary-container transition-none" />
                  </Link>
                );
              })}
          </div>

          {/* Pagination */}
          <div className="mt-16 flex justify-between items-center border-t border-outline-variant pt-8">
            <div className="font-label text-[10px] text-outline uppercase">
              SHOWING {candidates.length} OF {candidates.length} NODES
            </div>
            <div className="flex gap-2">
              <button className="bg-surface-container border border-outline-variant px-4 py-2 font-label text-xs hover:border-primary-container hover:text-primary-container transition-none">
                PREV_PAGE
              </button>
              <button className="bg-primary-container text-on-primary-fixed px-4 py-2 font-label text-xs font-bold transition-none">
                NEXT_PAGE
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-6 py-16 text-center">
          <div className="font-headline text-xl font-bold text-primary-container mb-4 uppercase">
            NO_ACTIVE_CANDIDATES_DETECTED
          </div>
          <div className="font-label text-[11px] text-outline max-w-md mx-auto leading-relaxed">
            Candidate monitoring is active. New filings with Florida Division of Elections and FEC
            will be automatically detected and indexed. System will alert when 2026 primary filing period opens.
          </div>
          <div className="mt-8">
            <Link
              href="/officials"
              className="bg-primary-container text-on-primary-fixed px-6 py-3 font-label text-xs font-bold uppercase tracking-widest hover:bg-white transition-none inline-block"
            >
              VIEW_SEATED_OFFICIALS
            </Link>
          </div>
        </div>
      )}

      {/* Filing Calendar */}
      <div className="px-6 py-8 bg-surface-container border-t border-outline-variant/30">
        <div className="max-w-4xl mx-auto">
          <div className="font-label text-[10px] text-primary-container uppercase tracking-widest mb-4 border-b border-outline-variant/30 pb-2">
            2026_FILING_CALENDAR
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-outline-variant/30">
            <div className="bg-surface-container-low p-4">
              <div className="font-label text-[9px] text-outline uppercase mb-1">Primary Filing</div>
              <div className="font-headline text-lg font-bold text-on-surface">JUN 14, 2026</div>
            </div>
            <div className="bg-surface-container-low p-4">
              <div className="font-label text-[9px] text-outline uppercase mb-1">Primary Election</div>
              <div className="font-headline text-lg font-bold text-on-surface">AUG 18, 2026</div>
            </div>
            <div className="bg-surface-container-low p-4">
              <div className="font-label text-[9px] text-outline uppercase mb-1">General Filing</div>
              <div className="font-headline text-lg font-bold text-on-surface">SEP 15, 2026</div>
            </div>
            <div className="bg-surface-container-low p-4">
              <div className="font-label text-[9px] text-outline uppercase mb-1">General Election</div>
              <div className="font-headline text-lg font-bold text-on-surface">NOV 3, 2026</div>
            </div>
          </div>
        </div>
      </div>

      {/* blink keyframe for cursor */}
      <style>{`
        @keyframes blink {
          from, to { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </main>
  );
}

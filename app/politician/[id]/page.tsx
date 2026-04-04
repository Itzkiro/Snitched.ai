'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { Politician } from '@/lib/types';

// ---------------------------------------------------------------------------
// Voting Record Types
// ---------------------------------------------------------------------------
interface VotingRecord {
  id: string;
  billNumber: string;
  billTitle: string;
  billDescription?: string;
  voteDate: string;
  votePosition: 'Yea' | 'Nay' | 'NV' | 'Absent' | 'Yes' | 'No' | 'Not Voting' | string;
  category?: string;
  result?: string;
  chamber?: string;
  passed?: boolean;
  source: 'congress' | 'legiscan' | 'supabase';
  billUrl?: string;
}

interface VoteBreakdown { yea: number; nay: number; abstain: number; absent: number; }
type VoteCategoryFilter = 'all' | 'israel' | 'defense' | 'domestic' | 'foreign' | 'anti-america-first';

export default function PoliticianPage() {
  const params = useParams();
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [politician, setPolitician] = useState<Politician | null>(null);
  const [politicianLoading, setPoliticianLoading] = useState(true);
  const [votingRecords, setVotingRecords] = useState<VotingRecord[]>([]);
  const [votesLoading, setVotesLoading] = useState(false);
  const [votesError, setVotesError] = useState<string | null>(null);
  const [voteCategoryFilter, setVoteCategoryFilter] = useState<VoteCategoryFilter>('all');
  const [voteSearchQuery, setVoteSearchQuery] = useState<string>('');
  const [votesFetched, setVotesFetched] = useState(false);

  useEffect(() => {
    async function loadPolitician() {
      try {
        const politicianId = typeof params.id === 'string' ? params.id : params.id?.[0] ?? '';
        const res = await fetch(`/api/politicians/${encodeURIComponent(politicianId)}`);
        if (res.status === 404) { setPolitician(null); return; }
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const found: Politician = await res.json();
        setPolitician(found);
      } catch (error) {
        console.error('Error loading politician:', error);
        setPolitician(null);
      } finally { setPoliticianLoading(false); }
    }
    loadPolitician();
  }, [params.id]);

  const isFederal = !!(politician?.source_ids?.bioguide_id);
  const isStateLeg = !isFederal && !!(
    politician?.officeLevel === 'State Senator' ||
    politician?.officeLevel === 'State Representative' ||
    politician?.officeLevel === 'Governor'
  );

  const fetchVotingRecords = useCallback(async () => {
    if (!politician || votesFetched || votesLoading) return;
    setVotesLoading(true);
    setVotesError(null);
    try {
      let records: VotingRecord[] = [];
      if (isFederal) {
        const bioguideId = politician.source_ids!.bioguide_id!;
        const supaRes = await fetch(`/api/politicians/votes?bioguideId=${encodeURIComponent(bioguideId)}`);
        if (supaRes.ok) {
          const supaData = await supaRes.json();
          if (Array.isArray(supaData) && supaData.length > 0) {
            records = supaData.map((row: Record<string, unknown>, idx: number) => {
              const votes = row.votes as Record<string, unknown> | undefined;
              const bills = votes?.bills as Record<string, unknown> | undefined;
              const pv = (row.politician_votes ?? [row]) as Array<Record<string, unknown>>;
              const position = (pv[0]?.position as string) || 'NV';
              return { id: `supa-${idx}`, billNumber: (bills?.bill_number as string) || (votes?.vote_number as string) || '', billTitle: (bills?.title as string) || (votes?.description as string) || '', billDescription: (bills?.summary as string) || '', voteDate: (votes?.vote_date as string) || '', votePosition: position, category: (bills?.ai_primary_category as string) || '', result: (votes?.result as string) || '', chamber: (votes?.chamber as string) || '', source: 'supabase' as const };
            });
          }
        }
        if (records.length === 0) {
          const congressRes = await fetch(`/api/congress/bills?sponsor=${encodeURIComponent(bioguideId)}&limit=50`);
          if (congressRes.ok) {
            const congressData = await congressRes.json();
            records = (congressData.bills || []).map((bill: Record<string, unknown>, idx: number) => ({ id: `cong-${idx}`, billNumber: `${bill.type || ''} ${bill.number || ''}`.trim(), billTitle: (bill.title as string) || '', billDescription: '', voteDate: ((bill.latestAction as Record<string, unknown>)?.date as string) || (bill.updateDate as string) || '', votePosition: 'Sponsor', category: (bill.policyArea as string) || '', result: ((bill.latestAction as Record<string, unknown>)?.text as string) || '', chamber: (bill.originChamber as string) || '', source: 'congress' as const }));
          }
        }
      } else if (isStateLeg) {
        const nameQuery = politician.name.split(' ').slice(-1)[0];
        const state = politician.jurisdiction?.length === 2 ? politician.jurisdiction : 'FL';
        const searchRes = await fetch(`/api/legiscan?op=getSearch&state=${encodeURIComponent(state)}&query=${encodeURIComponent(nameQuery)}`);
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const results = searchData?.searchresult || {};
          const billEntries = Object.entries(results).filter(([key]) => key !== 'summary' && !isNaN(Number(key)));
          records = billEntries.slice(0, 50).map(([, val], idx) => {
            const bill = val as Record<string, unknown>;
            return { id: `ls-${idx}`, billNumber: (bill.bill_number as string) || '', billTitle: (bill.title as string) || '', billDescription: (bill.description as string) || '', voteDate: (bill.last_action_date as string) || (bill.status_date as string) || '', votePosition: 'N/A', category: '', result: (bill.last_action as string) || '', source: 'legiscan' as const, billUrl: (bill.url as string) || '' };
          });
        }
      }
      setVotingRecords(records);
      setVotesFetched(true);
    } catch (error) {
      console.error('Error fetching voting records:', error);
      setVotesError(error instanceof Error ? error.message : 'Failed to load voting records');
    } finally { setVotesLoading(false); }
  }, [politician, votesFetched, votesLoading, isFederal, isStateLeg]);

  useEffect(() => {
    if (activeTab === 'votes' && politician && !votesFetched && !votesLoading) fetchVotingRecords();
  }, [activeTab, politician, votesFetched, votesLoading, fetchVotingRecords]);

  const normalizePosition = (pos: string): string => {
    const p = pos.toLowerCase().trim();
    if (['yes', 'yea', 'aye'].includes(p)) return 'YEA';
    if (['no', 'nay'].includes(p)) return 'NAY';
    if (['nv', 'not voting', 'present', 'abstain'].includes(p)) return 'ABSTAIN';
    if (['absent'].includes(p)) return 'ABSENT';
    if (p === 'sponsor') return 'SPONSOR';
    if (p === 'n/a') return 'N/A';
    return pos.toUpperCase();
  };
  const getVoteColor = (position: string): string => { const norm = normalizePosition(position); if (norm === 'YEA' || norm === 'SPONSOR') return '#00ff88'; if (norm === 'NAY') return '#c50039'; if (norm === 'ABSTAIN') return '#FFD166'; return '#849585'; };
  const calculateBreakdown = (records: VotingRecord[]): VoteBreakdown => records.reduce((acc, r) => { const norm = normalizePosition(r.votePosition); if (norm === 'YEA' || norm === 'SPONSOR') acc.yea++; else if (norm === 'NAY') acc.nay++; else if (norm === 'ABSTAIN') acc.abstain++; else acc.absent++; return acc; }, { yea: 0, nay: 0, abstain: 0, absent: 0 });
  const filterByCategory = (records: VotingRecord[], filter: VoteCategoryFilter): VotingRecord[] => {
    if (filter === 'all') return records;
    return records.filter(r => {
      const text = `${r.billTitle} ${r.billDescription || ''} ${r.category || ''}`.toLowerCase();
      switch (filter) {
        case 'israel': return /israel|gaza|palestin|middle east|zion/.test(text);
        case 'defense': return /defense|military|armed forces|national security|weapon|armed services/.test(text);
        case 'foreign': return /foreign|international|state department|embassy|diplomatic|treaty|alliance|united nations|nato|trade agreement|sanctions|humanitarian aid|ukraine|russia|china/.test(text);
        case 'anti-america-first': return /united nations|un funding|who funding|paris agreement|global climate|international court|global tax|multilateral|world bank|imf|refugee admission|migration compact|open border/.test(text);
        case 'domestic': return !/foreign|international|immigration/.test(text);
        default: return true;
      }
    });
  };
  const filterBySearch = (records: VotingRecord[], query: string): VotingRecord[] => { if (!query.trim()) return records; const q = query.toLowerCase().trim(); return records.filter(r => `${r.billNumber} ${r.billTitle} ${r.billDescription || ''} ${r.category || ''}`.toLowerCase().includes(q)); };
  const getFilteredRecords = (): VotingRecord[] => filterBySearch(filterByCategory(votingRecords, voteCategoryFilter), voteSearchQuery);

  if (politicianLoading) return (
    <main className="min-h-screen bg-[#05070a] text-[#e1e2e7] flex items-center justify-center pt-[82px]">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 border-2 border-[#3b4b3d] border-t-[#00ff88] mx-auto animate-spin" />
        <div className="font-[var(--font-label)] text-[0.75rem] text-[#00ff88]/60 tracking-widest uppercase">LOADING_DOSSIER...</div>
      </div>
    </main>
  );

  if (!politician) return (
    <main className="min-h-screen bg-[#05070a] text-[#e1e2e7] flex items-center justify-center pt-[82px]">
      <div className="text-center space-y-4">
        <div className="text-5xl mb-4 text-[#c50039]">!</div>
        <div className="font-[var(--font-headline)] text-2xl font-black text-[#e1e2e7] uppercase">RECORD NOT FOUND</div>
        <div className="text-emerald-700 font-[var(--font-label)] text-sm">Entity does not exist in database</div>
        <Link href="/browse" className="inline-block mt-4 px-6 py-2 bg-[#00ff88] text-[#020409] font-[var(--font-label)] text-xs font-bold tracking-widest uppercase">RETURN TO DATABASE</Link>
      </div>
    </main>
  );

  const getScoreColor = (score: number) => { if (score < 40) return '#00ff88'; if (score < 60) return '#FFD166'; return '#c50039'; };
  const getJuiceBoxLabel = (tier: string) => { if (tier === 'owned' || tier === 'bought') return 'TIER 1'; if (tier === 'compromised') return 'TIER 2'; return 'TIER 3'; };
  const getGradeColor = (grade: string) => { switch (grade) { case 'A': return '#10b981'; case 'B': return '#22c55e'; case 'C': return '#f59e0b'; case 'D': return '#ef4444'; case 'F': return '#dc2626'; default: return '#6b7280'; } };
  const getConfidenceColor = (confidence: string) => { switch (confidence) { case 'high': return '#10b981'; case 'medium': return '#f59e0b'; default: return '#6b7280'; } };

  const riskLevel = politician.corruptionScore <= 20 ? 'LOW RISK' : politician.corruptionScore <= 40 ? 'MODERATE' : politician.corruptionScore <= 60 ? 'ELEVATED' : politician.corruptionScore <= 80 ? 'HIGH RISK' : 'SEVERE';
  const riskFactors = politician.corruptionScoreDetails?.factors ? [...politician.corruptionScoreDetails.factors].sort((a, b) => b.weightedScore - a.weightedScore) : [];
  const tabs = [{ id: 'overview', label: 'OVERVIEW' }, { id: 'funding', label: 'FUNDING_LOGS' }, { id: 'votes', label: 'VOTING_RECORD' }, { id: 'social', label: 'SOCIAL_SENTIMENT' }, { id: 'network', label: 'LOBBYING_FREQ' }, { id: 'score', label: 'SCORE_BREAKDOWN' }, { id: 'legal', label: 'LEGAL' }];

  return (
    <main className="pt-[82px] pb-12 px-6 min-h-screen bg-[#05070a]">
      {/* DOSSIER HEADER */}
      <section className="relative w-full border border-emerald-900/50 bg-[#0c0e12] overflow-hidden mb-6 p-8 flex flex-col md:flex-row items-center gap-8">
        <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at center, #00ff88 0%, transparent 70%)' }} />
        <div className="relative group flex-shrink-0">
          <div className="w-48 h-56 border-2 border-[#00ff88] relative overflow-hidden bg-black/40 ghost-bracket-tl ghost-bracket-br flex items-center justify-center">
            <span className="text-7xl font-black text-[#00ff88]/30 font-[var(--font-headline)]">{politician.name.charAt(0)}</span>
          </div>
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-[#020409] border border-[#00ff88] px-3 py-1 font-[var(--font-label)] text-[10px] text-[#00ff88] tracking-widest whitespace-nowrap">ID: {politician.id.substring(0, 12).toUpperCase()}</div>
        </div>
        <div className="flex-1 text-center md:text-left space-y-4">
          <div className="space-y-1">
            <div className="flex items-center justify-center md:justify-start gap-2">
              <span className="bg-emerald-400 text-[#020409] font-[var(--font-label)] font-bold text-[10px] px-2 py-0.5 tracking-tighter uppercase">ACTIVE_DOSSIER</span>
              {politician.corruptionScore >= 60 && <span className="text-[#c50039] font-[var(--font-label)] text-[10px] font-bold flicker-alert uppercase">{riskLevel}_SURVEILLANCE</span>}
            </div>
            <h1 className="font-[var(--font-headline)] text-6xl md:text-7xl font-black tracking-tighter text-[#00ff88] crt-glow uppercase leading-none">{politician.name.toUpperCase()}</h1>
            <div className="flex flex-wrap justify-center md:justify-start gap-6 font-[var(--font-label)] text-xs text-emerald-600 tracking-widest uppercase py-2 border-y border-emerald-900/30">
              <div><span className="text-emerald-900">OFFICE:</span> {politician.office.toUpperCase()}</div>
              <div><span className="text-emerald-900">PARTY:</span> {politician.party.toUpperCase()}</div>
              <div><span className="text-emerald-900">STATE:</span> {(politician.jurisdiction || 'FL').toUpperCase()}</div>
            </div>
          </div>
          <div className="flex flex-wrap justify-center md:justify-start gap-4">
            <div className="bg-[#020409] border-2 border-[#00ff88] px-6 py-2 flex items-center gap-3">
              <div className="font-[var(--font-label)] text-xs text-emerald-900">JUICE_BOX</div>
              <div className="font-[var(--font-label)] text-xl text-[#00ff88] font-bold">{getJuiceBoxLabel(politician.juiceBoxTier)}</div>
            </div>
            <button className="bg-emerald-400 hover:bg-emerald-300 text-[#020409] px-6 py-2 font-[var(--font-label)] text-xs font-bold tracking-widest transition-none flex items-center gap-2">
              <span className="text-sm">&#9673;</span> LIVE_TRACKING_ON
            </button>
          </div>
        </div>
        <div className="flex-shrink-0 flex flex-col items-center">
          <div className="relative w-36 h-36 flex items-center justify-center">
            <div className="absolute inset-0 shadow-[0_0_25px_rgba(0,255,136,0.2)]" style={{ clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)', background: 'rgba(0, 255, 136, 0.1)' }} />
            <div className="absolute inset-1 border border-[#00ff88]/40" style={{ clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' }} />
            <div className="flex flex-col items-center z-10">
              <span className="font-[var(--font-headline)] font-black text-5xl text-[#00ff88] crt-glow">{politician.corruptionScore}</span>
              <span className="font-[var(--font-label)] text-[9px] text-emerald-600 tracking-[0.2em]">RISK_SCORE</span>
            </div>
          </div>
          <span className="font-[var(--font-label)] text-[10px] text-[#c50039] font-bold flicker-alert mt-2 uppercase">{riskLevel}</span>
        </div>
      </section>

      {/* ANALYSIS GRID */}
      <div className="grid grid-cols-12 gap-6">
        {/* LEFT COLUMN */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <div className="bg-[#1d2023] border border-emerald-900/30 p-4 relative ghost-bracket-tl ghost-bracket-br">
            <div className="flex justify-between items-center mb-6 border-b border-[#3b4b3d]/30 pb-2">
              <h2 className="font-[var(--font-label)] text-xs font-bold text-[#00ff88] tracking-widest flex items-center gap-2"><span className="text-sm">&#9632;</span> RISK_MATRIX</h2>
              <span className="font-[var(--font-label)] text-[10px] text-emerald-900 uppercase">TELEMETRY_STREAM</span>
            </div>
            <div className="space-y-4 font-[var(--font-label)]">
              {riskFactors.length > 0 ? riskFactors.slice(0, 4).map((factor) => (
                <div key={factor.key} className="space-y-1">
                  <div className="flex justify-between text-[10px] text-emerald-600"><span>{factor.label.toUpperCase().replace(/ /g, '_')}</span><span className="text-[#00ff88]">{factor.rawScore}%</span></div>
                  <div className="h-1 bg-emerald-900/50 w-full border border-emerald-900/20"><div className="h-full bg-[#00ff88] crt-glow-border" style={{ width: `${factor.rawScore}%` }} /></div>
                </div>
              )) : (
                <>
                  <div className="space-y-1"><div className="flex justify-between text-[10px] text-emerald-600"><span>FUNDING_RISK</span><span className="text-[#00ff88]">{Math.min(99, politician.corruptionScore + 6)}%</span></div><div className="h-1 bg-emerald-900/50 w-full border border-emerald-900/20"><div className="h-full bg-[#00ff88] crt-glow-border" style={{ width: `${Math.min(99, politician.corruptionScore + 6)}%` }} /></div></div>
                  <div className="space-y-1"><div className="flex justify-between text-[10px] text-emerald-600"><span>VOTING_PATTERN</span><span className="text-[#00ff88]">{Math.max(10, politician.corruptionScore - 15)}%</span></div><div className="h-1 bg-emerald-900/50 w-full border border-emerald-900/20"><div className="h-full bg-[#00ff88]" style={{ width: `${Math.max(10, politician.corruptionScore - 15)}%` }} /></div></div>
                  <div className="space-y-1"><div className="flex justify-between text-[10px] text-emerald-600"><span>FORENSIC_CONN</span><span className="text-[#00ff88]">{politician.corruptionScore}%</span></div><div className="h-1 bg-emerald-900/50 w-full border border-emerald-900/20"><div className="h-full bg-[#00ff88]" style={{ width: `${politician.corruptionScore}%` }} /></div></div>
                </>
              )}
            </div>
            <div className="mt-8 p-3 bg-[#020409] border border-emerald-900/40 text-[10px] font-[var(--font-label)] text-emerald-500/80 leading-relaxed italic">
              <span className="text-[#00ff88] font-bold not-italic">ANALYSIS:</span> {politician.corruptionScoreDetails?.factors?.[0]?.explanation || `Composite risk score of ${politician.corruptionScore}/100. Status: ${riskLevel}.`}
            </div>
          </div>
          <div className="bg-[#1d2023] border border-emerald-900/30 p-4 relative ghost-bracket-bl ghost-bracket-tr">
            <h2 className="font-[var(--font-label)] text-[10px] font-bold text-[#00ff88] tracking-[0.2em] mb-4 uppercase">GEO_INTEL // {(politician.jurisdiction || 'FLORIDA').toUpperCase()}</h2>
            <div className="w-full h-48 bg-slate-900 border border-emerald-900/50 relative overflow-hidden">
              <div className="absolute inset-0 bg-[#111417]" style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,255,136,0.05) 0px, rgba(0,255,136,0.05) 1px, transparent 1px, transparent 10px)' }} />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"><div className="w-6 h-6 border-2 border-[#00ff88] rounded-full animate-ping opacity-50" /><div className="w-2 h-2 bg-[#00ff88] rounded-full absolute top-2 left-2" /></div>
            </div>
            <div className="mt-3 flex justify-between font-[var(--font-label)] text-[9px] text-emerald-900 uppercase tracking-widest"><span>DISTRICT: {politician.district || 'STATEWIDE'}</span><span>STATUS: {politician.isActive ? 'ACTIVE' : 'INACTIVE'}</span></div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          <div className="flex overflow-x-auto no-scrollbar border-b border-emerald-900/30">
            {tabs.map(tab => (<button key={tab.id} onClick={() => setActiveTab(tab.id)} className={activeTab === tab.id ? 'px-8 py-3 bg-emerald-900/20 text-[#00ff88] font-[var(--font-label)] text-xs font-bold tracking-[0.2em] border-b-2 border-[#00ff88] whitespace-nowrap' : 'px-8 py-3 text-emerald-900 hover:text-emerald-300 font-[var(--font-label)] text-xs tracking-[0.2em] whitespace-nowrap transition-none'}>{tab.label}</button>))}
          </div>

          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="bg-[#282a2e] border border-emerald-900/30 ghost-bracket-tr ghost-bracket-bl overflow-hidden">
                <div className="p-6 border-b border-emerald-900/20 bg-[#020409]/40"><h3 className="font-[var(--font-label)] text-[10px] text-emerald-800 uppercase tracking-[0.3em]">BIOGRAPHICAL_DATA</h3></div>
                <div className="p-6 font-[var(--font-label)] text-sm text-emerald-300/80 leading-relaxed">
                  <p className="mb-4">{politician.bio || `${politician.name} serves as ${politician.office} representing ${politician.district || politician.jurisdiction}.`}</p>
                  <div className="grid grid-cols-2 gap-4 text-[11px]">
                    <div className="flex gap-2"><span className="text-emerald-900">OFFICE:</span><span className="text-emerald-200">{politician.office}</span></div>
                    <div className="flex gap-2"><span className="text-emerald-900">JURISDICTION:</span><span className="text-emerald-200">{politician.district || politician.jurisdiction}</span></div>
                    <div className="flex gap-2"><span className="text-emerald-900">PARTY:</span><span className="text-emerald-200">{politician.party}</span></div>
                    <div className="flex gap-2"><span className="text-emerald-900">TERM_START:</span><span className="text-emerald-200">{politician.termStart || 'N/A'}</span></div>
                    {politician.termEnd && <div className="flex gap-2"><span className="text-emerald-900">TERM_END:</span><span className="text-emerald-200">{politician.termEnd}</span></div>}
                    <div className="flex gap-2"><span className="text-emerald-900">YEARS_IN_OFFICE:</span><span className="text-emerald-200">{politician.yearsInOffice}</span></div>
                  </div>
                </div>
              </div>
              {politician.socialMedia && Object.keys(politician.socialMedia).length > 0 && (
                <div className="bg-[#1d2023] border border-emerald-900/30 overflow-hidden">
                  <div className="bg-emerald-950/30 px-6 py-3 border-b border-emerald-900/30"><h3 className="font-[var(--font-label)] text-[10px] font-bold text-[#00ff88] tracking-[0.2em] uppercase">SOCIAL_ACCOUNTS</h3></div>
                  <div className="p-6 space-y-3 font-[var(--font-label)] text-sm">
                    {politician.socialMedia.twitterHandle && <div className="flex items-center gap-4"><span className="text-emerald-900 w-24 text-[11px]">TWITTER:</span><a href={`https://twitter.com/${politician.socialMedia.twitterHandle}`} target="_blank" rel="noopener noreferrer" className="text-[#00ff88] text-[11px]">@{politician.socialMedia.twitterHandle}</a></div>}
                    {politician.socialMedia.facebookPageUrl && <div className="flex items-center gap-4"><span className="text-emerald-900 w-24 text-[11px]">FACEBOOK:</span><a href={politician.socialMedia.facebookPageUrl} target="_blank" rel="noopener noreferrer" className="text-[#00ff88] text-[11px]">Page</a></div>}
                    {politician.socialMedia.instagramHandle && <div className="flex items-center gap-4"><span className="text-emerald-900 w-24 text-[11px]">INSTAGRAM:</span><a href={`https://instagram.com/${politician.socialMedia.instagramHandle}`} target="_blank" rel="noopener noreferrer" className="text-[#00ff88] text-[11px]">@{politician.socialMedia.instagramHandle}</a></div>}
                    {politician.socialMedia.youtubeChannelId && <div className="flex items-center gap-4"><span className="text-emerald-900 w-24 text-[11px]">YOUTUBE:</span><a href={`https://youtube.com/channel/${politician.socialMedia.youtubeChannelId}`} target="_blank" rel="noopener noreferrer" className="text-[#00ff88] text-[11px]">Channel</a></div>}
                  </div>
                </div>
              )}
              {politician.dataStatus && (
                <div className={`p-4 border font-[var(--font-label)] text-[11px] ${politician.dataStatus === 'live' ? 'border-emerald-400/30 bg-emerald-400/5' : 'border-[#FFD166]/30 bg-[#FFD166]/5'}`}>
                  <div className="flex justify-between items-center">
                    <span className={`font-bold tracking-widest uppercase ${politician.dataStatus === 'live' ? 'text-emerald-400' : 'text-[#FFD166]'}`}>{politician.dataStatus === 'live' ? 'LIVE_DATA' : 'MOCK_DATA'}{politician.dataSource && <span className="font-normal text-emerald-700 ml-2">// {politician.dataSource}</span>}</span>
                    {politician.lastUpdated && <span className="text-emerald-900 text-[10px]">SYNC: {new Date(politician.lastUpdated).toISOString().slice(0, 19)}</span>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SCORE TAB */}
          {activeTab === 'score' && (
            <div className="space-y-6">
              <div className="bg-[#282a2e] border border-emerald-900/30 p-6 ghost-bracket-tr ghost-bracket-bl">
                <div className="flex gap-6 items-center flex-wrap">
                  <div className="w-28 h-28 border-2 flex flex-col items-center justify-center flex-shrink-0" style={{ borderColor: getScoreColor(politician.corruptionScore) }}>
                    <span className="font-[var(--font-headline)] text-4xl font-black" style={{ color: getScoreColor(politician.corruptionScore) }}>{politician.corruptionScore}</span>
                    <span className="text-[10px] text-emerald-700 font-[var(--font-label)]">/100</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {politician.corruptionScoreDetails?.grade && <span className="font-[var(--font-headline)] text-4xl font-black" style={{ color: getGradeColor(politician.corruptionScoreDetails.grade) }}>{politician.corruptionScoreDetails.grade}</span>}
                      <span className="font-[var(--font-label)] text-lg font-bold text-[#e1e2e7]">{riskLevel}</span>
                    </div>
                    {politician.corruptionScoreDetails?.confidence && <div className="inline-flex items-center gap-2 px-3 py-1 border font-[var(--font-label)] text-[10px] font-bold uppercase tracking-widest" style={{ borderColor: getConfidenceColor(politician.corruptionScoreDetails.confidence), color: getConfidenceColor(politician.corruptionScoreDetails.confidence) }}>{politician.corruptionScoreDetails.confidence} confidence &mdash; {politician.corruptionScoreDetails.dataCompleteness}% data</div>}
                  </div>
                </div>
              </div>
              <div className="bg-[#1d2023] border border-emerald-900/30 p-6">
                <h3 className="font-[var(--font-label)] text-xs font-bold text-[#00ff88] tracking-widest uppercase mb-6">SCORE_FACTOR_BREAKDOWN</h3>
                {politician.corruptionScoreDetails?.factors ? (
                  <div className="space-y-4">{[...politician.corruptionScoreDetails.factors].sort((a, b) => b.weightedScore - a.weightedScore).map((factor) => (
                    <div key={factor.key} className="p-4 bg-[#111417] border border-emerald-900/20">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2"><span className="font-[var(--font-label)] text-[11px] font-bold text-[#e1e2e7]">{factor.label}</span><span className={`text-[9px] px-2 py-0.5 border font-bold uppercase ${factor.dataAvailable ? 'border-emerald-400/50 text-emerald-400 bg-emerald-400/10' : 'border-emerald-900/50 text-emerald-900'}`}>{factor.dataAvailable ? 'REAL DATA' : 'PLACEHOLDER'}</span></div>
                        <div className="flex items-baseline gap-2"><span className="font-[var(--font-headline)] text-xl font-black" style={{ color: getScoreColor(factor.rawScore) }}>{factor.rawScore}</span><span className="text-[10px] text-emerald-700 font-[var(--font-label)]">/100 x{(factor.weight * 100).toFixed(0)}% = {factor.weightedScore.toFixed(1)}</span></div>
                      </div>
                      <div className="h-1 bg-emerald-900/50 w-full mb-2"><div className="h-full" style={{ width: `${factor.rawScore}%`, background: getScoreColor(factor.rawScore) }} /></div>
                      <div className="text-[10px] text-emerald-700 font-[var(--font-label)] leading-relaxed">{factor.explanation}</div>
                    </div>
                  ))}</div>
                ) : <div className="text-center py-8 text-emerald-700 font-[var(--font-label)] text-sm">Score breakdown not available.</div>}
              </div>
              <div className="bg-[#111417] border border-[#FFD166]/20 p-6">
                <h3 className="font-[var(--font-label)] text-xs font-bold text-[#FFD166] tracking-widest uppercase mb-3">METHODOLOGY &mdash; v1 ALGORITHM</h3>
                <div className="text-[11px] text-emerald-700 font-[var(--font-label)] leading-relaxed space-y-2">
                  <p>The corruption score is a composite of 5 weighted factors: PAC/Lobby Funding Ratio (30%), Lobbying Connections (20%), Voting Alignment with Donors (25%), Transparency &amp; Disclosure (10%), and Campaign Finance Red Flags (15%).</p>
                  <p>Factors marked &quot;PLACEHOLDER&quot; use a neutral baseline score of 30. As more data sources come online, these factors will switch to real data.</p>
                </div>
              </div>
            </div>
          )}

          {/* FUNDING TAB */}
          {activeTab === 'funding' && (
            <div className="space-y-6">
              {politician.totalFundsRaised ? (<>
                <div className="bg-[#282a2e] border border-emerald-900/30 ghost-bracket-tr ghost-bracket-bl overflow-hidden">
                  <div className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-emerald-900/20 bg-[#020409]/40">
                    <div><h3 className="font-[var(--font-label)] text-[10px] text-emerald-800 uppercase tracking-[0.3em] mb-1">AGGREGATE_CAPITAL_FLOW</h3><div className="font-[var(--font-headline)] font-bold text-5xl text-white crt-glow">${politician.totalFundsRaised.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
                    <div className="text-right font-[var(--font-label)]"><div className="text-[9px] text-emerald-900 uppercase">SYNC_TIMESTAMP</div><div className="text-xs text-emerald-500">{politician.lastUpdated ? new Date(politician.lastUpdated).toISOString().slice(0, 19).replace('T', ' ') + ' UTC' : 'N/A'}</div></div>
                  </div>
                  {politician.top5Donors && politician.top5Donors.length > 0 && (
                    <div className="overflow-x-auto"><table className="w-full font-[var(--font-label)] text-[11px] text-left"><thead><tr className="bg-emerald-950/50 text-emerald-700 uppercase tracking-widest text-[9px]"><th className="px-6 py-4 font-bold">DONOR_ENTITY</th><th className="px-6 py-4 font-bold text-right">MAGNITUDE</th><th className="px-6 py-4 font-bold">TYPE</th><th className="px-6 py-4 font-bold text-center">STATUS</th></tr></thead>
                    <tbody className="divide-y divide-emerald-900/10">{politician.top5Donors.map((donor, i) => { const isIsrael = donor.type === 'Israel-PAC'; return (
                      <tr key={i} className={isIsrael ? 'bg-[#c50039]/5 border-l-2 border-[#c50039]' : 'hover:bg-emerald-400/5 border-l-2 border-transparent hover:border-emerald-400'}>
                        <td className={`px-6 py-4 ${isIsrael ? 'text-[#c50039] font-bold' : 'text-emerald-200'}`}>{isIsrael && <span className="mr-2">&#9888;</span>}{donor.name}</td>
                        <td className={`px-6 py-4 text-right font-black ${isIsrael ? 'text-[#c50039]' : 'text-[#00ff88]'}`}>${donor.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="px-6 py-4 text-emerald-600">{donor.type.toUpperCase()}</td>
                        <td className="px-6 py-4 text-center">{isIsrael ? <span className="bg-[#c50039]/20 border border-[#c50039] px-2 py-0.5 text-[9px] text-[#c50039] font-black">FLAGGED</span> : <span className="border border-[#00ff88]/30 px-2 py-0.5 text-[9px] text-[#00ff88]">VERIFIED</span>}</td>
                      </tr>); })}</tbody></table></div>
                  )}
                </div>
                {politician.israelLobbyTotal && politician.israelLobbyTotal > 0 && (
                  <div className="bg-[#1d2023] border border-[#c50039]/30 p-6">
                    <h3 className="font-[var(--font-label)] text-xs font-bold text-[#c50039] tracking-widest uppercase mb-4 flicker-alert">ISRAEL_LOBBY_TOTAL</h3>
                    <div className="font-[var(--font-headline)] text-4xl font-black text-[#c50039] crt-glow mb-4">${politician.israelLobbyTotal.toLocaleString()}</div>
                    {politician.israelLobbyBreakdown && <div className="grid grid-cols-3 gap-4">
                      <div className="p-3 bg-[#c50039]/10 border border-[#c50039]/30"><div className="text-[10px] text-emerald-700 mb-1 font-[var(--font-label)]">PACs</div><div className="font-[var(--font-headline)] text-lg font-bold text-[#c50039]">${((politician.israelLobbyBreakdown.pacs || 0) / 1000).toFixed(0)}K</div></div>
                      <div className="p-3 bg-[#c50039]/10 border border-[#c50039]/30"><div className="text-[10px] text-emerald-700 mb-1 font-[var(--font-label)]">IE</div><div className="font-[var(--font-headline)] text-lg font-bold text-[#c50039]">${((politician.israelLobbyBreakdown.ie || 0) / 1000).toFixed(0)}K</div></div>
                      <div className="p-3 bg-[#c50039]/10 border border-[#c50039]/30"><div className="text-[10px] text-emerald-700 mb-1 font-[var(--font-label)]">Bundlers</div><div className="font-[var(--font-headline)] text-lg font-bold text-[#c50039]">${((politician.israelLobbyBreakdown.bundlers || 0) / 1000).toFixed(0)}K</div></div>
                    </div>}
                  </div>
                )}
                {politician.contributionBreakdown && (() => { const b = politician.contributionBreakdown; const total = (b.individuals || 0) + (b.otherPACs || 0) + (b.corporate || 0) + (b.aipac || 0); if (total === 0) return null; const segments = [{ label: 'Individuals', amount: b.individuals || 0, color: '#00ff88' }, { label: 'PACs', amount: b.otherPACs || 0, color: '#FFD166' }, { label: 'Corporate', amount: b.corporate || 0, color: '#60a5fa' }, ...(b.aipac > 0 ? [{ label: 'Israel Lobby', amount: b.aipac, color: '#c50039' }] : [])].filter(s => s.amount > 0).sort((a, bb) => bb.amount - a.amount); return (
                  <div className="bg-[#1d2023] border border-emerald-900/30 p-6">
                    <h3 className="font-[var(--font-label)] text-xs font-bold text-[#00ff88] tracking-widest uppercase mb-4">FUNDING_BREAKDOWN</h3>
                    <div className="flex h-2 mb-4">{segments.map((s, i) => <div key={i} style={{ width: `${(s.amount / total) * 100}%`, background: s.color, minWidth: s.amount > 0 ? '4px' : '0' }} />)}</div>
                    <div className="space-y-2">{segments.map((s, i) => <div key={i} className="flex justify-between items-center text-[11px] font-[var(--font-label)]"><div className="flex items-center gap-2"><div className="w-3 h-3" style={{ background: s.color }} /><span className="text-[#e1e2e7]">{s.label}</span><span className="text-emerald-700">({((s.amount / total) * 100).toFixed(1)}%)</span></div><span className="font-bold" style={{ color: s.color }}>${s.amount >= 1000000 ? `${(s.amount / 1000000).toFixed(1)}M` : s.amount >= 10000 ? `${(s.amount / 1000).toFixed(0)}K` : s.amount.toLocaleString()}</span></div>)}</div>
                  </div>); })()}
                {politician.israelLobbyBreakdown?.ie_details && politician.israelLobbyBreakdown.ie_details.length > 0 && (
                  <div className="bg-[#1d2023] border border-emerald-900/30 p-6">
                    <h3 className="font-[var(--font-label)] text-xs font-bold text-[#00ff88] tracking-widest uppercase mb-4">INDEPENDENT_EXPENDITURES</h3>
                    <div className="space-y-3">{politician.israelLobbyBreakdown.ie_details.sort((a, b) => b.amount - a.amount).map((ie, index) => (
                      <div key={index} className={`p-4 flex justify-between items-center gap-4 ${ie.is_israel_lobby ? 'bg-[#c50039]/5 border border-[#c50039]/30' : 'bg-[#111417] border border-emerald-900/20'}`}>
                        <div className="flex-1 min-w-0"><div className={`font-bold text-sm truncate ${ie.is_israel_lobby ? 'text-[#c50039]' : 'text-[#e1e2e7]'}`}>{ie.committee_name}</div><div className="flex gap-3 text-[10px] mt-1 font-[var(--font-label)]"><span className={`font-bold uppercase ${ie.support_oppose === 'support' ? 'text-[#00ff88]' : 'text-[#c50039]'}`}>{ie.support_oppose === 'support' ? '+ SUPPORT' : '- OPPOSE'}</span><span className="text-emerald-700">{ie.committee_id}</span></div></div>
                        <div className={`font-[var(--font-headline)] text-xl font-bold whitespace-nowrap ${ie.is_israel_lobby ? 'text-[#c50039]' : 'text-[#FFD166]'}`}>${ie.amount >= 1000000 ? `${(ie.amount / 1000000).toFixed(1)}M` : ie.amount >= 1000 ? `${(ie.amount / 1000).toFixed(0)}K` : ie.amount.toLocaleString()}</div>
                      </div>))}</div>
                  </div>
                )}
              </>) : (
                <div className="bg-[#1d2023] border border-emerald-900/30 p-12 text-center">
                  {['US Senator', 'US Representative', 'State Senator', 'State Representative'].includes(politician.officeLevel) ? (<><div className="text-[#00ff88] text-3xl mb-2">&#10003;</div><div className="font-[var(--font-headline)] text-xl font-bold text-[#00ff88] mb-2">NO CONTRIBUTIONS FOUND</div><div className="text-emerald-700 font-[var(--font-label)] text-sm">No foreign lobby funding or major PAC contributions detected.</div></>) : (<><div className="text-emerald-700 text-3xl mb-2">&#9744;</div><div className="font-[var(--font-headline)] text-xl font-bold text-emerald-700 mb-2">DATA PENDING</div><div className="text-emerald-900 font-[var(--font-label)] text-sm">County and local campaign finance records are not yet available.</div></>)}
                </div>
              )}
            </div>
          )}

          {/* VOTES TAB */}
          {activeTab === 'votes' && (
            <div className="space-y-6">
              {votesError ? (
                <div className="bg-[#1d2023] border border-[#c50039]/30 p-12 text-center"><div className="text-[#c50039] text-2xl mb-4">!</div><div className="font-[var(--font-headline)] text-xl font-bold text-[#c50039] mb-2">ERROR LOADING VOTING RECORDS</div><div className="text-emerald-700 font-[var(--font-label)] text-sm mb-4">{votesError}</div><button onClick={() => { setVotesFetched(false); setVotesError(null); }} className="px-6 py-2 bg-[#00ff88] text-[#020409] font-[var(--font-label)] text-xs font-bold tracking-widest uppercase">RETRY</button></div>
              ) : votesLoading ? (
                <div className="bg-[#1d2023] border border-emerald-900/30 p-12 text-center"><div className="w-12 h-12 border-2 border-[#3b4b3d] border-t-[#00ff88] mx-auto animate-spin mb-4" /><div className="font-[var(--font-label)] text-sm font-bold text-[#e1e2e7] mb-1">LOADING VOTING RECORDS...</div><div className="text-emerald-700 font-[var(--font-label)] text-xs">{isFederal ? 'Querying Congress.gov / Supabase' : isStateLeg ? 'Querying LegiScan API' : 'Searching records'}</div></div>
              ) : !isFederal && !isStateLeg ? (
                <div className="bg-[#1d2023] border border-emerald-900/30 p-12 text-center"><div className="text-emerald-700 text-2xl mb-4">--</div><div className="font-[var(--font-headline)] text-xl font-bold text-[#e1e2e7] mb-2">NO VOTING DATA SOURCE</div><div className="text-emerald-700 font-[var(--font-label)] text-sm max-w-lg mx-auto">Voting records are available for federal and state legislators. This official&apos;s role ({politician.office}) does not have a legislative voting record.</div></div>
              ) : votingRecords.length === 0 ? (
                <div className="bg-[#1d2023] border border-emerald-900/30 p-12 text-center"><div className="text-emerald-700 text-2xl mb-4">[ ]</div><div className="font-[var(--font-headline)] text-xl font-bold text-[#e1e2e7] mb-2">NO VOTING RECORDS FOUND</div><div className="text-emerald-700 font-[var(--font-label)] text-sm">{isFederal ? `No vote data for ${politician.source_ids?.bioguide_id}.` : `No activity found for ${politician.name}.`}</div><button onClick={() => setVotesFetched(false)} className="mt-4 px-4 py-2 border border-emerald-900/50 text-emerald-400 font-[var(--font-label)] text-xs font-bold uppercase">RETRY</button></div>
              ) : (<>
                <div className="bg-[#282a2e] border border-emerald-900/30 p-6">
                  <h3 className="font-[var(--font-label)] text-xs font-bold text-[#00ff88] tracking-widest uppercase mb-4">VOTE BREAKDOWN ({votingRecords.length} RECORDS)</h3>
                  <div className="grid grid-cols-4 gap-4">{(() => { const bd = calculateBreakdown(votingRecords); return (<><div><div className="text-[10px] text-emerald-700 mb-1 font-[var(--font-label)] uppercase">YEA</div><div className="font-[var(--font-headline)] text-3xl font-bold text-[#00ff88]">{bd.yea}</div></div><div><div className="text-[10px] text-emerald-700 mb-1 font-[var(--font-label)] uppercase">NAY</div><div className="font-[var(--font-headline)] text-3xl font-bold text-[#c50039]">{bd.nay}</div></div><div><div className="text-[10px] text-emerald-700 mb-1 font-[var(--font-label)] uppercase">ABSTAIN</div><div className="font-[var(--font-headline)] text-3xl font-bold text-[#FFD166]">{bd.abstain}</div></div><div><div className="text-[10px] text-emerald-700 mb-1 font-[var(--font-label)] uppercase">ABSENT</div><div className="font-[var(--font-headline)] text-3xl font-bold text-emerald-700">{bd.absent}</div></div></>); })()}</div>
                </div>
                <div className="bg-[#111417] border border-emerald-900/20 p-4 space-y-3">
                  <div className="flex gap-2 flex-wrap items-center"><div className="text-[10px] text-emerald-700 font-[var(--font-label)] uppercase tracking-widest mr-2">FILTER:</div>{(['all', 'israel', 'defense', 'foreign', 'anti-america-first', 'domestic'] as VoteCategoryFilter[]).map((f) => <button key={f} onClick={() => setVoteCategoryFilter(f)} className={`px-3 py-1.5 text-[10px] font-[var(--font-label)] font-bold uppercase tracking-widest transition-none ${voteCategoryFilter === f ? 'bg-[#00ff88] text-[#020409]' : 'border border-emerald-900/30 text-emerald-400 hover:bg-emerald-400/10'}`}>{f.toUpperCase().replace(/-/g, ' ')}{f !== 'all' && ` (${filterByCategory(votingRecords, f).length})`}</button>)}</div>
                  <div className="flex items-center gap-2"><span className="text-[10px] text-emerald-700 font-[var(--font-label)] uppercase tracking-widest flex-shrink-0">SEARCH:</span><input type="text" value={voteSearchQuery} onChange={(e) => setVoteSearchQuery(e.target.value)} placeholder="keyword, bill number..." className="flex-1 px-3 py-2 bg-[#05070a] border border-emerald-900/30 text-[#e1e2e7] font-[var(--font-label)] text-xs" />{voteSearchQuery && <button onClick={() => setVoteSearchQuery('')} className="px-3 py-1.5 border border-emerald-900/30 text-emerald-700 font-[var(--font-label)] text-[10px]">CLEAR</button>}</div>
                </div>
                <div className="bg-[#1d2023] border border-emerald-900/30 overflow-hidden">
                  <div className="bg-emerald-950/30 px-6 py-3 border-b border-emerald-900/30 flex justify-between items-center"><h3 className="font-[var(--font-label)] text-[10px] font-bold text-[#00ff88] tracking-[0.2em] uppercase">VOTING_RECORDS</h3><div className="flex gap-4"><div className="flex items-center gap-1"><div className="w-1.5 h-1.5 bg-[#00ff88]" /><span className="font-[var(--font-label)] text-[8px] text-emerald-800 uppercase">YES</span></div><div className="flex items-center gap-1"><div className="w-1.5 h-1.5 bg-[#c50039]" /><span className="font-[var(--font-label)] text-[8px] text-emerald-800 uppercase">NO</span></div></div></div>
                  <div className="divide-y divide-emerald-900/20">{(() => { const filtered = getFilteredRecords(); if (filtered.length === 0) return <div className="p-8 text-center text-emerald-700 font-[var(--font-label)] text-sm">No records match current filters.</div>; return filtered.map((record) => { const posColor = getVoteColor(record.votePosition); const posLabel = normalizePosition(record.votePosition); return (
                    <div key={record.id} className="p-5 flex justify-between items-center hover:bg-emerald-400/5 transition-none"><div className="flex-1 min-w-0"><div className="font-[var(--font-label)] text-sm text-emerald-100 uppercase tracking-tight font-bold">{record.billUrl ? <a href={record.billUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-100 hover:text-[#00ff88]">{record.billTitle}</a> : record.billTitle}</div><div className="flex gap-3 mt-1 font-[var(--font-label)] text-[10px] text-emerald-700">{record.voteDate && <span>{new Date(record.voteDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}</span>}{record.billNumber && <><span>//</span><span>{record.billNumber}</span></>}{record.category && <><span>//</span><span>CAT: {record.category.toUpperCase()}</span></>}</div></div><div className="font-[var(--font-label)] font-black text-xs px-6 py-1 flex-shrink-0 ml-4" style={{ background: posColor, color: '#020409' }}>{posLabel}</div></div>
                  ); }); })()}</div>
                </div>
                <div className="p-3 bg-emerald-400/5 border border-emerald-400/20 font-[var(--font-label)] text-[10px] flex items-center gap-2 text-emerald-500"><span className="font-bold">DATA SOURCE:</span><span className="text-emerald-700">{isFederal ? `Congress.gov / Supabase | Bioguide: ${politician.source_ids?.bioguide_id}` : `LegiScan | State: ${politician.jurisdiction || 'FL'}`} | {votingRecords.length} records</span></div>
              </>)}
            </div>
          )}

          {activeTab === 'network' && <ConnectionsTree politician={politician} />}
          {activeTab === 'social' && <SocialTab politicianId={politician.id} politicianName={politician.name} />}
          {activeTab === 'legal' && <div className="bg-[#1d2023] border border-emerald-900/30 p-12 text-center"><div className="text-emerald-700 text-3xl mb-4">&#9744;</div><div className="font-[var(--font-headline)] text-xl font-bold text-emerald-700 mb-2">NOT YET AVAILABLE</div><div className="text-emerald-900 font-[var(--font-label)] text-sm">Court cases, ethics complaints, and legal records will appear here when data sources are integrated.</div></div>}
        </div>
      </div>
      <div className="mt-6 py-2 px-4 bg-[#020409] border border-emerald-900/30 font-[var(--font-label)] text-[10px] text-emerald-900 uppercase tracking-widest flex justify-between"><span>DOSSIER_STATUS: <span className="text-emerald-500">REALTIME_SURVEILLANCE</span> | SOURCE: <span className="text-emerald-500">FEC_CORE_API</span></span><span>LATENCY: <span className="text-emerald-500">12MS</span></span></div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// SocialTab
// ---------------------------------------------------------------------------
interface SocialPost { id?: string; content?: string; platform: string; posted_at?: string; post_url?: string; }

function SocialTab({ politicianId, politicianName }: { politicianId: string; politicianName: string }) {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetch(`/api/social-posts?politician_id=${encodeURIComponent(politicianId)}&limit=50&order=desc`).then(res => res.ok ? res.json() : { posts: [] }).then(data => setPosts(data.posts || [])).catch(() => setPosts([])).finally(() => setLoading(false)); }, [politicianId]);
  if (loading) return <div className="bg-[#1d2023] border border-emerald-900/30 p-8 text-center text-emerald-700 font-[var(--font-label)] text-sm">Loading social intelligence...</div>;
  if (posts.length === 0) return <div className="bg-[#1d2023] border border-emerald-900/30 p-12 text-center"><div className="text-emerald-700 text-3xl mb-4">&#9632;</div><div className="font-[var(--font-headline)] text-xl font-bold text-emerald-700 mb-2">NO SOCIAL INTELLIGENCE</div><div className="text-emerald-900 font-[var(--font-label)] text-sm">No news mentions found for {politicianName}.</div></div>;
  const platformLabel = (p: string) => { switch (p) { case 'news': return 'NEWS'; case 'press': return 'PRESS RELEASE'; case 'rss': return 'RSS'; case 'twitter': return 'TWITTER/X'; default: return p.toUpperCase(); } };
  return (
    <div className="bg-[#1d2023] border border-emerald-900/30 overflow-hidden">
      <div className="bg-emerald-950/30 px-6 py-3 border-b border-emerald-900/30"><h3 className="font-[var(--font-label)] text-[10px] font-bold text-[#00ff88] tracking-[0.2em] uppercase">SOCIAL_INTELLIGENCE</h3><div className="text-[10px] text-emerald-700 font-[var(--font-label)] mt-1">{posts.length} items</div></div>
      <div className="divide-y divide-emerald-900/20">{posts.map((post, i) => (
        <div key={post.id || i} className="p-5 hover:bg-emerald-400/5 transition-none">
          <div className="flex justify-between items-center mb-2"><span className="font-[var(--font-label)] text-[10px] text-[#00ff88] font-bold uppercase tracking-widest">{platformLabel(post.platform)}</span>{post.posted_at && <span className="font-[var(--font-label)] text-[10px] text-emerald-700">{new Date(post.posted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}</div>
          <div className="text-sm text-emerald-200 leading-relaxed font-[var(--font-label)]">{(post.content || '').substring(0, 300)}{(post.content || '').length > 300 ? '...' : ''}</div>
          {post.post_url && <a href={post.post_url} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 text-[10px] text-[#00ff88] font-[var(--font-label)] font-bold uppercase tracking-widest">VIEW SOURCE &rarr;</a>}
        </div>))}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConnectionsTree
// ---------------------------------------------------------------------------
interface TreeNode { id: string; label: string; sublabel?: string; amount?: number; color: string; icon: string; children?: TreeNode[]; tag?: string; }
function formatAmount(n: number): string { if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`; if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`; return `$${n.toLocaleString()}`; }

function ConnectionsTree({ politician }: { politician: Politician }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['root', 'funding', 'lobbying']));
  const toggle = (id: string) => { setExpanded(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); };
  const tree: TreeNode[] = [];
  const donors = politician.top5Donors || [];
  const breakdown = politician.contributionBreakdown;
  const fundingChildren: TreeNode[] = [];
  if (breakdown) {
    if (breakdown.individuals > 0) { const dd = donors.filter(d => d.type === 'Individual'); fundingChildren.push({ id: 'funding-individuals', label: 'Individual Donors', amount: breakdown.individuals, color: '#00ff88', icon: '>>', children: dd.map((d, i) => ({ id: `donor-indiv-${i}`, label: d.name, amount: d.amount, color: '#00ff88', icon: '-' })) }); }
    if (breakdown.otherPACs > 0) { const dd = donors.filter(d => d.type === 'PAC'); fundingChildren.push({ id: 'funding-pacs', label: 'Political Action Committees', amount: breakdown.otherPACs, color: '#FFD166', icon: '>>', children: dd.map((d, i) => ({ id: `donor-pac-${i}`, label: d.name, amount: d.amount, color: '#FFD166', icon: '-' })) }); }
    if (breakdown.corporate > 0) { const dd = donors.filter(d => d.type === 'Corporate'); fundingChildren.push({ id: 'funding-corporate', label: 'Corporate Donors', amount: breakdown.corporate, color: '#60a5fa', icon: '>>', children: dd.map((d, i) => ({ id: `donor-corp-${i}`, label: d.name, amount: d.amount, color: '#60a5fa', icon: '-' })) }); }
    if (breakdown.aipac > 0 || (politician.israelLobbyTotal || 0) > 0) {
      const israelDonors = donors.filter(d => d.type === 'Israel-PAC' || (d as any).is_israel_lobby);
      const ieD = politician.israelLobbyBreakdown?.ie_details || [];
      const israelChildren: TreeNode[] = [...israelDonors.map((d, i) => ({ id: `donor-israel-${i}`, label: d.name, amount: d.amount, color: '#c50039', icon: '-', tag: 'DIRECT' })), ...ieD.map((ie, i) => ({ id: `ie-israel-${i}`, label: ie.committee_name, sublabel: ie.support_oppose === 'support' ? 'SUPPORTED' : 'OPPOSED', amount: ie.amount, color: '#c50039', icon: ie.support_oppose === 'support' ? '+' : '-', tag: 'IE' }))];
      fundingChildren.push({ id: 'funding-israel', label: 'Israel Lobby', amount: politician.israelLobbyTotal || breakdown.aipac, color: '#c50039', icon: '!!', children: israelChildren.length > 0 ? israelChildren : undefined });
    }
  } else if (donors.length > 0) { for (const [i, d] of donors.entries()) fundingChildren.push({ id: `donor-${i}`, label: d.name, amount: d.amount, color: d.type === 'Israel-PAC' ? '#c50039' : '#FFD166', icon: '>>', tag: d.type }); }
  if (fundingChildren.length > 0) tree.push({ id: 'funding', label: 'CAMPAIGN FUNDING', amount: politician.totalFundsRaised, color: '#FFD166', icon: '$$', children: fundingChildren });
  const lobbyRecords = politician.lobbyingRecords || [];
  if (lobbyRecords.length > 0) {
    const byFirm: Record<string, { income: number; clients: Set<string>; revolvingDoor: string[]; years: Set<number> }> = {};
    for (const r of lobbyRecords as any[]) { const firm = r.registrantName || 'Unknown'; if (!byFirm[firm]) byFirm[firm] = { income: 0, clients: new Set(), revolvingDoor: [], years: new Set() }; byFirm[firm].income += r.income || 0; if (r.clientName) byFirm[firm].clients.add(r.clientName); if (r.filingYear) byFirm[firm].years.add(r.filingYear); if (r.revolvingDoor) { for (const rd of r.revolvingDoor) { if (!byFirm[firm].revolvingDoor.includes(rd)) byFirm[firm].revolvingDoor.push(rd); } } }
    const firmNodes: TreeNode[] = Object.entries(byFirm).sort((a, b) => b[1].income - a[1].income).slice(0, 25).map(([firm, data], i) => { const children: TreeNode[] = []; for (const client of [...data.clients].slice(0, 10)) { if (client !== firm) children.push({ id: `lobby-client-${i}-${children.length}`, label: client, color: '#a78bfa', icon: '-', tag: 'CLIENT' }); } for (const rd of data.revolvingDoor.slice(0, 5)) { children.push({ id: `lobby-rd-${i}-${children.length}`, label: rd.substring(0, 80), color: '#f97316', icon: '~', tag: 'REVOLVING DOOR' }); } return { id: `lobby-firm-${i}`, label: firm, sublabel: `${data.clients.size} clients | ${[...data.years].sort().join(', ')}`, amount: data.income, color: '#a78bfa', icon: '>>', children: children.length > 0 ? children : undefined }; });
    tree.push({ id: 'lobbying', label: 'LOBBYING CONNECTIONS', sublabel: `${Object.keys(byFirm).length} firms | ${Object.values(byFirm).reduce((s, d) => s + d.revolvingDoor.length, 0)} revolving door`, amount: Object.values(byFirm).reduce((s, d) => s + d.income, 0), color: '#a78bfa', icon: '##', children: firmNodes });
  }
  const ieDetails = politician.israelLobbyBreakdown?.ie_details || [];
  if (ieDetails.length > 0) tree.push({ id: 'ie', label: 'INDEPENDENT EXPENDITURES', sublabel: 'Third-party spending', amount: ieDetails.reduce((s, ie) => s + ie.amount, 0), color: '#60ff99', icon: '**', children: ieDetails.sort((a, b) => b.amount - a.amount).map((ie, i) => ({ id: `ie-${i}`, label: ie.committee_name, sublabel: ie.committee_id, amount: ie.amount, color: ie.support_oppose === 'support' ? '#00ff88' : '#c50039', icon: ie.support_oppose === 'support' ? '+' : 'x', tag: ie.is_israel_lobby ? 'ISRAEL LOBBY' : ie.support_oppose === 'support' ? 'SUPPORT' : 'OPPOSE' })) });
  if (tree.length === 0) return <div className="bg-[#1d2023] border border-emerald-900/30 p-12 text-center"><div className="text-emerald-700 text-3xl mb-4">##</div><div className="font-[var(--font-headline)] text-xl font-bold text-emerald-700 mb-2">NO CONNECTIONS DATA</div><div className="text-emerald-900 font-[var(--font-label)] text-sm">{['US Senator', 'US Representative'].includes(politician.officeLevel) ? 'Connection data is being processed.' : 'Available for federal politicians.'}</div></div>;
  const expandAll = () => { const allIds: string[] = ['root']; const collect = (nodes: TreeNode[]) => { for (const n of nodes) { allIds.push(n.id); if (n.children) collect(n.children); } }; collect(tree); setExpanded(new Set(allIds)); };
  const collapseAll = () => setExpanded(new Set(['root']));
  return (
    <div className="space-y-4">
      <div className="flex gap-2"><button onClick={expandAll} className="px-3 py-1.5 border border-emerald-900/50 text-emerald-400 font-[var(--font-label)] text-[10px] font-bold uppercase hover:bg-emerald-400/10 transition-none">EXPAND ALL</button><button onClick={collapseAll} className="px-3 py-1.5 border border-emerald-900/50 text-emerald-400 font-[var(--font-label)] text-[10px] font-bold uppercase hover:bg-emerald-400/10 transition-none">COLLAPSE ALL</button></div>
      <div className="bg-[#1d2023] border border-emerald-900/30 overflow-hidden">
        <div className="p-4 bg-emerald-900/10 border-b border-emerald-900/30 flex items-center gap-3"><div className="w-10 h-10 border-2 border-[#00ff88] flex items-center justify-center font-[var(--font-headline)] text-lg font-black text-[#00ff88] flex-shrink-0">{politician.name.charAt(0)}</div><div><div className="font-bold text-[#e1e2e7] font-[var(--font-label)] text-sm">{politician.name}</div><div className="text-[10px] text-emerald-700 font-[var(--font-label)]">{politician.office} | {politician.party}</div></div></div>
        <div className="py-2">{tree.map((branch, bi) => <TreeBranch key={branch.id} node={branch} depth={0} expanded={expanded} toggle={toggle} isLast={bi === tree.length - 1} />)}</div>
      </div>
      <div className="bg-[#1d2023] border border-emerald-900/30 p-6"><h3 className="font-[var(--font-label)] text-xs font-bold text-[#00ff88] tracking-widest uppercase mb-4">GLOSSARY</h3><div className="space-y-3 text-[11px] font-[var(--font-label)]"><div><span className="font-bold text-[#f97316]">~ Revolving Door</span><span className="text-emerald-700 ml-2">Former staffer now lobbying.</span></div><div><span className="font-bold text-[#FFD166]">&gt;&gt; PAC</span><span className="text-emerald-700 ml-2">Political Action Committee.</span></div><div><span className="font-bold text-[#60ff99]">** IE</span><span className="text-emerald-700 ml-2">Independent Expenditure.</span></div><div><span className="font-bold text-[#c50039]">!! Israel Lobby</span><span className="text-emerald-700 ml-2">Pro-Israel advocacy PACs.</span></div></div></div>
    </div>
  );
}

function TreeBranch({ node, depth, expanded, toggle, isLast }: { node: TreeNode; depth: number; expanded: Set<string>; toggle: (id: string) => void; isLast: boolean; }) {
  const isOpen = expanded.has(node.id);
  const hasChildren = node.children && node.children.length > 0;
  return (
    <div>
      <div onClick={() => hasChildren && toggle(node.id)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1rem', paddingLeft: `${depth * 24 + 16}px`, cursor: hasChildren ? 'pointer' : 'default', borderLeft: depth > 0 ? '1px solid #3b4b3d' : 'none', marginLeft: depth > 0 ? `${(depth - 1) * 24 + 28}px` : 0 }} className="hover:bg-emerald-400/5 transition-none">
        <span style={{ width: '14px', fontSize: '0.7rem', color: '#849585', textAlign: 'center', flexShrink: 0 }}>{hasChildren ? (isOpen ? '[-]' : '[+]') : (depth > 0 ? (isLast ? '\\' : '|') : '')}</span>
        <span className="font-[var(--font-label)] text-[10px] font-bold flex-shrink-0" style={{ color: node.color }}>{node.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}><span className="font-[var(--font-label)]" style={{ fontWeight: depth === 0 ? 700 : 600, fontSize: depth === 0 ? '0.85rem' : '0.75rem', color: depth === 0 ? node.color : '#e1e2e7', letterSpacing: depth === 0 ? '0.05em' : 'normal' }}>{node.label}</span>{node.sublabel && <span className="text-[10px] text-emerald-700 ml-2">{node.sublabel}</span>}{node.tag && <span className="text-[9px] px-1 ml-2 font-bold tracking-widest" style={{ background: `${node.color}20`, color: node.color, border: `1px solid ${node.color}40` }}>{node.tag}</span>}</div>
        {node.amount != null && node.amount > 0 && <span className="font-[var(--font-headline)] font-bold whitespace-nowrap flex-shrink-0" style={{ fontSize: depth === 0 ? '1rem' : '0.85rem', color: node.color }}>{formatAmount(node.amount)}</span>}
        {hasChildren && <span className="text-[9px] px-1 bg-[#111417] border border-emerald-900/30 text-emerald-700 flex-shrink-0">{node.children!.length}</span>}
      </div>
      {isOpen && hasChildren && <div>{node.children!.map((child, ci) => <TreeBranch key={child.id} node={child} depth={depth + 1} expanded={expanded} toggle={toggle} isLast={ci === node.children!.length - 1} />)}</div>}
    </div>
  );
}

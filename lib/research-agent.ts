/**
 * Deep Research Agent — Inspired by AFUnitedAI
 *
 * Performs multi-source investigation on a politician/candidate:
 *   1. FINANCIALS — FEC API contributions, donors, PAC breakdown
 *   2. COURT RECORDS — CourtListener dockets + opinions
 *   3. LOBBYING — Senate LDA filings (already in DB or fetched via /api/lobbying)
 *   4. WEB INTEL — Exa web search for news, scandals, connections
 *   5. SOCIAL MEDIA — Existing posts from social_posts table
 *   6. VOTING RECORDS — From DB (synced by other crons)
 *
 * Returns structured investigation report with evidence chains.
 */

import { searchCourtRecords, type CourtRecord } from './courtlistener-client';

const FEC_API_KEY = process.env.FEC_API_KEY || '';
const FEC_BASE = 'https://api.open.fec.gov/v1';
const EXA_API_KEY = process.env.EXA_API_KEY || '';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// FEC Client
// ---------------------------------------------------------------------------

async function fecFetch(path: string, params: Record<string, string | number> = {}): Promise<unknown> {
  if (!FEC_API_KEY) return null;
  const url = new URL(`${FEC_BASE}${path}`);
  url.searchParams.set('api_key', FEC_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString());
  if (res.status === 429) throw new Error('FEC rate limit');
  if (!res.ok) return null;
  return res.json();
}

// ---------------------------------------------------------------------------
// Exa Web Search
// ---------------------------------------------------------------------------

interface ExaResult {
  title: string;
  url: string;
  publishedDate?: string;
  text?: string;
  highlights?: string[];
}

async function exaSearch(query: string, numResults = 10): Promise<ExaResult[]> {
  if (!EXA_API_KEY) return [];
  try {
    const res = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': EXA_API_KEY },
      body: JSON.stringify({
        query,
        numResults,
        type: 'auto',
        useAutoprompt: true,
        contents: { text: { maxCharacters: 500 }, highlights: { numSentences: 2 } },
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map((r: Record<string, unknown>) => ({
      title: r.title || '',
      url: r.url || '',
      publishedDate: r.publishedDate || null,
      text: r.text || '',
      highlights: r.highlights || [],
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Investigation Report Types
// ---------------------------------------------------------------------------

export interface InvestigationReport {
  politician: {
    name: string;
    office: string;
    party: string;
    bioguideId: string;
  };
  financials: {
    fecId: string | null;
    totalFunds: number;
    top5Donors: Array<{ name: string; amount: number; type: string; is_israel_lobby: boolean }>;
    contributionBreakdown: { aipac: number; otherPACs: number; individuals: number; corporate: number } | null;
    grassrootsRatio: number; // % of individual small-dollar donations
    foreignInfluenceFlag: boolean;
  };
  courtRecords: CourtRecord[];
  lobbying: {
    totalFilings: number;
    totalIncome: number;
    topFirms: Array<{ name: string; income: number; clients: number }>;
    revolvingDoorCount: number;
  };
  webIntel: {
    newsArticles: ExaResult[];
    scandalFlags: string[];
    keyFindings: string[];
  };
  socialMedia: {
    postCount: number;
    platforms: string[];
    handles: Record<string, string>;
  };
  votingRecord: {
    totalVotes: number;
    yeaCount: number;
    nayCount: number;
    absentCount: number;
  };
  log: string[];
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Deep Research Function
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deepResearch(
  pol: Record<string, unknown>,
  supabase: any,
): Promise<InvestigationReport> {
  const log: string[] = [];
  const name = pol.name as string;
  const bioguideId = pol.bioguide_id as string;

  log.push(`=== DEEP RESEARCH: ${name} ===`);
  log.push(`Office: ${pol.office} | Party: ${pol.party}`);
  log.push(`Started: ${new Date().toISOString()}`);

  // ===== 1. FINANCIALS =====
  log.push('\n--- PILLAR 1: FINANCIALS ---');
  let fecId = (pol.source_ids as Record<string, string>)?.fec_candidate_id || null;
  let totalFunds = Number(pol.total_funds) || 0;
  let top5Donors = (pol.top5_donors || []) as Array<{ name: string; amount: number; type: string; is_israel_lobby: boolean }>;
  let contributionBreakdown = (pol.contribution_breakdown || null) as InvestigationReport['financials']['contributionBreakdown'];
  let grassrootsRatio = 0;
  let foreignInfluenceFlag = false;

  if (FEC_API_KEY) {
    // Lookup FEC ID if missing
    if (!fecId) {
      log.push('[FEC] Looking up candidate ID...');
      const data = await fecFetch('/candidates/search/', { q: name, state: 'FL', per_page: 5 }) as {
        results?: Array<{ candidate_id: string; name: string }>;
      } | null;
      fecId = data?.results?.[0]?.candidate_id || null;
      log.push(fecId ? `[FEC] Found: ${fecId}` : '[FEC] No match');
      await sleep(500);
    }

    if (fecId) {
      // Totals
      log.push(`[FEC] Fetching totals for ${fecId}...`);
      const totalsData = await fecFetch(`/candidate/${fecId}/totals/`, { per_page: 1, cycle: 2026 }) as {
        results?: Array<{ receipts: number; individual_contributions: number; other_political_committee_contributions: number; individual_unitemized_contributions: number }>;
      } | null;
      const t = totalsData?.results?.[0];
      if (t) {
        totalFunds = t.receipts || 0;
        const indivSmall = t.individual_unitemized_contributions || 0;
        grassrootsRatio = totalFunds > 0 ? Math.round((indivSmall / totalFunds) * 100) : 0;
        contributionBreakdown = {
          individuals: t.individual_contributions || 0,
          otherPACs: t.other_political_committee_contributions || 0,
          corporate: Math.max(0, (t.receipts || 0) - (t.individual_contributions || 0) - (t.other_political_committee_contributions || 0)),
          aipac: Number(pol.aipac_funding) || 0,
        };
        log.push(`[FEC] Total: $${(totalFunds / 1000).toFixed(0)}K | Grassroots: ${grassrootsRatio}%`);
      }
      await sleep(500);

      // Top donors
      log.push('[FEC] Fetching top donors...');
      const donorData = await fecFetch('/schedules/schedule_a/', {
        candidate_id: fecId, per_page: 15, sort: '-contribution_receipt_amount', two_year_transaction_period: 2026,
      }) as { results?: Array<{ contributor_name: string; contribution_receipt_amount: number; entity_type: string }> } | null;
      if (donorData?.results?.length) {
        top5Donors = donorData.results.slice(0, 5).map(d => ({
          name: d.contributor_name, amount: d.contribution_receipt_amount,
          type: d.entity_type === 'IND' ? 'Individual' : d.entity_type === 'COM' ? 'PAC' : 'Corporate',
          is_israel_lobby: false,
        }));
        log.push(`[FEC] Top donors: ${top5Donors.length}`);
      }
      await sleep(500);

      // Independent expenditures
      log.push('[FEC] Checking independent expenditures...');
      const ieData = await fecFetch('/schedules/schedule_e/', {
        candidate_id: fecId, per_page: 10, sort: '-expenditure_amount', cycle: 2026,
      }) as { results?: Array<{ committee_name: string; expenditure_amount: number; support_oppose_indicator: string }> } | null;
      if (ieData?.results?.length) {
        const ieTotal = ieData.results.reduce((s, r) => s + (r.expenditure_amount || 0), 0);
        log.push(`[FEC] IE spending: $${(ieTotal / 1000).toFixed(0)}K from ${ieData.results.length} committees`);
      }
    }
  } else {
    log.push('[FEC] No API key — using cached data');
  }

  foreignInfluenceFlag = (Number(pol.aipac_funding) || 0) > 0 || (Number(pol.israel_lobby_total) || 0) > 0;
  if (foreignInfluenceFlag) log.push('[FLAG] Foreign influence detected: Israel lobby funding');

  // ===== 2. COURT RECORDS =====
  log.push('\n--- PILLAR 2: COURT RECORDS ---');
  let courtRecords: CourtRecord[] = [];
  const existingCourt = pol.court_records as unknown[] | null;
  if (existingCourt && existingCourt.length > 0) {
    log.push(`[COURT] Using ${existingCourt.length} cached records`);
    courtRecords = existingCourt as unknown as CourtRecord[];
  } else {
    log.push('[COURT] Searching CourtListener...');
    try {
      courtRecords = await searchCourtRecords(name, log);
      await sleep(300);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Rate limited') || msg.includes('429')) {
        log.push('[COURT] Rate limited — skipping (will be filled by court records cron)');
      } else {
        log.push(`[COURT] Error: ${msg}`);
      }
    }
  }

  // ===== 3. LOBBYING =====
  log.push('\n--- PILLAR 3: LOBBYING ---');
  const lobbyRecords = (pol.lobbying_records || []) as Array<Record<string, unknown>>;
  const byFirm: Record<string, { income: number; clients: Set<string>; revolvingDoor: number }> = {};
  for (const r of lobbyRecords) {
    const firm = (r.registrantName as string) || 'Unknown';
    if (!byFirm[firm]) byFirm[firm] = { income: 0, clients: new Set(), revolvingDoor: 0 };
    byFirm[firm].income += (r.income as number) || 0;
    if (r.clientName) byFirm[firm].clients.add(r.clientName as string);
    if (r.revolvingDoor) byFirm[firm].revolvingDoor += (r.revolvingDoor as string[]).length;
  }
  const topFirms = Object.entries(byFirm)
    .sort((a, b) => b[1].income - a[1].income)
    .slice(0, 10)
    .map(([name, d]) => ({ name, income: d.income, clients: d.clients.size }));
  const totalLobbyIncome = Object.values(byFirm).reduce((s, d) => s + d.income, 0);
  const revolvingDoorCount = Object.values(byFirm).reduce((s, d) => s + d.revolvingDoor, 0);
  log.push(`[LOBBY] ${lobbyRecords.length} filings | ${topFirms.length} firms | $${(totalLobbyIncome / 1000).toFixed(0)}K total`);
  if (revolvingDoorCount > 0) log.push(`[FLAG] ${revolvingDoorCount} revolving door connections`);

  // ===== 4. WEB INTEL (Exa) =====
  log.push('\n--- PILLAR 4: WEB INTELLIGENCE ---');
  let newsArticles: ExaResult[] = [];
  const scandalFlags: string[] = [];
  const keyFindings: string[] = [];

  if (EXA_API_KEY) {
    // Search for news, scandals, connections
    log.push('[EXA] Searching for news and investigations...');
    newsArticles = await exaSearch(`${name} Florida politician investigation scandal corruption`, 8);
    log.push(`[EXA] Found ${newsArticles.length} articles`);
    await sleep(300);

    // Search for financial connections
    const finArticles = await exaSearch(`${name} campaign finance PAC donor lobbying`, 5);
    log.push(`[EXA] Found ${finArticles.length} finance articles`);
    newsArticles = [...newsArticles, ...finArticles];
    await sleep(300);

    // Extract scandal flags from article titles
    const scandalKeywords = ['indicted', 'arrested', 'fraud', 'corruption', 'ethics', 'investigation', 'scandal', 'lawsuit', 'charged', 'convicted'];
    for (const article of newsArticles) {
      const titleLower = (article.title || '').toLowerCase();
      for (const kw of scandalKeywords) {
        if (titleLower.includes(kw) && titleLower.includes(name.split(' ').pop()!.toLowerCase())) {
          scandalFlags.push(`${kw.toUpperCase()}: ${article.title}`);
          break;
        }
      }
    }
    if (scandalFlags.length > 0) log.push(`[FLAG] ${scandalFlags.length} scandal indicators found`);

    // Key findings from highlights
    for (const article of newsArticles.slice(0, 5)) {
      if (article.highlights?.length) {
        keyFindings.push(...article.highlights.slice(0, 1));
      }
    }
  } else {
    log.push('[EXA] No API key — skipping web search');
    log.push('[TIP] Add EXA_API_KEY to enable web intelligence (exa.ai)');
  }

  // ===== 5. SOCIAL MEDIA =====
  log.push('\n--- PILLAR 5: SOCIAL MEDIA ---');
  const socialMedia = (pol.social_media || {}) as Record<string, string>;
  const handles: Record<string, string> = {};
  if (socialMedia.twitterHandle) handles.twitter = `@${socialMedia.twitterHandle}`;
  if (socialMedia.instagramHandle) handles.instagram = `@${socialMedia.instagramHandle}`;
  if (socialMedia.facebookPageUrl) handles.facebook = socialMedia.facebookPageUrl;

  let postCount = 0;
  const platforms: string[] = [];
  try {
    const { data: posts, count } = await supabase
      .from('social_posts')
      .select('platform', { count: 'exact' })
      .eq('politician_id', bioguideId)
      .order('posted_at', { ascending: false })
      .limit(100);
    postCount = count || (posts as unknown[])?.length || 0;
    const uniquePlatforms = new Set((posts as Array<{ platform: string }> || []).map(p => p.platform));
    platforms.push(...uniquePlatforms);
  } catch {
    log.push('[SOCIAL] Could not fetch posts');
  }
  log.push(`[SOCIAL] ${postCount} posts across ${platforms.length} platforms`);
  log.push(`[SOCIAL] Handles: ${Object.entries(handles).map(([k, v]) => `${k}: ${v}`).join(', ') || 'none'}`);

  // ===== 6. VOTING RECORDS =====
  log.push('\n--- PILLAR 6: VOTING RECORDS ---');
  const votingRecords = (pol.voting_records || []) as Array<Record<string, unknown>>;
  let yeaCount = 0, nayCount = 0, absentCount = 0;
  for (const v of votingRecords) {
    const pos = ((v.votePosition || v.vote_position || '') as string).toLowerCase();
    if (pos.includes('yea') || pos.includes('yes')) yeaCount++;
    else if (pos.includes('nay') || pos.includes('no')) nayCount++;
    else absentCount++;
  }
  log.push(`[VOTES] ${votingRecords.length} total | Yea: ${yeaCount} | Nay: ${nayCount} | Absent: ${absentCount}`);

  // ===== SUMMARY =====
  log.push('\n=== INVESTIGATION SUMMARY ===');
  log.push(`Total funds: $${(totalFunds / 1000).toFixed(0)}K`);
  log.push(`Grassroots ratio: ${grassrootsRatio}%`);
  log.push(`Foreign influence: ${foreignInfluenceFlag ? 'YES' : 'NONE DETECTED'}`);
  log.push(`Court records: ${courtRecords.length}`);
  log.push(`Lobbying filings: ${lobbyRecords.length} | Revolving door: ${revolvingDoorCount}`);
  log.push(`News articles: ${newsArticles.length} | Scandal flags: ${scandalFlags.length}`);
  log.push(`Social posts: ${postCount}`);
  log.push(`Voting records: ${votingRecords.length}`);
  log.push(`Completed: ${new Date().toISOString()}`);

  return {
    politician: { name, office: pol.office as string, party: pol.party as string, bioguideId },
    financials: { fecId, totalFunds, top5Donors, contributionBreakdown, grassrootsRatio, foreignInfluenceFlag },
    courtRecords,
    lobbying: { totalFilings: lobbyRecords.length, totalIncome: totalLobbyIncome, topFirms, revolvingDoorCount },
    webIntel: { newsArticles, scandalFlags, keyFindings },
    socialMedia: { postCount, platforms, handles },
    votingRecord: { totalVotes: votingRecords.length, yeaCount, nayCount, absentCount },
    log,
    timestamp: new Date().toISOString(),
  };
}

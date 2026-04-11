import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleSupabase } from '@/lib/supabase-server';
import { getStateFromId } from '@/lib/state-utils';

/**
 * GET /api/investigate?tool=cross-state|ownership|voting-patterns|timeline
 *
 * Deep investigation tools — heavy server-side analysis.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PAGE = 1000;

async function fetchAllPoliticians(client: ReturnType<typeof getServiceRoleSupabase>, cols: string) {
  const rows: Record<string, unknown>[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await client!
      .from('politicians')
      .select(cols)
      .range(offset, offset + PAGE - 1);
    if (error || !data || data.length === 0) break;
    rows.push(...(data as unknown as Record<string, unknown>[]));
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return rows;
}

// ── Tool 1: Cross-State Connections ──────────────────────────────────────

async function crossStateConnections(client: NonNullable<ReturnType<typeof getServiceRoleSupabase>>) {
  const rows = await fetchAllPoliticians(client, 'bioguide_id, name, party, office, top5_donors, israel_lobby_breakdown');

  // Build donor → politician map
  const donorMap = new Map<string, { name: string; politicians: { id: string; name: string; state: string; party: string; office: string; amount: number }[] ; totalAmount: number }>();

  for (const row of rows) {
    const donors = (row.top5_donors || []) as { name: string; amount: number; type: string }[];
    const state = getStateFromId(row.bioguide_id as string);

    for (const d of donors) {
      if (!d.name) continue;
      const key = d.name.toUpperCase().trim();
      if (!donorMap.has(key)) {
        donorMap.set(key, { name: d.name, politicians: [], totalAmount: 0 });
      }
      const entry = donorMap.get(key)!;
      entry.politicians.push({
        id: row.bioguide_id as string,
        name: row.name as string,
        state,
        party: row.party as string,
        office: row.office as string,
        amount: d.amount || 0,
      });
      entry.totalAmount += d.amount || 0;
    }

    // Also check israel lobby breakdown for IE committees
    const ilb = row.israel_lobby_breakdown as Record<string, unknown> | null;
    if (ilb?.ie_details) {
      for (const ie of ilb.ie_details as { committee_name: string; amount: number }[]) {
        if (!ie.committee_name) continue;
        const key = ie.committee_name.toUpperCase().trim();
        if (!donorMap.has(key)) {
          donorMap.set(key, { name: ie.committee_name, politicians: [], totalAmount: 0 });
        }
        const entry = donorMap.get(key)!;
        // Avoid duplicates
        if (!entry.politicians.some(p => p.id === row.bioguide_id)) {
          entry.politicians.push({
            id: row.bioguide_id as string,
            name: row.name as string,
            state,
            party: row.party as string,
            office: row.office as string,
            amount: ie.amount || 0,
          });
          entry.totalAmount += ie.amount || 0;
        }
      }
    }
  }

  // Filter to donors who fund politicians in 2+ different states
  const crossState = Array.from(donorMap.values())
    .filter(d => {
      const states = new Set(d.politicians.map(p => p.state));
      return states.size >= 2;
    })
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 50)
    .map(d => ({
      donor: d.name,
      totalAmount: d.totalAmount,
      stateCount: new Set(d.politicians.map(p => p.state)).size,
      politicianCount: d.politicians.length,
      states: Array.from(new Set(d.politicians.map(p => p.state))),
      politicians: d.politicians.sort((a, b) => b.amount - a.amount),
    }));

  return { crossStateConnections: crossState, totalDonorsAnalyzed: donorMap.size };
}

// ── Tool 2: Corporate Ownership Tracing ──────────────────────────────────

async function ownershipTracing(client: NonNullable<ReturnType<typeof getServiceRoleSupabase>>) {
  const rows = await fetchAllPoliticians(client, 'bioguide_id, name, party, office, top5_donors, lobbying_records, israel_lobby_breakdown');

  // Build chains: PAC/Donor → Lobbyist Firm → Client → Politician
  const chains: {
    pac: string;
    firm: string;
    clients: string[];
    politicians: { id: string; name: string; state: string; party: string; pacAmount: number; lobbyIncome: number }[];
    totalFlow: number;
  }[] = [];

  // Map lobbyist firms to politicians and their clients
  const firmMap = new Map<string, {
    firm: string;
    clients: Set<string>;
    politicians: Map<string, { id: string; name: string; state: string; party: string; income: number }>;
    totalIncome: number;
  }>();

  // Map PAC donors to politicians
  const pacToPols = new Map<string, { id: string; name: string; state: string; party: string; amount: number }[]>();

  for (const row of rows) {
    const state = getStateFromId(row.bioguide_id as string);
    const donors = (row.top5_donors || []) as { name: string; amount: number; type: string }[];
    const lobby = (row.lobbying_records || []) as { registrantName?: string; clientName?: string; income?: number }[];

    // Track PAC donors
    for (const d of donors) {
      if (!d.name || d.type === 'Individual') continue;
      const key = d.name.toUpperCase().trim();
      if (!pacToPols.has(key)) pacToPols.set(key, []);
      pacToPols.get(key)!.push({
        id: row.bioguide_id as string,
        name: row.name as string,
        state, party: row.party as string,
        amount: d.amount || 0,
      });
    }

    // Track lobbying firms
    for (const l of lobby) {
      if (!l.registrantName) continue;
      const firmKey = l.registrantName.toUpperCase().trim();
      if (!firmMap.has(firmKey)) {
        firmMap.set(firmKey, { firm: l.registrantName, clients: new Set(), politicians: new Map(), totalIncome: 0 });
      }
      const entry = firmMap.get(firmKey)!;
      if (l.clientName) entry.clients.add(l.clientName);
      entry.totalIncome += l.income || 0;
      if (!entry.politicians.has(row.bioguide_id as string)) {
        entry.politicians.set(row.bioguide_id as string, {
          id: row.bioguide_id as string,
          name: row.name as string,
          state, party: row.party as string,
          income: l.income || 0,
        });
      }
    }
  }

  // Find PAC → Firm connections (PAC name appears in firm's clients)
  for (const [firmKey, firmData] of firmMap) {
    for (const [pacKey, pacPols] of pacToPols) {
      // Check if PAC name appears as a client of this firm
      const clientMatch = Array.from(firmData.clients).find(c =>
        c.toUpperCase().includes(pacKey.slice(0, 15)) || pacKey.includes(c.toUpperCase().slice(0, 15))
      );

      if (clientMatch || firmKey.includes(pacKey.slice(0, 15)) || pacKey.includes(firmKey.slice(0, 15))) {
        const polsFromBoth = new Map<string, { id: string; name: string; state: string; party: string; pacAmount: number; lobbyIncome: number }>();

        for (const p of pacPols) {
          polsFromBoth.set(p.id, { ...p, pacAmount: p.amount, lobbyIncome: 0 });
        }
        for (const [pid, p] of firmData.politicians) {
          if (polsFromBoth.has(pid)) {
            polsFromBoth.get(pid)!.lobbyIncome = p.income;
          } else {
            polsFromBoth.set(pid, { id: p.id, name: p.name, state: p.state, party: p.party, pacAmount: 0, lobbyIncome: p.income });
          }
        }

        if (polsFromBoth.size >= 2) {
          chains.push({
            pac: pacPols[0] ? pacKey : 'Unknown PAC',
            firm: firmData.firm,
            clients: Array.from(firmData.clients).slice(0, 5),
            politicians: Array.from(polsFromBoth.values()),
            totalFlow: pacPols.reduce((s, p) => s + p.amount, 0) + firmData.totalIncome,
          });
        }
      }
    }
  }

  // Also build standalone lobbying chains
  const lobbyChains = Array.from(firmMap.values())
    .filter(f => f.politicians.size >= 2)
    .sort((a, b) => b.totalIncome - a.totalIncome)
    .slice(0, 30)
    .map(f => ({
      firm: f.firm,
      clients: Array.from(f.clients).slice(0, 10),
      politicians: Array.from(f.politicians.values()),
      totalIncome: f.totalIncome,
    }));

  return {
    pacToLobbyChains: chains.sort((a, b) => b.totalFlow - a.totalFlow).slice(0, 20),
    lobbyingChains: lobbyChains,
  };
}

// ── Tool 3: Voting Pattern Analysis ──────────────────────────────────────

async function votingPatterns(client: NonNullable<ReturnType<typeof getServiceRoleSupabase>>) {
  const rows = await fetchAllPoliticians(client, 'bioguide_id, name, party, office, voting_records, top5_donors');

  // Filter to politicians with voting records
  const withVotes = rows.filter(r => {
    const vr = r.voting_records as unknown[] | null;
    return vr && vr.length > 0;
  });

  interface VoteRecord { bill_number: string; vote: string }

  // Build vote maps
  const voteMaps = new Map<string, { pol: Record<string, unknown>; votes: Map<string, string> }>();
  for (const row of withVotes) {
    const votes = (row.voting_records as VoteRecord[]) || [];
    const voteMap = new Map<string, string>();
    for (const v of votes) {
      if (v.bill_number) voteMap.set(v.bill_number, v.vote);
    }
    if (voteMap.size > 0) {
      voteMaps.set(row.bioguide_id as string, { pol: row, votes: voteMap });
    }
  }

  // Compare all pairs
  const pairs: {
    pol1: { id: string; name: string; party: string; state: string };
    pol2: { id: string; name: string; party: string; state: string };
    agreement: number;
    sharedVotes: number;
    sharedDonors: { name: string; amount1: number; amount2: number }[];
    crossParty: boolean;
  }[] = [];

  const ids = Array.from(voteMaps.keys());
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = voteMaps.get(ids[i])!;
      const b = voteMaps.get(ids[j])!;

      // Find shared bills
      let agree = 0;
      let total = 0;
      for (const [bill, voteA] of a.votes) {
        const voteB = b.votes.get(bill);
        if (voteB) {
          total++;
          if (voteA === voteB) agree++;
        }
      }

      if (total < 3) continue; // Need at least 3 shared votes
      const agreement = Math.round((agree / total) * 100);
      if (agreement < 70) continue; // Only show 70%+ agreement

      // Check for shared donors
      const donorsA = (a.pol.top5_donors || []) as { name: string; amount: number }[];
      const donorsB = (b.pol.top5_donors || []) as { name: string; amount: number }[];
      const donorMapA = new Map(donorsA.map(d => [d.name.toUpperCase().trim(), d]));
      const sharedDonors: { name: string; amount1: number; amount2: number }[] = [];

      for (const d of donorsB) {
        const key = d.name.toUpperCase().trim();
        const match = donorMapA.get(key);
        if (match) {
          sharedDonors.push({ name: d.name, amount1: match.amount, amount2: d.amount });
        }
      }

      const stateA = getStateFromId(ids[i]);
      const stateB = getStateFromId(ids[j]);

      pairs.push({
        pol1: { id: ids[i], name: a.pol.name as string, party: a.pol.party as string, state: stateA },
        pol2: { id: ids[j], name: b.pol.name as string, party: b.pol.party as string, state: stateB },
        agreement,
        sharedVotes: total,
        sharedDonors,
        crossParty: a.pol.party !== b.pol.party,
      });
    }
  }

  // Sort: cross-party with shared donors first, then by agreement
  pairs.sort((a, b) => {
    if (a.crossParty && a.sharedDonors.length > 0 && !(b.crossParty && b.sharedDonors.length > 0)) return -1;
    if (b.crossParty && b.sharedDonors.length > 0 && !(a.crossParty && a.sharedDonors.length > 0)) return 1;
    if (a.sharedDonors.length !== b.sharedDonors.length) return b.sharedDonors.length - a.sharedDonors.length;
    return b.agreement - a.agreement;
  });

  return {
    votingPairs: pairs.slice(0, 50),
    totalAnalyzed: withVotes.length,
    totalPairs: pairs.length,
  };
}

// ── Tool 4: Timeline (Donation → Vote Correlation) ──────────────────────

async function timeline(client: NonNullable<ReturnType<typeof getServiceRoleSupabase>>, politicianId: string) {
  const { data: row } = await client
    .from('politicians')
    .select('bioguide_id, name, party, office, top5_donors, voting_records, lobbying_records, israel_lobby_breakdown, contribution_breakdown, total_funds')
    .eq('bioguide_id', politicianId)
    .single();

  if (!row) return { error: 'Politician not found' };

  // Build timeline events
  const events: {
    date: string;
    type: 'donation' | 'vote' | 'lobby' | 'ie';
    title: string;
    amount?: number;
    details: string;
    party?: string;
    direction?: 'in' | 'out';
  }[] = [];

  // Voting records
  const votes = (row.voting_records || []) as { vote_date?: string; bill_number?: string; title?: string; vote?: string; description?: string }[];
  for (const v of votes) {
    if (v.vote_date) {
      events.push({
        date: v.vote_date,
        type: 'vote',
        title: v.bill_number || 'Vote',
        details: `${v.title || v.description || 'Unknown bill'} — voted ${v.vote}`,
        direction: 'out',
      });
    }
  }

  // Israel lobby breakdown (IE with dates)
  const ilb = row.israel_lobby_breakdown as Record<string, unknown> | null;
  if (ilb?.ie_details) {
    for (const ie of ilb.ie_details as { committee_name?: string; amount?: number; date?: string }[]) {
      events.push({
        date: ie.date || '2024-01-01',
        type: 'ie',
        title: ie.committee_name || 'Israel Lobby IE',
        amount: ie.amount,
        details: `Independent expenditure: $${((ie.amount || 0) / 1000).toFixed(0)}K`,
        direction: 'in',
      });
    }
  }

  // Top donors as events (approximate dates from cycles)
  const donors = (row.top5_donors || []) as { name: string; amount: number; type: string }[];
  for (const d of donors) {
    events.push({
      date: '2024-06-01', // Approximate — cycle midpoint
      type: 'donation',
      title: d.name,
      amount: d.amount,
      details: `${d.type} contribution: $${d.amount >= 1e6 ? (d.amount / 1e6).toFixed(1) + 'M' : (d.amount / 1e3).toFixed(0) + 'K'}`,
      direction: 'in',
    });
  }

  // Lobbying events
  const lobby = (row.lobbying_records || []) as { registrantName?: string; clientName?: string; income?: number; filingDate?: string }[];
  for (const l of lobby) {
    events.push({
      date: l.filingDate || '2024-01-01',
      type: 'lobby',
      title: l.registrantName || 'Lobbyist',
      amount: l.income,
      details: `Lobbying by ${l.registrantName} for ${l.clientName || 'unknown client'}`,
      direction: 'in',
    });
  }

  // Sort by date
  events.sort((a, b) => a.date.localeCompare(b.date));

  // Find suspicious patterns: donations close to votes
  const suspicious: { donation: typeof events[0]; vote: typeof events[0]; daysBetween: number }[] = [];
  const donationEvents = events.filter(e => e.type === 'donation' || e.type === 'ie');
  const voteEvents = events.filter(e => e.type === 'vote');

  for (const don of donationEvents) {
    for (const vote of voteEvents) {
      const dDate = new Date(don.date).getTime();
      const vDate = new Date(vote.date).getTime();
      const daysDiff = Math.abs(vDate - dDate) / (1000 * 60 * 60 * 24);
      if (daysDiff <= 30 && daysDiff > 0) {
        suspicious.push({ donation: don, vote, daysBetween: Math.round(daysDiff) });
      }
    }
  }

  suspicious.sort((a, b) => a.daysBetween - b.daysBetween);

  return {
    politician: { id: row.bioguide_id, name: row.name, party: row.party, office: row.office, totalFunds: row.total_funds },
    events,
    suspicious: suspicious.slice(0, 20),
    totalEvents: events.length,
  };
}

// ── Router ───────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const client = getServiceRoleSupabase();
  if (!client) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const tool = request.nextUrl.searchParams.get('tool');
  const politicianId = request.nextUrl.searchParams.get('id') || '';

  try {
    switch (tool) {
      case 'cross-state':
        return NextResponse.json(await crossStateConnections(client));
      case 'ownership':
        return NextResponse.json(await ownershipTracing(client));
      case 'voting-patterns':
        return NextResponse.json(await votingPatterns(client));
      case 'timeline':
        if (!politicianId) return NextResponse.json({ error: 'id parameter required' }, { status: 400 });
        return NextResponse.json(await timeline(client, politicianId));
      default:
        return NextResponse.json({ error: 'Invalid tool. Use: cross-state, ownership, voting-patterns, timeline' }, { status: 400 });
    }
  } catch (error) {
    console.error('Investigate API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

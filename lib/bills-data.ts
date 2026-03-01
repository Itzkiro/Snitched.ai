// Bills data service for Snitched.ai
// Client-safe: read operations use API routes, no direct Supabase access.
// Write operations use server-side Supabase client (only callable from server context).

// Bill classification categories
export type BillCategory =
  | 'ISRAEL'
  | 'DEFENSE'
  | 'FOREIGN'
  | 'DOMESTIC'
  | 'ANTI_AMERICA_FIRST'
  | 'ECONOMY'
  | 'HEALTHCARE'
  | 'IMMIGRATION';

export interface Bill {
  id: string;
  congress: number;
  bill_type: string;
  bill_number: string;
  title: string | null;
  short_title: string | null;
  summary: string | null;
  description: string | null;
  policy_area: string | null;
  subjects: string[] | null;
  introduced_date: string | null;
  latest_action: unknown;
  sponsors: unknown;
  cosponsors_count: number;
  committees: unknown;
  ai_primary_category: BillCategory | null;
  ai_confidence: number | null;
  ai_reasoning: string | null;
  ai_analyzed_at: string | null;
  full_text_url: string | null;
  full_text_truncated: string | null;
  data_source: string;
  created_at: string;
  updated_at: string;
}

export interface Vote {
  id: string;
  congress: number;
  session: number;
  roll_call_number: number;
  vote_date: string | null;
  chamber: string;
  bill_id: string | null;
  bill_type: string | null;
  bill_number: string | null;
  question: string | null;
  vote_type: string | null;
  result: string | null;
  yes_count: number;
  no_count: number;
  present_count: number;
  not_voting_count: number;
  source_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface PoliticianVote {
  id: number;
  politician_bioguide_id: string;
  vote_id: string;
  position: string;
}

export interface BillWithVote extends Vote {
  bills: Bill | null;
  politician_votes: { position: string }[];
}

// Get bill by Congress API ID
export async function getBill(id: string): Promise<Bill | null> {
  try {
    const res = await fetch(`/api/bills?id=${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.error('Error fetching bill:', error);
    return null;
  }
}

// Get multiple bills by IDs
export async function getBills(ids: string[]): Promise<Bill[]> {
  if (ids.length === 0) return [];
  try {
    const res = await fetch(`/api/bills?ids=${ids.map(encodeURIComponent).join(',')}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (error) {
    console.error('Error fetching bills:', error);
    return [];
  }
}

// Get bills by category
export async function getBillsByCategory(
  category: BillCategory,
  limit: number = 50
): Promise<Bill[]> {
  try {
    const res = await fetch(`/api/bills?category=${encodeURIComponent(category)}&limit=${limit}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (error) {
    console.error('Error fetching bills by category:', error);
    return [];
  }
}

// Get votes for a politician with bill details
export async function getPoliticianVotes(
  bioguideId: string,
  category?: BillCategory
): Promise<BillWithVote[]> {
  try {
    let url = `/api/politicians/votes?bioguideId=${encodeURIComponent(bioguideId)}`;
    if (category) {
      url += `&category=${encodeURIComponent(category)}`;
    }
    const res = await fetch(url);
    if (!res.ok) return [];
    return await res.json();
  } catch (error) {
    console.error('Error fetching politician votes:', error);
    return [];
  }
}

// Store a new bill (server-side only)
export async function storeBill(bill: Partial<Bill>): Promise<boolean> {
  // Dynamic import to avoid bundling server code into client
  const { getServerSupabase } = await import('./supabase-server');
  const supabase = getServerSupabase();
  if (!supabase) return false;

  const { error } = await supabase
    .from('bills')
    .upsert([bill] as Record<string, unknown>[], { onConflict: 'id' });

  if (error) {
    console.error('Error storing bill:', error);
    return false;
  }

  return true;
}

// Store vote and politician position (server-side only)
export async function storeVote(
  vote: Partial<Vote>,
  politicianBioguideId: string,
  position: string
): Promise<boolean> {
  // Dynamic import to avoid bundling server code into client
  const { getServerSupabase } = await import('./supabase-server');
  const supabase = getServerSupabase();
  if (!supabase) return false;

  // Store vote first
  const { error: voteError } = await supabase
    .from('votes')
    .upsert([vote] as Record<string, unknown>[], { onConflict: 'id' });

  if (voteError) {
    console.error('Error storing vote:', voteError);
    return false;
  }

  // Store politician's position
  const { error: pvError } = await supabase
    .from('politician_votes')
    .upsert([{
      politician_bioguide_id: politicianBioguideId,
      vote_id: vote.id,
      position: position
    }] as Record<string, unknown>[], {
      onConflict: 'politician_bioguide_id,vote_id'
    });

  if (pvError) {
    console.error('Error storing politician vote:', pvError);
    return false;
  }

  return true;
}

// Get bills that need AI analysis (null category)
export async function getBillsNeedingAnalysis(limit: number = 10): Promise<Bill[]> {
  try {
    const res = await fetch(`/api/bills?needsAnalysis=true&limit=${limit}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (error) {
    console.error('Error fetching bills needing analysis:', error);
    return [];
  }
}

// Search bills
export async function searchBills(query: string, limit: number = 20): Promise<Bill[]> {
  try {
    const res = await fetch(`/api/bills/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (error) {
    console.error('Error searching bills:', error);
    return [];
  }
}

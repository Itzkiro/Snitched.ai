// Bills data service for Snitched.ai
// Manages bill storage, classification, and retrieval

import { createClient } from '@supabase/supabase-js';

// Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let supabaseClient: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (!supabaseClient && supabaseUrl && supabaseKey) {
    supabaseClient = createClient(supabaseUrl, supabaseKey);
  }
  return supabaseClient;
}

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
  latest_action: any;
  sponsors: any;
  cosponsors_count: number;
  committees: any;
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
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('bills')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching bill:', error);
    return null;
  }

  return data;
}

// Get multiple bills by IDs
export async function getBills(ids: string[]): Promise<Bill[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('bills')
    .select('*')
    .in('id', ids);

  if (error) {
    console.error('Error fetching bills:', error);
    return [];
  }

  return data || [];
}

// Get bills by category
export async function getBillsByCategory(
  category: BillCategory,
  limit: number = 50
): Promise<Bill[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('bills')
    .select('*')
    .eq('ai_primary_category', category)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching bills by category:', error);
    return [];
  }

  return data || [];
}

// Get votes for a politician with bill details
export async function getPoliticianVotes(
  bioguideId: string,
  category?: BillCategory
): Promise<BillWithVote[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  let query = supabase
    .from('politician_votes')
    .select(`
      position,
      votes!inner(
        *,
        bills(*)
      )
    `)
    .eq('politician_bioguide_id', bioguideId);

  if (category) {
    query = query.eq('votes.bills.ai_primary_category', category);
  }

  const { data, error } = await query
    .order('votes(vote_date)', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error fetching politician votes:', error);
    return [];
  }

  // Transform nested data
  return (data || []).map((pv: any) => ({
    ...pv.votes,
    bills: pv.votes.bills,
    politician_votes: [{ position: pv.position }]
  }));
}

// Store a new bill
export async function storeBill(bill: Partial<Bill>): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  const { error } = await supabase
    .from('bills')
    .upsert([bill] as any, { onConflict: 'id' });

  if (error) {
    console.error('Error storing bill:', error);
    return false;
  }

  return true;
}

// Store vote and politician position
export async function storeVote(
  vote: Partial<Vote>,
  politicianBioguideId: string,
  position: string
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  // Store vote first
  const { error: voteError } = await supabase
    .from('votes')
    .upsert([vote] as any, { onConflict: 'id' });

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
    }] as any, { 
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
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('bills')
    .select('*')
    .is('ai_primary_category', null)
    .limit(limit);

  if (error) {
    console.error('Error fetching bills needing analysis:', error);
    return [];
  }

  return data || [];
}

// Search bills
export async function searchBills(query: string, limit: number = 20): Promise<Bill[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('bills')
    .select('*')
    .or(`title.ilike.%${query}%,summary.ilike.%${query}%,description.ilike.%${query}%`)
    .limit(limit);

  if (error) {
    console.error('Error searching bills:', error);
    return [];
  }

  return data || [];
}

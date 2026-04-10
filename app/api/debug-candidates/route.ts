import { NextResponse } from 'next/server';
import { getServiceRoleSupabase, getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const serviceClient = getServiceRoleSupabase();
  const anonClient = getServerSupabase();

  const debug: Record<string, unknown> = {
    hasServiceRole: !!serviceClient,
    hasAnon: !!anonClient,
    supabaseUrl: process.env.SUPABASE_URL ? 'set' : 'missing',
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'missing',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY ? 'set' : 'missing',
    nextPublicUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'set' : 'missing',
    nextPublicAnon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'set' : 'missing',
  };

  const client = serviceClient || anonClient;
  if (client) {
    // Test 1: select specific columns with is_candidate filter
    const { data: test1, error: err1 } = await client
      .from('politicians')
      .select('bioguide_id, name, is_candidate')
      .eq('is_candidate', true)
      .limit(3);
    debug.test1_specific_columns = { count: test1?.length, error: err1?.message, sample: test1?.slice(0, 2) };

    // Test 2: select * with limit
    const { data: test2, error: err2 } = await client
      .from('politicians')
      .select('*')
      .limit(2);
    debug.test2_select_star_fields = { error: err2?.message, fields: test2?.[0] ? Object.keys(test2[0]) : [], hasIsCandidate: test2?.[0]?.hasOwnProperty('is_candidate') };

    // Test 3: total count
    const { count, error: err3 } = await client
      .from('politicians')
      .select('*', { count: 'exact', head: true });
    debug.test3_total_count = { count, error: err3?.message };
  }

  return NextResponse.json(debug);
}

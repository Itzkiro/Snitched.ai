/**
 * Server-side Supabase client
 * Uses non-public env vars so credentials are never exposed to the browser.
 * Falls back to NEXT_PUBLIC_ vars for backward compatibility during migration.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _supabase: SupabaseClient | null = null;
let _serviceRoleSupabase: SupabaseClient | null = null;

export function getServerSupabase(): SupabaseClient | null {
  // Prefer server-only env vars, fall back to NEXT_PUBLIC_ for backward compat
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  if (!_supabase) {
    _supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return _supabase;
}

/**
 * Get a Supabase client with the service role key for elevated writes.
 * Used by cron jobs that need to bypass RLS to upsert data.
 * Falls back to the anon key if service role key is not available.
 */
export function getServiceRoleSupabase(): SupabaseClient | null {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  if (!_serviceRoleSupabase) {
    _serviceRoleSupabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return _serviceRoleSupabase;
}

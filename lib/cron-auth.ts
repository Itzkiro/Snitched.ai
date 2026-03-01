/**
 * Cron Job Authentication
 *
 * Verifies that incoming cron requests are from Vercel's cron scheduler.
 * Vercel sends an `Authorization: Bearer <CRON_SECRET>` header on each
 * scheduled invocation.
 *
 * Environment variable required:
 *   CRON_SECRET — A random secret string configured in both Vercel project
 *                 settings and this environment variable. Generate one with:
 *                 openssl rand -hex 32
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * Validate that the request carries the correct CRON_SECRET bearer token.
 * Returns null if auth passes, or a NextResponse 401 if it fails.
 */
export function verifyCronAuth(request: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[cron-auth] CRON_SECRET is not configured');
    return NextResponse.json(
      { error: 'Cron authentication not configured' },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 },
    );
  }

  return null; // Auth passed
}

/**
 * Build a consistent JSON summary response for cron jobs.
 */
export function cronResponse(
  job: string,
  result: {
    success: boolean;
    synced: number;
    errors: number;
    details: Record<string, unknown>;
    duration_ms: number;
  },
) {
  const status = result.success ? 200 : 500;
  return NextResponse.json(
    {
      job,
      timestamp: new Date().toISOString(),
      ...result,
    },
    { status },
  );
}

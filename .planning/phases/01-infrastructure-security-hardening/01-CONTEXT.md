# Phase 1: Infrastructure & Security Hardening - Context

**Gathered:** 2026-04-02
**Scope expanded:** 2026-04-22 (added D-04, D-05, D-06 after codebase remap surfaced C2/C3/C4)
**Status:** Ready for planning

<domain>
## Phase Boundary

Secure the foundation before any data or UI work. This phase covers both original infrastructure scope and three CRITICAL concerns surfaced by the 2026-04-22 codebase remap:

**Original scope (2026-04-02):**
- Rotate the exposed Supabase service role key
- Add `/api/politicians/[id]` endpoint to eliminate the 400-politician over-fetch
- Remove publicly-accessible `dashboard.html`
- Ensure all credential files use environment variables

**Expanded scope (2026-04-22):**
- Tighten Supabase RLS so the published anon key cannot UPDATE/DELETE `politicians` (C2 — policies currently `WITH CHECK (true)` / `USING (true)`)
- Add `is_audited` visibility gate so un-audited politicians don't surface publicly with corruption scores (C3 — 45/6,727 audited; 99.3% currently leaked)
- Sanitize the bills search endpoint to prevent PostgREST `.or()` injection via raw user input (C4 — `app/api/bills/search/route.ts:28`)

The ordering matters: C2/C3/C4 must ship **before or alongside** key rotation. Rotating a key on a DB anyone can write to is half a fix.

</domain>

<decisions>
## Implementation Decisions

### Key rotation strategy
- **D-01:** Claude's discretion — rotate the Supabase service role key in Supabase dashboard, update all env vars (local `.env`, Vercel), and verify the old key is revoked. Git history scrubbing is optional (key will be revoked regardless).

### dashboard.html
- **D-02:** Delete `dashboard.html` entirely — it's a standalone 23KB HTML file not connected to the app, exposes internal details publicly, and serves no purpose.

### API endpoint design
- **D-03:** Claude's discretion — create `/api/politicians/[id]` following existing codebase patterns. The current `/api/politicians` returns full Politician objects, so the single-record endpoint should return the same shape for consistency. Use the existing Supabase client pattern with JSON fallback.

### RLS hardening (C2)
- **D-04:** Claude's discretion — tighten RLS policies on `politicians`, `social_posts`, `scrape_runs`, and any other user-writable tables so the `NEXT_PUBLIC_SUPABASE_ANON_KEY` (which ships to the browser) is READ-ONLY. All writes must go through the service role (cron jobs, admin endpoints). Verify via a test: using only the anon key, an UPDATE/DELETE against `politicians` must fail.

### is_audited visibility gate (C3)
- **D-05:** Claude's discretion on implementation, but these invariants are non-negotiable:
  1. Add an `is_audited` boolean column to `politicians` (default `false`).
  2. Backfill from the source of truth — `data-ingestion/audit-tracker.csv` lists the politicians that have been hand-audited. Mark exactly those rows `true`.
  3. Every public read endpoint (`app/api/politicians/route.ts`, `app/api/politicians/search/route.ts`, `app/api/politicians/[id]/route.ts`, `app/api/politicians/export/route.ts`) and the Browse UI (`components/BrowseClient.tsx`) must filter `is_audited = true` for unauthenticated requests.
  4. Admin/cron paths (service role) keep full visibility so the audit workflow itself can see un-audited rows.
  5. A /hidden-or-equivalent admin page for toggling audit status is out of scope — toggling happens via SQL or an ingestion script for now.

### Bills search sanitization (C4)
- **D-06:** Claude's discretion — fix `app/api/bills/search/route.ts:28` so raw user input is no longer interpolated into a PostgREST `.or()` string. Accepted approaches: use `.textSearch()` with a tsvector column, use parameterized `.ilike()` on specific fields, or strictly whitelist/escape the input. Also do a grep pass for the same pattern in other routes (`.or(`, `.rpc(`, template-literal-in-filter) and patch any siblings found.

### Claude's Discretion
- Key rotation approach (rotate + update env vars, git scrub optional)
- `/api/politicians/[id]` response shape and caching strategy (follow existing patterns)
- Env validation approach at startup
- RLS policy shape (single permissive-select + restricted-write, or role-based — whichever fits Supabase conventions)
- Whether `is_audited` filter is enforced at the RLS layer, the API layer, or both (defense-in-depth preferred)
- Migration ordering: whether C3's column-add runs before or after C2's RLS change (both must ship in this phase)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements fully captured in decisions above and codebase map docs.

### Codebase context
- `.planning/codebase/CONCERNS.md` — Full security audit with priority ranking (P0: hardcoded JWT, P1: input validation)
- `.planning/codebase/ARCHITECTURE.md` — API layer structure, data flow, Supabase client patterns
- `.planning/codebase/STACK.md` — Environment variables list, deployment config, cron job setup

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/supabase-server.ts` — Singleton Supabase client factory (`getServerSupabase()`, `getServiceRoleSupabase()`) — must be updated if key rotation changes env var names
- `lib/cron-auth.ts` — Vercel cron job verification pattern — reference for auth patterns
- `lib/fec-client.ts` — API client pattern with rate limiting and error handling — reference for new endpoint

### Established Patterns
- API routes use JSDoc headers, try/catch blocks, and `request.nextUrl.searchParams` for parameter extraction
- Supabase queries follow: `getServerSupabase().from('politicians').select()` pattern
- JSON fallback via `real-data.ts` when Supabase unavailable

### Integration Points
- 8 script files with hardcoded credentials: `scripts/sync-social-media.ts` is the known one, others need grep scan
- `app/politician/[id]/page.tsx` (line ~50-66) — currently fetches ALL politicians then filters client-side; will use new endpoint
- `vercel.json` — may need `.vercelignore` update if `dashboard.html` is in deployment
- `.env` / Vercel env vars — key rotation target
- **RLS (C2):** `supabase/schema.sql` holds the current permissive policies — rewrite there
- **Audit gate (C3):** column-add migration in `supabase/`, backfill via `data-ingestion/audit-tracker.csv` (45 audited rows), filter in all public read endpoints: `app/api/politicians/route.ts`, `app/api/politicians/search/route.ts`, `app/api/politicians/[id]/route.ts`, `app/api/politicians/export/route.ts`, and `components/BrowseClient.tsx`
- **Bills sanitization (C4):** `app/api/bills/search/route.ts:28` is the known injection point; grep for `.or(` template literals elsewhere

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. User wants clean, secure foundation.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-infrastructure-security-hardening*
*Context gathered: 2026-04-02*

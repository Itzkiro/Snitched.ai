# Phase 1: Infrastructure & Security Hardening - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Secure the foundation before any data or UI work. Rotate the exposed Supabase service role key, add `/api/politicians/[id]` endpoint to eliminate the 400-politician over-fetch, remove publicly-accessible `dashboard.html`, and ensure all credential files use environment variables.

</domain>

<decisions>
## Implementation Decisions

### Key rotation strategy
- **D-01:** Claude's discretion — rotate the Supabase service role key in Supabase dashboard, update all env vars (local `.env`, Vercel), and verify the old key is revoked. Git history scrubbing is optional (key will be revoked regardless).

### dashboard.html
- **D-02:** Delete `dashboard.html` entirely — it's a standalone 23KB HTML file not connected to the app, exposes internal details publicly, and serves no purpose.

### API endpoint design
- **D-03:** Claude's discretion — create `/api/politicians/[id]` following existing codebase patterns. The current `/api/politicians` returns full Politician objects, so the single-record endpoint should return the same shape for consistency. Use the existing Supabase client pattern with JSON fallback.

### Claude's Discretion
- Key rotation approach (rotate + update env vars, git scrub optional)
- `/api/politicians/[id]` response shape and caching strategy (follow existing patterns)
- Env validation approach at startup
- Input validation improvements scope (if any fits this phase)

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

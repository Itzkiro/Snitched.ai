# Codebase Concerns

**Analysis Date:** 2026-04-22

Severity legend: **CRITICAL** (ship blocker / legal risk / credential exposure), **HIGH** (data integrity or major security), **MEDIUM** (tech debt / fragility), **LOW** (cleanup / polish).

---

## CRITICAL

### C1. Real secrets committed to `.env` and `CLAUDE.md` instructs rotation never happened

- Files: `.env` (lines 5, 9, 10, 12, 15, 19, 22, 25, 28), `CLAUDE.md` (line referencing "Supabase service role key needs immediate rotation")
- Evidence: `.env` contains live, non-placeholder keys for `FEC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `LEGISCAN_API_KEY`, `ADMIN_SECRET` (`901aa0d201d78605b715b2f76029eb63`), `COURTLISTENER_TOKEN`, `EXA_API_KEY`, `GOOGLE_CIVIC_API_KEY`. The service-role JWT has `"exp":2090721773` (~year 2036) — a ~10-year window of database control if leaked.
- `.gitignore` does list `.env`, but the file is still present on disk with production-looking values, and `CLAUDE.md` explicitly reads "Supabase service role key needs immediate rotation" — meaning the team already knows it was exposed and still has not rotated.
- Impact: A single leak of the service role key grants full `SELECT/INSERT/UPDATE/DELETE` on the `politicians` table (see C2 about RLS). Full database takeover, including the ability to silently re-score any politician or inject libelous records.
- Fix: Rotate all keys in `.env` today. Move to Vercel env vars only. Grep git history (`git log -p --all -- .env`) to confirm the file was never committed. If it was, treat every key as burned.

### C2. Supabase Row-Level Security is effectively disabled for `politicians` table

- File: `supabase/schema.sql` lines 67-82
- Evidence:
  ```sql
  CREATE POLICY "Anon insert access" ON politicians FOR INSERT WITH CHECK (true);
  CREATE POLICY "Anon update access" ON politicians FOR UPDATE USING (true);
  CREATE POLICY "Anon delete access" ON politicians FOR DELETE USING (true);
  ```
  RLS is "enabled" but the policies `WITH CHECK (true)` / `USING (true)` let the anon JWT do anything. The anon key is hard-coded into client-side Next.js via `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`.env` line 12) and baked into every browser bundle — anyone who visits the site can extract it from DevTools and then `DELETE FROM politicians;` or `UPDATE politicians SET corruption_score = 0;` directly against Supabase's REST endpoint.
- Impact: Trivial defacement or mass score manipulation by any visitor. Given the project's legal/political sensitivity (naming politicians with funding from the "Israel lobby"), a single hostile actor could insert false records and make the platform the source of defamatory claims.
- Fix: Replace the anon insert/update/delete policies with `FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role')`. All writes already go through server-side cron routes using `SUPABASE_SERVICE_ROLE_KEY` via `lib/supabase-server.ts:38-60`, so removing anon write access will not break the pipeline. Tables `social_posts`, `scrape_runs`, `platform_stats`, `intel_alerts` have similar "Service *" policies with `USING (true)` — audit all four.

### C3. Un-audited politicians (~6,680+) are publicly visible despite explicit user directive

- User-stated requirement (from memory `project_snitched_audit_resume.md` lines 13-15, 17-21): "clean the whole Database and audit one by one and hide those who aren't audited." Resume steps specify adding an `is_audited: boolean` column and filtering `is_active = true AND is_audited = true` on list/search/compare pages.
- Current state (evidence):
  - Schema: `supabase/schema.sql` lines 9-59 show NO `is_audited` column. `grep -rn "is_audited\|audit_status\|audited.*true"` across `/app`, `/lib`, `/components`, `/supabase` returns zero matches.
  - Browse page: `app/browse/BrowseClient.tsx` line 18 — filter is `if (!p || !p.isActive) return false;` only. No audit gate.
  - List API: `app/api/politicians/route.ts` lines 37-46 — no `is_audited` filter, paginated over ALL rows.
  - Search API: `app/api/politicians/search/route.ts` line 28 — only filters `is_active=true`, exposes every un-audited name.
  - Detail API: `app/api/politicians/[id]/route.ts` lines 47-51 — no audit gate, any visitor can load any bioguide_id.
  - Candidates page: `app/candidates/page.tsx` line 23 — calls `rpc('get_candidates')` (opaque; needs RLS/DB verification) with no audit filter.
  - Export API: `app/api/export/route.ts` line 24 — `WHERE is_active = true`, no audit filter; leaks every un-audited score to CSV.
  - Audit tracker: `data-ingestion/audit-tracker.csv` has 45 audited entries as of 2026-04-22 (last row `va-senate-2026-mark-warner` at 03:15:13Z). Even at 45, the hidden cohort is ~99.3% of the database.
- Impact: Users browsing `/browse`, `/candidates`, `/officials`, or hitting `/api/politicians` get a mix of carefully-sourced numbers (Mast, Torres, Gallrein, Warner etc.) and low-confidence seed data (e.g. `oh_sos_playwright_2026q1`, `manual`, `ny-officials-seed-2026`). The un-audited scores can be wrong by 20-40 points (see audit-tracker.csv `old_score` vs `new_score` column — Ritchie Torres went 65→85, Shontel Brown 51→85, Wasserman Schultz 63→73). Publishing those values as "data-driven corruption scores" against real living politicians is the exact legal-risk surface of this platform.
- Fix (blocking):
  1. Run migration `005_add_is_audited.sql` adding `is_audited BOOLEAN DEFAULT false` on `politicians`, with index `idx_politicians_is_audited`.
  2. Backfill `TRUE` for the 45 bioguide_ids in `data-ingestion/audit-tracker.csv`.
  3. Add `.eq('is_audited', true)` to: `app/api/politicians/route.ts:39`, `app/api/politicians/search/route.ts:28`, `app/api/politicians/[id]/route.ts:48-49` (return 404 for un-audited), `app/api/export/route.ts:24`, `app/api/investigate/route.ts` pagination, `app/api/stats/route.ts:20-30` counts, RPC `get_candidates`.
  4. Gate the `/politician/[id]` page SSR on `is_audited` — return 404 instead of fallback JSON for un-audited IDs.
  5. Add explicit `robots.ts`/`sitemap.ts` filter so un-audited pages aren't indexed.

### C4. Bills search is vulnerable to PostgREST injection via unescaped `%` interpolation

- File: `app/api/bills/search/route.ts` line 28
- Evidence:
  ```ts
  const query = searchParams.get('q') || '';
  ...
  .or(`title.ilike.%${query}%,summary.ilike.%${query}%,description.ilike.%${query}%`)
  ```
  A caller sending `?q=foo,description.ilike.,id.eq.1` breaks out of the intended filter and can `OR` in arbitrary PostgREST predicates. Combined with C2 (permissive RLS on the `bills` table if it mirrors `politicians`), this becomes an unauthorized-read primitive.
- Impact: At minimum, ability to exfiltrate full rows of any table the anon role can SELECT; at worst, if any policy allows writes, attacker-controlled filters can target unintended rows.
- Fix: Escape user input and prefer `ilike` per column with parameter binding. Example:
  ```ts
  const safe = query.replace(/[,()%]/g, '');
  .or(`title.ilike.%${safe}%,summary.ilike.%${safe}%`)
  ```
  Better: use Postgres full-text search via `textSearch('title_fts', query, { type: 'websearch' })`.

---

## HIGH

### H1. `ADMIN_SECRET` and `CRON_SECRET` fall back to each other and to empty string

- File: `app/api/admin/route.ts` line 21
- Evidence: `const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.CRON_SECRET || '';`. If neither is set, `ADMIN_SECRET` becomes `''`, and `verifyAdmin` at line 27-34 rejects with `"Admin not configured"` — but in dev or staging with `CRON_SECRET` set, ANY client that hits `/api/admin` with `x-admin-secret: <cron-secret>` can `push-to-db`, `research`, `export`, and `list-politicians`. The cron secret leaks through every Vercel cron invocation; if a single cron log is exposed, admin access follows.
- `.env` line 18 shows `CRON_SECRET=` (empty), line 19 shows a real `ADMIN_SECRET`. On the production Vercel project the two are likely both set, amplifying the blast radius.
- Impact: Silent privilege escalation from cron bearer to admin. The admin route can rewrite `corruption_score`, `top5_donors`, `israel_lobby_total` — the exact fields consumed by the public UI.
- Fix: Drop the `|| process.env.CRON_SECRET` fallback. Require `ADMIN_SECRET` explicitly. Add constant-time compare (`crypto.timingSafeEqual`) instead of `auth !== ADMIN_SECRET` at line 31.

### H2. Admin authentication uses timing-unsafe string comparison and fixed 32-hex token

- File: `app/api/admin/route.ts` line 31
- Evidence: `if (!auth || auth !== ADMIN_SECRET)` compares with `!==`, which short-circuits and leaks length/prefix information via response timing. The token in `.env` line 19 (`901aa0d201d78605b715b2f76029eb63`) is only 128 bits of hex with no rotation policy; there's no rate limit and no lockout on failed attempts.
- Impact: Offline / online brute-force of the admin token. An attacker with admin access can rewrite any row, overwrite any corruption score, or delete politicians.
- Fix: Use `crypto.timingSafeEqual(Buffer.from(auth), Buffer.from(ADMIN_SECRET))` with length check first. Add per-IP rate limit via `x-forwarded-for` + in-memory sliding window. Rotate to a 256-bit secret.

### H3. Every public read endpoint paginates over the entire `politicians` table unbounded

- Files:
  - `app/api/politicians/route.ts` lines 34-47 (while loop with no hard cap)
  - `app/api/connections/route.ts` lines 57-65 (same pattern)
  - `app/api/investigate/route.ts` lines 16-27 `fetchAllPoliticians` helper — used by `crossStateConnections`, `ownershipTracing`, `votingPatterns`
  - `app/api/stats/route.ts` lines 37-48 (Israel lobby sum loops all > 0 rows)
- Evidence: at ~6,727 rows this is tolerable, but the code walks `/api/investigate?tool=cross-state` over all rows, builds `donorMap` in memory, and the Ohio bundler expansion and pro-Israel cross-ref signals (see memory `project_snitched_individual_bundler_signal.md`) add thousands of JSONB `individual_bundlers` entries per row. Each call pulls dozens of MB into a 5-min Vercel serverless function with 1024MB default memory.
- Impact:
  - Cold-start OOM risk as bundler data grows. Function timeout on `/investigate` already a risk.
  - Completely trivial DoS: a script that hits `/api/investigate?tool=cross-state` 10x/sec from a single IP will saturate the Supabase free-tier bandwidth budget in minutes.
  - Every `/api/politicians` response sends ~6,727 rows to the client even though the browse UI filters client-side to ~100 on screen.
- Fix: Add server-side pagination (`?page&pageSize`) to `/api/politicians`. Cache `/api/investigate` outputs for 15-60 min (`next: { revalidate: 900 }`). Move heavy aggregations to materialized views or a nightly Supabase SQL function that pre-computes `cross_state_donors`, `lobby_chains`, `voting_pairs`.

### H4. `/api/debug-candidates` is publicly exposed in production and leaks Supabase env-var presence

- File: `app/api/debug-candidates/route.ts` lines 10-18
- Evidence: `GET /api/debug-candidates` returns JSON like `{ hasServiceRole: true, supabaseUrl: "https://xwaejtxqhwendbbdiowa.supabase.co...", ... }`. No auth gate. It runs four queries against the live DB on every call.
- Impact: Reveals deployment topology (service role is or isn't set, exact Supabase URL prefix, which env fallback path is active). Useful reconnaissance before C2 exploitation. Also a gratuitous cost multiplier if scraped.
- Fix: Delete the file, or wrap in `verifyAdmin(request)` so it only responds to the admin bearer.

### H5. Corruption scores are published without a visible confidence tier or audit-state badge

- File: `app/politician/[id]/page.tsx` (2169 lines; client-side render), specifically the score card around line 50 (`scoreView` state flip) and the client-side score recomputation at lines 72-84.
- Evidence: The page shows a numeric score (e.g. "78/D") equally for both audited rows (Mast, Torres, Gallrein, Warner — where the score is backed by full FEC itemized + roster-match) and un-audited seed rows (where `corruption_score` is whatever `seed-*.js` wrote months ago or `fec_api` default-inferred). `data_source` in the DB (seen in audit-tracker CSV and CLAUDE resume notes) distinguishes these but is not surfaced in the UI. The `confidence` column in `audit-tracker.csv` ("high") is not stored in the DB at all.
- Impact: Legal/reputational — publishing a "78/D Corrupt" score for a politician the team has not actually audited is the definitional libel-per-se risk for this platform. A named politician with a wrongly-high score has a direct defamation cause of action; the site's radical-transparency framing does not shield the publisher from publishing a demonstrably wrong number.
- Fix: Until C3 is resolved and un-audited rows are hidden, gate the numeric score behind `is_audited`; for un-audited rows show `— (pending verification)` or omit. Add a per-page disclosure block that cites the specific sources used for this politician (already stored in `data_source`).

### H6. `sync-fec` cron ignores 80% of tracked rows per run and has no backoff on FEC rate-limit

- File: `app/api/cron/sync-fec/route.ts` lines 27-31, 720-730
- Evidence: `MAX_POLITICIANS_PER_RUN = 50` runs once per day (CLAUDE.md states 3 AM UTC cron). To cover ~6,700 politicians would take ~134 days — meaning a row synced today won't be resynced until August. On rate-limit (429) line 726-729 just `break`s out of the loop; no exponential backoff, no resume cursor stored, no persistent record of which rows were last synced, so the next run doesn't know where to pick up.
- Impact:
  - Financial data on display is up to 4 months stale for most rows and up to 134 days stale for the long tail.
  - A single rate-limit day halves the already-slow convergence.
  - The public-facing claim in CLAUDE.md that data is "Updated every 24 hours" is not true for ~6,670 of 6,720 rows.
- Fix: Add a `last_synced_at TIMESTAMPTZ` column, `ORDER BY last_synced_at NULLS FIRST` in the query at line 420-426, and raise `MAX_POLITICIANS_PER_RUN` to ~200 (fits in 5 min at 600ms/req × ~15 req/politician). Implement exponential backoff (`1s, 2s, 4s, 8s, 30s`) instead of hard-`break`.

### H7. FEC fallback name search hard-codes `state: 'FL'`, silently breaks for non-FL politicians

- File: `app/api/cron/sync-fec/route.ts` lines 346-354, 363-370
- Evidence:
  ```ts
  const data = await fecFetch('/candidates/search/', {
    name: politician.name,
    state: 'FL',
    office: officeCode,
    ...
  });
  ```
  The sync cron runs over the full DB (Ohio, Kentucky, New York, California, etc. per `audit-tracker.csv`) but the FEC lookup only ever passes `state: 'FL'`. Any politician whose `source_ids.fec_candidate_id` is null will never be resolved via name lookup unless they happen to be a Florida candidate. Silently skipped at line 507.
- Impact: Thousands of non-FL politicians have no path to getting their FEC ID linked automatically. Their `total_funds`, `israel_lobby_total`, `top5_donors` will remain default-zero forever, which feeds into C3/H5 (they appear as "clean / A grade" simply because their data is missing).
- Fix: Derive state from `bioguide_id` prefix via `lib/state-utils.ts:getStateFromId` and pass it dynamically. Add a fallback to no-state search with stricter name match.

### H8. Cron routes each re-implement FEC fetch + sleep + rate-limit logic

- Files: `app/api/cron/sync-fec/route.ts` lines 68-70, `app/api/cron/research-candidates/route.ts` lines 33-43, `app/api/cron/track-fec-filings/route.ts`, `lib/research-agent.ts` line 35, `lib/roster-match.ts` line 160, `lib/fec-client.ts` (the real canonical one). Four parallel re-implementations.
- Evidence: `sync-fec/route.ts:68` defines its own `sleep`. `research-candidates/route.ts:29` redefines `FEC_BASE` and `fecFetch` from scratch rather than importing `lib/fec-client.ts`. `roster-match.ts:160` does `await sleep(30_000); return fecFetch(...)` — a blind 30s retry that will blow past Vercel's 300s `maxDuration` on any route that hits back-to-back 429s.
- Impact: Fixes to rate-limit handling (H6) have to be applied in four places; easy to miss one. Inconsistent behavior on 5xx.
- Fix: Delete the duplicate `fecFetch` implementations; import `lib/fec-client.ts` everywhere and extend it with an `options.retries` argument.

### H9. Scoring algorithm weights change rapidly and silently re-tune published scores

- File: `lib/corruption-score.ts` line 47 (comment "Previous v5 weights kept in comment for audit"), 935 total lines across v6.5 rules per memory `project_snitched_audit_resume.md` lines 45-50.
- Evidence: Memory `project_snitched_individual_bundler_signal.md` notes the Acton score moved 12 → 27 purely because a bundler cross-ref signal was added. Users who bookmarked `/politician/oh-gov-2026-amy-acton` see the score silently shift by 15 points with no change log surfaced in the UI. The client-side page explicitly does NOT recompute the score (`politician/[id]/page.tsx:72-84`), so audited politicians whose DB score came from v6.3 disagree numerically with the v6.5 factor breakdown rendered beside them.
- Impact: Users can't tell if a score moved because new evidence arrived or because the formula changed. Screenshots circulated by the community will mismatch the live page. Inconsistent versioning weakens the "data-driven" claim.
- Fix: Stamp every DB row with `scorer_version` and `scored_at`; surface both on the detail page. Write a migration notes file in `supabase/migrations/` explaining each weight change. Consider an immutable `corruption_score_history` table so the graph shows the score over time.

---

## MEDIUM

### M1. `app/politician/[id]/page.tsx` is a 2,169-line client component

- File: `app/politician/[id]/page.tsx` (line count from `wc -l`)
- Evidence: Entire profile, including all tabs (overview/votes/funding/social/lobby/connections), rendered client-side with `'use client'` and `useEffect`-based data loading. 25 `useEffect`/`fetch` occurrences. Loads `politician` then separately loads votes, then ConnectionsGraph client-side.
- Impact:
  - SEO: politician names and data render after hydration, so Google crawls mostly empty HTML.
  - First Contentful Paint: large JS bundle ship + multiple round-trips.
  - Maintainability: 2,169 lines in one file violates the project's "<800 line" convention.
  - Inconsistent with SSR on `/candidates` which uses server components.
- Fix: Convert the shell to a Server Component that loads politician + votes + social in parallel server-side, then passes data to smaller client islands (e.g. `<ScoreCard>`, `<VoteTable>`, `<ConnectionsGraphIsland>`). Split into `page.tsx` (server), `PoliticianClient.tsx` (interactive bits), and per-tab components.

### M2. `dangerouslySetInnerHTML` used for HTML-entity emoji rendering

- File: `components/TerminalHome.tsx` lines 527, 529
- Evidence: Home page landing content passes HTML entities (e.g. `&#127482;&#127480;`) as strings and renders via `dangerouslySetInnerHTML`. Data is static in the source file, not user input — no XSS today.
- Impact: Gratuitous use of a footgun pattern. If future editors add text from DB (e.g. politician name in a marketing module), the precedent is risky.
- Fix: Use React.Fragment with the entity in JSX (`<>{'\u{1F1FA}\u{1F1F8}'}</>`) or just paste the emoji character literally.

### M3. Fallback from Supabase → local JSON can leak 188-politician Florida seed as "fresh" data

- File: `lib/real-data.ts` lines 11-20, `app/api/politicians/route.ts` lines 20-25, 51-55, 92-98
- Evidence: When Supabase returns 0 rows or errors, the API route imports `@/lib/real-data` and serves `data-ingestion/phase1/processed/florida_politicians.json` + `data-ingestion/jfk-fec-results/jfk-fec-full-results.json` (last modified 2026-04-01). The fallback is silent — the `dataSource: 'supabase'` mapping at line 87 stays "supabase" even when we actually served JSON from February.
- Impact: Debugging data mismatches is hard because the UI claims Supabase when it isn't. A Supabase outage hides instead of errors. Stale JSON overrides fresh DB edits.
- Fix: Make the fallback explicit: set `dataStatus: 'fallback-json'`, log a Sentry/console warning every time the fallback fires, and surface a banner in the UI when the list is from the fallback.

### M4. Persistent in-memory Supabase client singleton across serverless invocations

- File: `lib/supabase-server.ts` lines 9-10, 21-31, 50-59
- Evidence: Module-level `_supabase` / `_serviceRoleSupabase` caches are fine for long-running processes but Vercel serverless cold-warm-cold cycles mean the singleton re-creates on every cold start, while a warm function reuses it. If env vars change (rotation), a warm instance keeps serving with the old key until eviction. Also, if the service role key is read at first call, a misconfigured function with NEXT_PUBLIC fallback silently downgrades to anon permissions for 15 min.
- Impact: Subtle. Masks auth-config errors during deploys.
- Fix: Cache the URL+key hash alongside the client and invalidate on mismatch. Or drop the singleton and rely on fetch-level keep-alive.

### M5. Scripts directory is a graveyard of 100+ throwaway files with no retention policy

- Files: `scripts/` directory has 104 entries (`ls | wc -l`).
- Evidence: Mix of active cron triggers (`refresh-mast.ts` 2026-04-19, `refresh-acton.ts` 2026-04-19, `refresh-vivek.ts` 2026-04-19), one-off probes (`probe-oh-sos.ts` through `probe-oh-sos-maint.ts` — 6 variants, all 2026-04-19), stealth scrapers (`scrape-vivek-oh-sos-stealth.ts`, `scrape-vivek-oh-sos-headless.ts`, `scrape-vivek-oh-sos.ts` — 3 versions), seed scripts from 2026-04-11 (`seed-ohio-*`, `seed-nj-officials.js`, `seed-nc-county-officials.ts`). Many already obsolete (their output CSV is committed to `data-ingestion/`).
- Also 7 `*_SEEDING_REPORT.md` files in the project root all dated 2026-04-11 — legacy artifacts that should live in `/docs` or be deleted.
- Impact: New contributors can't tell which scripts are production-essential (invoked by cron) vs historical. Scripts are excluded from TypeScript compilation (`tsconfig.json` excludes `scripts/`) so they rot silently.
- Fix: Split into `scripts/cron/` (invoked by Vercel cron, CI-typechecked), `scripts/tools/` (hand-run utilities), `scripts/archive/` (kept for reference, non-functional). Move the `*_SEEDING_REPORT.md` files to `/docs/seed-reports/` or delete.

### M6. Homepage SEO exposes un-audited politicians via `sitemap.ts`/`robots.ts`

- Files: `app/sitemap.ts`, `app/robots.ts` (both present in `app/` listing)
- Evidence: Not yet read; given C3 has no `is_audited` filter anywhere, it's highly likely the sitemap enumerates all politicians including seed rows.
- Impact: Google indexes profile pages with low-confidence scores. Even after C3 is fixed, pre-existing indexed URLs will keep returning data for weeks.
- Fix: After C3, regenerate sitemap from `is_audited = true` rows only. Submit URL removal requests in Search Console for any un-audited URLs already indexed.

### M7. CLAUDE.md overstates cron schedule — `vercel.json` has `crons: []`

- File: `vercel.json` (single line: `{ "crons": [] }`), `CLAUDE.md` documents five cron routes
- Evidence: CLAUDE.md claims "Scheduled Cron Jobs (Vercel Cron)" with routes `/api/cron/sync-fec` etc. on specific schedules, but `vercel.json` has an empty `crons` array. Either Vercel Cron is configured via the dashboard UI (invisible to the repo) or the crons aren't actually running.
- Impact: Truth-in-documentation bug. If a contributor deploys a fresh Vercel project from this repo, none of the cron jobs will fire.
- Fix: Populate `vercel.json` with the actual cron schedule so deploy state matches docs; or remove the table from CLAUDE.md.

### M8. `as any` and `Record<string, unknown>` patchwork throughout API layer

- Files: 28 occurrences of `as any` / `: any` / `any[]` across `app`, `lib`, `components` (`grep` count).
- Example: `app/api/politicians/[id]/route.ts:114-125` casts `row.court_records` via `(c: any)`, `row.voting_records as any[]`.
- Impact: Type-checker can't catch upstream schema shifts (e.g., when a sync cron renames `court_records.case_name` to `case_name_short`). Runtime errors surface only on specific politician detail pages.
- Fix: Define `CourtRecord`, `VotingRecord`, `SocialPost`, `Top5Donor` interfaces in `lib/types.ts` and import everywhere. Replace `as any` with `z.parse` at DB boundary if Zod is adopted.

### M9. Social-media daemon depends on cloned repos that are `.gitignored`

- File: `.gitignore` lines 36-41 explicitly exclude `scrapers/social-analyzer/`, `scrapers/facebook-scraper/`, `scrapers/TwitterUserScraper/`, `scrapers/OpenPlanter/`, `scrapers/openFEC/`
- Evidence: `scrapers/scrape-social-media.py` (2,065 lines) imports or shells out to these directories. A fresh clone of Snitched.ai cannot run the social scraper without manually hunting down four external repos.
- Impact: Onboarding is broken; daemon cannot be redeployed from scratch; bus-factor on the person who set up the original scraper.
- Fix: Vendor the minimal necessary functions into `scrapers/` or replace with `pip install` packages pinned in `requirements.txt`.

### M10. `.vercelignore` excludes `database` and `scrapers` — but also `scripts`, which the build may need

- File: `.vercelignore` (lines seen via earlier cat)
- Evidence: Excludes `scripts`, `database`, `scrapers`, `scrapers/node_modules`, `.env*.local`.
- `next.config.ts` adds `outputFileTracingIncludes: { '/api/cron/refresh-gallrein-roster': ['./data/pro-israel-donors-*.csv'] }` — meaning the runtime reads files from `data/` at runtime.
- Excluding `scripts` from the Vercel upload is fine (they're CLI-only), but if any cron route accidentally `import`s from `../../scripts/...` it will ENOENT in production.
- Fix: Grep cron routes for any import traversing into `scripts/` before trusting this configuration.

### M11. Export endpoints unlimited — `/api/export?type=all` returns the full DB as CSV

- File: `app/api/export/route.ts` lines 20-34
- Evidence: No limit, no auth, no rate-limit. Returns `name, office, corruption_score, israel_lobby_total, ...` for every row where `is_active=true`. The admin `/api/admin` export is gated by `ADMIN_SECRET`, but the public `/api/export` is wide open.
- Impact: Trivial bulk-scrape. Compounds C3 — the entire un-audited DB ships as a downloadable CSV with "CORRUPTION SCORE" headers.
- Fix: Require auth, add daily rate limit per IP, add `is_audited = true` filter once C3 ships. Add a hash-signed download link with short TTL.

### M12. `israel_lobby_breakdown` JSONB is mutated by multiple cron writers without locking

- File: `app/api/cron/sync-fec/route.ts` lines 632-668 (preserves fields from roster-match pipeline), `lib/roster-match.ts` (the other writer).
- Evidence: The hand-rolled merge logic at lines 633-668 reads `existingBreakdown` and re-copies `bundlers`, `bundlers_by_source`, `individual_bundlers`, `pac_details`, `pacs_by_cycle`, `scoring_rule` — but only the keys the author remembered. If a new roster-match script adds `foreign_exec_bundlers` next month, `sync-fec` will silently drop it on the next daily write.
- Impact: Data loss after introducing new breakdown categories; fragile to additions in `lib/roster-match.ts` or `scripts/crossref-*.ts`.
- Fix: Spread the full object — `{ ...existingBreakdown, total: ..., pacs: finalPacs, ie: ..., ie_details: ... }` — and only whitelist the keys this cron owns (total, pacs, ie, ie_details).

### M13. `lib/corruption-score.ts` is 935 lines with no tests

- File: `lib/corruption-score.ts` — 935 lines
- Evidence: No `.test.ts`/`.spec.ts` files exist anywhere in the repo (`package.json` has no test script, `testing.md` from GSD rules requires 80% coverage). The scorer has tier floors, multi-cycle multipliers, forensic signal caps, red-flag escalators — all implicit in imperative code with no unit tests.
- Impact: A single bad `min/max` change (like the Acton 12→27 reported in memory) could easily bleed into production for days before anyone notices. No regression harness.
- Fix: Write golden-case tests for the 4 audited politicians (Mast 78, Acton 27, Vivek 60, Taylor 12, Torres 85, Gallrein 85 etc. from `audit-tracker.csv`). Lock scorer-version → expected-score in a snapshot file. Run in CI.

### M14. `next: { revalidate: 300 }` on FEC fetch vs `export const dynamic = 'force-dynamic'` on routes

- File: `lib/fec-client.ts` line 56, every cron route has `export const dynamic = 'force-dynamic'`
- Evidence: The FEC client caches its outbound response for 5 min, but the cron route is marked fully dynamic. During a cron run, the 5-min cache means sequential requests for the same candidate (committees → totals → schedule_a) can hit stale cached 5xx responses and skip the real API, masking errors.
- Impact: Intermittent "looks synced, didn't sync" bugs.
- Fix: Change `next: { revalidate: 300 }` to `cache: 'no-store'` inside cron contexts, OR drop the cache entirely and rely on in-process caching.

---

## LOW

### L1. Many `console.log`/`console.error` left in production API and lib code

- Evidence: 34 `console.*` occurrences in `app/api/`, `lib/`, `components/`. Project rules (`common/coding-style.md`, `typescript/coding-style.md`) ban `console.log` in production code.
- Impact: Log noise on Vercel, harder to find real errors, no structured logging.
- Fix: Introduce a tiny logger (`lib/logger.ts`) with levels and structured fields.

### L2. Hard-coded URL "Snitched.ai" / contact info nowhere found

- File: No `CONTACT.md`, no `SECURITY.md`, no disclaimer page under `/app/about/` surfaced in this audit.
- Impact: Given the platform publishes negative scores on named politicians, the absence of a `SECURITY.md` (vuln disclosure), `LEGAL.md` (takedown policy, correction request flow), and a visible `about`-page disclosure of methodology is a legal-hygiene gap.
- Fix: Add `/app/about/page.tsx` with methodology, `docs/SECURITY.md` with vuln disclosure pointer, a visible takedown/correction email.

### L3. Loose URL handling in `zip-lookup` calls third-party geocoders without retry

- File: `app/api/zip-lookup/route.ts` lines 26-46 (seen)
- Evidence: Calls Nominatim (OpenStreetMap) and Census Geocoder; if either is down the endpoint returns null. No fallback to a local ZIP→state lookup via `lib/zip-lookup.ts`.
- Impact: Home page ZIP lookup breaks whenever either third-party has an outage.
- Fix: Implement a simple local ZIP→state lookup with the bundled csv; only hit Census for district-level enrichment.

### L4. Mobile optimization plan dated 2026-04-01 never marked complete

- File: `MOBILE-OPTIMIZATION-PLAN.md` (4.9KB, last touched 2026-04-01)
- Impact: Either the plan is stale or mobile is actually not optimized. Unclear which.
- Fix: Either mark status in the plan (or delete if done), or fold the outstanding items into the current GSD roadmap.

### L5. `investigations/` directory has two undocumented entries

- File: `investigations/fl-polk-lakeland-mayor-mccarley`, `investigations/fl-polk-schoolboard-d6-sharpless`
- Evidence: Only 2 dirs, no README. Likely abandoned / WIP research notes.
- Impact: Nothing ships from this dir; clutter.
- Fix: Document purpose in `investigations/README.md` or archive.

### L6. `Eleni Contribution.xls` is a 262KB binary spreadsheet committed to the repo root

- File: `Eleni Contribution.xls` (262 KB)
- Impact: Binary files in git bloat history; source of data not documented.
- Fix: Move to `data-ingestion/raw/` with a provenance note, or delete if already imported.

---

## Summary Heat Map

| Area | Critical | High | Medium | Low |
|---|---|---|---|---|
| Data integrity (audit gating) | C3 | H5 | M6 | — |
| Secrets / auth | C1, C2, C4 | H1, H2, H4 | — | — |
| Data pipeline reliability | — | H6, H7, H8 | M3, M12, M14 | L3 |
| Performance / scaling | — | H3 | M1, M4 | — |
| Code quality / tech debt | — | — | M2, M5, M7, M8, M10, M11, M13 | L1, L4, L5, L6 |
| Legal / disclosure | C3 | H5, H9 | — | L2 |

## Top 5 Fix-First (by blast radius × ease)

1. **C3** — Add `is_audited` column and filter everywhere. Blocks legal risk; user explicitly asked for it.
2. **C2 + C1** — Rotate keys, tighten RLS policies. One afternoon of work.
3. **C4** — Escape the bills `or()` query. 5 minutes.
4. **H4** — Delete `/api/debug-candidates` or gate it. 2 minutes.
5. **M13** — Write corruption-score regression tests before any more weight changes. Otherwise every tweak is a coin flip for the published scores.

---

*Concerns audit: 2026-04-22*

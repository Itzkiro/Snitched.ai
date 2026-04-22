# Architecture

**Analysis Date:** 2026-04-22

## Pattern Overview

**Overall:** Next.js 16 App Router monolith (SSR + serverless API routes) fronting a Supabase (Postgres) data store, fed by an out-of-band data pipeline composed of TypeScript sync scripts, Python scrapers, and Vercel cron handlers. Fallback to bundled JSON data when Supabase is unreachable.

**Key Characteristics:**
- **Single Next.js app** serves both UI and API (`app/` + `app/api/`). No separate backend service.
- **Supabase-first, JSON-fallback** reads: every server-side read from `politicians` has a JSON fallback via `lib/real-data.ts` so the site renders even if the DB is down.
- **Cron-driven ingestion** layered on top of manually-invoked TS scripts. Heavy work (FEC multi-cycle pulls, OH SOS scraping, cross-ref against the pro-Israel donor registry) runs outside Next.js and writes to the same `politicians` table.
- **JSONB-heavy schema**: `voting_records`, `court_records`, `lobbying_records`, `israel_lobby_breakdown`, `individual_donor_breakdown`, `top5_donors`, `source_ids`, `social_media` all live as JSONB columns on one `politicians` row. No normalized `contributions` / `votes` / `court_cases` tables in production (`docs/DATABASE_SCHEMA.md` describes an aspirational schema that is NOT implemented).
- **Server-rendered SEO block + client-rendered UI** on `/` — the homepage emits a visually-hidden `<section>` of stats/top-targets for crawlers, then hands off to the client `TerminalHome`.
- **DB-authoritative corruption score.** Score is computed offline by `scripts/audit-politician.ts` / `scripts/sync-corruption-scores.ts` using the v6.x algorithm in `lib/corruption-score.ts` and written to `politicians.corruption_score`. Client never recomputes (see comment in `app/politician/[id]/page.tsx`).
- **Audit + bundler workflow** lives as a set of cooperating TS scripts under `scripts/` that write JSON evidence files into `data-ingestion/` and feed the individual-donor-registry crossref back onto `politicians.individual_donor_breakdown`.

## Layers

**1. Presentation Layer (`app/` pages + `components/`):**
- Purpose: Server- and client-rendered UI for the research platform.
- Location: `app/*/page.tsx`, `app/*/layout.tsx`, `components/*.tsx`.
- Contains: Route segments (App Router), React 19 Server + Client Components, Cytoscape visualization, inline-styled terminal UI.
- Depends on: Business logic (`lib/`), API routes (via `fetch('/api/...')` from Client Components), Supabase directly (from Server Components).
- Used by: End users and crawlers.
- Key files: `app/layout.tsx` (root shell, fonts, `TerminalProvider`), `app/page.tsx` (SSR homepage + SEO block), `components/TerminalHome.tsx` (44KB interactive dashboard), `components/TerminalHeader.tsx`, `components/TerminalShell.tsx`, `components/ConnectionsGraph.tsx` (Cytoscape network view), `components/PoliticianCard.tsx`, `components/ShareDossier.tsx`, `components/SearchBar.tsx`.

**2. API / Route Handler Layer (`app/api/`):**
- Purpose: REST-like endpoints (read), external API proxies (FEC), and Vercel-cron write handlers.
- Location: `app/api/**/route.ts`.
- Contains: Next.js Route Handlers (`GET` / `POST` exports). Many declare `export const dynamic = 'force-dynamic'` and `export const maxDuration = 300` (cron).
- Depends on: `lib/supabase-server.ts`, `lib/fec-client.ts`, `lib/cron-auth.ts`, `lib/corruption-score.ts`, `lib/roster-match.ts`.
- Used by: Client components, external callers, Vercel Cron Scheduler.
- Subgroups:
  - **Read endpoints:** `app/api/politicians/route.ts`, `app/api/politicians/[id]/route.ts`, `app/api/politicians/search/route.ts`, `app/api/politicians/votes/route.ts`, `app/api/bills/route.ts`, `app/api/bills/search/route.ts`, `app/api/social-posts/route.ts`, `app/api/stats/route.ts`, `app/api/connections/route.ts`, `app/api/lobbying/route.ts`, `app/api/daemon-status/route.ts`, `app/api/zip-lookup/route.ts`, `app/api/intel/route.ts`, `app/api/export/route.ts`.
  - **External-API proxies:** `app/api/fec/candidates/route.ts`, `app/api/fec/contributions/route.ts`, `app/api/fec/filings/route.ts`, `app/api/congress/members/route.ts`, `app/api/congress/bills/route.ts`, `app/api/legiscan/route.ts`.
  - **Cron write handlers (Vercel Cron):** `app/api/cron/sync-fec/route.ts`, `app/api/cron/sync-congress/route.ts`, `app/api/cron/sync-legiscan/route.ts`, `app/api/cron/sync-court-records/route.ts`, `app/api/cron/sync-social-media/route.ts`, `app/api/cron/sync-stats/route.ts`, `app/api/cron/research-candidates/route.ts`, `app/api/cron/monitor-news/route.ts`, `app/api/cron/track-fec-filings/route.ts`, `app/api/cron/refresh-gallrein-roster/route.ts`.
  - **Admin / debug:** `app/api/admin/route.ts`, `app/api/debug-candidates/route.ts`, `app/api/investigate/route.ts`.

**3. Business Logic / Shared Library (`lib/`):**
- Purpose: Domain types, scoring, data access, formatters, and integration clients reusable across pages, APIs, and scripts.
- Location: `lib/*.ts`.
- Contains: Pure TypeScript modules, no React.
- Depends on: `@supabase/supabase-js`, Node `fs`, external APIs via `fetch`.
- Used by: `app/` (server + client), `app/api/` route handlers, `scripts/`, `data-ingestion/`.
- Key modules:
  - **Types:** `lib/types.ts` — central `Politician` interface (~80 fields), `CorruptionScoreResult`, `DonorForensics`, LDA/LegiScan/LDA shapes.
  - **Data access:** `lib/supabase-server.ts` — singleton `getServerSupabase()` (anon) and `getServiceRoleSupabase()` (RLS bypass for cron).
  - **JSON fallback:** `lib/real-data.ts` — hydrates `Politician[]` from `data-ingestion/phase1/processed/florida_politicians.json` + `data-ingestion/jfk-fec-results/jfk-fec-full-results.json`, lazy-loading county fixtures.
  - **Scoring (core domain logic):** `lib/corruption-score.ts` (~38KB) — v6.x weighted 5-factor algorithm: `pacContributionRatio` (0.25), `lobbyingConnections` (0.15), `votingAlignment` (0.20), `campaignFinanceRedFlags` (0.30), `donorForensicsScore` (0.10). Dynamic weight redistribution when factors are placeholders.
  - **Audit / bundler crossref:** `lib/roster-match.ts` — shared logic between `scripts/crossref-*-pro-israel.ts` CLIs and `app/api/cron/refresh-gallrein-roster/route.ts`. Parses `data/pro-israel-donors-YYYY.csv`, fuzzy-matches individual donors by name/state/zip, writes `individual_donor_breakdown` + `source_ids.red_flags`.
  - **Display canonicalizers:** `lib/politician-display.ts` — `getCorruptionScore`, `getProIsraelLobbyAmount`, `formatLobbyAmount`, canonical labels.
  - **External API clients:** `lib/fec-client.ts` (`fecFetch`, `ISRAEL_LOBBY_COMMITTEE_IDS`, `isIsraelLobbyDonor`), `lib/courtlistener-client.ts` (CourtListener REST v4).
  - **Platform stats:** `lib/platform-stats.ts` — `getAllStats`, `getStat`, `getStats` reading from `platform_stats` key-value table.
  - **Cron auth:** `lib/cron-auth.ts` — `verifyCronAuth` checks `Authorization: Bearer $CRON_SECRET`; `cronResponse` standardises summary JSON.
  - **Research agent:** `lib/research-agent.ts` — multi-source investigation orchestrator (FEC + CourtListener + Exa + LDA + social).
  - **Misc:** `lib/state-utils.ts` (state prefix extraction from `bioguide_id`), `lib/zip-lookup.ts`, `lib/industry-classifier.ts`, `lib/format.ts`, `lib/bills-data.ts`, `lib/*-county-data.ts` (hardcoded FL county fixtures for JSON fallback).

**4. Data Ingestion Layer (`scripts/`, `data-ingestion/`, `scrapers/`):**
- Purpose: Offline pipeline that produces rows + JSONB fragments written to Supabase.
- Location: `scripts/*.ts`, `data-ingestion/*.ts|*.json|*.csv`, `scrapers/*.py`.
- Excluded from Next.js compilation (see `tsconfig.json` `"exclude": ["scripts","scrapers","data-ingestion"]`). Executed via `tsx` or `python`.
- Subgroups:
  - **Scheduled sync scripts (also invoked by crons):** `scripts/sync-fec-data.ts`, `scripts/sync-congress-data.ts`, `scripts/sync-legiscan-data.ts`, `scripts/sync-lobbying-data.ts`, `scripts/sync-voting-records.ts`, `scripts/sync-court-records-fl.ts`, `scripts/sync-court-records-oh.ts`, `scripts/sync-corruption-scores.ts`, `scripts/sync-corruption-batch.ts`, `scripts/sync-stats*`, `scripts/sync-fl-state-finance.ts`, `scripts/sync-oh-state-finance.ts`, `scripts/sync-ohio-financials.ts`, `scripts/sync-social-media.ts`, `scripts/sync-israel-lobby-donors.ts`.
  - **Seeders (state officials):** `scripts/seed-nj-officials.js`, `scripts/seed-ny-officials.js`, `scripts/seed-nc-county-officials.ts`, `scripts/seed-ohio-*.ts|.js` (county/judges/school-boards/cities), `scripts/seed-california-county-officials.js`, `scripts/seed-georgia-counties.ts`, `scripts/seed-illinois-county-officials.ts`, `scripts/seed-michigan-county-officials.js`, `scripts/seed-platform-stats.ts`, `scripts/seed-supabase.ts`.
  - **Audit / bundler workflow:** `scripts/audit-politician.ts` (generic single-politician re-score), `scripts/audit-registry-coverage.ts` (pro-Israel registry CSV coverage report), `scripts/build-pro-israel-registry.ts`, `scripts/flag-bundlers-batch.ts`, `scripts/crossref-politician-pro-israel.ts`, `scripts/crossref-acton-vivek-pro-israel.ts`, `scripts/crossref-gallrein-pro-israel.ts`, `scripts/crossref-vivek-acton-vs-pro-israel.ts`, `scripts/crossref-warner-vs-pro-israel.ts`, `scripts/apply-gallrein-roster-match.ts`, `scripts/apply-oh-gov-individual-registry.ts`, `scripts/reapply-roster-flags.ts`, `scripts/flag-acton-individual-israel-donors.ts`, `scripts/flag-vivek-individual-israel-donors.ts`, `scripts/score-vivek-acton.ts`, `scripts/compare-acton-vivek-deep.ts`, `scripts/compare-oh-gov-pro-israel.ts`, `scripts/final-ohio-report.ts`.
  - **Refresh / per-candidate:** `scripts/refresh-acton.ts`, `scripts/refresh-mast.ts`, `scripts/refresh-vivek.ts`, `scripts/restore-mast-israel-lobby.ts`, `scripts/load-mast-votes-and-recompute.ts`, `scripts/update-israel-lobby-totals.ts`.
  - **Ad-hoc fetchers:** `scripts/fetch-fec-schedule-a.ts`, `scripts/fetch-mast-ie.ts`, `scripts/fetch-oh-sos-bulk.ts`, `scripts/fetch-torres-lobbying.ts`, `scripts/fetch-vivek-fec-2024.ts`, `scripts/fetch-warner-lobbying.ts`, `scripts/probe-oh-sos*.ts`, `scripts/scrape-vivek-oh-sos*.ts`, `scripts/scrape-serpa-calaccess.ts`, `scripts/scrape-track-aipac.ts`.
  - **Long-running daemon:** `scripts/social-media-daemon.ts` (launched via `scripts/start-social-daemon.sh`).
  - **Connection graph builder:** `scripts/build-connections-graph.ts` (writes to `connection_nodes` / `connection_edges` — see `supabase/connections-schema.sql`).
  - **Python scrapers:** `scrapers/scrape-fec-data.py`, `scrapers/scrape-ohio-campaign-finance.py`, `scrapers/scrape-campaign-finance.py`, `scrapers/scrape-legal-records.py`, `scrapers/scrape-social-media.py`, `scrapers/enrich-oh-ballotpedia.py` (OpenSecrets + Ballotpedia enrichment), `scrapers/fl-doe-scraper.py`, `scrapers/fetch-fishback-fldoe.py`, `scrapers/jfk-fec-scraper.py`, `scrapers/jfk-social-scraper.py`, shared `scrapers/db_helper.py`.
  - **Raw + processed data:** `data-ingestion/phase1/processed/florida_politicians.json` (188 FL officials), `data-ingestion/jfk-fec-results/jfk-fec-full-results.json` (FEC snapshot), per-candidate JSON (`data-ingestion/*-fec-*.json`, `data-ingestion/*-roster-matches.json`, `data-ingestion/fine-israel-votes.json`, `data-ingestion/mast-israel-pac-breakdown.json`, `data-ingestion/oh-acton-*.json`, `data-ingestion/warner-*.json`, etc.), tracking CSVs (`data-ingestion/audit-tracker.csv`, `data-ingestion/audit-targets.txt`, `data-ingestion/israel-lobby-pacs.csv`).
  - **Registry (read at runtime):** `data/pro-israel-donors-YYYY.csv` (1978-2026) — the pro-Israel individual donor registry, plus `data/crossref-*.csv` and `data/warner-*.json`. Bundled into `/api/cron/refresh-gallrein-roster` via `next.config.ts` `outputFileTracingIncludes`.

**5. Database Layer (`supabase/`, Supabase PostgreSQL):**
- Purpose: Canonical store for politicians, posts, scrape audit trail, platform stats, and connection graph.
- Location: `supabase/schema.sql` (primary), `supabase/connections-schema.sql`, `supabase/migrations/00{1,2,3,4}_*.sql`.
- Tables (actually in production):
  - `politicians` — PK `bioguide_id TEXT` (app-level ID like `fl-sen-marco-rubio`, `oh-franklin-county-john-smith`). Columns: identity (`name`, `office`, `office_level`, `party`, `district`, `jurisdiction`, `jurisdiction_type`, `photo_url`), scoring (`corruption_score`, `juice_box_tier`), funding (`total_funds`, `aipac_funding`, `israel_lobby_total`, `top5_donors JSONB`, `israel_lobby_breakdown JSONB`, `contribution_breakdown JSONB`, `individual_donor_breakdown JSONB`), status (`is_active`, `is_candidate`, `running_for`, `years_in_office`), records (`lobbying_records JSONB`, `voting_records JSONB`, `court_records JSONB`), social/source (`social_media JSONB`, `source_ids JSONB`), timestamps.
  - `social_posts` — `id TEXT PK`, FK `politician_id`, platform/handle/content/post_url/posted_at, engagement counts, `sentiment_score`, `is_deleted`.
  - `scrape_runs` — audit trail for `scripts/social-media-daemon.ts` runs: status, counts, JSONB log.
  - `platform_stats` — key→value numeric store refreshed every 12 h by `app/api/cron/sync-stats/route.ts`. See `supabase/migrations/002_platform_stats.sql`.
  - `intel_alerts` — see `supabase/migrations/003_intel_alerts.sql`.
  - `connection_nodes` / `connection_edges` — donor/PAC/firm/court nodes + politician-entity edges. See `supabase/connections-schema.sql`.
- Security: RLS enabled on every table. `politicians`/`social_posts`/`scrape_runs` have wide-open policies (public read + anon insert/update/delete) — `supabase/schema.sql` lines 70-82. Cron routes use `SUPABASE_SERVICE_ROLE_KEY` via `getServiceRoleSupabase()` in `lib/supabase-server.ts`.

## Data Flow

**Real-Time Read Path (homepage / list views):**
1. Vercel serverless receives request for `/` (`app/page.tsx`).
2. `fetchPoliticians()` calls `getServerSupabase()` from `lib/supabase-server.ts`.
3. Paginated `SELECT` on `politicians` (1000/page) returning lightweight columns.
4. Rows mapped to `Politician[]` + passed to `<TerminalHome>` client component.
5. If `getServerSupabase()` returns null OR query yields 0 rows, dynamic import of `@/lib/real-data.getAllPoliticians()` rebuilds the list from `data-ingestion/phase1/processed/florida_politicians.json` + county fixtures.
6. `getAllStats()` from `lib/platform-stats.ts` fetches the `platform_stats` key-value map in parallel.

**Per-Politician Detail Path:**
1. Client-side `app/politician/[id]/page.tsx` (`'use client'`) calls `fetch('/api/politicians/[id]')`.
2. `app/api/politicians/[id]/route.ts` does `SELECT * FROM politicians WHERE bioguide_id = id` + last-20 `social_posts`.
3. Route maps snake_case row → camelCase `Politician`, also projecting `top5_donors` JSONB into `contributions`, `court_records` JSONB → `courtCases`, `voting_records` JSONB → `votes`.
4. Falls back to `real-data.ts` on 404.
5. Client triggers a second `fetch('/api/politicians/votes?bioguideId=X')` for Congress.gov or LegiScan votes on-demand (not stored in `voting_records`).

**FEC Proxy Path (interactive lookups):**
- Client → `/api/fec/candidates?...` → `lib/fec-client.ts fecFetch()` → `api.open.fec.gov/v1/...` → JSON passthrough with 5-minute `next.revalidate` cache.

**Daily Data Sync (Vercel Cron → DB):**
1. Vercel Cron hits `GET /api/cron/sync-fec` (or other cron route) with `Authorization: Bearer $CRON_SECRET`.
2. `lib/cron-auth.ts verifyCronAuth()` validates; returns 401 on mismatch.
3. Handler calls `getServiceRoleSupabase()` (bypasses RLS via service-role key).
4. Fetches upstream (FEC / Congress.gov / LegiScan / CourtListener / Google News RSS) with rate-limit-aware delays (e.g. `DELAY_MS = 600` in sync-fec).
5. Cross-references PACs against `ISRAEL_LOBBY_COMMITTEE_IDS` / name regex.
6. Upserts into `politicians` (+ JSONB columns like `israel_lobby_breakdown`, `voting_records`, `court_records`).
7. `cronResponse()` returns `{ job, success, synced, errors, details, duration_ms }`.
8. `maxDuration = 300` for the long sync crons; `120` for lighter ones.

**Audit + Bundler Cross-Reference Flow (key domain process):**
1. Analyst runs `npx tsx scripts/audit-politician.ts <bioguide_id>` (or batch `--batch audit-targets.txt`).
2. `scripts/audit-politician.ts` (`scripts/audit-politician.ts:77`) loads the row from Supabase, pulls multi-cycle FEC data via its own `fecFetch`, classifies PACs using the 32-ID `ISRAEL_LOBBY_COMMITTEE_IDS` set + `ISRAEL_NAME_RE`, pulls GovTrack votes, assigns `juice_box_tier` + `cycles_count`, recomputes score via `lib/corruption-score.ts computeCorruptionScore`, writes back to the row, appends one row to `data-ingestion/audit-tracker.csv`.
3. For individual-donor bundler signal: `scripts/crossref-politician-pro-israel.ts` (or a per-candidate variant like `crossref-acton-vivek-pro-israel.ts`) reads `data/pro-israel-donors-YYYY.csv` + the candidate's FEC Schedule A itemized donors (pulled into `data-ingestion/<cand>-fec-YYYY-itemized.json`).
4. `lib/roster-match.ts` parses both, fuzzy-matches donors by normalized name/state/zip, emits `individual_donor_breakdown` JSONB + `source_ids.red_flags` tagged with `[roster-match]` marker (idempotent).
5. The same `lib/roster-match.ts` powers the Vercel cron `app/api/cron/refresh-gallrein-roster/route.ts`, which can refresh a known candidate from production. CSVs are bundled via `next.config.ts outputFileTracingIncludes`.
6. `scripts/flag-bundlers-batch.ts` applies the flag-upgrade across many candidates.
7. Results are summarized by `scripts/final-ohio-report.ts` etc. and filtered via `scripts/audit-registry-coverage.ts`.

**Corruption Score Computation (offline batch):**
1. `scripts/sync-corruption-scores.ts` (or `sync-corruption-batch.ts` for parallelism) iterates every politician, constructs a `Politician`-shape object from the DB row, calls `computeCorruptionScore(politician)` from `lib/corruption-score.ts`.
2. Algorithm computes five factors with dynamic weight redistribution (placeholder factors keep 30% of their weight, real factors absorb the rest, individual cap at 40%).
3. Stored back in `politicians.corruption_score` (numeric 0-100) and `juice_box_tier`.
4. Client reads only `corruption_score` — never recomputes. See note in `app/politician/[id]/page.tsx:71-79`.

**Social Media Daemon (out-of-band):**
1. `scripts/social-media-daemon.ts` runs continuously (PM2 or shell).
2. Scrapes Google News RSS / platform APIs for tracked handles.
3. Inserts into `social_posts`, logs to `scrape_runs`.
4. Health checked by `/api/cron/sync-social-media/route.ts` (every 6 h) and `/api/daemon-status/route.ts`.

**Fallback Strategy:**
Every `Politician` read path catches Supabase errors → imports `lib/real-data.ts` → serves `data-ingestion/phase1/processed/florida_politicians.json` + `data-ingestion/jfk-fec-results/jfk-fec-full-results.json` + `lib/*-county-data.ts`. This makes the site SEO-stable but means stale data is served when the DB is misconfigured.

## Key Abstractions

**Politician (central domain model) — `lib/types.ts`:**
- ~80-field TypeScript interface covering identity, funding, scoring, social, source IDs, and three denormalized JSONB lists (`contributions`, `votes`, `courtCases`, `socialPosts`, `lobbyingRecords`).
- Primary key is app-level `id` (string) mirroring DB `bioguide_id`. Uses a state prefix convention: `<state>-<rest>` (e.g. `oh-franklin-county-...`, `fl-sen-marco-rubio`). See `lib/state-utils.ts`.
- Nested types: `CorruptionScoreResult` (grade, confidence, 5 factors), `DonorForensics` (missing-employer ratio, out-of-state, household bundling, platform opacity), `Contribution`, `Vote`, `CourtCase`, `SocialPost`, `LobbyingRecord`, plus LDA/LegiScan shapes for scraper consumption.

**Corruption Score Algorithm — `lib/corruption-score.ts`:**
- Base weights v6: `pacContributionRatio 0.25`, `lobbyingConnections 0.15`, `votingAlignment 0.20`, `campaignFinanceRedFlags 0.30`, `donorForensicsScore 0.10`.
- Factors produce `{ key, rawScore, weight, weightedScore, dataAvailable, explanation }`.
- `getAdjustedWeights()` redistributes weight when factors are placeholder (keeps 30% of placeholder weight, distributes rest to real-data factors, caps any single factor at 0.40).
- `juice_box_tier` floor and multi-cycle multiplier are applied by scoring scripts, not in the function itself.

**Roster-Match (bundler cross-reference) — `lib/roster-match.ts`:**
- Core CSV parser + name-normalization (`parseName`, `stripSuffix`, `norm`) shared by 6+ crossref scripts and the `refresh-gallrein-roster` cron.
- Writes a structured `individual_donor_breakdown` JSONB: `{ itemized_individual_rows, matches, high_confidence, medium_confidence, to_candidate, these_donors_to_pro_israel_career, match_rate_pct, top_donors[], source, generated_at }`.
- Updates `source_ids.red_flags[]` with entries tagged `[roster-match]` — the marker is used to make re-runs idempotent.

**ApiResponse shape / Proxy pattern — `lib/fec-client.ts`:**
- `fecFetch(endpoint, params)` is the only network call to FEC; proxy routes `app/api/fec/*/route.ts` all delegate to it.
- `FecError` (status code + message), `fecErrorResponse()` to shape 4xx/5xx JSON consistently.
- `ISRAEL_LOBBY_COMMITTEE_IDS` (9-entry map) + `ISRAEL_LOBBY_NAME_PATTERNS` (12-entry array) + `isIsraelLobbyDonor(name, id)` — the canonical classifier reused by sync-fec cron and audit scripts. NB: `scripts/audit-politician.ts` ships its own expanded 32-ID set and richer regex — these lists are currently not unified.

**Cron Handler Template — `lib/cron-auth.ts`:**
- Every cron `route.ts` follows: `verifyCronAuth(request) → getServiceRoleSupabase() → work → cronResponse(job, {success, synced, errors, details, duration_ms})`.
- Standardized `maxDuration = 300` (or 120), `export const dynamic = 'force-dynamic'`.

**Platform Stats (live-numbers registry) — `lib/platform-stats.ts`:**
- Every user-visible stat on the homepage / dashboard is read from the `platform_stats` key-value table via `getAllStats()` / `getStat(key)`.
- The table is refreshed every 12 h by `app/api/cron/sync-stats/route.ts`. Keys: `total_politicians`, `total_active`, `total_funded`, `israel_lobby_total`, `avg_corruption_score`, `compromised_count`, `state_<XX>_count`, etc. No hardcoded numbers in UI by policy.

**Supabase singleton + service-role split — `lib/supabase-server.ts`:**
- `getServerSupabase()` — anon-key, memoized, read path.
- `getServiceRoleSupabase()` — service-role key, memoized, write path. Falls back to anon if service role not set.
- Both return `null` when env vars missing so callers must always null-check (drives the fallback-to-JSON pattern).

**State Prefix Convention — `lib/state-utils.ts`:**
- Politician IDs encode state via a 2-letter prefix + dash. Everything else (UUIDs, FL county codes like `pc-`, `vc-`) defaults to FL.
- `filterByState()` is called in `/api/politicians`, `app/page.tsx`, and homepage.

## Entry Points

**Frontend (pages):**
- `app/page.tsx` → `/` — landing page with "Enter Terminal" gate, server-rendered SEO stats block, client-side `TerminalHome`.
- `app/layout.tsx` → root shell (fonts, metadata, `TerminalProvider` context, `TerminalShell`).
- `app/officials/page.tsx` → `/officials` — seated officials filtered by state/level.
- `app/candidates/page.tsx` + `app/candidates/CandidateCompare.tsx` → `/candidates` — 2026 candidates grouped by race.
- `app/browse/page.tsx` + `app/browse/BrowseClient.tsx` → `/browse` — search + filter.
- `app/juicebox/page.tsx` + `app/juicebox/layout.tsx` → `/juicebox` — corruption score leaderboard.
- `app/hierarchy/page.tsx` + `app/hierarchy/layout.tsx` → `/hierarchy` — drill-down by jurisdiction.
- `app/connections/page.tsx` + `app/connections/layout.tsx` → `/connections` — Cytoscape donor/politician graph (`components/ConnectionsGraph.tsx`).
- `app/compare/page.tsx` + `app/compare/layout.tsx` → `/compare` — side-by-side.
- `app/social/page.tsx` + `app/social/layout.tsx` → `/social` — social/news feed.
- `app/politician/[id]/page.tsx` + `app/politician/[id]/layout.tsx` → `/politician/[id]` — full dossier (client component, 5 tabs).
- `app/embed/[id]/page.tsx` + `app/embed/[id]/EmbedDossier.tsx` → `/embed/[id]` — embeddable widget.
- `app/about/page.tsx`, `app/dashboard/page.tsx` (legacy, leaks — per PROJECT.md), `app/intel/page.tsx`, `app/investigate/page.tsx`, `app/tools/page.tsx`, `app/zip/page.tsx`, `app/admin/page.tsx` + `app/admin/layout.tsx`.
- `app/sitemap.ts`, `app/robots.ts`, `app/not-found.tsx`, `app/loading.tsx`.

**API (REST):**
- `GET /api/politicians` → `Politician[]`, paginated Supabase fetch with JSON fallback.
- `GET /api/politicians/[id]` → single `Politician` with expanded JSONB projections.
- `GET /api/politicians/search?q=...` → lightweight filter.
- `GET /api/politicians/votes?bioguideId=X` → Congress.gov or LegiScan votes (dynamic).
- `GET /api/bills` / `GET /api/bills/search?q=X`.
- `GET /api/fec/{candidates,contributions,filings}` → FEC proxy.
- `GET /api/congress/{members,bills}` → Congress.gov proxy.
- `GET /api/lobbying?politicianId=X` → LDA Senate API.
- `GET /api/legiscan` → LegiScan proxy.
- `GET /api/social-posts` → `social_posts` query.
- `GET /api/stats` → `platform_stats` read.
- `GET /api/connections` → `connection_nodes` + `connection_edges`.
- `GET /api/export` → CSV download.
- `GET /api/zip-lookup` → ZIP-to-district helper.
- `GET /api/daemon-status` → `scrape_runs` health.
- `GET /api/investigate`, `GET /api/intel` → research-agent endpoints.
- `GET /api/admin`, `GET /api/debug-candidates` → guarded admin endpoints.

**Cron (Vercel Cron Scheduler):**
- `GET /api/cron/sync-fec` — 3 AM UTC daily (FEC multi-cycle + IE + Israel-lobby classification, max 50 pol/run).
- `GET /api/cron/sync-congress` — 4 AM UTC daily.
- `GET /api/cron/sync-legiscan` — 5 AM UTC daily.
- `GET /api/cron/sync-court-records` — hourly.
- `GET /api/cron/sync-social-media` — every 6 h (health-check only).
- `GET /api/cron/sync-stats` — every 12 h (refreshes `platform_stats`).
- `GET /api/cron/research-candidates` — 6 AM UTC daily.
- `GET /api/cron/monitor-news`, `track-fec-filings`, `refresh-gallrein-roster` — additional scheduled jobs.

**Scripts (CLI, `tsx`):**
- `npx tsx scripts/audit-politician.ts <bioguide_id>` — generic single-politician audit + re-score.
- `npx tsx scripts/audit-politician.ts --batch data-ingestion/audit-targets.txt` — batch.
- `npx tsx scripts/sync-fec-data.ts [--dry-run] [--limit N] [--cycle YYYY]` — FEC sync.
- `npx tsx scripts/sync-corruption-scores.ts` — batch re-score.
- `npx tsx scripts/crossref-politician-pro-israel.ts <bioguide_id>` — bundler crossref.
- `npx tsx scripts/build-connections-graph.ts` — rebuild graph.
- `bash scripts/start-social-daemon.sh` → `scripts/social-media-daemon.ts`.

**Python (scrapers):**
- `python scrapers/scrape-ohio-campaign-finance.py` — OH SOS.
- `python scrapers/enrich-oh-ballotpedia.py` — Ballotpedia + OpenSecrets.
- `python scrapers/fl-doe-scraper.py` — FL Division of Elections (Phase 6/7 target).
- `python scrapers/scrape-fec-data.py`, `scrape-legal-records.py`, `scrape-social-media.py`, `jfk-fec-scraper.py`, `jfk-social-scraper.py`, `fetch-fishback-fldoe.py`.
- Shared `scrapers/db_helper.py` Supabase helper.

**Database:**
- Supabase project URL via `SUPABASE_URL`.
- Schema: `supabase/schema.sql`, `supabase/connections-schema.sql`, `supabase/migrations/001_add_contribution_breakdown.sql`, `002_platform_stats.sql`, `003_intel_alerts.sql`, `004_add_individual_donor_breakdown.sql`.

## Error Handling

**Strategy:** Defensive at every boundary; always fall back rather than 500.

**Patterns:**
- API routes: `try` / `catch (error)` → `console.error(...)` → return `cachedResponse({ error: 'message' }, status)` or degrade to JSON fallback. See `app/api/politicians/[id]/route.ts`.
- Supabase calls: always destructure `{ data, error }`, treat `error || !data` as a fall-back trigger, not a 500.
- FEC: `lib/fec-client.ts FecError` subclass carries a status. Rate-limit (429) surfaced with explicit message.
- Cron: `verifyCronAuth` returns 401 synchronously; body errors are swallowed into the `cronResponse` summary with `errors: N` + `details: {...}`.
- Scripts: `auditOne()` in `scripts/audit-politician.ts` returns `null` on failure; caller appends to `audit-tracker.csv` for postmortem. FEC 429 triggers 30s sleep + retry.

## Cross-Cutting Concerns

**Logging:** `console.log` / `console.error` in cron + API routes. No structured logger. Cron returns a machine-readable summary JSON.

**Validation:** Ad-hoc. No Zod. Scripts trust FEC/LegiScan responses; type-cast via `as`. Supabase row → Politician mapping does `Number(row.x) || 0` defensively but does not validate shape.

**Authentication:** Public platform — no end-user auth. Cron endpoints gated by `Authorization: Bearer $CRON_SECRET` (`lib/cron-auth.ts`). Admin panel: `ADMIN_SECRET` env var (not enforced consistently). Service-role key only used server-side via `getServiceRoleSupabase()`; NEVER shipped to the client.

**Caching:**
- Homepage: `export const revalidate = 300` (5-min ISR).
- `/api/politicians`: `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`.
- `/api/politicians/[id]`: `Cache-Control: no-store` (force fresh).
- FEC proxy: `next.revalidate = 300`.
- Cron routes: `dynamic = 'force-dynamic'` (never cached).

**Secrets Handling:** All keys via `process.env` read in `lib/supabase-server.ts`, `lib/fec-client.ts`, `lib/courtlistener-client.ts`, `lib/research-agent.ts`. Historical issue (per `.planning/PROJECT.md`): 8 scripts hardcoded the Supabase service-role JWT — remediated, key rotation still pending.

**Rate-Limit Awareness:** Hardcoded delays between upstream requests (`DELAY_MS = 600` in sync-fec, 30s sleep-on-429 in audit). No shared rate-limit abstraction.

**RLS Note:** Current production RLS policies allow public insert/update/delete on `politicians` (see `supabase/schema.sql` lines 75-82). Intended only for seeding convenience — a hardening target.

---

*Architecture analysis: 2026-04-22*

# Codebase Structure

**Analysis Date:** 2026-04-22

## Directory Layout

```
Snitched.ai/
├── app/                         # Next.js 16 App Router (pages + API routes)
│   ├── layout.tsx               # Root shell: fonts, metadata, TerminalProvider
│   ├── page.tsx                 # Homepage with server-rendered SEO block
│   ├── globals-terminal.css     # Global terminal/Bloomberg styles
│   ├── loading.tsx              # Global loading UI
│   ├── not-found.tsx            # 404 handler
│   ├── robots.ts                # Generated robots.txt
│   ├── sitemap.ts               # Generated sitemap.xml
│   ├── about/page.tsx
│   ├── admin/{layout,page}.tsx
│   ├── browse/{page,BrowseClient}.tsx
│   ├── candidates/{page,CandidateCompare}.tsx
│   ├── compare/{layout,page}.tsx
│   ├── connections/{layout,page}.tsx
│   ├── dashboard/page.tsx       # Legacy — publicly leaks data (see PROJECT.md)
│   ├── embed/[id]/{page,EmbedDossier}.tsx
│   ├── hierarchy/{layout,page}.tsx
│   ├── intel/page.tsx
│   ├── investigate/page.tsx
│   ├── juicebox/{layout,page}.tsx
│   ├── officials/page.tsx
│   ├── politician/[id]/{layout,page}.tsx   # Dossier (5 tabs, client component)
│   ├── social/{layout,page}.tsx
│   ├── tools/page.tsx
│   ├── zip/page.tsx
│   └── api/                     # Route handlers
│       ├── admin/route.ts
│       ├── bills/{route.ts, search/route.ts}
│       ├── congress/{bills,members}/route.ts
│       ├── connections/route.ts
│       ├── cron/                # 10 Vercel cron handlers (write path)
│       │   ├── monitor-news/route.ts
│       │   ├── refresh-gallrein-roster/route.ts
│       │   ├── research-candidates/route.ts
│       │   ├── sync-congress/route.ts
│       │   ├── sync-court-records/route.ts
│       │   ├── sync-fec/route.ts
│       │   ├── sync-legiscan/route.ts
│       │   ├── sync-social-media/route.ts
│       │   ├── sync-stats/route.ts
│       │   └── track-fec-filings/route.ts
│       ├── daemon-status/route.ts
│       ├── debug-candidates/route.ts
│       ├── export/route.ts
│       ├── fec/{candidates,contributions,filings}/route.ts   # FEC proxy
│       ├── intel/route.ts
│       ├── investigate/route.ts
│       ├── legiscan/route.ts
│       ├── lobbying/route.ts
│       ├── politicians/
│       │   ├── route.ts          # GET /api/politicians
│       │   ├── [id]/route.ts     # GET /api/politicians/[id]
│       │   ├── search/route.ts
│       │   └── votes/route.ts
│       ├── social-posts/route.ts
│       ├── stats/route.ts
│       ├── webhooks/             # (empty — placeholder)
│       └── zip-lookup/route.ts
│
├── components/                  # Reusable React components (all top-level, no subdirs)
│   ├── ComingSoon.tsx
│   ├── ConnectionsGraph.tsx     # Cytoscape.js donor/politician network
│   ├── PoliticianCard.tsx
│   ├── SearchBar.tsx            # Global autocomplete
│   ├── ShareDossier.tsx
│   ├── SocialFeed.tsx
│   ├── TerminalContext.tsx      # "Enter Terminal" client-side state
│   ├── TerminalHeader.tsx       # Top nav + state selector
│   ├── TerminalHome.tsx         # Main landing dashboard (44KB)
│   ├── TerminalShell.tsx        # Conditional header render wrapper
│   ├── USMap.tsx
│   └── ZipMap.tsx
│
├── lib/                         # Shared TS modules (domain + integrations)
│   ├── types.ts                 # Politician, CorruptionScoreResult, LDA/LegiScan
│   ├── supabase-server.ts       # getServerSupabase / getServiceRoleSupabase
│   ├── real-data.ts             # JSON fallback aggregator
│   ├── corruption-score.ts      # v6.x 5-factor scoring algorithm (38KB)
│   ├── roster-match.ts          # Pro-Israel individual-donor crossref (shared)
│   ├── fec-client.ts            # FEC API wrapper + Israel-lobby classifier
│   ├── courtlistener-client.ts  # CourtListener REST v4 wrapper
│   ├── research-agent.ts        # Multi-source investigation orchestrator
│   ├── platform-stats.ts        # platform_stats key-value reader
│   ├── politician-display.ts    # Canonical score/lobby formatters + labels
│   ├── cron-auth.ts             # verifyCronAuth + cronResponse
│   ├── state-utils.ts           # State prefix extraction
│   ├── zip-lookup.ts            # ZIP → district
│   ├── industry-classifier.ts   # Donor industry categorization
│   ├── format.ts                # Number/money formatters
│   ├── bills-data.ts            # Sample bills
│   ├── brevard-county-data.ts   # FL county fallback fixtures
│   ├── flagler-county-data.ts
│   ├── lake-county-data.ts
│   ├── orange-county-data.ts
│   ├── putnam-county-data.ts
│   ├── seminole-county-data.ts
│   └── volusia-county-data.ts
│
├── data/                        # Read-at-runtime reference data (bundled via next.config.ts)
│   ├── pro-israel-donors-YYYY.csv   # 1978-2026 annual pro-Israel individual donor registry
│   ├── crossref-acton-vs-pro-israel.csv
│   ├── crossref-vivek-vs-pro-israel.csv
│   ├── crossref-warner-vs-pro-israel.csv
│   ├── warner-2026-proisrael.json
│   └── warner-pro-israel-pacs-lifetime.json
│
├── data-ingestion/              # Offline data pipeline inputs + outputs
│   ├── convert-existing-fec-data.ts   # (transitional utility)
│   ├── fetch-fec-data.ts
│   ├── fetch-legiscan-data.ts
│   ├── audit-tracker.csv        # Output from scripts/audit-politician.ts
│   ├── audit-targets.txt        # One bioguide_id per line (batch input)
│   ├── israel-lobby-pacs.csv
│   ├── phase1/                  # Florida baseline
│   │   ├── processed/florida_politicians.json    # 188 FL officials
│   │   ├── processed/sample_10_records.json
│   │   ├── processed/social_media_enhancement_targets.json
│   │   ├── processed/supabase_payloads/
│   │   ├── reports/quality_report.json
│   │   ├── MISSION_COMPLETE.md
│   │   └── README.md
│   ├── jfk-fec-results/         # FEC snapshot (2026-02-22)
│   │   ├── jfk-fec-full-results.json
│   │   └── jfk-fec-summary.json
│   ├── *-fec-YYYY-itemized.json       # Per-candidate Schedule A pulls
│   ├── *-roster-matches.json          # Per-candidate pro-Israel match output
│   ├── fine-israel-votes.json
│   ├── mast-israel-*.{csv,json}
│   ├── oh-acton-*.json                # Ohio governor race evidence
│   ├── oh-gov-pac-*.csv
│   ├── vivek-fec-2024-itemized.json
│   ├── vivek-oh-sos-itemized.json
│   └── warner-*.json
│
├── scrapers/                    # Python scrapers (Scrapling, Playwright)
│   ├── db_helper.py             # Shared Supabase helper
│   ├── requirements.txt
│   ├── scrape-fec-data.py
│   ├── scrape-ohio-campaign-finance.py
│   ├── scrape-campaign-finance.py
│   ├── scrape-social-media.py
│   ├── scrape-legal-records.py
│   ├── scraper.py
│   ├── enrich-oh-ballotpedia.py     # OpenSecrets + Ballotpedia enrichment
│   ├── fl-doe-scraper.py            # FL Division of Elections (Phase 6/7)
│   ├── fetch-fishback-fldoe.py
│   ├── jfk-fec-scraper.py
│   ├── jfk-social-scraper.py
│   ├── sample-data/
│   ├── logs/
│   ├── README.md
│   ├── INSTALLATION.md
│   ├── INTEGRATION_REPORT.md
│   └── DELIVERABLES.md
│
├── scripts/                     # TypeScript CLI tools (tsx)
│   ├── audit-politician.ts          # Generic single-politician audit + re-score
│   ├── audit-registry-coverage.ts   # Pro-Israel registry CSV coverage report
│   ├── sync-fec-data.ts             # FEC → Supabase
│   ├── sync-congress-data.ts
│   ├── sync-legiscan-data.ts
│   ├── sync-lobbying-data.ts
│   ├── sync-voting-records.ts
│   ├── sync-court-records-fl.ts
│   ├── sync-court-records-oh.ts
│   ├── sync-corruption-scores.ts    # Batch re-score
│   ├── sync-corruption-batch.ts     # Parallelized variant
│   ├── sync-fl-state-finance.ts
│   ├── sync-oh-state-finance.ts
│   ├── sync-ohio-financials.ts
│   ├── sync-israel-lobby-donors.ts
│   ├── sync-pa-county-officials.ts
│   ├── sync-social-media.ts
│   ├── social-media-daemon.ts       # Long-running daemon
│   ├── start-social-daemon.sh
│   ├── save-cf-token.sh
│   ├── research-fl-bulk.ts
│   ├── research-fl-candidates.sh
│   ├── run-news-monitor.ts
│   ├── build-connections-graph.ts   # connection_nodes + connection_edges
│   ├── build-pro-israel-registry.ts
│   ├── crossref-politician-pro-israel.ts       # Generic bundler crossref
│   ├── crossref-acton-vivek-pro-israel.ts
│   ├── crossref-gallrein-pro-israel.ts
│   ├── crossref-vivek-acton-vs-pro-israel.ts
│   ├── crossref-warner-vs-pro-israel.ts
│   ├── apply-gallrein-roster-match.ts
│   ├── apply-oh-gov-individual-registry.ts
│   ├── reapply-roster-flags.ts
│   ├── flag-bundlers-batch.ts
│   ├── flag-acton-individual-israel-donors.ts
│   ├── flag-vivek-individual-israel-donors.ts
│   ├── score-vivek-acton.ts
│   ├── compare-acton-vivek-deep.ts
│   ├── compare-oh-gov-pro-israel.ts
│   ├── final-ohio-report.ts
│   ├── refresh-acton.ts
│   ├── refresh-mast.ts
│   ├── refresh-vivek.ts
│   ├── restore-mast-israel-lobby.ts
│   ├── load-mast-votes-and-recompute.ts
│   ├── update-israel-lobby-totals.ts
│   ├── fetch-fec-schedule-a.ts
│   ├── fetch-mast-ie.ts
│   ├── fetch-oh-sos-bulk.ts
│   ├── fetch-torres-lobbying.ts
│   ├── fetch-vivek-fec-2024.ts
│   ├── fetch-warner-lobbying.ts
│   ├── probe-oh-sos*.ts                         # 5 OH SOS probes
│   ├── scrape-vivek-oh-sos*.ts                  # 3 OH SOS scrapers
│   ├── scrape-serpa-calaccess.ts
│   ├── scrape-track-aipac.ts
│   ├── import-vivek-csv.ts
│   ├── ingest-oh-acton-itemized.ts
│   ├── oh-gov-pac-donations.ts
│   ├── oh-gov-pro-israel-donation-log.ts
│   ├── lda_oh_populate.ts
│   ├── populate-oh-voting-records.ts
│   ├── seed-california-county-officials.js      # State seeders
│   ├── seed-georgia-counties.ts
│   ├── seed-illinois-county-officials.ts
│   ├── seed-michigan-county-officials.js
│   ├── seed-nc-county-officials.ts
│   ├── seed-nj-officials.js
│   ├── seed-ny-officials.js
│   ├── seed-oh-israel-lobby.ts
│   ├── seed-ohio-18-counties.ts
│   ├── seed-ohio-20-counties.js
│   ├── seed-ohio-20counties.ts
│   ├── seed-ohio-county-officials.js
│   ├── seed-ohio-judges.js
│   ├── seed-ohio-school-boards.js
│   ├── seed-ohio-state-federal-officials.js
│   ├── seed-platform-stats.ts
│   ├── seed-supabase.ts
│   ├── create-platform-stats-table.ts
│   ├── add-ohio-cities.ts
│   ├── check-van-wert.ts
│   ├── enrich-oh-fec-batch.ts
│   ├── verify-nc-officials.ts
│   ├── verify-new-officials.ts
│   ├── verify-ohio*.ts                          # 4 OH verifiers
│   ├── verify-pa-officials.ts
│   ├── warner-crossref-by-candidate.ts
│   ├── warner-cycle-test.ts
│   ├── warner-pac-scan.ts
│   ├── warner-verify.ts
│   └── pro-israel-pacs.json                     # Static reference
│
├── supabase/                    # DB schema + migrations
│   ├── schema.sql               # Main politicians + social_posts + scrape_runs
│   ├── connections-schema.sql   # connection_nodes + connection_edges
│   └── migrations/
│       ├── 001_add_contribution_breakdown.sql
│       ├── 002_platform_stats.sql
│       ├── 003_intel_alerts.sql
│       └── 004_add_individual_donor_breakdown.sql
│
├── investigations/              # Per-investigation agent workspaces
│   ├── fl-polk-lakeland-mayor-mccarley/
│   │   └── agent-stderr.log
│   └── fl-polk-schoolboard-d6-sharpless/
│       └── agent-stderr.log
│
├── types/
│   └── cytoscape-fcose.d.ts     # Type shim for cytoscape-fcose
│
├── docs/                        # Hand-written docs (partly stale)
│   ├── DATABASE_SCHEMA.md       # Aspirational — not implemented as-is
│   ├── DISABLED_CRONS.md
│   ├── PHASE_2_UPDATES.md
│   ├── TEAM.md
│   └── TICKETS.md
│
├── public/                      # Static assets (images, og-image.png, etc.)
│
├── .planning/                   # GSD planning artifacts
│   ├── PROJECT.md               # Project snapshot (Core Value, Constraints)
│   ├── ROADMAP.md               # 10-phase v1.0 milestone plan
│   ├── STATE.md                 # Current phase, progress, blockers
│   ├── codebase/                # This directory — generated analysis
│   ├── phases/                  # Per-phase plans
│   ├── quick/                   # Quick-task records
│   └── memory/
│
├── .next/                       # Build output (gitignored)
├── .vercel/                     # Vercel project metadata
├── node_modules/
├── package.json                 # 10 prod deps, 10 dev deps (see STACK.md)
├── package-lock.json
├── tsconfig.json                # ES2017, strict, `@/*` alias, excludes scripts/scrapers/data-ingestion
├── next.config.ts               # outputFileTracingIncludes for roster-match CSVs
├── next-env.d.ts
├── postcss.config.mjs           # @tailwindcss/postcss
├── vercel.json                  # Empty crons array (config lives in Vercel dashboard)
├── .vercelignore
├── .env                         # Local secrets (gitignored)
├── CLAUDE.md                    # GSD-managed project context file
├── README.md                    # Public-facing feature overview
├── MOBILE-OPTIMIZATION-PLAN.md
├── *_SEEDING_REPORT.md          # Post-seed reports (OH/NJ/NC)
├── Eleni Contribution.xls       # Raw evidence (investigation artifact)
└── Snitched_ai_PRD_v2.0_Complete.docx
```

## Directory Purposes

**`app/`:**
- Purpose: Next.js App Router — every page and API route.
- Contains: Route segments (`page.tsx`, `layout.tsx`, `loading.tsx`, `not-found.tsx`), API handlers (`route.ts`), global CSS, `robots.ts`/`sitemap.ts`.
- Key files: `app/layout.tsx` (root HTML shell), `app/page.tsx` (homepage SSR + SEO block), `app/politician/[id]/page.tsx` (client dossier), `app/api/politicians/[id]/route.ts` (single-politician endpoint), `app/api/cron/sync-fec/route.ts` (canonical cron template).

**`app/api/`:**
- Purpose: All REST endpoints. Mirrors domain groupings (`politicians/`, `fec/`, `congress/`, `legiscan/`, `lobbying/`, `cron/`, `admin/`).
- Contains: `route.ts` files that export `GET` / `POST` Route Handlers. Most cron handlers declare `export const maxDuration = 300` and `export const dynamic = 'force-dynamic'`.

**`app/api/cron/`:**
- Purpose: Vercel-scheduled write handlers.
- Contains: 10 cron endpoints; each imports `verifyCronAuth` + `cronResponse` from `@/lib/cron-auth` and `getServiceRoleSupabase` from `@/lib/supabase-server`.

**`components/`:**
- Purpose: Reusable React components (mostly Client Components).
- Contains: Flat list (no subdirectories). PascalCase `.tsx` files. `'use client'` directive on any file using state, effects, or browser APIs.
- Key files: `TerminalHome.tsx` (main dashboard, 44KB — candidate for extraction), `ConnectionsGraph.tsx` (Cytoscape), `SearchBar.tsx`, `PoliticianCard.tsx`, `ShareDossier.tsx`, `TerminalHeader.tsx`, `TerminalShell.tsx`, `TerminalContext.tsx`.

**`lib/`:**
- Purpose: All shared TypeScript modules. Business logic, data access, API wrappers, formatters, county fixtures.
- Contains: Kebab-case `.ts` files. No React. Imported via `@/lib/...` alias.
- Key files: `lib/types.ts` (domain types), `lib/corruption-score.ts` (scoring), `lib/roster-match.ts` (bundler crossref), `lib/supabase-server.ts` (DB singletons), `lib/fec-client.ts`, `lib/platform-stats.ts`, `lib/politician-display.ts`.

**`data/`:**
- Purpose: Read-at-runtime CSV/JSON reference data. Bundled into specific Vercel serverless functions via `next.config.ts` `outputFileTracingIncludes`.
- Contains: `pro-israel-donors-YYYY.csv` (annual pro-Israel individual donor registry 1978-2026), crossref output CSVs, Warner JSON.
- Committed: Yes.

**`data-ingestion/`:**
- Purpose: Offline pipeline inputs and outputs. Mostly JSON evidence files + tracking CSV/TXT.
- Contains: Per-candidate FEC pulls (`*-fec-YYYY-itemized.json`), roster-match output (`*-roster-matches.json`), audit tracking (`audit-tracker.csv`, `audit-targets.txt`), Phase 1 Florida baseline (`phase1/`), FEC snapshot (`jfk-fec-results/`), CA state contributions, OH governor race evidence.
- Excluded from Next.js compilation (`tsconfig.json`). Referenced by `lib/real-data.ts` via bundled JSON imports for fallback only.

**`scrapers/`:**
- Purpose: Python scraper tooling. Not part of Next.js.
- Contains: `scrape-*.py` (FEC, OH campaign finance, legal records, social media, FL DOE), Ballotpedia/OpenSecrets enricher, shared `db_helper.py` Supabase helper, `requirements.txt`.
- Excluded from Next.js compilation.

**`scripts/`:**
- Purpose: TypeScript CLI tools. Sync scripts, seeders, audit + crossref tools, per-candidate refresh.
- Contains: ~100 `.ts` / `.js` / `.sh` files. Run via `npx tsx scripts/<name>.ts` (or `node` for `.js`, `bash` for `.sh`).
- Excluded from Next.js compilation. Can import from `lib/` via relative paths (`../lib/...`) — see `scripts/audit-politician.ts:18`.
- Subgroups: `sync-*` (cron twins), `seed-*` (state backfills), `audit-*`, `crossref-*`, `flag-*`, `refresh-*`, `fetch-*`, `scrape-*`, `probe-*`, `verify-*`, `warner-*`.

**`supabase/`:**
- Purpose: DB schema source of truth.
- Contains: `schema.sql` (main), `connections-schema.sql` (graph), numbered migrations in `migrations/`.
- Note: Apply manually via Supabase SQL editor — no migration runner wired into CI.

**`investigations/`:**
- Purpose: Per-investigation workspaces (one directory per investigation slug).
- Contains: Currently only `agent-stderr.log` files. Pattern: `<state>-<county>-<office>-<name>/`.

**`types/`:**
- Purpose: Ambient `.d.ts` declarations for packages without bundled types.
- Contains: `cytoscape-fcose.d.ts` (shim for the fcose layout extension).

**`docs/`:**
- Purpose: Hand-written project docs. Partially stale (`DATABASE_SCHEMA.md` describes an aspirational schema not in production).
- Contains: `DATABASE_SCHEMA.md`, `DISABLED_CRONS.md`, `PHASE_2_UPDATES.md`, `TEAM.md`, `TICKETS.md`.

**`.planning/`:**
- Purpose: GSD (Get-Shit-Done) workflow artifacts.
- Contains: `PROJECT.md`, `ROADMAP.md`, `STATE.md`, phase plans (`phases/`), quick-tasks (`quick/`), this codebase map (`codebase/`), memory notes.
- Committed: Yes.

**`public/`:**
- Purpose: Static assets served from root URL.
- Contains: `og-image.png`, favicons, images. Referenced by `app/layout.tsx` metadata.

## Key File Locations

**Entry Points:**
- `app/layout.tsx`: Root layout — fonts, metadata, `TerminalProvider`, `TerminalShell`.
- `app/page.tsx`: Homepage — server-rendered SEO stats + client `TerminalHome`.
- `app/politician/[id]/page.tsx`: Dossier page — client component, 5 tabs, fetches `/api/politicians/[id]`.
- `app/api/politicians/[id]/route.ts`: Single-politician GET endpoint.
- `app/api/cron/sync-fec/route.ts`: Canonical cron route template.

**Configuration:**
- `next.config.ts`: Next.js config (`outputFileTracingIncludes` bundling for `data/pro-israel-donors-*.csv`).
- `tsconfig.json`: ES2017, strict, path alias `@/* → ./`, excludes `scripts/`, `scrapers/`, `data-ingestion/`.
- `package.json`: 10 prod deps (`next`, `react`, `cytoscape`, `leaflet`, `dotenv`), 10 dev deps (`@supabase/supabase-js`, `tailwindcss`, `tsx`, `playwright`).
- `postcss.config.mjs`: Tailwind plugin.
- `vercel.json`: Empty `crons` (cron config is in the Vercel dashboard).
- `.env`: Local secrets (gitignored).
- `.vercelignore`: Excludes from Vercel deploy.

**Core Logic:**
- `lib/types.ts`: `Politician`, `CorruptionScoreResult`, `DonorForensics`, LDA/LegiScan types.
- `lib/corruption-score.ts`: v6.x weighted scoring algorithm (5 factors, 38KB).
- `lib/roster-match.ts`: Shared pro-Israel individual-donor crossref engine.
- `lib/fec-client.ts`: FEC API wrapper + `ISRAEL_LOBBY_COMMITTEE_IDS` classifier.
- `lib/supabase-server.ts`: Supabase singletons (anon + service-role).
- `lib/real-data.ts`: JSON fallback aggregator (uses `data-ingestion/phase1/*`).
- `lib/platform-stats.ts`: `platform_stats` KV reader.
- `lib/politician-display.ts`: `getCorruptionScore`, `getProIsraelLobbyAmount`, canonical labels.
- `lib/cron-auth.ts`: `verifyCronAuth` + `cronResponse`.
- `lib/state-utils.ts`: State prefix extraction.

**Database:**
- `supabase/schema.sql`: `politicians`, `social_posts`, `scrape_runs`.
- `supabase/connections-schema.sql`: `connection_nodes`, `connection_edges`.
- `supabase/migrations/001_add_contribution_breakdown.sql`: `contribution_breakdown` JSONB.
- `supabase/migrations/002_platform_stats.sql`: `platform_stats` KV table.
- `supabase/migrations/003_intel_alerts.sql`: Intel alerts.
- `supabase/migrations/004_add_individual_donor_breakdown.sql`: `individual_donor_breakdown` JSONB.

**Testing:**
- No test files detected. 0% coverage per `PROJECT.md`. Playwright installed but no tests on disk.

## Naming Conventions

**Files:**
- React components: `PascalCase.tsx` — `TerminalHome.tsx`, `ConnectionsGraph.tsx`, `PoliticianCard.tsx`.
- Library modules: `kebab-case.ts` — `fec-client.ts`, `corruption-score.ts`, `supabase-server.ts`, `roster-match.ts`.
- Route files: `route.ts` (required by Next.js).
- Page files: `page.tsx` (required by Next.js).
- Layout files: `layout.tsx` (required by Next.js).
- Scripts: `kebab-case.ts` / `.js` — `sync-fec-data.ts`, `audit-politician.ts`, `seed-nj-officials.js`.
- Python: `kebab-case.py` — `scrape-fec-data.py`, `enrich-oh-ballotpedia.py`. Exception: `db_helper.py` (snake_case for non-entrypoint utilities).
- SQL: `snake_case.sql` with numbered migration prefix — `001_add_contribution_breakdown.sql`.
- County data: `<county>-county-data.ts` — `volusia-county-data.ts`, `orange-county-data.ts`.

**Directories:**
- Route segments: `kebab-case` — `politician/`, `api/cron/sync-fec/`, `api/fec/candidates/`.
- Dynamic routes: `[param]` — `[id]`.
- Investigations: `<state>-<county>-<office>-<slug>/` — `fl-polk-lakeland-mayor-mccarley/`.

**IDs:**
- Politician ID format: `<state>-<office-or-county>-<name-slug>` — `fl-sen-marco-rubio`, `oh-franklin-county-john-smith`. FL-only records may use county codes (`pc-`, `vc-`, `fc-`) or UUIDs (fallback to FL in `lib/state-utils.ts`).

## Where to Add New Code

**New page/route:**
- Location: `app/<route-name>/page.tsx` (kebab-case).
- Nested under a layout if it needs a shared wrapper: `app/<route-name>/layout.tsx`.
- For a client page, add `'use client'` at the top. For SSR with data, make it `async` and fetch from Supabase via `getServerSupabase()` or from an API route.
- Add state filtering via `lib/state-utils.ts filterByState()` if listing politicians.
- Example: `/politician/[id]` → `app/politician/[id]/page.tsx` (client, fetches `/api/politicians/[id]`).

**New API endpoint:**
- Location: `app/api/<domain>/<endpoint>/route.ts`.
- Import from `@/lib/supabase-server` for reads, `@/lib/cron-auth` + service-role client for writes.
- Declare `export const dynamic = 'force-dynamic'` for fresh reads; use `Cache-Control: public, s-maxage=...` headers for cached GETs.
- Follow the pattern in `app/api/politicians/[id]/route.ts` (snake_case DB row → camelCase `Politician` mapping + JSON fallback via `lib/real-data.ts`).
- For external API proxies: follow `app/api/fec/candidates/route.ts` → delegate to the `lib/fec-client.ts fecFetch()` wrapper.

**New cron job:**
- Location: `app/api/cron/<job-name>/route.ts`.
- Template: import `verifyCronAuth`, `cronResponse` from `@/lib/cron-auth`; `getServiceRoleSupabase` from `@/lib/supabase-server`; declare `export const maxDuration = 300` and `export const dynamic = 'force-dynamic'`.
- Register the schedule in the Vercel dashboard (the `vercel.json` `crons` array is empty — all schedule config is remote).
- If the cron reads bundled CSV/JSON, add the glob to `next.config.ts outputFileTracingIncludes` keyed by the route path (see the `refresh-gallrein-roster` entry).

**New React component:**
- Location: `components/<PascalCase>.tsx`. Flat — no subdirectories.
- If it uses state/effects/browser APIs, add `'use client'` at the top.
- Explicit `Props` interface, destructured in signature, default export (see `components/PoliticianCard.tsx`).
- Styling: inline `style={{ ... }}` with CSS custom properties from `app/globals-terminal.css`. No CSS modules or styled-components.

**New library/utility:**
- Location: `lib/<kebab-case>.ts`.
- Export named functions + types. No default exports for library modules.
- Import via `@/lib/<name>` from anywhere in `app/` or `components/`. Use relative `../lib/<name>` when imported from `scripts/` (see `scripts/audit-politician.ts:18`).

**New type:**
- Add to `lib/types.ts` if domain-wide. Consider a dedicated file (`lib/<domain>-types.ts`) only if the surface is large and distinct (example precedent: LegiScan types live in `types.ts` already).

**New script / CLI:**
- Location: `scripts/<kebab-case>.ts` (TypeScript) or `.js` (JavaScript).
- Run via `npx tsx scripts/<name>.ts` (or `node scripts/<name>.js`).
- Start with `#!/usr/bin/env npx tsx` shebang + `import 'dotenv/config'` to load `.env` (see `scripts/audit-politician.ts:1-2`).
- Imports from `lib/` use relative paths (`../lib/corruption-score`).
- Read env vars: `process.env.FEC_API_KEY`, `process.env.SUPABASE_URL`, `process.env.SUPABASE_SERVICE_ROLE_KEY` — never hardcode.
- Output evidence JSON to `data-ingestion/<slug>.json` (not gitignored; treat as durable artifact).
- Append summary rows to `data-ingestion/audit-tracker.csv` if the script produces audit-trail-worthy output.

**New state seeder:**
- Location: `scripts/seed-<state>-<scope>.ts` (e.g. `seed-nc-county-officials.ts`, `seed-ohio-judges.js`).
- Produce a post-run summary at repo root: `<STATE>_SEEDING_REPORT.md` (mirrors the existing `NJ_OFFICIALS_SEEDING_REPORT.md`, `OHIO_*_SEEDING_REPORT.md`).
- Use state-prefixed IDs: `<state>-<rest>` so `lib/state-utils.ts` attribution works.

**New Python scraper:**
- Location: `scrapers/<kebab-case>.py`.
- Use shared `scrapers/db_helper.py` for Supabase writes.
- Document in `scrapers/README.md`.

**New investigation:**
- Location: `investigations/<state>-<county>-<office>-<slug>/`.
- Log file: `investigations/<slug>/agent-stderr.log`.
- Emit artifacts as JSON/CSV in the same directory or under `data-ingestion/`.

**New audit / crossref workflow:**
- Audit a single politician: `npx tsx scripts/audit-politician.ts <bioguide_id>`.
- Batch audit: prepend targets to `data-ingestion/audit-targets.txt`, then `npx tsx scripts/audit-politician.ts --batch data-ingestion/audit-targets.txt`.
- Crossref a candidate vs pro-Israel registry: `npx tsx scripts/crossref-politician-pro-israel.ts <bioguide_id>` (or a bespoke variant under `scripts/crossref-<name>.ts`).
- Re-apply flags: `scripts/reapply-roster-flags.ts`.
- Batch bundler flag: `scripts/flag-bundlers-batch.ts`.
- Put per-candidate evidence JSON in `data-ingestion/<name>-fec-YYYY-itemized.json` + `data-ingestion/<name>-roster-matches.json`.

**New DB table / column:**
- Location: `supabase/migrations/<NNN>_<description>.sql` (next number after `004`).
- Include RLS policies — existing convention: `Public read access` on SELECT + `Service role write` on ALL / INSERT / UPDATE.
- Update `lib/types.ts` for any new column surfaced to the UI.
- Update the snake_case → camelCase mapping in the relevant `app/api/...route.ts`.
- Apply manually via Supabase SQL editor — no automated migrations.

**New connection graph data:**
- Location: Extend `scripts/build-connections-graph.ts`.
- Schema: `supabase/connections-schema.sql` — add `category` values (`donor`, `pac`, `lobby-firm`, `lobby-client`, `israel-pac`, `corporate`, `court-case`) and `label` verbs (`donated_to`, `lobbied_by`, `ie_spending`, `court_party`) as needed.

**New planning/phase artifact:**
- Location: `.planning/phases/<phase-number>-<slug>/`.
- Managed by the `/gsd-*` command family.

## Special Directories

**`.next/`:**
- Purpose: Next.js build output + cache.
- Generated: Yes. Committed: No (gitignored).

**`.vercel/`:**
- Purpose: Vercel project linking metadata.
- Generated: Yes (by `vercel` CLI). Committed: Partial (`.vercel/project.json` ok, no secrets).

**`node_modules/`:**
- Purpose: npm dependencies.
- Generated: Yes. Committed: No.

**`data-ingestion/`:**
- Purpose: Pipeline artifacts — inputs and outputs.
- Generated: Partially (scripts output here). Committed: Yes — treat as durable evidence store.

**`data/`:**
- Purpose: Runtime-read reference data bundled into serverless functions.
- Generated: Partially (registry CSVs built by `scripts/build-pro-israel-registry.ts`). Committed: Yes.

**`investigations/`:**
- Purpose: Agent run artifacts per investigation.
- Generated: Yes (by agents). Committed: Yes.

**`.planning/`:**
- Purpose: GSD workflow state.
- Generated: Partially (via `/gsd:*` commands). Committed: Yes.

**`public/`:**
- Purpose: Static assets served at root.
- Generated: No. Committed: Yes.

---

*Structure analysis: 2026-04-22*

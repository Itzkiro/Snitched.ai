# External Integrations

**Analysis Date:** 2026-04-22

Snitched.ai is integration-heavy: nearly every feature pulls from a public-records API or scrapes a government site. All third-party calls go through thin server-side wrappers so API keys stay out of the browser.

## APIs & External Services

**Campaign Finance:**
- **FEC API** (`https://api.open.fec.gov/v1`) — Federal Election Commission. Source of federal contributions, candidate/committee data, Schedule A (itemized individual contribs), Schedule E (independent expenditures).
  - Shared wrapper: `lib/fec-client.ts` — `fecFetch(endpoint, params)` with rate-limit (429) handling, 5-minute Next fetch cache, `FecError` class, and `fecErrorResponse()` helper. Also exports `ISRAEL_LOBBY_COMMITTEE_IDS` and `isIsraelLobbyDonor(...)`.
  - Proxy routes: `app/api/fec/candidates/route.ts`, `app/api/fec/contributions/route.ts`, `app/api/fec/filings/route.ts`.
  - Cron consumers: `app/api/cron/sync-fec/route.ts` (daily 3 AM UTC), `app/api/cron/track-fec-filings/route.ts` (every 6h), `app/api/cron/refresh-gallrein-roster/route.ts` (weekly), `app/api/cron/research-candidates/route.ts` (daily 6 AM).
  - Script consumers: `scripts/sync-fec-data.ts`, `scripts/fetch-fec-schedule-a.ts`, `scripts/fetch-mast-ie.ts`, `scripts/build-pro-israel-registry.ts`, `scripts/crossref-*-pro-israel.ts`, plus Python `scrapers/scrape-fec-data.py` and `scrapers/jfk-fec-scraper.py`.
  - Rate limit: **1,000 requests/hour per key**. Clients use 300–600ms inter-request delays.
  - Auth: `FEC_API_KEY` env var (query-string `api_key` param).

- **LegiScan API** (`https://api.legiscan.com/`) — State legislature bills and roll-call votes (primary use: FL).
  - Proxy route: `app/api/legiscan/route.ts` (allow-listed ops: `getSessionList`, `getMasterList`, `getBill`, `getRollCall`, `getSponsoredList`, `getSearch`).
  - Cron: `app/api/cron/sync-legiscan/route.ts` (daily 5 AM UTC, `MAX_BILLS_PER_RUN=50`, 300ms delays).
  - Script: `scripts/sync-legiscan-data.ts`, `data-ingestion/fetch-legiscan-data.ts`.
  - Rate limit: **30,000 requests/month** (free tier), ~1,000/day. Script caps at ~200/run.
  - Auth: `LEGISCAN_API_KEY` env var.

- **Congress.gov API** (`https://api.congress.gov/v3`) — Federal member profiles, bills, votes.
  - Direct-fetch routes: `app/api/congress/members/route.ts`, `app/api/congress/bills/route.ts`, `app/api/bills/search/route.ts`.
  - Cron: `app/api/cron/sync-congress/route.ts` (daily 4 AM UTC, `DELAY_BETWEEN_REQUESTS_MS=200`).
  - Scripts: `scripts/sync-congress-data.ts`, `scripts/populate-oh-voting-records.ts`.
  - Rate limit: ~5,000 requests/hour per key.
  - Auth: `CONGRESS_API_KEY` env var (header).

**Lobbying:**
- **Senate LDA (Lobbying Disclosure Act) API** (`https://lda.senate.gov/api/v1`) — Registered-lobbyist filings, quarterly contributions, FECA reports.
  - Proxy route: `app/api/lobbying/route.ts` — forwards `filings` and `contributions` endpoints with rich filter params (year, quarter, registrant, client, state, issues, amounts).
  - Scripts: `scripts/fetch-torres-lobbying.ts`, `scripts/fetch-warner-lobbying.ts`, `scripts/sync-lobbying-data.ts`, `scripts/lda_oh_populate.ts`.
  - Known issue (documented in `app/api/lobbying/route.ts` header): **the Senate endpoint sunsets June 30, 2026**; successor at `lda.gov` must be migrated.
  - Auth: `LDA_API_KEY` env var.

**Court Records:**
- **CourtListener API** (`https://www.courtlistener.com/api/rest/v4`) — Federal + state court dockets and opinions.
  - Shared client: `lib/courtlistener-client.ts` — `searchCourtRecords(...)` with typed `CourtListenerDocket` / `CourtListenerOpinion` / `CourtRecord`.
  - Cron: `app/api/cron/sync-court-records/route.ts` (~hourly, `MAX_POLITICIANS_PER_RUN=250`, 600ms delays, 2 API calls per politician — dockets + opinions).
  - Also consumed from `lib/research-agent.ts` (deep-research workflow) and `app/api/cron/research-candidates/route.ts`.
  - Rate limit: **5,000 queries/hour** authenticated; unauthenticated is lower.
  - Auth: `COURTLISTENER_TOKEN` env var (optional; higher limits when set).

**Web Search / Intel:**
- **Exa AI** (`https://api.exa.ai/search`) — Neural web search for news/scandal monitoring.
  - Cron: `app/api/cron/monitor-news/route.ts` (every 6h) — keyword-joined query across tracked politicians with a `SCANDAL_KEYWORDS` list (indicted, bribery, AIPAC, FARA, insider trading, etc.). Auto-inserts `intel_alerts` rows with severity classification.
  - Also used inside `lib/research-agent.ts`.
  - Auth: `EXA_API_KEY` env var (header `x-api-key`).

**State Secretary of State Scraping (no API, requires browser automation):**
- **Ohio SOS** (`https://www6.ohiosos.gov/ords/f?p=CFDISCLOSURE:73`, `https://data.ohiosos.gov`) — Ohio campaign finance itemized contributions; Cloudflare-protected.
  - Bulk download: `scripts/fetch-oh-sos-bulk.ts` (Playwright chromium).
  - Stealth path: `scripts/scrape-vivek-oh-sos-stealth.ts` — uses `playwright-extra` + `puppeteer-extra-plugin-stealth` to bypass Cloudflare bot detection.
  - Probes: `scripts/probe-oh-sos*.ts`, `scripts/scrape-vivek-oh-sos*.ts`.
  - Python ingest: `scrapers/scrape-ohio-campaign-finance.py`.
- **California CAL-ACCESS** (`https://cal-access.sos.ca.gov/Campaign/Candidates/`) — CA state candidates.
  - Script: `scripts/scrape-serpa-calaccess.ts`.
- **Florida Division of Elections** (`https://dos.elections.myflorida.com`) — state/county candidates.
  - Scraper: `scrapers/fl-doe-scraper.py`, `scrapers/fetch-fishback-fldoe.py`.
- **Ballotpedia** (`https://ballotpedia.org`) — enrichment for Ohio candidates.
  - Scraper: `scrapers/enrich-oh-ballotpedia.py`.
- **Track AIPAC** (`https://www.trackaipac.com/state/florida`) — third-party Israel-lobby tracker.
  - Script: `scripts/scrape-track-aipac.ts` (plain `fetch` + HTML parsing, no headless browser).

**Voters / Registrars:**
- **VoterFocus** (`https://www.voterfocus.com`) — referenced for FL county voter info (URL pattern in scraper scaffolding, not a structured API).

## Data Storage

**Databases:**
- **Supabase PostgreSQL** (hosted at `https://xwaejtxqhwendbbdiowa.supabase.co`, discovered via scripts).
  - Client factory: `lib/supabase-server.ts` — memoized `getServerSupabase()` (anon key, RLS-respecting reads) and `getServiceRoleSupabase()` (service-role key for cron writes, bypasses RLS).
  - Schema: `supabase/schema.sql`, `supabase/connections-schema.sql`, migrations `supabase/migrations/001_add_contribution_breakdown.sql` through `004_add_individual_donor_breakdown.sql`.
  - Key tables: `politicians` (PK `bioguide_id`), `social_posts`, `scrape_runs`, `intel_alerts`, `platform_stats`.
  - Row-Level Security: enabled on all tables; public read, service-role write.
  - Connection env vars (see below): `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
  - Python access: direct PostgREST via `requests` in `scrapers/scrape-social-media.py` (reads `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) and `scrapers/enrich-oh-ballotpedia.py`. A legacy `SUPABASE_DB_URL` path (direct psycopg2) also exists in `scrapers/db_helper.py`.

**File Storage:**
- **Local filesystem only.** No S3 / Supabase Storage / Cloudinary detected.
- Large datasets committed to the repo as JSON/CSV under `data/` (pro-Israel donor registry CSVs by year, 1978–present), `data-ingestion/` (per-candidate itemized FEC pulls, roster-match results, FLDOE & CalAccess dumps), and `scrapers/sample-data/`.
- `next.config.ts` explicitly whitelists `data/pro-israel-donors-*.csv` into the Vercel serverless bundle for `/api/cron/refresh-gallrein-roster`.

**Caching:**
- Next.js built-in fetch cache — `lib/fec-client.ts` uses `next: { revalidate: 300 }` (5 min) to stay under FEC rate limits.
- No Redis / Upstash / Vercel KV detected.

## Authentication & Identity

**User authentication:**
- **None.** The platform is fully public per `.planning/PROJECT.md` ("OAuth login — no user accounts needed for public data"). RLS uses public-read policies.

**Service authentication:**
- **Vercel Cron → API** — `lib/cron-auth.ts` exports `verifyCronAuth(request)` which checks `Authorization: Bearer <CRON_SECRET>`. Required by every cron handler (`app/api/cron/*/route.ts`).
- **Admin endpoint** — `app/api/admin/route.ts` uses `ADMIN_SECRET` env var.
- **Supabase service-role** — `SUPABASE_SERVICE_ROLE_KEY` used by cron writers via `getServiceRoleSupabase()`. Per `.planning/PROJECT.md` / `ROADMAP.md` Phase 1, this key was previously hardcoded in 8 scripts and must remain rotated.

## Monitoring & Observability

**Error Tracking:**
- **None configured.** No Sentry / Datadog / Rollbar SDK. Cron handlers return `cronResponse()` JSON summaries with `success`, `synced`, `errors`, `details`, `duration_ms` — operator-visible only in Vercel logs.

**Logs:**
- Server-side: `console.log` / `console.error` → Vercel function logs.
- Python scrapers: `logging` module with file handlers (`scrapers/logs/social-media.log`, configured in `scrapers/scrape-social-media.py:122`).
- Health endpoint: `app/api/daemon-status/route.ts` (used by `app/api/cron/sync-social-media/route.ts`).

## CI/CD & Deployment

**Hosting:**
- **Vercel** serverless. `.vercel/` directory linked to a project; `.vercelignore` excludes scraper/ingest artifacts.
- Function limits enforced: cron routes declare `maxDuration = 300` (seconds) and `dynamic = 'force-dynamic'`.

**CI Pipeline:**
- **None detected.** No `.github/workflows/`, no CircleCI, no GitLab CI config. Deploys appear to be git-push → Vercel.

**Deployment hooks:**
- Vercel Cron Jobs (see below). No external scheduler (no Upstash Qstash / Inngest / Temporal).

## Environment Configuration

**Required env vars (Next.js runtime):**
- `SUPABASE_URL` — Supabase project URL. Falls back to `NEXT_PUBLIC_SUPABASE_URL` in `lib/supabase-server.ts`.
- `SUPABASE_ANON_KEY` — Public PostgREST key for RLS-respecting reads. Falls back to `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `SUPABASE_SERVICE_ROLE_KEY` — Elevated write key for cron jobs (bypasses RLS). Consumed by `getServiceRoleSupabase()`.
- `FEC_API_KEY` — FEC API key (1,000 req/hr).
- `CONGRESS_API_KEY` — Congress.gov key (~5,000 req/hr).
- `LEGISCAN_API_KEY` — LegiScan key (30K/month).
- `LDA_API_KEY` — Senate LDA lobbying key.
- `COURTLISTENER_TOKEN` — CourtListener token (5K/hr when set; optional).
- `EXA_API_KEY` — Exa AI search key for `monitor-news` and `lib/research-agent.ts`.
- `CRON_SECRET` — Bearer token enforced by `lib/cron-auth.ts`.
- `ADMIN_SECRET` — Admin endpoint guard in `app/api/admin/route.ts`.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Legacy public fallbacks (used during migration; keep in sync).

**Required env vars (Python scrapers):**
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (or legacy `SUPABASE_SERVICE_KEY`) — REST writes in `scrapers/scrape-social-media.py:136-140`, `scrapers/scrape-ohio-campaign-finance.py:51-52`, `scrapers/fetch-fishback-fldoe.py:60-61`, `scrapers/enrich-oh-ballotpedia.py:191-192`.
- `FEC_API_KEY` — `scrapers/scrape-fec-data.py:301`, `scrapers/jfk-fec-scraper.py:350`.
- `SUPABASE_DB_URL` — Optional direct psycopg2 path in `scrapers/db_helper.py:40`.
- `FB_ACCESS_TOKEN` — Optional Facebook Graph API access for `scrapers/scrape-social-media.py:1261` (`https://graph.facebook.com`).
- `IG_USERNAME`, `IG_PASSWORD` — Optional Instagram credentials for Instaloader (`scrapers/scrape-social-media.py:1432-1433`).
- `SCRAPER_API_KEY` — Referenced in `scrapers/README.md:210` for an internal push webhook (not currently invoked in code).

**Secrets location:**
- Committed `.env` file at repo root (1.5KB). Contents intentionally not read. `.env*` is in `.gitignore`; the tracked file is a local-only dev copy.
- Vercel project environment (managed via Vercel dashboard — not in repo).

## Webhooks & Callbacks

**Incoming:**
- `app/api/webhooks/` directory exists but is **empty** (no `route.ts`). No webhook receivers currently wired.
- Vercel Cron deliveries (treated as webhooks) land on `app/api/cron/*/route.ts` handlers, authenticated via `verifyCronAuth`.

**Outgoing:**
- None detected. No outbound webhooks, Slack/Discord notifiers, or email senders wired.
- `scrapers/README.md` references a hypothetical `X-API-Key: SCRAPER_API_KEY` header for an internal push endpoint — not yet implemented.

## Vercel Cron Jobs

Configured cron handlers (routes exist under `app/api/cron/`) — each uses `verifyCronAuth`, `force-dynamic`, and writes via `getServiceRoleSupabase()`:

| Route | Intended schedule (per CLAUDE.md / README.md) | Purpose |
|-------|-----------------------------------------------|---------|
| `app/api/cron/sync-fec/route.ts` | `0 3 * * *` (3 AM UTC daily) | Refresh FEC contributions, IE, and multi-cycle totals for tracked politicians |
| `app/api/cron/sync-congress/route.ts` | `0 4 * * *` (4 AM UTC daily) | Sync Congress.gov members, bills, roll-call votes |
| `app/api/cron/sync-legiscan/route.ts` | `0 5 * * *` (5 AM UTC daily) | Sync FL state legislature bills + votes |
| `app/api/cron/sync-court-records/route.ts` | `5 * * * *` (hourly) | Sync CourtListener dockets + opinions for all politicians |
| `app/api/cron/research-candidates/route.ts` | `0 6 * * *` (daily) | Enrich candidate profiles across 4 pillars |
| `app/api/cron/track-fec-filings/route.ts` | `0 3,9,15,21 * * *` (every 6h) | Live new-filing detection, auto-create intel_alerts |
| `app/api/cron/monitor-news/route.ts` | `0 2,8,14,20 * * *` (every 6h) | Exa AI scandal-keyword news monitoring |
| `app/api/cron/sync-social-media/route.ts` | `0 */6 * * *` (every 6h) | Daemon health check + social scraping trigger |
| `app/api/cron/refresh-gallrein-roster/route.ts` | Mondays 02:00 UTC | Weekly pro-Israel roster re-cross-reference for KY-04 |
| `app/api/cron/sync-stats/route.ts` | Every 12h | Recompute `platform_stats` table |

**Critical gap:** `vercel.json` currently contains `{ "crons": [] }` — none of the above schedules are active on Vercel. All handlers exist and are callable manually, but Vercel will not fire them until `vercel.json` is re-populated.

## Scraping Subsystem

Separate from the Next.js deploy; runs locally or on a self-managed host.

- Entry point: `scripts/social-media-daemon.ts` (long-running tsx process).
- Python scrapers (`scrapers/*.py`) are invoked via subprocess or directly; dependencies in `scrapers/requirements.txt`.
- Social sources (see `scrapers/scrape-social-media.py`): Google News RSS, YouTube RSS, official .gov RSS, Twitter/X (Twikit guest mode + syndication), Facebook (`facebook_scraper` lib for public pages), Instagram (`instaloader` for public profiles). Optional paid path via `FB_ACCESS_TOKEN` → `https://graph.facebook.com`.
- Output: `data-ingestion/social-media-posts.json` → upserted into `social_posts` table via Supabase REST.
- Browser automation: Playwright chromium (`scripts/fetch-oh-sos-bulk.ts`, `scripts/probe-oh-sos*.ts`), plus stealth variant (`scripts/scrape-vivek-oh-sos-stealth.ts`) for Cloudflare-guarded OH SOS.

---

*Integration audit: 2026-04-22*

# External Integrations

## Databases

### Supabase (PostgreSQL)
- **Type**: PostgreSQL database hosted on Supabase
- **Client library**: `@supabase/supabase-js` v2.98.0
- **Usage pattern**: Both public read-only access and service-role elevated access for cron jobs
- **Server implementation**: `lib/supabase-server.ts`
  - `getServerSupabase()` — Standard client for reading data
  - `getServiceRoleSupabase()` — Service role client for cron jobs to bypass RLS
- **Authentication method**: API key-based (anon key + optional service role key)
- **Environment variables**:
  - `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (server-side only, required for cron jobs)

### Tables

1. **`politicians`** — Core politician data
   - Primary Key: `bioguide_id`
   - Tracks: name, office, party, jurisdiction, corruption scores, funding sources, social media handles
   - Linked to: contributions (FEC), voting records (Congress.gov), social media posts
   - Source file: `/supabase/schema.sql`

2. **`social_posts`** — Scraped social media posts from politicians
   - Primary Key: `id`
   - Tracks: platform, content, engagement metrics (likes, shares, comments, views), sentiment scores
   - Indexed by: `politician_id`, `platform`, `posted_at`, `scraped_at`
   - Source file: `/supabase/schema.sql`

3. **`scrape_runs`** — Monitoring/auditing table for daemon scrape cycles
   - Primary Key: `id` (auto-increment)
   - Tracks: run status, posts found, errors, logs, metadata
   - Indexed by: `run_type`, `started_at`
   - Source file: `/supabase/schema.sql`

4. **`bills`** — Legislative bills from Congress.gov and LegiScan
   - Fields: bill_type, bill_number, title, sponsors_count, introduced_date, policy_area, source, source_url
   - Populated by: `/api/cron/sync-congress` and `/api/cron/sync-legiscan`

5. **`votes`** — Roll-call votes on bills
   - Fields: bill_id, roll_number, chamber, congress, vote_date, yea_count, nay_count
   - Populated by: Congress.gov and LegiScan sync jobs

6. **`politician_votes`** — Individual politician votes on bills
   - Fields: vote_id, politician_id, position (Yea/Nay/NV/Absent)
   - Populated by: LegiScan sync job

## APIs & Services

### Federal Election Commission (FEC) API
- **Endpoint**: `https://api.open.fec.gov/v1`
- **Rate limit**: 1,000 requests/hour per API key
- **Authentication**: API key query parameter
- **Environment variable**: `FEC_API_KEY`
- **Client implementation**: `lib/fec-client.ts`
  - `fecFetch(endpoint, params)` — Wrapper with rate-limit awareness and error handling
  - Caches responses for 5 minutes to respect rate limits
- **Sync job**: `/api/cron/sync-fec` (daily at 3 AM UTC)
- **Data retrieved**:
  - Candidate committees via `/candidate/{candidateId}/committees/`
  - Schedule A contributions via `/schedules/schedule_a/`
  - Identifies Israel lobby contributions via hardcoded committee IDs and name patterns
  - Tracks: total funds, AIPAC funding, top 5 donors, Israel lobby breakdown
- **Special logic**:
  - Israel lobby detection (`isIsraelLobbyDonor()`) via committee ID or donor name patterns
  - Known PAC IDs: AIPAC (C00104414), UDP (C00803833), DMFI (C00776997), etc. (see `fec-client.ts` for full list)

### Congress.gov API
- **Endpoint**: `https://api.congress.gov/v3`
- **Rate limit**: ~5,000 requests/hour per API key
- **Authentication**: API key query parameter
- **Environment variable**: `CONGRESS_API_KEY`
- **Sync job**: `/api/cron/sync-congress` (daily at 4 AM UTC)
- **Data retrieved**:
  - Current member list (`/member?currentMember=true&limit=250`)
  - Bills from current Congress session (`/bill/{congress}`)
  - Bill details (`/bill/{congress}/{billType}/{billNumber}`)
  - Roll-call votes (`/bill/{congress}/{billType}/{billNumber}/actions`)
  - Member names, party, photos, office information
- **Congress session calculation**: Dynamically computed as `Math.floor((currentYear - 1789) / 2) + 1`
- **Data synced**: Bills (title, sponsors, policy area, introduced date, status), votes, member photos/party
- **Lookback window**: Last 2 days for bill updates

### LegiScan API
- **Endpoint**: `https://api.legiscan.com/`
- **Rate limit**: 30,000 requests/month (~1,000/day) on free tier
- **Authentication**: API key query parameter (`key` param)
- **Environment variable**: `LEGISCAN_API_KEY`
- **Sync job**: `/api/cron/sync-legiscan` (daily at 5 AM UTC)
- **Scope**: Florida (FL) state legislature only
- **Data retrieved**:
  - Session list (`?op=getSessionList&state=FL`)
  - Master bill list for active session (`?op=getMasterList&id={sessionId}`)
  - Bill details (`?op=getBill&id={billId}`)
  - Roll-call votes (`?op=getRollCall&id={rollCallId}`)
  - Individual legislator votes
- **Session awareness**:
  - Tracks FL legislative session (typically Jan-Apr)
  - Adjusts lookback window: 2 days during session, 7 days off-session
  - Selects most recent non-special session
- **Data synced**: Bill status, sponsors, descriptions, vote counts, individual legislator positions
- **Vote mapping**: Yea/Nay/NV/Absent with chamber (House/Senate)

## Authentication

### Supabase Authentication Methods
- **Type**: Row Level Security (RLS) policies
- **Access tiers**:
  - **Public read** (`SELECT`): Unauthenticated users can read politicians, social posts, scrape runs
  - **Anonymous write** (`INSERT`, `UPDATE`, `DELETE`): Cron jobs use service role key
- **No user login system**: Current implementation is read-only for end users, authenticated API access for cron jobs
- **Session management**: Disabled (`persistSession: false`, `autoRefreshToken: false`) for cron operations

### Cron Job Authentication
- **Type**: Bearer token verification
- **Header**: `Authorization: Bearer {CRON_SECRET}`
- **Implementation**: `lib/cron-auth.ts`
  - `verifyCronAuth(request)` — Validates bearer token against `CRON_SECRET` env var
  - `cronResponse(job, result)` — Standardized JSON response format
- **Trigger**: Vercel cron scheduler (configured in `vercel.json`)
- **Secret generation**: `openssl rand -hex 32`

## Hosting & Deploy

### Vercel
- **Platform**: Vercel serverless platform
- **Configuration file**: `/vercel.json`
- **Runtime**: Node.js (Next.js 16 compatible)
- **Features used**:
  - Serverless API routes (Next.js API routes)
  - Scheduled cron jobs (via `crons` array)
  - Build optimization (Next.js 16)
- **Max duration for cron jobs**: 5 minutes (300 seconds) for FEC/Congress/LegiScan syncs, 1 minute (60 seconds) for health checks
- **Deployment**: Git-based continuous deployment (source of truth: GitHub)

### Local Development
- **Dev server**: `npm run dev` (Next.js dev server, typically http://localhost:3000)
- **Build**: `npm run build` (Next.js build -> `.next/` directory)
- **Production**: `npm start` (serves built `.next/` output)

## Monitoring & Analytics

### Scrape Runs Monitoring
- **Table**: `supabase.scrape_runs`
- **Tracked metrics**:
  - `started_at`, `completed_at` — Timing
  - `status` — 'running', 'completed', 'failed'
  - `posts_found`, `posts_new`, `errors` — Counts
  - `log` — JSONB array of log entries
  - `metadata` — JSONB for arbitrary data
- **Health check**: `/api/cron/sync-social-media` monitors daemon health
  - Checks if last run was within 30 min (healthy), 2 hours (delayed), or >2 hours (stale)
  - Reports total posts in DB and posts scraped in last 24 hours

### Social Media Scraping
- **Architecture**: Persistent daemon running on Mac mini (not part of Vercel deployment)
- **Coordination**: Writes to `scrape_runs` table for health monitoring
- **Data stored**: `social_posts` table (platform, content, engagement metrics, sentiment)
- **Cron fallback**: 6-hourly health check via `/api/cron/sync-social-media` catches if daemon is stale

### Error Handling & Logging
- **Cron job responses**: Standardized JSON including:
  - `success` (boolean)
  - `synced` (count of items processed)
  - `errors` (count of errors)
  - `details` (metadata including `log` array)
  - `duration_ms` (execution time)
- **Rate limit handling**:
  - FEC: Retries with exponential backoff (500ms between candidates), stops on 429
  - Congress.gov: Stops immediately on 429 (rate-limited)
  - LegiScan: Stops immediately on 429
- **Error messages**: Include API error details, database constraints, connection issues

### Data Provenance
- **Source tracking**:
  - `politicians.data_source` — where politician data originated
  - `politicians.source_ids` — JSONB with external IDs (e.g., `fec_candidate_id`, `bioguide_id`)
  - `bills.source` — 'congress.gov' or 'legiscan'
  - `bills.source_url` — Direct link to bill on source site
  - `votes.source` — 'congress.gov' or 'legiscan'
- **Update tracking**: All tables have `updated_at` timestamp (auto-updated via trigger)

## Third-Party Integrations Summary

| Service | Purpose | Rate Limit | Sync Frequency |
|---|---|---|---|
| FEC API | Campaign finance data | 1,000 reqs/hr | Daily (3 AM UTC) |
| Congress.gov | Federal bills, votes, members | ~5,000 reqs/hr | Daily (4 AM UTC) |
| LegiScan | FL state legislature | 30K reqs/month | Daily (5 AM UTC) |
| Vercel Cron | Job scheduling | N/A | 4 scheduled jobs |
| Supabase | Database & RLS | Rate-limited by plan | Real-time for reads |
| Mac mini daemon | Social media scraping | Platform-specific | Continuous (6hr health check) |


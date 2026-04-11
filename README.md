# Snitched.ai

**National Political Corruption Research Platform**
Every Politician. Every Dollar. Every Lie. Exposed.

Live at [snitched.ai](https://snitched.ai)

## What It Does

Snitched.ai tracks political corruption, foreign lobby influence, and campaign finance across America using public records. Every data point is sourced from FEC filings, state election databases, lobbying disclosures, court records, and legislative voting records. No opinions. No partisan bias. Just data.

### By The Numbers

- **7,000+ politicians** tracked across 11 states
- **$808M+** in campaign funds tracked
- **$21M+** in Israel lobby funding mapped
- **3,400+** court records linked (via CourtListener)
- **1,800+** officials with real financial data
- **39 candidates** monitored for 2026 elections
- **184 voting records** analyzed
- **826 social/news posts** tracked

### States Covered

Florida (2,869) | Ohio (1,735) | California (393) | Georgia (357) | Texas (286) | New York (279) | North Carolina (197) | New Jersey (190) | Illinois (164) | Pennsylvania (157) | Michigan (123)

## Features

### Landing Page
Full-screen splash with live platform stats. Click "Enter Terminal" to access the dashboard with the top navigation bar.

### Corruption Scoring
Every politician receives a data-driven corruption score (0-100) based on 4 weighted factors:
- **PAC/Lobby Funding Ratio** (35%) — PAC vs individual donor mix
- **Lobbying Connections** (20%) — registered lobbyist filings
- **Voting Alignment** (25%) — votes matching donor interests
- **Campaign Finance Red Flags** (20%) — Israel lobby, self-funding, bundling

Any Israel lobby / AIPAC money triggers an immediate red flag.

### Candidates Page
- Candidates grouped by race (Governor, Senate, House, State, Local)
- Each race shows incumbent vs challengers side by side
- Interactive compare tool for candidates on the same seat

### Connections Graph
Interactive network visualization of donor-politician relationships using Cytoscape.js. Shows PACs, Israel lobby, lobbying firms, and court cases as connected nodes.

### Court Records
Clickable court case cards linking to full docket/filings on CourtListener for every politician with federal court involvement.

### Platform Stats (Live)
Centralized `platform_stats` table refreshed every 12 hours via cron job. No hardcoded numbers anywhere on the site.

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page with "Enter Terminal" gate |
| `/officials` | Seated officials by level (Federal, State, County) |
| `/candidates` | 2026 candidates grouped by race with compare tool |
| `/browse` | Database search with filters |
| `/juicebox` | Corruption score leaderboard |
| `/hierarchy` | Drill-down navigation by jurisdiction |
| `/connections` | Interactive donor-politician network graph |
| `/compare` | Side-by-side politician comparison |
| `/social` | Social/news intelligence feed |
| `/politician/[id]` | Full politician dossier (overview, votes, funding, legal, social) |
| `/about` | Methodology and data sources |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.1 (App Router) |
| Runtime | React 19, TypeScript 5 (strict) |
| Database | Supabase (PostgreSQL) with RLS |
| Styling | CSS custom properties + inline styles, Bebas Neue + JetBrains Mono fonts |
| Deployment | Vercel (serverless) |
| Data Pipeline | TypeScript sync scripts (tsx) + Python scrapers (Scrapling) |
| Court Records | CourtListener API |
| Campaign Finance | FEC API (federal), state election databases |
| Votes | Congress.gov API, LegiScan API |
| Lobbying | LDA Senate API |

## Data Sources

| Source | Data | Update Frequency |
|--------|------|-----------------|
| FEC | Federal campaign contributions, PAC filings, independent expenditures | Daily (3 AM UTC) |
| Congress.gov | Member profiles, bill sponsorships, voting records | Daily (4 AM UTC) |
| LegiScan | State legislature roll call votes | Daily (5 AM UTC) |
| CourtListener | Federal court dockets and opinions | Hourly |
| LDA Senate | Lobbying disclosure filings | On-demand |
| Google News RSS | Social/news intelligence | Every 6 hours |

## Automated Cron Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| `sync-fec` | Daily 3 AM | Refresh FEC contribution data |
| `sync-congress` | Daily 4 AM | Sync Congress.gov members and bills |
| `sync-legiscan` | Daily 5 AM | Sync state legislature voting records |
| `sync-social-media` | Every 6h | Social media/news monitoring |
| `sync-court-records` | Hourly | CourtListener court case sync |
| `research-candidates` | Daily 6 AM | Deep research on new candidates |
| `sync-stats` | Every 12h | Recompute platform_stats (no hardcoded numbers) |

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (for cron jobs) |
| `SUPABASE_ANON_KEY` | Yes | Supabase anonymous key (public reads) |
| `FEC_API_KEY` | Yes | Federal Election Commission API key |
| `CONGRESS_API_KEY` | No | Congress.gov API key |
| `LEGISCAN_API_KEY` | No | LegiScan API key |
| `COURTLISTENER_TOKEN` | No | CourtListener API token (5K req/hr) |
| `CRON_SECRET` | No | Vercel cron job auth token |
| `ADMIN_SECRET` | No | Admin panel auth |

## Project Structure

```
app/                        Next.js App Router pages and API routes
  api/                      REST API endpoints
  api/cron/                 7 automated cron job handlers
  candidates/               Candidates page + CandidateCompare component
  connections/              Interactive network graph (Cytoscape.js)
  politician/[id]/          Full dossier with 5 tabs
components/                 Reusable UI components
  TerminalHeader.tsx        Top status bar + navigation
  TerminalHome.tsx          Landing page + dashboard
  TerminalContext.tsx        Enter Terminal state management
  TerminalShell.tsx         Conditional header rendering
  SearchBar.tsx             Global search with autocomplete
  ConnectionsGraph.tsx      Cytoscape network visualization
lib/                        Shared utilities
  corruption-score.ts       4-factor corruption scoring algorithm
  platform-stats.ts         Centralized live stats (getAllStats, getStat)
  courtlistener-client.ts   CourtListener API client
  fec-client.ts             FEC API client
  supabase-server.ts        Server-side Supabase client
  state-utils.ts            State filtering and name utilities
  types.ts                  TypeScript interfaces
scripts/                    Data sync and enrichment scripts
  sync-corruption-scores.ts Recompute all corruption scores
  sync-corruption-batch.ts  Parallelizable batch scoring
  sync-court-records-fl.ts  Florida court records via CourtListener
  sync-court-records-oh.ts  Ohio court records via CourtListener
  seed-platform-stats.ts    Initial platform stats seed
  seed-oh-israel-lobby.ts   Israel lobby data for OH officials
  enrich-oh-fec-batch.ts    FEC enrichment for OH (parallel batches)
scrapers/                   Python data collection (Scrapling)
  scrape-ohio-campaign-finance.py   Ohio SOS campaign finance scraper
  enrich-oh-ballotpedia.py         Ballotpedia/OpenSecrets enrichment
  scrape-legal-records.py          Legal records scraper
supabase/                   Database schema and migrations
  schema.sql                Main politicians table
  migrations/               Schema migrations (platform_stats, etc.)
data-ingestion/             Raw + processed politician data
```

## Database Schema

### `politicians` (primary table)
- `bioguide_id` (PK) — state-prefixed ID (e.g. `oh-franklin-county-john-smith`)
- Core fields: name, office, office_level, party, jurisdiction
- Financial: total_funds, aipac_funding, israel_lobby_total, top5_donors, contribution_breakdown
- Records: court_records, voting_records, lobbying_records (JSONB)
- Scoring: corruption_score, juice_box_tier
- Status: is_active, is_candidate, running_for

### `platform_stats` (live numbers)
- Key-value store refreshed every 12h by cron
- 35+ stats: total_politicians, total_campaign_funds, per-state counts, etc.
- Used by all pages to avoid hardcoded numbers

### `social_posts`
- Scraped news/social media posts indexed by posted_at

## Deploying

```bash
vercel --prod
```

## License

Private — The AI Dudes, 2026.

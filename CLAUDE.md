<!-- GSD:project-start source:PROJECT.md -->
## Project

**Snitched.ai**

A citizen research platform for investigating corruption and foreign influence among Florida politicians. Users can look up any candidate or current officeholder and see real FEC funding data, Israel lobby connections, voting records, lobbying ties, and a data-driven corruption score — all sourced from public records, not opinions.

**Core Value:** Every politician's funding and financial data must be real, complete, and verifiable — citizens can't make informed decisions from placeholder data.

### Constraints

- **Data sources**: FEC API (federal), FL Division of Elections (state/local), LegiScan (votes), LDA (lobbying)
- **Rate limits**: FEC 1K req/hr, LegiScan 30K/month
- **Hosting**: Vercel serverless (5 min max function duration)
- **Budget**: Free tier Supabase + Vercel
- **Security**: Supabase service role key needs immediate rotation
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages & Runtime
- **Node.js** (via Next.js)
- **TypeScript** ^5.x (strict mode enabled)
- **JavaScript/JSX** (React)
- **SQL** (PostgreSQL via Supabase)
## Frameworks
- **Next.js** 16.1.6 — Full-stack React framework with App Router, API routes, and cron support
- **React** 19.2.3 — UI library
- **React DOM** 19.2.3 — Client-side rendering
## Dependencies (key ones with versions)
| Dependency | Version | Purpose |
|---|---|---|
| `@supabase/supabase-js` | ^2.98.0 | Database client (PostgreSQL) |
| `dotenv` | ^17.3.1 | Environment variable loading |
### Full dependency list from `/package.json`:
## Dev Dependencies
- **Tailwind CSS** ^4 with `@tailwindcss/postcss` — CSS utility framework
- **TypeScript** ^5 — Type checking
- **tsx** ^4.21.0 — TypeScript execution runtime
- **@types/node** ^20 — Node.js type definitions
- **@types/react** ^19 — React type definitions
- **@types/react-dom** ^19 — React DOM type definitions
## Configuration
### TypeScript (`/tsconfig.json`)
- **Target**: ES2017
- **Module**: esnext
- **Resolution**: bundler
- **Strict mode**: enabled
- **Path alias**: `@/*` maps to project root
- **Excluded from compilation**: `node_modules`, `database`, `scripts`, `scrapers`, `data-ingestion`
### Next.js (`/next.config.ts`)
- Minimal configuration (default Next.js 16 settings)
### Tailwind CSS (`/postcss.config.mjs`)
- PostCSS plugin: `@tailwindcss/postcss`
## Build & Deploy
### Build System
- **Framework**: Next.js with TypeScript compilation
- **Build command**: `npm run build` (Next.js build)
- **Dev command**: `npm run dev` (Next.js dev server)
- **Start command**: `npm start` (production server)
### Deployment Target
- **Platform**: Vercel
- **Config file**: `/vercel.json`
### Scheduled Cron Jobs (Vercel Cron)
| Path | Schedule | Purpose |
|---|---|---|
| `/api/cron/sync-fec` | `0 3 * * *` (3 AM UTC daily) | Sync FEC contribution data for tracked politicians |
| `/api/cron/sync-congress` | `0 4 * * *` (4 AM UTC daily) | Sync Congress.gov bills, votes, and member data |
| `/api/cron/sync-legiscan` | `0 5 * * *` (5 AM UTC daily) | Sync FL state legislature activity from LegiScan |
| `/api/cron/sync-social-media` | `0 */6 * * *` (every 6 hours) | Check daemon health status for social media scraping |
### Environment Variables
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_ANON_KEY` — Supabase anonymous public key
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (for cron jobs)
- `FEC_API_KEY` — Federal Election Commission API key (rate limit: 1,000 requests/hour)
- `CONGRESS_API_KEY` — Congress.gov API key (rate limit: ~5,000 requests/hour)
- `LEGISCAN_API_KEY` — LegiScan API key (rate limit: 30,000 requests/month)
- `CRON_SECRET` — Bearer token for Vercel cron job verification
- `NEXT_PUBLIC_SUPABASE_URL` — Public Supabase URL (fallback)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Public Supabase anon key (fallback)
### Source Code Structure
| Directory | Purpose |
|---|---|
| `/app` | Next.js App Router pages and API routes |
| `/app/api` | REST API endpoints and cron job handlers |
| `/app/api/cron/*` | Scheduled cron job handlers for data sync |
| `/app/candidates`, `/app/officials`, `/app/politician/*` | Page routes for browsing politicians |
| `/components` | Reusable React components |
| `/lib` | Shared utility functions and integrations |
| `/public` | Static assets |
| `/supabase` | Database schema and migrations |
| `/scrapers` | Social media scraping daemon (not part of Next.js build) |
| `/data-ingestion` | One-off data import scripts (not part of Next.js build) |
| `/scripts` | Utility scripts |
### Script Execution
- Non-Next.js TypeScript files (in `/scrapers`, `/data-ingestion`, `/scripts`) are executed via `tsx` and excluded from Next.js compilation.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Code Style
### TypeScript Configuration
- **Strict Mode**: Enabled in `tsconfig.json` with strict type checking
- **Target**: ES2017 with ESNext module system
- **Path Aliases**: `@/*` maps to project root for clean imports
- **JSX**: React 19 with `react-jsx` runtime
### Formatting & Structure
- No linter or formatter configured (ESLint/Prettier not present)
- Code uses consistent inline styling with CSS custom properties
- **File Organization**: Feature-based structure (`app/`, `components/`, `lib/`, `scrapers/`)
### Code Size Limits (Observed)
- Page components typically 80-100+ lines (no strict enforcement)
- Component functions average 50-250 lines
- API routes follow JSDoc comment blocks for documentation
- Library utilities are well-documented with inline comments
## Naming Conventions
### Files
- **Components**: PascalCase (e.g., `TerminalHeader.tsx`, `SearchBar.tsx`, `PoliticianCard.tsx`)
- **Pages**: kebab-case in directories, lowercase filenames (e.g., `/candidates/page.tsx`, `/politician/[id]/page.tsx`)
- **API Routes**: lowercase with underscores (e.g., `route.ts` in semantic paths like `/api/fec/candidates/route.ts`)
- **Utilities**: camelCase (e.g., `fec-client.ts`, `corruption-score.ts`, `supabase-server.ts`)
- **Data Modules**: kebab-case for county/region data (e.g., `orange-county-data.ts`, `putnam-county-data.ts`)
- **Python Scripts**: snake_case (e.g., `db_helper.py`, `scrape-fec-data.py`)
### Variables & Functions
- **React Components**: PascalCase for function components
- **Exported Functions**: camelCase (e.g., `fecFetch()`, `isIsraelLobbyDonor()`, `fuzzyMatch()`)
- **Classes**: PascalCase (e.g., `FecError`, `DatabaseHelper`)
- **Constants**: UPPER_SNAKE_CASE for globals (e.g., `FEC_BASE_URL`, `ISRAEL_LOBBY_COMMITTEE_IDS`)
- **Types/Interfaces**: PascalCase (e.g., `Politician`, `CorruptionScoreResult`, `Tag`)
- **Type Unions**: PascalCase (e.g., `Party`, `JurisdictionType`, `OfficeLevel`, `CorruptionGrade`)
- **State Variables**: camelCase in hooks (e.g., `loading`, `error`, `selectedIndex`, `politicians`)
- **Helper Functions**: camelCase, prefix with descriptive verb (e.g., `getScoreColor()`, `getPartyLabel()`, `getLevelLabel()`)
### API & Data Conventions
- **Query Parameters**: snake_case in URL searches (e.g., `candidate_id`, `per_page`, `is_active`)
- **Response Objects**: snake_case in FEC API responses, camelCase in app layer after transformation
- **Endpoints**: kebab-case in URLs (e.g., `/api/fec/candidates`, `/api/politicians/votes`)
### Domain Terms
- **Corruption Terminology**:
- **Political Terminology**:
## Common Patterns
### API Client Pattern
- `lib/fec-client.ts` — FEC API (Federal Election Commission)
- `lib/supabase-server.ts` — Supabase PostgreSQL database
- Python: `db_helper.py` for database operations
### Route Handler Pattern
- Comprehensive JSDoc headers documenting query params and response shape
- Try/catch blocks with centralized error handling
- Parameter extraction from `request.nextUrl.searchParams`
- Response transformation before JSON serialization (e.g., FEC → internal format)
- Pagination metadata included in responses
### Component Props Pattern
### Search/Filter Pattern
### Data Validation Pattern
### Styling Pattern
## Error Handling
### Approach
### No Silent Failures
- Errors are logged to console in client code (`console.error()`)
- Rate limit errors include retry guidance
- Unknown errors use generic fallback messages
## Import Organization
### Import Order
### Example
### Path Aliases
- `@/` resolves to project root
- Used consistently for cross-module imports (no relative paths like `../lib/types`)
## Component Patterns (Next.js/React)
### Server Components (Default)
### Client Components
- Search/filter UI (`SearchBar.tsx`)
- Interactive headers with navigation state (`TerminalHeader.tsx`)
- Forms and event handlers
- Any component using hooks (useState, useEffect, useCallback, useRef, etc.)
### Data Fetching Pattern
### Props Pattern
- Explicit `Props` interface per component
- Props are destructured in function signature
- Default exports for all components
### Rendering Patterns
- Conditional rendering with early returns
- Array mapping with `.map()` and explicit keys
- No deep nesting (max 3-4 levels of JSX)
- Inline styles preferred over CSS classes (no global stylesheet)
### HTML/DOM Patterns
- Semantic HTML where possible (divs, links, buttons)
- Terminal aesthetic enforced via inline style props
- No accessibility helpers (no aria-labels, roles currently present)
- Emoji for visual indicators (🇺🇸, 👔, 🗳️, etc.)
### Search/Autocomplete Patterns
- Client-side fuzzy matching with scoring
- Dropdown visibility controlled by state
- Keyboard navigation (arrow keys, enter, escape)
- Click-outside detection with refs and document event listeners
- Debounced search not used (filtering happens synchronously)
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern
- **Frontend**: Server & Client Components (React 19) with Tailwind CSS
- **Backend**: Next.js API Routes (serverless functions)
- **Database**: Supabase PostgreSQL with Row-Level Security
- **Fallback Strategy**: Local JSON data files when Supabase is unavailable
- **Data Ingestion**: Scheduled cron jobs and daemon scripts (Node.js/tsx)
- **External APIs**: FEC (campaign finance), LegiScan (state votes), Congress.gov (federal votes), Lobbying Disclosure Act (LDA)
## Layers
### 1. **Presentation Layer** (`/app` pages, `/components`)
- **Pages** (Server Components):
- **Components** (Reusable):
### 2. **API Layer** (`/app/api/*`)
#### Data Endpoints (Read):
- `GET /api/politicians` — All politicians (Supabase → fallback JSON)
- `GET /api/politicians/votes?bioguideId=X` — Voting records for a politician
- `GET /api/bills/search` — Search bills (Congress.gov integration)
- `GET /api/bills` — Bill listing
- `GET /api/social-posts` — Scraped social media posts
- `GET /api/lobbying` — Lobbying disclosure records (LDA API)
- `GET /api/congress/members` — Congress member data
- `GET /api/congress/bills` — Congress bill data
#### Proxy Endpoints (FEC):
- `GET /api/fec/candidates` — FEC candidate search
- `GET /api/fec/contributions` — Candidate contributions
- `GET /api/fec/filings` — FEC filings
#### Data Sync Cron Jobs (Write):
- `GET /api/cron/sync-fec` — Daily FEC contribution refresh (3 AM UTC)
- `GET /api/cron/sync-congress` — Daily Congress member/bill sync
- `GET /api/cron/sync-legiscan` — Daily Florida voting records sync
- `GET /api/cron/sync-social-media` — Continuous social media scraping status
#### Health:
- `GET /api/daemon-status` — Social media daemon health check
### 3. **Business Logic Layer** (`/lib`)
#### Core Types (`types.ts`):
- **Politician** — Central data structure with ~25 fields covering: identity, funding, corruption scores, votes, social media, lobbying links
- **Contribution** — Campaign finance donation records
- **Vote** — Legislative voting record (federal & state)
- **SocialPost** — Scraped social media content
- **LobbyingRecord** — Lobbying Disclosure Act filings
- **CorruptionScoreResult** — Computed integrity score with factor breakdown
#### Data Access:
- `supabase-server.ts` — Singleton Supabase client factory (server-only)
- `real-data.ts` — JSON fallback data aggregator
#### External API Clients:
- `fec-client.ts` — FEC API wrapper
#### Corruption Scoring:
- `corruption-score.ts` — Weighted multi-factor algorithm
#### County Data (Local Fixtures):
- `volusia-county-data.ts`, `brevard-county-data.ts`, `orange-county-data.ts`, `putnam-county-data.ts`, `lake-county-data.ts`, `flagler-county-data.ts`, `seminole-county-data.ts` — Hardcoded county-level politician data
- `bills-data.ts` — Sample bill data
- `cron-auth.ts` — Verifies Vercel cron job signatures via X-Vercel-Cron header
### 4. **Data Ingestion Layer** (`/scripts`, `/data-ingestion`)
#### Sync Scripts (`/scripts`):
- `sync-fec-data.ts` — Pulls FEC API data → Supabase (supports `--dry-run`, `--limit`, `--cycle`)
- `sync-congress-data.ts` — Pulls Congress.gov member/bill data
- `sync-legiscan-data.ts` — Pulls Florida state voting records via LegiScan API
- `sync-lobbying-data.ts` — Pulls LDA API lobbying filings
- `sync-voting-records.ts` — Aggregates voting records from multiple sources
- `sync-social-media.ts` — Manual social media scraping trigger
- `sync-corruption-scores.ts` — Recomputes and updates corruption scores in DB
- `seed-supabase.ts` — One-time DB population from JSON
#### Daemon (`/scripts`):
- `social-media-daemon.ts` — Long-running process that continuously scrapes social media
#### Data Files (`/data-ingestion`):
- `/phase1/processed/florida_politicians.json` — 188 Florida officials from congress-legislators dataset
- `/jfk-fec-results/jfk-fec-full-results.json` — Real FEC API results for federal politicians (2026-02-22 snapshot)
### 5. **Database Layer** (`/supabase`, Supabase PostgreSQL)
#### Tables:
- **politicians** — Primary table (bioguide_id TEXT PRIMARY KEY)
- **social_posts** — Scraped posts indexed by posted_at DESC
- **scrape_runs** — Audit trail for daemon executions
#### Security:
- Row-Level Security enabled on all tables
- Public read access for all tables
- Service role write access for cron jobs
- No authentication required (fully public API)
## Data Flow
### **Real-Time Read Path** (User queries)
```
```
### **Vote Record Fetch** (Dynamic, on-demand)
```
```
### **Daily Data Sync** (Vercel Cron)
```
```
### **Corruption Score Computation** (On-demand or batch)
```
```
### **Social Media Scraping** (Daemon + Cron)
```
```
### **Fallback Strategy** (Supabase unavailable)
```
```
## Key Abstractions
### **Politician (Central Model)**
```typescript
```
### **Corruption Score Algorithm**
```typescript
```
### **Voting Record (Federated)**
```typescript
```
### **Repository Pattern** (Data Access)
```typescript
```
## Entry Points
### **Frontend Entry Points**
- **Home**: `/` (page.tsx) → Displays live feed, ticker, key stats
- **Browse Politicians**: `/candidates` → Grid/list of all politicians
- **Politician Profile**: `/politician/[id]` → Detail page with tabs (overview, votes, funding, social, lobbying)
- **Social Feed**: `/social` → Real-time scraped social media posts
- **Dashboard**: `/juicebox` → Corruption scoring dashboard/visualization
- **Hierarchy**: `/hierarchy` → Organizational chart
### **API Entry Points**
- **Read Politicians**: `GET /api/politicians` → Returns Politician[]
- **Search Bills**: `GET /api/bills/search?q=X` → Returns Bill[]
- **Fetch Votes**: `GET /api/politicians/votes?bioguideId=X` → Returns VotingRecord[]
- **Social Posts**: `GET /api/social-posts` → Returns SocialPost[]
- **Lobbying**: `GET /api/lobbying?politicianId=X` → Returns LobbyingRecord[]
### **Data Sync Entry Points**
- **FEC Sync Cron**: `GET /api/cron/sync-fec` (3 AM UTC) → Triggered by Vercel
- **Congress Sync Cron**: `GET /api/cron/sync-congress` → Vercel scheduled
- **LegiScan Sync Cron**: `GET /api/cron/sync-legiscan` → Vercel scheduled
- **Social Daemon**: `tsx scripts/social-media-daemon.ts` → Manual or PM2
- **Manual Scripts**: `npx tsx scripts/sync-[source]-data.ts` → One-off runs with CLI options
### **Database Entry Points**
- **Supabase Dashboard**: `https://supabase.co/dashboard/project/[PROJECT_ID]`
- **Primary Table**: `politicians` (bioguide_id TEXT PK)
- **Audit Tables**: `social_posts`, `scrape_runs`
- **Cron Jobs**: Upsert to `politicians` via `SUPABASE_SERVICE_ROLE_KEY`
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->

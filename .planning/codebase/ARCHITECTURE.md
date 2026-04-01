# Architecture

## Pattern

**Next.js 16+ Full-Stack Application** with **Hybrid Data Model** (Supabase PostgreSQL + Fallback JSON)

- **Frontend**: Server & Client Components (React 19) with Tailwind CSS
- **Backend**: Next.js API Routes (serverless functions)
- **Database**: Supabase PostgreSQL with Row-Level Security
- **Fallback Strategy**: Local JSON data files when Supabase is unavailable
- **Data Ingestion**: Scheduled cron jobs and daemon scripts (Node.js/tsx)
- **External APIs**: FEC (campaign finance), LegiScan (state votes), Congress.gov (federal votes), Lobbying Disclosure Act (LDA)

## Layers

### 1. **Presentation Layer** (`/app` pages, `/components`)
- **Pages** (Server Components):
  - `/app/page.tsx` — Home/dashboard with live feed, ticker, and stats
  - `/app/candidates/page.tsx` — Browse all tracked politicians
  - `/app/officials/page.tsx` — Officials directory
  - `/app/politician/[id]/page.tsx` — Detail page with tabs (overview, votes, funding, social)
  - `/app/social/page.tsx` — Social media feed from scraped posts
  - `/app/hierarchy/page.tsx` — Organizational chart of politicians
  - `/app/browse/page.tsx` — Enhanced search/browse interface
  - `/app/juicebox/page.tsx` — Corruption scoring dashboard

- **Components** (Reusable):
  - `TerminalHeader.tsx` — Top navigation bar
  - `SearchBar.tsx` — Global politician search with autocomplete
  - `PoliticianCard.tsx` — Card component for politician display
  - `SocialFeed.tsx` — Real-time social media feed display

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
  - `getServerSupabase()` — Anon/read-only client
  - `getServiceRoleSupabase()` — Elevated client for cron jobs

- `real-data.ts` — JSON fallback data aggregator
  - `getAllPoliticians()` — Loads all politicians from JSON + FEC results + county data
  - Merges: `florida_politicians.json` + `jfk-fec-full-results.json` + county CSV files
  - Returns Politician[] with corruption scores pre-computed

#### External API Clients:
- `fec-client.ts` — FEC API wrapper
  - Rate limiting (1,000 req/hour)
  - AIPAC/Israel lobby detection (hardcoded committee IDs and name patterns)
  - Contribution aggregation

#### Corruption Scoring:
- `corruption-score.ts` — Weighted multi-factor algorithm
  - **5 factors** (weights sum to 1.0):
    1. PAC Contribution Ratio (30%)
    2. Lobbying Connections (20%)
    3. Voting Alignment with Donor Interests (25%)
    4. Transparency Score (10%)
    5. Campaign Finance Red Flags (15%)
  - Placeholder score: 30 (neutral) when data unavailable
  - Derives contribution breakdown from `top5Donors` when full breakdown unavailable

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
  - Started via `start-social-daemon.sh`
  - Tracks scrape runs in `scrape_runs` table

#### Data Files (`/data-ingestion`):
- `/phase1/processed/florida_politicians.json` — 188 Florida officials from congress-legislators dataset
- `/jfk-fec-results/jfk-fec-full-results.json` — Real FEC API results for federal politicians (2026-02-22 snapshot)

### 5. **Database Layer** (`/supabase`, Supabase PostgreSQL)

#### Tables:
- **politicians** — Primary table (bioguide_id TEXT PRIMARY KEY)
  - Fields: name, office, office_level, party, district, jurisdiction, jurisdiction_type
  - Scoring: corruption_score, juice_box_tier, aipac_funding, israel_lobby_total
  - Relations: top5_donors (JSONB), social_media (JSONB), source_ids (JSONB), lobbying_records (JSONB), voting_records (JSONB)
  - Timestamps: created_at, updated_at

- **social_posts** — Scraped posts indexed by posted_at DESC
  - Fields: politician_id (FK), platform, handle, content, post_url, sentiment_score, is_deleted
  - Timestamp tracking: posted_at, scraped_at

- **scrape_runs** — Audit trail for daemon executions
  - Fields: run_type, started_at, completed_at, status, posts_found, posts_new, errors, log (JSONB), metadata (JSONB)

#### Security:
- Row-Level Security enabled on all tables
- Public read access for all tables
- Service role write access for cron jobs
- No authentication required (fully public API)

## Data Flow

### **Real-Time Read Path** (User queries)
```
User Page (e.g., /politician/[id])
  ↓
useEffect() → fetch(/api/politicians)
  ↓
API Route Handler (/api/politicians/route.ts)
  ↓
getServerSupabase().from('politicians').select()
  ↓
[Database connection OK?]
  ├─ YES → Supabase query → map to Politician[] → JSON response
  └─ NO → fallback to getJsonPoliticians() → JSON response
  ↓
Client re-renders with politician data
```

### **Vote Record Fetch** (Dynamic, on-demand)
```
User opens "Votes" tab on politician detail page
  ↓
fetchVotingRecords() callback triggered
  ↓
[Is federal politician?]
  ├─ YES:
  │   ├─ Try /api/politicians/votes?bioguideId=X (Supabase-backed)
  │   ├─ Fallback to Congress.gov API for sponsored bills
  │   └─ Map to VotingRecord[] interface
  │
  └─ NO (State legislator):
      └─ Try /api/legiscan (LegiScan API)
          └─ Map to StateVoteRecord interface
  ↓
Render vote table filtered by category/search
```

### **Daily Data Sync** (Vercel Cron)
```
[3:00 AM UTC] Vercel invokes /api/cron/sync-fec
  ↓
verifyCronAuth(request) ← validates X-Vercel-Cron header
  ↓
getServiceRoleSupabase() → fetch active politicians with FEC candidate IDs
  ↓
For each politician:
  ├─ fecFetch(/candidates/{fecCandidateId}/contributions)
  ├─ Parse & aggregate donations
  ├─ Identify AIPAC via ISRAEL_LOBBY_COMMITTEE_IDS + name patterns
  ├─ [Rate limit check: 500ms delay between requests]
  └─ upsert to politicians table
  ↓
Log results (syncedCount, errorCount)
  ↓
Response: { status: 'success', syncedCount, errors }
```

### **Corruption Score Computation** (On-demand or batch)
```
computeCorruptionScore(politician)
  ↓
[Derive contribution breakdown]
  ├─ Use politician.contributionBreakdown if available
  └─ Otherwise derive from politician.top5Donors
  ↓
Compute 5 factors:
  1. PAC ratio: (pacs + aipac) / totalRaised
  2. Lobbying: count of lobbying_records (or placeholder)
  3. Voting alignment: analyze votes vs top donor interests (or placeholder)
  4. Transparency: % of source IDs present (bioguide, opensecrets, fec, etc.)
  5. Red flags: self-funding, donor concentration, PAC ratio anomalies
  ↓
Apply weights (sum = 1.0)
  ↓
Result: CorruptionScoreResult { score: 0-100, grade: A-F, factors: [...], confidence: high|medium|low, dataCompleteness: % }
```

### **Social Media Scraping** (Daemon + Cron)
```
[Manual trigger] script/sync-social-media.ts OR [Daemon running] social-media-daemon.ts
  ↓
For each politician with social media handles:
  ├─ Scrape Twitter/Facebook/Instagram/TikTok posts
  ├─ Compute sentiment_score (-1.0 to 1.0)
  ├─ Detect deleted posts
  └─ Insert/update in social_posts table
  ↓
Update scrape_runs table with:
  ├─ status: running|completed|failed
  ├─ posts_found, posts_new, errors
  └─ log: detailed execution log
  ↓
API /api/daemon-status polls scrape_runs for latest status
```

### **Fallback Strategy** (Supabase unavailable)
```
[Supabase API unreachable or unconfigured]
  ↓
All reads fall back to JSON files:
  ├─ getAllPoliticians() loads florida_politicians.json
  ├─ + merges jfk-fec-full-results.json (FEC data)
  ├─ + merges county data from *-county-data.ts imports
  └─ + pre-computes corruption scores
  ↓
Response served as JSON (same shape as DB records)
  ↓
UI remains fully functional (read-only)
```

## Key Abstractions

### **Politician (Central Model)**
```typescript
interface Politician {
  id: string;                          // bioguide_id or custom local ID
  name: string;
  office: string;
  officeLevel: OfficeLevel;
  party: Party;
  jurisdiction: string;
  jurisdictionType: JurisdictionType;

  // Scoring
  corruptionScore: number;              // 0-100
  corruptionScoreDetails?: CorruptionScoreResult;
  juiceBoxTier: JuiceBoxTier;

  // Funding
  aipacFunding: number;
  topDonor?: { name: string; amount: number };
  totalFundsRaised?: number;
  top3Donors?: Array<{ name: string; amount: number; type: 'PAC' | 'Individual' | 'Corporate' | 'Israel-PAC' }>;
  top5Donors?: Array<...>;
  israelLobbyTotal?: number;
  israelLobbyBreakdown?: { total, pacs, ie, bundlers };

  // Relations
  contributions?: Contribution[];
  votes?: Vote[];
  socialPosts?: SocialPost[];
  lobbyingRecords?: LobbyingRecord[];

  // Metadata
  source_ids?: { bioguide_id?, govtrack_id?, opensecrets_id?, fec_candidate_id?, votesmart_id? };
  dataStatus?: 'live' | 'mock';
  dataSource?: 'supabase' | 'fec_api' | 'json' | 'legiscan';
  lastUpdated?: string;
}
```

### **Corruption Score Algorithm**
```typescript
interface CorruptionScoreResult {
  score: number;                        // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  confidence: 'high' | 'medium' | 'low';
  dataCompleteness: number;              // % of factors with real data
  factors: CorruptionFactor[];           // 5-factor breakdown
}

interface CorruptionFactor {
  key: string;                           // 'pac_ratio', 'lobbying_connections', etc.
  rawScore: number;                      // 0-100 before weighting
  weight: number;                        // 0-1 (all sum to 1.0)
  weightedScore: number;                 // rawScore * weight
  dataAvailable: boolean;                // real data or placeholder?
  explanation: string;                   // how was this factor scored?
}
```

### **Voting Record (Federated)**
```typescript
interface VotingRecord {
  id: string;
  politicianId: string;
  billNumber: string;
  billTitle: string;
  billDescription?: string;
  voteDate: string;
  votePosition: 'Yea' | 'Nay' | 'NV' | 'Absent' | 'Yes' | 'No' | 'Not Voting' | string;
  source: 'congress' | 'legiscan' | 'supabase';  // where did this come from?
  billUrl?: string;
  category?: string;
  passed?: boolean;
}
```

### **Repository Pattern** (Data Access)
```typescript
// Multiple implementations behind a consistent interface:
interface IPoliticianRepository {
  getAll(): Promise<Politician[]>;
  getById(id: string): Promise<Politician | null>;
  getByJurisdiction(jurisdiction: string): Promise<Politician[]>;
  update(id: string, updates: Partial<Politician>): Promise<Politician>;
}

// Implementations:
// - SupabaseRepository (DB queries)
// - JsonRepository (fallback JSON files)
// - Both conform to same interface
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


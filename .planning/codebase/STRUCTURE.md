# Project Structure

## Directory Layout

```
/Users/kirolosabdalla/Snitched.ai/
├── .git/                               # Git repository
├── .planning/                          # Planning & analysis documents
│   └── codebase/
│       ├── ARCHITECTURE.md             # System architecture (this file describes it)
│       └── STRUCTURE.md                # Directory structure (you are here)
│
├── app/                                # Next.js 16 app router (pages + API routes)
│   ├── layout.tsx                      # Root layout with metadata & TerminalHeader
│   ├── page.tsx                        # Home page (live feed, ticker, stats)
│   ├── globals-terminal.css            # Terminal-themed global styles
│   ├── favicon.ico                     # Snitched.ai logo
│   │
│   ├── api/                            # API Routes (serverless functions)
│   │   ├── politicians/
│   │   │   ├── route.ts                # GET /api/politicians → all politicians
│   │   │   └── votes/
│   │   │       └── route.ts            # GET /api/politicians/votes?bioguideId=X
│   │   ├── bills/
│   │   │   ├── route.ts                # GET /api/bills
│   │   │   └── search/
│   │   │       └── route.ts            # GET /api/bills/search?q=X
│   │   ├── social-posts/
│   │   │   └── route.ts                # GET /api/social-posts
│   │   ├── lobbying/
│   │   │   └── route.ts                # GET /api/lobbying?politicianId=X
│   │   ├── fec/                        # FEC API proxy routes
│   │   │   ├── candidates/
│   │   │   │   └── route.ts            # GET /api/fec/candidates
│   │   │   ├── contributions/
│   │   │   │   └── route.ts            # GET /api/fec/contributions
│   │   │   └── filings/
│   │   │       └── route.ts            # GET /api/fec/filings
│   │   ├── congress/                   # Congress.gov data
│   │   │   ├── members/
│   │   │   │   └── route.ts            # GET /api/congress/members
│   │   │   └── bills/
│   │   │       └── route.ts            # GET /api/congress/bills
│   │   ├── legiscan/
│   │   │   └── route.ts                # GET /api/legiscan (FL state voting)
│   │   ├── cron/                       # Vercel cron jobs (scheduled tasks)
│   │   │   ├── sync-fec/
│   │   │   │   └── route.ts            # GET /api/cron/sync-fec (3 AM UTC daily)
│   │   │   ├── sync-congress/
│   │   │   │   └── route.ts            # GET /api/cron/sync-congress
│   │   │   ├── sync-legiscan/
│   │   │   │   └── route.ts            # GET /api/cron/sync-legiscan
│   │   │   └── sync-social-media/
│   │   │       └── route.ts            # GET /api/cron/sync-social-media
│   │   └── daemon-status/
│   │       └── route.ts                # GET /api/daemon-status (social daemon health)
│   │
│   ├── candidates/
│   │   └── page.tsx                    # Browse all candidates (grid/list)
│   ├── officials/
│   │   └── page.tsx                    # Officials directory
│   ├── politician/
│   │   └── [id]/
│   │       └── page.tsx                # Detail page: /politician/[id]
│   │                                   # Tabs: overview, votes, funding, social, lobbying
│   ├── social/
│   │   └── page.tsx                    # Social media feed
│   ├── hierarchy/
│   │   └── page.tsx                    # Organizational hierarchy chart
│   ├── juicebox/
│   │   └── page.tsx                    # Corruption scoring dashboard
│   └── browse/
│       └── page.tsx                    # Enhanced search/browse interface
│
├── components/                         # Reusable React components
│   ├── TerminalHeader.tsx              # Top navigation bar (terminal-themed)
│   ├── SearchBar.tsx                   # Global politician search with autocomplete
│   ├── PoliticianCard.tsx              # Card component for politician display
│   └── SocialFeed.tsx                  # Real-time social media feed component
│
├── lib/                                # Business logic & utilities
│   ├── types.ts                        # Central TypeScript interfaces (537 lines)
│   │                                   # Includes: Politician, Vote, Contribution,
│   │                                   # SocialPost, LobbyingRecord, CorruptionScoreResult,
│   │                                   # LegiScan types, LDA types, etc.
│   ├── supabase-server.ts              # Supabase client factory (server-only)
│   │                                   # Functions: getServerSupabase(), getServiceRoleSupabase()
│   ├── real-data.ts                    # JSON data aggregator + fallback (549 lines)
│   │                                   # Merges: florida_politicians.json + FEC results + county data
│   │                                   # Exports: getAllPoliticians(), getPoliticianById()
│   ├── corruption-score.ts             # Corruption scoring algorithm (591 lines)
│   │                                   # Computes 0-100 score from 5 weighted factors
│   ├── fec-client.ts                   # FEC API wrapper
│   │                                   # Rate limiting, AIPAC detection, contribution aggregation
│   ├── cron-auth.ts                    # Verifies Vercel cron job signatures
│   │
│   ├── bills-data.ts                   # Sample/fallback bill data
│   │
│   ├── *-county-data.ts                # County-level politician fixtures (hardcoded)
│   │   ├── volusia-county-data.ts      # Volusia County officials
│   │   ├── brevard-county-data.ts      # Brevard County officials
│   │   ├── orange-county-data.ts       # Orange County officials
│   │   ├── putnam-county-data.ts       # Putnam County officials
│   │   ├── lake-county-data.ts         # Lake County officials
│   │   ├── flagler-county-data.ts      # Flagler County officials
│   │   └── seminole-county-data.ts     # Seminole County officials
│
├── scripts/                            # Data ingestion & daemon scripts (Node.js/tsx)
│   ├── sync-fec-data.ts                # Sync FEC API → Supabase (supports --dry-run)
│   ├── sync-congress-data.ts           # Sync Congress.gov data
│   ├── sync-legiscan-data.ts           # Sync FL state voting records
│   ├── sync-lobbying-data.ts           # Sync LDA lobbying filings
│   ├── sync-voting-records.ts          # Aggregate voting records from multiple sources
│   ├── sync-social-media.ts            # Manual social media scraping trigger
│   ├── sync-corruption-scores.ts       # Recompute & update corruption scores in DB
│   ├── seed-supabase.ts                # One-time DB population from JSON
│   ├── social-media-daemon.ts          # Long-running social media scraper
│   └── start-social-daemon.sh          # Bash script to start daemon (pm2 or direct)
│
├── data-ingestion/                     # Raw data files & processing
│   ├── phase1/
│   │   ├── processed/
│   │   │   └── florida_politicians.json # 188 FL officials (congress-legislators dataset)
│   │   │                               # Fields: politician_id, name, office, office_level,
│   │   │                               # party, district, jurisdiction, jurisdiction_type,
│   │   │                               # photo_url, term_start, term_end, bio,
│   │   │                               # twitter_handle, facebook_page_id, etc.,
│   │   │                               # source_ids: {bioguide_id, govtrack_id, opensecrets_id, fec_candidate_id}
│   │   └── reports/
│   │       └── [phase1 audit reports]
│   │
│   ├── jfk-fec-results/
│   │   └── jfk-fec-full-results.json   # Real FEC API results (2026-02-22 snapshot)
│   │                                   # Fields: politician_id, total_raised, aipac_total,
│   │                                   # aipac_count, top_donors, breakdown, contributions
│   │
│   └── [jfk-fec-results/]
│       └── [various reports & logs]
│
├── supabase/                           # Supabase configuration
│   └── schema.sql                      # PostgreSQL schema (DDL)
│                                       # Tables: politicians, social_posts, scrape_runs
│                                       # RLS policies, triggers, indexes
│
├── public/                             # Static assets
│   ├── og-image.png                    # Open Graph image for social sharing
│   └── politicians/                    # [Potentially politician avatars]
│
├── docs/                               # Project documentation
│   ├── DATABASE_SCHEMA.md              # Database schema deep-dive
│   ├── PHASE_2_UPDATES.md              # Phase 2 enhancement plans
│   ├── TICKETS.md                      # Feature/bug tracking
│   ├── TEAM.md                         # Team documentation
│   └── README.md                       # Project overview
│
├── scrapers/                           # Legacy scraper code (Python)
│   ├── README.md                       # Scraper documentation
│   ├── INTEGRATION_REPORT.md           # Integration status
│   ├── INSTALLATION.md                 # Setup instructions
│   ├── DELIVERABLES.md                 # Deliverables checklist
│   ├── logs/                           # Scraper execution logs
│   └── sample-data/                    # Sample scraper outputs
│
├── package.json                        # NPM dependencies
│   Dependencies: dotenv, next, react, react-dom
│   DevDependencies: @supabase/supabase-js, @tailwindcss/postcss,
│                    tailwindcss, tsx, typescript, @types/*
│
├── package-lock.json                   # Dependency lock file
├── tsconfig.json                       # TypeScript configuration
├── next.config.js                      # Next.js configuration
├── tailwind.config.js                  # Tailwind CSS configuration
├── vercel.json                         # Vercel deployment config
│                                       # Cron job schedule: /api/cron/sync-fec (3 AM UTC)
├── README.md                           # Main project README
├── MOBILE-OPTIMIZATION-PLAN.md         # Mobile design strategy
└── .gitignore                          # Git ignore rules

```

## Key Locations

| Path | Purpose | Key Content |
|------|---------|-------------|
| `/app/page.tsx` | Home page | Live feed, ticker, key stats from real data |
| `/app/politician/[id]/page.tsx` | Politician detail | Tabs: overview, votes, funding, social, lobbying |
| `/app/api/politicians/route.ts` | Main data endpoint | Fetches from Supabase or JSON fallback |
| `/app/api/cron/sync-fec/route.ts` | Daily FEC sync | Updates `corruption_score`, `aipac_funding`, `top5_donors` |
| `/lib/types.ts` | Data contracts | Politician, Vote, CorruptionScoreResult interfaces |
| `/lib/real-data.ts` | JSON fallback | Aggregates florida_politicians.json + FEC results + county data |
| `/lib/corruption-score.ts` | Scoring logic | Weighted 5-factor algorithm (30% PAC ratio, 20% lobbying, etc.) |
| `/lib/supabase-server.ts` | DB client factory | Singletons for read & write access |
| `/lib/fec-client.ts` | FEC API proxy | Rate limiting, AIPAC detection |
| `/supabase/schema.sql` | DB schema | Tables: politicians, social_posts, scrape_runs; RLS policies |
| `/data-ingestion/phase1/processed/florida_politicians.json` | Master politician list | 188 FL officials with IDs, office level, social media |
| `/data-ingestion/jfk-fec-results/jfk-fec-full-results.json` | Real FEC data | Campaign finance for federal politicians |
| `/scripts/sync-fec-data.ts` | Manual FEC sync | CLI: `npx tsx scripts/sync-fec-data.ts --dry-run` |
| `/scripts/social-media-daemon.ts` | Social scraper daemon | Continuous scraping: `tsx scripts/social-media-daemon.ts` |

## Naming Conventions

### **File Naming**
- **Pages**: `page.tsx` (Next.js App Router convention)
- **API Routes**: `route.ts` (Next.js App Router convention)
- **Components**: PascalCase (e.g., `TerminalHeader.tsx`, `PoliticianCard.tsx`)
- **Utilities/Types**: camelCase or snake_case (e.g., `corruption-score.ts`, `fec-client.ts`)
- **County Data**: `{county-name}-county-data.ts` (e.g., `volusia-county-data.ts`)
- **Sync Scripts**: `sync-{source}-data.ts` (e.g., `sync-fec-data.ts`)

### **Module Exports**
- **Functions**: camelCase (e.g., `getAllPoliticians()`, `computeCorruptionScore()`)
- **Types/Interfaces**: PascalCase (e.g., `Politician`, `CorruptionScoreResult`, `VotingRecord`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `ISRAEL_LOBBY_COMMITTEE_IDS`, `FEDERAL_OFFICES`)

### **Route Naming**
- **Data endpoints**: `/api/{entity}` (e.g., `/api/politicians`)
- **Proxy endpoints**: `/api/{external-source}/{resource}` (e.g., `/api/fec/candidates`)
- **Cron jobs**: `/api/cron/{action}` (e.g., `/api/cron/sync-fec`)
- **Page routes**: kebab-case in URL, but `[id]` for dynamic segments (e.g., `/politician/[id]`)

### **Database Naming**
- **Tables**: snake_case (e.g., `politicians`, `social_posts`, `scrape_runs`)
- **Columns**: snake_case (e.g., `bioguide_id`, `corruption_score`, `aipac_funding`)
- **Indexes**: `idx_{table}_{column}` (e.g., `idx_politicians_jurisdiction`)
- **Policies**: Description format (e.g., "Public read access", "Service insert access")

### **TypeScript Naming**
- **Interfaces**: `IPoliticianRepository` (optional `I` prefix for abstract contracts)
- **Types**: `Politician`, `Vote`, `CorruptionScoreResult`, `JurisdictionType`, `Party`
- **Enums**: `CorruptionGrade`, `JurisdictionType`, `OfficeLevel`
- **Generic functions**: `<T extends Base>` (standard TypeScript conventions)

## File Organization Pattern

### **by Feature (Current Model)**
Code is organized by feature/domain, not by type:
```
app/api/politicians/         ← Feature: politicians
  ├── route.ts              ← Main endpoint
  └── votes/
      └── route.ts          ← Sub-feature: voting records

app/politician/             ← Feature: individual politician
  └── [id]/
      └── page.tsx          ← Detail page

lib/
  ├── corruption-score.ts   ← Feature: scoring algorithm
  ├── fec-client.ts         ← Feature: FEC API integration
  └── volusia-county-data.ts ← Feature: Volusia County data
```

### **Rationale**
- **High Cohesion**: Code related to a feature lives together
- **Low Coupling**: Minimal cross-feature dependencies
- **Scalability**: Easy to add new features (e.g., new county data) without restructuring
- **Clarity**: File path suggests feature at a glance

### **File Size Distribution**
```
lib/ (6019 total lines):
  ├── types.ts              537 lines   (9%)   ← Interfaces only
  ├── real-data.ts          549 lines   (9%)   ← Data aggregation
  ├── corruption-score.ts    591 lines  (10%)  ← Algorithm + helpers
  ├── volusia-county-data.ts 653 lines  (11%)  ← Hardcoded data
  ├── flagler-county-data.ts 645 lines  (11%)  ← Hardcoded data
  ├── orange-county-data.ts  589 lines  (10%)  ← Hardcoded data
  ├── seminole-county-data.ts 549 lines (9%)   ← Hardcoded data
  ├── brevard-county-data.ts 505 lines  (8%)   ← Hardcoded data
  ├── putnam-county-data.ts  517 lines  (8%)   ← Hardcoded data
  ├── lake-county-data.ts    501 lines  (8%)   ← Hardcoded data
  ├── fec-client.ts          ~120 lines (2%)   ← API client
  ├── supabase-server.ts     ~60 lines  (1%)   ← DB client factory
  └── cron-auth.ts           ~50 lines  (1%)   ← Auth utilities
```

**Pattern**: Largest files are data files (county fixtures) and algorithms (corruption scoring). Utility files are small & focused.

### **Layer Dependencies**
```
Presentation Layer (pages, components)
  ↓
API Layer (route.ts files)
  ↓
Business Logic (lib/*.ts)
  ├── Data Access (supabase-server.ts, real-data.ts)
  ├── External APIs (fec-client.ts)
  ├── Algorithms (corruption-score.ts)
  └── Types (types.ts)
  ↓
Database Layer (Supabase PostgreSQL)
```

**No circular dependencies**: Types are at the base. Features import types but not vice versa.

## Import Path Conventions

### **Absolute Imports** (via `jsconfig.json` or `tsconfig.json`)
```typescript
import type { Politician } from '@/lib/types';
import { getAllPoliticians } from '@/lib/real-data';
import { computeCorruptionScore } from '@/lib/corruption-score';
import { TerminalHeader } from '@/components/TerminalHeader';
```

**Pattern**: `@/` prefix for project root paths (Not `../../../` relative imports)

### **External Package Imports**
```typescript
import { createClient } from '@supabase/supabase-js';
import type { NextRequest, NextResponse } from 'next/server';
import { useState, useEffect } from 'react';
```

### **No Wildcard Imports**
```typescript
// GOOD
import { getAllPoliticians, getPoliticianById } from '@/lib/real-data';

// AVOID
import * as realData from '@/lib/real-data';
```


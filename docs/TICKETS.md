# Snitched.ai — Ticket Board

> Last updated: 2026-02-28

---

## DONE (Phase 1)

### [DONE-001] Dead Code Cleanup
**Assignee:** `agent:backend` | **Priority:** P1
Removed deprecated supabase.ts, unused tasks page, Header component, page-redesign, page-political-theme, globals.css, supabase-data.ts. Net -2,600 lines.

### [DONE-002] Client Components → API Routes
**Assignee:** `agent:backend` | **Priority:** P1
Updated 7 client components to use `fetch('/api/politicians')` instead of direct `getAllPoliticians()` imports.

### [DONE-003] Real FEC Data Integration
**Assignee:** `agent:data` | **Priority:** P1
Wired real FEC data for 20 politicians ($71.2M total). Three-tier system: full verified, total only, none.

### [DONE-004] Search Functionality
**Assignee:** `agent:frontend` | **Priority:** P1
Terminal-style fuzzy search bar in TerminalHeader. Searches name, office, party, district, jurisdiction.

---

## DONE (Phase 2)

### [DONE-005] LegiScan API — FL State Voting Records
**Assignee:** `agent:data` | **Priority:** P1
`/api/legiscan` proxy route + `data-ingestion/fetch-legiscan-data.ts` ingestion script.

### [DONE-006] Congress.gov API Routes
**Assignee:** `agent:backend` | **Priority:** P1
`/api/congress/members` and `/api/congress/bills` proxy routes with member lookup, bill search.

### [DONE-007] FEC API Routes (Enhanced)
**Assignee:** `agent:backend` | **Priority:** P1
`/api/fec/candidates`, `/api/fec/contributions`, `/api/fec/filings` proxy routes with pagination handling.

### [DONE-008] LDA Lobbying Data Integration
**Assignee:** `agent:data` | **Priority:** P2
`/api/lobbying` proxy route for LDA lobbying disclosure data.

### [DONE-009] Corruption Score v1 Algorithm
**Assignee:** `agent:data` + `agent:backend` | **Priority:** P1
5-factor weighted algorithm (0-100): PAC ratio (30%), Lobbying (20%), Voting alignment (25%), Transparency (10%), Red flags (15%). Letter grades A-F. Confidence levels. Full breakdown on Juicebox + politician detail.

### [DONE-010] Cron Jobs for Data Sync
**Assignee:** `agent:devops` | **Priority:** P2
`/api/cron/sync-congress`, `/api/cron/sync-fec`, `/api/cron/sync-legiscan` + `vercel.json` schedules + `lib/cron-auth.ts`.

---

## NEXT UP (Phase 3 — Data Enrichment)

### [TICK-011] Link Lobbying Data to Politicians
**Assignee:** `agent:data` | **Priority:** P1 | **Status:** Queued
- Match LDA lobbying records to politicians by name/state
- Light up the Lobbying Connections factor (20% of corruption score)
- Currently placeholder — real data will significantly improve score accuracy

### [TICK-012] Voting Alignment Analysis
**Assignee:** `agent:data` | **Priority:** P1 | **Status:** Queued
- Categorize bills by industry/interest area
- Map donor interests to bill categories
- Determine if votes align with donor interests
- Light up the Voting Alignment factor (25% of corruption score)

### [TICK-013] FEC Complaint Data
**Assignee:** `agent:data` | **Priority:** P2 | **Status:** Queued
- Pull actual FEC complaints/enforcement actions
- Integrate into Campaign Finance Red Flags factor
- Improve red flags signal beyond pattern detection

### [TICK-014] Score Backtesting & Calibration
**Assignee:** `agent:data` | **Priority:** P2 | **Status:** Queued
- Run algorithm against known corruption cases
- Calibrate weights and thresholds
- Validate scoring accuracy

---

## BACKLOG

### [TICK-015] Score History Tracking
**Assignee:** `agent:backend` | **Priority:** P2
Store score snapshots over time, show trend on politician detail pages.

### [TICK-016] Supabase Database Seeding
**Assignee:** `agent:data` | **Priority:** P2
Seed Supabase with all 188 FL politicians from florida_politicians.json + FEC data.

### [TICK-017] Politician Detail Page — Voting Tab Enhancement
**Assignee:** `agent:frontend` | **Priority:** P2
Show real voting records from Congress.gov and LegiScan on politician detail pages.

### [TICK-018] Mobile Optimization
**Assignee:** `agent:ui` | **Priority:** P3
Responsive layout improvements per MOBILE-OPTIMIZATION-PLAN.md.

### [TICK-019] Real-time Social Media Monitoring
**Assignee:** `agent:data` | **Priority:** P3
Wire up social media scrapers for live politician activity tracking.

### [TICK-020] Court Case Data Integration
**Assignee:** `agent:data` | **Priority:** P3
Legal records integration — scaffolding exists, needs data source.

---

## Ticket Template
```
### [TICK-XXX] Title
**Assignee:** `agent:role` | **Priority:** P1/P2/P3 | **Status:** Queued/In Progress/In Review/Done
Description of the task.
- [ ] Subtask 1
- [ ] Subtask 2
```

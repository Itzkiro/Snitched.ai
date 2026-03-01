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

## IN PROGRESS (Phase 2)

### [TICK-001] LegiScan API — FL State Voting Records
**Assignee:** `agent:data` | **Priority:** P1 | **Status:** In Progress
- Integrate LegiScan API for Florida state legislature voting records
- Fetch bills, votes, and roll calls for FL state politicians
- Store results and wire into politician detail pages
- API Key: `LEGISCAN_API_KEY` in `.env`
- Docs: https://api.legiscan.com/dl/

### [TICK-002] Congress.gov API Route
**Assignee:** `agent:backend` | **Priority:** P1 | **Status:** In Progress
- Build `/api/congress/*` proxy routes for Congress.gov API
- Endpoints needed: member lookup, bill search, vote records
- Use `CONGRESS_API_KEY` from `.env`
- Replace any client-side Congress.gov calls with server proxy
- Docs: https://api.congress.gov/

### [TICK-003] FEC API Route (Enhanced)
**Assignee:** `agent:backend` | **Priority:** P1 | **Status:** In Progress
- Build `/api/fec/*` proxy routes for FEC API
- Endpoints: candidate lookup, committee contributions, filing search
- Use `FEC_API_KEY` from `.env`
- Enhance existing FEC data with live API calls
- Docs: https://api.open.fec.gov/developers/

### [TICK-004] LDA Lobbying Data Integration
**Assignee:** `agent:data` | **Priority:** P2 | **Status:** In Progress
- Integrate LDA (Lobbying Disclosure Act) data
- Fetch lobbying registrations and activity reports
- Link lobbying data to politicians
- Use `LDA_API_KEY` from `.env`

### [TICK-005] Corruption Score v1 Algorithm
**Assignee:** `agent:data` + `agent:backend` | **Priority:** P1 | **Status:** In Progress
- Design scoring algorithm using real data inputs:
  - FEC contribution amounts and sources (especially PAC/AIPAC)
  - Voting alignment with donor interests
  - Lobbying connections (LDA data)
  - Public financial disclosures
- Normalize scores 0-100
- Wire into politician cards and detail pages

### [TICK-006] Cron Jobs for Data Sync
**Assignee:** `agent:devops` | **Priority:** P2 | **Status:** Queued
- Set up Vercel cron or external scheduler
- Periodic FEC data refresh
- Congress.gov vote sync
- LegiScan bill tracking updates

---

## BACKLOG

### [TICK-007] Supabase Database Seeding
**Assignee:** `agent:data` | **Priority:** P2
Seed Supabase with all 188 FL politicians from florida_politicians.json + FEC data.

### [TICK-008] Politician Detail Page — Voting Tab Enhancement
**Assignee:** `agent:frontend` | **Priority:** P2
Show real voting records from Congress.gov and LegiScan on politician detail pages.

### [TICK-009] Mobile Optimization
**Assignee:** `agent:ui` | **Priority:** P3
Responsive layout improvements per MOBILE-OPTIMIZATION-PLAN.md.

### [TICK-010] Real-time Social Media Monitoring
**Assignee:** `agent:data` | **Priority:** P3
Wire up social media scrapers for live politician activity tracking.

### [TICK-011] Court Case Data Integration
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

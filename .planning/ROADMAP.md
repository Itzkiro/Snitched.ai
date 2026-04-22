# Roadmap: Snitched.ai

**Milestone:** v1.0
**Phases:** 10
**Requirements:** 10 mapped

## Phase Overview

| # | Phase | Goal | Requirements | Plans | UI hint |
|---|-------|------|--------------|-------|---------|
| 1 | Infrastructure & Security Hardening | Secure credentials, add per-politician API endpoint, remove public dashboard leak | — | 5 | no |
| 2 | Federal Data Verification & Cleanup | Confirm FEC data is complete and accurate for all 30 federal politicians | FED-01 | 6 | no |
| 3 | Financial Breakdown Accuracy | Ensure PAC, individual, corporate, and Israel lobby breakdowns are correct | FED-02 | 5 | no |
| 4 | Independent Expenditures Display | Surface IE data (for/against) in politician detail view | FED-03 | 4 | yes |
| 5 | Corruption Score — Real Data | Replace PLACEHOLDER_SCORE with real computed factors for all federal politicians | FED-04 | 6 | no |
| 6 | FL State Legislators Pipeline | Build FL Division of Elections integration for 120 state legislators | SLD-01 | 7 | no |
| 7 | County Officials Pipeline | Extend FL Division of Elections pipeline to county officials | SLD-02 | 5 | no |
| 8 | Politician Detail Page — Financial Tab | Wire financial tab to real data; make all subviews functional | UI-01 | 6 | yes |
| 9 | Placeholder Cleanup & OSINT Feed | Remove "PHASE 2 COMING SOON" banners; resolve fake LIVE feed | UI-02, UI-03 | 5 | yes |
| 10 | Mobile Responsive Layout | Make all pages fully usable on mobile devices | UI-04 | 6 | yes |

---

## Phase Details

### Phase 1: Infrastructure & Security Hardening

**Goal:** Establish a safe, performant foundation before any data or UI work — rotate the exposed service role key, harden Supabase RLS, add an `is_audited` visibility gate so un-audited politicians aren't publicly exposed, fix bills-search query injection, add `/api/politicians/[id]` to eliminate the 400-politician over-fetch, and remove the publicly-accessible `dashboard.html`.

**Requirements:** (no v1 functional requirements; prerequisite for all phases)

**Dependencies:** None

**UI hint:** no

**Success criteria:**
1. A request to `/api/politicians/[id]` returns data for exactly one politician without fetching all 400+.
2. The Supabase service role JWT that was hardcoded in 8 scripts has been rotated and the old key is revoked.
3. `dashboard.html` is no longer publicly accessible (returns 404 or requires auth).
4. All 8 previously-hardcoded credential files reference environment variables only, verified by a grep scan showing zero hardcoded JWTs.
5. **(C2)** An UPDATE or DELETE against `politicians` using only the anon key fails. Writes only succeed with the service role.
6. **(C3)** An `is_audited` column exists on `politicians`, is backfilled `true` for the rows in `data-ingestion/audit-tracker.csv` (and `false` everywhere else), and every public read path (`/api/politicians`, `/search`, `/[id]`, `/export`, plus `BrowseClient.tsx`) returns only audited rows for unauthenticated requests.
7. **(C4)** `app/api/bills/search/route.ts` no longer interpolates raw user input into a PostgREST filter; a grep for `.or(\`` / template-literal-in-filter patterns across all API routes returns zero matches.

---

### Phase 2: Federal Data Verification & Cleanup

**Goal:** Confirm that every one of the 30 federal politicians has real, complete FEC funding data in the database — no nulls, no truncated totals, no missing cycles — so the Funding tab can display truthful numbers.

**Requirements:** FED-01

**Dependencies:** Phase 1

**UI hint:** no

**Success criteria:**
1. All 30 federal politicians have a non-null `total_raised` value in the database sourced from FEC filings.
2. Funding data covers the current and at least one prior election cycle for each politician.
3. A manual spot-check of 5 politicians against FEC.gov shows figures within an acceptable rounding margin.
4. The daily cron job completes without errors and updates timestamps for all 30 records.

---

### Phase 3: Financial Breakdown Accuracy

**Goal:** Ensure the four breakdown categories — PAC, individual, corporate, and Israel lobby — are correctly computed and stored for every federal politician so users see an accurate funding composition.

**Requirements:** FED-02

**Dependencies:** Phase 2

**UI hint:** no

**Success criteria:**
1. Each of the 30 federal politicians has a non-null, non-zero value for at least the `pac_total` and `individual_total` breakdown fields.
2. The sum of breakdown categories reconciles with `total_raised` within a defined tolerance (e.g., ±5%).
3. Israel lobby / AIPAC detection flags are present for all politicians where PAC or IE data from AIPAC-linked entities exists.
4. A spot-check of 3 politicians confirms breakdown figures match FEC itemized disbursement records.

---

### Phase 4: Independent Expenditures Display

**Goal:** Surface Independent Expenditure data (support/oppose) on the politician detail page so users can see third-party spending around each federal politician.

**Requirements:** FED-03

**Dependencies:** Phase 3

**UI hint:** yes

**Success criteria:**
1. The politician detail page shows a section listing IEs with committee name, amount, support/oppose indicator, and filing date.
2. At least 10 of the 30 federal politicians (those with known IE activity) display non-empty IE sections.
3. A politician with no IEs shows a clear "No independent expenditures on record" state — not a broken empty component.
4. IE totals match values retrievable directly from the FEC API for the same politician.

---

### Phase 5: Corruption Score — Real Data

**Goal:** Replace the three `PLACEHOLDER_SCORE = 30` factors with real computed values so the corruption score reflects actual data rather than a hardcoded constant.

**Requirements:** FED-04

**Dependencies:** Phase 3

**UI hint:** no

**Success criteria:**
1. None of the 30 federal politicians shows `PLACEHOLDER_SCORE` (30) as a factor value in the database or API response.
2. All 5 corruption score factors return a real computed value for every federal politician.
3. The aggregate corruption score for at least 5 politicians changes (up or down) relative to the pre-fix baseline, confirming real data replaced the placeholder.
4. The score algorithm documentation (or code comments) identifies the data source for each of the 5 factors.

---

### Phase 6: FL State Legislators Pipeline

**Goal:** Build a new FL Division of Elections data pipeline that fetches and stores real campaign finance data for all 120 FL state legislators.

**Requirements:** SLD-01

**Dependencies:** Phase 1

**UI hint:** no

**Success criteria:**
1. All 120 FL state legislators have a non-null `total_raised` value sourced from FL Division of Elections data.
2. The pipeline handles pagination and rate limits without manual intervention.
3. Data is refreshed on a scheduled cadence (daily or weekly) via a cron job or equivalent.
4. A spot-check of 5 state legislators confirms figures are consistent with FL Division of Elections public search results.
5. Failed fetches are logged with enough detail to diagnose and retry.

---

### Phase 7: County Officials Pipeline

**Goal:** Extend the FL Division of Elections pipeline to cover county officials (commissioners, sheriffs, clerks, etc.) so all 158 non-federal politicians have real funding data.

**Requirements:** SLD-02

**Dependencies:** Phase 6

**UI hint:** no

**Success criteria:**
1. All county officials in the database have a non-null `total_raised` value sourced from FL Division of Elections.
2. The county pipeline reuses the state pipeline's integration layer with minimal duplication.
3. County officials no longer have fabricated corruption scores — scores are either computed from real data or withheld pending sufficient data.
4. A spot-check of 3 county officials confirms figures against FL Division of Elections public records.

---

### Phase 8: Politician Detail Page — Financial Tab

**Goal:** Make the financial tab on the politician detail page fully functional — wired to real data from the database, displaying all subviews (funding totals, breakdown chart, IEs, Israel lobby) with no broken states.

**Requirements:** UI-01

**Dependencies:** Phase 4, Phase 5, Phase 7

**UI hint:** yes

**Success criteria:**
1. Visiting any of the 30 federal politician detail pages shows a financial tab with real funding totals, a breakdown by category, and an IE section — all populated from live database data.
2. State legislators' financial tabs display real FL Division of Elections data without fallback to null or error states.
3. County officials' financial tabs display real data or a clear "Data pending" message — no fabricated figures.
4. The financial tab loads in under 2 seconds on a standard connection (benefiting from the per-politician API endpoint added in Phase 1).
5. All subviews render without console errors on Chrome, Firefox, and Safari.

---

### Phase 9: Placeholder Cleanup & OSINT Feed

**Goal:** Remove every "PHASE 2 COMING SOON" banner from the UI and either replace the fake "LIVE" OSINT feed with a real data source or remove it entirely — so the product communicates only verified capabilities.

**Requirements:** UI-02, UI-03

**Dependencies:** Phase 8

**UI hint:** yes

**Success criteria:**
1. A full-site text search returns zero instances of "PHASE 2 COMING SOON" in rendered page content.
2. The LIVE OSINT feed either shows real, timestamped public records data or has been removed — no fake or static entries remain visible to users.
3. Any feature area that previously showed a placeholder now either has real functionality or a clear "not yet available" message that does not imply imminent delivery.
4. No broken links or empty sections appear where placeholders were removed.

---

### Phase 10: Mobile Responsive Layout

**Goal:** Make every page in the application fully usable on mobile devices (320px–768px viewport), preserving the terminal/Bloomberg aesthetic while adapting layout to small screens.

**Requirements:** UI-04

**Dependencies:** Phase 9

**UI hint:** yes

**Success criteria:**
1. All pages pass a manual usability check at 375px viewport width (iPhone SE baseline) — no horizontal scroll, no overlapping text, all CTAs tappable.
2. The politician list, detail page, and financial tab are fully navigable on a mobile device without pinch-to-zoom.
3. The terminal/Bloomberg visual identity is preserved — fonts, color palette, and data-density remain consistent with the desktop experience.
4. Chrome DevTools mobile emulation shows no layout warnings for the 5 most-visited pages.

---

## Requirement Coverage

| Requirement | Phase |
|-------------|-------|
| FED-01 | Phase 2 |
| FED-02 | Phase 3 |
| FED-03 | Phase 4 |
| FED-04 | Phase 5 |
| SLD-01 | Phase 6 |
| SLD-02 | Phase 7 |
| UI-01 | Phase 8 |
| UI-02 | Phase 9 |
| UI-03 | Phase 9 |
| UI-04 | Phase 10 |

**Coverage:** 10/10 v1 requirements mapped. 0 unmapped.

---
*Roadmap created: 2026-04-02*

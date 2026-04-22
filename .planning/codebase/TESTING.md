# Testing Patterns

**Analysis Date:** 2026-04-22

## Executive Summary

**There is no automated test suite in this codebase.** Verification is done manually via ad-hoc TypeScript scripts and hand-written Markdown reports. This is a significant gap — every change ships without unit, integration, or E2E coverage.

Specifically:
- Zero `*.test.ts`, `*.test.tsx`, `*.spec.ts`, or `*.spec.tsx` files exist under the project root (excluding `node_modules`).
- No `__tests__/` or `tests/` directory exists.
- No test runner configured: no `jest.config.*`, `vitest.config.*`, `playwright.config.*`, or `jest` / `vitest` devDependency in `package.json`.
- `package.json` scripts block has NO `test`, `test:watch`, or `coverage` script — only `dev`, `build`, `start`:
  ```json
  "scripts": { "dev": "next dev", "build": "next build", "start": "next start" }
  ```

The only library in `devDependencies` remotely related to testing is **Playwright** (`playwright@^1.59.1`, `playwright-extra@^4.3.6`, `puppeteer-extra-plugin-stealth@^2.11.2`), and it is used exclusively for headless **scraping**, not E2E testing. See `scripts/fetch-oh-sos-bulk.ts`, `scripts/probe-oh-sos-*.ts`, `scripts/ingest-oh-acton-itemized.ts`, `scripts/scrape-vivek-oh-sos-*.ts`.

## Test Framework

**Runner:** None.

**Assertion Library:** None.

**Run Commands:** None defined.

## How Verification Actually Happens Today

In place of automated tests, the project relies on three manual patterns:

### 1. Ad-hoc Verification Scripts

One-off TypeScript scripts in `scripts/` that run against the live Supabase DB, print results to the console, and are typically discarded or left in the tree as historical artifacts. Representative examples:

- `scripts/verify-nc-officials.ts` — Reads `politicians` table filtered by `bioguide_id LIKE 'nc-%'`, prints jurisdiction counts and a sample of 10 officials. Warning: **contains a hardcoded service-role JWT on lines 1-6**.
- `scripts/audit-politician.ts` — 850+ line "audit runner" that re-fetches FEC data for a given bioguide ID, recomputes `corruptionScore` with the current scorer, writes back to DB, and appends a row to `data-ingestion/audit-tracker.csv`. Doubles as a correctness check on the scoring algorithm.
- `scripts/audit-registry-coverage.ts` — Checks donor registry coverage across the DB.
- `scripts/check-van-wert.ts` — Narrow sanity check on a specific county.
- `scripts/probe-oh-sos-*.ts` (six variants) — Manual probes of Ohio SOS HTML before building a scraper.
- `scripts/final-ohio-report.ts` — End-of-task summary report generator.
- `scripts/compare-acton-vivek-deep.ts`, `scripts/compare-oh-gov-pro-israel.ts` — Cross-reference sanity comparisons.

**Execution pattern:** `npx tsx scripts/<name>.ts [args]` or `npx tsx scripts/<name>.ts --batch file.txt`. Output is console logs and/or CSV/JSON written to `data-ingestion/`.

**Verb-prefix taxonomy of scripts** (71 of ~102 match): `seed-*`, `sync-*`, `fetch-*`, `audit-*`, `verify-*`, `probe-*`, `crossref-*`, `apply-*`, `enrich-*`, `flag-*`, `ingest-*`, `populate-*`, `scrape-*`, `refresh-*`, `score-*`.

### 2. Markdown Seeding/Verification Reports

After each large data-seeding operation, a hand-written Markdown report is committed at the project root documenting what was inserted, counts by jurisdiction, the bioguide-ID format used, and any caveats. These substitute for integration-test assertions. Examples:

- `NJ_OFFICIALS_SEEDING_REPORT.md` — 190 officials across 21 NJ counties + 5 cities.
- `NORTH_CAROLINA_SEEDING_REPORT.md` — 197 officials across 20 counties + 2 cities; explicitly names the seeding script (`/scripts/seed-nc-county-officials.ts`).
- `OHIO_18_COUNTIES_SEEDING_REPORT.md`, `OHIO_20_COUNTIES_SEED_REPORT.md`, `OHIO_20COUNTIES_SEEDING_REPORT.md` — Note the duplicate-ish filenames; three related reports on overlapping seed runs.
- `OHIO_CITIES_SEEDING_REPORT.md`, `OHIO_JUDGES_SEEDING_REPORT.md`, `OHIO_SCHOOL_BOARD_SEEDING_REPORT.md` — Per-office-type Ohio reports.
- `scrapers/INTEGRATION_REPORT.md` — 5-repo scraper integration summary (2026-02-22).

The reports encode expected counts (e.g., "190 officials"), the ID format used, and the script path — allowing a later reader to re-run and compare, but there is no automated diff.

### 3. Manual Browser Verification

Client-rendered pages (`/politician/[id]`, `/candidates`, `/juicebox`, `/connections`) are verified by loading them in a browser against local Supabase or production. Error paths log via `console.error` to the browser console; fallbacks to local JSON happen silently (`app/api/politicians/route.ts:92-98`, `app/page.tsx:20-48`).

## Existing Test Files

**None.** Searches across the repo return zero results:
```
find . -type f \( -name "*.test.*" -o -name "*.spec.*" \) -not -path '*/node_modules/*'
# → (empty)
find . -type d \( -name "__tests__" -o -name "tests" \) -not -path '*/node_modules/*'
# → (empty)
```

## Coverage

**Coverage tool:** None.

**Coverage requirements:** None enforced.

**View coverage:** Not applicable.

## Test Types

### Unit Tests
**Not used.** Pure functions that would be easy to unit-test (and currently untested):
- `lib/corruption-score.ts` (935 lines, weighted multi-factor scoring algorithm — `computeCorruptionScore`)
- `lib/fec-client.ts` (`isIsraelLobbyDonor`, `fecFetch` error translation)
- `lib/state-utils.ts` (`filterByState`, `getStateName`)
- `lib/format.ts`, `lib/politician-display.ts`
- `components/SearchBar.tsx` `fuzzyMatch()` and `scorePolitician()`
- `lib/industry-classifier.ts`
- `lib/zip-lookup.ts`

### Integration Tests
**Not used.** API routes (`app/api/**/route.ts`) are verified only by hitting them manually or via the browser. There is no harness that boots Next.js, seeds a test DB, and asserts response shapes.

Cron routes (`app/api/cron/sync-fec/route.ts`, etc.) are particularly risky: they mutate the production DB and are only exercised by Vercel's scheduler on the daily schedule defined in `vercel.json`.

### E2E Tests
**Not used.** Playwright is installed but only as a **scraping driver**, not a test runner. No `playwright.config.ts`, no `e2e/` directory, no smoke test of the deployed site.

## Test File Organization

**N/A — no test files exist.** If tests were to be added, the project's conventions suggest:
- Co-located next to source (`.test.ts` beside the module) — matches the "one concern per file" pattern in `lib/`.
- Or a dedicated `tests/` (unit + integration) with `e2e/` for Playwright, sibling to `app/`.

## Mocking

**N/A.** External APIs (FEC, LegiScan, LDA, CourtListener, Congress.gov, Exa) are called against live endpoints from both scripts and API routes. No HTTP mocking library (`nock`, `msw`, Playwright route mocks) is installed.

Supabase is "mocked" in practice by the graceful fallback pattern — when the client factory returns `null`, code loads data from local JSON fixtures under `data-ingestion/phase1/processed/florida_politicians.json` and `lib/*-county-data.ts`. This doubles as a dev-mode offline path AND as the only shield against Supabase outages.

## Fixtures

**Test fixtures do not exist formally**, but the codebase has a large body of production-seeded fixtures used as fallbacks:

- `data-ingestion/phase1/processed/florida_politicians.json` — 188 FL officials, primary fallback source.
- `data-ingestion/jfk-fec-results/jfk-fec-full-results.json` — FEC results snapshot (2026-02-22).
- `data-ingestion/*.json` — Per-candidate itemized snapshots (`mast-fec-2024-itemized.json`, `gallrein-fec-2026-itemized.json`, `torres-fec-2022-itemized.json`, etc.), ~30 files.
- `lib/volusia-county-data.ts`, `lib/brevard-county-data.ts`, `lib/orange-county-data.ts`, `lib/putnam-county-data.ts`, `lib/lake-county-data.ts`, `lib/flagler-county-data.ts`, `lib/seminole-county-data.ts` — Hardcoded county-level fixtures.
- `lib/bills-data.ts` — Sample bill data.
- `scrapers/sample-data/` — Sample output from each scraper (per `scrapers/INTEGRATION_REPORT.md:18-19`).

## Common Patterns (If Tests Were Added)

### Async Testing
The codebase is async-heavy (Supabase, external APIs). Any test framework adopted would need first-class Promise support. Vitest fits the existing `esnext` / `bundler` TS config; Jest would need config work.

### Error Testing
Domain errors are already typed: `FecError` (`lib/fec-client.ts:23-30`) carries an HTTP status, making `expect(err).toBeInstanceOf(FecError)` + `expect(err.status).toBe(429)` a natural assertion shape.

### Environment Setup
Tests would need to either mock `process.env` or lean on the existing null-return fallbacks in `getServerSupabase()` / `getFecApiKey()`. No `.env.test` convention exists.

## Gaps & Risk Assessment

Highest-risk untested areas, ordered by blast radius:

1. **Cron write paths** (`app/api/cron/sync-fec/route.ts`, `sync-congress`, `sync-legiscan`, `sync-social-media`, `sync-stats`, `track-fec-filings`, `research-candidates`, `refresh-gallrein-roster`, `monitor-news`, `sync-court-records`) — Mutate production Supabase with service-role key. A regression silently corrupts data for all users until the next manual audit.
2. **`computeCorruptionScore`** (`lib/corruption-score.ts`, 935 lines) — Core product value. Weight tweaks are applied "by eye" against `scripts/audit-politician.ts` output; there is no snapshot/golden-file test.
3. **Supabase → Politician row mapping** (`app/api/politicians/route.ts:59-89`, `app/api/politicians/[id]/route.ts`) — snake_case → camelCase transforms are hand-rolled and silently return `0` / `undefined` for missing columns.
4. **Fallback path to local JSON** — Exercised on every Supabase outage but never asserted. A bad shape in `data-ingestion/phase1/processed/florida_politicians.json` can ship a broken home page.
5. **`isIsraelLobbyDonor`** (`lib/fec-client.ts:124-130`) — String-match logic feeding downstream scoring and user-visible "Pro-Israel Lobby" badges; any false positive is publicly consequential.
6. **`verifyCronAuth`** (`lib/cron-auth.ts:20-40`) — One misrouted constant-time comparison and every cron endpoint becomes public.
7. **Environment variable typos** — No startup validation. `process.env.FEC_API_KEY` missing only surfaces when a request hits the throwing getter.
8. **Admin endpoints** (`app/api/admin/route.ts`) — Gated by `ADMIN_SECRET || CRON_SECRET`; no test asserts the gate is enforced.
9. **React client pages** — 2,169-line `app/politician/[id]/page.tsx` has no smoke test; any Supabase column rename breaks the dossier page silently in production.

## Recommended Minimum Baseline (Not Yet Implemented)

If/when testing is introduced, the cheapest high-value bets are:

1. **Vitest** for unit tests against `lib/corruption-score.ts`, `lib/fec-client.ts`, `components/SearchBar.tsx` fuzzy matcher, `lib/state-utils.ts`.
2. **Playwright** (already installed) for a single smoke test of `/`, `/candidates`, `/politician/[id]` against a staging deployment.
3. **A typed contract test** for the `app/api/politicians/*` response shape so Supabase schema changes fail loudly.
4. **A cron dry-run mode** (already half-present in `scripts/sync-fec-data.ts` via `--dry-run`) extended to the cron routes so they can be exercised without writing.

---

*Testing analysis: 2026-04-22*

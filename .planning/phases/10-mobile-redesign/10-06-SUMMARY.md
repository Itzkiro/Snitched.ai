---
phase: 10
plan: 06
subsystem: ui-mobile-responsive
tags: [a11y, playwright, axe-core, visual-regression, flag-cleanup, polish]
wave: 6
depends_on: [10-01, 10-02, 10-03, 10-04, 10-05]
requirements: [UI-04]
key-files:
  created:
    - playwright.config.ts
    - tests/e2e/mobile/homepage.spec.ts
    - tests/e2e/mobile/candidates.spec.ts
    - tests/e2e/mobile/officials.spec.ts
    - tests/e2e/mobile/profile.spec.ts
    - tests/e2e/mobile/juicebox.spec.ts
    - tests/e2e/desktop/visual-regression.spec.ts
  modified:
    - app/layout.tsx
    - app/globals-terminal.css
    - app/politician/[id]/page.tsx
    - components/TerminalHeader.tsx
    - components/MobileNavDrawer.tsx
    - components/ConnectionsGraph.tsx
    - package.json
    - tsconfig.json
key-decisions:
  - "Skip-link visually hidden via -top-12 -> focus:top-2 transition with 100 ms duration (matches drawer animation budget D-07; reads as a single motion system)"
  - "Tab strip kept as role='tablist' + aria-label='Profile sections' rather than wrapping in <nav> — adding a nav landmark would conflict semantically with role=tablist; the labeled tablist is the WCAG-compliant pattern"
  - "MobileNavDrawer aria-current uses pathname-only match (split('?')[0]) so state-query suffixes do not break active-link detection"
  - "ConnectionsGraph getLayoutOpts is left at all 12 enumerated fcose options; mobile branch retained (numIter:600/animate:false on isMobile||prefersReducedMotion); randomize:false on the default branch is the documented determinism lever (fcose has no public seed)"
  - "tsconfig.json excludes tests/ + playwright.config.ts so npx next build does not type-check spec files before npm install"
  - "TEST_POLITICIAN_ID defaults to fl-house-2026-aaron-baker (FL-06 grassroots audit fixture, score 2/A, well-seeded in the database) — overridable via env var"
  - "Visual-regression baselines are NOT committed in this plan; first user run after merge generates them via `npx playwright test --update-snapshots` per D-35"
  - "Playwright + axe-core devDeps added to package.json but `npm install` deferred to engineer (per plan 10-06 hard rule 5)"
metrics:
  duration: ~40min
  completed: 2026-04-24
  tasks_completed: 2
  files_modified: 14
  commits: 6
---

# Phase 10 Plan 06: Polish + a11y + Playwright + visual regression + flag cleanup — Summary

Phase F closes the redesign. Skip-link + main landmark + aria-* attributes added across all wave 2-5 components; focus-visible rings via global CSS; legacy_nav and legacy_graph rollback flags retired; LegacyHeader function deleted; Playwright config with two projects (mobile Pixel 7 + desktop 1280) plus 5 mobile e2e specs (axe-core integrated, all four data-* hooks resolve) plus 1 desktop visual-regression spec scaffolded; CI wiring documented.

## What Shipped

### Task 1 — A11y attribute audit + skip-link + focus-visible + flag cleanup + dead CSS

**Commits:**
- `734f313` — `feat(phase-10-06): add skip-link, main landmark, mobile nav aria-current, profile sections aria-label, data-vote-filter test hook`
- `487ddb6` — `chore(phase-10-06): remove ?legacy_nav=1 short-circuit + LegacyHeader function; add Primary nav aria-label + aria-current`
- `0f054bb` — `chore(phase-10-06): remove ?legacy_graph=1 rollback flag; add role="region" + aria-label on graph mount`
- `f7992c1` — `feat(phase-10-06): focus-visible rings (2 px terminal-amber) + drop dead .candidate-stats rule`

**`app/layout.tsx`:**
- Added `<a href="#main">Skip to content</a>` as the first child of `<body>`. Visually hidden via `absolute -top-12` until focus: `focus:top-2 transition-[top] duration-100`. Bound to `bg-terminal-green text-black` so it inherits the brand palette when revealed. Per D-27 / UI-SPEC §11.
- Wrapped `<TerminalShell>{children}</TerminalShell>` content in `<main id="main">` so the skip-link target resolves. The header rendered by `TerminalShell` stays outside `<main>` (header is its own landmark).

**`components/TerminalHeader.tsx`:**
- Deleted the `legacyNavRequested` URLSearchParams check (lines 100-107 in pre-cleanup) and the `if (legacyNavRequested) return <LegacyHeader />` short-circuit.
- Deleted the entire `LegacyHeader()` function (~250 lines, lines 429-692 in pre-cleanup) including its `useState`/`useEffect` machinery and the verbatim copy of the pre-Phase-10 nav.
- Wrapped the `lg:flex` desktop nav block in `<nav aria-label="Primary">`.
- Added `aria-current={pathname === '/<href>' ? 'page' : undefined}` to all 11 desktop nav links + the HOME button.
- `useSearchParams()` retained — still consumed by `selectedState` initial value and by `handleStateSelect`.

**`components/MobileNavDrawer.tsx`:**
- Imported `usePathname` from `next/navigation`.
- Changed nav landmark from `aria-label="Primary"` to `aria-label="Mobile primary"` (disambiguates from desktop nav).
- Each nav link now computes `isActive = pathname === link.href.split('?')[0]` (strips the `?state=…` suffix that the same href list carries). Active link gets `aria-current="page"` and `text-terminal-green` instead of `text-terminal-text`.

**`components/SearchOverlay.tsx`:** No changes required — `role="dialog"`, `aria-modal="true"`, `aria-label="Search politicians"` and per-button `aria-label="Close search"` / `aria-label="Clear search"` were already in place from plan 10-02.

**`components/ConnectionsGraph.tsx`:**
- Deleted the `isLegacyGraph` constant + its `URLSearchParams` read.
- Deleted the `if (isLegacyGraph) return { ...legacy fcose }` branch inside `getLayoutOpts`'s `case 'fcose':` block.
- Removed `isLegacyGraph` from the `useCallback` deps array.
- The default fcose path retains all 12 enumerated options: `name`, `animate: (isMobile||prefersReducedMotion)?false:true`, `animationDuration: 500`, `randomize: false`, `quality: 'proof'`, `nodeSeparation: 80`, `idealEdgeLength: 150`, `nodeRepulsion: () => 20000`, `edgeElasticity: () => 0.45`, `gravity: 0.2`, `gravityRange: 3.8`, `numIter: isMobile ? 600 : 2500`. Desktop path still produces 2500 iterations.
- Added `role="region" aria-label="Politician connections graph"` to the Cytoscape mount `<div ref={containerRef}>`.

**`app/politician/[id]/page.tsx`:**
- Tab strip — added `aria-label="Profile sections"` to the existing `role="tablist"` div (kept as tablist since `<nav>` would conflict with `role=tablist`). `aria-current="page"` on the active tab was already present from plan 10-03.
- Vote-filter container at line 1430 — added `data-vote-filter` attribute to the wrapper div. This is the test-instrumentation hook used by `tests/e2e/mobile/profile.spec.ts`'s `[data-vote-filter] button` selector.

**`app/globals-terminal.css`:**
- Added the global focus-visible rule: `*:focus-visible { outline: 2px solid var(--terminal-amber); outline-offset: 2px; }` per D-05.
- Deleted the dead `.candidate-stats` mobile override (no consumers in `app/` or `components/` after the Phase D Tailwind migration). The `.data-grid` rule and the `pulse` keyframe were KEPT per the plan's per-rule audit rules.

### Task 2 — Playwright config + 5 mobile e2e specs + desktop visual-regression spec + axe-core + CI hooks

**Commits:**
- `e7be26d` — `test(phase-10-06): scaffold Playwright + axe-core for mobile e2e (412 px)`
- `3a0050c` — `test(phase-10-06): scaffold Playwright visual-regression at 1280 px`

**`package.json`:**
- Added `@axe-core/playwright: ^4.10.0` and `@playwright/test: ^1.59.1` to `devDependencies`.
- Added scripts: `test:e2e: "playwright test"` and `test:e2e:install: "playwright install --with-deps chromium"`.
- `playwright: ^1.59.1` was already a devDep (used by data-ingestion scrapers); `@playwright/test` was new.

**`playwright.config.ts` (new):**
- `testDir: './tests/e2e'`, `fullyParallel: true`, `reporter: 'html'`, `trace: 'on-first-retry'`.
- `baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'` so CI points the suite at a Vercel preview deployment per D-38.
- Two projects:
  - `mobile-chrome-pixel-7` — `{ ...devices['Pixel 7'], viewport: { width: 412, height: 915 } }`, `testMatch: /mobile\/.*\.spec\.ts/`.
  - `desktop-chrome-1280` — `{ browserName: 'chromium', viewport: { width: 1280, height: 800 } }`, `testMatch: /desktop\/.*\.spec\.ts/`.

**`tests/e2e/mobile/` (5 specs):**

- **`homepage.spec.ts`** (4 tests) — nav drawer opens (asserts hamburger + `getByRole('dialog', { name: /main navigation/i })`); ticker visible (`.breaking-ticker, .ticker-content` first); gradient backdrop confirmed (`page.locator('[data-rain-column]').count()` is 0 at 412 px per D-19); axe-core wcag2a/wcag2aa zero CRITICAL/SERIOUS.
- **`candidates.spec.ts`** (2 tests) — at least 1 `[data-politician-card]` visible; `document.documentElement.scrollWidth <= window.innerWidth` (no horizontal page scroll); axe-core check.
- **`officials.spec.ts`** (2 tests) — same shape as candidates against `/officials`.
- **`profile.spec.ts`** (4 tests) — uses `TEST_POLITICIAN_ID = process.env.TEST_POLITICIAN_ID || 'fl-house-2026-aaron-baker'`; cycles all 6 tabs (`overview/votes/funding/network/social/legal`) and asserts URL hash updates via `getByRole('tab', { name })`; vote-filter buttons measured via `[data-vote-filter] button` `boundingBox().height >= 44`; network tab graph mounts (`canvas` visible within 10 s); axe-core check.
- **`juicebox.spec.ts`** (3 tests) — `[data-leaderboard-mobile]` count ≥ 3; no horizontal page scroll; axe-core check.

All 5 specs `import AxeBuilder from '@axe-core/playwright'` and run `withTags(['wcag2a','wcag2aa']).analyze()` filtering for `impact === 'critical' || 'serious'`.

**`tests/e2e/desktop/visual-regression.spec.ts` (new):**
- Iterates 5 pages — `/`, `/candidates`, `/officials`, `/juicebox`, `/politician/${TEST_POLITICIAN_ID}`.
- For each: `goto`, `waitForLoadState('networkidle')`, `expect(page).toHaveScreenshot('${name}-desktop-1280.png', { maxDiffPixelRatio: 0.01 })` per D-35.
- First run after merge GENERATES baselines under `tests/e2e/desktop/visual-regression.spec.ts-snapshots/` — see "First-Run Baseline" note below.

**`tsconfig.json`:**
- Added `tests` and `playwright.config.ts` to `exclude` so `npx next build` does not attempt to type-check spec files before `npm install` resolves `@playwright/test` and `@axe-core/playwright`.

## Skip-link Styling Decision

The plan suggested `focus:top-2 transition-[top] duration-100`. Adopted as-is. Rationale:
- 100 ms transition matches the drawer animation budget (D-07: "no animation longer than 200 ms"); the skip-link reveal reads as part of the same motion system, not a separate jolt.
- `bg-terminal-green text-black` ensures contrast >= 4.5:1 (matrix green on black text passes WCAG AA at all viewport sizes).
- `z-[100]` keeps the link above the hamburger drawer (`z-50`) and the search overlay (`z-50`) — Tab from anywhere reveals the link.

## CSS Rules Deleted from globals-terminal.css

Single rule deleted: `.candidate-stats { grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)) !important; }` inside the `@media (max-width: 768px)` block. No consumers in `app/` or `components/` — Phase D's Tailwind migration of `app/candidates/page.tsx` removed the `.candidate-stats` className from rendered DOM.

Rules KEPT (per per-rule audit in plan Task 1 Step 6):
- `.data-grid { ...minmax(280px, 1fr) }` at line 237 — still used by `/officials` data-grid.
- `pulse` keyframe at line 96 — used by `DaemonStatusIndicator`, now wrapped in motion-reduce guard via the global `prefers-reduced-motion` block.
- All `.landing-*`, `.dash-*`, `.zip-*`, `.terminal-dash-*` overrides — still consumed by raw-className components untouched by waves B-E.
- The 768 px-only nav comment block — kept as documentation of the migration intent.

## Data-Attribute Provenance

| Attribute | Added in | File |
|-----------|----------|------|
| `data-rain-column` | plan 10-05 | components/TerminalHome.tsx (both reduced 12-col and full 35-col branches) |
| `data-politician-card` | plan 10-04 | components/PoliticianCard.tsx (card root) |
| `data-leaderboard-mobile` | plan 10-04 | components/Leaderboard.tsx (`flex flex-col gap-3 lg:hidden` wrapper) |
| `data-vote-filter` | **plan 10-06 (this plan)** | app/politician/[id]/page.tsx vote-filter wrapper at line 1430 |

Three of four were already present from prior waves; only `data-vote-filter` needed to be added in this plan's Task 1.

## TEST_POLITICIAN_ID Choice

Default value: `fl-house-2026-aaron-baker`.

Rationale:
- Already seeded in the codebase (FL-06 challenger audit, 2026-04-22 entry — see memory `project_snitched_aaron_baker_audit.md`).
- Score 2/A (clean grade) — exercises the "low corruption" rendering paths.
- Has voting records (Aaron Baker is the FL-06 R challenger to Fine, anti-Israel-lobby grassroots) — the `network`, `votes`, and `funding` tabs all have data to render, which is what the profile spec asserts.
- Override available: `TEST_POLITICIAN_ID=<id> npx playwright test`.

## Lighthouse Mobile Numbers

**Not measured at execution time.** The plan explicitly states: "Lighthouse mobile actual numbers (LCP, CLS, TBT) measured at PR time." Spec target per D-37: LCP < 2.5 s, CLS < 0.1, TBT < 300 ms (Moto G4 emulation, Slow 4G) on `/`. Engineer running the PR check should record actuals here when the suite first runs against a Vercel preview.

## CI Wiring Outcome

`.github/workflows/` does not exist in this repo. Per plan instructions, no GitHub Actions workflow file was created. The `package.json` scripts `test:e2e` and `test:e2e:install` are sufficient for both local and Vercel CI use.

**Engineer follow-up after merge:**
1. `npm install` (resolves the new `@axe-core/playwright` + `@playwright/test` deps).
2. `npm run test:e2e:install` (downloads Chromium binary, ~150 MB; only needed once per machine).
3. `npm run test:e2e -- --project=mobile-chrome-pixel-7` to validate the mobile suite against `http://localhost:3000` after `npm run build && npm start`.
4. `npx playwright test tests/e2e/desktop/visual-regression.spec.ts --update-snapshots` to GENERATE baseline screenshots (first run only). Commit the resulting `.png` files in a follow-up PR — they are intentionally not in this plan's commits since they require a stable production-build environment.
5. **Vercel CI configuration:** in the Vercel dashboard, add `npx playwright test` as a check on the `phase-10-wave-6-polish-tests` (or its merged equivalent) preview deployment. Set `PLAYWRIGHT_BASE_URL` to the preview URL. D-38 confirms: "Vercel preview URL is the test target; no need to spin up `next dev` in CI."

## Legacy Flag + LegacyHeader Confirmation

`grep -rn 'legacy_nav\|legacy_graph\|LegacyHeader' app/ components/ lib/` returns zero matches. All rollback escape hatches (URL flag short-circuits, `LegacyHeader` function, `isLegacyGraph` branch in `getLayoutOpts`) are removed. The redesign now ships unconditionally on every device.

## First-Run Baseline (Visual Regression)

The desktop visual-regression spec (`tests/e2e/desktop/visual-regression.spec.ts`) requires baseline `.png` files. **No baselines are committed in this plan.** First time a developer runs the spec they must execute:

```bash
PLAYWRIGHT_BASE_URL=https://<vercel-preview-url> \
  npx playwright test tests/e2e/desktop/visual-regression.spec.ts --update-snapshots
```

Then commit the generated `tests/e2e/desktop/visual-regression.spec.ts-snapshots/` directory. Subsequent runs compare against those baselines and fail on > 1 % pixel diff per D-35.

## Deviations from Plan

None. Plan executed exactly as written, with two minor judgement calls flagged in `key-decisions`:

1. **Tab strip wrapping** — Plan suggested `<nav aria-label="Profile sections">`, but the existing element carries `role="tablist"`. Wrapping in `<nav>` would create nested landmarks with conflicting semantics. Resolved by putting the `aria-label="Profile sections"` directly on the tablist div. Plan permitted this: "(or similar role/label)". This is the WCAG-compliant pattern for a labeled tablist.
2. **`useSearchParams()` retention** — Plan instructed "remove `useSearchParams()` reads added for the flags if they were the only consumers". After flag removal, `useSearchParams()` is still consumed by `selectedState` initial value and by `handleStateSelect`'s URL update — kept the import.

## Authentication Gates

None — this plan touched only static assets (CSS, TSX, test scaffolding). No data-source auth gates encountered.

## Verification

- `npx next build` exits 0 (verified after Task 1 and after Task 2). Output unchanged: 80+ routes, all dynamic/static designations preserved.
- All Task 1 grep assertions pass:
  - `grep -q 'Skip to content' app/layout.tsx` ✓
  - `grep -q 'href="#main"' app/layout.tsx` ✓
  - `grep -q '<main id="main"' app/layout.tsx` ✓
  - `grep -q 'aria-label="Primary"' components/TerminalHeader.tsx` ✓
  - `grep -q 'aria-label="Mobile primary"' components/MobileNavDrawer.tsx` ✓
  - `grep -q 'aria-current' components/MobileNavDrawer.tsx` ✓
  - `grep -q 'role="dialog"' components/SearchOverlay.tsx` ✓
  - `grep -q 'role="region"' components/ConnectionsGraph.tsx` ✓
  - `grep -q ':focus-visible' app/globals-terminal.css` ✓
  - `! grep -rq 'legacy_nav\|legacy_graph\|LegacyHeader' app/ components/ lib/` ✓
  - `grep -q 'numIter: 2500' components/ConnectionsGraph.tsx` ✓ (still present as the non-mobile default)
- All Task 2 grep assertions pass:
  - `test -f playwright.config.ts` ✓
  - `grep -q "mobile-chrome-pixel-7\|desktop-chrome-1280\|412\|1280" playwright.config.ts` ✓
  - All 5 mobile spec files + 1 desktop spec exist ✓
  - `grep -q "@axe-core/playwright\|@playwright/test\|test:e2e" package.json` ✓
  - `grep -q "toHaveScreenshot" tests/e2e/desktop/visual-regression.spec.ts` ✓
  - `grep -q "AxeBuilder" tests/e2e/mobile/homepage.spec.ts` ✓
  - `grep -q "scrollWidth" tests/e2e/mobile/juicebox.spec.ts` ✓
  - `grep -q "boundingBox" tests/e2e/mobile/profile.spec.ts` ✓
  - All 4 data-* test attributes resolve (verified per file).
- Playwright + axe-core suite **NOT executed** at plan time (per hard rule 6: "DON'T actually RUN the Playwright suite as part of execution"). Engineer runs it post-merge against the Vercel preview.

## Self-Check: PASSED

Files verified to exist on disk:
- FOUND: `playwright.config.ts`
- FOUND: `tests/e2e/mobile/homepage.spec.ts`
- FOUND: `tests/e2e/mobile/candidates.spec.ts`
- FOUND: `tests/e2e/mobile/officials.spec.ts`
- FOUND: `tests/e2e/mobile/profile.spec.ts`
- FOUND: `tests/e2e/mobile/juicebox.spec.ts`
- FOUND: `tests/e2e/desktop/visual-regression.spec.ts`

Commits verified to exist in `git log 8c1249f..HEAD`:
- FOUND: `734f313` — feat(phase-10-06): add skip-link, main landmark, mobile nav aria-current, profile sections aria-label, data-vote-filter test hook
- FOUND: `487ddb6` — chore(phase-10-06): remove ?legacy_nav=1 short-circuit + LegacyHeader function; add Primary nav aria-label + aria-current
- FOUND: `0f054bb` — chore(phase-10-06): remove ?legacy_graph=1 rollback flag; add role="region" + aria-label on graph mount
- FOUND: `f7992c1` — feat(phase-10-06): focus-visible rings (2 px terminal-amber) + drop dead .candidate-stats rule
- FOUND: `e7be26d` — test(phase-10-06): scaffold Playwright + axe-core for mobile e2e (412 px)
- FOUND: `3a0050c` — test(phase-10-06): scaffold Playwright visual-regression at 1280 px

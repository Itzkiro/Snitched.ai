# Phase 10: Mobile Responsive Layout - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning
**Source:** Distilled from existing Phase 10 artifacts (UI-SPEC.md, PLAN.md, RISKS.md, AUDIT.md produced 2026-04-22, product decisions locked 2026-04-24). User chose "Convert existing decisions to CONTEXT.md" during discuss-phase — no new gray areas opened.

<domain>
## Phase Boundary

Make every page in Snitched.ai fully usable on mobile devices (320px–768px viewport) while preserving the terminal/Bloomberg visual identity. The redesign adapts layout density and chrome — it does **not** reskin.

**In scope:**
- Responsive layout for `/`, `/candidates`, `/officials`, `/politician/[id]` (with all 6 tabs: Overview, Votes, Funding, Network, Social, Legal), `/juicebox`, `/social`, maps (USMap, ZipMap)
- Foundational Tailwind 4 wiring + CSS custom property tokens + `next/font/google` migration + global `prefers-reduced-motion` guard
- Mobile navigation (hamburger + off-canvas drawer) replacing the current 11-link horizontal nav
- Search overlay pattern for mobile (replaces dropdown that clips off viewport edge)
- Data-table responsive strategies (card-per-row / sticky-first-column / collapsible-rows) applied per-table
- Matrix-rain tiered strategy (gradient on phones, reduced rain on tablets, full rain on desktop)
- Accessibility pass (aria attributes, skip-link, focus-visible, axe-core CI gate)
- Playwright mobile e2e tests + desktop visual-regression tests

**Out of scope (non-goals):**
- No desktop regression at ≥1280px — existing desktop layout must be byte-equivalent after the redesign
- No data-layer rewrite, no GraphQL, no Supabase swap
- No auth, no native iOS/Android
- No reinvention of terminal/matrix identity
- No cron-job or scraper changes
- `/hierarchy` mobile layout — deprecated; ships a "desktop-only" banner only
- `/intel`, `/admin`, `/embed`, `/tools` mobile usability — out of v1 (admin/power-user surfaces)

</domain>

<decisions>
## Implementation Decisions

### Breakpoints & non-regression
- **D-01:** Mobile-first with Tailwind 4 defaults unchanged: `(base)` 0px, `sm:` 640px, `md:` 768px, `lg:` 1024px, `xl:` 1280px. No custom 414/480px breakpoint — the audit confirmed the site breaks at 375px because of fixed pixel chrome (`padding: 2rem`, `minmax(280px, 1fr)`), not a missing breakpoint.
- **D-02:** Desktop ≥1280px must be byte-equivalent to today's production after the redesign. Non-regression is guarded by a desktop visual-regression test (1% threshold, human review on fail).

### Touch targets & motion
- **D-03:** All interactive elements ≥44×44 px via `min-h-[44px]` utility on `<button>` and link-as-button elements. For visually small elements (e.g. "×" close icon in dense cells) use `before:absolute before:inset-[-8px]` pseudo-element hit-area expansion. Enforced by a Playwright a11y check that fails if any button is <44px tall at 375px viewport.
- **D-04:** `prefers-reduced-motion: reduce` is respected globally via a `@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }` block in the new global stylesheet, **plus** explicit early-return guards in `TerminalHome.tsx` (matrix-rain mount) and `ConnectionsGraph.tsx` (`animate: false` via `matchMedia`).
- **D-05:** Focus rings visible — 2px `outline` in `--terminal-amber` via `:focus-visible` (never `outline: none`).

### Navigation pattern
- **D-06:** Top header + hamburger → left-anchored off-canvas drawer. **Not** a bottom tab bar (Snitched has 11 nav links that don't compress to 4–5; audience is researchers/journalists, not daily-active consumers).
- **D-07:** Drawer spec: 80vw max, cap 320px. Contents: state selector (full-width buttons), nav links stacked with `min-h-[48px]` rows, footer daemon-status indicator. Dismisses on backdrop tap, swipe-left, Esc. CSS `transform: translateX(-100%/0)` with `transition: transform 200ms`. No animation longer than 200ms.
- **D-08:** Header layout by breakpoint:
  - `(base)`: two-row — row 1 `[≡][LOGO][·][state badge]`, row 2 full-width search input
  - `sm:` transitional — single-row with inline search
  - `lg:`: single-row `[LOGO][nav links][search]` (existing desktop)
- **D-09:** "POLITICAL INTELLIGENCE NETWORK" tagline in `TerminalHeader.tsx:103` drops to `display: none` on `(base)`, returns at `sm:`.

### Profile-page tabs
- **D-10:** Sticky horizontal scroll-snap tab strip on `(base)`, full-row layout at `lg:`. **No accordion, no segmented control** (6 tabs is too many for segmented; accordion wrecks dossier identity).
- **D-11:** Tab container: `sticky top-[56px] z-30 flex overflow-x-auto snap-x snap-mandatory border-b border-[--terminal-border] bg-black/85 backdrop-blur`. Tab buttons: `snap-start min-h-[44px] px-4 py-2 text-sm font-mono uppercase tracking-wide`. Active tab: 2px bottom border in `--terminal-green`. Right-edge gradient (`pointer-events-none absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-black to-transparent`) signals horizontal scroll.
- **D-12:** Tab activation updates hash route (`#votes`) so back-button and share-link work. Tab order preserved: Overview · Votes · Funding · Network · Social · Legal.

### Data-table strategy (per-table)
- **D-13:** Three explicit strategies — each table on the site picks one:
  - **A. Card-per-row** — >4 columns where each row's identity is a person/entity. `(base)` = vertical card with rank/avatar at top, primary metric in big type, secondary metrics as label-value pairs. `lg:` = true table.
  - **B. Sticky-first-column horizontal scroll** — row identity must stay visible and metrics are numeric & scannable. `(base)` = `overflow-x-auto` with first column `position: sticky; left: 0` + 1px right border + soft shadow.
  - **C. Collapsible rows** — tables with deep row-detail surfaces. `(base)` = summary fields only (rank, name, primary metric, chevron); tap expands.
- **D-14:** Per-table assignments (locked):
  - Juicebox leaderboards (3 sections in `app/juicebox/page.tsx:300, 502, 678`) → **A. Card-per-row**
  - FEC contributions list in profile Funding tab → **B. Sticky-first-column**
  - Vote records (profile `/id` Votes tab `:1433–1453`) → **A. Card-per-row**
  - Lobbying records (profile Legal tab) → **C. Collapsible rows**
  - Officials/Candidates lists → already cards (`PoliticianCard`) — no table strategy, fix card overflow per §10
- **D-15:** All horizontally-scrollable containers get a 12px bottom-shadow (scroll cue) and `scroll-snap-type: x mandatory` for sticky-column tables.

### Search autocomplete
- **D-16:** Full-screen overlay on `(base)`; constrained dropdown on `sm:`+. Overlay avoids the dropdown-clipping problem entirely (today's dropdown clips past right edge whenever the input is right-aligned).
- **D-17:** Overlay spec: `position: fixed; inset: 0; z-50` panel with top bar `[← back][input][× clear]` and results list filling the viewport. Input `font-mono text-base`. Each result row `min-h-[56px]` showing level badge + name + office + party + score in 2-line layout. Browser-back closes overlay (push history entry on open, pop on close).
- **D-18:** `sm:`+ dropdown fix: add `right-auto` so the dropdown anchors to the input rather than the parent flex container.

### Matrix-rain tiered strategy
- **D-19:** Tiered by viewport (product-approved 2026-04-24):
  - `(base)` < 640px → **static gradient backdrop** (CSS linear-gradient with subtle vertical noise). No animation. No per-column DOM nodes.
  - `sm:` 640–1023px → **reduced 12-column rain** (vs 35 today). No `text-shadow`. Animation pauses via `IntersectionObserver` when off-screen.
  - `lg:` ≥ 1024px → **current behaviour** (35 columns, full text-shadow).
  - Any viewport with `prefers-reduced-motion: reduce` → static gradient backdrop regardless of width.
- **D-20:** Implementation: render branch in `TerminalHome.tsx` (NOT CSS `display: none` or `visibility`) so DOM nodes never exist at `(base)` — today's 420+ nodes cost memory even when hidden.

### Inline-style migration strategy
- **D-21:** **Tailwind-first, incremental, per-component refactor.** Not a "rip-out + reapply" pass. Tailwind 4 activated in Phase A (one `@import "tailwindcss";` line + `tailwind.config.ts` with `content:` globs + theme aliases for `--terminal-*` colors).
- **D-22:** Per-component conversion happens **only when that component is in the current phase's scope**. Hard rule: no PR converts inline styles in components outside that PR's scope (prevents "1500-line refactor" anti-pattern).
- **D-23:** CSS custom-property tokens added to `globals-terminal.css` in Phase A (per UI-SPEC §12): `--space-page-x`, `--space-section-y`, `--tap-min`, `--type-body`, `--type-meta`, with `@media (min-width: 640px)` / `(min-width: 1024px)` overrides. Legacy inline styles can opt into tokens before any rewrite; components migrated later drop the custom-property reference.
- **D-24:** Section/page padding rule: `p-3 sm:p-6 lg:p-8` (12px → 24px → 32px). Never a hard-coded `2rem` again.

### Fonts
- **D-25:** Migrate Google Fonts `<link>` to `next/font/google` with subsetting in Phase A. Weights: Bebas Neue (1 wt), Inter (4 wts — drop unused 800), JetBrains Mono (3 wts).

### /hierarchy descope
- **D-26:** `/hierarchy` is deprecated from v1 mobile scope (decision locked 2026-04-24). Phase E ships only a `(base)`-only top banner: "This view is optimised for desktop." No other mobile layout changes to this route. Killing the page entirely is a separate product decision outside this phase.

### Accessibility
- **D-27:** a11y pass executes in **Phase F** (not deferred to later phase). Doing it now costs less than a future "come back and fix" phase because the redesign is already touching most components. Scope: `aria-label`, `role`, `aria-current` on active tab, `aria-expanded` on hamburger; skip-link `<a href="#main">Skip to content</a>` in `app/layout.tsx`; all pages wrap content in `<main id="main">`; focus-visible rings via global rule.
- **D-28:** a11y acceptance: `@axe-core/playwright` reports **zero CRITICAL or SERIOUS issues** on `/`, `/candidates`, `/officials`, `/politician/[fixed-test-id]`, `/juicebox`. Rationale: audience includes researchers/journalists/citizens (some screen-reader users); WCAG compliance reduces ADA legal exposure for public-facing US sites.

### Rollback & feature flags
- **D-29:** Per-PR Vercel preview URL is the primary rollback — product can flip between prod and preview in one click.
- **D-30:** Feature flags on the two highest-risk phases: `?legacy_nav=1` (Phase B — re-render today's TerminalHeader) and `?legacy_graph=1` (Phase C — re-enable today's Cytoscape config `numIter: 2500, animate: true`). Implementation: read query string in the component and short-circuit. Cleaned up in Phase F.
- **D-31:** No A/B test infrastructure (out of scope — no experimentation framework today). Trunk-based, one phase per PR, merged into `main`. Each PR ships atomically — no half-deploys of one component.
- **D-32:** Hotfix path: `git revert` the merge commit and redeploy. Phases A and F lowest risk; B, C, D highest surface area.

### Testing
- **D-33:** `playwright.config.ts` with two projects:
  - `mobile-chrome-pixel-7` (412 × 915)
  - `desktop-chrome-1280` (1280 × 800)
- **D-34:** Mobile e2e specs (~5 files, ~30 lines each) under `tests/e2e/mobile/`:
  - Homepage: nav drawer opens, ticker visible, gradient backdrop confirmed (no matrix-rain DOM nodes)
  - `/candidates` + `/officials`: at least 1 card per tier visible; `document.documentElement.scrollWidth <= window.innerWidth`
  - `/politician/[fixed-test-id]`: all 6 tabs render; vote-filter buttons measure ≥44px tall; network tab graph mounts
  - `/juicebox`: three card-stack sections render; no horizontal page scroll
  - `/social`: feed renders; refresh button works without auto-poll
- **D-35:** Desktop visual-regression spec at `tests/e2e/desktop/visual-regression.spec.ts` — snapshots homepage, candidates, officials, juicebox, profile at 1280px against a baseline in the repo. Fails if visual diff > 1%. Human review required on failure.
- **D-36:** Baseline viewport 375px for acceptance; `PoliticianCard` acceptance extended to 320px for safety margin. `tests/e2e/desktop/` at 1280px for the non-regression guard.
- **D-37:** `@axe-core/playwright` added as dev dep. Lighthouse mobile acceptance on `/`: LCP < 2.5s, CLS < 0.1, TBT < 300ms (Moto G4 emulation, Slow 4G).
- **D-38:** Vercel preview URL is the test target; no need to spin up `next dev` in CI. Add `npx playwright test` to PR checks.

### Component-level strategy
- **D-39:** Responsive-single-component preference (everywhere except matrix rain):
  - `TerminalHeader.tsx` — single responsive + extracted `MobileNavDrawer.tsx`
  - `SearchBar.tsx` — single responsive + new `SearchOverlay.tsx` for `(base)`
  - `PoliticianCard.tsx` — single responsive (`flex flex-col sm:flex-row`)
  - `ConnectionsGraph.tsx` (Cytoscape) — single responsive with mobile config branch inside (`numIter: 600, animate: false, minZoom: 0.5` on `(base)`; detail overlay → `bottom-2 inset-x-2`)
  - `SocialFeed.tsx` — single responsive; `autoRefresh = false` default on `(base)`
  - `ShareDossier.tsx` — single responsive (`max-w-[660px] max-h-[90vh] flex flex-col`; iframe `h-[60vh] sm:h-[420px]`)
  - Juicebox tables → new `Leaderboard.tsx` component, CSS-only switch table↔card
  - `USMap.tsx` / `ZipMap.tsx` (Leaflet) — single responsive, `scrollWheelZoom: false`, tap-to-interact overlay
  - `ConnectionsTree` (in profile page) — `overflow-x-auto` wrapper, `pl-3` per nesting level
- **D-40:** Matrix rain is the **only** component with a per-viewport render branch (see D-20). Everywhere else: single-render with CSS.

### Phase sizing
- **D-41:** Work ships as **6 PRs / 6 sub-plans** (A–F from existing PLAN.md), each atomic, ordered, ~46–65 engineer-hours + ~6h review across ~2 part-time calendar weeks or ~1 focused week. Downstream `gsd-planner` converts these into numbered GSD PLAN.md files with frontmatter and XML-format tasks:
  - Phase A: Foundational responsive scaffolding (Tailwind on, tokens, fonts, reduced-motion global) — S–M
  - Phase B: Header + nav drawer + search overlay — M
  - Phase C: Politician profile page (tabs, votes, graph, modal) — L
  - Phase D: Data tables + officials/candidates grids — M
  - Phase E: Homepage rain + social + maps + hierarchy banner — S
  - Phase F: a11y + Playwright + visual regression — M
- **D-42:** Dependencies: B, C, D, E all depend on A. C depends on B. F depends on A–E. D and E can ship in either order after A.

### Brand identity preservation (non-negotiable)
- **D-43:** The redesign MUST preserve these on mobile (pre-flight QA checklist):
  - Matrix green (`#00FF41`) dominant accent on every page — buttons, active tabs, focus rings, big numbers
  - Monospace body type on every screen (no fallback sans)
  - Live ticker on homepage at 30s cadence
  - Politician profile reads as a *dossier* — labelled fields, fixed-width values, terminal-style chrome
  - Dark background — no white surfaces. Modals and drawers use `bg-black/95 backdrop-blur`, never `bg-white`
  - Headlines stay uppercase + tracked (letter-spacing `0.08em` for uppercase — reduced from today's `0.1em` which was too wide on phones)
  - At least *some* motion remains on `sm:`+ (reduced matrix rain) so the page doesn't feel inert

### Typography scale
- **D-44:** Typography scale (mobile → sm → lg), px/line-height:
  - Hero/page title: 24/1.2 → 28/1.2 → 32/1.15
  - Section title: 18/1.25 → 20/1.25 → 24/1.2
  - Card title: 16/1.3 → 18/1.3 → 20/1.25
  - Body/dense: 14/1.4 (floor) → 14/1.4 → 14/1.5 (iOS Safari minimum is 12px; never below 14px on phone)
  - Meta/dim: 12/1.4 → 12/1.4 → 11/1.4 (only category where mobile is *bigger* than desktop)
  - Big-number ("corruption score"): 32/1 → 40/1 → 48/1 (was 3rem / 48px universally — that's what's breaking the cards)
  - Code/data: 13/1.4 → 13/1.4 → 13/1.5

### Claude's Discretion
- Exact Tailwind class choices per component (as long as they match the `p-3 sm:p-6 lg:p-8` rule and the typography scale in D-44)
- Whether `SearchOverlay.tsx` reuses helpers inline or via an extracted `lib/search-helpers.ts` module
- Cytoscape `fcose` seed value for deterministic layouts across runs (mitigation for RISKS §2.1)
- Per-component inline-style conversion ordering within each phase's scope
- Whether `right-edge gradient` on tab strip uses a pseudo-element or a sibling `<div>` with `pointer-events-none`
- Concrete CSS tokens-vs-Tailwind-theme split (e.g., which values stay as `--var()` vs get promoted to `tailwind.config.ts` theme keys)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 10 artifacts (authoritative source of truth for this phase)
- `.planning/phases/10-mobile-redesign/UI-SPEC.md` — Full UI design contract: §1 breakpoints, §2 spacing, §3 typography, §4 touch/motion, §5 navigation, §6 profile tabs, §7 data tables, §8 search overlay, §9 matrix rain, §10 component inventory, §11 identity checklist, §12 CSS custom property tokens
- `.planning/phases/10-mobile-redesign/PLAN.md` — 6-phase (A–F) breakdown with files touched, acceptance criteria, dependencies, per-phase rollback flags
- `.planning/phases/10-mobile-redesign/RISKS.md` — Risk register; §1.1 (matrix rain), §1.2 (a11y), §3 Q1 (hierarchy) all CLOSED 2026-04-24; §2.4 (polling cadence), §3 Q2 (paywall) remain open but non-blocking
- `.planning/phases/10-mobile-redesign/AUDIT.md` — Route-by-route audit with file:line precision for every mobile-breaking layout issue

### Codebase maps
- `.planning/codebase/STACK.md` — Next.js 16.1.6, React 19.2.3, TypeScript strict, Tailwind 4 (installed, not yet wired), Vercel, Cloudflare
- `.planning/codebase/ARCHITECTURE.md` — App Router layout, component/lib/api structure, data flow
- `.planning/codebase/CONVENTIONS.md` — Inline-style vs Tailwind migration context, naming, import patterns
- `.planning/codebase/STRUCTURE.md` — Directory layout (`app/`, `components/`, `lib/`)
- `.planning/codebase/TESTING.md` — Current state (0% coverage, no CI) — Phase F changes this

### Project-level
- `CLAUDE.md` — Project-wide stack, conventions, GSD workflow enforcement, file naming rules
- `.planning/PROJECT.md` — Core value, Terminal/Bloomberg aesthetic constraint, web-first (no native), Vercel free-tier constraint
- `.planning/REQUIREMENTS.md` — UI-04 requirement ("Mobile-responsive layout across all pages")
- `.planning/ROADMAP.md` §Phase 10 — Phase goal, success criteria (4 items), dependencies (Phase 9)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable assets (responsive refactor targets)
- `components/TerminalHeader.tsx:103` — current header with inline-style flex + 11-link nav; tagline "POLITICAL INTELLIGENCE NETWORK" hides on `(base)`
- `components/SearchBar.tsx:258–271` — current search with dropdown that clips past right edge on mobile
- `components/PoliticianCard.tsx` — card with `flex` header row + `fontSize: '3rem'` corruption score that breaks cards on narrow viewports
- `components/ConnectionsGraph.tsx` — 686-line Cytoscape component; mobile config branch is the main change risk (ship behind `?legacy_graph=1`)
- `components/SocialFeed.tsx` — 30s polling by default; status pulse animation doesn't respect `prefers-reduced-motion`
- `components/USMap.tsx`, `components/ZipMap.tsx` — Leaflet maps; no scroll-zoom disable; traps touch events on iOS Safari (RISKS §2.3)
- `components/ShareDossier.tsx` — share modal; iframe fixed at 420px
- `app/politician/[id]/page.tsx` — 6-tab profile page; tab strip (~lines 694–737), vote filter (~1411–1425), vote cards (~1433–1453), funding breakdown (~1090–1125), bio grid (~749–764), social rows (~773–797), ConnectionsTree inline (~1936–2090)
- `app/juicebox/page.tsx:300, 502, 678` — three hand-rolled leaderboard grids (targets for new `Leaderboard.tsx`)
- `app/candidates/page.tsx`, `app/officials/page.tsx` — hard-coded `padding: '2rem'` on every section; `gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))'` stats grids that overflow at 375px
- `app/globals-terminal.css` — receives Tailwind `@import`, new tokens, reduced-motion block; `overflow-x: auto` mobile nav rule removed in Phase B
- `app/layout.tsx:50–52` — Google Fonts `<link>` (migrate to `next/font/google`); viewport meta already correct (lines 7–10)

### New components to create
- `components/MobileNavDrawer.tsx` (Phase B)
- `components/SearchOverlay.tsx` (Phase B)
- `components/Leaderboard.tsx` (Phase D) — reusable `<Leaderboard rows columns mobileLayout="card" />` used by all three juicebox sections
- `tailwind.config.ts` (Phase A) — `content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}']` + theme aliases for `--terminal-*` colors so `text-terminal-green` etc. work
- `playwright.config.ts` (Phase F) — two projects (mobile Pixel 7, desktop 1280)
- `tests/e2e/mobile/*.spec.ts` (Phase F) — 5 specs
- `tests/e2e/desktop/visual-regression.spec.ts` (Phase F)
- `lib/search-helpers.ts` (Phase B, Claude's discretion — extract if overlay + dropdown share rendering logic)

### Established patterns
- Inline styles with CSS custom properties (e.g. `color: 'var(--terminal-green)'`) — existing baseline
- Tailwind utilities — new, introduced incrementally per-component per-phase (D-22 hard rule)
- Feature-based file organization (`app/`, `components/`, `lib/`)
- No linter/formatter, no existing test infrastructure — Phase F stands up Playwright + axe-core
- `postcss.config.mjs` already imports `@tailwindcss/postcss` (no change needed) but there's no `tailwind.config.*` or `@import "tailwindcss";` yet — Tailwind classes produce nothing until Phase A fixes this

### Integration points
- `app/layout.tsx` — font migration, skip-link injection, `<main id="main">` wrap
- `postcss.config.mjs` — already wired, no change
- `package.json` — add `playwright`, `@axe-core/playwright` dev deps (playwright already in package.json per PLAN)
- Vercel preview URL — primary test target and rollback surface
- `?legacy_nav=1`, `?legacy_graph=1` URL-flag reads in `TerminalHeader.tsx` and `ConnectionsGraph.tsx` during Phases B/C; cleaned up in Phase F
- GitHub Actions / Vercel CI — add `npx playwright test` to PR checks

</code_context>

<specifics>
## Specific Ideas

- **Brand intent that MUST survive on phone:** matrix-green (`#00FF41`) on near-black, monospaced terminal type, dossier-card aesthetic for profiles, live ticker motion on the homepage. Adapt density and chrome — never reskin.
- **Desktop "byte-equivalent" non-regression at ≥1280px** is the hardest constraint. Visual regression test at 1% threshold with human review on fail is the guardrail.
- **Matrix rain contains indexable text** (`AIPAC`, `FRAUD`, `$$$`, `ISRAEL`). Mobile gradient replacement changes the indexed mobile HTML. Before merging Phase E: run URL Inspection tool in Search Console on `/` and confirm rendered HTML still contains politician names and key headlines. Non-blocking; check-only step.
- **Moto G Power class device (CPU 4× throttle, Slow 4G)** is the mobile performance baseline. Matrix rain at full 35-column is the single largest perf cost today — tiered strategy (D-19) resolves this.
- **Letter-spacing** for uppercase headings: `0.08em` on phone (was `0.1em` everywhere — too wide for narrow viewports).
- **iOS Safari minimum readable font size** is 12px; this phase never goes below 14px for body text on phone.
- **Tap-target floor** is 44×44 px universally; 48×48 for drawer nav rows specifically.
- **Animation budget** for drawer transitions: ≤200ms (any longer feels laggy).
- **Cytoscape mobile config** tradeoff: `numIter: 600` (from 2500) and `animate: false` mean graph layout positions will differ slightly from today's. Mitigate with pinned `fcose` seed for determinism (Claude's discretion on seed value). Fallback: `?legacy_graph=1` URL flag re-enables today's config.
- **Leaflet on iOS Safari** has a known touch-event delegation issue (touches get stuck on map drags). `scrollWheelZoom: false` + tap-to-interact overlay is the primary mitigation; verify on a real iPhone in Phase E acceptance (RISKS §2.3).
- **SEO indexing risk on mobile-first** is small but non-zero — gradient-swap changes indexed content. Phase E Search Console spot-check is the verification step (no code action needed).

</specifics>

<deferred>
## Deferred Ideas

- **Paywall / monetization surface design** — No paywall in v1 (PROJECT.md "Out of Scope: OAuth login — no user accounts needed"). If monetization changes, mobile paywall surface (modal vs. inline gate) materially affects layout — would be its own phase, not bolted onto this one. (RISKS §3 Q2, non-blocking.)
- **SocialFeed polling cadence tuning** — Current plan: default-off on mobile + explicit Refresh button (D-23, D-39). If "liveness" feels too diminished, revisit with 2-min or 30-s cadence configurable. Non-blocking — can adjust mid-execution. (RISKS §2.4.)
- **`<img>` → `next/image` migration** — Would improve mobile image-search indexing (`width`/`height`/`loading` attrs Google likes). Explicitly out of scope for this phase — separate follow-up phase candidate.
- **Killing `/hierarchy` entirely** — This phase only adds the desktop-only banner (D-26). Deletion is a separate product decision.
- **A/B test infrastructure** — No experimentation framework today; standing one up is out of scope. Vercel preview + feature flags (`?legacy_*=1`) is sufficient for the audience size. (D-31.)
- **Visual regression at 375px** — Current spec covers 1280px only (to guard the non-regression goal). Adding 375px snapshots costs minutes and could catch Tailwind pixel-drift during migration — worth considering in a Phase F follow-up, not now. (RISKS §2.2.)
- **Expanded admin surfaces mobile treatment** (`/intel`, `/admin`, `/embed`, `/tools`) — Out of v1 mobile scope (power-user surfaces). If admin needs mobile, new phase.

</deferred>

---

*Phase: 10-mobile-redesign*
*Context gathered: 2026-04-24*
*Source artifacts: UI-SPEC.md, PLAN.md, RISKS.md, AUDIT.md (all in this phase directory) — preserved as canonical refs*

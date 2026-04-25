# PLAN — Phase 10: Mobile Responsive Layout

**Sized for:** one mid-level engineer; six PRs over ~2 weeks of part-time work, or one focused week.
**Each phase = one PR.** Phases ship in order; later phases assume earlier phases are merged.
**Rollback unit:** Vercel preview URL per PR + `?legacy=1` URL flag during Phases A–C (see §rollback).

---

## Inline-style migration strategy

**Decision: Tailwind-first, but incremental, gated by per-component refactor.** Not a "rip-out + reapply" pass.

Rationale:
- Tailwind 4 is already a dependency; PostCSS plugin is wired. The actual cost of "turning Tailwind on" is one `@import "tailwindcss"` line + one config file (Phase A).
- A tokens-based refactor (CSS custom properties — see UI-SPEC §12) gives us a way to make today's inline styles *responsive* without touching them, which buys us time for the per-component conversions.
- Per-component conversion happens **only when that component is in scope for a phase**. We never do a "convert every inline style" PR.

The path for a single component (e.g. `PoliticianCard.tsx`):

1. Add the new CSS custom properties to `globals-terminal.css` (Phase A — already done).
2. In the component's PR (Phase C/D/etc.), replace inline `style={{ padding: '2rem' }}` with `className="p-3 sm:p-6 lg:p-8"`. Keep colour custom properties (`color: 'var(--terminal-green)'`) — they already responsive-correctly.
3. If a value is referenced in 3+ places, add it as a Tailwind theme token in `tailwind.config.ts` and replace.
4. Delete the now-unused inline-style block.

**Hard rule:** no PR converts inline styles in components that aren't part of that PR's scope. (Prevents the "1500-line refactor" anti-pattern.)

---

## Phase A — Foundational responsive scaffolding (S–M)

**Goal:** make Tailwind functional, add the global tokens, set the viewport defaults, install the `prefers-reduced-motion` global, and migrate fonts to `next/font`. Ships *invisible* changes (no per-page UI moves).

**Files touched:**

| File | Change | Size |
|------|--------|------|
| `postcss.config.mjs` | (no change — already imports `@tailwindcss/postcss`) | — |
| `tailwind.config.ts` (new) | Default Tailwind 4 config + `content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}']` + theme aliases for `--terminal-*` colours so `text-terminal-green` etc. work. | S |
| `app/globals-terminal.css` | Add `@import "tailwindcss";` at top. Add token block from UI-SPEC §12. Add `@media (prefers-reduced-motion: reduce)` global block. Keep all existing rules. | S |
| `app/layout.tsx` | Migrate `<link href="https://fonts.googleapis.com/...">` (lines 50–52) to `next/font/google` calls — Bebas Neue (1 wt), Inter (4 wts), JetBrains Mono (3 wts). Drop unused weights (`Inter` 800). Apply `className` to `<body>`. | S |
| `app/layout.tsx:7–10` | No change to viewport (already correct). | — |
| `tsconfig.json` | Verify `paths` still resolves; no change expected. | — |

**Acceptance:**
- `npx next build` passes.
- A throwaway test component using `className="bg-terminal-green text-black p-3 sm:p-6"` renders with green background, padded.
- Lighthouse mobile run on `/` shows fonts loading via `next/font` (no `fonts.googleapis.com` request).
- `@media (prefers-reduced-motion: reduce)` confirmed via Chrome DevTools rendering panel — matrix rain stops, ticker stops.
- **Visual diff vs. main: ~zero.** (Per-pixel; some glyph metrics may shift slightly when fonts are self-hosted.)

**Dependencies:** none. PR #1.

**Why not split smaller:** these four changes have to land together — Tailwind alone without tokens leaves us mid-migration; tokens alone without Tailwind don't help future phases.

---

## Phase B — Header, navigation, search overlay (M)

**Goal:** every page has a usable mobile header and a search that doesn't clip. Unblocks all subsequent UX work.

**Files touched:**

| File | Change | Size |
|------|--------|------|
| `components/TerminalHeader.tsx` | Restructure into the responsive layout from UI-SPEC §5: two-row `(base)` header (`[≡][LOGO][badge]` + full-width search), single-row from `lg:`. Replace inline-style flex with Tailwind classes. Replace 11-link inline nav with: `<DesktopNav />` (rendered `hidden lg:flex`) + `<MobileNavTrigger />` (rendered `lg:hidden`). Keep the state dropdown, but expand its tap target to 44 × 44 via `min-h-[44px]`. | M |
| `components/MobileNavDrawer.tsx` (new) | Off-canvas left-anchored drawer; receives nav-link list and state list as props; uses `useState` + `useEffect` for Esc-key + backdrop dismissal; CSS `transform: translateX(-100%/0)` with `transition: transform 200ms`. | M |
| `components/SearchBar.tsx` | Add `right-auto` so dropdown anchors to input on `sm:`+. **Extract** the `(base)` overlay into `SearchOverlay.tsx`; current `SearchBar` becomes the `sm:`+ rendering and a `<button>` trigger on `(base)`. | M |
| `components/SearchOverlay.tsx` (new) | Full-screen `(base)` overlay per UI-SPEC §8. Pushes a history entry on open; pops on close. Reuses the result-rendering helpers from `SearchBar.tsx` (extract them to `lib/search-helpers.ts` if needed). | M |
| `app/globals-terminal.css` | Remove the `overflow-x: auto` mobile nav rule (no longer needed). | XS |

**Acceptance:**
- 375 px viewport: hamburger present, drawer opens/closes, all 11 nav links reachable, every link is ≥ 48 px tall.
- 1280 px viewport: identical to today (visual diff < 1 %).
- Search opens overlay on tap, results render, Esc closes, browser-back closes.
- Dropdown at `sm:` (e.g. 768 px) does *not* clip past the right edge of the input.

**Dependencies:** Phase A.

**Risks:**
- The state-selector dropdown today has its own positioning math; verify it still works inside both the new desktop nav and the drawer.
- `SocialFeed.tsx` may double-mount during the drawer transition if used in the drawer footer — confirm it isn't.

---

## Phase C — Politician profile page (L)

**Goal:** make the highest-traffic deep page work on phone. Tabs, tables, graph, modal — all addressed in one PR because they share a layout context.

**Files touched:**

| File | Change | Size |
|------|--------|------|
| `app/politician/[id]/page.tsx` | Tab strip → sticky scroll-snap per UI-SPEC §6 (lines 694–737). Vote-filter row → wrap to 2 lines OR horizontal-snap, **and** raise tap target to `min-h-[44px]` (lines 1411–1425). Vote cards → card-per-row layout per UI-SPEC §7 (1433–1453). Funding breakdown grid → `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (1090–1125). Bio info grid → stack on `(base)` (749–764). Social-account rows → wrap, drop fixed `width: 100px` label (773–797). Convert touched inline styles to Tailwind classes per the migration strategy. **Do not touch lines unrelated to mobile.** | L |
| `components/ConnectionsGraph.tsx` | Mobile config branch: at `(base)` use `numIter: 600, animate: false, minZoom: 0.5`; reposition detail overlay to `bottom-2 inset-x-2`; `prefers-reduced-motion` honoured via `matchMedia` check at mount. Container height: `min-h-[280px] h-[60vw] sm:h-[400px] lg:h-[550px]`. | M |
| Inline `ConnectionsTree` (in `politician/[id]/page.tsx:1936–2090`) | Wrap in `<div class="overflow-x-auto">`, replace varying `paddingLeft` with `pl-3` per nesting level via a recursive component prop. | S |
| `components/ShareDossier.tsx` | Modal: `max-w-[660px] max-h-[90vh] flex flex-col`; iframe: `h-[60vh] sm:h-[420px]`. | S |

**Acceptance:**
- 375 px: profile page has zero horizontal page-level scroll.
- Vote filter buttons are tappable individually; ≥ 44 px.
- Network tab loads in ≤ 2 s on a Moto G Power class device (CPU 4× throttle, Slow 4G); detail overlay never covers > 25 % of graph area.
- Tabs scroll-snap with a visible right-edge gradient.
- Share modal fits within viewport without nested scroll.

**Dependencies:** Phases A, B.

**Risks:**
- `ConnectionsGraph.tsx` is 686 lines; mobile config branch is a real change risk — ship behind a feature flag (`?legacy_graph=1` URL param) that re-enables today's config.
- Any change to Cytoscape layout could subtly change which nodes are "the same" for users who've shared screenshots; not blocker, but call out in PR description.

---

## Phase D — Data tables (juicebox + leaderboards) (M)

**Goal:** all tables stop forcing page-level horizontal scroll.

**Files touched:**

| File | Change | Size |
|------|--------|------|
| `components/Leaderboard.tsx` (new) | Reusable `<Leaderboard rows={...} columns={...} mobileLayout="card" />` component that renders a CSS-grid table at `lg:` and a card stack at `(base)`. Used by all three juicebox sections. | M |
| `app/juicebox/page.tsx` | Replace the three hand-rolled grids (lines 300, 502, 678) with `<Leaderboard>`. Update top stats grid (line 179) to `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`. Section padding `p-3 sm:p-6 lg:p-8` (was `padding: 2rem` everywhere). | M |
| `app/officials/page.tsx` | Stats grid (lines 89–94): `grid-cols-2 sm:grid-cols-4`. Section padding (lines 79, 115, 186, 235): `p-3 sm:p-6 lg:p-8`. | S |
| `app/candidates/page.tsx` | Stats grid (line 317): same as above. Card grid (line 141): `flex-col gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-3`. Section padding (lines 269, 281, 370): same standardisation. | S |
| `components/PoliticianCard.tsx` | Header row: `flex flex-col sm:flex-row` (was `flex` only). Corruption score: `text-3xl sm:text-5xl` (was `fontSize: '3rem'`). JuiceBox tag: `flex-wrap`. Top-donor box: `p-2 sm:p-4`. | S |

**Acceptance:**
- All three juicebox tables render as card lists at 375 px with no horizontal scroll.
- `PoliticianCard` does not overflow at 320 px (a 320 px viewport check is part of acceptance — slightly stricter than the 375 px baseline to give safety margin).
- 1280 px: every table renders as a true CSS-grid table identical to today.

**Dependencies:** Phase A. Independent of B/C — could land in either order, but easier after C since `PoliticianCard` is already touched.

---

## Phase E — Homepage, social, maps (S)

**Goal:** clean up the remaining routes that aren't core deep pages but are linked from the homepage.

**`/hierarchy` is deprecated and explicitly OUT OF SCOPE for v1 mobile work** (confirmed 2026-04-24). The page will continue to render with today's desktop-only layout and a "best viewed on desktop" banner if anyone hits it from a phone. Killing the page entirely is a separate product decision.

**Files touched:**

| File | Change | Size |
|------|--------|------|
| `app/social/page.tsx` | Standardise padding via Tailwind. Title sizes per UI-SPEC §3. | XS |
| `components/SocialFeed.tsx` | Default `autoRefresh = false` on `(base)`; explicit "Refresh" button. Status pulse honours `prefers-reduced-motion`. Convert touched inline styles. | S |
| `components/USMap.tsx`, `components/ZipMap.tsx` | `scrollWheelZoom: false`; add a tap-to-interact overlay; convert touched inline styles. | S |
| `app/page.tsx` + `components/TerminalHome.tsx` | Implement matrix-rain mobile branch per UI-SPEC §9 (conditional render based on `window.matchMedia('(min-width: 640px)')`). Search form `flex-direction: column` on `(base)`. Cursor blink → CSS `animation: blink 1.06s steps(2, start) infinite` instead of `setInterval`. | M |
| `app/hierarchy/page.tsx` | **No mobile changes.** Add a `(base)`-only top banner: "This view is optimised for desktop." | XS |

**Acceptance:**
- Homepage at 375 px: gradient backdrop (no rain), search form stacks, ticker scrolls.
- Social page at 375 px: feed scrolls cleanly, refresh button reachable, no automatic poll.
- Map: pinch zoom works inside map; single-finger swipe scrolls the page.
- `/hierarchy` at 375 px: shows a clear "desktop-only" banner; no broken-layout regression beyond what's there today.

**Dependencies:** Phase A.

---

## Phase F — Polish + accessibility + test infra (M)

**Goal:** make the redesign defensible. The first 5 phases get the site usable; this one makes it correct.

**Files touched:**

| File | Change | Size |
|------|--------|------|
| All components touched in B–E | Audit pass for `aria-label`, `role`, `aria-current` on the active tab, `aria-expanded` on the hamburger, skip-link in `app/layout.tsx`. Focus-visible rings via global rule. | M |
| `app/layout.tsx` | Add `<a href="#main">Skip to content</a>` skip link; ensure all pages wrap content in `<main id="main">`. | XS |
| `playwright.config.ts` (new) | Two projects: `mobile-chrome-pixel-7` (412 × 915) and `desktop-chrome-1280` (1280 × 800). | S |
| `tests/e2e/mobile/` (new) | One spec per critical flow: homepage loads + nav drawer opens + search overlay returns a result + politician profile renders all 6 tabs + juicebox renders cards + filter buttons are tappable (assert `getByRole('button').boundingBox().height >= 44`). Five `*.spec.ts` files, ~30 lines each. | M |
| `tests/e2e/desktop/visual-regression.spec.ts` (new) | One spec that snapshots the homepage, candidates, officials, juicebox, profile at 1280 px and compares to a baseline checked into the repo. Fails if visual diff > 1 %. | S |
| GitHub Actions / Vercel CI | Add `npx playwright test` to PR checks. | S |
| `app/globals-terminal.css` | Final cleanup: any rules made dead by Phases A–E. | XS |

**Acceptance:**
- axe-core run via Playwright reports zero CRITICAL or SERIOUS issues on `/`, `/candidates`, `/officials`, `/politician/[representative-id]`, `/juicebox`.
- All 5 mobile e2e specs green on Vercel preview.
- Visual-regression desktop spec green (no regression on 1280 px).
- Lighthouse mobile (Moto G4 emulation, Slow 4G) on `/`: LCP < 2.5 s, CLS < 0.1, TBT < 300 ms.

**Dependencies:** A–E.

---

## Phase summary table

| Phase | Goal | Files | Size | Depends on | Ships behind flag? |
|-------|------|-------|------|------------|--------------------|
| A | Tailwind on, tokens, fonts, reduced-motion global | `tailwind.config.ts`, `globals-terminal.css`, `layout.tsx` | S–M | — | No (invisible) |
| B | Header + nav drawer + search overlay | `TerminalHeader`, `MobileNavDrawer`, `SearchBar`, `SearchOverlay` | M | A | Yes (`?legacy_nav=1`) |
| C | Profile page (tabs, votes, graph, modal) | `politician/[id]/page.tsx`, `ConnectionsGraph`, `ShareDossier` | L | A, B | Yes (`?legacy_graph=1`) |
| D | Data tables + officials/candidates grids | `Leaderboard` (new), `juicebox/page.tsx`, `officials/page.tsx`, `candidates/page.tsx`, `PoliticianCard` | M | A | No |
| E | Homepage rain, social, maps (hierarchy = banner only) | `TerminalHome`, `SocialFeed`, `USMap`, `ZipMap`, `hierarchy/page.tsx` (banner) | S | A | No |
| F | a11y + Playwright + visual regression | `*` (light pass), test scaffolding | M | A–E | No |

---

## Testing strategy

**What gets Playwright mobile-viewport tests (412 × 915, Pixel 7):**
- `/` — header drawer opens; ticker visible; gradient backdrop confirmed (no matrix-rain DOM nodes).
- `/candidates` — at least 1 card per tier visible; no horizontal page scroll (`page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)`).
- `/officials` — same horizontal-scroll check.
- `/politician/[fixed-test-id]` — all 6 tabs render their content when tapped; vote-filter buttons measure ≥ 44 px tall; network tab graph mounts.
- `/juicebox` — three card-stack sections render; no horizontal page scroll.
- `/social` — feed renders; refresh button works without auto-poll.

**What gets manual QA only:**
- `/intel`, `/admin`, `/embed`, `/tools`, `/hierarchy` — out of v1 mobile scope (admin / power-user / deprecated surfaces). Mobile usability is non-blocking; `/hierarchy` ships only a "desktop-only" banner.
- `/connections` (cross-politician) — Cytoscape-heavy, similar to profile network tab; verify perf manually.
- Matrix-rain visual quality at `sm:` (640–1023 px) — automated tests can confirm DOM node count, not visual texture.

**What gets visual regression:**
- Five core pages at 1280 px — guards the "no desktop regression" non-goal.

**Tooling:**
- `playwright` already installed (per `package.json`).
- Add `@axe-core/playwright` for the a11y check.
- Vercel preview URL is the test target; no need to spin up `next dev` in CI.

---

## Rollback plan

**Per-PR Vercel preview** is the primary safety net — every phase's PR has its own preview URL; product can flip between today's prod and the preview URL in a single click.

**Feature flags** for the two highest-risk phases:

- Phase B: `?legacy_nav=1` URL param renders today's `TerminalHeader` instead of the new responsive variant. Implementation: read query string in `TerminalHeader` and short-circuit. Cleanup: deleted in Phase F.
- Phase C: `?legacy_graph=1` URL param re-enables today's Cytoscape config (`numIter: 2500, animate: true`). Same pattern.

**No A/B test infrastructure.** Snitched.ai doesn't have an experimentation framework today; standing one up is out of scope for this phase. Vercel preview + flag is sufficient given the audience size.

**Hotfix path:** if a phase ships and a critical regression is found, `git revert` the merge commit and redeploy — every phase is one PR, so revert is one commit. Phases A and F are the lowest-risk; B, C, and D have the most surface area.

**What we explicitly will NOT do for rollback:**
- No half-deploy of one component (e.g. shipping the new `TerminalHeader` but not the drawer). Each PR ships atomically.
- No long-running release branches. Trunk-based, one phase per PR, merged into `main`.

---

## Estimated execution

| Phase | Engineer-hours | PR review time | Calendar |
|-------|----------------|----------------|----------|
| A | 4–6 h | 0.5 h | Day 1 |
| B | 8–12 h | 1 h | Day 2–3 |
| C | 14–20 h | 2 h | Day 4–6 |
| D | 8–10 h | 1 h | Day 7 |
| E | 4–5 h | 0.5 h | Day 8 |
| F | 8–12 h | 1 h | Day 9–10 |

Total: ~46–65 h of engineering + ~6 h of review across ~2 calendar weeks part-time, or ~1 calendar week focused. (Hierarchy descope = ~2 h saved.)

---

## Out-of-scope reminders (per the prompt's non-goals)

- No data-layer rewrite, no GraphQL, no Supabase swap.
- No auth.
- No native iOS/Android.
- No reinvention of the matrix/terminal identity (UI-SPEC §11 lists the elements that must survive).
- No cron-job or scraper changes.

If any work below the line creeps into scope, escalate to RISKS.md and the user before starting.

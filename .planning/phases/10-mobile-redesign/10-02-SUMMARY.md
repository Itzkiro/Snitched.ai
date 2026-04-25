---
phase: 10
plan: 02
subsystem: frontend-header-nav-search
tags: [responsive-header, mobile-nav-drawer, search-overlay, daemon-status, legacy-header-rollback, tailwind]
requirements_completed: [UI-04]
dependency_graph:
  requires:
    - tailwind-utility-classes
    - css-design-tokens
    - prefers-reduced-motion-global
  provides:
    - mobile-nav-drawer
    - mobile-search-overlay
    - daemon-status-indicator-component
    - legacy-header-rollback-flag
  affects:
    - 10-03-profile-page
    - 10-04-data-tables
    - 10-05-homepage-social-maps
    - 10-06-polish-tests
tech_stack:
  patterns:
    - off-canvas-drawer-with-backdrop-and-swipe-dismiss
    - history-state-mounted-fullscreen-overlay
    - feature-flag-via-url-query-param
    - extract-shared-component-to-eliminate-duplicate-fetch
key_files:
  created:
    - components/MobileNavDrawer.tsx
    - components/SearchOverlay.tsx
    - components/DaemonStatusIndicator.tsx
    - lib/search-helpers.ts
  modified:
    - components/TerminalHeader.tsx
    - components/SearchBar.tsx
    - components/SocialFeed.tsx
    - app/globals-terminal.css
decisions:
  - "LegacyHeader() ordering: copy current JSX VERBATIM into a local function, wire ?legacy_nav=1 query check, verify byte-equivalence, THEN restructure main return path — prevents executor paraphrasing."
  - "DaemonStatusIndicator extracted as a reusable component (variants: full, compact) — drawer footer reuses it, SocialFeed refactored to import it. No duplicate /api/daemon-status fetches."
  - "SearchBar splits responsibilities: (base) renders a button trigger that opens SearchOverlay; sm:+ renders the inline input + dropdown wrapped in `hidden sm:block` so the two branches never co-render."
  - "SearchOverlay pushes a history entry on open (popstate closes it) — back button gesture matches user expectations on mobile."
  - "lib/search-helpers.ts extracted to share result-rendering logic between SearchBar (sm:+) and SearchOverlay ((base)) — single source of truth for fuzzy matching + result formatting."
  - "globals-terminal.css `.terminal-nav { overflow-x: auto }` rule deleted — drawer replaces horizontal nav scroll on mobile per D-30; legacy_nav=1 path renders today's React tree but lets nav links wrap rather than scroll horizontally (acceptable tradeoff for a render-only rollback)."
metrics:
  tasks_completed: 2
  commits: 4
  build_status: passing
  files_added: 4
  files_modified: 4
  insertions: 1115
  deletions: 75
human_verify_checkpoint: approved
completed_date: 2026-04-24
---

# Phase 10 Plan 02: Header + Mobile Nav Drawer + Search Overlay — Summary

Every page now has a usable mobile header. Hamburger opens an off-canvas
drawer with all 11 nav links (≥48px tap targets), the state selector,
and a footer daemon-status indicator that reflects real `/api/daemon-status`
state. Search splits into two render paths: an inline dropdown at sm:+
(now correctly anchored left so it doesn't clip) and a full-screen
overlay at (base) that integrates with browser back. A `?legacy_nav=1`
URL flag re-renders today's React tree as a rollback path. This wave
unblocks every subsequent Phase 10 plan that consumes the new mobile
shell.

## What Shipped

### Mobile nav drawer
- **New file:** `components/MobileNavDrawer.tsx` (173 lines)
  - Off-canvas, left-anchored, `transform: translateX(-100% / 0)` with
    200ms transition (honors prefers-reduced-motion via the global block)
  - Backdrop click, Esc key, and swipe-left all dismiss
  - Mounts the 11 nav links and the state selector as props from
    TerminalHeader
  - Footer slot mounts `<DaemonStatusIndicator variant="compact" />`

### Daemon status as a shared component
- **New file:** `components/DaemonStatusIndicator.tsx` (144 lines)
  - Fetches `/api/daemon-status`, renders colored dot + state label
  - Two variants: `full` (used by SocialFeed status bar) and
    `compact` (used by drawer footer)
  - Pulse animation respects the global `prefers-reduced-motion: reduce`
- **Modified:** `components/SocialFeed.tsx` (-32 net lines)
  - Inline daemon-status logic deleted; imports
    `<DaemonStatusIndicator variant="full" />` instead
  - Single source of truth — no duplicate /api/daemon-status fetches

### Header restructure
- **Modified:** `components/TerminalHeader.tsx` (~+360 lines)
  - Two-row (base) layout: row 1 `[≡][LOGO][badge]`, row 2 full-width
    search; collapses to single row from `lg:`
  - Tagline "POLITICAL INTELLIGENCE NETWORK" hidden at (base), visible
    at sm:+
  - 11 inline nav links replaced by `<DesktopNav>` (rendered
    `hidden lg:flex`) and `<MobileNavTrigger>` (rendered `lg:hidden`)
  - State selector tap target raised to `min-h-[44px]`
  - `LegacyHeader()` local function holds today's JSX verbatim as the
    `?legacy_nav=1` rollback path — short-circuits the new render

### Search overlay + responsive split
- **New file:** `components/SearchOverlay.tsx` (263 lines)
  - Full-screen at (base) per UI-SPEC §8
  - `[← back] [autofocused input] [× clear]` top bar
  - Pushes a history entry on open; popstate closes
  - Reuses result-rendering helpers from lib/search-helpers
- **Modified:** `components/SearchBar.tsx` (+55/-9)
  - At sm:+, the existing inline input + dropdown wrapper now wrapped
    in `hidden sm:block` so it doesn't co-render with the new trigger
  - At (base), a new button trigger (`sm:hidden`) opens SearchOverlay
  - `right-auto` added so the sm:+ dropdown anchors to the input's left
    edge (D-18 fix — no clip past the right edge)

### Shared search helpers
- **New file:** `lib/search-helpers.ts` (94 lines)
  - Extracted result-rendering + fuzzy match formatting from SearchBar
    so both SearchBar (sm:+) and SearchOverlay ((base)) share one
    implementation

### Obsolete CSS removed
- **Modified:** `app/globals-terminal.css`
  - Deleted the `.terminal-nav { overflow-x: auto }` rule (no longer
    needed; drawer replaces horizontal nav scroll on mobile per D-30)

## Commits

```
6c6606d  feat(phase-10): extract DaemonStatusIndicator from SocialFeed
e45b8ff  feat(phase-10): create MobileNavDrawer component
cd979ed  refactor(phase-10): restructure TerminalHeader + remove obsolete CSS
e38b29f  feat(phase-10): create SearchOverlay + (base) trigger button on SearchBar
```

## Verification

- `npx next build` passes after each task
- All grep acceptance criteria from 10-02-PLAN.md pass:
  - `grep -q 'LegacyHeader' components/TerminalHeader.tsx` ✓
  - `grep -q 'MobileNavDrawer' components/TerminalHeader.tsx` ✓
  - `grep -q 'SearchOverlay' components/TerminalHeader.tsx` ✓
  - `grep -q 'DaemonStatusIndicator' components/MobileNavDrawer.tsx` ✓
  - `grep -q 'DaemonStatusIndicator' components/SocialFeed.tsx` ✓
  - `grep -q 'hidden sm:' components/SearchBar.tsx` ✓
  - `grep -q 'right-auto' components/SearchBar.tsx` ✓
- Human-verify checkpoint (16 visual checks across 375/768/1280 px +
  legacy_nav=1 rollback) — **approved**

## Risks & Carry-overs

- The legacy rollback path is render-tree only, not CSS-equivalent: the
  removed `overflow-x: auto` rule means `?legacy_nav=1` lets nav links
  wrap rather than scroll horizontally. Acceptable per D-30 since this
  flag is for emergency rollback of the React tree, not a perfect
  visual replay of yesterday's CSS.
- The `?legacy_nav=1` flag will be deleted in Plan 10-06 along with the
  `LegacyHeader()` function and any `useSearchParams()` reads added for
  this purpose.
- No new test coverage added in this plan — Playwright + axe-core
  scaffolding is plan 10-06's scope.

## Next

Plan 10-03 (Wave 3): Politician profile page — tabs, vote filter, vote
cards, ConnectionsGraph mobile branch, ShareDossier modal. Has its own
human-verify checkpoint and `?legacy_graph=1` rollback flag.

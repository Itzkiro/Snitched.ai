---
phase: 10
plan: 04
subsystem: mobile-responsive-redesign
tags: [data-tables, leaderboard, juicebox, officials, candidates, politician-card, mobile, tailwind]
wave: 4
status: complete
completed: 2026-04-24
duration: ~50min
requirements: [UI-04]
dependency_graph:
  requires:
    - 10-01 (Tailwind 4 wired, terminal-* color aliases registered, p-3 sm:p-6 lg:p-8 idiom available)
  provides:
    - components/Leaderboard.tsx (reusable card-stack ↔ CSS-grid table)
    - data-leaderboard-mobile attribute (Playwright hook for plan 10-06)
    - data-politician-card attribute (Playwright hook for plan 10-06)
  affects:
    - app/juicebox/page.tsx (3 sections refactored)
    - app/officials/page.tsx (stats grid + padding)
    - app/candidates/page.tsx (stats + card grid + padding)
    - components/PoliticianCard.tsx (header stacking + score sizing)
tech-stack:
  added: []
  patterns:
    - "Generic-typed React component with column descriptor pattern (LeaderboardColumn<T>)"
    - "CSS-only switch between card stack (base) and CSS-grid table (lg:) — single component, two layouts (UI-SPEC §10)"
    - "mobileSlot enumeration: primary | secondary | meta | hidden — each Leaderboard usage carries exactly one primary"
    - "Inline gridTemplateColumns on lg:grid wrapper (dynamic widths cannot be expressed as static Tailwind utilities)"
key-files:
  created:
    - components/Leaderboard.tsx
    - .planning/phases/10-mobile-redesign/10-04-SUMMARY.md
  modified:
    - app/juicebox/page.tsx
    - app/officials/page.tsx
    - app/candidates/page.tsx
    - components/PoliticianCard.tsx
decisions:
  - "Leaderboard prop shape: rows<T>, columns<LeaderboardColumn<T>>, mobileLayout='card', getRowKey, optional rankRender, optional className. Generic typing chosen so each page passes its own row type without prop-type erosion."
  - "Special handling for two columns: rank (key='rank') renders in card top-left; name (isName: true) renders as card title above primary slot. Neither carries mobileSlot:'primary' — primary is reserved for the ONE headline metric per section."
  - "Section 1 (corruption rankings): primary = corruption score column (matches plan's enumerated assignment for the corruption-score-ranking section)."
  - "Section 2 (top fundraisers): primary = total raised column (the section's headline dollar figure; mirrors plan's pattern of headline-dollar-as-primary). Recorded as a deviation from the plan's literal text which said 'top-donor amount' — see Per-section primary assignments below."
  - "Section 3 (israel lobby): primary = pro-Israel donation total column (matches plan's enumerated assignment)."
  - "PoliticianCard corruption score: dropped non-existent font-display Tailwind class, kept inline fontFamily: 'Bebas Neue, sans-serif' to preserve UI-SPEC §3 big-number typeface intent. font-display is not registered in tailwind.config.ts (out of plan 10-04 scope)."
metrics:
  duration_minutes: ~50
  files_changed: 5
  files_created: 1
  commits: 4
  build_passes: true
---

# Phase 10 Plan 04: Data tables — Leaderboard, juicebox, officials, candidates, PoliticianCard Summary

Reusable `<Leaderboard>` component plus mobile-responsive refactor of the juicebox three-section leaderboard, officials stats/section padding, candidates stats/card-grid/padding, and PoliticianCard header stacking + corruption-score sizing.

## Leaderboard component API

```tsx
interface LeaderboardColumn<T> {
  key: string;                                  // Stable React key + lg: header
  header: string;                               // lg: column header text
  render: (row: T) => ReactNode;                // Cell renderer
  mobileSlot?: 'primary' | 'secondary' | 'meta' | 'hidden';
  widthLg?: string;                             // CSS grid track size (e.g. '60px', '1fr', '100px')
  cellClassName?: string;                       // Applied to header AND data cells at lg:
  mobileLabel?: string;                         // Override label in secondary slot
  isName?: boolean;                             // Mark the row's identity column
}

interface LeaderboardProps<T> {
  rows: T[];
  columns: LeaderboardColumn<T>[];
  mobileLayout: 'card';                         // Future-proofing; only 'card' in v1
  getRowKey: (row: T) => string;                // Required for React keys
  rankRender?: (row: T, index: number) => ReactNode;
  className?: string;
}
```

**Rendering:**
- **lg:** A CSS-grid table. `gridTemplateColumns` is composed by joining each column's `widthLg` (defaults to `'1fr'`). Header row + data rows. Row borders via `border-t border-terminal-border`.
- **base:** A card stack. Wrapper carries `data-leaderboard-mobile` for Playwright instrumentation (plan 10-06). Each card:
  - Top: rank (top-left dim text) + name (card title, bold) on the left, primary slot (top-right, `text-2xl text-terminal-green`) on the right.
  - Body: secondary slots stack as `label / value` rows (label dim+uppercase+left, value right-aligned).
  - Footer (only if any meta columns): divided footer with all meta slots flex-wrapped.

## Per-section primary slot assignments (juicebox/page.tsx)

The plan committed three explicit `mobileSlot: 'primary'` assignments. Implemented as follows:

| Section | View | Primary metric | Matches plan? |
|---------|------|----------------|---------------|
| 1 | `CORRUPTION SCORES` (`activeView === 'corruption'`) | `corruptionColumns.score` — the corruption score column (the circular score badge) | YES — plan says "Section 2 — Corruption score ranking: primary = the corruption score column". Note that the plan's section numbering counts `juicebox` rendering order: this is the FIRST tab rendered today (`activeView === 'corruption'` is the default) but is the SECOND section per the plan's numbering. |
| 2 | `TOP FUNDRAISERS` (`activeView === 'fundraisers'`) | `fundraisersColumns.totalRaised` — total funds raised | DEVIATION from the plan's literal text. The plan committed (Section 3): "Top-donor leaderboard (top single-donor amounts): primary = the top-donor amount column (dollar amount of the single largest donor)". The juicebox page does NOT currently expose a per-row "single-largest-donor amount" column on this section — it shows TOTAL RAISED (overall campaign total). The closest semantic match for "headline dollar figure that frames this section's narrative" is `totalRaised`. The plan's clause "the implementer MAY reassign primary to the actual headline metric for THAT section" applies here. Recorded. |
| 3 | `ISRAEL LOBBY` (`activeView === 'israel'`) | `israelColumns.israelLobby` — pro-Israel donation total ($ amount + % of total) | YES — plan says "Section 1 — Pro-Israel donor leaderboard: primary = the pro-Israel donation total column". |

**Acceptance check:** `grep -c "mobileSlot: 'primary'" app/juicebox/page.tsx` returns **3** — exactly one primary per section across all 3 sections.

## .data-grid CSS class — out-of-scope styling delta

`app/officials/page.tsx` has three `<div className="data-grid">` usages (federal/state/county sections, lines 126, 197, 246 in the original). The `.data-grid` class is defined in `app/globals-terminal.css` and uses `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`. AUDIT §1.3 notes this contributes to PoliticianCard overflow at 375 px because `minmax(280px, ...)` forces a 280-px-wide column.

**Resolution path chosen:** Per plan 10-04 step 1: "Do NOT modify globals-terminal.css here (out of scope; the PoliticianCard fix in Step 3 resolves the overflow at the card level)". Confirmed by inspection — PoliticianCard now stacks its header (`flex-col sm:flex-row`) and drops `fontSize: '3rem'` to `text-3xl sm:text-5xl`, so a card content can sit comfortably inside a 280-px column on phone. `.data-grid` class itself is unchanged. Officials page renders three `.data-grid` containers, each containing PoliticianCard components — at 375 px each PoliticianCard is now narrow-friendly.

## 320 px PoliticianCard verification

**Manual visual check not run** in this autonomous execution (no headless-browser available in the executor). Instead, verified by code review:

- Header row was the dominant overflow source: avatar (64 px) + name flex (1, min-width: 0) + score column (`fontSize: '3rem'` ~ 60 px wide). Total ~ 280 px before padding/gap, which trips at 320 px.
- After: header row is `flex-col sm:flex-row` — at base each block (avatar / name / score) stacks vertically, so the *widest* in-row element drops to one of: avatar (64 px), name block (constrained by parent + `wordBreak: 'break-word'`), score (text-3xl, ≈ 30 px). All comfortably below 320 px – padding.
- `flex-wrap` added to JuiceBox tag wrapper — multiple pieces (label + dollar amount) can wrap to a second line if the parent gets narrow.
- Top-donor box `p-2 sm:p-4` — base padding drops from `1rem` (16 px) to `0.5rem` (8 px), gaining 16 px of usable inner width.

**Programmatic validation deferred to plan 10-06** (Playwright suite will assert `document.documentElement.scrollWidth <= window.innerWidth` at 320 px).

## data-* test attribute hooks added

| Attribute | Element | Purpose |
|-----------|---------|---------|
| `data-leaderboard-mobile` | The mobile card-stack wrapper `<div>` inside `<Leaderboard>` (only rendered at base; `lg:hidden`) | Plan 10-06 Task 2 Step 3 — Playwright will assert "all 3 leaderboard sections render as cards (not table) at 375 px" by counting `data-leaderboard-mobile` elements. |
| `data-politician-card` | `<PoliticianCard>` root `<div>` (the inner element, not the `<Link>`) | Plan 10-06 Task 2 Step 3 — Playwright will iterate every `data-politician-card` on `/officials` and `/candidates` at 320 px and assert `boundingBox().width <= viewport.width`. |

## Commits

| SHA | Message |
|-----|---------|
| `ed0c380` | feat(phase-10): create reusable `<Leaderboard>` component (CSS-grid + card-stack) |
| `48a1af1` | refactor(phase-10): mobile-responsive officials page (stats grid + section padding) |
| `14c27c9` | refactor(phase-10): mobile-responsive candidates page (stats + card grid + padding) |
| `9fd0799` | feat(phase-10): mobile-responsive PoliticianCard (header flex, score size, donor box) |

(Note: this SUMMARY commit will follow as the 5th commit on the branch.)

## Deviations from Plan

### [Rule 3 — Blocking] Section 2 primary slot reassignment

**Found during:** Task 1, while writing column descriptors for the TOP FUNDRAISERS section.

**Issue:** The plan committed `mobileSlot: 'primary'` assignments for three sections, including Section 3 (top-donor leaderboard) → "top-donor amount column (dollar amount of the single largest donor)". However, the juicebox page renders three sections that do NOT match the plan's exact section ordering 1:1: instead they're three views (`activeView` tabs): `corruption` / `fundraisers` / `israel`. The `fundraisers` view shows TOTAL RAISED (overall campaign totals), not a single-largest-donor figure. The plan acknowledged this risk: "the implementer MAY reassign primary to the actual headline metric for THAT section — but each section MUST still have exactly one primary".

**Fix:** For the `fundraisers` view, primary slot assigned to `totalRaised`. For the `israel` view (which IS a "lobby donor leaderboard" matching the plan's Section 3 description), primary slot assigned to `israelLobby` (the pro-Israel donation total) — this matches the plan's enumerated commitment for Section 1. For the `corruption` view (matches the plan's Section 2 description), primary slot assigned to the corruption score column.

**Impact:** Each of the three rendered sections has exactly one `mobileSlot: 'primary'` column displaying its headline metric. Acceptance `grep -c "mobileSlot: 'primary'" >= 3` passes (returns 3).

**Files modified:** `app/juicebox/page.tsx`

**Commit:** `ed0c380`

### [Rule 3 — Blocking] font-display Tailwind class not registered

**Found during:** Task 2 PoliticianCard refactor — `git log` showed `tailwind.config.ts` was wired in plan 10-01 but does not register `font-display` as a fontFamily theme alias. The plan literal said: "Replace with className `text-3xl sm:text-5xl font-display`".

**Fix:** Dropped the `font-display` class (Tailwind silently ignores unknown classes; no error, no rule emitted). Replaced with inline `style={{ ..., fontFamily: 'Bebas Neue, sans-serif' }}` to preserve UI-SPEC §3 big-number typeface intent. Adding `font-display` to `tailwind.config.ts` would be Phase A scope (D-22 hard rule prevents in-scope creep).

**Impact:** Visual output identical to original code (which also rendered Bebas Neue via no css class). Build passes. acceptance `grep -q 'text-3xl sm:text-5xl' components/PoliticianCard.tsx` passes.

**Files modified:** `components/PoliticianCard.tsx`

**Commit:** `9fd0799`

### Authentication gates

None.

## Verification Results

Acceptance grep checks (per plan task 1 + task 2):

```
=== Leaderboard.tsx ===
OK: components/Leaderboard.tsx exists
OK: 'mobileLayout' present
OK: 'lg:hidden' (card stack branch)
OK: 'hidden lg:grid' (table branch)
OK: 'data-leaderboard-mobile' (test instrumentation hook)

=== juicebox/page.tsx ===
'Leaderboard' count: 9 (1 import + 1 type + 3 usages + 4 column-array refs ≥ 4)
"mobileSlot: 'primary'" count: 3 (exactly one per section)
'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5' present (stats grid)
'p-3 sm:p-6 lg:p-8' present (section padding)
"padding: '2rem'" count: 0 (all replaced)

=== officials/page.tsx ===
'grid-cols-2 sm:grid-cols-4' present
'p-3 sm:p-6 lg:p-8' count: 5 (4+ required)
"padding: '2rem'" count: 0

=== candidates/page.tsx ===
'grid-cols-2 sm:grid-cols-4' present
'flex flex-col gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-3' present
"padding: '2rem'" count: 0

=== PoliticianCard.tsx ===
'flex-col sm:flex-row' present
'text-3xl sm:text-5xl' present
"fontSize: '3rem'" REMOVED (count 0)
'flex-wrap' present
'p-2 sm:p-4' present
'data-politician-card' present

=== Build ===
npx next build → exit 0 (green)
```

All `<acceptance_criteria>` items in the plan: PASS.

## Self-Check: PASSED
- components/Leaderboard.tsx exists ✓
- app/juicebox/page.tsx modified ✓
- app/officials/page.tsx modified ✓
- app/candidates/page.tsx modified ✓
- components/PoliticianCard.tsx modified ✓
- Commit ed0c380 ✓
- Commit 48a1af1 ✓
- Commit 14c27c9 ✓
- Commit 9fd0799 ✓

## Known Stubs

None. All UI changes wire to existing data sources (no new placeholder rendering paths introduced).

## Threat Flags

None. The Leaderboard component does not introduce new trust boundaries. `gridTemplateColumns` is composed from hardcoded per-page `widthLg` strings (plan threat register T-10-15 disposition: accept). `render` functions return text via React's automatic escape — no `dangerouslySetInnerHTML` (T-10-16 mitigated). Row counts unchanged from today (T-10-17 accept).

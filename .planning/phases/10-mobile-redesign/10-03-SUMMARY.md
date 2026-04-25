---
phase: 10
plan: 03
subsystem: frontend-profile-page
tags: [politician-profile, tab-strip, vote-cards, connections-graph, share-dossier, legacy-graph-rollback, prefers-reduced-motion]
requirements_completed: [UI-04]
dependency_graph:
  requires:
    - tailwind-utility-classes
    - css-design-tokens
    - prefers-reduced-motion-global
    - mobile-nav-drawer
    - mobile-search-overlay
  provides:
    - mobile-tab-strip-with-hash-route
    - card-per-row-vote-layout
    - mobile-cytoscape-config
    - legacy-graph-rollback-flag
    - mobile-share-modal-sizing
  affects:
    - 10-06-polish-tests
tech_stack:
  patterns:
    - sticky-scroll-snap-tab-strip-with-hash-route
    - card-per-row-vote-layout-via-order-classes
    - cytoscape-mobile-config-branch-with-rollback-flag
    - prefers-reduced-motion-via-matchmedia-mount-check
    - recursive-tree-padding-via-component-prop
key_files:
  modified:
    - app/politician/[id]/page.tsx
    - components/ConnectionsGraph.tsx
    - components/ShareDossier.tsx
decisions:
  - "Tab count: 7 in codebase (overview, score, funding, legal, votes, social, network), not 6 as the plan assumed — preserved all 7 and added all to the hash allow-list to honor D-22 (no scope reduction)."
  - "Vote badge ordering: badge renders ABOVE bill title at base via `order-first`, returns to right-side at `sm:`+ via `sm:order-last sm:ml-auto sm:min-w-[90px]` — uses CSS order rather than rendering twice."
  - "Detail overlay confirmed at components/ConnectionsGraph.tsx:687+ (NOT app/politician/[id]/page.tsx as AUDIT cited) — page.tsx:652-682 is the Data Source Badge."
  - "ConnectionsTree indent reduced from depth*24+16 to depth*12+12 (pl-3 per level) — recursive component prop carries the depth so the change is single-source."
  - "Mobile Cytoscape: numIter:600, animate:false, minZoom:0.5, randomize:false at base. prefers-reduced-motion forces animate:false regardless of viewport."
  - "Sticky tab offset: top-[56px] — assumes the post-wave-2 TerminalHeader height; revisit in plan 06 if real-device verification shows overlap."
  - "ShareDossier embed-code template at line 154 intentionally retains literal height=\"420\" — that's the snippet users COPY for external embedding (cross-site contract). Only the modal-rendered preview iframe was resized."
metrics:
  tasks_completed: 2
  commits: 2
  build_status: passing
  files_modified: 3
  insertions: 201
  deletions: 133
human_verify_checkpoint: approved
completed_date: 2026-04-24
---

# Phase 10 Plan 03: Politician Profile Page — Summary

The highest-traffic deep page now works on phone. Tab strip scrolls
horizontally with snap and right-edge gradient; vote filter buttons are
44px-tall and tap-friendly; vote cards stack with the YEA/NAY badge as
a chip above the bill title; funding/bio/social grids respond to
viewport; the network tab uses a reduced-iteration Cytoscape config on
mobile (and honors `prefers-reduced-motion` even on desktop); the
detail overlay sits at the bottom on mobile and top-right on desktop;
the ShareDossier modal fits within viewport with a `60vh` preview
iframe. A `?legacy_graph=1` URL flag re-renders today's Cytoscape
config byte-equivalently as the rollback path.

## What Shipped

### Tab strip (sticky scroll-snap)
- 7 tabs (`overview, score, funding, legal, votes, social, network`)
  rendered horizontally with `scroll-snap-type: x mandatory`
- Right-edge black-to-transparent gradient indicates more tabs
- Tapping a tab updates URL hash; allow-list enforced on mount
  (mitigates open-redirect / hash-injection — T-10-11)
- `aria-current="page"` on the active tab
- Sticky `top-[56px]` so the strip stays at the top of the scroll
  viewport when content scrolls underneath

### Vote filter row
- 6 filter buttons + CLEAR all at `min-h-[44px]`
- Wraps to multi-line at base; horizontal-snaps at `sm:`+

### Vote cards
- Card-per-row layout per UI-SPEC §7
- YEA / NAY / PRESENT badge: `order-first` (above title) at base;
  `sm:order-last sm:ml-auto sm:min-w-[90px]` (right side) at sm:+
- Bill title uses `break-words` so long titles wrap

### Responsive grids
- **Funding breakdown grid:** `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 p-3 sm:p-6 lg:p-8`
- **Bio info grid:** `flex flex-col gap-2 sm:grid sm:grid-cols-[150px_1fr]` — labels stack above values on base, two-column at sm:+
- **Social rows:** `flex flex-col sm:flex-row`; dropped fixed `width:100px` label; `break-all` on handles to prevent overflow

### ConnectionsTree (inline, in page.tsx ~1936-2090)
- Root wrapped in `overflow-x-auto`
- Recursive `TreeBranch` indent: `depth*12+12` (pl-3 per level), down from `depth*24+16`

### ConnectionsGraph
- **Mobile config branch:** at base, `numIter: 600, animate: false, minZoom: 0.5, randomize: false`
- **Reduced motion override:** `matchMedia('(prefers-reduced-motion: reduce)').matches` → forces `animate: false` regardless of viewport
- **Container height:** `min-h-[280px] h-[60vw] sm:h-[400px] lg:h-[550px]`
- **Detail overlay reposition** (located at ConnectionsGraph.tsx:687+):
  - Base: `absolute bottom-2 inset-x-2 max-h-[35%] overflow-y-auto`
  - sm:+: `sm:top-2 sm:right-2 sm:bottom-auto sm:inset-x-auto sm:max-w-[260px] sm:max-h-none`
- **`?legacy_graph=1` rollback path:** all 12 fcose options enumerated verbatim — `name`, `animate:true`, `animationDuration:500`, `randomize:true`, `quality:'proof'`, `nodeSeparation:80`, `idealEdgeLength:150`, `nodeRepulsion:()=>20000`, `edgeElasticity:()=>0.45`, `gravity:0.2`, `gravityRange:3.8`, `numIter:2500`. Byte-equivalent to pre-phase-10 production.

### ShareDossier modal
- Container: `max-w-[660px] max-h-[90vh] flex flex-col`
- Modal-rendered preview iframe: `h-[60vh] sm:h-[420px] w-full`
- Embed-code template at line 154 (the string users *copy* for external embedding) intentionally untouched at `height="420"` — that's a cross-site contract, not a render dimension

## Commits

```
092a738  feat(10-03): mobile-responsive profile page — tabs, vote filter/cards, bio/social/funding grids, tree wrap
2582bea  feat(10-03): mobile ConnectionsGraph config branch + overlay reposition + ShareDossier sizing
```

## Verification

- `npx next build` passes after each task
- All grep acceptance criteria from 10-03-PLAN.md pass:
  - `grep -q 'scroll-snap-type: x' app/politician/[id]/page.tsx` ✓
  - `grep -q 'min-h-\[44px\]' app/politician/[id]/page.tsx` ✓
  - `grep -q 'order-first' app/politician/[id]/page.tsx` ✓
  - `grep -q 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' app/politician/[id]/page.tsx` ✓
  - `grep -q 'sm:grid-cols-\[150px_1fr\]' app/politician/[id]/page.tsx` ✓
  - `grep -q 'overflow-x-auto' app/politician/[id]/page.tsx` ✓
  - `grep -q 'numIter: 600' components/ConnectionsGraph.tsx` ✓
  - `grep -q 'numIter: 2500' components/ConnectionsGraph.tsx` ✓ (legacy_graph=1 path)
  - `grep -q 'idealEdgeLength: 150' components/ConnectionsGraph.tsx` ✓
  - `grep -q 'gravityRange: 3.8' components/ConnectionsGraph.tsx` ✓
  - `grep -q "quality: 'proof'" components/ConnectionsGraph.tsx` ✓
  - `grep -q 'bottom-2 inset-x-2' components/ConnectionsGraph.tsx` ✓
  - `grep -q 'sm:top-2 sm:right-2' components/ConnectionsGraph.tsx` ✓
  - `grep -q 'max-w-\[660px\]' components/ShareDossier.tsx` ✓
  - `grep -q 'h-\[60vh\] sm:h-\[420px\]' components/ShareDossier.tsx` ✓
- Human-verify checkpoint (10 visual checks across 375/1280 px + reduced-motion + `?legacy_graph=1` rollback) — **approved**

## Risks & Carry-overs

- Tab strip sticky offset hardcoded to `top-[56px]`. If real-device
  verification surfaces overlap with the post-wave-2 header, adjust in
  plan 06 (a11y/polish wave).
- D-14 mapping documented: NO row-per-donation FEC contributions table
  exists in the profile page; the funding *breakdown by committee*
  grid was made responsive instead. Strategy B (sticky-first-column)
  is not applicable in this phase. If a row-per-donation table is
  added later, Strategy B should be applied then.
- `?legacy_graph=1` flag will be deleted in Plan 10-06 along with
  `?legacy_nav=1`.
- No new test coverage added in this plan — Playwright + axe-core
  scaffolding is plan 10-06's scope.

## Next

Plan 10-04 (Wave 4): Data tables — Leaderboard component, juicebox /
officials / candidates grids, PoliticianCard responsive header.
`autonomous: true`, no checkpoint.

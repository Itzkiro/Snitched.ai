# UI-SPEC — Phase 10: Mobile Responsive Layout

**Status:** DRAFT v1 (pending product review of the 3 clarifying questions in RISKS.md)
**Owner:** front-end (single engineer can execute)
**Brand intent that MUST survive on phone:** matrix-green (`#00FF41`) on near-black, monospaced terminal type, dossier-card aesthetic for profiles, live ticker motion on the homepage. Adapt density and chrome — never reskin.

---

## 1. Breakpoints

Mobile-first. Tailwind 4 defaults are kept (matches the "phones we actually care about" set):

| Token | Min width | Target devices | Why |
|-------|-----------|----------------|-----|
| (base) | 0 | iPhone SE (375), small Android (360) | Default styles assume single-column, full-bleed cards. |
| `sm:` | 640 px | Large phone landscape, small tablet | Two-column grids start here. |
| `md:` | 768 px | Tablet portrait | Sticky sidebars and 3-column dashboards become viable. |
| `lg:` | 1024 px | Tablet landscape, small laptop | Existing desktop layout begins to assemble. |
| `xl:` | 1280 px | **Locked-in baseline.** Existing desktop look must be byte-equivalent here (or better). | Per non-goal: "no regression on desktop ≥1280 px". |

Justification for not adding a custom 480 px or 414 px breakpoint: the audit shows the page actually breaks at 375 px because of *fixed pixel chrome* (e.g. `padding: 2rem`, `minmax(280px, 1fr)`), not because of a missing breakpoint at 414 px. Default `(base)`-tier styles tuned for 360–414 px solve the actual problems.

---

## 2. Spacing scale

Base unit: **4 px**, expressed via Tailwind's default scale (no override).

| Tailwind | px | Use |
|----------|----|-----|
| `p-2` / `gap-2` | 8 | Tight chrome inside dense data cards (vote rows, leaderboard rows). |
| `p-3` / `gap-3` | 12 | Section interior padding on **mobile** (replaces today's `padding: 2rem`). |
| `p-4` / `gap-4` | 16 | Default card padding. |
| `p-6` | 24 | Section padding from `sm:` upward. |
| `p-8` | 32 | Section padding from `lg:` upward (matches today's `2rem`). |

Rule: **section/page padding is `p-3 sm:p-6 lg:p-8`**, never a hard-coded `2rem` again.

---

## 3. Typography scale

Stack stays terminal:

```
font-mono → 'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace
font-display → 'Bebas Neue', sans-serif (kept for big numbers only)
font-sans → 'Inter', system-ui (kept for body where mono is too dense)
```

Switch from Google Fonts `<link>` to `next/font/google` with subsetting (Phase A, no visual change).

| Role | Mobile (base) | `sm:` | `lg:` | Notes |
|------|---------------|-------|-------|-------|
| Hero / page title | 24 / 1.2 | 28 / 1.2 | 32 / 1.15 | Replaces 16 px monstrosities like `social/page.tsx:11`. |
| Section title | 18 / 1.25 | 20 / 1.25 | 24 / 1.2 | |
| Card title | 16 / 1.3 | 18 / 1.3 | 20 / 1.25 | |
| Body / dense | 14 / 1.4 | 14 / 1.4 | 14 / 1.5 | iOS Safari minimum is 12 px; we never go below 14 px on phone. |
| Meta / dim | 12 / 1.4 | 12 / 1.4 | 11 / 1.4 | Only category where mobile is *bigger* than desktop. |
| Big-number ("3 rem score") | 32 / 1 | 40 / 1 | 48 / 1 | Was 3 rem (~48 px) on every device — that's what's breaking the cards. |
| Code / data | 13 / 1.4 | 13 / 1.4 | 13 / 1.5 | |

Letter-spacing for uppercase headings: `0.08em` (was `0.1em` — too wide on phone).

---

## 4. Touch target & motion

- **Tap targets ≥ 44 × 44 px** on every interactive element. Enforced via `min-h-[44px]` utility on all `<button>` and link-as-button elements at `(base)`. Lint rule (Phase F): a Playwright a11y check that fails if any button is < 44 px tall on a 375 px viewport.
- **Hit-area expansion** for visually small elements: use `before:absolute before:inset-[-8px]` pseudo-element (does not move layout) when the visible target is intentionally < 44 px (e.g. a "×" close icon in a dense table cell).
- **`prefers-reduced-motion`** is respected globally:
  - Add a single `@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }` block in the new global stylesheet, **plus** an explicit early-return guard in `TerminalHome.tsx`'s matrix-rain mount.
  - Cytoscape: pass `animate: false` when `window.matchMedia('(prefers-reduced-motion: reduce)').matches`.
- **Focus rings**: visible 2 px `outline` in `--terminal-amber`, never `outline: none`. Use `:focus-visible` so mouse users don't see it.

---

## 5. Navigation pattern (mobile)

**Decision:** **Top header with hamburger → off-canvas drawer**, _not_ a bottom tab bar.

Rationale:
- A bottom tab bar implies 4–5 stable destinations. Snitched.ai has 11 nav links (state selector + Candidates + Officials + Juicebox + Hierarchy + Social + Browse + Compare + Connections + Intel + Tools). They don't compress to 5 without losing IA — and the user research surface (admin/intel) is for power users who already know the URL.
- Hamburger is also less novel — the audience here is researchers and journalists, not daily-active consumers; novelty is a cost.
- The matrix/dossier identity expresses better in a top status bar than a soft mobile chrome.

Spec:

```
(base)        sm:         lg:
─────────────────────────────────────────
[≡][LOGO]   [LOGO][ ≡]   [LOGO][nav…][ search ]
[ search  ]
─────────────────────────────────────────
```

- Header collapses to a **two-row** layout on `(base)`: row 1 = `[≡][LOGO][·][state badge]`, row 2 = full-width search input.
- Hamburger opens a **left-anchored drawer**, 80 vw wide max (cap at 320 px), with: state selector (full-width buttons), then nav links as a vertical stack with `min-h-[48px]` rows, then a footer with the daemon-status indicator.
- Drawer dismisses on: backdrop tap, swipe-left, Esc key.
- **No animation longer than 200 ms** for the drawer slide-in; use CSS transform.
- The "POLITICAL INTELLIGENCE NETWORK" tagline (`TerminalHeader.tsx:103`) drops to `display: none` on `(base)`, returns at `sm:`.

---

## 6. Profile-page tab pattern

**Decision:** **Sticky top tab strip with horizontal scroll-snap on `(base)`, full row on `lg:`**. No accordion. No segmented control.

Rationale:
- 6 tabs is too many for a segmented control (segmented controls feel right at 2–4).
- Accordion wrecks the dossier identity — users expect one tab visible at a time, like file folders.
- Sticky scroll-snap preserves the existing model and adds a visual affordance (snap-into-place + active tab indicator).

Spec:

- Container: `sticky top-[56px] z-30 flex overflow-x-auto snap-x snap-mandatory border-b border-[--terminal-border] bg-black/85 backdrop-blur`.
- Tab button: `snap-start min-h-[44px] px-4 py-2 text-sm font-mono uppercase tracking-wide`.
- Active tab: 2 px bottom border in `--terminal-green`; non-active: dim text.
- **Right-edge gradient** (`pointer-events-none absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-black to-transparent`) to *signal* horizontal scroll — fixes the silent-scroll affordance gap from the audit.
- After tab activation, hash-route updates (`#votes`) so back-button / share-link works.
- Tab order remains: Overview · Votes · Funding · Network · Social · Legal.

---

## 7. Data-table strategy (per table)

Three strategies. Each table on the site must pick one explicitly.

| Strategy | When to use | How it looks |
|----------|-------------|--------------|
| **A. Card-per-row** | Tables with > 4 columns where each row's primary identity is a person/entity. | At `(base)` each row becomes a vertical card with the rank/avatar at the top, primary metric in big type, secondary metrics as label-value pairs. At `lg:` returns to true table. |
| **B. Sticky-first-column horizontal scroll** | Tables where keeping the row identity visible is critical and the metrics are numeric & scannable. | At `(base)` the table is `overflow-x-auto`; first column is `position: sticky; left: 0` with a 1 px right border + soft shadow. |
| **C. Collapsible rows** | Tables with a deep "row detail" surface (e.g. expandable to show child donations). | At `(base)` only summary fields (rank, name, primary metric, chevron) render; tap expands to show all fields stacked. |

Per-table assignments:

| Table | File | Strategy | Rationale |
|-------|------|----------|-----------|
| Juicebox leaderboard tables (3) | `app/juicebox/page.tsx:300, 502, 678` | **A. Card-per-row** | The "BOUGHT & PAID FOR" framing relies on visual emphasis on the *who* + the *number*; cards do that; horizontal scroll buries the message. |
| FEC contributions list (profile/Funding tab) | `app/politician/[id]/page.tsx` (in funding section) | **B. Sticky-first-column** | Researchers need to scan many rows of donor + amount + date; cards would 5× the scroll length. |
| Vote records (profile/Votes tab) | `app/politician/[id]/page.tsx:1433–1453` | **A. Card-per-row** | Already laid out as flex; convert the right-side vote badge to a colored chip *above* the bill title on `(base)`. |
| Lobbying records (profile/Lobbying tab — note: in the codebase this is `legal` tab) | `app/politician/[id]/page.tsx` | **C. Collapsible rows** | Each filing has a long firm name + filer + amount + filing date; users normally only need amount + date until they drill in. |
| Officials/Candidates lists | `app/officials/page.tsx`, `app/candidates/page.tsx` | Already cards (PoliticianCard) — no table strategy, just fix card overflow per §10. | |

Affordances common to all three strategies: a 12 px bottom-shadow on horizontally-scrollable containers (cue the user) and `scroll-snap-type: x mandatory` for sticky-column tables.

---

## 8. Search autocomplete on mobile

**Decision:** **Full-screen overlay on `(base)`, constrained dropdown on `sm:`+.**

Rationale:
- Today's dropdown (`SearchBar.tsx:258–271`) clips off the right edge whenever the search input is right-aligned in the header. A full-screen overlay sidesteps the entire viewport-edge-detection problem.
- The search is the most valuable surface on a phone (researchers look up by name); a dedicated overlay also improves keyboard ergonomics (no header collision, autofocus works cleanly).

Spec for `(base)`:

- Tapping the search input opens a `position: fixed; inset: 0; z-50` panel with: a top bar `[← back][input][× clear]`, then results list filling the rest of the viewport.
- Input is `font-mono text-base`; results show level badge + name + office + party + score in a 1-row, 2-line layout (badge + name on row 1, office + score on row 2).
- Tap-target: each result row `min-h-[56px]`.
- Browser-back closes the overlay (push a history entry on open, pop on close).

For `sm:` and up: today's dropdown is fine once we add `right-auto` so it's left-anchored to the input rather than the parent flex container.

---

## 9. Matrix-rain mobile strategy

**Decision (tiered, not binary) — CONFIRMED 2026-04-24:**

| Viewport | Mode |
|----------|------|
| `(base)` (< 640 px) | **Static gradient backdrop** (CSS linear-gradient that *looks* like the rain — green-to-black with subtle vertical noise). No animation, no DOM nodes per column. |
| `sm:` (640–1023 px) | **Reduced rain**: 12 columns (vs 35), no `text-shadow`, animation `pause` when `IntersectionObserver` says the rain is off-screen. |
| `lg:` (≥ 1024 px) | **Current behaviour** (35 columns, full text-shadow). |
| Any viewport with `prefers-reduced-motion: reduce` | Static gradient backdrop, regardless of width. |

Rationale: keeping it on at all on `sm:` preserves the identity for Android tablets and large-format phones; killing it entirely below 640 px is the only honest path on a Moto G Power. The static gradient still reads as "matrix" — same colour palette, vertical motion implied.

The decision must be implemented in `TerminalHome.tsx` as a tiny render branch, not via CSS visibility, so the DOM nodes never exist in `(base)` mode (today's 420+ nodes are themselves a memory cost even when hidden).

---

## 10. Component inventory — single responsive vs. mobile variant

| Component | Strategy | Notes |
|-----------|----------|-------|
| `TerminalHeader.tsx` | **Single responsive** (with hamburger drawer subcomponent) | Drawer extracted as `MobileNavDrawer.tsx` for testability, but mounted from the same header. |
| `SearchBar.tsx` | **Single responsive** + new `SearchOverlay.tsx` for `(base)` | The overlay is a separate component because its state model (history-pushed, fixed-position) is different enough to warrant separation. |
| `PoliticianCard.tsx` | **Single responsive** | Header row goes from `flex` to `flex-col sm:flex-row`; corruption score becomes a chip above the name on `(base)`. |
| `ConnectionsGraph.tsx` (Cytoscape) | **Single responsive** with **mobile config branch** inside the existing component | `numIter: 600, animate: false, minZoom: 0.5` on `(base)`; detail overlay re-positioned to `bottom-2 inset-x-2` on `(base)`. |
| `SocialFeed.tsx` | **Single responsive** | Disable 30 s polling by default; add explicit "refresh" button. |
| `ShareDossier.tsx` | **Single responsive** | Iframe height: `h-[420px] sm:h-[420px]` becomes `h-[60vh] sm:h-[420px]`. |
| Juicebox tables | **Single component, two layouts** (CSS-only switch table↔card) | `<Leaderboard>` extracted; renders cards on `(base)`, table on `lg:`. |
| `USMap.tsx`, `ZipMap.tsx` (Leaflet) | **Single responsive**; consider `dynamic({ ssr: false })` already in place | Disable scroll-zoom by default on `(base)` (`scrollWheelZoom: false`); show a "tap to interact" overlay until the user taps. |
| `ConnectionsTree` (inside profile page) | **Single responsive** with `overflow-x: auto` wrapper and reduced indent on `(base)` (`pl-3` per level instead of today's varying `paddingLeft` math). | |
| `TerminalHome.tsx` matrix rain | **Conditional render branch** (see §9) | The only place where we accept a per-viewport render branch; everywhere else stays single-render with CSS. |

---

## 11. Identity preservation — what phone users still get

A pre-flight checklist for QA. If any of these are missing on mobile, the redesign has lost the brand:

- [ ] Matrix green (`#00FF41`) is the dominant accent on every page — buttons, active tabs, focus rings, big numbers.
- [ ] Body type is monospace on every screen, not a fallback sans.
- [ ] Live ticker on the homepage scrolls at the same 30 s cadence.
- [ ] Politician profile reads as a *dossier* — labelled fields, fixed-width values, terminal-style chrome.
- [ ] Dark background with no white surfaces. Modals and drawers use `bg-black/95 backdrop-blur`, not `bg-white`.
- [ ] Headlines stay uppercase + tracked.
- [ ] At least *some* motion remains on `sm:`+ (reduced matrix rain) — the page must not feel inert.

---

## 12. Tokens (delta from today)

To migrate inline styles incrementally (see PLAN Phase A), expose CSS custom properties that the existing inline-style code can adopt one component at a time before any rewrite:

```css
:root {
  /* Existing — keep */
  --terminal-green: #00FF41;
  --terminal-amber: ... ;
  --terminal-text: ... ;
  --terminal-text-dim: ... ;
  --terminal-border: ... ;

  /* NEW — add in Phase A so legacy inline styles can opt in */
  --space-page-x: 0.75rem;       /* 12 px (base) */
  --space-section-y: 1rem;       /* 16 px (base) */
  --tap-min: 44px;
  --type-body: 14px;
  --type-meta: 12px;
}

@media (min-width: 640px) {
  :root {
    --space-page-x: 1.5rem;      /* 24 px */
    --space-section-y: 1.5rem;
  }
}
@media (min-width: 1024px) {
  :root {
    --space-page-x: 2rem;        /* 32 px = today's 2rem */
    --space-section-y: 2rem;
  }
}
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}
```

Components migrated to Tailwind in later phases drop the custom-property reference.

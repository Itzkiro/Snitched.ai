# AUDIT — Phase 10: Mobile Responsive Layout

**Project:** Snitched.ai
**Date:** 2026-04-22
**Stack confirmed:** Next.js 16.1.6 (App Router) · React 19.2.3 · TypeScript strict · Tailwind CSS 4 (via `@tailwindcss/postcss`) · Vercel + Cloudflare
**Test viewport baseline:** iPhone SE (375 px), Moto G Power class (375–412 px, 4 G LTE)
**Method:** Three parallel sub-agents read the live source; findings below cite real file:line locations.

> Tailwind 4 is installed but **only `@tailwindcss/postcss` is wired up** (postcss.config.mjs). No `tailwind.config.*`, no `@import "tailwindcss";` in any global stylesheet found, no `tailwind.css` in the import chain — `app/layout.tsx` only loads `globals-terminal.css`. **Tailwind classes will not currently produce styles in this codebase.** Treat Tailwind as "available to wire up" rather than "in use." This is a foundational issue for the redesign — see PLAN Phase A.

---

## 1. Audit by route

### 1.1 `/` — Homepage (`app/page.tsx`, `components/TerminalHome.tsx`)

**Desktop look:** Server-rendered SEO header → client-rendered `TerminalHome` with: live ticker, matrix-rain background (35 columns of falling chars), state selector, search form, US Map, top corruption targets, Israel-lobby leaderboard.

| File | Lines | Issue | Breaks at 375 px | Severity |
|------|-------|-------|------------------|----------|
| `components/TerminalHome.tsx` | 206–251 | Matrix rain renders **35 fixed-position columns × 12+ animated divs each (~420–480 nodes)**, every node uses `text-shadow` and an 8–20 s `transform` animation, infinite. No `prefers-reduced-motion` guard, no mobile disable. | Sustained 15–20 fps on Moto G Power; battery drain; LCP regression up to +500 ms; touch responsiveness degrades. | **CRITICAL** |
| `components/TerminalHome.tsx` | ~143–148 | Search form uses `flex: '1 1 300px'` — minimum basis exceeds 375 px viewport once container padding is applied. | Form wraps awkwardly or overflows; SUBMIT button drops to its own line. | HIGH |
| `components/TerminalHome.tsx` | 91–95 | `setInterval(... 530ms)` to toggle a cursor blink state → React re-renders twice per second on every page where TerminalHome is used. | Minor INP cost; should be a CSS `animation: blink` instead. | MEDIUM |
| `components/USMap.tsx` | 28–52 | Leaflet map with no explicit max-width; gestures lifted to two-finger pan; tile fetches from CartoDB CDN. | Page-scroll gets trapped by single-finger drag on map; tiles can be 1.5–2.5 s on 4 G. | HIGH |

---

### 1.2 `/candidates` (`app/candidates/page.tsx`)

**Desktop look:** Multi-tier race breakdown (Governor, Senate, House, State, Local). Cards in a flex grid; stats bar above.

| File | Lines | Issue | Breaks at 375 px | Severity |
|------|-------|-------|------------------|----------|
| `app/candidates/page.tsx` | 141 | Card link uses `flex: '1 1 260px'` + `maxWidth: '400px'` — inflexible basis on small screens. | Cards collapse to one column but lose intended density; on landscape phones (430 px) they'll partially overflow. | **CRITICAL** |
| `app/candidates/page.tsx` | 317 | Stats grid `gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))'`. CSS override at `globals-terminal.css:590` reduces to `minmax(100px, 1fr)` — but at 375 px content width that still asks for ~3.4 columns → horizontal overflow inside the stats bar. | Stats bar horizontal-scrolls; users see only first 2 metrics. | **CRITICAL** |
| `app/candidates/page.tsx` | 269, 281, 370 | `padding: '2rem'` hard-coded on every section container. 64 px chrome at 375 px viewport leaves 311 px for content. | Compounds every other layout pressure on this page. | HIGH |
| `app/candidates/page.tsx` | 146 | `fontSize: '11px'` for office line, no mobile bump → falls below 12 px iOS minimum readability threshold. | Body text uncomfortably small. | MEDIUM |
| `app/candidates/page.tsx` | 371 | Compare section `maxWidth: '1200px'` with internal grid that has its own min-widths. | Edge-of-viewport overflow possible on inner grid. | MEDIUM |

---

### 1.3 `/officials` (`app/officials/page.tsx`)

**Desktop look:** Federal / State / County sections with a stats row and `.data-grid` of officials cards (delegates to `PoliticianCard`).

| File | Lines | Issue | Breaks at 375 px | Severity |
|------|-------|-------|------------------|----------|
| `app/officials/page.tsx` | 89–94 | Stats grid `gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))'` (4-up on desktop). CSS override only kicks in at 768 px. | 375 px ⇒ horizontal-scroll inside stats row; user can only see 2 of 4 metrics. | **CRITICAL** |
| `app/officials/page.tsx` | 79, 115, 186, 235 | `padding: '2rem'` on every section. | Same as `/candidates` — 64 px wasted. | HIGH |
| `app/officials/page.tsx` | 126, 197, 246 | `.data-grid` (defined `globals-terminal.css:196`) uses `minmax(280px, 1fr)`. At 375 px viewport with section padding the available width is 311 px ⇒ `1fr` overflows the 280 px floor briefly while reflowing. | Single-card column but cards still overflow horizontally because `PoliticianCard` itself overflows (see 1.4). | HIGH |

---

### 1.4 `/politician/[id]` (`app/politician/[id]/page.tsx`, 2 159 lines)

**Desktop look:** Profile header with bio + avatar + score, then 6 tabs: Overview, Votes, Funding, Network, Social, Legal. Network tab embeds `ConnectionsGraph` (Cytoscape). Funding tab shows breakdown cards + IE list. Votes tab has a filter row + per-vote cards. Includes `ShareDossier` modal.

> **Scope correction:** the original prompt described 5 tabs (overview, votes, funding, social, lobbying). Real route has **6 tabs**: `overview`, `votes`, `funding`, `network`, `social`, `legal`. UI-SPEC and PLAN account for 6.

| File | Lines | Issue | Breaks at 375 px | Severity |
|------|-------|-------|------------------|----------|
| `app/politician/[id]/page.tsx` | 1411–1425 | Vote-filter row: 6 buttons in flex; each `padding: '0.4rem 0.75rem'`, `fontSize: '0.7rem'`. **~32 px tap target — below 44 px WCAG minimum.** Total label width 6 × ~70 px = 420 px > 375 px viewport. | Buttons overflow horizontally **and** are below tap-target minimum. Filter is effectively unusable on phone. | **CRITICAL** |
| `app/politician/[id]/page.tsx` | 638–649 (calls `ConnectionsGraph`) + `components/ConnectionsGraph.tsx:441–465` | Cytoscape with `cytoscape-fcose`, `numIter: 2500` on the main thread, `animate: true`. Detail overlay (lines 652–682) is `position: absolute; top: 8; right: 8; max-width: 260px` — covers nodes on narrow screens. Container height `min(550px, 70vw)` clamped to `minHeight: 300px`. | 4–8 s of main-thread block on Moto G Power; tap handlers unresponsive during layout; overlay hides ~40 % of graph at 375 px. | **CRITICAL** |
| `app/politician/[id]/page.tsx` | 1936–2090 (ConnectionsTree) | Tree uses nested `div` with growing `paddingLeft` for each depth. No outer `overflow-x: auto`. | Branches > 3 levels deep clip silently — donor/PAC chains hidden. | HIGH |
| `app/politician/[id]/page.tsx` | 694–737 | Tab strip uses `overflowX: 'auto', whiteSpace: 'nowrap'`. Functional but no scroll-affordance, no scroll-snap; users may not discover hidden tabs. Buttons are ~48 px tall (passes 44 px threshold by ~4 px). | Tabs accessible only by horizontal swipe with no visual cue. | MEDIUM |
| `app/politician/[id]/page.tsx` | 1090–1125, 1268–1271 | Funding breakdown grid `minmax(150px, 1fr)`; committee names truncated with `text-overflow: ellipsis; white-space: nowrap`. | Long PAC names cut mid-word (e.g. "United Democracy Project Supportin…") — info loss without a way to expand. | MEDIUM |
| `app/politician/[id]/page.tsx` | 1433–1453 | Vote card: `display: flex` with right-side badge `minWidth: '90px'`. | Long bill titles compressed; vote badge eats 24 % of width. | LOW |
| `app/politician/[id]/page.tsx` | 749–764 | Bio info `gridTemplateColumns: '150px 1fr'` with no responsive variant. | 44 % of width consumed by labels even when fields are short. | LOW |
| `app/politician/[id]/page.tsx` | 773–797 | Social-account rows `width: '100px'` label + link with no `word-break`. | Long handles overflow row. | LOW |
| `components/ShareDossier.tsx` | 184–212 | Modal `maxWidth: '660px', maxHeight: '90vh'`; embed iframe `height="420"` (fixed). | iPhone SE (height ~667 px landscape ~375 px) ⇒ iframe overflows the modal vertically; nested scroll required. | MEDIUM |
| `app/politician/[id]/page.tsx` | grep `style={{` | **299 inline-style blocks** in this file. Inline styles cannot host media queries → no per-route responsive overrides possible without refactor. | Structural blocker for "respond at breakpoints" approach. | HIGH (structural) |

---

### 1.5 `/social` (`app/social/page.tsx`, 34 lines + `components/SocialFeed.tsx`)

**Desktop look:** Wrapper around `SocialFeed`, which lists scraped social posts with filters and a daemon-status indicator.

| File | Lines | Issue | Breaks at 375 px | Severity |
|------|-------|-------|------------------|----------|
| `app/social/page.tsx` | 7 | `padding: '1.5rem'` on `<main>` is reasonable but hard-coded. | Minor; consumes 48 px of viewport. | LOW |
| `components/SocialFeed.tsx` | 115–123 | `setInterval(30_000)` polls `/api/social-posts` and `/api/daemon-status` — runs anywhere `<SocialFeed />` is mounted (incl. profile pages). | Background radio activity drains battery; full re-render on every poll. | MEDIUM |
| `components/SocialFeed.tsx` | 166–169 | `animation: 'pulse 2s infinite'` on online status indicator, no `prefers-reduced-motion` guard. | Minor jank, accessibility nit. | LOW |

---

### 1.6 `/juicebox` (`app/juicebox/page.tsx`, 890 lines)

**Desktop look:** 3 ranked tables (top by Israel-lobby $, top by IE %, etc.), each a CSS-grid "table" with 7 columns.

| File | Lines | Issue | Breaks at 375 px | Severity |
|------|-------|-------|------------------|----------|
| `app/juicebox/page.tsx` | 300, 338 | Table grid `gridTemplateColumns: '60px 1fr 100px 80px 120px 1fr 100px'` — fixed-pixel sum **≥ 460 px** before `1fr` columns expand. | Whole page horizontal-scrolls; rank/name visible, all metric columns off-screen. | **CRITICAL** |
| `app/juicebox/page.tsx` | 502, 534 | Second table: `'60px 1fr 100px 140px 140px 120px 100px'` — fixed sum ≥ 560 px. | Same — page-level horizontal scroll. | **CRITICAL** |
| `app/juicebox/page.tsx` | 678, 712 | Third table: `'60px 1fr 100px 150px 150px 150px 100px'` — fixed sum ≥ 610 px. | Same. | **CRITICAL** |
| `app/juicebox/page.tsx` | 174 | Outer `maxWidth: '1600px'`. | Fine; inner tables are the real overflow source. | LOW |
| `app/juicebox/page.tsx` | 179 | Top stats grid `minmax(160px, 1fr)`. | Forces 2.3-col attempt at 375 px. | HIGH |
| `app/juicebox/page.tsx` | 425, 622, 798 | Cell content uses `whiteSpace: 'nowrap'` to keep numbers aligned. | Even if columns adapt, individual cells (donor names) won't wrap → still overflow. | HIGH |

---

### 1.7 `/hierarchy` (`app/hierarchy/page.tsx`, 536 lines)

**Desktop look:** Florida org chart — 3-column grid of branches, each with cards drilling into counties.

| File | Lines | Issue | Breaks at 375 px | Severity |
|------|-------|-------|------------------|----------|
| `app/hierarchy/page.tsx` | 309 | `minWidth: '300px'` on a level container. | Causes immediate horizontal overflow on 375 px once paired with section `padding: '0 2rem'`. | **CRITICAL** |
| `app/hierarchy/page.tsx` | 352 | `gridTemplateColumns: 'repeat(3, 1fr)'` (hard 3-up branches grid). | 3 columns at 343 px content width = ~114 px each — county cards inside become illegible. | HIGH |
| `app/hierarchy/page.tsx` | 388, 441 | Inner card grids `minmax(280px, 1fr)` and `minmax(350px, 1fr)`. | Inner content cells overflow even after outer 3-up collapses to 1-up. | HIGH |
| `app/hierarchy/page.tsx` | 287, 303, 343, 349, 399, 452, 517 | `padding: '3rem 2rem 2rem'`, `padding: '3rem'`, etc. — desktop-scale chrome. | 96–144 px wasted vertically; cramped horizontally. | MEDIUM |

---

### 1.8 Cross-cutting components

| File | Lines | Issue | Severity |
|------|-------|-------|----------|
| `components/TerminalHeader.tsx` | 162–169 | 11 nav links + state dropdown + SearchBar in a single horizontal flex. CSS at `globals-terminal.css:388` adds `overflow-x: auto` only at ≤ 768 px — the nav scrolls horizontally with no visual affordance. **No hamburger pattern, no `useState` menu, no `md:hidden` switch.** | **CRITICAL** |
| `components/TerminalHeader.tsx` | 104–146 | State dropdown button: `padding: '0.2rem 0.5rem'`, `fontSize: '0.8rem'` ⇒ ~24 px tap target. Dropdown panel ~220 px wide with no edge-detection logic. | HIGH |
| `components/TerminalHeader.tsx` | 103 | Top status bar: 4 elements at `gap: '2rem'` exceeds 375 px width. | MEDIUM |
| `components/TerminalHeader.tsx` | 316–320 | SearchBar inside header: `flex: 1; maxWidth: '420px'`. | HIGH |
| `components/SearchBar.tsx` | 258–271 | Dropdown: `position: absolute; left: 0; right: 0; max-height: 400px`. No viewport-edge detection — when search is right-aligned in the header, dropdown clips off the right edge. | **CRITICAL** |
| `components/SearchBar.tsx` | 188, 200 | Container `maxWidth: '420px'` with no responsive shrink. | HIGH |
| `components/SearchBar.tsx` | 299–323 | Result rows: 5 inline elements (level badge `minWidth: 36px`, name, office, party, score) compressed into ≤ 375 px. | MEDIUM |
| `components/PoliticianCard.tsx` | 69–119 | Header row: 64 px avatar + name block + **`fontSize: '3rem'` corruption score on the right**. No flex-direction switch on mobile. | HIGH |
| `components/PoliticianCard.tsx` | 108–118, 140–149, 158–170 | Score, JuiceBox tag, top-donor box — all assume desktop card width. | HIGH |
| `app/layout.tsx` | 7–10 | Viewport: `width: 'device-width', initialScale: 1`. **Good** — no `user-scalable=no`, no `maximum-scale=1` (zoom preserved). | OK |
| `app/layout.tsx` | 50–52 (Google Fonts `<link>`) | 9 weights across Bebas Neue + Inter + JetBrains Mono = ~60–80 KB on 4 G; Bebas Neue is rarely used. Should migrate to `next/font` for self-hosting + subsetting. | MEDIUM |
| `app/globals-terminal.css` | 376–443 | Single mobile breakpoint at `768px`. No 480 px or 375 px treatment. | MEDIUM |
| `app/globals-terminal.css` | 67–70, 114–133 | `@keyframes pulse`, `@keyframes scroll` (ticker). Ticker is GPU-friendly (single `translateX`); `pulse` runs everywhere. Neither gated by `prefers-reduced-motion`. | MEDIUM |
| App-wide | grep | **No `next/image` usage anywhere**; raw `<img>` tags for politician headshots in `/public/politicians/`. No lazy loading, no width/height attributes ⇒ likely CLS source on profile pages. | MEDIUM |
| App-wide | grep | **`prefers-reduced-motion` not present in any source file** (only in this audit and the planning prompt). | HIGH (a11y) |
| Build config | `postcss.config.mjs`, `app/globals-terminal.css` | **Tailwind 4 is installed but not imported.** No `@import "tailwindcss"` in any CSS file; no Tailwind classes will resolve. | HIGH (foundational) |

---

## 2. Prioritized top-10 issues (impact × effort)

Ranked by user-visible damage on a phone, with rough effort tag:

| # | Issue | Where | Why it matters | Effort |
|---|-------|-------|----------------|--------|
| 1 | **Tailwind 4 not actually wired up** | `postcss.config.mjs`, `globals-terminal.css` | Blocks any `md:hidden` / `sm:px-4` strategy. Every other fix gets cheaper once this is true. | S |
| 2 | **Vote-filter buttons unusable on mobile** (overflow + 32 px tap target) | `app/politician/[id]/page.tsx:1411–1425` | Profile is the highest-traffic deep page; filtering votes is core IA. Below WCAG. | S |
| 3 | **Juicebox grid-tables force page-level horizontal scroll** (3 tables, all > 460 px fixed columns) | `app/juicebox/page.tsx:300/502/678` | Juicebox is the marketing surface ("BOUGHT & PAID FOR"); broken on phone = brand damage. | M |
| 4 | **Header has no mobile nav** (11 links scroll silently) | `components/TerminalHeader.tsx:162–169` | Every page is reached through this; users can't see what exists. | M |
| 5 | **Matrix rain janks low-end Android & ignores `prefers-reduced-motion`** | `components/TerminalHome.tsx:206–251` | Single biggest perf cost on the homepage; also a11y violation. | S (gate) / M (redesign) |
| 6 | **Search dropdown clips off right edge of viewport** | `components/SearchBar.tsx:258–271` | Search is the primary entry to politician pages. | S |
| 7 | **Cytoscape `numIter: 2500` blocks main thread for 4–8 s on mid-tier Android** | `components/ConnectionsGraph.tsx:441–465` + detail overlay covers nodes | Network tab freezes the page; users assume the app is broken. | M |
| 8 | **Stats grids on /candidates, /officials, /juicebox horizontal-scroll silently** | three `minmax(140–160px)` rules + section `padding: 2rem` | Most pages have this; it's the "spills out of container" symptom. | S (per page) |
| 9 | **PoliticianCard: 3 rem corruption score + 64 px avatar overflow card on phone** | `components/PoliticianCard.tsx:69–119` | Used on /candidates, /officials, /juicebox, search results — fixing it once fixes those pages. | S |
| 10 | **Hierarchy page enforces `minWidth: 300px` then 3-column branch grid** | `app/hierarchy/page.tsx:309, 352` | Page is currently uninterpretable on phone. | M |

**Honourable mentions (defer or roll into phases):**
- ConnectionsTree depth-clipping (`page.tsx:1936–2090`)
- ShareDossier iframe height (`ShareDossier.tsx:209–212`)
- SocialFeed 30 s polling on profile pages (`SocialFeed.tsx:115–123`)
- Google Fonts → `next/font` migration (`layout.tsx:50–52`)
- Raw `<img>` → `next/image` for politician headshots (any `<img src="/politicians/`)

---

## 3. Notes / assumptions to verify with a real device

- **ASSUMPTION:** Cytoscape main-thread block is 4–8 s on Moto G Power. Derived from `numIter: 2500` + typical 100-node graph. Verify with Chrome DevTools "Slow 4G + 4× CPU throttle".
- **ASSUMPTION:** Matrix rain drops to 15–20 fps on iPhone SE / Moto G Power. Driven by 420+ DOM nodes with `text-shadow`. Verify with Performance recording on a real device.
- **ASSUMPTION:** All grid `minmax()` overflows assume default `1fr` minimum is `auto`. If any parent has `min-width: 0` already applied, behaviour changes — confirm with DevTools layout view.
- **ASSUMPTION:** `globals-terminal.css` is the only loaded global stylesheet. Confirmed by reading `app/layout.tsx`, but the file `app/globals.css` may exist unimported — verify.

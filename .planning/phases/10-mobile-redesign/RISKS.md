# RISKS — Phase 10: Mobile Responsive Layout

**Date:** 2026-04-22 (updated 2026-04-24 with product decisions)

> **Decisions locked 2026-04-24:**
> - **Matrix rain:** tiered strategy approved (gradient on `<640 px`, reduced rain on `640–1023 px`, full on `≥1024 px`, off when `prefers-reduced-motion`). See §1.1 below — closed.
> - **`/hierarchy`:** deprecated. Out of v1 mobile scope. Phase E ships only a "desktop-only" banner. See §3 Q1 — closed.
> - **Accessibility:** fix in Phase F as scoped. See §1.2 — closed.

---

## 1. Risks I can quantify and that need a product call

### 1.1 Matrix-rain on phones — keep, reduce, or kill? — **CLOSED 2026-04-24**

**Decision:** tiered strategy in UI-SPEC §9 is approved. Phase E implements gradient backdrop on `(base)`, reduced 12-column rain on `sm:`, full rain on `lg:`+, always off when `prefers-reduced-motion: reduce`.

**What's at risk:** brand identity vs. perf vs. battery. The audit confirms the rain is the single largest perf cost on the homepage (420+ animated DOM nodes, infinite, no `prefers-reduced-motion` guard). On a Moto G Power class device it almost certainly drops to 15–20 fps and adds measurable battery drain.

UI-SPEC §9 proposes a tiered solution: **gradient backdrop on phones, reduced rain on tablets, full rain on desktop, always-off when `prefers-reduced-motion: reduce` is set.** That's my recommendation. The "kill it on phones" half of that proposal is the contentious one — I'd like product confirmation before Phase E.

| Option | Pro | Con |
|--------|-----|-----|
| **Static gradient on `(base)`** (recommended) | Solves the perf problem completely, preserves the colour identity | Phones lose the motion that's part of the "live terminal" feel |
| Reduced 12-column rain on `(base)` | Some motion preserved | Still costs 150+ animated nodes; still risky on Moto G; perf gain marginal |
| Full rain on `(base)` | Identity 100 % preserved | Site is functionally broken on mid-tier Android — LCP regression and battery drain visible to users |

---

### 1.2 Accessibility — fix now or defer? — **CLOSED 2026-04-24**

**Decision:** fix now, in Phase F as scoped (~8–12 h).

**What's at risk:** the site currently has effectively zero accessibility — no `aria-*` attributes anywhere, no skip-links, no `focus-visible` rings, no `prefers-reduced-motion` guards, no semantic landmarks. The PLAN puts a real a11y pass into Phase F (~8–12 h). Doing it as a separate phase **after** the redesign costs more (every component touched twice) but lets us ship phase B–E faster.

**Recommendation:** **fix now, in Phase F as scoped.** Reasons:
- The redesign is touching most components anyway — if we don't add `aria-label`s and `role="navigation"` while we're in the file, we'll never come back.
- Snitched.ai's audience explicitly includes researchers, journalists, and citizens — at least some of whom will use screen readers. The site investigates corruption; it shouldn't itself be inaccessible.
- WCAG compliance is increasingly a legal exposure for public-facing US sites; the cost to add basic compliance now is small compared to the cost of an ADA complaint later.

---

### 1.3 SEO and mobile-first indexing — open (no blocker)

**What's at risk:** Google's mobile-first indexing means the *mobile* render is what gets indexed. A few specific concerns from the audit:

- The homepage's matrix-rain element is `position: fixed; z-index: 0; pointer-events: none` and contains real text words ("AIPAC", "$$$", "FRAUD", "ISRAEL", etc.). Google's renderer **will index this content**. If we replace it with a gradient on mobile, the indexed text changes.
  - **Likely impact:** small but non-zero. Those words don't seem to be SEO targets per the existing content; verify with Search Console.
- The juicebox tables today render as text (CSS-grid, not images), so converting to cards preserves indexability — no SEO concern there.
- The hamburger drawer must be in the rendered HTML at server-render time, not lazy-loaded. Otherwise nav links disappear from the indexed page. Phase B PLAN already implies this (drawer is a regular component, not dynamically imported).
- `next/font` migration in Phase A doesn't affect indexability.
- `<img>` → `next/image` migration (mentioned as "honourable" in AUDIT) **would** improve indexing for the image search vertical because `next/image` adds `width`/`height`/`loading` attributes Google likes. Worth a follow-up phase.

**Recommendation:** before merging Phase E, run the URL Inspection tool in Search Console on `/` and confirm the rendered HTML still contains the politician names and key headlines. No code changes needed — just a check.

**Decision needed:** none, unless product knows of specific keywords driving traffic that include matrix-rain text.

---

## 2. Risks I can't fully quantify until we have a real device or real numbers

### 2.1 Cytoscape mobile config — visual & behavioural drift

The PLAN reduces `numIter` from 2500 to 600 and turns off layout animation on `(base)`. This is necessary for perf — but it means the graph layout will look *slightly* different than today's. Researchers who've taken screenshots and shared them externally will see different node positions. Not a functional regression, but worth flagging.

**Mitigation:** the `?legacy_graph=1` flag (PLAN Phase C) lets a user fall back. We can also pin a `seed` for fcose to make layouts deterministic across runs.

### 2.2 Inline-style migration — silent visual regressions

Even with the per-component-only migration rule, every Tailwind class swap is an opportunity for a subtle visual change (e.g. `padding: '0.6rem 1.25rem'` becomes `px-5 py-2.5` which is `20px 10px`, not `20px 9.6px`). Visual-regression tests in Phase F catch the obvious cases at 1280 px, but a 1 % pixel diff threshold is loose.

**Mitigation:** keep the threshold at 1 % for build-pass, but require human review of any failing snapshot, and run the test suite at *both* 1280 px and 375 px in Phase F (currently scoped only at 1280 px to guard the non-regression goal — but adding 375 px snapshots costs only minutes).

### 2.3 Leaflet on iOS Safari — touch event delegation

Leaflet has a long history of swallowing touch events on iOS — pages with maps near the top get "stuck" because the user's swipe registers as a map drag. PLAN Phase E disables `scrollWheelZoom` and adds a tap-to-interact overlay, but I haven't verified this fully solves it on the latest iOS. May need an extra "drag to scroll, tap to zoom" gesture pattern.

**Mitigation:** test on a real iPhone in Phase E acceptance.

### 2.4 SocialFeed default-off polling — surfacing fresh data

PLAN Phase E proposes default-off auto-polling on mobile. The implication: a mobile user opening `/social` sees a snapshot, not a live feed, until they tap "Refresh." If "live feed" is part of the product pitch (the homepage ticker implies it is), product may want to keep auto-polling on but reduce the cadence (e.g. 2 minutes instead of 30 s).

**Decision deferred to product.**

---

## 3. Open questions

### Question 1 — *Is `/hierarchy` deprecated?* — **CLOSED 2026-04-24: yes, deprecated.**

Out of v1 mobile scope. PLAN Phase E ships only a "desktop-only" banner (~XS effort). All mobile layout work on this route is dropped.

### Question 2 — *Is monetization or a paywall planned in v1?* — open

If yes, paywall placement (modal vs. inline gate) materially affects mobile layout — we'd want to design the paywall surface as part of this phase, not bolt it on later. Memory shows no paywall yet. Non-blocking; flag if it changes during execution.

### Question 3 — *Is the matrix-rain "live" content (the literal words "AIPAC", "FRAUD", "$$$") part of the SEO/brand strategy, or purely visual?* — open (low priority)

Decided trade-off via §1.1 closure (gradient on phones approved). Still worth a Search Console spot-check before merging Phase E to confirm no indexed traffic depends on those words appearing in the mobile render.

---

## 4. Risk summary table

| # | Risk | Likelihood | Impact | Mitigated by | Needs product input? |
|---|------|------------|--------|--------------|----------------------|
| 1 | Matrix rain hurts mobile perf if not gated | High | High | UI-SPEC §9 tiered strategy + `prefers-reduced-motion` | Closed (tiered approved) |
| 2 | Site stays inaccessible after redesign | Medium | High (legal + UX) | PLAN Phase F a11y pass | Closed (Phase F approved) |
| 3 | Mobile-first indexing changes due to gradient swap | Low | Medium | Phase E + Search Console spot-check | No (spot-check only) |
| 4 | Cytoscape layout looks visibly different on phone | Medium | Low | `?legacy_graph=1` flag + fcose seed | No |
| 5 | Tailwind migration introduces silent pixel drift | Medium | Low | Visual regression at 375 + 1280 in Phase F | No |
| 6 | Leaflet still traps touches after `scrollWheelZoom: false` | Medium | Medium | Real-device QA in Phase E | No |
| 7 | Default-off polling reduces "liveness" of /social | Low | Medium | Configurable cadence | Maybe (§2.4) |
| 8 | Hierarchy page eats engineer time on a low-traffic route | — | — | Closed: dropped from v1 (banner only) | Closed |

---

**Bottom line:** all three blocking product questions answered. The plan is fully unblocked for execution. Remaining open items (§2.4 polling cadence, §3 Q2 paywall) are non-blocking and can be revisited mid-execution if product priorities shift.

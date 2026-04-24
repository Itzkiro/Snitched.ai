# Phase 10: Mobile Responsive Layout - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-24
**Phase:** 10-mobile-redesign
**Areas discussed:** Scope routing (single question — user chose to convert existing artifacts rather than run interactive gray-area discussion)

---

## Session Metadata

The phase already had four artifacts created 2026-04-22 and locked 2026-04-24:
- `UI-SPEC.md` (DRAFT v1) — design contract
- `PLAN.md` — 6-phase (A–F) engineering breakdown
- `RISKS.md` — risk register with three product decisions closed
- `AUDIT.md` — route-by-route mobile audit with file:line citations

These pre-date the canonical GSD `discuss-phase` flow. The session's only interactive decision was whether to re-open the gray areas or treat the existing artifacts as the decision record.

---

## Scope Routing

| Option | Description | Selected |
|--------|-------------|----------|
| Convert existing decisions to CONTEXT.md | Distill UI-SPEC + PLAN + RISKS + AUDIT into canonical CONTEXT.md. Preserve existing work verbatim. Downstream planner replans the 6 phase-PRs into GSD-format numbered plans. | ✓ |
| Discuss narrow remaining gray areas | Interactively resolve the 3–4 open items (SocialFeed polling cadence, feature-flag lifecycle, visual-regression threshold, min test viewport). Then write CONTEXT.md. | |
| Full discuss-phase from scratch | Ignore existing artifacts; ask 4+ gray areas fresh (nav pattern, tabs, tables, search) as if starting over. | |

**User's choice:** Convert existing decisions to CONTEXT.md
**Notes:** The user had already run a full manual discovery + design + planning pass before the GSD discuss-phase existed for this phase. RISKS.md explicitly declares: "all three blocking product questions answered. The plan is fully unblocked for execution." Re-asking gray areas would have been redundant.

---

## Closed Product Decisions (carried forward from RISKS.md, locked 2026-04-24)

These are captured as decisions D-19, D-26, D-27 in CONTEXT.md. Preserved here for audit of alternatives considered:

### Matrix rain on phones (RISKS §1.1)

| Option | Pro | Con | Selected |
|--------|-----|-----|----------|
| Static gradient on `(base)` | Solves perf problem completely, preserves color identity | Phones lose motion that's part of "live terminal" feel | ✓ (for `(base)`) |
| Reduced 12-column rain on `(base)` | Some motion preserved | Still costs 150+ animated nodes; still risky on Moto G | (used for `sm:` band only) |
| Full rain on `(base)` | Identity 100% preserved | Site functionally broken on mid-tier Android — LCP regression + battery drain | |

**Final:** Tiered strategy — gradient on `(base)`, reduced rain on `sm:`, full rain on `lg:+`, always off when `prefers-reduced-motion: reduce`.

### Accessibility timing (RISKS §1.2)

| Option | Pro | Con | Selected |
|--------|-----|-----|----------|
| Fix now in Phase F (~8–12h) | Redesign touching components anyway; one-pass cheaper; reduces ADA exposure | Adds ~10h to phase | ✓ |
| Defer to separate later phase | Ships B–E faster | Every component touched twice; easy to never come back | |

**Final:** Fix now, in Phase F as scoped.

### `/hierarchy` on mobile (RISKS §3 Q1)

| Option | Description | Selected |
|--------|-------------|----------|
| Deprecate from v1 mobile — ship "desktop-only" banner | Admits low-traffic power-user route; saves ~2h | ✓ |
| Design full mobile layout for the hierarchy view | Full parity | Engineer time on a low-traffic route; not v1 priority | |
| Kill `/hierarchy` entirely | Cleanup | Separate product decision, outside this phase | |

**Final:** Deprecated. Phase E ships only the banner.

---

## Claude's Discretion

Areas where the user explicitly left implementation detail to the executor (captured in CONTEXT.md `<decisions>` section under "Claude's Discretion"):
- Exact Tailwind class choices per component (as long as they match the `p-3 sm:p-6 lg:p-8` spacing rule and the typography scale in D-44)
- Whether `SearchOverlay.tsx` reuses helpers inline or via an extracted `lib/search-helpers.ts` module
- Cytoscape `fcose` seed value for deterministic layouts across runs
- Per-component inline-style conversion ordering within each phase's scope
- Whether the right-edge gradient on the tab strip uses a pseudo-element or a sibling `<div>` with `pointer-events-none`
- Concrete CSS-tokens-vs-Tailwind-theme split (which values stay as `--var()` vs get promoted to `tailwind.config.ts` theme keys)

## Deferred Ideas (non-blocking open items)

Carried forward to CONTEXT.md `<deferred>` section — revisitable mid-execution or in future phases:
- Paywall / monetization surface design — no v1 paywall; if introduced, new phase
- SocialFeed polling cadence tuning — default-off accepted; reconsider 2-min cadence if "liveness" feels diminished
- `<img>` → `next/image` migration — separate follow-up phase candidate
- Killing `/hierarchy` entirely — separate product decision
- A/B test infrastructure — out of scope
- Visual regression at 375px — current spec 1280px only; add 375px later
- Expanded admin surfaces (`/intel`, `/admin`, `/embed`, `/tools`) mobile — out of v1 scope

---

*Generated: 2026-04-24*
*Session type: Artifact consolidation (no interactive gray-area discussion).*

# Planning prompt — Mobile-first redesign for Snitched.ai

> Paste this into a fresh Claude Code session at the repo root, or use with `/gsd:discuss-phase`
> followed by `/gsd:ui-phase` and `/gsd:plan-phase`.

---

## Role

You are a senior frontend architect paired with a mobile-UX designer. Your job is to produce an
implementation plan that turns Snitched.ai from a desktop-only terminal aesthetic into a site that
works cleanly on phones without losing its "hacker terminal / public records dossier" visual identity.

## Context (treat as ground truth — verify with Read/Grep before assuming)

**Project:** Snitched.ai — a citizen-research platform for Florida politicians (FEC funding, Israel
lobby ties, voting records, corruption scores). Data is real and sourced from public APIs; this is
not a toy dataset.

**Stack:**
- Next.js 16.1.6 (App Router), React 19.2.3, TypeScript strict, Tailwind CSS 4
- Hosted on Vercel (serverless) behind Cloudflare (UAM + WAF — already configured)
- Supabase PostgreSQL for persistence; JSON fallback in `/data-ingestion`
- External APIs: FEC, Congress.gov, LegiScan, LDA

**Current UI reality (inspect before planning):**
- `/app/page.tsx` — homepage with live ticker, matrix rain, key stats
- `/app/candidates/page.tsx`, `/app/officials/page.tsx` — politician grid/list
- `/app/politician/[id]/page.tsx` — profile w/ tabs: overview, votes, funding, social, lobbying
- `/app/social/page.tsx` — scraped social media feed
- `/app/juicebox/page.tsx` — corruption dashboard/visualization
- `/app/hierarchy/page.tsx` — org chart
- `/components/TerminalHeader.tsx`, `/components/SearchBar.tsx`, `/components/PoliticianCard.tsx`

**Known stylistic constraints the redesign MUST preserve:**
- Matrix-green (`#00FF41`) on near-black background
- Terminal / monospace typography
- "Dossier card" aesthetic for politician profiles
- Live-feed ticker motion on the homepage

**Known code smells to be aware of (read the files to confirm):**
- Components use **inline styles everywhere** — no global stylesheet, no CSS modules
- No media queries present in any component
- No `aria-*`, no `role=`, no skip-links, no focus rings
- Matrix rain is implemented as absolutely-positioned animated divs — likely janks phones
- Wide data tables (FEC contributions, voting records) assume viewport ≥1024px
- Tabs on `/politician/[id]` are a horizontal row — likely overflow on phone
- `TerminalHeader.tsx` has fixed-pixel spacing / no hamburger pattern
- Search autocomplete dropdown uses absolute positioning without viewport-edge detection

## What the user sees that's "bizarre" on phone (what we're solving)

Assume the user's complaint covers at minimum:
- Horizontal scroll on most pages
- Typography too small or spills out of container
- Politician profile tabs unreadable / untappable
- Search dropdown falls off-screen
- Matrix rain stuttering / draining battery
- Tables of contributions / votes unreadable
- CTAs and interactive elements below the 44×44 px touch-target minimum

Before committing to the plan, **open the repo and inspect the actual files** — don't trust this
list alone, supplement it with issues you find.

## Goals

1. **Phone usable (primary):** iPhone SE width (375 px) and modern Android (~412 px) render every
   page without horizontal scroll, readable at arm's length, all taps hit intended targets.
2. **Aesthetic preserved:** The terminal / matrix / dossier identity survives on mobile — it
   should still feel like Snitched.ai, not a generic responsive site.
3. **Performance acceptable:** LCP <2.5 s on mid-tier Android (Moto G Power class) over 4G; the
   matrix rain either runs smoothly or degrades gracefully.
4. **No regression on desktop:** Existing desktop experience at ≥1280 px viewport must look
   identical post-change (or better).

## Non-goals (do NOT plan these)

- Rewriting the data layer, adding GraphQL, swapping Supabase.
- Adding authentication or user accounts.
- Building a native iOS/Android app. This is a responsive web redesign only.
- Redesigning the Matrix/terminal identity itself. Scope is adaptation, not reinvention.
- Changing cron jobs, social-media daemon, or FEC sync logic.

## Deliverables (produce all of these in `.planning/phases/NN-mobile-redesign/`)

1. **Audit report (`AUDIT.md`)**
   - For each of the 8 routes listed above, a section with:
     - Screenshot description of current desktop look
     - Specific mobile breakage (reference file + line numbers)
     - Severity: CRITICAL / HIGH / MEDIUM / LOW
   - Prioritized issue list (top 10 things to fix, ranked by user impact × implementation effort).

2. **UI-SPEC.md (mobile design contract)**
   - Breakpoints (recommend `sm: 640, md: 768, lg: 1024, xl: 1280`, justify with content).
   - Typography scale (mobile vs desktop) — monospace stack, sizes, line-heights.
   - Spacing scale (use 4 px base).
   - Touch-target minimum (44 × 44 px enforced).
   - Navigation pattern on mobile: hamburger? bottom tab bar? drawer? — decide with rationale.
   - Politician profile tab pattern: convert to accordion, segmented control, or sticky tab bar? — decide.
   - Data table strategy: horizontal scroll w/ shadow affordance, card-per-row, or collapsible rows? — decide per table.
   - Search autocomplete: full-screen overlay on mobile, or constrained dropdown? — decide.
   - Matrix rain mobile strategy: reduce density, pause off-screen, disable on `prefers-reduced-motion`, or kill entirely below some viewport. — decide.
   - Component inventory: which components need mobile variants vs a single responsive implementation.

3. **Implementation plan (`PLAN.md`)**
   - Ordered phases (Phase A: foundational responsive scaffolding → Phase B: nav + header → Phase C: profile pages → Phase D: data tables → Phase E: social/dashboard → Phase F: polish + a11y).
   - For each phase: list of files touched, estimated size (S/M/L), dependencies on other phases.
   - **Migration strategy for inline styles** — is it Tailwind-first, CSS modules, or a tokens-based refactor? Decide and justify. Do NOT rip out all inline styles at once; propose incremental migration.
   - Testing strategy: which pages get Playwright mobile viewport tests, which rely on manual QA.
   - Rollback plan: feature flag? Vercel preview? A/B?

4. **Risks & open questions (`RISKS.md`)**
   - Things you couldn't decide without product input.
   - Matrix rain performance risk — can it be kept on mobile at all?
   - Accessibility: site currently has ~zero a11y. Is this redesign the moment to fix
     (recommended) or do we defer?
   - SEO: mobile-first indexing — any routes currently not indexable on mobile that we need to be
     careful about?

## Success criteria (how we'll know the plan is good)

- [ ] Every route listed above has an explicit mobile treatment.
- [ ] No handwaving — "use Tailwind responsive classes" is not a plan. Name the classes or name the pattern.
- [ ] The plan can be handed to a mid-level engineer and executed without further design input on ~80% of cases.
- [ ] Trade-offs are stated explicitly (e.g., "we drop the matrix rain below 640 px — acceptable because…").
- [ ] Each Phase in `PLAN.md` is scoped to fit in a single PR.

## Working instructions for this session

1. **Start by reading, not writing.** Spend the first phase of your work using Read/Grep/Glob on:
   - `/app/page.tsx`, `/app/politician/[id]/page.tsx`, `/app/candidates/page.tsx`
   - `/components/TerminalHeader.tsx`, `/components/SearchBar.tsx`, `/components/PoliticianCard.tsx`
   - `/package.json` to confirm Tailwind 4 config and version
   - `/postcss.config.mjs` and any `tailwind.config.*`
   Only THEN draft the audit — so the audit is grounded in real line numbers.

2. **Use parallel sub-agents** (per `~/.claude/rules/common/agents.md`) to:
   - Agent 1: mobile UX review of public pages (homepage, candidates, officials)
   - Agent 2: deep-dive on politician profile page (most complex route)
   - Agent 3: performance analysis of matrix rain + animation overhead
   Merge findings into the single AUDIT.md.

3. **Do NOT start implementing.** This session's output is planning artifacts only — produce the
   four .md files listed under Deliverables. If the user asks to implement, push back and
   recommend running `/gsd:execute-phase` against the completed plan.

4. **Assumptions must be flagged.** If you're guessing about current behavior, say "ASSUMPTION:"
   and note what you'd verify with a screenshot/device test.

5. **Ask at most 3 clarifying questions** at the end of your first response if you genuinely need
   product input (e.g., "Is the hierarchy page deprecated?", "Is monetization planned — does that
   affect mobile layout?"). Otherwise, proceed.

## Output format

Start with a 1-paragraph restatement of the problem in your own words. Then produce the four
deliverables above, each in its own section with a markdown heading. End with a list of
clarifying questions (if any). Use the todo list to track progress across the four deliverables.

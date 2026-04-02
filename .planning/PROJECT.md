# Snitched.ai

## What This Is

A citizen research platform for investigating corruption and foreign influence among Florida politicians. Users can look up any candidate or current officeholder and see real FEC funding data, Israel lobby connections, voting records, lobbying ties, and a data-driven corruption score — all sourced from public records, not opinions.

## Core Value

Every politician's funding and financial data must be real, complete, and verifiable — citizens can't make informed decisions from placeholder data.

## Requirements

### Validated

- ✓ 188 Florida politicians tracked (30 federal, 158 state/county) — existing
- ✓ FEC data pipeline for 30 federal politicians — just fixed and synced
- ✓ Israel lobby / AIPAC detection (PAC + Independent Expenditures) — just fixed
- ✓ Daily FEC cron job configured (3 AM UTC) — just rewritten
- ✓ Corruption score algorithm (5-factor weighted model) — existing
- ✓ Terminal/Bloomberg visual design — existing
- ✓ Vercel deployment with cron jobs — existing

### Active

- [ ] Funding tab shows real, complete data for all federal politicians
- [ ] Financial breakdown (PAC, individual, corporate, Israel lobby) is accurate
- [ ] Independent Expenditures visible in politician detail view
- [ ] Corruption score uses real data (not PLACEHOLDER) for all available factors
- [ ] County officials have real funding data (FL Division of Elections)
- [ ] State legislators have real funding data (FL Division of Elections)
- [ ] Politician detail page financial tab is fully functional
- [ ] All "PHASE 2 COMING SOON" placeholders replaced with real features or removed
- [ ] Mobile-responsive layout
- [ ] Remove fake "LIVE" OSINT feed or make it real

### Out of Scope

- Real-time chat — not core to research mission
- Video content — storage/bandwidth, defer
- OAuth login — no user accounts needed for public data
- Mobile native app — web-first

## Context

- Brownfield Next.js 16 + React 19 + Supabase + Vercel project
- Codebase mapped at `.planning/codebase/` (7 documents)
- FEC data just synced for all 30 federal politicians (was broken, now fixed)
- Hardcoded Supabase service role JWT was in 8 script files (now fixed, needs key rotation)
- 0% test coverage, no CI, no linting
- Code quality audit scored 3.5/10
- County officials have fabricated corruption scores with no data source
- 3 of 5 corruption score factors use PLACEHOLDER_SCORE = 30
- No `/api/politicians/[id]` endpoint — every page fetches all 400+ politicians
- `dashboard.html` exposes internal details publicly

## Constraints

- **Data sources**: FEC API (federal), FL Division of Elections (state/local), LegiScan (votes), LDA (lobbying)
- **Rate limits**: FEC 1K req/hr, LegiScan 30K/month
- **Hosting**: Vercel serverless (5 min max function duration)
- **Budget**: Free tier Supabase + Vercel
- **Security**: Supabase service role key needs immediate rotation

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use env vars for all credentials | 8 scripts had hardcoded JWT | ✓ Good |
| Rewrite FEC cron with full coverage | Old cron missed IEs, multi-cycle, pagination | ✓ Good |
| Keep terminal/Bloomberg aesthetic | Coherent, distinctive design | — Pending |
| Supabase as primary DB | Already integrated, free tier sufficient | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-02 after initialization*

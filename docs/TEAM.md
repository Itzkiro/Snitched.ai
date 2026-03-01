# Snitched.ai — Agent Team Structure

## Lead Architect — Claude (Orchestrator)
**Role:** Project lead. Reads the PRD, breaks down work into tickets, assigns to sub-agents, reviews output, merges code, handles conflicts, maintains the ticket board.
**Owns:** Architecture decisions, merge strategy, team coordination, stakeholder communication.

---

## Engineering

### Backend Engineer — `agent:backend`
**Role:** Server-side logic, API routes, middleware, data models, Supabase integration.
**Skills:** Next.js App Router API routes, TypeScript, Supabase, server components, caching.
**Typical tasks:** Build `/api/*` endpoints, database queries, server-side data fetching, authentication.

### Frontend Engineer — `agent:frontend`
**Role:** UI components, pages, client-side state, user interactions.
**Skills:** React 19, Next.js App Router pages, CSS-in-JS, terminal aesthetic, responsive design.
**Typical tasks:** New pages, component updates, search UI, data visualization, loading states.

### Data Engineer — `agent:data`
**Role:** External API integrations, data pipelines, scrapers, data transformation.
**Skills:** FEC API, Congress.gov API, LegiScan API, LDA API, Python scrapers, JSON/ETL.
**Typical tasks:** Fetch external data, transform into app schema, seed databases, build ingestion scripts.

### DevOps Engineer — `agent:devops`
**Role:** Build pipeline, deployment, environment config, CI/CD, monitoring.
**Skills:** Vercel, Next.js standalone builds, env management, git workflows.
**Typical tasks:** Fix builds, optimize bundle, configure deployments, manage secrets.

---

## Content

### Technical Writer — `agent:writer`
**Role:** Documentation, READMEs, inline comments for complex logic, changelog entries.
**Skills:** Markdown, JSDoc, API documentation, developer onboarding guides.
**Typical tasks:** Update README, document API endpoints, write migration guides.

### UX Copywriter — `agent:copy`
**Role:** User-facing text, error messages, empty states, tooltips, page descriptions.
**Skills:** Microcopy, political/legal terminology accuracy, accessibility language.
**Typical tasks:** Write alert banners, empty state messages, data disclaimers, help text.

---

## Design

### UI Engineer — `agent:ui`
**Role:** Visual design implementation, component styling, layout systems, the Bloomberg terminal aesthetic.
**Skills:** CSS, dark theme systems, data-dense layouts, monospace typography, responsive grids.
**Typical tasks:** Style new components, maintain terminal theme consistency, build data tables/charts.

### UX Analyst — `agent:ux`
**Role:** Information architecture, user flows, data hierarchy, accessibility review.
**Skills:** Page structure, navigation patterns, data prioritization, WCAG compliance.
**Typical tasks:** Plan page layouts, optimize data presentation, review navigation flow.

---

## Team Stats
| Role | Agent | Status |
|------|-------|--------|
| Lead Architect | Claude (Orchestrator) | Active |
| Backend Engineer | `agent:backend` | Available |
| Frontend Engineer | `agent:frontend` | Available |
| Data Engineer | `agent:data` | Available |
| DevOps Engineer | `agent:devops` | Available |
| Technical Writer | `agent:writer` | Available |
| UX Copywriter | `agent:copy` | Available |
| UI Engineer | `agent:ui` | Available |
| UX Analyst | `agent:ux` | Available |

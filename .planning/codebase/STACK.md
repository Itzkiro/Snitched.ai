# Technology Stack

**Analysis Date:** 2026-04-22

## Languages

**Primary:**
- **TypeScript** ^5 (strict mode) — Next.js application code (`app/`, `components/`, `lib/`), data-sync scripts (`scripts/`), and data-ingestion utilities (`data-ingestion/`). Configured with `strict: true`, `target: ES2017`, `module: esnext`, `moduleResolution: bundler` in `tsconfig.json`.
- **TypeScript/TSX** ^5 — React 19 components using the `react-jsx` runtime.
- **JavaScript** (ES modules) — A handful of seed scripts such as `scripts/seed-california-county-officials.js` and `scripts/seed-michigan-county-officials.js`, plus `postcss.config.mjs`.

**Secondary:**
- **Python** ≥3.x — Web scrapers and OSINT tooling under `scrapers/` (e.g. `scrapers/scrape-social-media.py`, `scrapers/scrape-ohio-campaign-finance.py`, `scrapers/enrich-oh-ballotpedia.py`, `scrapers/db_helper.py`). Dependencies defined in `scrapers/requirements.txt`.
- **SQL (PostgreSQL)** — Supabase schema and migrations in `supabase/schema.sql`, `supabase/connections-schema.sql`, and `supabase/migrations/001…004_*.sql`.
- **Bash** — Helper scripts, e.g. `scripts/research-fl-candidates.sh`, `scripts/save-cf-token.sh`.

## Runtime

**Environment:**
- **Node.js** — Developer machine is on `v24.12.0` (detected via `node --version`). Upstream dependencies in `package-lock.json` generally require `node >=18`. Vercel serverless runs the Next.js App Router in a Node runtime.
- **Browser runtime** — React 19 client components (e.g. `components/ConnectionsGraph.tsx`, `components/USMap.tsx`, `components/ZipMap.tsx`) rely on DOM APIs; most pages are React Server Components by default.
- **Python runtime** — Invoked manually for scrapers (`python scrape-social-media.py …`) and by the social-media daemon (`scripts/social-media-daemon.ts` → spawns Python scripts).

**Package Manager:**
- **npm** (inferred from presence of `package-lock.json`, 101KB). No `pnpm-lock.yaml` or `yarn.lock`.
- Lockfile: `package-lock.json` present and committed.
- **tsx** ^4.21.0 is the non-Next TypeScript runner used for `scripts/`, `scrapers/` (when TS), and `data-ingestion/` (all excluded from Next.js compilation per `tsconfig.json`).
- **pip** / `requirements.txt` for Python scraper dependencies (`scrapers/requirements.txt`).

## Frameworks

**Core:**
- **Next.js** 16.1.6 — Full-stack React framework. App Router (`app/` directory), API routes (`app/api/**/route.ts`), and Vercel Cron integration. Configured via `next.config.ts` (only tweak: `outputFileTracingIncludes` to bundle `data/pro-israel-donors-*.csv` for `/api/cron/refresh-gallrein-roster`).
- **React** 19.2.3 + **React DOM** 19.2.3 — UI layer; uses `react-jsx` automatic runtime (configured in `tsconfig.json`).

**Testing:**
- Not detected — no `jest.config.*`, `vitest.config.*`, Playwright test runner config, or `*.test.*` / `*.spec.*` files found. `playwright` ^1.59.1 is installed but used only for scraping (`scripts/probe-oh-sos-*.ts`, `scripts/fetch-oh-sos-bulk.ts`, `scripts/scrape-vivek-oh-sos-*.ts`), not for E2E tests.

**Build/Dev:**
- **Next.js build** — `npm run build` → `next build`; `npm run dev` → `next dev`; `npm start` → `next start` (see `package.json` scripts).
- **Tailwind CSS** ^4 via `@tailwindcss/postcss` plugin — single-file PostCSS config at `postcss.config.mjs`. No `tailwind.config.*` (Tailwind v4 zero-config pattern).
- **TypeScript compiler** — `tsconfig.json` with `noEmit: true` (Next owns emit). Incremental build file: `tsconfig.tsbuildinfo`.
- **tsx** ^4.21.0 — Runtime execution of TypeScript in `scripts/`, `data-ingestion/`, `scrapers/`. Invoked as `npx tsx scripts/<name>.ts` in many script headers.

## Key Dependencies

**Critical (production `dependencies`):**
- `next` 16.1.6 — App Router, API routes, Vercel integration.
- `react` 19.2.3, `react-dom` 19.2.3 — UI layer.
- `cytoscape` ^3.33.2 + `cytoscape-fcose` ^2.2.0 + `@types/cytoscape` ^3.21.9 — Interactive donor–politician network graph in `components/ConnectionsGraph.tsx` (fcose layout registered client-side).
- `leaflet` ^1.9.4 + `react-leaflet` ^5.0.0 + `@types/leaflet` ^1.9.21 — Map-based visualizations in `components/USMap.tsx` and `components/ZipMap.tsx`.
- `dotenv` ^17.4.0 — Env loading for non-Next scripts (e.g. `import 'dotenv/config'` at top of `scripts/*.ts`).

**Infrastructure (listed as `devDependencies` but used at runtime by scripts):**
- `@supabase/supabase-js` ^2.98.0 — PostgreSQL database client. Used in `lib/supabase-server.ts` (server), `scripts/*.ts` (sync/ingest), and imported into many cron routes. Note: it lives in `devDependencies` but is required by server code — Next.js bundles it regardless, but this is a defect risk for tree-shaking.
- `playwright` ^1.59.1 — Headless browser automation for scraping Ohio Secretary of State (e.g. `scripts/fetch-oh-sos-bulk.ts`, `scripts/probe-oh-sos-*.ts`).
- `playwright-extra` ^4.3.6 + `puppeteer-extra-plugin-stealth` ^2.11.2 — Cloudflare-evasion scraping of `www6.ohiosos.gov` via `scripts/scrape-vivek-oh-sos-stealth.ts`.
- `@tailwindcss/postcss` ^4 — Tailwind v4 PostCSS plugin (see `postcss.config.mjs`).
- `tailwindcss` ^4 — Utility-first CSS framework.
- `tsx` ^4.21.0 — TypeScript runtime for scripts.
- `typescript` ^5 — Type checker.
- `@types/node` ^20, `@types/react` ^19, `@types/react-dom` ^19 — Type definitions.

**Python (`scrapers/requirements.txt`):**
- `beautifulsoup4` ≥4.12.0 — HTML parsing.
- `requests` ≥2.31.0 — HTTP client.
- `python-dotenv` ≥1.0.0 — Env loading.
- `psycopg2-binary` ≥2.9.9 — Optional direct PostgreSQL (most scripts use Supabase REST instead).
- `supabase` ≥2.3.4 — Supabase Python SDK.
- `pandas` ≥2.1.0, `python-dateutil` ≥2.8.2 — Data processing.
- `textblob` ≥0.17.1 — Sentiment analysis on scraped social posts.
- `tqdm` ≥4.66.1, `pytz` ≥2023.3 — Utilities.
- Optional (not in requirements.txt, imported with try/except in `scrapers/scrape-social-media.py`): `facebook_scraper`, `instaloader`.

## Configuration

**TypeScript (`tsconfig.json`):**
- `target: ES2017`, `module: esnext`, `moduleResolution: bundler`.
- `strict: true`, `noEmit: true`, `isolatedModules: true`, `esModuleInterop: true`, `resolveJsonModule: true`, `allowJs: true`.
- `jsx: react-jsx`, Next.js TypeScript plugin enabled.
- Path alias: `@/*` → project root (used pervasively, e.g. `import { fecFetch } from '@/lib/fec-client'`).
- **Excluded from Next compilation**: `node_modules`, `database`, `scripts`, `scrapers`, `data-ingestion`. These are run via `tsx` separately and would otherwise pollute the build.
- Includes: `.next/types/**/*.ts`, `.next/dev/types/**/*.ts`, plus `.mts`.

**Next.js (`next.config.ts`):**
- Minimal. Only customization: `outputFileTracingIncludes['/api/cron/refresh-gallrein-roster'] = ['./data/pro-israel-donors-*.csv']` — forces Vercel's file tracer to include the ~30 yearly pro-Israel donor registry CSVs so `fs.readFileSync` succeeds in the serverless bundle. Without this, the roster-match cron fails with `ENOENT` in production.

**PostCSS / Tailwind (`postcss.config.mjs`):**
- Single plugin: `@tailwindcss/postcss` (Tailwind v4 zero-config model, no `tailwind.config.*`).

**Environment (`.env`):**
- `.env` file exists at repo root (1.5KB). Committed lockfile shows `.env*` is gitignored (see `.gitignore`). **Contents deliberately not read** — see "Required env vars" in INTEGRATIONS.md.

**Vercel (`vercel.json`):**
- Currently **empty crons array**: `{ "crons": [] }`. CLAUDE.md and `README.md` describe an intended cron schedule (see INTEGRATIONS.md), but `vercel.json` must be re-populated for Vercel Cron to fire the routes under `app/api/cron/*`. Cron routes themselves still validate via `verifyCronAuth` (`lib/cron-auth.ts`).
- `.vercelignore` present (171 bytes); `.vercel/` directory present (linked to a Vercel project).

**Git / Editor:**
- `.gitignore`, `.vercelignore` present.
- No `.eslintrc*`, `.prettierrc*`, `eslint.config.*`, `biome.json` — **no linter or formatter configured**.

## Platform Requirements

**Development:**
- Node.js ≥18 (ideally ≥20, project dev machine is on v24).
- npm (package-lock.json).
- Python 3 with `pip install -r scrapers/requirements.txt` for the scraping subsystem.
- A populated `.env` with the keys listed in INTEGRATIONS.md (Supabase URL + keys, FEC, CourtListener, Exa, etc.).
- Optional: Playwright browser binaries (`npx playwright install`) to run OH SOS scrapers locally.

**Production:**
- **Vercel** serverless hosting (see `.vercel/`, `vercel.json`).
  - Function max duration: 300s (5 min), used by `export const maxDuration = 300` in heavy cron routes (`app/api/cron/sync-fec/route.ts`, `app/api/cron/sync-congress/route.ts`, `app/api/cron/sync-legiscan/route.ts`, `app/api/cron/refresh-gallrein-roster/route.ts`, `app/api/cron/sync-court-records/route.ts`, `app/api/cron/research-candidates/route.ts`).
  - Cron routes use `export const dynamic = 'force-dynamic'` to opt out of static optimization.
- **Supabase** PostgreSQL (free tier) — see `supabase/schema.sql` and INTEGRATIONS.md.
- Python scrapers are **not** part of the Vercel deploy; they run locally / on an external host (see `scrapers/INSTALLATION.md`, `scripts/social-media-daemon.ts`).

---

*Stack analysis: 2026-04-22*

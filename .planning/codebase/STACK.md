# Tech Stack

## Languages & Runtime

- **Node.js** (via Next.js)
- **TypeScript** ^5.x (strict mode enabled)
- **JavaScript/JSX** (React)
- **SQL** (PostgreSQL via Supabase)

## Frameworks

- **Next.js** 16.1.6 — Full-stack React framework with App Router, API routes, and cron support
- **React** 19.2.3 — UI library
- **React DOM** 19.2.3 — Client-side rendering

## Dependencies (key ones with versions)

| Dependency | Version | Purpose |
|---|---|---|
| `@supabase/supabase-js` | ^2.98.0 | Database client (PostgreSQL) |
| `dotenv` | ^17.3.1 | Environment variable loading |

### Full dependency list from `/package.json`:
```json
"dependencies": {
  "dotenv": "^17.3.1",
  "next": "16.1.6",
  "react": "19.2.3",
  "react-dom": "19.2.3"
},
"devDependencies": {
  "@supabase/supabase-js": "^2.98.0",
  "@tailwindcss/postcss": "^4",
  "@types/node": "^20",
  "@types/react": "^19",
  "@types/react-dom": "^19",
  "tailwindcss": "^4",
  "tsx": "^4.21.0",
  "typescript": "^5"
}
```

## Dev Dependencies

- **Tailwind CSS** ^4 with `@tailwindcss/postcss` — CSS utility framework
- **TypeScript** ^5 — Type checking
- **tsx** ^4.21.0 — TypeScript execution runtime
- **@types/node** ^20 — Node.js type definitions
- **@types/react** ^19 — React type definitions
- **@types/react-dom** ^19 — React DOM type definitions

## Configuration

### TypeScript (`/tsconfig.json`)
- **Target**: ES2017
- **Module**: esnext
- **Resolution**: bundler
- **Strict mode**: enabled
- **Path alias**: `@/*` maps to project root
- **Excluded from compilation**: `node_modules`, `database`, `scripts`, `scrapers`, `data-ingestion`

### Next.js (`/next.config.ts`)
- Minimal configuration (default Next.js 16 settings)

### Tailwind CSS (`/postcss.config.mjs`)
- PostCSS plugin: `@tailwindcss/postcss`

## Build & Deploy

### Build System
- **Framework**: Next.js with TypeScript compilation
- **Build command**: `npm run build` (Next.js build)
- **Dev command**: `npm run dev` (Next.js dev server)
- **Start command**: `npm start` (production server)

### Deployment Target
- **Platform**: Vercel
- **Config file**: `/vercel.json`

### Scheduled Cron Jobs (Vercel Cron)
Defined in `/vercel.json`:

| Path | Schedule | Purpose |
|---|---|---|
| `/api/cron/sync-fec` | `0 3 * * *` (3 AM UTC daily) | Sync FEC contribution data for tracked politicians |
| `/api/cron/sync-congress` | `0 4 * * *` (4 AM UTC daily) | Sync Congress.gov bills, votes, and member data |
| `/api/cron/sync-legiscan` | `0 5 * * *` (5 AM UTC daily) | Sync FL state legislature activity from LegiScan |
| `/api/cron/sync-social-media` | `0 */6 * * *` (every 6 hours) | Check daemon health status for social media scraping |

### Environment Variables

Required for runtime:
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_ANON_KEY` — Supabase anonymous public key
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (for cron jobs)
- `FEC_API_KEY` — Federal Election Commission API key (rate limit: 1,000 requests/hour)
- `CONGRESS_API_KEY` — Congress.gov API key (rate limit: ~5,000 requests/hour)
- `LEGISCAN_API_KEY` — LegiScan API key (rate limit: 30,000 requests/month)
- `CRON_SECRET` — Bearer token for Vercel cron job verification

Optional (backward compatibility):
- `NEXT_PUBLIC_SUPABASE_URL` — Public Supabase URL (fallback)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Public Supabase anon key (fallback)

### Source Code Structure

| Directory | Purpose |
|---|---|
| `/app` | Next.js App Router pages and API routes |
| `/app/api` | REST API endpoints and cron job handlers |
| `/app/api/cron/*` | Scheduled cron job handlers for data sync |
| `/app/candidates`, `/app/officials`, `/app/politician/*` | Page routes for browsing politicians |
| `/components` | Reusable React components |
| `/lib` | Shared utility functions and integrations |
| `/public` | Static assets |
| `/supabase` | Database schema and migrations |
| `/scrapers` | Social media scraping daemon (not part of Next.js build) |
| `/data-ingestion` | One-off data import scripts (not part of Next.js build) |
| `/scripts` | Utility scripts |

### Script Execution
- Non-Next.js TypeScript files (in `/scrapers`, `/data-ingestion`, `/scripts`) are executed via `tsx` and excluded from Next.js compilation.


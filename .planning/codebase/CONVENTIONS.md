# Coding Conventions

**Analysis Date:** 2026-04-22

## TypeScript Configuration

**Strict mode:** Enabled (`"strict": true` in `tsconfig.json`).

**Key compiler settings** (`tsconfig.json`):
- `target`: `ES2017`
- `module`: `esnext`, `moduleResolution`: `bundler`
- `jsx`: `react-jsx` (React 19 runtime, no explicit `React` import needed)
- `allowJs`: `true` — JavaScript files permitted (seen in `scripts/*.js` seed scripts)
- `isolatedModules`: `true`
- `resolveJsonModule`: `true` — JSON fixtures imported directly (`data-ingestion/phase1/processed/florida_politicians.json`)
- Path alias: `"@/*": ["./*"]` maps to project root

**Excluded from Next.js compilation:** `node_modules`, `database`, `scripts`, `scrapers`, `data-ingestion`. These directories contain standalone code run via `tsx` (Node) or Python — they are NOT part of the deployed app.

**No linter/formatter configured.** No `.eslintrc*`, `.prettierrc*`, `eslint.config.*`, or `biome.json` exists. Code style is held together by convention and TypeScript's strict mode alone.

## Naming Patterns

**Files:**

| Location | Pattern | Example |
|---|---|---|
| `components/*.tsx` | PascalCase | `PoliticianCard.tsx`, `SearchBar.tsx`, `TerminalHeader.tsx` |
| `app/**/page.tsx` | lowercase segment dirs | `app/politician/[id]/page.tsx`, `app/candidates/page.tsx` |
| `app/**/route.ts` | always `route.ts` | `app/api/politicians/route.ts`, `app/api/fec/candidates/route.ts` |
| `lib/*.ts` | kebab-case | `fec-client.ts`, `supabase-server.ts`, `corruption-score.ts` |
| `scripts/*.ts` | kebab-case with verb prefix | `seed-ohio-20counties.ts`, `sync-fec-data.ts`, `audit-politician.ts` |
| `scrapers/*.py` | kebab-case / snake_case | `scrape-fec-data.py`, `db_helper.py` |

Script naming uses consistent verb prefixes (71 of ~102 files): `seed-*`, `sync-*`, `fetch-*`, `audit-*`, `verify-*`, `probe-*`, `crossref-*`, `apply-*`, `enrich-*`, `flag-*`, `ingest-*`, `populate-*`, `scrape-*`.

**Identifiers:**

| Kind | Pattern | Example |
|---|---|---|
| React components | PascalCase function, `default export` | `export default function PoliticianCard({ politician }: Props)` |
| Props interfaces | `Props` or `XxxProps` | `interface Props` in `PoliticianCard.tsx`; `interface ZipMapProps` in `ZipMap.tsx` |
| Exported functions | camelCase | `fecFetch()`, `getServerSupabase()`, `verifyCronAuth()`, `isIsraelLobbyDonor()` |
| Classes | PascalCase, extends `Error` for domain errors | `class FecError extends Error` in `lib/fec-client.ts` |
| TS types / interfaces | PascalCase | `Politician`, `CorruptionScoreResult`, `LDAFiling`, `LegiScanBillDetail` |
| Union types | PascalCase, string-literal members | `type Party = 'Democrat' \| 'Republican' \| 'Independent' \| 'Nonpartisan' \| 'Other'` |
| Constants (module-level) | UPPER_SNAKE_CASE | `FEC_BASE_URL`, `ISRAEL_LOBBY_COMMITTEE_IDS`, `ISRAEL_LOBBY_NAME_PATTERNS` |
| Supabase columns | snake_case | `bioguide_id`, `office_level`, `corruption_score`, `juice_box_tier` |
| App-layer fields (after mapping) | camelCase | `officeLevel`, `corruptionScore`, `juiceBoxTier` |
| FEC / LegiScan / LDA API fields | snake_case (kept as-is from upstream) | `candidate_id`, `per_page`, `filing_uuid`, `roll_call_id` |

The snake_case (DB / external API) ↔ camelCase (app layer) boundary is explicit and handled at the API route boundary via manual field mapping (see `app/api/politicians/route.ts:59-89`).

## Import Organization

No enforced order, but the observed convention across `app/api/**/route.ts` and `components/*.tsx` is:

1. External packages (`next/server`, `next/link`, `react`, `@supabase/supabase-js`)
2. `@/lib/*` modules (via path alias)
3. `@/components/*`
4. `type` imports using the `import type` form

Representative example (`app/api/politicians/route.ts:1-4`):

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import type { Politician } from '@/lib/types';
import { filterByState } from '@/lib/state-utils';
```

**Path alias:** `@/` is used consistently. Relative imports like `../lib/types` are avoided in `app/` and `components/`. Scripts in `scripts/` use relative imports (`../lib/corruption-score`) because the tsconfig excludes that dir and they run via `tsx`.

## Server vs Client Component Split

**Server components by default** — Next.js 16 App Router convention. ~18 of 43 `.tsx` files in `app/` + `components/` use `'use client'`.

**Client components** (top-of-file `'use client'` directive) are reserved for:
- Interactive pages using hooks: `app/politician/[id]/page.tsx`, `app/candidates/page.tsx`, `app/juicebox/page.tsx`, `app/connections/page.tsx`, `app/admin/page.tsx`
- Client components with event handlers / refs: `SearchBar.tsx`, `ConnectionsGraph.tsx`, `USMap.tsx`, `TerminalContext.tsx` (React Context provider), `TerminalHeader.tsx`
- Embed / share widgets: `app/embed/[id]/EmbedDossier.tsx`, `components/ShareDossier.tsx`

**Server component pattern** — fetch at request time, fall back to JSON on error (`app/page.tsx:20-48`):

```typescript
async function fetchPoliticians(): Promise<Politician[]> {
  try {
    const client = getServerSupabase();
    if (!client) {
      const { getAllPoliticians } = await import('@/lib/real-data');
      return getAllPoliticians();
    }
    // ...paginated Supabase read...
  } catch (error) {
    console.error('Failed to fetch politicians for SSR:', error);
    // ...
  }
}
```

**Layout is a server component** (`app/layout.tsx`) and wraps children in a client `TerminalProvider` + `TerminalShell`. ISR is driven by `export const revalidate = 300;` on page files.

**API routes** are always server-only and frequently declare `export const dynamic = 'force-dynamic';` (see `app/api/politicians/route.ts:6`, `app/api/politicians/[id]/route.ts:6`) when they must bypass Next's default route caching.

## Supabase Client Wiring

Two singleton factories live in `lib/supabase-server.ts` and are the ONLY sanctioned way to obtain a client:

```typescript
// lib/supabase-server.ts:12-31
export function getServerSupabase(): SupabaseClient | null {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !supabaseKey) return null;
  if (!_supabase) {
    _supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _supabase;
}
```

Conventions:
- **Anon client** (`getServerSupabase()`) — reads, respects RLS. Used by `app/api/*` read routes and server pages.
- **Service-role client** (`getServiceRoleSupabase()`) — elevated writes for cron upserts (`app/api/cron/*`). Falls back to anon key if `SUPABASE_SERVICE_ROLE_KEY` is missing.
- Both return `null` (never throw) when env vars are missing — callers MUST null-check and fall back to local JSON via `lib/real-data.ts`.
- `auth: { persistSession: false, autoRefreshToken: false }` always set (server context, no sessions).
- No client-side Supabase usage. Browser never gets credentials; data is fetched via `/api/*` routes.

**Scripts outside Next.js** (`scripts/audit-politician.ts:17-23`, etc.) import `createClient` directly from `@supabase/supabase-js` and read env vars themselves. They also typically start with `import 'dotenv/config';` (see `scripts/seed-platform-stats.ts:7`, `scripts/sync-voting-records.ts:2`).

**Warning:** `scripts/verify-nc-officials.ts:1-6` contains a hardcoded service-role JWT. This is a secret-leak pattern and inconsistent with the env-var convention — see CONCERNS.md if present.

## Environment Variable Access

**Pattern:** `process.env.XXX` read inline at the call site, coalesced with `||` fallbacks.

**Server-only vars (preferred):**
```typescript
process.env.SUPABASE_URL
process.env.SUPABASE_ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY
process.env.FEC_API_KEY
process.env.LEGISCAN_API_KEY
process.env.LDA_API_KEY
process.env.CONGRESS_API_KEY
process.env.COURTLISTENER_TOKEN
process.env.EXA_API_KEY
process.env.CRON_SECRET
process.env.ADMIN_SECRET
```

**`NEXT_PUBLIC_*` fallbacks** tolerated for Supabase only (migration compatibility, see `lib/supabase-server.ts:14-15`).

**Three access idioms** seen in the codebase:
1. **Lazy getter that throws** (preferred for required keys): `lib/fec-client.ts:15-21`
   ```typescript
   export function getFecApiKey(): string {
     const key = process.env.FEC_API_KEY;
     if (!key) throw new FecError('FEC_API_KEY is not configured in environment variables', 500);
     return key;
   }
   ```
2. **Module-level constant with empty-string fallback** (tolerates missing key, fails later): `lib/research-agent.ts:17-19`, `app/api/legiscan/route.ts:19`, `app/api/admin/route.ts:19`
3. **Null-returning factory** (graceful fallback to JSON): `lib/supabase-server.ts:12-31`

**Cron auth** uses a dedicated helper (`lib/cron-auth.ts:20-40`) that validates `Authorization: Bearer ${CRON_SECRET}` and returns `NextResponse` 401 on failure — reused by every `app/api/cron/*` handler.

**No env vars are imported or read in client components.** All sensitive config lives server-side.

## Shared Types

All app-layer types live in a single file: `lib/types.ts` (620 lines).

Conventions:
- **`interface`** for object shapes that grow over time (`Politician`, `CorruptionScoreResult`, `LDAFiling`, `DonorForensics`). 
- **`type`** for string-literal unions and aliases (`Party`, `JurisdictionType`, `OfficeLevel`, `JuiceBoxTier`, `CorruptionGrade`).
- Optional fields use `?:`; nullable payload fields use `: T | null` (mirrors upstream API shapes for `LDA*` and `LegiScan*`).
- JSDoc comments above fields explain semantics and units (see `Politician.individualDonorBreakdown` at `lib/types.ts:91-116`).
- External API types are kept verbatim (snake_case) — e.g. `LegiScanRollCallMeta`, `LDARegistrant` — and separate processed app types are defined alongside (`StateVoteRecord`, `LobbyingRecord`).

**Feature-scoped types** live in the same file as their consumer:
- `BillCategory`, `Bill`, `Vote` inside `lib/bills-data.ts:6-60`
- `Props` interfaces inside each `components/*.tsx`

**No barrel files.** Every import targets the concrete module:

```typescript
import type { Politician } from '@/lib/types';  // preferred
// not: import type { Politician } from '@/lib';
```

## Error Handling

**Custom error class for domain errors** — `FecError` in `lib/fec-client.ts:23-30` carries an HTTP status code, letting route handlers translate to `NextResponse`:

```typescript
export class FecError extends Error {
  status: number;
  constructor(message: string, status: number = 500) {
    super(message);
    this.name = 'FecError';
    this.status = status;
  }
}
```

**API route handler pattern** — try/catch the whole body, log via `console.error`, return JSON with status (`app/api/fec/candidates/route.ts:105-108`):

```typescript
} catch (error) {
  const { error: message, status } = fecErrorResponse(error);
  return NextResponse.json({ error: message }, { status });
}
```

**Graceful fallback pattern** — Supabase failures in read paths fall back to local JSON, returning a 200 instead of a 500 (`app/api/politicians/route.ts:92-98`):

```typescript
} catch (error) {
  console.error('Failed to fetch politicians:', error);
  const { getAllPoliticians: getJsonPoliticians } = await import('@/lib/real-data');
  const politicians = getJsonPoliticians();
  return cachedResponse(filterByState(politicians, stateParam));
}
```

**Rate-limit handling** is explicit and retry-aware in scripts (`scripts/audit-politician.ts:49`):

```typescript
if (res.status === 429) { await sleep(30_000); return fecFetch(endpoint, params); }
```

In API routes, 429 is translated to a user-facing `FecError` with guidance (`lib/fec-client.ts:59-64`).

**Client-side fetches** throw on non-OK and let the calling component render a friendly message (`app/politician/[id]/page.tsx:70`):

```typescript
if (!res.ok) throw new Error(`API error: ${res.status}`);
```

**Observed anti-patterns** (document but do NOT replicate):
- Empty-string fallbacks followed by late-failing API calls (`app/api/admin/route.ts:19`) — prefer the "throw in getter" idiom from `getFecApiKey`.
- Silent `break` on paginated Supabase errors (`app/api/politicians/route.ts:43`) — partial data is returned without a signal.

## Logging

No logger library. All log output is `console.log` / `console.error` directly.

Conventions:
- `console.error` in catch blocks with a prefix: `'Failed to fetch politicians:'`, `'LegiScan proxy error:'`, `'[cron-auth] CRON_SECRET is not configured'`.
- Cron scripts log structured progress (`console.log('✅ Synced', n, 'records')`).
- Emoji markers tolerated in scripts, rare in app code.
- No `console.log` in production React render paths — hooks call `console.error` only on error paths.

## Formatting & Style

Without an enforced formatter, the dominant style across new files is:
- 2-space indentation
- Single quotes for strings, backticks for interpolation
- Semicolons required
- Trailing commas in multi-line literals
- `const` by default; `let` only for reassigned locals (e.g., pagination loops in `app/api/politicians/route.ts:32`)
- Arrow functions for helpers, `function` keyword for exported top-level handlers and React components
- Destructuring in function signatures: `({ politician }: Props)`, `({ params }: { params: Promise<{ id: string }> })`

## Component Patterns

**Props interface** declared inline above the component and named either `Props` (single-component files) or `{Name}Props`:

```typescript
// components/PoliticianCard.tsx:4-8
interface Props {
  politician: Politician;
}

export default function PoliticianCard({ politician }: Props) {
  if (!politician || !politician.name || !politician.office) return null;
```

**Inline styles via `style={{ ... }}`** are the dominant styling approach (`components/PoliticianCard.tsx` is entirely inline-styled). CSS custom properties defined in `app/globals-terminal.css` (`var(--red-blood)`, `var(--terminal-amber)`) carry the design tokens. Tailwind is configured but used sparingly — the terminal aesthetic is inline-styled.

**Early-return guards** for missing data (`components/PoliticianCard.tsx:10-12`): `if (!politician || !politician.name) return null;`

**Default export per component file.** Named exports reserved for utility modules.

## Function Design

- Utility helpers are small and single-purpose (`getScoreColor`, `getPartyLabel`, `getLevelLabel` inside `SearchBar.tsx`).
- Exported library functions receive explicit parameter and return types (`fecFetch(endpoint: string, params: Record<...>): Promise<any>`).
- `: Promise<any>` IS used for external API responses (FEC, LDA); the route handler narrows/maps to typed shapes before returning.
- Top-level route `GET` handlers are often 50–150 lines; large pages (`app/politician/[id]/page.tsx` is 2,169 lines) are outliers but represent the "dossier" feature.

## Module Design

- **`lib/*.ts`** — one concern per file. Clients (`fec-client.ts`, `courtlistener-client.ts`), data access (`supabase-server.ts`, `real-data.ts`), logic (`corruption-score.ts`, `industry-classifier.ts`), presentational helpers (`format.ts`, `politician-display.ts`).
- **County data modules** (`volusia-county-data.ts`, `orange-county-data.ts`, etc.) — hardcoded fixture arrays exported as default data for local/offline fallback.
- **Named exports** for everything in `lib/`; default exports reserved for React components.
- **No circular imports** observed. `app/` depends on `components/` + `lib/`; `lib/` never imports from `app/` or `components/`.

---

*Convention analysis: 2026-04-22*

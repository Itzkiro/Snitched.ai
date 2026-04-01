# Code Conventions

## Code Style

### TypeScript Configuration
- **Strict Mode**: Enabled in `tsconfig.json` with strict type checking
- **Target**: ES2017 with ESNext module system
- **Path Aliases**: `@/*` maps to project root for clean imports
- **JSX**: React 19 with `react-jsx` runtime

### Formatting & Structure
- No linter or formatter configured (ESLint/Prettier not present)
- Code uses consistent inline styling with CSS custom properties
- **File Organization**: Feature-based structure (`app/`, `components/`, `lib/`, `scrapers/`)
  - `app/` — Next.js 16 pages and API routes
  - `components/` — Reusable React components (client-side with `'use client'`)
  - `lib/` — Utilities, types, API clients, data modules
  - `scrapers/` — Python-based data scraping scripts

### Code Size Limits (Observed)
- Page components typically 80-100+ lines (no strict enforcement)
- Component functions average 50-250 lines
- API routes follow JSDoc comment blocks for documentation
- Library utilities are well-documented with inline comments

## Naming Conventions

### Files
- **Components**: PascalCase (e.g., `TerminalHeader.tsx`, `SearchBar.tsx`, `PoliticianCard.tsx`)
- **Pages**: kebab-case in directories, lowercase filenames (e.g., `/candidates/page.tsx`, `/politician/[id]/page.tsx`)
- **API Routes**: lowercase with underscores (e.g., `route.ts` in semantic paths like `/api/fec/candidates/route.ts`)
- **Utilities**: camelCase (e.g., `fec-client.ts`, `corruption-score.ts`, `supabase-server.ts`)
- **Data Modules**: kebab-case for county/region data (e.g., `orange-county-data.ts`, `putnam-county-data.ts`)
- **Python Scripts**: snake_case (e.g., `db_helper.py`, `scrape-fec-data.py`)

### Variables & Functions
- **React Components**: PascalCase for function components
- **Exported Functions**: camelCase (e.g., `fecFetch()`, `isIsraelLobbyDonor()`, `fuzzyMatch()`)
- **Classes**: PascalCase (e.g., `FecError`, `DatabaseHelper`)
- **Constants**: UPPER_SNAKE_CASE for globals (e.g., `FEC_BASE_URL`, `ISRAEL_LOBBY_COMMITTEE_IDS`)
- **Types/Interfaces**: PascalCase (e.g., `Politician`, `CorruptionScoreResult`, `Tag`)
- **Type Unions**: PascalCase (e.g., `Party`, `JurisdictionType`, `OfficeLevel`, `CorruptionGrade`)
- **State Variables**: camelCase in hooks (e.g., `loading`, `error`, `selectedIndex`, `politicians`)
- **Helper Functions**: camelCase, prefix with descriptive verb (e.g., `getScoreColor()`, `getPartyLabel()`, `getLevelLabel()`)

### API & Data Conventions
- **Query Parameters**: snake_case in URL searches (e.g., `candidate_id`, `per_page`, `is_active`)
- **Response Objects**: snake_case in FEC API responses, camelCase in app layer after transformation
- **Endpoints**: kebab-case in URLs (e.g., `/api/fec/candidates`, `/api/politicians/votes`)

### Domain Terms
- **Corruption Terminology**:
  - `corruptionScore` — numeric 0-100 risk indicator
  - `juiceBoxTier` — funding influence category ("none", "compromised", "bought", "owned")
  - `aipacFunding` — specific Israel lobby PAC contributions
- **Political Terminology**:
  - `officeLevel` — hierarchy (e.g., "US Senator", "State Representative")
  - `jurisdictionType` — government entity type (e.g., "federal", "state_legislature")
  - `party` — political affiliation (e.g., "Democrat", "Republican", "Independent")

## Common Patterns

### API Client Pattern
All external API calls use dedicated client modules (e.g., `lib/fec-client.ts`):
```typescript
// lib/fec-client.ts
export async function fecFetch(endpoint: string, params: Record<string, string | number | undefined>): Promise<any>
export class FecError extends Error { status: number }
export function fecErrorResponse(error: unknown): { error: string; status: number }
```

**Client Modules**:
- `lib/fec-client.ts` — FEC API (Federal Election Commission)
- `lib/supabase-server.ts` — Supabase PostgreSQL database
- Python: `db_helper.py` for database operations

### Route Handler Pattern
API routes follow a consistent structure:
```typescript
// app/api/[domain]/[endpoint]/route.ts
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    // Extract and validate params
    const data = await clientFetch(endpoint, params);
    // Transform response
    return NextResponse.json(transformedData);
  } catch (error) {
    const { error: message, status } = errorResponse(error);
    return NextResponse.json({ error: message }, { status });
  }
}
```

**Characteristics**:
- Comprehensive JSDoc headers documenting query params and response shape
- Try/catch blocks with centralized error handling
- Parameter extraction from `request.nextUrl.searchParams`
- Response transformation before JSON serialization (e.g., FEC → internal format)
- Pagination metadata included in responses

### Component Props Pattern
Props use explicit interfaces:
```typescript
interface Props {
  politician: Politician;
}
export default function PoliticianCard({ politician }: Props) { }
```

### Search/Filter Pattern
Utilities for search/scoring return negative values for no match:
```typescript
function fuzzyMatch(query: string, target: string): number
function scorePolitician(politician: Politician, query: string): number
// -1 = no match, 0+ = match score (lower is better)
```

### Data Validation Pattern
Safety checks are inline with early returns:
```typescript
if (!politician || !politician.name || !politician.office) {
  return null;
}
```

### Styling Pattern
No CSS files—inline styles with CSS custom properties and design variables:
```typescript
style={{
  color: 'var(--terminal-text)',
  background: 'var(--terminal-bg)',
  border: '1px solid var(--terminal-border)'
}}
```

## Error Handling

### Approach
**Errors are handled explicitly at every boundary**:

1. **External API Calls**: Custom error classes with HTTP status codes
   - `FecError` wraps FEC API failures with status codes (429 for rate limits, 502 for upstream 5xx)
   - `LDAError` (implicit pattern) handles Lobbying Disclosure Act errors

2. **Route Handlers**: Try/catch around async operations
   - Catches and transforms errors to `NextResponse.json({ error: message }, { status })`
   - Rate limit detection (429) returns user-friendly message

3. **Client Components**: Explicit error state management
   ```typescript
   const [error, setError] = useState<string | null>(null);
   try {
     const res = await fetch('/api/politicians');
     if (!res.ok) throw new Error(`API error: ${res.status}`);
   } catch (error) {
     setError(error instanceof Error ? error.message : 'Failed to load');
   }
   ```

4. **Data Validation**: Early returns on null/undefined
   ```typescript
   if (!politician || !politician.name || !politician.office) {
     return null;
   }
   ```

### No Silent Failures
- Errors are logged to console in client code (`console.error()`)
- Rate limit errors include retry guidance
- Unknown errors use generic fallback messages

## Import Organization

### Import Order
1. React/Next.js standard library imports
2. Type imports from `@/lib/types`
3. Utility imports from `@/lib/*`
4. Component imports from `@/components/*`
5. CSS imports (if any)

### Example
```typescript
import type { Metadata } from "next";
import { NextRequest, NextResponse } from 'next/server';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Politician } from '@/lib/types';
import { fecFetch, fecErrorResponse } from '@/lib/fec-client';
import PoliticianCard from '@/components/PoliticianCard';
import TerminalHeader from "@/components/TerminalHeader";
```

### Path Aliases
- `@/` resolves to project root
- Used consistently for cross-module imports (no relative paths like `../lib/types`)

## Component Patterns (Next.js/React)

### Server Components (Default)
Page components are server-side by default, fetch data on the server:
```typescript
export default function CandidatesPage() {
  // Renders on server, data fetching at build time or on request
}
```

### Client Components
Interactive components must opt-in with `'use client'` at top:
```typescript
'use client';
import { useState, useEffect } from 'react';
export default function SearchBar() {
  const [query, setQuery] = useState('');
}
```

**Client Components Used For**:
- Search/filter UI (`SearchBar.tsx`)
- Interactive headers with navigation state (`TerminalHeader.tsx`)
- Forms and event handlers
- Any component using hooks (useState, useEffect, useCallback, useRef, etc.)

### Data Fetching Pattern
**Client-side fetch** when interactivity required:
```typescript
useEffect(() => {
  async function loadData() {
    const res = await fetch('/api/politicians');
    const data: Politician[] = await res.json();
    setPoliticians(data);
  }
  loadData();
}, []);
```

Wrap in try/catch and manage loading/error states separately.

### Props Pattern
- Explicit `Props` interface per component
- Props are destructured in function signature
- Default exports for all components

### Rendering Patterns
- Conditional rendering with early returns
- Array mapping with `.map()` and explicit keys
- No deep nesting (max 3-4 levels of JSX)
- Inline styles preferred over CSS classes (no global stylesheet)

### HTML/DOM Patterns
- Semantic HTML where possible (divs, links, buttons)
- Terminal aesthetic enforced via inline style props
- No accessibility helpers (no aria-labels, roles currently present)
- Emoji for visual indicators (🇺🇸, 👔, 🗳️, etc.)

### Search/Autocomplete Patterns
- Client-side fuzzy matching with scoring
- Dropdown visibility controlled by state
- Keyboard navigation (arrow keys, enter, escape)
- Click-outside detection with refs and document event listeners
- Debounced search not used (filtering happens synchronously)

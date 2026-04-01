# Testing

## Framework

**Status**: Not configured
- No test framework installed (no Jest, Vitest, Mocha, or similar in `package.json`)
- No test runner scripts in package.json (only `dev`, `build`, `start`)
- No test configuration files present (no `jest.config.js`, `vitest.config.ts`, etc.)
- No `@testing-library/react`, `@testing-library/jest-dom`, or other testing dependencies

**TypeScript Support**: TypeScript is configured and strict mode is enabled, which could support test files, but no test infrastructure exists.

## Test Structure

**Current State**: No test files in the codebase

### Locations Checked (All Empty)
- No `__tests__/` directories
- No `*.test.ts` or `*.test.tsx` files
- No `*.spec.ts` or `*.spec.tsx` files
- No `/tests/` directory
- Python scrapers (`scrapers/*.py`) have no unit tests

### Where Tests Should Live (If Added)
Based on Next.js conventions, recommended structure:
```
app/
  api/
    fec/
      candidates/
        route.ts
        route.test.ts          ← API route tests
  politicians/
    page.tsx
    page.test.tsx             ← Page component tests
components/
  SearchBar.tsx
  SearchBar.test.tsx          ← Component unit tests
lib/
  fec-client.ts
  fec-client.test.ts          ← Utility tests
  types.ts
scrapers/
  tests/
    test_fec_scraper.py       ← Python scraper tests
```

## Coverage

**Current Coverage**: 0% (no tests written)

### Coverage Targets (If Tests Were Implemented)
Based on codebase complexity and critical paths:

**High Priority** (Critical business logic):
- `lib/corruption-score.ts` — corruption scoring algorithm (should be 100% for reproducibility)
- `lib/fec-client.ts` — FEC API client error handling and rate limiting
- `app/api/fec/*` routes — API transformation logic and edge cases
- `components/SearchBar.tsx` — fuzzy matching algorithm and keyboard navigation

**Medium Priority** (Data transformations):
- `lib/supabase-server.ts` — database operations
- Data ingestion modules (county data imports)
- LegiScan vote record processing

**Lower Priority** (UI rendering):
- Other page components (candidates, officials, hierarchy)
- Simple display components (PoliticianCard, SocialFeed)

### Target Coverage Benchmark
If testing were to be implemented, aim for:
- **80% overall coverage** (recommended minimum)
- **100% coverage** on algorithm modules (corruption-score.ts, search algorithms)
- **90% coverage** on API clients and route handlers
- **70% coverage** on UI components (focus on logic, not snapshots)

## Mocking Patterns

**No mocking infrastructure currently exists**. If tests were added, recommended patterns:

### API Mocking
For testing API route handlers without hitting external services:
```typescript
// Mock FEC API responses
jest.mock('@/lib/fec-client', () => ({
  fecFetch: jest.fn().mockResolvedValue({
    results: [...],
    pagination: { count: 10, page: 1, pages: 1 }
  })
}));
```

### Database Mocking
For Supabase operations:
```typescript
jest.mock('@/lib/supabase-server', () => ({
  getSupabaseAdmin: jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({ data: [...] })
    })
  })
}));
```

### Component Mocking
For testing components that depend on API calls:
```typescript
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve([...])
  })
);
```

### Search Algorithm Testing
No mocks needed; pure functions like `fuzzyMatch()` and `scorePolitician()` are deterministic:
```typescript
describe('fuzzyMatch', () => {
  test('returns 0 for exact substring at start', () => {
    expect(fuzzyMatch('john', 'john smith')).toBe(0);
  });
});
```

## CI Integration

**Status**: Not configured

### What's Missing
- No GitHub Actions workflows (no `.github/workflows/` directory)
- No CI configuration files (no `.gitlab-ci.yml`, `.circleci/`, etc.)
- No lint/type-check scripts in `package.json`
- No build verification in CI
- Vercel deployment configured (from `vercel.json`) but no pre-deployment tests

### Current Build/Deploy Setup
- `next.config.ts` exists for Next.js configuration
- `tsconfig.json` excludes `scripts/`, `scrapers/`, `data-ingestion/` from TypeScript compilation
- Project uses TypeScript strict mode (catches type errors at compile time)
- No pre-commit hooks or husky configuration

### If CI Were To Be Added (Recommended)
```yaml
# .github/workflows/test.yml
name: Test & Lint
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run lint     # (needs to be added)
      - run: npm run type-check  # npx tsc --noEmit
      - run: npm run test     # (needs to be added)
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm install
      - run: npm run build
```

## Gaps

### Critical Gaps
1. **No Test Framework**: Zero testing infrastructure. Must choose and install:
   - Jest (recommended for Next.js) or Vitest (faster, modern alternative)
   - Testing Library for React components
   - Supertest or similar for API route testing

2. **No Test Data**: No fixtures or mock data for:
   - Sample politician records
   - FEC API responses
   - Supabase database schemas

3. **No Type Safety for Tests**: TypeScript needs test-aware types:
   - `@types/jest` or similar

### Major Testing Blind Spots
- **Corruption Score Algorithm** (`lib/corruption-score.ts`):
  - 100+ lines of weighting and factor scoring
  - No test coverage means scoring changes could break silently
  - Recommend: Algorithm unit tests + property-based tests

- **Fuzzy Search** (`components/SearchBar.tsx`):
  - Custom implementation with gap counting
  - Edge cases: empty strings, unicode, special characters
  - Recommend: Comprehensive unit tests for fuzzy matching logic

- **FEC API Client** (`lib/fec-client.ts`):
  - Rate limiting (429) handling
  - Error transformations (5xx → 502)
  - Response parsing
  - Recommend: Integration tests against FEC API (with VCR-style tape recording)

- **API Route Transformations** (`app/api/fec/*`):
  - Each route transforms external API responses to internal format
  - No validation that transformation is correct
  - Recommend: Route handler tests with mocked clients

- **Data Scraper Logic** (`scrapers/*.py`):
  - Critical for data ingestion
  - No automated tests
  - Recommend: Unit tests for parsing logic + integration tests against live APIs (with recording)

### Missing Validation/Quality Checks
- No linting (ESLint not configured)
- No code formatting enforcement (Prettier not configured)
- No type checking in CI (TypeScript strict mode helps but no automated tsc check)
- No dependency security scanning (no dependabot or snyk)
- No API contract testing (FEC, LegiScan, LDA responses not validated against schema)

### Recommended Priority Order for Implementation
1. **Set up Jest + Testing Library** (1 day)
2. **Add TypeScript types for tests** (`@types/jest`, etc.)
3. **Test critical algorithms** (corruption-score.ts, fuzzy search) — 100% coverage (2 days)
4. **Test API clients** (FEC, LegiScan, LDA) with mocks (2 days)
5. **Test API route handlers** (transformation logic) (2 days)
6. **Test component logic** (SearchBar keyboard nav, PoliticianCard conditionals) (1 day)
7. **Add linting** (ESLint + Prettier) for code quality
8. **Set up CI pipeline** (GitHub Actions) to run tests on push

### Total Estimated Effort
~10-14 days to achieve 80% coverage with CI integration, starting from zero testing infrastructure.

## Maintenance Notes

### If Tests Were Implemented
- **Test File Location**: Keep tests co-located with source files (e.g., `SearchBar.test.tsx` next to `SearchBar.tsx`)
- **Snapshot Testing**: Avoid; prefer explicit assertions
- **Mock Cleanup**: Reset mocks between tests to avoid state pollution
- **Async Testing**: Use async/await or return promises; avoid `done()` callbacks
- **Data Fixtures**: Store sample politician records and API responses in `__fixtures__/` directories

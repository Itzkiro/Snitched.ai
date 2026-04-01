# Concerns & Tech Debt

## Security

### CRITICAL: Hardcoded Supabase Service Role Key Exposed
**Severity:** CRITICAL
**File:** `/Users/kirolosabdalla/Snitched.ai/scripts/sync-social-media.ts` (lines 30-32)

A Supabase service role JWT is hardcoded directly in the source code:
```typescript
const SUPABASE_URL = 'https://[REDACTED].supabase.co';
const SUPABASE_SERVICE_KEY = '[REDACTED - service_role JWT]';
```

**Impact:**
- Any attacker with access to this repository can use the service role key to bypass all row-level security (RLS) policies
- Service role keys grant unrestricted database access
- The key is visible in git history and may have been exposed

**Action Required:**
1. IMMEDIATELY rotate this Supabase service role key
2. Move to environment variables (use `process.env.SUPABASE_SERVICE_KEY`)
3. Update `.env.local` and Vercel environment variables
4. Remove from git history: `git filter-branch --tree-filter 'rm -f scripts/sync-social-media.ts' -- --all`

---

### Missing Input Validation & SQL Injection Risk
**Severity:** HIGH
**Files:**
- `/Users/kirolosabdalla/Snitched.ai/app/api/bills/search/route.ts` (line 28)
- `/Users/kirolosabdalla/Snitched.ai/app/api/lobbying/route.ts` (lines 79-93)

The search query is passed directly to Supabase `.ilike()` without validation:
```typescript
// app/api/bills/search/route.ts, line 28
.or(`title.ilike.%${query}%,summary.ilike.%${query}%,description.ilike.%${query}%`)
```

While Supabase's PostgREST API uses parameterized queries internally, lack of input validation allows:
- DoS via extremely long queries
- Malicious regex patterns in search
- No length limits enforced

**Action Required:**
1. Add input validation: max 100 chars for search query
2. Sanitize special characters or use strict allowlisting
3. Add rate limiting to search endpoints

---

### Insecure JSON Parsing Without Try-Catch
**Severity:** MEDIUM
**Files:**
- `/Users/kirolosabdalla/Snitched.ai/scripts/sync-social-media.ts` (lines 317, 333)
- `/Users/kirolosabdalla/Snitched.ai/scripts/social-media-daemon.ts` (line 152, 373)
- `/Users/kirolosabdalla/Snitched.ai/data-ingestion/fetch-fec-data.ts` (lines 606, 628)

Multiple locations parse JSON without proper error handling:
```typescript
// scripts/sync-social-media.ts, line 317
const data: ScraperOutput = JSON.parse(raw);
```

**Risk:**
- Malformed files cause unhandled exceptions
- No recovery mechanism
- Crashes the script silently if file is corrupted

**Action Required:**
Wrap all `JSON.parse()` in try-catch blocks with fallback values.

---

### Environment Variables Not Validated at Startup
**Severity:** MEDIUM
**Files:** Multiple API routes and scripts

Critical environment variables are checked lazily:
- `FEC_API_KEY` (validated in `/Users/kirolosabdalla/Snitched.ai/lib/fec-client.ts`, line 16)
- `CRON_SECRET` (validated in `/Users/kirolosabdalla/Snitched.ai/lib/cron-auth.ts`, line 21)
- `LDA_API_KEY` (validated in `/Users/kirolosabdalla/Snitched.ai/app/api/lobbying/route.ts`, line 37)

If missing, the application fails at runtime instead of startup.

**Action Required:**
Create an env validation script that runs at server startup to fail fast.

---

## Performance

### Inefficient API Caching Strategy
**Severity:** MEDIUM

**Files:**
- `/Users/kirolosabdalla/Snitched.ai/lib/fec-client.ts` (line 56)
- `/Users/kirolosabdalla/Snitched.ai/app/api/lobbying/route.ts` (line 120)

Cache is set to 5 minutes (`revalidate: 300`) for all FEC/LDA API responses:
```typescript
next: { revalidate: 300 }, // cache for 5 minutes to stay under rate limits
```

**Issues:**
1. FEC data changes daily but is cached for 5 min
2. No cache invalidation strategy when data updates
3. LDA API has 120 req/min limit but 5-min cache doesn't align with update frequency

**Recommendation:**
- Use `revalidate: 86400` (1 day) for FEC since it batches daily
- Add cache tag headers for granular invalidation
- Implement stale-while-revalidate pattern

---

### Politician Page Loads All Data Eagerly
**Severity:** LOW-MEDIUM
**File:** `/Users/kirolosabdalla/Snitched.ai/app/politician/[id]/page.tsx` (lines 50-66)

The politician page loads ALL politicians to find one by ID:
```typescript
const res = await fetch('/api/politicians');
const allPoliticians: Politician[] = await res.json();
const found = allPoliticians.find(p => p.id === params.id);
```

**Issue:**
- O(n) lookup inefficient with thousands of politicians
- API endpoint `/api/politicians` likely returns full dataset

**Recommendation:**
- Create `/api/politicians/[id]` endpoint for direct lookup
- Use pagination for politician lists

---

### Large Files Not Optimized
**Severity:** LOW
**Files with size concerns:**
- `/Users/kirolosabdalla/Snitched.ai/app/politician/[id]/page.tsx` (1200 lines)
- `/Users/kirolosabdalla/Snitched.ai/app/juicebox/page.tsx` (875 lines)
- `/Users/kirolosabdalla/Snitched.ai/scripts/sync-legiscan-data.ts` (812 lines)

These exceed the recommended 400-800 line guideline.

---

## Technical Debt

### Weak Type Safety Throughout Codebase
**Severity:** MEDIUM
**Count:** 55+ instances of `any` type usage

**Examples:**
- `/Users/kirolosabdalla/Snitched.ai/app/api/fec/candidates/route.ts` (lines 65, 84-93) uses `(c: any)` and `(pc: any)`
- `/Users/kirolosabdalla/Snitched.ai/app/politician/[id]/page.tsx` (line 99) uses `(row: Record<string, unknown>)`

**Impact:**
- Type checking disabled for critical data transformations
- Contributions, politician data, and votes lack type safety
- Refactoring is fragile and error-prone

**Action Required:**
1. Create strict TypeScript interfaces for all API responses
2. Use `unknown` instead of `any` where type is uncertain
3. Add type guards and discriminator unions for polymorphic data

---

### Hardcoded Constants Scattered in Code
**Severity:** LOW-MEDIUM

**Israel Lobby Lists** hardcoded in multiple files:
- `/Users/kirolosabdalla/Snitched.ai/lib/fec-client.ts` (lines 93-119)
- `/Users/kirolosabdalla/Snitched.ai/scripts/sync-fec-data.ts` (similar list)
- `/Users/kirolosabdalla/Snitched.ai/data-ingestion/fetch-fec-data.ts` (duplicated)

Committee IDs and name patterns are duplicated across files.

**Action Required:**
Consolidate into a single configuration file or database table for maintainability.

---

### Missing Error Recovery in Cron Jobs
**Severity:** MEDIUM
**Files:**
- `/Users/kirolosabdalla/Snitched.ai/app/api/cron/sync-fec/route.ts`
- Scripts under `scripts/sync-*.ts`

**Issues:**
1. Partial sync failures silently continue
2. Rate-limit handling stops processing but doesn't retry later
3. No exponential backoff for transient failures
4. Database update errors are logged but don't block further processing

**Example:**
```typescript
// sync-fec/route.ts, lines 220-230
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  errorCount++;
  errors.push({ candidateId: candidate.fecCandidateId, error: message });
  log.push(`  ${candidate.name}: ERROR - ${message}`);

  if (message.includes('rate limit')) {
    log.push('Rate limited by FEC API. Stopping sync to avoid further errors.');
    break;
  }
}
```

If a politician sync fails (network error, DB error), the cron continues without retry.

---

### Corruption Score Algorithm Relies on Placeholder Data
**Severity:** MEDIUM
**File:** `/Users/kirolosabdalla/Snitched.ai/lib/corruption-score.ts` (lines 40-41, 252-266)

Multiple factors use placeholder score when data is unavailable:
```typescript
const PLACEHOLDER_SCORE = 30;
// Used for voting alignment when votes.length === 0 (lines 252-266)
```

**Issues:**
1. Placeholder scores skew results for politicians without voting data
2. Confidence level doesn't properly reflect missing factors
3. Grade can be misleading (A-F) when based mostly on placeholders

**Recommendation:**
- Show "Insufficient Data" for politicians below confidence threshold
- Only compute score for politicians with 3+ factors available

---

## Missing Features / Incomplete

### Voting Alignment Algorithm Incomplete
**Severity:** MEDIUM
**File:** `/Users/kirolosabdalla/Snitched.ai/lib/corruption-score.ts` (lines 252-303)

The voting alignment scoring is acknowledged as incomplete:
```typescript
// Factor 3: Voting Alignment with Donor Interests (25%)
// "Placeholder until voting data flows in"
```

**Current state:**
- Uses keyword matching on bill title/summary
- No actual voting record analysis against donor positions
- Votes are fetched but not correlated with campaign donations

**Required to complete:**
1. Map donors to their industry/issue positions (AIPAC → Israel, etc.)
2. Track voting patterns on bills related to each donor's interests
3. Calculate correlation between votes and donor funding

---

### Social Media Scraper Integration Fragile
**Severity:** MEDIUM
**Files:**
- `/Users/kirolosabdalla/Snitched.ai/scripts/sync-social-media.ts`
- Python scrapers in `/Users/kirolosabdalla/Snitched.ai/scrapers/`

**Issues:**
1. Python scraper runs via `spawn()` with no timeout
2. Output file location hardcoded
3. RPC call to create table may fail silently with comment `// RPC might not exist, that's OK` (line 199)
4. No recovery if scraper hangs

**Action Required:**
1. Add 5-min timeout to Python subprocess
2. Use environment variables for output paths
3. Fail explicitly if table doesn't exist instead of silently continuing

---

### LDA API Deprecation Not Handled
**Severity:** LOW-MEDIUM
**File:** `/Users/kirolosabdalla/Snitched.ai/app/api/lobbying/route.ts` (lines 10-11, 145-149)

The Senate LDA API sunsets **June 30, 2026**:
```typescript
deprecationNotice: 'This API will be sunset on June 30, 2026. Migrate to lda.gov.',
successorApi: 'https://lda.gov/api/v1/',
```

**Status:**
- New lda.gov API endpoint is identified but not yet integrated
- No migration plan documented
- Response includes deprecation notice but no migration code

**Action Required:**
Create parallel integration with lda.gov API before June 2026.

---

## Fragile Areas

### Supabase Client Initialization
**Severity:** MEDIUM
**File:** `/Users/kirolosabdalla/Snitched.ai/lib/supabase-server.ts`

Multiple clients are cached as module-level singletons:
```typescript
let _supabase: SupabaseClient | null = null;
let _serviceRoleSupabase: SupabaseClient | null = null;
```

**Risks:**
1. Env var changes after initialization won't update client
2. Race condition if called during env variable setup
3. Fallback to `NEXT_PUBLIC_` keys may leak anon key to client

**Better approach:**
- Create clients on-demand instead of caching
- Or validate env vars at startup once

---

### No Input Validation for Numeric Ranges
**Severity:** LOW-MEDIUM
**Files:**
- `/Users/kirolosabdalla/Snitched.ai/app/api/fec/candidates/route.ts` (line 44)
- `/Users/kirolosabdalla/Snitched.ai/app/api/lobbying/route.ts` (line 72)

Pagination parameters are parsed but not validated for reasonable ranges:
```typescript
const perPage = Math.min(Number(searchParams.get('per_page') || '20'), 100);
```

**Issue:**
- No minimum value check (could be 0 or negative)
- No validation of page numbers (could be negative)
- NaN handling for invalid integers missing

**Recommendation:**
```typescript
const perPage = Math.max(1, Math.min(Number(searchParams.get('per_page') || '20'), 100));
const page = Math.max(1, Number(searchParams.get('page') || '1'));
```

---

### Unstructured Error Responses
**Severity:** LOW
**Files:**
- Multiple API routes return inconsistent error shapes
- Some return `{ error: string }`, others return `{ error, details }`
- `fecErrorResponse()` helper in `/Users/kirolosabdalla/Snitched.ai/lib/fec-client.ts` normalizes FEC errors but not used everywhere

**Action Required:**
Create middleware or wrapper to standardize all error responses.

---

### No Query Parameter Allowlisting
**Severity:** LOW
**Files:** All API routes

Query parameters are passed directly to external APIs:
```typescript
// app/api/lobbying/route.ts, lines 74-93
if (year) ldaParams.set('filing_year', year);
if (registrant) ldaParams.set('registrant_name', registrant);
// ... many more
```

While safe for string params, unexpected parameters could break API contracts.

**Recommendation:**
Explicitly define which parameters are accepted and reject others.

---

## TODOs Found

### Dashboard HTML TODO
**File:** `dashboard.html` (line 332)
```html
<!-- TODO -->
```

Incomplete comment marker - purpose unclear.

---

### Documentation Template (Not a Code TODO)
**File:** `docs/TICKETS.md` (line 114)
```markdown
### [TICK-XXX] Title
```

This is a documentation template, not a code concern.

---

## Priority Issues (Ranked)

### 🔴 P0: CRITICAL (Do Immediately)

1. **Rotate Supabase Service Role Key** (`scripts/sync-social-media.ts:30-32`)
   - Hardcoded JWT token exposed in source code
   - Bypass of all RLS policies possible
   - Must rotate before any further commits

2. **Validate Environment Variables at Startup**
   - Prevent runtime failures from missing secrets
   - Create validation script that runs before server starts

### 🔴 P1: HIGH (This Sprint)

3. **Add Input Validation to API Endpoints**
   - `/app/api/bills/search/route.ts` - sanitize `q` parameter
   - `/app/api/lobbying/route.ts` - validate numeric ranges
   - Max length checks, NaN handling, bounds validation

4. **Fix JSON Parsing in Scripts**
   - Wrap all `JSON.parse()` calls in try-catch
   - Files: `sync-social-media.ts`, `social-media-daemon.ts`, data-ingestion scripts

5. **Strengthen Type Safety**
   - Replace 55+ `any` usages with proper types
   - Create interfaces for API responses
   - Use type guards for polymorphic data

### 🟡 P2: MEDIUM (Next Sprint)

6. **Refactor Large Files**
   - Break up 1200-line `app/politician/[id]/page.tsx`
   - Extract voting, contributions, social tabs into sub-components
   - Split sync scripts into modular functions

7. **Implement Cron Job Retry Logic**
   - Add exponential backoff for transient failures
   - Queue failed items for retry in next cycle
   - Improve rate-limit handling

8. **Create Politician Direct Lookup API**
   - Replace `/api/politicians` full dataset load
   - Add `/api/politicians/[id]` endpoint
   - Improve politician page performance

9. **Migration Plan for LDA API Deprecation**
   - Integrate lda.gov API before June 30, 2026
   - Test parity with senate.lda.gov API
   - Plan cutover date

### 🟢 P3: LOW (Next Quarter)

10. **Consolidate Hardcoded Constants**
    - Move Israel lobby committee IDs to single source
    - Extract magic numbers and thresholds to config

11. **Standardize Error Responses**
    - Create consistent error response format
    - Document error codes and meanings

12. **Review Corruption Score Confidence Levels**
    - Audit placeholder score impact on grades
    - Consider hiding low-confidence scores

---

## Summary

**Total Issues Found:** 27
**Critical:** 1 (hardcoded secret)
**High:** 4 (input validation, JSON parsing, type safety, env validation)
**Medium:** 9 (performance, error handling, type safety, API design)
**Low:** 8 (code organization, standards, deprecation planning)

**Action Items:** 32
**Estimated Effort:** 2-3 weeks for P0-P1, 2-3 weeks for P2

**Immediate Risk:** Hardcoded Supabase service key must be rotated before any deployment or further work.

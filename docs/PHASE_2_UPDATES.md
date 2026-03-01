# Snitched.ai Phase 2 Updates - Feb 22, 2026

## User Feedback Implemented

### 1. Hierarchical Navigation Sidebar (ADDED)

**File:** `components/HierarchySidebar.tsx`

**Features:**
- Fixed left sidebar (280px width) matching the reference design
- FLORIDA HIERARCHY header
- Collapsible sections with animated arrows
- Count badges for each level (30 federal, 160 state legislature, etc.)
- Hover effects with red accent border
- Dark background (#0f1419) matching political theme

**Structure:**
```
🏛️ Federal Delegation (30) ▼
   ├── U.S. Senate (2)
   └── U.S. House (28)
⚖️ State Executive (7)
🏛️ State Legislature (160) ▼
   ├── State Senate (40)
   └── State House (120)
🏛️ County Government (67)
🏛️ Municipal Government (411)
📚 School Boards (67)
```

**Phase 2 Notice:**
Bottom panel explains that county, municipal, and school board data will be added after federal/state indexing is complete.

### 2. Social Media Handle Database Schema (UPDATED)

**File:** `lib/types.ts`

**New Structure:**
```typescript
socialMedia?: {
  twitterHandle?: string;        // e.g., "SenRickScott"
  twitterUserId?: string;         // e.g., "15639647" (for API scraping)
  facebookPageId?: string;        // e.g., "100044557097603" (for API scraping)
  facebookPageUrl?: string;       // Full URL for display
  instagramHandle?: string;       // e.g., "flgovrondesantis"
  instagramUserId?: string;       // For API scraping
  tiktokHandle?: string;          // Future support
  youtubeChannelId?: string;      // Future support
}
```

**Rationale:**
- Handles alone are not enough for API scraping (need user IDs and page IDs)
- Structured format supports the GitHub scraper tools shared by user:
  - `social-analyzer` (multi-platform OSINT)
  - `TwitterUserScraper` (requires Twitter user ID)
  - `facebook-scraper` (requires Facebook page ID)
  - Custom OpenClaw scrapers for Instagram, TikTok, YouTube

### 3. Database Schema Documentation (NEW)

**File:** `docs/DATABASE_SCHEMA.md`

**Complete Supabase PostgreSQL schema including:**

**Tables:**
- `politicians` - Core table with politician_id, name, office, social handles
- `contributions` - Campaign finance (FEC, OpenSecrets)
- `court_cases` - Legal records (OpenClaw legal agent)
- `votes` - Legislative voting records
- `social_posts` - Scraped social media posts with deletion tracking
- `politician_tags` - Tag system (Ethics Complaint, Litigation, etc.)
- `jurisdictions` - Hierarchical organization
- `scraper_logs` - Data ingestion tracking
- `user_alerts` - User-submitted tips and watchlists

**Indexes:**
- Optimized for search (office_level, party, jurisdiction, twitter_handle, facebook_page_id)
- Performance indexes on corruption_score, aipac funding, dates

**Row Level Security (RLS):**
- Public read access (political data is public record)
- Admin-only write access (authenticated users with admin role)

**Data Ingestion Pipelines:**
- Social Media: Daily scrapes via Vercel Cron Jobs
- FEC/OpenSecrets: Weekly campaign finance updates
- OpenClaw Legal: Weekly court record searches
- Sentiment Analysis: Claude API for social post sentiment

### 4. Mock Data Updated (ALL POLITICIANS)

**File:** `lib/mock-data.ts`

All 8 demo politicians now have complete social media handle data:

**Example:**
```typescript
{
  name: 'Rick Scott',
  socialMedia: {
    twitterHandle: 'SenRickScott',
    twitterUserId: '15639647',
    facebookPageId: '100044557097603',
    facebookPageUrl: 'https://www.facebook.com/SenatorRickScott',
  }
}
```

**Politicians updated:**
1. Rick Scott (Twitter + Facebook)
2. Marco Rubio (Twitter + Facebook)
3. Ron DeSantis (Twitter + Facebook + Instagram)
4. Debbie Wasserman Schultz (Twitter + Facebook)
5. Jeanette Núñez (Twitter + Facebook)
6. Donna Shalala (Twitter + Facebook)
7. Val Demings (Twitter + Facebook)
8. Brian Mast (Twitter + Facebook)

### 5. Politician Profile Pages Updated

**File:** `app/politician/[id]/page.tsx`

**Changes:**
- Social Media section now reads from new handle structure
- Displays Twitter, Facebook, Instagram, YouTube links
- Shows handles for Twitter/Instagram (e.g., "@SenRickScott")
- Shows "Facebook Page" and "YouTube Channel" for page URLs
- Graceful handling of missing social media data

### 6. Layout Updated with Sidebar

**File:** `app/layout.tsx`

**Changes:**
- Added `<HierarchySidebar />` component
- Main content shifted right with `marginLeft: '280px'`
- Fixed positioning to keep sidebar visible while scrolling
- Responsive min-height calculation: `calc(100vh - 64px)` (accounts for header)

## GitHub Repos Referenced

User shared 5 scraper repos for Phase 2 implementation:

1. **social-analyzer** (`qeeqbox/social-analyzer`)
   - Multi-platform OSINT tool
   - Supports Twitter, Facebook, Instagram, TikTok, LinkedIn, etc.
   - Can extract profile data, posts, followers, etc.

2. **openFEC** (`fecgov/openFEC`)
   - Official FEC API client
   - Campaign finance data for federal candidates
   - Donor information, PAC contributions, expenditures

3. **OpenPlanter** (`ShinMegamiBoson/OpenPlanter`)
   - OSINT framework for investigations
   - Court records, legal documents, public filings
   - Integrates with OpenClaw legal agent

4. **facebook-scraper** (`kevinzg/facebook-scraper`)
   - Scrape Facebook pages without API
   - Extract posts, reactions, shares, comments
   - Supports deleted post detection

5. **TwitterUserScraper** (`scoliann/TwitterUserScraper`)
   - Extract Twitter user profiles and tweets
   - No API key required
   - Handles rate limiting and pagination

## Next Steps

**Immediate (Phase 2 Kickoff):**
1. ✅ Hierarchical sidebar navigation (DONE)
2. ✅ Social media handle schema (DONE)
3. ✅ Database schema documentation (DONE)
4. Clone and test GitHub scraper repos locally
5. Create Supabase project and run SQL migrations
6. Obtain API keys (FEC, OpenSecrets, social platforms)

**Phase 2 Development (4-6 weeks):**
1. Build social media scraper orchestration (Vercel Cron Jobs)
2. Integrate FEC/OpenSecrets APIs for campaign finance
3. Deploy OpenClaw legal agent for court records
4. Build admin dashboard for data QA
5. Add interactive Florida map (Mapbox)
6. Implement network/relationship graphs (D3.js)
7. Expand from 8 demo politicians to 50+ real profiles

**Phase 3 (Future):**
- User accounts and saved searches
- Email/SMS alerts for tracked politicians
- Advanced filtering (by funding source, issue area, district)
- Export reports (PDF, CSV)
- Community features (user-submitted tips with moderation)

## Design Consistency

All changes maintain the black & red political accountability aesthetic:
- Sidebar: Dark background (#0f1419) with red hover accents (#ef4444)
- Typography: Clean, professional (Inter font family)
- No generic AI aesthetics (avoided purple gradients, cliched patterns)
- Serious investigative journalism vibe (not SaaS dashboard)

## Deployment Notes

**Branch:** `snitched-ai` (master)
**Vercel URL:** https://snitched-ai.vercel.app
**Next Deployment:** Will include hierarchical sidebar and updated social media schema

**Files Changed This Session:**
- `components/HierarchySidebar.tsx` (NEW)
- `app/layout.tsx` (sidebar integration)
- `lib/types.ts` (social media handle schema)
- `lib/mock-data.ts` (all 8 politicians updated)
- `app/politician/[id]/page.tsx` (social media display)
- `docs/DATABASE_SCHEMA.md` (NEW)
- `docs/PHASE_2_UPDATES.md` (NEW - this file)

**Estimated Build Time:** ~30 seconds (Next.js static generation + Vercel deployment)

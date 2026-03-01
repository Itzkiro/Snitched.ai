# Snitched.ai Database Schema (Supabase PostgreSQL)

## Phase 2 Data Architecture

### Core Tables

#### politicians
Primary table for all elected officials and candidates.

```sql
CREATE TABLE politicians (
  politician_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  office TEXT NOT NULL,
  office_level TEXT NOT NULL,
  party TEXT NOT NULL,
  district TEXT,
  jurisdiction TEXT NOT NULL,
  jurisdiction_type TEXT NOT NULL,
  photo_url TEXT,
  corruption_score INTEGER CHECK (corruption_score >= 0 AND corruption_score <= 100),
  juice_box_tier TEXT CHECK (juice_box_tier IN ('none', 'juicebox', 'big_gulp', 'fire_hydrant')),
  aipac_funding_total DECIMAL(12,2) DEFAULT 0,
  term_start DATE,
  term_end DATE,
  years_in_office INTEGER,
  is_active BOOLEAN DEFAULT true,
  bio TEXT,
  
  -- Social Media Handles
  twitter_handle TEXT,
  twitter_user_id TEXT,
  facebook_page_id TEXT,
  facebook_page_url TEXT,
  instagram_handle TEXT,
  instagram_user_id TEXT,
  tiktok_handle TEXT,
  youtube_channel_id TEXT,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_scraped TIMESTAMP
);

-- Indexes
CREATE INDEX idx_politicians_office_level ON politicians(office_level);
CREATE INDEX idx_politicians_party ON politicians(party);
CREATE INDEX idx_politicians_jurisdiction ON politicians(jurisdiction);
CREATE INDEX idx_politicians_active ON politicians(is_active);
CREATE INDEX idx_politicians_corruption_score ON politicians(corruption_score);
CREATE INDEX idx_politicians_twitter ON politicians(twitter_handle);
CREATE INDEX idx_politicians_facebook ON politicians(facebook_page_id);
```

#### contributions
Campaign finance and donor data (FEC, OpenSecrets).

```sql
CREATE TABLE contributions (
  contribution_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  politician_id UUID REFERENCES politicians(politician_id) ON DELETE CASCADE,
  donor_name TEXT NOT NULL,
  donor_type TEXT CHECK (donor_type IN ('PAC', 'Individual', 'Corporate', 'SuperPAC')),
  amount DECIMAL(12,2) NOT NULL,
  date DATE NOT NULL,
  is_aipac BOOLEAN DEFAULT false,
  fec_id TEXT,
  source TEXT, -- 'FEC', 'OpenSecrets', etc.
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_contributions_politician ON contributions(politician_id);
CREATE INDEX idx_contributions_is_aipac ON contributions(is_aipac);
CREATE INDEX idx_contributions_date ON contributions(date);
CREATE INDEX idx_contributions_amount ON contributions(amount);
```

#### court_cases
Legal records from OpenClaw legal agent pipeline.

```sql
CREATE TABLE court_cases (
  case_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  politician_id UUID REFERENCES politicians(politician_id) ON DELETE CASCADE,
  case_number TEXT NOT NULL,
  court TEXT NOT NULL,
  case_type TEXT,
  status TEXT CHECK (status IN ('Active', 'Closed', 'Pending', 'Dismissed')),
  summary TEXT,
  filed_date DATE,
  closed_date DATE,
  disposition TEXT,
  source_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_court_cases_politician ON court_cases(politician_id);
CREATE INDEX idx_court_cases_status ON court_cases(status);
CREATE INDEX idx_court_cases_filed_date ON court_cases(filed_date);
```

#### votes
Legislative voting records.

```sql
CREATE TABLE votes (
  vote_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  politician_id UUID REFERENCES politicians(politician_id) ON DELETE CASCADE,
  bill_number TEXT NOT NULL,
  bill_title TEXT NOT NULL,
  vote_value TEXT CHECK (vote_value IN ('Yes', 'No', 'Abstain', 'Absent')),
  date DATE NOT NULL,
  bill_summary TEXT,
  category TEXT,
  is_israel_related BOOLEAN DEFAULT false,
  source TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_votes_politician ON votes(politician_id);
CREATE INDEX idx_votes_date ON votes(date);
CREATE INDEX idx_votes_israel_related ON votes(is_israel_related);
```

#### social_posts
Social media posts scraped from all platforms.

```sql
CREATE TABLE social_posts (
  post_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  politician_id UUID REFERENCES politicians(politician_id) ON DELETE CASCADE,
  platform TEXT CHECK (platform IN ('Twitter', 'Facebook', 'Instagram', 'TikTok', 'YouTube')),
  content TEXT,
  post_url TEXT,
  posted_at TIMESTAMP NOT NULL,
  sentiment_score DECIMAL(3,2), -- -1.00 to 1.00
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMP,
  likes_count INTEGER,
  shares_count INTEGER,
  comments_count INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_social_posts_politician ON social_posts(politician_id);
CREATE INDEX idx_social_posts_platform ON social_posts(platform);
CREATE INDEX idx_social_posts_posted_at ON social_posts(posted_at);
CREATE INDEX idx_social_posts_is_deleted ON social_posts(is_deleted);
```

#### tags
Politician tags (Ethics Complaint, Litigation, etc.).

```sql
CREATE TABLE politician_tags (
  tag_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  politician_id UUID REFERENCES politicians(politician_id) ON DELETE CASCADE,
  tag_type TEXT NOT NULL,
  tag_label TEXT NOT NULL,
  tag_color TEXT,
  tag_value TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_politician_tags_politician ON politician_tags(politician_id);
CREATE INDEX idx_politician_tags_type ON politician_tags(tag_type);
```

#### jurisdictions
Hierarchical organization (Federal → State → County → Municipal).

```sql
CREATE TABLE jurisdictions (
  jurisdiction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('federal', 'state_executive', 'state_legislature', 'county', 'municipal', 'special_district')),
  parent_id UUID REFERENCES jurisdictions(jurisdiction_id),
  politician_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_jurisdictions_type ON jurisdictions(type);
CREATE INDEX idx_jurisdictions_parent ON jurisdictions(parent_id);
```

### Supporting Tables

#### scraper_logs
Track all data ingestion runs.

```sql
CREATE TABLE scraper_logs (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scraper_name TEXT NOT NULL, -- 'fec_api', 'twitter_scraper', 'openclaw_legal', etc.
  status TEXT CHECK (status IN ('running', 'success', 'failed')),
  records_processed INTEGER,
  error_message TEXT,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);
```

#### user_alerts
User-submitted tips and watchlists.

```sql
CREATE TABLE user_alerts (
  alert_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  politician_id UUID REFERENCES politicians(politician_id),
  user_email TEXT,
  alert_type TEXT CHECK (alert_type IN ('funding_change', 'new_case', 'deleted_post', 'vote_alert')),
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Row Level Security (RLS)

All tables are publicly readable (political data is public record).
Only authenticated admin users can write/update.

```sql
-- Enable RLS
ALTER TABLE politicians ENABLE ROW LEVEL SECURITY;
ALTER TABLE contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE court_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

-- Public read policy
CREATE POLICY "Allow public read access" ON politicians FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON contributions FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON court_cases FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON votes FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON social_posts FOR SELECT USING (true);

-- Admin write policy (requires authenticated user with admin role)
CREATE POLICY "Allow admin write access" ON politicians FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "Allow admin write access" ON contributions FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
-- (repeat for all tables)
```

## Data Ingestion Pipelines

### Social Media Scrapers (Phase 2)

**Tools:**
- `social-analyzer` (qeeqbox/social-analyzer) - Multi-platform OSINT
- `TwitterUserScraper` (scoliann/TwitterUserScraper) - Twitter profiles and tweets
- `facebook-scraper` (kevinzg/facebook-scraper) - Facebook posts
- OpenClaw custom scrapers for Instagram, TikTok, YouTube

**Workflow:**
1. Read `politicians.twitter_handle` from database
2. Scrape recent posts (last 30 days)
3. Store in `social_posts` table
4. Run sentiment analysis via Claude API
5. Track deletions (compare previous scrapes)
6. Schedule: Daily via Vercel Cron Jobs

### FEC & OpenSecrets API (Phase 2)

**Tools:**
- `openFEC` (fecgov/openFEC) - Official FEC API client
- OpenSecrets API (via HTTP requests)

**Workflow:**
1. Read `politicians.politician_id` from database
2. Query FEC API for contributions (last 2 election cycles)
3. Filter AIPAC donations (match donor names/PAC IDs)
4. Store in `contributions` table
5. Update `aipac_funding_total` and `juice_box_tier`
6. Schedule: Weekly via Vercel Cron Jobs

### OpenClaw Legal Agent (Phase 2)

**Tool:** `OpenPlanter` (ShinMegamiBoson/OpenPlanter) - OSINT framework

**Workflow:**
1. Run court record searches for each politician
2. Parse case documents
3. Store in `court_cases` table
4. Update corruption score based on legal issues
5. Schedule: Weekly via isolated agent session

## Estimated Data Volume

**Year 1:**
- Politicians: 5,000 - 8,000 (Florida only)
- Contributions: 500K - 1M (2-4 election cycles)
- Court Cases: 10K - 50K (varies by office level)
- Votes: 100K - 500K (federal + state legislatures)
- Social Posts: 2M - 5M (daily scraping)

**Storage:** ~10-50 GB database, ~100 GB attachments (PDFs, images)

## Next Steps

1. ✅ Define schema (this document)
2. Create Supabase project
3. Run SQL migrations
4. Set up Vercel Cron Jobs for scrapers
5. Configure API keys (FEC, OpenSecrets, social platforms)
6. Build admin dashboard for data QA
7. Deploy OpenClaw agents for legal pipeline

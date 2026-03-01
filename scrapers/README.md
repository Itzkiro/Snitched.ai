# Snitched.ai Research Scrapers

Automated data collection tools for political research.

## Overview

This directory contains integrated scraping tools for:
- **Social Media** - Twitter, Facebook, Instagram posts
- **Campaign Finance** - FEC contributions and AIPAC funding
- **Legal Records** - Court cases, ethics complaints, investigations

## Installation

### 1. Python Dependencies

```bash
cd /Users/jaketad/.openclaw/workspace/snitched-ai/scrapers
pip install -r requirements.txt
```

### 2. Install OpenPlanter (OSINT framework)

```bash
cd OpenPlanter
pip install -e .
```

### 3. Install facebook-scraper

```bash
cd facebook-scraper
pip install -e .
```

### 4. Environment Variables

Create a `.env` file in the scrapers directory:

```bash
# Database
SUPABASE_DB_URL=postgresql://user:pass@host:5432/database

# FEC API (required)
# Get your key at: https://api.open.fec.gov/developers/
FEC_API_KEY=your_fec_api_key_here

# Optional: Enhanced data collection
EXA_API_KEY=your_exa_key  # For web search
TWITTER_BEARER_TOKEN=your_twitter_token
FACEBOOK_COOKIES_PATH=/path/to/cookies.txt
```

## Usage

### Social Media Scraper

```bash
# Test mode (no database required)
python scrape-social-media.py --test

# Scrape specific politician
python scrape-social-media.py --politician "Ron DeSantis" --platforms twitter,facebook

# Batch scrape from database
python scrape-social-media.py --batch --limit 50 --output results.json
```

**Platforms supported:** `twitter`, `facebook`, `instagram`, `tiktok`

**Features:**
- Scrapes last 30 days of posts
- Sentiment analysis on post content
- Tracks likes, shares, comments
- Detects deleted posts (via historical comparison)

### FEC Campaign Finance Scraper

```bash
# Test mode
python scrape-fec-data.py --test

# Search specific candidate
python scrape-fec-data.py --candidate "Ron DeSantis" --cycles 2024,2022

# Batch scrape from database
python scrape-fec-data.py --batch --limit 50
```

**Features:**
- Pulls contributions from last 2 election cycles
- Automatically flags AIPAC-related donors
- Calculates "Juice Box Tier" (none/juicebox/big_gulp/fire_hydrant)
- Supports PAC, Individual, Corporate, SuperPAC classification

**AIPAC Detection Patterns:**
- AIPAC
- American Israel Public Affairs Committee
- United Democracy Project
- Democratic Majority for Israel
- Pro-Israel America
- NORPAC
- J Street PAC

### Legal Records Scraper

```bash
# Test mode
python scrape-legal-records.py --test

# Search specific politician
python scrape-legal-records.py --politician "Ron DeSantis"

# Batch scrape from database
python scrape-legal-records.py --batch --limit 50
```

**Features:**
- Searches web for court cases
- PACER federal court integration (requires authentication)
- State court records
- Ethics commission complaints
- Extracts case numbers, filing dates, dispositions

## Database Schema Integration

All scrapers output JSON matching the Supabase schema:

### Politicians Table
```python
{
    "politician_id": "uuid",
    "name": "Ron DeSantis",
    "office": "Governor",
    "twitter_handle": "GovRonDeSantis",
    "facebook_page_id": "GovRonDeSantis",
    # ... (see DATABASE_SCHEMA.md)
}
```

### Social Posts Table
```python
{
    "politician_id": "uuid",
    "platform": "Twitter",
    "content": "Tweet text...",
    "post_url": "https://twitter.com/...",
    "posted_at": "2024-02-20T12:00:00",
    "likes_count": 150,
    "sentiment_score": 0.25
}
```

### Contributions Table
```python
{
    "politician_id": "uuid",
    "donor_name": "AIPAC",
    "donor_type": "PAC",
    "amount": 5000.00,
    "date": "2024-01-15",
    "is_aipac": true,
    "fec_id": "C00024869"
}
```

### Court Cases Table
```python
{
    "politician_id": "uuid",
    "case_number": "2024-CA-001234",
    "court": "Circuit Court",
    "case_type": "Ethics Complaint",
    "status": "Active",
    "filed_date": "2024-01-10"
}
```

## Automation & Scheduling

### Cron Setup

Add to crontab for daily/weekly runs:

```bash
# Daily social media scrape (3 AM)
0 3 * * * cd /path/to/scrapers && python scrape-social-media.py --batch --limit 100 >> logs/cron.log 2>&1

# Weekly FEC data (Sunday 2 AM)
0 2 * * 0 cd /path/to/scrapers && python scrape-fec-data.py --batch --limit 500 >> logs/cron.log 2>&1

# Weekly legal records (Sunday 4 AM)
0 4 * * 0 cd /path/to/scrapers && python scrape-legal-records.py --batch --limit 100 >> logs/cron.log 2>&1
```

### Vercel Cron Jobs

For serverless deployment, create API routes in your Next.js app:

```typescript
// pages/api/cron/scrape-social.ts
export default async function handler(req, res) {
  // Verify cron secret
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Run scraper
  const result = await fetch('https://your-worker.com/scrape-social', {
    method: 'POST',
    headers: { 'X-API-Key': process.env.SCRAPER_API_KEY }
  });
  
  return res.json(await result.json());
}
```

Then add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/scrape-social",
      "schedule": "0 3 * * *"
    },
    {
      "path": "/api/cron/scrape-fec",
      "schedule": "0 2 * * 0"
    }
  ]
}
```

## Rate Limiting & Error Handling

All scrapers implement:
- **Exponential backoff** on API errors
- **Rate limiting** (2-3 second delays between requests)
- **Retry logic** (3 attempts with increasing delays)
- **Timeout protection** (30-60 second limits)
- **Logging** to `logs/` directory

### Error Recovery

If a scrape fails:
1. Check `logs/*.log` for error details
2. Verify API keys in `.env`
3. Test individual politician with `--politician "Name"`
4. Run with `--test` flag to verify setup

## Data Quality

### Sample Output

Run test mode to generate sample data:

```bash
python scrape-social-media.py --test --output sample-social.json
python scrape-fec-data.py --test --output sample-fec.json
python scrape-legal-records.py --test --output sample-legal.json
```

### Validation

All scrapers validate:
- Required fields are present
- Data types match schema
- Dates are properly formatted
- URLs are valid
- Amounts are numeric

## Monitoring

### Scraper Logs Table

All runs are logged to the database:

```sql
SELECT * FROM scraper_logs 
WHERE scraper_name = 'social-media-scraper' 
ORDER BY started_at DESC 
LIMIT 10;
```

### Metrics Dashboard

Track:
- Politicians processed per run
- Records inserted
- Error rates
- Average duration
- API quota usage

## Architecture

```
scrapers/
├── db_helper.py                 # Database connection & insert helpers
├── scrape-social-media.py       # Social media scraper
├── scrape-fec-data.py          # FEC campaign finance scraper
├── scrape-legal-records.py     # Court records scraper
├── requirements.txt            # Python dependencies
├── .env                        # API keys (gitignored)
├── logs/                       # Scraper logs
├── social-analyzer/            # OSINT tool (GitHub: qeeqbox/social-analyzer)
├── facebook-scraper/           # Facebook tool (GitHub: kevinzg/facebook-scraper)
├── TwitterUserScraper/         # Twitter tool (GitHub: scoliann/TwitterUserScraper)
├── OpenPlanter/               # OSINT framework (GitHub: ShinMegamiBoson/OpenPlanter)
└── openFEC/                   # FEC API (using direct requests instead)
```

## API Keys Required

### Required
- **FEC API Key** - Free, instant approval at https://api.open.fec.gov/developers/

### Optional (for enhanced data)
- **Twitter API Bearer Token** - For high-volume scraping
- **Facebook Cookies** - Extract from browser after login
- **EXA API Key** - For advanced web search
- **PACER Account** - For federal court records ($)

## Troubleshooting

### "No module named 'facebook_scraper'"
```bash
cd facebook-scraper && pip install -e .
```

### "SUPABASE_DB_URL not set"
Create `.env` file with database connection string or run in `--test` mode.

### "FEC_API_KEY environment variable not set"
Get your free API key at https://api.open.fec.gov/developers/

### Social media scraping returns no results
- Twitter: Requires authentication for large-scale scraping
- Facebook: May need cookies from logged-in browser session
- Instagram: Requires authentication

## Contributing

To add a new scraper:

1. Create `scrape-[source].py`
2. Inherit from `DatabaseHelper`
3. Implement `scrape_*` methods
4. Add to `requirements.txt`
5. Document in this README
6. Add test mode support

## License

See individual tool licenses in their subdirectories.

## Support

Issues? Check:
- Database schema: `../docs/DATABASE_SCHEMA.md`
- Logs: `logs/*.log`
- GitHub repos for integrated tools (see Architecture section)

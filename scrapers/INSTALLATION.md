# Snitched.ai Scrapers - Installation Guide

Complete setup instructions for production-ready political research automation.

## Prerequisites

- **Python 3.10+** (Check: `python3 --version`)
- **Git** (Check: `git --version`)
- **PostgreSQL access** (Supabase account recommended)
- **FEC API Key** (Free, get at: https://api.open.fec.gov/developers/)

## Quick Start (5 minutes)

```bash
# 1. Navigate to scrapers directory
cd /Users/jaketad/.openclaw/workspace/snitched-ai/scrapers

# 2. Create Python virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# 3. Install Python dependencies
pip install -r requirements.txt

# 4. Install facebook-scraper
cd facebook-scraper
pip install -e .
cd ..

# 5. Install OpenPlanter (optional, for advanced OSINT)
cd OpenPlanter
pip install -e .
cd ..

# 6. Configure environment variables
cp .env.example .env
nano .env  # Edit with your API keys

# 7. Test the setup
python scrape-social-media.py --test
python scrape-fec-data.py --test
python scrape-legal-records.py --test
```

## Detailed Setup

### 1. Virtual Environment

Always use a virtual environment to avoid dependency conflicts:

```bash
python3 -m venv venv
source venv/bin/activate

# Verify activation (should show venv path)
which python
```

### 2. Install Core Dependencies

```bash
pip install -r requirements.txt
```

This installs:
- `facebook-scraper` - Facebook page scraping
- `requests` - HTTP client for APIs
- `python-dotenv` - Environment variable management
- `pandas` - Data processing
- `psycopg2-binary` - PostgreSQL adapter (for Supabase)
- `textblob` - Sentiment analysis
- `selenium` - Browser automation (for Twitter)
- `webdriver-manager` - Automatic browser driver management

### 3. Install GitHub Tools

#### Facebook Scraper
```bash
cd facebook-scraper
pip install -e .
cd ..
```

#### OpenPlanter (Advanced OSINT)
```bash
cd OpenPlanter
pip install -e .
cd ..

# Configure OpenPlanter API keys
openplanter-agent --configure-keys
```

#### Social Analyzer (Multi-platform OSINT)
```bash
# Node.js version (requires npm)
cd social-analyzer
npm install
cd ..

# OR Python version
pip install social-analyzer
```

#### Twitter User Scraper
```bash
# Already included, uses Selenium
# Requires Chrome/Chromium browser installed
```

### 4. Environment Configuration

Create `.env` file:

```bash
# Database Connection (Supabase)
SUPABASE_DB_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres

# FEC API (REQUIRED - Free API key)
# Register at: https://api.open.fec.gov/developers/
FEC_API_KEY=your_fec_api_key_here

# Social Media APIs (Optional - enhances data collection)
TWITTER_BEARER_TOKEN=your_twitter_bearer_token
FACEBOOK_COOKIES_PATH=/path/to/facebook_cookies.txt

# Web Search (Optional - for OpenPlanter)
EXA_API_KEY=your_exa_api_key

# OpenAI/Anthropic (Optional - for sentiment analysis)
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
```

### 5. Database Setup

#### Option A: Supabase (Recommended)

1. Create Supabase account: https://supabase.com
2. Create new project
3. Run migrations from `../docs/DATABASE_SCHEMA.md`
4. Copy connection string to `.env`

```sql
-- In Supabase SQL Editor, run:
-- (Copy schema from DATABASE_SCHEMA.md)
CREATE TABLE politicians ( ... );
CREATE TABLE contributions ( ... );
CREATE TABLE court_cases ( ... );
CREATE TABLE social_posts ( ... );
-- etc.
```

#### Option B: Local PostgreSQL

```bash
# Install PostgreSQL
brew install postgresql  # macOS
# OR
sudo apt-get install postgresql  # Linux

# Create database
createdb snitched_ai

# Set connection string
export SUPABASE_DB_URL=postgresql://localhost:5432/snitched_ai
```

### 6. Browser Setup (for Social Media Scraping)

```bash
# Install Chrome/Chromium
brew install --cask google-chrome  # macOS

# OR use system Chrome
# Selenium will auto-download ChromeDriver via webdriver-manager
```

### 7. Facebook Cookies (Optional)

For better Facebook scraping results:

1. Install browser extension:
   - Chrome: [Get cookies.txt LOCALLY](https://chrome.google.com/webstore/detail/cclelndahbckbenkjhflpdbgdldlbecc)
   - Firefox: [Cookie Quick Manager](https://addons.mozilla.org/en-US/firefox/addon/cookie-quick-manager/)

2. Log into Facebook
3. Export cookies as `cookies.txt` (Netscape format)
4. Save to `/path/to/facebook_cookies.txt`
5. Set `FACEBOOK_COOKIES_PATH` in `.env`

### 8. Verify Installation

```bash
# Test each scraper
python scrape-social-media.py --test
python scrape-fec-data.py --test
python scrape-legal-records.py --test

# Check logs
cat logs/social-media.log
cat logs/fec-data.log
cat logs/legal-records.log
```

Expected output:
```
[
  {
    "politician_id": "test-123",
    "platform": "Twitter",
    "content": "Sample tweet...",
    ...
  }
]
```

## Troubleshooting

### "No module named 'facebook_scraper'"

```bash
cd facebook-scraper
pip install -e .
```

### "No module named 'selenium'"

```bash
pip install selenium webdriver-manager
```

### "ChromeDriver not found"

```bash
# Install Chrome browser first, then:
pip install webdriver-manager
# Driver will auto-download on first run
```

### "SUPABASE_DB_URL not set"

Either:
1. Set in `.env` file
2. Run with `--test` flag (no database needed)

### "FEC_API_KEY environment variable not set"

Get free API key:
1. Visit https://api.open.fec.gov/developers/
2. Click "Get API Key"
3. Add to `.env` file

### Database connection fails

```bash
# Test connection
psql $SUPABASE_DB_URL

# Verify credentials
echo $SUPABASE_DB_URL

# Check Supabase project status
# https://app.supabase.com/project/[project-id]
```

### Rate limiting / API errors

All scrapers have built-in rate limiting (2-3 sec delays). If you hit limits:

1. Reduce `--limit` parameter
2. Increase delays in scraper code
3. Use `--batch` mode with smaller chunks
4. Space out cron jobs

## Production Deployment

### Option 1: Linux Server / VPS

```bash
# Clone repo
git clone https://github.com/your-repo/snitched-ai.git
cd snitched-ai/scrapers

# Setup virtual environment
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Configure environment
nano .env

# Setup cron jobs
crontab -e

# Add:
0 3 * * * cd /path/to/scrapers && /path/to/venv/bin/python scrape-social-media.py --batch --limit 100
0 2 * * 0 cd /path/to/scrapers && /path/to/venv/bin/python scrape-fec-data.py --batch --limit 500
```

### Option 2: Docker Container

```bash
# Create Dockerfile
cat > Dockerfile <<EOF
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["python", "scrape-social-media.py", "--batch"]
EOF

# Build and run
docker build -t snitched-scrapers .
docker run -e SUPABASE_DB_URL=... -e FEC_API_KEY=... snitched-scrapers
```

### Option 3: Vercel Cron + Worker

See README.md "Automation & Scheduling" section.

## Security Best Practices

1. **Never commit `.env` file to git**
   ```bash
   echo ".env" >> .gitignore
   ```

2. **Use environment variables for secrets**
   - Never hardcode API keys
   - Rotate keys regularly

3. **Restrict database access**
   - Use read-only credentials for scrapers
   - Separate admin credentials

4. **Monitor logs for errors**
   ```bash
   tail -f logs/*.log
   ```

5. **Set up alerts for failures**
   - Email notifications
   - Slack/Discord webhooks
   - Monitoring services (Sentry, etc.)

## Performance Optimization

### Parallel Processing

```python
# Run multiple scrapers concurrently
python scrape-social-media.py --batch --limit 50 &
python scrape-fec-data.py --batch --limit 50 &
wait
```

### Database Indexing

Ensure indexes exist (from DATABASE_SCHEMA.md):
```sql
CREATE INDEX idx_politicians_twitter ON politicians(twitter_handle);
CREATE INDEX idx_social_posts_politician ON social_posts(politician_id);
CREATE INDEX idx_contributions_politician ON contributions(politician_id);
```

### Caching

For repeated scrapes, cache politician data:
```python
# In db_helper.py, add Redis cache
import redis
cache = redis.Redis(host='localhost', port=6379)
```

## Monitoring & Maintenance

### Check Scraper Health

```bash
# View recent logs
tail -n 100 logs/social-media.log

# Check database stats
psql $SUPABASE_DB_URL -c "SELECT scraper_name, COUNT(*), AVG(records_processed) FROM scraper_logs GROUP BY scraper_name;"

# Verify data freshness
psql $SUPABASE_DB_URL -c "SELECT name, last_scraped FROM politicians WHERE last_scraped < NOW() - INTERVAL '7 days';"
```

### Update Dependencies

```bash
source venv/bin/activate
pip install --upgrade -r requirements.txt

# Test after upgrade
python scrape-social-media.py --test
```

## Next Steps

1. ✅ Installation complete
2. 📊 Run initial batch scrape
3. ⏰ Set up cron jobs
4. 📈 Monitor logs and metrics
5. 🚀 Deploy to production

Questions? Check:
- README.md - Usage examples
- DATABASE_SCHEMA.md - Data structure
- GitHub issues - Integrated tools

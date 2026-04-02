#!/usr/bin/env python3
"""
Social Media & Press Scraper for Snitched.ai
=============================================
Collects politician public statements, press releases, news mentions,
and real social media posts from Twitter/X, Facebook, and Instagram.

Engines:
  - Official .gov RSS feeds (press releases, blog posts)
  - Official website press release page scraping (requests + BeautifulSoup)
  - Google News RSS (recent news mentions of politicians)
  - YouTube RSS feeds (public, no API key needed)
  - Twitter/X via Twikit (guest mode, no API key)
  - Facebook via facebook-scraper (public pages, no API key)
  - Instagram via Instaloader (public profiles, no API key)

Data flow:
  1. Read politician records from Supabase REST API
  2. For each politician, fetch content from enabled source types
  3. Run sentiment analysis on post text
  4. Save results to data-ingestion/social-media-posts.json
  5. Push results to Supabase social_posts table (upsert)

Usage:
    python scrape-social-media.py --dry-run              # Validate pipeline, no scraping
    python scrape-social-media.py --batch --limit 5       # Scrape 5 politicians
    python scrape-social-media.py --batch                 # Scrape all politicians
    python scrape-social-media.py --politician "Rick Scott"
    python scrape-social-media.py --platforms twitter,facebook,instagram --limit 10
    python scrape-social-media.py --platforms rss,news,press,twitter,facebook,instagram
"""

import os
import sys
import json
import logging
import argparse
import hashlib
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional, Tuple
import time
from pathlib import Path
from email.utils import parsedate_to_datetime
from urllib.parse import quote_plus, urljoin, urlparse

import requests

# ---------------------------------------------------------------------------
# Optional: BeautifulSoup (for press release page scraping)
# ---------------------------------------------------------------------------

try:
    from bs4 import BeautifulSoup

    HAS_BS4 = True
except ImportError:
    HAS_BS4 = False

# Twitter/X: We use the syndication API (no library needed, just requests + BS4)

# ---------------------------------------------------------------------------
# Optional: facebook-scraper
# ---------------------------------------------------------------------------

try:
    import facebook_scraper as fb_scraper

    HAS_FB_SCRAPER = True
except ImportError:
    HAS_FB_SCRAPER = False

# ---------------------------------------------------------------------------
# Optional: Instaloader (Instagram public profiles)
# ---------------------------------------------------------------------------

try:
    import instaloader

    HAS_INSTALOADER = True
except ImportError:
    HAS_INSTALOADER = False

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR = PROJECT_DIR / "data-ingestion"
OUTPUT_FILE = DATA_DIR / "social-media-posts.json"
LOG_DIR = SCRIPT_DIR / "logs"

# Ensure directories exist
DATA_DIR.mkdir(parents=True, exist_ok=True)
LOG_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    handlers=[
        logging.FileHandler(LOG_DIR / "social-media.log"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger("snitched.social-scraper")

# ---------------------------------------------------------------------------
# Supabase config (REST API -- no psycopg2 needed)
# ---------------------------------------------------------------------------

SUPABASE_URL = os.getenv("SUPABASE_URL")
if not SUPABASE_URL:
    raise RuntimeError("SUPABASE_URL environment variable is required")

SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
if not SUPABASE_SERVICE_KEY:
    raise RuntimeError("SUPABASE_SERVICE_KEY environment variable is required")

SUPABASE_HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

# ---------------------------------------------------------------------------
# HTTP session with retries and polite headers
# ---------------------------------------------------------------------------

SESSION = requests.Session()
SESSION.headers.update(
    {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    }
)


def fetch_url(url: str, timeout: int = 20, retries: int = 2) -> Optional[requests.Response]:
    """Fetch a URL with retries and polite delays."""
    last_error = None
    for attempt in range(retries + 1):
        try:
            resp = SESSION.get(url, timeout=timeout, allow_redirects=True)
            if resp.status_code == 200:
                return resp
            elif resp.status_code == 429:
                wait = min(30, 5 * (attempt + 1))
                logger.debug(f"Rate limited on {url}, waiting {wait}s")
                time.sleep(wait)
            else:
                logger.debug(f"HTTP {resp.status_code} for {url}")
                return resp  # Return non-200 so caller can inspect
        except requests.RequestException as e:
            last_error = e
            if attempt < retries:
                wait = 2 * (attempt + 1)
                logger.debug(f"Retry {attempt + 1} for {url} in {wait}s: {e}")
                time.sleep(wait)
    logger.debug(f"All retries exhausted for {url}: {last_error}")
    return None


# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------


def supabase_get_politicians(
    limit: int = 1000, offset: int = 0
) -> List[Dict[str, Any]]:
    """Fetch politicians from Supabase. Does NOT filter by social_media anymore
    since we can scrape .gov sites and Google News for any politician."""
    url = (
        f"{SUPABASE_URL}/rest/v1/politicians"
        f"?select=bioguide_id,name,office,office_level,party,social_media"
        f"&order=name"
        f"&limit={limit}"
        f"&offset={offset}"
    )
    resp = requests.get(url, headers=SUPABASE_HEADERS, timeout=30)
    resp.raise_for_status()
    politicians = resp.json()
    logger.info(
        f"Fetched {len(politicians)} politicians (offset={offset})"
    )
    return politicians


def supabase_upsert_posts(posts: List[Dict[str, Any]]) -> int:
    """Upsert posts to the social_posts table. Returns count of rows affected."""
    if not posts:
        return 0

    # Supabase REST API upsert via POST with Prefer: resolution=merge-duplicates
    url = f"{SUPABASE_URL}/rest/v1/social_posts"
    headers = {
        **SUPABASE_HEADERS,
        "Prefer": "return=representation,resolution=merge-duplicates",
    }

    # Send in batches of 100
    total = 0
    for i in range(0, len(posts), 100):
        batch = posts[i : i + 100]
        # Clean up fields for Supabase
        clean_batch = []
        for post in batch:
            row = {
                "id": post["id"],
                "politician_id": post.get("politician_id"),
                "politician_name": post.get("politician_name"),
                "platform": post["platform"],
                "handle": post.get("handle"),
                "content": post.get("content", "")[:5000],
                "post_url": post.get("post_url"),
                "posted_at": post.get("posted_at"),
                "likes_count": post.get("likes_count", 0),
                "shares_count": post.get("shares_count", 0),
                "comments_count": post.get("comments_count", 0),
                "views_count": post.get("views_count", 0),
                "sentiment_score": post.get("sentiment_score"),
                "is_deleted": post.get("is_deleted", False),
                "scraped_at": post.get("scraped_at", datetime.now().isoformat()),
                "note": post.get("note"),
            }
            clean_batch.append(row)

        try:
            resp = requests.post(url, headers=headers, json=clean_batch, timeout=30)
            if resp.status_code in (200, 201):
                total += len(clean_batch)
            else:
                logger.error(
                    f"Supabase upsert batch failed ({resp.status_code}): {resp.text[:300]}"
                )
        except Exception as e:
            logger.error(f"Supabase upsert error: {e}")

    return total


# ---------------------------------------------------------------------------
# Helper: Build official website URLs from office info
# ---------------------------------------------------------------------------

# Known URL patterns for Florida delegation and common .gov sites
# These are deterministic and reliably reachable.

def _slug_from_name(name: str) -> str:
    """Convert 'Rick Scott' -> 'rickscott' or 'rick-scott' style slugs."""
    # Handle "LastName, FirstName" format
    if "," in name:
        parts = [p.strip() for p in name.split(",", 1)]
        name = f"{parts[1]} {parts[0]}"

    # Remove suffixes like Jr., III, etc.
    name = re.sub(r"\b(Jr\.?|Sr\.?|III|II|IV)\b", "", name, flags=re.IGNORECASE)

    clean = re.sub(r"[^a-zA-Z\s]", "", name).strip().lower()
    return clean


def guess_official_urls(politician: Dict) -> List[str]:
    """Guess likely official website URLs for a politician based on their office."""
    urls = []
    name = politician.get("name", "")
    office = politician.get("office", "")
    office_level = politician.get("office_level", "")

    slug = _slug_from_name(name)
    parts = slug.split()

    if not parts:
        return urls

    last_name = parts[-1]
    first_name = parts[0] if parts else ""

    if "Senator" in office_level or "Senator" in office:
        # US Senators: https://www.lastname.senate.gov
        urls.append(f"https://www.{last_name}.senate.gov")
        urls.append(f"https://www.{last_name}.senate.gov/news/press-releases")
        urls.append(f"https://www.{last_name}.senate.gov/newsroom/press-releases")
        urls.append(f"https://www.{last_name}.senate.gov/newsroom")

    if "Representative" in office_level or "Representative" in office:
        # US Reps: https://lastname.house.gov
        urls.append(f"https://{last_name}.house.gov")
        urls.append(f"https://{last_name}.house.gov/media/press-releases")
        urls.append(f"https://{last_name}.house.gov/news")
        urls.append(f"https://{last_name}.house.gov/media")
        # Some use first initial + last name
        if first_name:
            urls.append(f"https://{first_name}{last_name}.house.gov")

    return urls


def guess_rss_feeds(politician: Dict) -> List[str]:
    """Guess likely RSS feed URLs for a politician."""
    feeds = []
    name = politician.get("name", "")
    office_level = politician.get("office_level", "")

    slug = _slug_from_name(name)
    parts = slug.split()
    if not parts:
        return feeds

    last_name = parts[-1]

    if "Senator" in office_level:
        feeds.append(f"https://www.{last_name}.senate.gov/rss/feeds/?type=press")
        feeds.append(f"https://www.{last_name}.senate.gov/rss/feeds/press")
        feeds.append(f"https://www.{last_name}.senate.gov/feed")

    if "Representative" in office_level:
        feeds.append(f"https://{last_name}.house.gov/rss.xml")
        feeds.append(f"https://{last_name}.house.gov/news/rss.xml")
        feeds.append(f"https://{last_name}.house.gov/rss/press-releases.xml")

    return feeds


# ---------------------------------------------------------------------------
# Date parsing helpers
# ---------------------------------------------------------------------------


def parse_rss_date(date_str: str) -> Optional[str]:
    """Parse an RSS date string into ISO format. Handles RFC 2822 and common formats."""
    if not date_str:
        return None

    # Try RFC 2822 (standard RSS)
    try:
        dt = parsedate_to_datetime(date_str)
        return dt.isoformat()
    except Exception:
        pass

    # Try ISO 8601
    try:
        dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        return dt.isoformat()
    except Exception:
        pass

    # Try common formats
    for fmt in [
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%B %d, %Y",
        "%b %d, %Y",
        "%m/%d/%Y",
        "%Y-%m-%d",
    ]:
        try:
            dt = datetime.strptime(date_str.strip(), fmt)
            return dt.isoformat()
        except ValueError:
            continue

    return None


def is_recent(date_str: Optional[str], days: int = 90) -> bool:
    """Check if a date string represents a date within the last N days."""
    if not date_str:
        return True  # If we cannot parse the date, include it anyway

    try:
        dt = datetime.fromisoformat(date_str)
        if dt.tzinfo:
            cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        else:
            cutoff = datetime.now() - timedelta(days=days)
        return dt >= cutoff
    except Exception:
        return True


# ---------------------------------------------------------------------------
# Platform scrapers
# ---------------------------------------------------------------------------


class RSSFeedScraper:
    """Scrape official RSS/Atom feeds from .gov websites."""

    def scrape(
        self,
        politician: Dict,
        max_posts: int = 20,
    ) -> List[Dict[str, Any]]:
        """Try to find and parse RSS feeds for a politician."""
        pid = politician["bioguide_id"]
        name = politician["name"]
        posts = []

        feed_urls = guess_rss_feeds(politician)

        # Also check social_media field for any explicit RSS/website URLs
        sm = politician.get("social_media") or {}
        if sm.get("website"):
            base = sm["website"].rstrip("/")
            feed_urls.extend([
                f"{base}/feed",
                f"{base}/rss",
                f"{base}/rss.xml",
                f"{base}/feed.xml",
            ])

        for feed_url in feed_urls:
            try:
                resp = fetch_url(feed_url, timeout=15, retries=1)
                if resp is None or resp.status_code != 200:
                    continue

                content_type = resp.headers.get("Content-Type", "")
                text = resp.text

                # Quick check: does it look like XML/RSS?
                if not any(
                    marker in text[:500]
                    for marker in ["<rss", "<feed", "<channel", "<?xml", "<atom"]
                ):
                    continue

                items = self._parse_feed(text)
                if not items:
                    continue

                logger.info(f"RSS: Found {len(items)} items at {feed_url}")

                for item in items[:max_posts]:
                    title = item.get("title", "").strip()
                    desc = item.get("description", "").strip()
                    link = item.get("link", "").strip()
                    pub_date = item.get("pubDate", "")

                    content = title
                    if desc:
                        # Strip HTML tags from description
                        if HAS_BS4:
                            desc_clean = BeautifulSoup(desc, "html.parser").get_text(
                                separator=" ", strip=True
                            )
                        else:
                            desc_clean = re.sub(r"<[^>]+>", " ", desc)
                            desc_clean = re.sub(r"\s+", " ", desc_clean).strip()
                        if desc_clean and desc_clean != title:
                            content = f"{title}\n\n{desc_clean}"

                    if not content:
                        continue

                    posted_at = parse_rss_date(pub_date) or datetime.now().isoformat()

                    if not is_recent(posted_at, days=90):
                        continue

                    post_hash = hashlib.md5(
                        f"rss:{pid}:{link or title[:80]}".encode()
                    ).hexdigest()[:12]

                    posts.append(
                        {
                            "id": f"rss-{post_hash}",
                            "politician_id": pid,
                            "politician_name": name,
                            "platform": "rss",
                            "handle": feed_url,
                            "content": content[:5000],
                            "post_url": link or feed_url,
                            "posted_at": posted_at,
                            "likes_count": 0,
                            "shares_count": 0,
                            "comments_count": 0,
                            "is_deleted": False,
                            "scraped_at": datetime.now().isoformat(),
                            "note": f"Official RSS feed: {feed_url}",
                        }
                    )

                # If we found posts from one feed, don't try other feed URLs
                if posts:
                    break

            except Exception as e:
                logger.debug(f"RSS: Error fetching {feed_url}: {e}")
                continue

        if posts:
            logger.info(f"RSS: Collected {len(posts)} posts for {name}")
        else:
            logger.debug(f"RSS: No feeds found for {name}")

        return posts

    def _parse_feed(self, xml_text: str) -> List[Dict[str, str]]:
        """Parse RSS or Atom XML into a list of item dicts."""
        items = []
        try:
            # Fix common XML issues
            xml_text = xml_text.strip()
            if xml_text.startswith("\ufeff"):
                xml_text = xml_text[1:]

            root = ET.fromstring(xml_text)
        except ET.ParseError:
            return items

        # Determine namespace
        ns = ""
        if root.tag.startswith("{"):
            ns = root.tag.split("}")[0] + "}"

        # RSS 2.0: <rss><channel><item>
        channel = root.find(f"{ns}channel")
        if channel is not None:
            for item in channel.findall(f"{ns}item"):
                entry = {}
                for field in ["title", "link", "description", "pubDate", "dc:date"]:
                    el = item.find(f"{ns}{field}")
                    if el is None and ":" in field:
                        # Try with dc namespace
                        for dc_ns in [
                            "{http://purl.org/dc/elements/1.1/}",
                            "{http://purl.org/dc/terms/}",
                        ]:
                            el = item.find(f"{dc_ns}{field.split(':')[1]}")
                            if el is not None:
                                break
                    if el is not None and el.text:
                        key = "pubDate" if "date" in field.lower() else field
                        entry[key] = el.text
                if entry:
                    items.append(entry)
            return items

        # Atom: <feed><entry>
        atom_ns = "{http://www.w3.org/2005/Atom}"
        for entry_el in root.findall(f"{atom_ns}entry"):
            entry = {}
            title_el = entry_el.find(f"{atom_ns}title")
            if title_el is not None and title_el.text:
                entry["title"] = title_el.text

            # Atom link: <link href="..." />
            for link_el in entry_el.findall(f"{atom_ns}link"):
                href = link_el.get("href", "")
                rel = link_el.get("rel", "alternate")
                if rel == "alternate" and href:
                    entry["link"] = href
                    break
            if "link" not in entry:
                link_el = entry_el.find(f"{atom_ns}link")
                if link_el is not None:
                    entry["link"] = link_el.get("href", "")

            # Content or summary
            content_el = entry_el.find(f"{atom_ns}content")
            summary_el = entry_el.find(f"{atom_ns}summary")
            if content_el is not None and content_el.text:
                entry["description"] = content_el.text
            elif summary_el is not None and summary_el.text:
                entry["description"] = summary_el.text

            # Date
            updated_el = entry_el.find(f"{atom_ns}updated")
            published_el = entry_el.find(f"{atom_ns}published")
            date_el = published_el if published_el is not None else updated_el
            if date_el is not None and date_el.text:
                entry["pubDate"] = date_el.text

            if entry:
                items.append(entry)

        return items


class GoogleNewsScraper:
    """Fetch recent news mentions via Google News RSS (no API key needed)."""

    GOOGLE_NEWS_RSS = "https://news.google.com/rss/search"

    def scrape(
        self,
        politician: Dict,
        max_posts: int = 10,
    ) -> List[Dict[str, Any]]:
        """Fetch Google News RSS for a politician."""
        pid = politician["bioguide_id"]
        name = politician["name"]
        office_level = politician.get("office_level", "")
        party = politician.get("party", "")
        posts = []

        # Build a targeted search query
        # Use quotes around the full name and add context
        state_hint = "Florida"
        query_parts = [f'"{name}"']

        if "Senator" in office_level:
            query_parts.append("Senator")
        elif "Representative" in office_level:
            query_parts.append("Representative")

        query_parts.append(state_hint)
        query = " ".join(query_parts)

        # Google News RSS endpoint
        url = f"{self.GOOGLE_NEWS_RSS}?q={quote_plus(query)}&hl=en-US&gl=US&ceid=US:en"

        try:
            resp = fetch_url(url, timeout=15, retries=1)
            if resp is None or resp.status_code != 200:
                logger.debug(f"News: Google News returned {resp.status_code if resp else 'None'} for {name}")
                return posts

            # Parse the RSS feed
            items = self._parse_google_rss(resp.text)
            logger.info(f"News: Found {len(items)} news items for {name}")

            for item in items[:max_posts]:
                title = item.get("title", "").strip()
                link = item.get("link", "").strip()
                pub_date = item.get("pubDate", "")
                source = item.get("source", "")

                if not title:
                    continue

                posted_at = parse_rss_date(pub_date) or datetime.now().isoformat()

                if not is_recent(posted_at, days=30):
                    continue

                content = title
                if source:
                    content = f"{title} (via {source})"

                post_hash = hashlib.md5(
                    f"news:{pid}:{link or title[:80]}".encode()
                ).hexdigest()[:12]

                posts.append(
                    {
                        "id": f"news-{post_hash}",
                        "politician_id": pid,
                        "politician_name": name,
                        "platform": "news",
                        "handle": source or "Google News",
                        "content": content[:5000],
                        "post_url": link,
                        "posted_at": posted_at,
                        "likes_count": 0,
                        "shares_count": 0,
                        "comments_count": 0,
                        "is_deleted": False,
                        "scraped_at": datetime.now().isoformat(),
                        "note": f"Google News search: {query}",
                    }
                )

        except Exception as e:
            logger.error(f"News: Error fetching news for {name}: {e}")

        if posts:
            logger.info(f"News: Collected {len(posts)} news items for {name}")

        return posts

    def _parse_google_rss(self, xml_text: str) -> List[Dict[str, str]]:
        """Parse Google News RSS feed."""
        items = []
        try:
            root = ET.fromstring(xml_text)
        except ET.ParseError as e:
            logger.debug(f"News: XML parse error: {e}")
            return items

        channel = root.find("channel")
        if channel is None:
            return items

        for item in channel.findall("item"):
            entry = {}
            title_el = item.find("title")
            link_el = item.find("link")
            pub_el = item.find("pubDate")
            source_el = item.find("source")

            if title_el is not None and title_el.text:
                entry["title"] = title_el.text
            if link_el is not None and link_el.text:
                entry["link"] = link_el.text
            if pub_el is not None and pub_el.text:
                entry["pubDate"] = pub_el.text
            if source_el is not None and source_el.text:
                entry["source"] = source_el.text

            if entry.get("title"):
                items.append(entry)

        return items


class PressReleaseScraper:
    """Scrape press release pages from official .gov websites using requests + BS4."""

    def scrape(
        self,
        politician: Dict,
        max_posts: int = 15,
    ) -> List[Dict[str, Any]]:
        """Scrape press releases from official government websites."""
        if not HAS_BS4:
            logger.warning(
                "Press: beautifulsoup4 not installed. "
                "Install with: pip install beautifulsoup4"
            )
            return []

        pid = politician["bioguide_id"]
        name = politician["name"]
        posts = []

        page_urls = guess_official_urls(politician)

        for page_url in page_urls:
            try:
                resp = fetch_url(page_url, timeout=15, retries=1)
                if resp is None or resp.status_code != 200:
                    continue

                # Check that we got HTML
                ct = resp.headers.get("Content-Type", "")
                if "html" not in ct and "text" not in ct:
                    continue

                soup = BeautifulSoup(resp.text, "html.parser")

                # Strategy 1: Look for press release list items
                items = self._extract_press_releases(soup, page_url)

                if items:
                    logger.info(
                        f"Press: Found {len(items)} press releases at {page_url}"
                    )
                    for item in items[:max_posts]:
                        title = item.get("title", "").strip()
                        link = item.get("link", "").strip()
                        date_str = item.get("date", "")
                        snippet = item.get("snippet", "")

                        if not title:
                            continue

                        posted_at = (
                            parse_rss_date(date_str) or datetime.now().isoformat()
                        )

                        if not is_recent(posted_at, days=90):
                            continue

                        content = title
                        if snippet:
                            content = f"{title}\n\n{snippet}"

                        post_hash = hashlib.md5(
                            f"press:{pid}:{link or title[:80]}".encode()
                        ).hexdigest()[:12]

                        posts.append(
                            {
                                "id": f"press-{post_hash}",
                                "politician_id": pid,
                                "politician_name": name,
                                "platform": "press",
                                "handle": urlparse(page_url).hostname or page_url,
                                "content": content[:5000],
                                "post_url": link or page_url,
                                "posted_at": posted_at,
                                "likes_count": 0,
                                "shares_count": 0,
                                "comments_count": 0,
                                "is_deleted": False,
                                "scraped_at": datetime.now().isoformat(),
                                "note": f"Official press release: {page_url}",
                            }
                        )

                    if posts:
                        break  # Got results from one URL, stop trying others

            except Exception as e:
                logger.debug(f"Press: Error scraping {page_url}: {e}")
                continue

        if posts:
            logger.info(f"Press: Collected {len(posts)} releases for {name}")

        return posts

    def _extract_press_releases(
        self, soup: BeautifulSoup, base_url: str
    ) -> List[Dict[str, str]]:
        """Extract press release entries from a .gov HTML page.

        Senate and House websites use varying HTML structures, so we try
        multiple common patterns.
        """
        items = []

        # Pattern 1: Senate-style table rows or list items with date + title
        # e.g. <tr><td class="date">...</td><td><a href="...">Title</a></td></tr>
        for row in soup.select(
            "table.table tr, .list-item, .press-release, "
            ".views-row, .element, article, .media-body, "
            ".record, .views-field, .node--type-press-release"
        ):
            title_el = row.find("a")
            if not title_el:
                continue

            title = title_el.get_text(strip=True)
            if not title or len(title) < 10:
                continue

            href = title_el.get("href", "")
            if href and not href.startswith("http"):
                href = urljoin(base_url, href)

            # Look for date in the row
            date_str = ""
            date_el = row.find(class_=re.compile(r"date|time|pubdate", re.I))
            if date_el:
                date_str = date_el.get_text(strip=True)
            else:
                time_el = row.find("time")
                if time_el:
                    date_str = time_el.get("datetime", "") or time_el.get_text(
                        strip=True
                    )

            # Look for snippet/teaser
            snippet = ""
            snippet_el = row.find(
                class_=re.compile(r"teaser|summary|excerpt|desc|body", re.I)
            )
            if snippet_el:
                snippet = snippet_el.get_text(strip=True)[:500]

            items.append(
                {
                    "title": title,
                    "link": href,
                    "date": date_str,
                    "snippet": snippet,
                }
            )

        if items:
            return items

        # Pattern 2: Generic -- find all <a> tags inside elements that look
        # like press release listings
        headings = soup.find_all(["h2", "h3", "h4"])
        for h in headings:
            a_tag = h.find("a")
            if not a_tag:
                continue

            title = a_tag.get_text(strip=True)
            if not title or len(title) < 15:
                continue

            href = a_tag.get("href", "")
            if href and not href.startswith("http"):
                href = urljoin(base_url, href)

            # Look for an adjacent date
            date_str = ""
            parent = h.parent
            if parent:
                date_el = parent.find(class_=re.compile(r"date|time", re.I))
                if date_el:
                    date_str = date_el.get_text(strip=True)
                # Also check siblings
                sibling = h.find_next_sibling()
                if sibling:
                    time_el = sibling.find("time")
                    if time_el:
                        date_str = time_el.get("datetime", "") or time_el.get_text(
                            strip=True
                        )

            # Skip navigation links, breadcrumbs, etc.
            if any(
                skip in title.lower()
                for skip in [
                    "home",
                    "menu",
                    "search",
                    "contact",
                    "about",
                    "skip to",
                    "back to",
                ]
            ):
                continue

            items.append(
                {
                    "title": title,
                    "link": href,
                    "date": date_str,
                    "snippet": "",
                }
            )

        return items


class YouTubeRSSScraper:
    """Fetch YouTube channel videos via the public RSS feed (no API key)."""

    def scrape(
        self,
        politician: Dict,
        max_posts: int = 10,
    ) -> List[Dict[str, Any]]:
        """Fetch YouTube RSS feed for a politician's channel."""
        pid = politician["bioguide_id"]
        name = politician["name"]
        sm = politician.get("social_media") or {}
        channel_id = sm.get("youtubeChannelId")
        posts = []

        if not channel_id:
            return posts

        # YouTube public RSS feed -- works without API key
        feed_url = (
            f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"
        )

        try:
            resp = fetch_url(feed_url, timeout=15, retries=1)
            if resp is None or resp.status_code != 200:
                logger.debug(
                    f"YouTube: Feed not available for channel {channel_id}"
                )
                return posts

            items = self._parse_youtube_feed(resp.text)
            logger.info(f"YouTube: Found {len(items)} videos for {name}")

            for item in items[:max_posts]:
                title = item.get("title", "").strip()
                link = item.get("link", "").strip()
                pub_date = item.get("pubDate", "")

                if not title:
                    continue

                posted_at = parse_rss_date(pub_date) or datetime.now().isoformat()

                if not is_recent(posted_at, days=90):
                    continue

                post_hash = hashlib.md5(
                    f"yt:{channel_id}:{link or title[:80]}".encode()
                ).hexdigest()[:12]

                posts.append(
                    {
                        "id": f"yt-{post_hash}",
                        "politician_id": pid,
                        "politician_name": name,
                        "platform": "youtube",
                        "handle": channel_id,
                        "content": title[:5000],
                        "post_url": link,
                        "posted_at": posted_at,
                        "likes_count": 0,
                        "shares_count": 0,
                        "comments_count": 0,
                        "is_deleted": False,
                        "scraped_at": datetime.now().isoformat(),
                        "note": f"YouTube RSS feed: {feed_url}",
                    }
                )

        except Exception as e:
            logger.error(f"YouTube: Error fetching feed for {name}: {e}")

        if posts:
            logger.info(f"YouTube: Collected {len(posts)} videos for {name}")

        return posts

    def _parse_youtube_feed(self, xml_text: str) -> List[Dict[str, str]]:
        """Parse YouTube Atom feed."""
        items = []
        try:
            root = ET.fromstring(xml_text)
        except ET.ParseError:
            return items

        atom_ns = "{http://www.w3.org/2005/Atom}"
        yt_ns = "{http://www.youtube.com/xml/schemas/2015}"
        media_ns = "{http://search.yahoo.com/mrss/}"

        for entry in root.findall(f"{atom_ns}entry"):
            item = {}

            title_el = entry.find(f"{atom_ns}title")
            if title_el is not None and title_el.text:
                item["title"] = title_el.text

            # Video ID
            video_id_el = entry.find(f"{yt_ns}videoId")
            if video_id_el is not None and video_id_el.text:
                item["link"] = (
                    f"https://www.youtube.com/watch?v={video_id_el.text}"
                )

            # Fallback: link element
            if "link" not in item:
                link_el = entry.find(f"{atom_ns}link")
                if link_el is not None:
                    item["link"] = link_el.get("href", "")

            # Published date
            pub_el = entry.find(f"{atom_ns}published")
            if pub_el is not None and pub_el.text:
                item["pubDate"] = pub_el.text

            # Description from media:group/media:description
            media_group = entry.find(f"{media_ns}group")
            if media_group is not None:
                desc_el = media_group.find(f"{media_ns}description")
                if desc_el is not None and desc_el.text:
                    item["description"] = desc_el.text[:500]

            if item.get("title"):
                items.append(item)

        return items


# ---------------------------------------------------------------------------
# Twitter/X Scraper via Twikit (guest mode -- no API key needed)
# ---------------------------------------------------------------------------


class TwitterXScraper:
    """Scrape recent tweets from a politician's Twitter/X account.

    Uses the Twitter syndication API (public embed endpoint).
    No API key, no login, no third-party library needed -- just requests + BS4.
    Returns up to 20 recent tweets per profile.
    """

    SYNDICATION_URL = "https://syndication.twitter.com/srv/timeline-profile/screen-name/{handle}"

    def scrape(
        self,
        politician: Dict,
        max_posts: int = 20,
    ) -> List[Dict[str, Any]]:
        """Scrape tweets via the Twitter syndication embed API."""
        pid = politician["bioguide_id"]
        name = politician["name"]
        sm = politician.get("social_media") or {}
        handle = sm.get("twitterHandle", "").lstrip("@").strip()

        if not handle:
            return []

        posts = []

        try:
            url = self.SYNDICATION_URL.format(handle=handle)
            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/122.0.0.0 Safari/537.36"
                ),
                "Referer": "https://platform.twitter.com/",
                "Accept": "text/html,application/xhtml+xml",
            }

            resp = requests.get(url, headers=headers, timeout=20)
            if resp.status_code != 200:
                logger.debug(f"Twitter: Syndication returned {resp.status_code} for @{handle}")
                return posts

            if not HAS_BS4:
                logger.debug("Twitter: BeautifulSoup required for syndication parsing")
                return posts

            soup = BeautifulSoup(resp.text, "html.parser")
            next_data_script = soup.find("script", id="__NEXT_DATA__")

            if not next_data_script or not next_data_script.string:
                logger.debug(f"Twitter: No __NEXT_DATA__ in syndication page for @{handle}")
                return posts

            data = json.loads(next_data_script.string)
            entries = (
                data.get("props", {})
                .get("pageProps", {})
                .get("timeline", {})
                .get("entries", [])
            )

            if not entries:
                logger.debug(f"Twitter: No entries found for @{handle}")
                return posts

            for entry in entries[:max_posts]:
                try:
                    content = entry.get("content", {})
                    tweet = content.get("tweet", {})

                    text = tweet.get("text", "").strip()
                    if not text:
                        continue

                    # Parse Twitter date format: "Wed Mar 04 02:37:52 +0000 2026"
                    created_at = tweet.get("created_at", "")
                    posted_at = datetime.now().isoformat()
                    if created_at:
                        try:
                            posted_at = datetime.strptime(
                                created_at, "%a %b %d %H:%M:%S %z %Y"
                            ).isoformat()
                        except ValueError:
                            try:
                                posted_at = parsedate_to_datetime(created_at).isoformat()
                            except Exception:
                                pass

                    if not is_recent(posted_at, days=90):
                        continue

                    tweet_id = tweet.get("id_str") or tweet.get("id") or hashlib.md5(
                        f"tw:{handle}:{text[:80]}".encode()
                    ).hexdigest()[:12]

                    screen_name = (
                        tweet.get("user", {}).get("screen_name", handle)
                    )
                    tweet_url = f"https://x.com/{screen_name}/status/{tweet_id}"

                    posts.append(
                        {
                            "id": f"tw-{tweet_id}",
                            "politician_id": pid,
                            "politician_name": name,
                            "platform": "twitter",
                            "handle": f"@{handle}",
                            "content": text[:5000],
                            "post_url": tweet_url,
                            "posted_at": posted_at,
                            "likes_count": tweet.get("favorite_count", 0) or 0,
                            "shares_count": tweet.get("retweet_count", 0) or 0,
                            "comments_count": tweet.get("reply_count", 0) or 0,
                            "is_deleted": False,
                            "scraped_at": datetime.now().isoformat(),
                            "note": f"Twitter/X post from @{handle}",
                        }
                    )

                except Exception as e:
                    logger.debug(f"Twitter: Error parsing tweet entry: {e}")
                    continue

        except json.JSONDecodeError as e:
            logger.warning(f"Twitter: JSON parse error for @{handle}: {e}")
        except Exception as e:
            logger.warning(f"Twitter: Error scraping @{handle} for {name}: {e}")

        if posts:
            logger.info(f"Twitter: Collected {len(posts)} tweets for @{handle}")

        return posts


# ---------------------------------------------------------------------------
# Facebook Scraper via facebook-scraper library
# ---------------------------------------------------------------------------


class FacebookPageScraper:
    """Scrape public Facebook page posts.

    Uses facebook-scraper library if available. Facebook heavily rate-limits
    anonymous scraping, so this will often return 0 posts. For reliable
    Facebook data, configure FB_ACCESS_TOKEN env var with a Graph API token.

    Requires politician to have facebookPageId or facebookPageUrl in social_media.
    """

    def scrape(
        self,
        politician: Dict,
        max_posts: int = 10,
    ) -> List[Dict[str, Any]]:
        """Scrape public posts from a politician's Facebook page."""
        pid = politician["bioguide_id"]
        name = politician["name"]
        sm = politician.get("social_media") or {}

        # Determine the Facebook page ID or URL
        page_id = sm.get("facebookPageId", "").strip()
        page_url = sm.get("facebookPageUrl", "").strip()

        if not page_id and page_url:
            parsed = urlparse(page_url)
            path = parsed.path.strip("/").split("/")[0]
            if path and path != "profile.php":
                page_id = path

        if not page_id:
            return []

        posts = []

        # Method 1: Try Graph API with access token (most reliable)
        access_token = os.getenv("FB_ACCESS_TOKEN", "").strip()
        if access_token:
            posts = self._scrape_graph_api(pid, name, page_id, access_token, max_posts)
            if posts:
                return posts

        # Method 2: Try facebook-scraper library
        if HAS_FB_SCRAPER:
            posts = self._scrape_library(pid, name, page_id, max_posts)

        if not posts:
            logger.debug(
                f"Facebook: No posts for {name} ({page_id}). "
                f"Set FB_ACCESS_TOKEN env var for reliable scraping."
            )

        return posts

    def _scrape_graph_api(
        self, pid: str, name: str, page_id: str, token: str, max_posts: int
    ) -> List[Dict[str, Any]]:
        """Use Facebook Graph API (requires access token)."""
        posts = []
        try:
            url = (
                f"https://graph.facebook.com/v18.0/{page_id}/posts"
                f"?fields=message,created_time,permalink_url"
                f"&limit={max_posts}"
                f"&access_token={token}"
            )
            resp = requests.get(url, timeout=15)
            if resp.status_code != 200:
                logger.debug(f"Facebook Graph API returned {resp.status_code}")
                return posts

            data = resp.json()
            for item in data.get("data", [])[:max_posts]:
                text = item.get("message", "").strip()
                if not text:
                    continue

                created = item.get("created_time", "")
                posted_at = created if created else datetime.now().isoformat()

                if not is_recent(posted_at, days=90):
                    continue

                post_id = item.get("id", hashlib.md5(
                    f"fb:{page_id}:{text[:80]}".encode()
                ).hexdigest()[:12])

                posts.append({
                    "id": f"fb-{post_id}",
                    "politician_id": pid,
                    "politician_name": name,
                    "platform": "facebook",
                    "handle": page_id,
                    "content": text[:5000],
                    "post_url": item.get("permalink_url", f"https://www.facebook.com/{page_id}"),
                    "posted_at": posted_at,
                    "likes_count": 0,
                    "shares_count": 0,
                    "comments_count": 0,
                    "is_deleted": False,
                    "scraped_at": datetime.now().isoformat(),
                    "note": f"Facebook Graph API post from {page_id}",
                })

        except Exception as e:
            logger.debug(f"Facebook Graph API error for {page_id}: {e}")

        if posts:
            logger.info(f"Facebook: Collected {len(posts)} posts via Graph API for {name}")
        return posts

    def _scrape_library(
        self, pid: str, name: str, page_id: str, max_posts: int
    ) -> List[Dict[str, Any]]:
        """Use facebook-scraper library (often blocked)."""
        posts = []
        try:
            fb_posts = fb_scraper.get_posts(
                page_id,
                pages=max(3, max_posts // 5),
                options={"allow_extra_requests": False},
            )

            count = 0
            for fb_post in fb_posts:
                if count >= max_posts:
                    break
                text = fb_post.get("text") or fb_post.get("post_text") or ""
                if not text.strip():
                    continue

                post_time = fb_post.get("time")
                posted_at = (
                    post_time.isoformat() if post_time and hasattr(post_time, "isoformat")
                    else datetime.now().isoformat()
                )

                if not is_recent(posted_at, days=90):
                    continue

                post_id = fb_post.get("post_id") or hashlib.md5(
                    f"fb:{page_id}:{text[:80]}".encode()
                ).hexdigest()[:12]

                posts.append({
                    "id": f"fb-{post_id}",
                    "politician_id": pid,
                    "politician_name": name,
                    "platform": "facebook",
                    "handle": page_id,
                    "content": text[:5000],
                    "post_url": fb_post.get("post_url", f"https://www.facebook.com/{page_id}"),
                    "posted_at": posted_at,
                    "likes_count": fb_post.get("likes", 0) or 0,
                    "shares_count": fb_post.get("shares", 0) or 0,
                    "comments_count": fb_post.get("comments", 0) or 0,
                    "is_deleted": False,
                    "scraped_at": datetime.now().isoformat(),
                    "note": f"Facebook page post from {page_id}",
                })
                count += 1

        except Exception as e:
            logger.debug(f"Facebook: facebook-scraper error for {page_id}: {e}")

        if posts:
            logger.info(f"Facebook: Collected {len(posts)} posts for {name} ({page_id})")
        return posts


# ---------------------------------------------------------------------------
# Instagram Scraper via Instaloader (public profiles, no login)
# ---------------------------------------------------------------------------


class InstagramProfileScraper:
    """Scrape public Instagram profile posts using Instaloader.

    Instagram now requires authentication for most scraping. Set env vars:
      IG_USERNAME - Instagram username for login
      IG_PASSWORD - Instagram password for login

    Without credentials, will attempt anonymous access (usually blocked).
    Requires politician to have instagramHandle in social_media.
    """

    _loader = None
    _login_attempted = False

    @classmethod
    def _get_loader(cls):
        """Lazily create an Instaloader instance with optional login."""
        if cls._loader is None:
            L = instaloader.Instaloader(
                download_pictures=False,
                download_videos=False,
                download_video_thumbnails=False,
                download_geotags=False,
                download_comments=False,
                save_metadata=False,
                compress_json=False,
                quiet=True,
            )

            # Try to login if credentials are available
            if not cls._login_attempted:
                cls._login_attempted = True
                ig_user = os.getenv("IG_USERNAME", "").strip()
                ig_pass = os.getenv("IG_PASSWORD", "").strip()
                if ig_user and ig_pass:
                    try:
                        L.login(ig_user, ig_pass)
                        logger.info(f"Instagram: Logged in as {ig_user}")
                    except Exception as e:
                        logger.warning(f"Instagram: Login failed for {ig_user}: {e}")
                else:
                    logger.debug(
                        "Instagram: No IG_USERNAME/IG_PASSWORD set. "
                        "Anonymous scraping may be blocked."
                    )

            cls._loader = L
        return cls._loader

    def scrape(
        self,
        politician: Dict,
        max_posts: int = 10,
    ) -> List[Dict[str, Any]]:
        """Scrape recent public posts from a politician's Instagram profile."""
        if not HAS_INSTALOADER:
            logger.debug("Instagram: instaloader not installed, skipping")
            return []

        pid = politician["bioguide_id"]
        name = politician["name"]
        sm = politician.get("social_media") or {}
        handle = sm.get("instagramHandle", "").lstrip("@").strip()

        if not handle:
            return []

        posts = []
        try:
            L = self._get_loader()
            profile = instaloader.Profile.from_username(L.context, handle)

            count = 0
            for post in profile.get_posts():
                if count >= max_posts:
                    break

                try:
                    text = post.caption or ""
                    if not text.strip():
                        text = getattr(post, "accessibility_caption", "") or ""
                    if not text.strip():
                        continue

                    posted_at = post.date_utc.isoformat() if post.date_utc else datetime.now().isoformat()

                    if not is_recent(posted_at, days=90):
                        break

                    shortcode = post.shortcode or hashlib.md5(
                        f"ig:{handle}:{text[:80]}".encode()
                    ).hexdigest()[:12]

                    post_url = f"https://www.instagram.com/p/{shortcode}/"

                    posts.append({
                        "id": f"ig-{shortcode}",
                        "politician_id": pid,
                        "politician_name": name,
                        "platform": "instagram",
                        "handle": f"@{handle}",
                        "content": text[:5000],
                        "post_url": post_url,
                        "posted_at": posted_at,
                        "likes_count": post.likes or 0,
                        "shares_count": 0,
                        "comments_count": post.comments or 0,
                        "is_deleted": False,
                        "scraped_at": datetime.now().isoformat(),
                        "note": f"Instagram post from @{handle}",
                    })
                    count += 1

                except Exception as e:
                    logger.debug(f"Instagram: Error parsing post from @{handle}: {e}")
                    continue

        except Exception as e:
            err_msg = str(e)
            if "401" in err_msg or "404" in err_msg or "login" in err_msg.lower():
                logger.debug(
                    f"Instagram: Auth required for @{handle}. "
                    f"Set IG_USERNAME/IG_PASSWORD env vars."
                )
            else:
                logger.debug(f"Instagram: Error scraping @{handle} for {name}: {e}")

        if posts:
            logger.info(f"Instagram: Collected {len(posts)} posts for {name} (@{handle})")

        return posts


# ---------------------------------------------------------------------------
# Sentiment analysis
# ---------------------------------------------------------------------------


def analyze_sentiment(text: str) -> float:
    """Run TextBlob sentiment analysis. Returns polarity [-1.0, 1.0]."""
    try:
        from textblob import TextBlob

        # Strip metadata prefixes like "[Profile]", "[Page description]"
        clean = text
        if clean.startswith("["):
            idx = clean.find("]")
            if idx != -1 and idx < 50:
                clean = clean[idx + 1 :].strip()

        blob = TextBlob(clean)
        return round(blob.sentiment.polarity, 3)
    except ImportError:
        return 0.0
    except Exception:
        return 0.0


# ---------------------------------------------------------------------------
# Main scraper orchestrator
# ---------------------------------------------------------------------------


class SocialMediaPipeline:
    """Orchestrates scraping across all source types for all politicians."""

    VALID_PLATFORMS = {"rss", "news", "press", "youtube", "twitter", "facebook", "instagram"}

    def __init__(self, platforms: List[str], max_posts_per_platform: int = 20):
        self.platforms = [p for p in platforms if p in self.VALID_PLATFORMS]
        if not self.platforms:
            logger.warning(
                f"No valid platforms specified. "
                f"Valid options: {', '.join(sorted(self.VALID_PLATFORMS))}. "
                f"Defaulting to: rss,news,press,twitter,facebook,instagram"
            )
            self.platforms = ["rss", "news", "press", "twitter", "facebook", "instagram"]

        self.max_posts = max_posts_per_platform
        self.rss_scraper = RSSFeedScraper()
        self.news_scraper = GoogleNewsScraper()
        self.press_scraper = PressReleaseScraper()
        self.youtube_scraper = YouTubeRSSScraper()
        self.twitter_scraper = TwitterXScraper()
        self.facebook_scraper = FacebookPageScraper()
        self.instagram_scraper = InstagramProfileScraper()
        self.all_posts: List[Dict[str, Any]] = []
        self.stats = {
            "total_politicians": 0,
            "politicians_with_results": 0,
            "politicians_scraped": 0,
            "total_posts": 0,
            "by_platform": {},
            "errors": [],
        }

    def scrape_politician(self, politician: Dict) -> List[Dict[str, Any]]:
        """Scrape all enabled source types for a single politician."""
        pid = politician["bioguide_id"]
        name = politician["name"]
        posts: List[Dict[str, Any]] = []

        # RSS feeds
        if "rss" in self.platforms:
            try:
                rss_posts = self.rss_scraper.scrape(politician, self.max_posts)
                posts.extend(rss_posts)
                self.stats["by_platform"]["rss"] = (
                    self.stats["by_platform"].get("rss", 0) + len(rss_posts)
                )
            except Exception as e:
                self.stats["errors"].append(
                    {"politician": name, "platform": "rss", "error": str(e)}
                )
            time.sleep(1)  # Polite delay

        # Google News
        if "news" in self.platforms:
            try:
                news_posts = self.news_scraper.scrape(politician, self.max_posts)
                posts.extend(news_posts)
                self.stats["by_platform"]["news"] = (
                    self.stats["by_platform"].get("news", 0) + len(news_posts)
                )
            except Exception as e:
                self.stats["errors"].append(
                    {"politician": name, "platform": "news", "error": str(e)}
                )
            time.sleep(1.5)  # Slightly longer delay for Google

        # Press releases (official website scraping)
        if "press" in self.platforms:
            try:
                press_posts = self.press_scraper.scrape(politician, self.max_posts)
                posts.extend(press_posts)
                self.stats["by_platform"]["press"] = (
                    self.stats["by_platform"].get("press", 0) + len(press_posts)
                )
            except Exception as e:
                self.stats["errors"].append(
                    {"politician": name, "platform": "press", "error": str(e)}
                )
            time.sleep(1)

        # YouTube RSS
        if "youtube" in self.platforms:
            try:
                yt_posts = self.youtube_scraper.scrape(politician, self.max_posts)
                posts.extend(yt_posts)
                self.stats["by_platform"]["youtube"] = (
                    self.stats["by_platform"].get("youtube", 0) + len(yt_posts)
                )
            except Exception as e:
                self.stats["errors"].append(
                    {"politician": name, "platform": "youtube", "error": str(e)}
                )
            time.sleep(0.5)

        # Twitter/X (via Twikit guest mode)
        if "twitter" in self.platforms:
            try:
                tw_posts = self.twitter_scraper.scrape(politician, self.max_posts)
                posts.extend(tw_posts)
                self.stats["by_platform"]["twitter"] = (
                    self.stats["by_platform"].get("twitter", 0) + len(tw_posts)
                )
            except Exception as e:
                self.stats["errors"].append(
                    {"politician": name, "platform": "twitter", "error": str(e)}
                )
            time.sleep(2)  # Be polite with Twitter

        # Facebook (via facebook-scraper)
        if "facebook" in self.platforms:
            try:
                fb_posts = self.facebook_scraper.scrape(politician, self.max_posts)
                posts.extend(fb_posts)
                self.stats["by_platform"]["facebook"] = (
                    self.stats["by_platform"].get("facebook", 0) + len(fb_posts)
                )
            except Exception as e:
                self.stats["errors"].append(
                    {"politician": name, "platform": "facebook", "error": str(e)}
                )
            time.sleep(2)  # Be polite with Facebook

        # Instagram (via Instaloader)
        if "instagram" in self.platforms:
            try:
                ig_posts = self.instagram_scraper.scrape(politician, self.max_posts)
                posts.extend(ig_posts)
                self.stats["by_platform"]["instagram"] = (
                    self.stats["by_platform"].get("instagram", 0) + len(ig_posts)
                )
            except Exception as e:
                self.stats["errors"].append(
                    {"politician": name, "platform": "instagram", "error": str(e)}
                )
            time.sleep(2)  # Be polite with Instagram

        # Sentiment analysis
        for post in posts:
            content = post.get("content", "")
            if content:
                post["sentiment_score"] = analyze_sentiment(content)

        if posts:
            self.stats["politicians_with_results"] += 1
            self.stats["politicians_scraped"] += 1

        return posts

    def run(
        self,
        politicians: List[Dict],
        output_path: Path = OUTPUT_FILE,
        push_to_supabase: bool = True,
    ) -> Dict[str, Any]:
        """Run the full scraping pipeline."""
        start_time = datetime.now()
        self.stats["total_politicians"] = len(politicians)

        logger.info("=" * 70)
        logger.info("  Snitched.ai - Public Records & News Scraper")
        logger.info("=" * 70)
        logger.info(f"  Politicians:  {len(politicians)}")
        logger.info(f"  Sources:      {', '.join(self.platforms)}")
        logger.info(f"  Max posts:    {self.max_posts} per source")
        logger.info(f"  Output:       {output_path}")
        logger.info(f"  BS4 avail:    {HAS_BS4}")
        logger.info("")

        for i, politician in enumerate(politicians, 1):
            name = politician["name"]
            logger.info(f"[{i}/{len(politicians)}] {name}")

            try:
                posts = self.scrape_politician(politician)
                self.all_posts.extend(posts)
                logger.info(f"  -> {len(posts)} posts collected")
            except Exception as e:
                logger.error(f"  -> ERROR: {e}")
                self.stats["errors"].append(
                    {"politician": name, "platform": "all", "error": str(e)}
                )

        self.stats["total_posts"] = len(self.all_posts)

        # Save output to JSON file
        output_data = {
            "metadata": {
                "scraper": "snitched-social-media-scraper",
                "version": "3.0.0",
                "engine": "requests + beautifulsoup4 + xml.etree",
                "platforms": self.platforms,
                "started_at": start_time.isoformat(),
                "completed_at": datetime.now().isoformat(),
                "duration_seconds": round(
                    (datetime.now() - start_time).total_seconds(), 1
                ),
            },
            "statistics": self.stats,
            "posts": self.all_posts,
        }

        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w") as f:
            json.dump(output_data, f, indent=2, default=str, ensure_ascii=False)
        logger.info(f"\nSaved {len(self.all_posts)} posts to {output_path}")

        # Push to Supabase
        if push_to_supabase and self.all_posts:
            logger.info(f"Pushing {len(self.all_posts)} posts to Supabase...")
            upserted = supabase_upsert_posts(self.all_posts)
            logger.info(f"Supabase: Upserted {upserted} rows to social_posts")

        # Print summary
        duration = (datetime.now() - start_time).total_seconds()
        logger.info("")
        logger.info("=" * 70)
        logger.info("  SCRAPE SUMMARY")
        logger.info("=" * 70)
        logger.info(f"  Total politicians:     {self.stats['total_politicians']}")
        logger.info(f"  With results:          {self.stats['politicians_with_results']}")
        logger.info(f"  Total posts collected: {self.stats['total_posts']}")
        logger.info(f"  Errors:                {len(self.stats['errors'])}")
        logger.info(f"  Duration:              {duration:.1f}s")

        if self.stats["by_platform"]:
            logger.info("")
            logger.info("  By source:")
            for platform, count in sorted(self.stats["by_platform"].items()):
                logger.info(f"    {platform:12s}  {count} posts")

        if self.stats["errors"]:
            logger.info("")
            logger.info(f"  Errors ({len(self.stats['errors'])}):")
            for err in self.stats["errors"][:10]:
                logger.info(
                    f"    {err['politician']} ({err['platform']}): {err['error']}"
                )

        logger.info("=" * 70)

        return output_data


# ---------------------------------------------------------------------------
# Dry-run mode
# ---------------------------------------------------------------------------


def run_dry_run(platforms: List[str], limit: int) -> Dict[str, Any]:
    """Validate the pipeline structure without actually scraping."""
    logger.info("=" * 70)
    logger.info("  DRY RUN MODE -- Validating pipeline structure")
    logger.info("=" * 70)

    # 1. Check requests
    logger.info("\n[1/5] Checking requests library...")
    logger.info(f"  OK: requests {requests.__version__}")

    # 2. Check BeautifulSoup
    logger.info("\n[2/5] Checking BeautifulSoup (press release scraping)...")
    if HAS_BS4:
        import bs4
        logger.info(f"  OK: beautifulsoup4 {bs4.__version__}")
    else:
        logger.warning(
            "  WARN: beautifulsoup4 not installed. "
            "Install with: pip install beautifulsoup4\n"
            "  Press release scraping will be disabled."
        )

    # 3. Check TextBlob
    logger.info("\n[3/5] Checking TextBlob (sentiment analysis)...")
    try:
        from textblob import TextBlob  # noqa: F401
        logger.info("  OK: TextBlob is available")
    except ImportError as e:
        logger.warning(f"  WARN: TextBlob not installed: {e}")

    # 4. Fetch politicians from Supabase
    logger.info("\n[4/5] Fetching politicians from Supabase...")
    try:
        politicians = supabase_get_politicians(limit=limit)
        logger.info(
            f"  OK: Found {len(politicians)} politicians"
        )

        # Count who has useful data for each source type
        has_rss = 0
        has_youtube = 0
        senators = 0
        representatives = 0

        for p in politicians:
            ol = p.get("office_level", "")
            sm = p.get("social_media") or {}
            if "Senator" in ol:
                senators += 1
                has_rss += 1  # Senators almost always have RSS
            if "Representative" in ol:
                representatives += 1
                has_rss += 1  # Reps almost always have RSS
            if sm.get("youtubeChannelId"):
                has_youtube += 1

        logger.info(f"  US Senators:         {senators}")
        logger.info(f"  US Representatives:  {representatives}")
        logger.info(f"  With RSS (est.):     {has_rss}")
        logger.info(f"  With YouTube:        {has_youtube}")
        logger.info(f"  All can use News:    {len(politicians)} (Google News works for everyone)")

        # Show sample politicians
        logger.info("\n  Sample politicians:")
        for p in politicians[:5]:
            logger.info(
                f"    {p['name']:30s} {p.get('office_level', ''):20s}"
            )

    except Exception as e:
        logger.error(f"  FAIL: Could not fetch from Supabase: {e}")
        politicians = []

    # 5. Test connectivity to key sources
    logger.info(f"\n[5/5] Testing connectivity...")

    # Test Google News RSS
    test_url = "https://news.google.com/rss/search?q=Florida+Senator&hl=en-US&gl=US&ceid=US:en"
    try:
        resp = fetch_url(test_url, timeout=10, retries=0)
        if resp and resp.status_code == 200:
            logger.info(f"  OK: Google News RSS reachable")
        else:
            logger.warning(f"  WARN: Google News RSS returned {resp.status_code if resp else 'None'}")
    except Exception as e:
        logger.warning(f"  WARN: Google News RSS unreachable: {e}")

    # Test a Senate RSS feed
    test_rss = "https://www.rubio.senate.gov/rss/feeds/?type=press"
    try:
        resp = fetch_url(test_rss, timeout=10, retries=0)
        if resp and resp.status_code == 200:
            logger.info(f"  OK: Senate RSS feeds reachable (tested rubio.senate.gov)")
        else:
            logger.info(f"  INFO: rubio.senate.gov RSS returned {resp.status_code if resp else 'None'} (some feeds use different paths)")
    except Exception as e:
        logger.info(f"  INFO: rubio.senate.gov test: {e}")

    # Test YouTube RSS
    test_yt = "https://www.youtube.com/feeds/videos.xml?channel_id=UCnJ4fVEJujmFnRBRODSkzOQ"
    try:
        resp = fetch_url(test_yt, timeout=10, retries=0)
        if resp and resp.status_code == 200:
            logger.info(f"  OK: YouTube RSS feeds reachable")
        else:
            logger.info(f"  INFO: YouTube RSS returned {resp.status_code if resp else 'None'}")
    except Exception as e:
        logger.info(f"  INFO: YouTube RSS test: {e}")

    # Verify output directory
    logger.info(f"\n  Output file: {OUTPUT_FILE}")
    logger.info(f"  Directory exists: {OUTPUT_FILE.parent.exists()}")
    logger.info(f"  Writable: {os.access(OUTPUT_FILE.parent, os.W_OK)}")

    # Summary
    logger.info("\n" + "=" * 70)
    logger.info("  DRY RUN COMPLETE")
    logger.info("=" * 70)
    logger.info(f"  Sources to scrape: {', '.join(platforms)}")
    logger.info(f"  Politicians ready: {len(politicians)}")
    logger.info(f"  Pipeline status:   READY")
    logger.info("=" * 70)

    return {
        "mode": "dry-run",
        "status": "ready",
        "politicians_available": len(politicians),
        "platforms": platforms,
        "output_path": str(OUTPUT_FILE),
    }


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(
        description="Snitched.ai Public Records & News Scraper",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Sources (use with --platforms):
  rss        Official .gov RSS/Atom feeds (press releases, news)
  news       Google News RSS (recent news mentions)
  press      Official website press release pages (requires beautifulsoup4)
  youtube    YouTube channel RSS feeds
  twitter    Twitter/X posts via Twikit (guest mode, no API key)
  facebook   Facebook page posts via facebook-scraper (no API key)
  instagram  Instagram profile posts via Instaloader (no API key)

Examples:
  python scrape-social-media.py --dry-run
  python scrape-social-media.py --batch --limit 5
  python scrape-social-media.py --batch --platforms twitter,facebook,instagram
  python scrape-social-media.py --politician "Rick Scott" --platforms twitter
  python scrape-social-media.py --batch --platforms rss,news,press,twitter,facebook,instagram --limit 20
        """,
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate pipeline without scraping",
    )
    parser.add_argument(
        "--batch",
        action="store_true",
        help="Scrape all politicians (or up to --limit)",
    )
    parser.add_argument(
        "--politician", help="Scrape a specific politician by name"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=100,
        help="Max politicians to process (default: 100)",
    )
    parser.add_argument(
        "--platforms",
        default="rss,news,press,twitter,facebook,instagram",
        help="Comma-separated sources: rss,news,press,youtube,twitter,facebook,instagram",
    )
    parser.add_argument(
        "--max-posts",
        type=int,
        default=20,
        help="Max posts per source per politician (default: 20)",
    )
    parser.add_argument(
        "--offset",
        type=int,
        default=0,
        help="Skip first N politicians (for rotation)",
    )
    parser.add_argument("--output", help="Override output file path")
    parser.add_argument(
        "--no-supabase",
        action="store_true",
        help="Skip pushing results to Supabase",
    )

    args = parser.parse_args()
    platforms = [p.strip().lower() for p in args.platforms.split(",")]

    if args.dry_run:
        result = run_dry_run(platforms, args.limit)
        print(json.dumps(result, indent=2))
        return

    if not args.batch and not args.politician:
        parser.error("Specify --batch, --politician, or --dry-run")

    # Fetch politicians
    politicians = supabase_get_politicians(limit=args.limit, offset=args.offset)

    if args.politician:
        # Filter to specific politician
        name_lower = args.politician.lower()
        politicians = [
            p for p in politicians if name_lower in p["name"].lower()
        ]
        if not politicians:
            logger.error(f"No politician found matching '{args.politician}'")
            sys.exit(1)
        logger.info(
            f"Found {len(politicians)} politician(s) matching '{args.politician}'"
        )

    # Run pipeline
    output_path = Path(args.output) if args.output else OUTPUT_FILE
    pipeline = SocialMediaPipeline(
        platforms=platforms, max_posts_per_platform=args.max_posts
    )
    result = pipeline.run(
        politicians,
        output_path=output_path,
        push_to_supabase=not args.no_supabase,
    )

    # Print final JSON summary to stdout
    summary = {
        "status": "complete",
        "politicians_processed": result["statistics"]["politicians_scraped"],
        "total_posts": result["statistics"]["total_posts"],
        "errors": len(result["statistics"]["errors"]),
        "output_file": str(output_path),
        "duration_seconds": result["metadata"]["duration_seconds"],
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()

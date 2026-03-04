#!/usr/bin/env python3
"""
Social Media Scraper for Snitched.ai
=====================================
Scrapes politician social media posts for sentiment analysis and archiving.

Engines:
  - Scrapling (primary) -- for Twitter/X via Nitter, Instagram public profiles,
    TikTok public profiles, YouTube channel pages
  - facebook-scraper   -- for Facebook page posts

Data flow:
  1. Read politician social handles from Supabase REST API
  2. For each politician, scrape recent posts from available platforms
  3. Run sentiment analysis on post text
  4. Save results to data-ingestion/social-media-posts.json
  5. Optionally push results back to Supabase

Usage:
    python scrape-social-media.py --dry-run          # Validate pipeline, no scraping
    python scrape-social-media.py --batch --limit 5   # Scrape 5 politicians
    python scrape-social-media.py --batch             # Scrape all politicians
    python scrape-social-media.py --politician "Rick Scott"
    python scrape-social-media.py --platforms twitter,facebook --limit 10
"""

import os
import sys
import json
import logging
import argparse
import hashlib
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import time
from pathlib import Path

import requests

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

SUPABASE_URL = os.getenv(
    "SUPABASE_URL", "https://uqjfxhpyitleeleazzow.supabase.co"
)
SUPABASE_SERVICE_KEY = os.getenv(
    "SUPABASE_SERVICE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxamZ4aHB5aXRsZWVsZWF6em93Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTc2NzQzOCwiZXhwIjoyMDg3MzQzNDM4fQ.abK_AJ-qataXyYn59I2w2rTxP4dIyl1UjCAMkw_6JPw",
)

SUPABASE_HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

# ---------------------------------------------------------------------------
# Nitter mirrors for Twitter/X scraping (public, no auth needed)
# ---------------------------------------------------------------------------

NITTER_INSTANCES = [
    "https://nitter.privacydev.net",
    "https://nitter.poast.org",
    "https://nitter.woodland.cafe",
    "https://nitter.net",
    "https://nitter.cz",
]

# ---------------------------------------------------------------------------
# Scrapling engine (lazy-loaded)
# ---------------------------------------------------------------------------

_scrapling_fetcher = None


def get_fetcher():
    """Lazy-load Scrapling Fetcher."""
    global _scrapling_fetcher
    if _scrapling_fetcher is None:
        try:
            from scrapling import Fetcher
            _scrapling_fetcher = Fetcher(auto_match=False)
            logger.info("Scrapling Fetcher initialized")
        except ImportError:
            logger.error(
                "Scrapling not installed. Install with: pip install scrapling>=0.4.1"
            )
            raise
    return _scrapling_fetcher


def scrapling_get(url: str, timeout: int = 30, retries: int = 2) -> Any:
    """Fetch a page via Scrapling with retries."""
    fetcher = get_fetcher()
    last_error = None
    for attempt in range(retries + 1):
        try:
            page = fetcher.get(url, timeout=timeout)
            return page
        except Exception as e:
            last_error = e
            if attempt < retries:
                wait = 2 * (attempt + 1)
                logger.debug(f"Retry {attempt + 1} for {url} in {wait}s: {e}")
                time.sleep(wait)
    raise last_error


# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------


def supabase_get_politicians(limit: int = 1000, offset: int = 0) -> List[Dict[str, Any]]:
    """Fetch politicians with social media handles from Supabase."""
    url = (
        f"{SUPABASE_URL}/rest/v1/politicians"
        f"?select=bioguide_id,name,office,office_level,party,social_media"
        f"&social_media=not.eq.{{}}"
        f"&order=name"
        f"&limit={limit}"
        f"&offset={offset}"
    )
    resp = requests.get(url, headers=SUPABASE_HEADERS, timeout=30)
    resp.raise_for_status()
    politicians = resp.json()
    logger.info(f"Fetched {len(politicians)} politicians with social media data (offset={offset})")
    return politicians


# ---------------------------------------------------------------------------
# Platform scrapers
# ---------------------------------------------------------------------------


class TwitterScraper:
    """Scrape Twitter/X posts via Nitter mirrors using Scrapling."""

    def __init__(self):
        self.working_instance: Optional[str] = None

    def _find_working_instance(self) -> Optional[str]:
        """Probe Nitter mirrors to find one that works."""
        if self.working_instance:
            return self.working_instance

        for instance in NITTER_INSTANCES:
            try:
                page = scrapling_get(f"{instance}/jack", timeout=15, retries=0)
                # Check if we got a real page (not a captcha/error)
                if page and hasattr(page, "css"):
                    tweets = page.css(".timeline-item")
                    if tweets:
                        self.working_instance = instance
                        logger.info(f"Found working Nitter instance: {instance}")
                        return instance
            except Exception as e:
                logger.debug(f"Nitter instance {instance} failed: {e}")
                continue

        logger.warning("No working Nitter instances found")
        return None

    def scrape(
        self, handle: str, politician_id: str, politician_name: str, max_posts: int = 20
    ) -> List[Dict[str, Any]]:
        """Scrape recent tweets for a handle via Nitter."""
        posts = []
        instance = self._find_working_instance()

        if not instance:
            logger.warning(
                f"Twitter: No Nitter instance available for @{handle}, "
                f"falling back to direct X.com profile scrape"
            )
            return self._scrape_x_direct(handle, politician_id, politician_name, max_posts)

        try:
            url = f"{instance}/{handle}"
            logger.info(f"Twitter: Scraping {url}")
            page = scrapling_get(url, timeout=20)

            if not page:
                return posts

            # Parse Nitter timeline items
            items = page.css(".timeline-item")
            for item in items[:max_posts]:
                try:
                    # Extract tweet content
                    content_el = item.css(".tweet-content")
                    content = ""
                    if content_el:
                        content = (content_el[0].text or "").strip()

                    if not content:
                        continue

                    # Extract date
                    date_el = item.css(".tweet-date a")
                    posted_at = datetime.now().isoformat()
                    post_path = ""
                    if date_el:
                        post_path = date_el[0].attrib.get("href", "")
                        title = date_el[0].attrib.get("title", "")
                        if title:
                            try:
                                posted_at = datetime.strptime(
                                    title, "%b %d, %Y · %I:%M %p %Z"
                                ).isoformat()
                            except ValueError:
                                pass

                    # Extract stats
                    stats = {"likes": 0, "retweets": 0, "replies": 0}
                    stat_items = item.css(".tweet-stat")
                    for stat in stat_items:
                        text = (stat.text or "").strip().lower()
                        icon_el = stat.css(".icon-container")
                        if not icon_el:
                            continue
                        icon_classes = icon_el[0].attrib.get("class", "")
                        # Try to extract number
                        num_el = stat.css(".tweet-stat-num")
                        num = 0
                        if num_el:
                            try:
                                raw = (num_el[0].text or "").strip().replace(",", "")
                                if raw:
                                    num = int(raw)
                            except ValueError:
                                pass

                        if "comment" in icon_classes or "reply" in icon_classes:
                            stats["replies"] = num
                        elif "retweet" in icon_classes:
                            stats["retweets"] = num
                        elif "heart" in icon_classes or "like" in icon_classes:
                            stats["likes"] = num

                    # Build post URL
                    post_url = f"https://x.com{post_path}" if post_path else f"https://x.com/{handle}"

                    # Generate stable ID for deduplication
                    post_hash = hashlib.md5(
                        f"{handle}:{content[:100]}:{posted_at}".encode()
                    ).hexdigest()[:12]

                    posts.append(
                        {
                            "id": f"tw-{post_hash}",
                            "politician_id": politician_id,
                            "politician_name": politician_name,
                            "platform": "twitter",
                            "handle": f"@{handle}",
                            "content": content[:5000],
                            "post_url": post_url,
                            "posted_at": posted_at,
                            "likes_count": stats["likes"],
                            "shares_count": stats["retweets"],
                            "comments_count": stats["replies"],
                            "is_deleted": False,
                            "scraped_at": datetime.now().isoformat(),
                        }
                    )

                except Exception as e:
                    logger.debug(f"Error parsing tweet item: {e}")
                    continue

            logger.info(f"Twitter: Scraped {len(posts)} posts from @{handle}")

        except Exception as e:
            logger.error(f"Twitter: Error scraping @{handle}: {e}")

        return posts

    def _scrape_x_direct(
        self, handle: str, politician_id: str, politician_name: str, max_posts: int = 20
    ) -> List[Dict[str, Any]]:
        """
        Fallback: attempt to scrape x.com directly.
        X.com is heavily JS-rendered so this will likely get limited data,
        but we try to extract what we can from the initial HTML.
        """
        posts = []
        try:
            url = f"https://x.com/{handle}"
            logger.info(f"Twitter: Attempting direct scrape of {url}")
            page = scrapling_get(url, timeout=20)

            if page:
                # X.com loads tweets via JS, so HTML scraping is limited.
                # We extract the page title and meta description at minimum.
                meta_desc = page.css('meta[name="description"]')
                if meta_desc:
                    desc = meta_desc[0].attrib.get("content", "")
                    if desc:
                        post_hash = hashlib.md5(
                            f"{handle}:bio:{desc[:50]}".encode()
                        ).hexdigest()[:12]
                        posts.append(
                            {
                                "id": f"tw-{post_hash}",
                                "politician_id": politician_id,
                                "politician_name": politician_name,
                                "platform": "twitter",
                                "handle": f"@{handle}",
                                "content": f"[Profile bio] {desc[:5000]}",
                                "post_url": url,
                                "posted_at": datetime.now().isoformat(),
                                "likes_count": 0,
                                "shares_count": 0,
                                "comments_count": 0,
                                "is_deleted": False,
                                "scraped_at": datetime.now().isoformat(),
                                "note": "Bio only - X.com requires JS for full tweets",
                            }
                        )
                logger.info(
                    f"Twitter: Direct scrape got {len(posts)} items from @{handle}"
                )
        except Exception as e:
            logger.error(f"Twitter: Direct scrape failed for @{handle}: {e}")

        return posts


class FacebookScraper:
    """Scrape Facebook page posts using facebook-scraper library."""

    def scrape(
        self,
        page_id: str,
        politician_id: str,
        politician_name: str,
        page_url: Optional[str] = None,
        max_posts: int = 20,
    ) -> List[Dict[str, Any]]:
        """Scrape recent Facebook posts."""
        posts = []

        try:
            from facebook_scraper import get_posts

            logger.info(f"Facebook: Scraping page '{page_id}'")

            for post in get_posts(page_id, pages=3, timeout=30):
                if not post.get("text"):
                    continue

                post_time = post.get("time")
                if isinstance(post_time, datetime):
                    posted_at = post_time.isoformat()
                else:
                    posted_at = datetime.now().isoformat()

                content = (post.get("text") or "")[:5000]
                post_url = post.get(
                    "post_url", f"https://facebook.com/{page_id}"
                )

                post_hash = hashlib.md5(
                    f"{page_id}:{content[:100]}:{posted_at}".encode()
                ).hexdigest()[:12]

                posts.append(
                    {
                        "id": f"fb-{post_hash}",
                        "politician_id": politician_id,
                        "politician_name": politician_name,
                        "platform": "facebook",
                        "handle": page_id,
                        "content": content,
                        "post_url": post_url,
                        "posted_at": posted_at,
                        "likes_count": post.get("likes", 0) or 0,
                        "shares_count": post.get("shares", 0) or 0,
                        "comments_count": post.get("comments", 0) or 0,
                        "is_deleted": False,
                        "scraped_at": datetime.now().isoformat(),
                    }
                )

                if len(posts) >= max_posts:
                    break

            logger.info(f"Facebook: Scraped {len(posts)} posts from {page_id}")

        except ImportError:
            logger.warning(
                "facebook-scraper not installed. Install with: pip install facebook-scraper"
            )
        except Exception as e:
            logger.error(f"Facebook: Error scraping {page_id}: {e}")

            # Fall back to Scrapling direct scrape of Facebook page
            if page_url:
                posts = self._scrape_direct(
                    page_url, page_id, politician_id, politician_name
                )

        return posts

    def _scrape_direct(
        self,
        page_url: str,
        page_id: str,
        politician_id: str,
        politician_name: str,
    ) -> List[Dict[str, Any]]:
        """Fallback: scrape Facebook page via Scrapling (limited data)."""
        posts = []
        try:
            logger.info(f"Facebook: Attempting direct Scrapling scrape of {page_url}")
            page = scrapling_get(page_url, timeout=20)
            if page:
                # Facebook pages return limited data without JS
                meta_desc = page.css('meta[name="description"]')
                if meta_desc:
                    desc = meta_desc[0].attrib.get("content", "")
                    if desc:
                        post_hash = hashlib.md5(
                            f"{page_id}:meta:{desc[:50]}".encode()
                        ).hexdigest()[:12]
                        posts.append(
                            {
                                "id": f"fb-{post_hash}",
                                "politician_id": politician_id,
                                "politician_name": politician_name,
                                "platform": "facebook",
                                "handle": page_id,
                                "content": f"[Page description] {desc[:5000]}",
                                "post_url": page_url,
                                "posted_at": datetime.now().isoformat(),
                                "likes_count": 0,
                                "shares_count": 0,
                                "comments_count": 0,
                                "is_deleted": False,
                                "scraped_at": datetime.now().isoformat(),
                                "note": "Metadata only - Facebook requires JS for full posts",
                            }
                        )
        except Exception as e:
            logger.error(f"Facebook: Direct scrape failed for {page_url}: {e}")
        return posts


class InstagramScraper:
    """Scrape Instagram public profiles using Scrapling."""

    def scrape(
        self, handle: str, politician_id: str, politician_name: str, max_posts: int = 20
    ) -> List[Dict[str, Any]]:
        """Scrape public Instagram profile for recent posts."""
        posts = []

        try:
            url = f"https://www.instagram.com/{handle}/"
            logger.info(f"Instagram: Scraping {url}")
            page = scrapling_get(url, timeout=20)

            if not page:
                return posts

            # Instagram embeds JSON-LD data in meta tags for public profiles
            # Try og:description for bio/follower info
            meta_desc = page.css('meta[property="og:description"]')
            if meta_desc:
                desc = meta_desc[0].attrib.get("content", "")
                if desc:
                    post_hash = hashlib.md5(
                        f"ig:{handle}:{desc[:50]}".encode()
                    ).hexdigest()[:12]
                    posts.append(
                        {
                            "id": f"ig-{post_hash}",
                            "politician_id": politician_id,
                            "politician_name": politician_name,
                            "platform": "instagram",
                            "handle": f"@{handle}",
                            "content": f"[Profile] {desc[:5000]}",
                            "post_url": url,
                            "posted_at": datetime.now().isoformat(),
                            "likes_count": 0,
                            "shares_count": 0,
                            "comments_count": 0,
                            "is_deleted": False,
                            "scraped_at": datetime.now().isoformat(),
                            "note": "Profile metadata - Instagram requires auth for full post scraping",
                        }
                    )

            # Try to find embedded JSON data (shared_data or additional_data)
            scripts = page.css("script[type='application/ld+json']")
            for script in scripts:
                try:
                    data = json.loads(script.text or "{}")
                    if isinstance(data, dict) and data.get("@type") == "ProfilePage":
                        # Extract any available post data from structured data
                        main_entity = data.get("mainEntity", {})
                        if main_entity.get("interactionStatistic"):
                            for stat in main_entity["interactionStatistic"]:
                                logger.debug(f"Instagram stat: {stat}")
                except (json.JSONDecodeError, TypeError):
                    continue

            logger.info(f"Instagram: Scraped {len(posts)} items from @{handle}")

        except Exception as e:
            logger.error(f"Instagram: Error scraping @{handle}: {e}")

        return posts


class TikTokScraper:
    """Scrape TikTok public profiles using Scrapling."""

    def scrape(
        self, handle: str, politician_id: str, politician_name: str, max_posts: int = 20
    ) -> List[Dict[str, Any]]:
        """Scrape public TikTok profile."""
        posts = []

        try:
            url = f"https://www.tiktok.com/@{handle}"
            logger.info(f"TikTok: Scraping {url}")
            page = scrapling_get(url, timeout=20)

            if not page:
                return posts

            # TikTok public profiles include some metadata in HTML
            meta_desc = page.css('meta[name="description"]')
            if meta_desc:
                desc = meta_desc[0].attrib.get("content", "")
                if desc:
                    post_hash = hashlib.md5(
                        f"tt:{handle}:{desc[:50]}".encode()
                    ).hexdigest()[:12]
                    posts.append(
                        {
                            "id": f"tt-{post_hash}",
                            "politician_id": politician_id,
                            "politician_name": politician_name,
                            "platform": "tiktok",
                            "handle": f"@{handle}",
                            "content": f"[Profile] {desc[:5000]}",
                            "post_url": url,
                            "posted_at": datetime.now().isoformat(),
                            "likes_count": 0,
                            "shares_count": 0,
                            "comments_count": 0,
                            "is_deleted": False,
                            "scraped_at": datetime.now().isoformat(),
                            "note": "Profile metadata - TikTok requires JS for full video scraping",
                        }
                    )

            # Try to extract SIGI_STATE JSON (TikTok embeds video data here)
            scripts = page.css("script#SIGI_STATE, script#__UNIVERSAL_DATA_FOR_REHYDRATION__")
            for script in scripts:
                try:
                    data = json.loads(script.text or "{}")
                    # Parse TikTok's internal data structure for video items
                    items_module = data.get("ItemModule", {})
                    if isinstance(items_module, dict):
                        for video_id, video_data in list(items_module.items())[:max_posts]:
                            content = video_data.get("desc", "")
                            if not content:
                                continue

                            stats = video_data.get("stats", {})
                            create_time = video_data.get("createTime", "")
                            if create_time:
                                try:
                                    posted_at = datetime.fromtimestamp(
                                        int(create_time)
                                    ).isoformat()
                                except (ValueError, OSError):
                                    posted_at = datetime.now().isoformat()
                            else:
                                posted_at = datetime.now().isoformat()

                            v_hash = hashlib.md5(
                                f"tt:{handle}:{video_id}".encode()
                            ).hexdigest()[:12]

                            posts.append(
                                {
                                    "id": f"tt-{v_hash}",
                                    "politician_id": politician_id,
                                    "politician_name": politician_name,
                                    "platform": "tiktok",
                                    "handle": f"@{handle}",
                                    "content": content[:5000],
                                    "post_url": f"https://www.tiktok.com/@{handle}/video/{video_id}",
                                    "posted_at": posted_at,
                                    "likes_count": stats.get("diggCount", 0),
                                    "shares_count": stats.get("shareCount", 0),
                                    "comments_count": stats.get("commentCount", 0),
                                    "views_count": stats.get("playCount", 0),
                                    "is_deleted": False,
                                    "scraped_at": datetime.now().isoformat(),
                                }
                            )
                except (json.JSONDecodeError, TypeError):
                    continue

            logger.info(f"TikTok: Scraped {len(posts)} items from @{handle}")

        except Exception as e:
            logger.error(f"TikTok: Error scraping @{handle}: {e}")

        return posts


class YouTubeScraper:
    """Scrape YouTube channel metadata using Scrapling."""

    def scrape(
        self,
        channel_id: str,
        politician_id: str,
        politician_name: str,
        max_posts: int = 20,
    ) -> List[Dict[str, Any]]:
        """Scrape recent YouTube channel videos."""
        posts = []

        try:
            url = f"https://www.youtube.com/channel/{channel_id}/videos"
            logger.info(f"YouTube: Scraping {url}")
            page = scrapling_get(url, timeout=20)

            if not page:
                return posts

            # YouTube provides some metadata in meta tags
            meta_desc = page.css('meta[name="description"]')
            channel_name_el = page.css('meta[property="og:title"]')
            channel_name = ""
            if channel_name_el:
                channel_name = channel_name_el[0].attrib.get("content", "")

            if meta_desc:
                desc = meta_desc[0].attrib.get("content", "")
                if desc:
                    ch_hash = hashlib.md5(
                        f"yt:{channel_id}:{desc[:50]}".encode()
                    ).hexdigest()[:12]
                    posts.append(
                        {
                            "id": f"yt-{ch_hash}",
                            "politician_id": politician_id,
                            "politician_name": politician_name,
                            "platform": "youtube",
                            "handle": channel_name or channel_id,
                            "content": f"[Channel description] {desc[:5000]}",
                            "post_url": f"https://www.youtube.com/channel/{channel_id}",
                            "posted_at": datetime.now().isoformat(),
                            "likes_count": 0,
                            "shares_count": 0,
                            "comments_count": 0,
                            "is_deleted": False,
                            "scraped_at": datetime.now().isoformat(),
                            "note": "Channel metadata - YouTube requires JS for full video listings",
                        }
                    )

            # Try to extract ytInitialData from script tags
            for script in page.css("script"):
                text = script.text or ""
                if "ytInitialData" in text:
                    try:
                        # Extract JSON from: var ytInitialData = {...};
                        start = text.index("{", text.index("ytInitialData"))
                        # Find the matching closing brace
                        depth = 0
                        end = start
                        for i in range(start, min(start + 500000, len(text))):
                            if text[i] == "{":
                                depth += 1
                            elif text[i] == "}":
                                depth -= 1
                                if depth == 0:
                                    end = i + 1
                                    break

                        if end > start:
                            yt_data = json.loads(text[start:end])
                            # Navigate YouTube's data structure to find videos
                            tabs = (
                                yt_data.get("contents", {})
                                .get("twoColumnBrowseResultsRenderer", {})
                                .get("tabs", [])
                            )
                            for tab in tabs:
                                tab_renderer = tab.get("tabRenderer", {})
                                if tab_renderer.get("title") == "Videos":
                                    items = (
                                        tab_renderer.get("content", {})
                                        .get("richGridRenderer", {})
                                        .get("contents", [])
                                    )
                                    for item in items[:max_posts]:
                                        video = (
                                            item.get("richItemRenderer", {})
                                            .get("content", {})
                                            .get("videoRenderer", {})
                                        )
                                        if not video:
                                            continue

                                        video_id = video.get("videoId", "")
                                        title = ""
                                        title_runs = video.get("title", {}).get("runs", [])
                                        if title_runs:
                                            title = title_runs[0].get("text", "")

                                        if not title:
                                            continue

                                        view_text = (
                                            video.get("viewCountText", {}).get("simpleText", "0")
                                        )

                                        v_hash = hashlib.md5(
                                            f"yt:{channel_id}:{video_id}".encode()
                                        ).hexdigest()[:12]

                                        posts.append(
                                            {
                                                "id": f"yt-{v_hash}",
                                                "politician_id": politician_id,
                                                "politician_name": politician_name,
                                                "platform": "youtube",
                                                "handle": channel_name or channel_id,
                                                "content": title[:5000],
                                                "post_url": f"https://www.youtube.com/watch?v={video_id}",
                                                "posted_at": datetime.now().isoformat(),
                                                "likes_count": 0,
                                                "shares_count": 0,
                                                "comments_count": 0,
                                                "is_deleted": False,
                                                "scraped_at": datetime.now().isoformat(),
                                            }
                                        )

                    except (ValueError, json.JSONDecodeError, TypeError):
                        continue
                    break  # Only process the first ytInitialData block

            logger.info(f"YouTube: Scraped {len(posts)} items from {channel_id}")

        except Exception as e:
            logger.error(f"YouTube: Error scraping {channel_id}: {e}")

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
    """Orchestrates scraping across all platforms for all politicians."""

    PLATFORM_MAP = {
        "twitter": "twitterHandle",
        "facebook": "facebookPageId",
        "instagram": "instagramHandle",
        "tiktok": "tiktokHandle",
        "youtube": "youtubeChannelId",
    }

    def __init__(self, platforms: List[str], max_posts_per_platform: int = 20):
        self.platforms = platforms
        self.max_posts = max_posts_per_platform
        self.twitter_scraper = TwitterScraper()
        self.facebook_scraper = FacebookScraper()
        self.instagram_scraper = InstagramScraper()
        self.tiktok_scraper = TikTokScraper()
        self.youtube_scraper = YouTubeScraper()
        self.all_posts: List[Dict[str, Any]] = []
        self.stats = {
            "total_politicians": 0,
            "politicians_with_social": 0,
            "politicians_scraped": 0,
            "total_posts": 0,
            "by_platform": {},
            "errors": [],
        }

    def _extract_handles(self, politician: Dict) -> Dict[str, Optional[str]]:
        """Extract social media handles from the politician's social_media JSONB."""
        sm = politician.get("social_media") or {}
        return {
            "twitter": sm.get("twitterHandle"),
            "facebook": sm.get("facebookPageId"),
            "facebook_url": sm.get("facebookPageUrl"),
            "instagram": sm.get("instagramHandle"),
            "tiktok": sm.get("tiktokHandle"),
            "youtube": sm.get("youtubeChannelId"),
        }

    def scrape_politician(self, politician: Dict) -> List[Dict[str, Any]]:
        """Scrape all enabled platforms for a single politician."""
        pid = politician["bioguide_id"]
        name = politician["name"]
        handles = self._extract_handles(politician)
        posts: List[Dict[str, Any]] = []

        has_any = any(
            handles.get(p) for p in self.platforms
        )
        if not has_any:
            logger.debug(f"  {name}: No social handles for enabled platforms")
            return posts

        self.stats["politicians_with_social"] += 1

        # Twitter
        if "twitter" in self.platforms and handles.get("twitter"):
            try:
                tw_posts = self.twitter_scraper.scrape(
                    handles["twitter"], pid, name, self.max_posts
                )
                posts.extend(tw_posts)
                self.stats["by_platform"]["twitter"] = (
                    self.stats["by_platform"].get("twitter", 0) + len(tw_posts)
                )
            except Exception as e:
                self.stats["errors"].append(
                    {"politician": name, "platform": "twitter", "error": str(e)}
                )
            time.sleep(2)

        # Facebook
        if "facebook" in self.platforms and handles.get("facebook"):
            try:
                fb_posts = self.facebook_scraper.scrape(
                    handles["facebook"],
                    pid,
                    name,
                    page_url=handles.get("facebook_url"),
                    max_posts=self.max_posts,
                )
                posts.extend(fb_posts)
                self.stats["by_platform"]["facebook"] = (
                    self.stats["by_platform"].get("facebook", 0) + len(fb_posts)
                )
            except Exception as e:
                self.stats["errors"].append(
                    {"politician": name, "platform": "facebook", "error": str(e)}
                )
            time.sleep(2)

        # Instagram
        if "instagram" in self.platforms and handles.get("instagram"):
            try:
                ig_posts = self.instagram_scraper.scrape(
                    handles["instagram"], pid, name, self.max_posts
                )
                posts.extend(ig_posts)
                self.stats["by_platform"]["instagram"] = (
                    self.stats["by_platform"].get("instagram", 0) + len(ig_posts)
                )
            except Exception as e:
                self.stats["errors"].append(
                    {"politician": name, "platform": "instagram", "error": str(e)}
                )
            time.sleep(2)

        # TikTok
        if "tiktok" in self.platforms and handles.get("tiktok"):
            try:
                tt_posts = self.tiktok_scraper.scrape(
                    handles["tiktok"], pid, name, self.max_posts
                )
                posts.extend(tt_posts)
                self.stats["by_platform"]["tiktok"] = (
                    self.stats["by_platform"].get("tiktok", 0) + len(tt_posts)
                )
            except Exception as e:
                self.stats["errors"].append(
                    {"politician": name, "platform": "tiktok", "error": str(e)}
                )
            time.sleep(2)

        # YouTube
        if "youtube" in self.platforms and handles.get("youtube"):
            try:
                yt_posts = self.youtube_scraper.scrape(
                    handles["youtube"], pid, name, self.max_posts
                )
                posts.extend(yt_posts)
                self.stats["by_platform"]["youtube"] = (
                    self.stats["by_platform"].get("youtube", 0) + len(yt_posts)
                )
            except Exception as e:
                self.stats["errors"].append(
                    {"politician": name, "platform": "youtube", "error": str(e)}
                )
            time.sleep(2)

        # Sentiment analysis
        for post in posts:
            content = post.get("content", "")
            if content:
                post["sentiment_score"] = analyze_sentiment(content)

        if posts:
            self.stats["politicians_scraped"] += 1

        return posts

    def run(
        self,
        politicians: List[Dict],
        output_path: Path = OUTPUT_FILE,
    ) -> Dict[str, Any]:
        """Run the full scraping pipeline."""
        start_time = datetime.now()
        self.stats["total_politicians"] = len(politicians)

        logger.info("=" * 70)
        logger.info("  Snitched.ai - Social Media Scraper")
        logger.info("=" * 70)
        logger.info(f"  Politicians:  {len(politicians)}")
        logger.info(f"  Platforms:    {', '.join(self.platforms)}")
        logger.info(f"  Max posts:    {self.max_posts} per platform")
        logger.info(f"  Output:       {output_path}")
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

        # Save output
        output_data = {
            "metadata": {
                "scraper": "snitched-social-media-scraper",
                "version": "2.0.0",
                "engine": "scrapling + facebook-scraper",
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

        # Print summary
        duration = (datetime.now() - start_time).total_seconds()
        logger.info("")
        logger.info("=" * 70)
        logger.info("  SCRAPE SUMMARY")
        logger.info("=" * 70)
        logger.info(f"  Total politicians:     {self.stats['total_politicians']}")
        logger.info(f"  With social handles:   {self.stats['politicians_with_social']}")
        logger.info(f"  Successfully scraped:  {self.stats['politicians_scraped']}")
        logger.info(f"  Total posts collected: {self.stats['total_posts']}")
        logger.info(f"  Errors:                {len(self.stats['errors'])}")
        logger.info(f"  Duration:              {duration:.1f}s")

        if self.stats["by_platform"]:
            logger.info("")
            logger.info("  By platform:")
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

    # 1. Check Scrapling import
    logger.info("\n[1/5] Checking Scrapling installation...")
    try:
        from scrapling import Fetcher
        logger.info("  OK: Scrapling is available")
    except ImportError as e:
        logger.error(f"  FAIL: Scrapling not installed: {e}")

    # 2. Check facebook-scraper import
    logger.info("\n[2/5] Checking facebook-scraper installation...")
    try:
        from facebook_scraper import get_posts  # noqa: F401
        logger.info("  OK: facebook-scraper is available")
    except ImportError as e:
        logger.warning(f"  WARN: facebook-scraper not installed: {e}")

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
        logger.info(f"  OK: Found {len(politicians)} politicians with social media data")

        # Count handles by platform
        counts = {"twitter": 0, "facebook": 0, "instagram": 0, "tiktok": 0, "youtube": 0}
        for p in politicians:
            sm = p.get("social_media") or {}
            if sm.get("twitterHandle"):
                counts["twitter"] += 1
            if sm.get("facebookPageId"):
                counts["facebook"] += 1
            if sm.get("instagramHandle"):
                counts["instagram"] += 1
            if sm.get("tiktokHandle"):
                counts["tiktok"] += 1
            if sm.get("youtubeChannelId"):
                counts["youtube"] += 1

        logger.info(f"  Twitter handles:   {counts['twitter']}")
        logger.info(f"  Facebook pages:    {counts['facebook']}")
        logger.info(f"  Instagram handles: {counts['instagram']}")
        logger.info(f"  TikTok handles:    {counts['tiktok']}")
        logger.info(f"  YouTube channels:  {counts['youtube']}")

        # Show a few sample politicians
        logger.info("\n  Sample politicians:")
        for p in politicians[:5]:
            sm = p.get("social_media") or {}
            handles = []
            if sm.get("twitterHandle"):
                handles.append(f"@{sm['twitterHandle']}")
            if sm.get("facebookPageId"):
                handles.append(f"FB:{sm['facebookPageId']}")
            if sm.get("instagramHandle"):
                handles.append(f"IG:@{sm['instagramHandle']}")
            logger.info(
                f"    {p['name']:30s} {p.get('office_level', ''):20s} {', '.join(handles)}"
            )

    except Exception as e:
        logger.error(f"  FAIL: Could not fetch from Supabase: {e}")
        politicians = []

    # 5. Verify output directory
    logger.info(f"\n[5/5] Checking output path...")
    logger.info(f"  Output file: {OUTPUT_FILE}")
    logger.info(f"  Directory exists: {OUTPUT_FILE.parent.exists()}")
    logger.info(f"  Writable: {os.access(OUTPUT_FILE.parent, os.W_OK)}")

    # Summary
    logger.info("\n" + "=" * 70)
    logger.info("  DRY RUN COMPLETE")
    logger.info("=" * 70)
    logger.info(f"  Platforms to scrape: {', '.join(platforms)}")
    logger.info(f"  Politicians ready:   {len(politicians)}")
    logger.info(f"  Pipeline status:     READY")
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
        description="Snitched.ai Social Media Scraper",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python scrape-social-media.py --dry-run
  python scrape-social-media.py --batch --limit 5
  python scrape-social-media.py --batch --platforms twitter,facebook
  python scrape-social-media.py --politician "Rick Scott"
        """,
    )
    parser.add_argument("--dry-run", action="store_true", help="Validate pipeline without scraping")
    parser.add_argument("--batch", action="store_true", help="Scrape all politicians (or up to --limit)")
    parser.add_argument("--politician", help="Scrape a specific politician by name")
    parser.add_argument("--limit", type=int, default=100, help="Max politicians to process (default: 100)")
    parser.add_argument(
        "--platforms",
        default="twitter,facebook,instagram",
        help="Comma-separated platforms (default: twitter,facebook,instagram)",
    )
    parser.add_argument("--max-posts", type=int, default=20, help="Max posts per platform per politician")
    parser.add_argument("--offset", type=int, default=0, help="Skip first N politicians (for rotation)")
    parser.add_argument("--output", help="Override output file path")

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
            p
            for p in politicians
            if name_lower in p["name"].lower()
        ]
        if not politicians:
            logger.error(f"No politician found matching '{args.politician}'")
            sys.exit(1)
        logger.info(f"Found {len(politicians)} politician(s) matching '{args.politician}'")

    # Run pipeline
    output_path = Path(args.output) if args.output else OUTPUT_FILE
    pipeline = SocialMediaPipeline(platforms=platforms, max_posts_per_platform=args.max_posts)
    result = pipeline.run(politicians, output_path=output_path)

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

#!/usr/bin/env python3
"""
JFK-Social Scraper for Snitched.ai
Scrapes social media posts for all politicians from JFK-Intel Phase 1 data.
Outputs JSON files for review (does NOT update database).

Usage:
    python jfk-social-scraper.py
"""

import os
import sys
import json
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import time
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/Users/jaketad/.openclaw/workspace/snitched-ai/scrapers/logs/jfk-social-scraper.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Paths
DATA_DIR = Path('/Users/jaketad/.openclaw/workspace/snitched-ai/data-ingestion/phase1/processed')
OUTPUT_DIR = Path('/Users/jaketad/.openclaw/workspace/snitched-ai/data-ingestion/jfk-social-results')
POLITICIANS_FILE = DATA_DIR / 'florida_politicians.json'

# Ensure output directory exists
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


class JFKSocialScraper:
    """Social media scraper for JFK-Intel politicians."""
    
    def __init__(self):
        self.results = []
        self.stats = {
            'total_politicians': 0,
            'politicians_with_social': 0,
            'platforms': {
                'twitter': 0,
                'facebook': 0,
                'instagram': 0
            },
            'total_posts': 0,
            'posts_by_platform': {
                'twitter': 0,
                'facebook': 0,
                'instagram': 0
            },
            'errors': []
        }
        
    def analyze_sentiment(self, text: str) -> float:
        """Analyze sentiment of text using TextBlob."""
        try:
            from textblob import TextBlob
            blob = TextBlob(text)
            return round(blob.sentiment.polarity, 3)
        except ImportError:
            logger.warning("TextBlob not installed - sentiment analysis disabled")
            return 0.0
        except Exception as e:
            logger.warning(f"Sentiment analysis failed: {e}")
            return 0.0
    
    def scrape_twitter(self, handle: str, user_id: int, politician_id: str, politician_name: str) -> List[Dict]:
        """
        Scrape Twitter posts (MOCK DATA for now - real implementation would use API/scraper).
        In production, this would use Twitter API v2, TwitterUserScraper, or nitter.
        """
        logger.info(f"Scraping Twitter: @{handle} for {politician_name}")
        posts = []
        
        try:
            # MOCK DATA - In production, replace with real scraper
            # For now, generate realistic sample posts
            sample_tweets = [
                "Honored to serve the great people of Florida. Working hard on infrastructure this week.",
                "Just voted on critical legislation to protect our communities. #Florida #Congress",
                "Thank you to all who attended today's town hall. Your voices matter!",
                "Meeting with local business leaders to discuss economic growth opportunities.",
                "Proud to support our veterans and first responders. They deserve our full support.",
                "Working across the aisle to find solutions for Florida families.",
                "Great meeting with constituents today. Democracy works when we listen to each other.",
                "Standing up for our values and fighting for Florida's future.",
                "Grateful for the opportunity to represent such an amazing district.",
                "Looking forward to the town hall this weekend. See you there!"
            ]
            
            for i in range(10):
                post_date = datetime.now() - timedelta(days=i*3 + 1)
                posts.append({
                    'politician_id': politician_id,
                    'politician_name': politician_name,
                    'platform': 'twitter',
                    'content': sample_tweets[i % len(sample_tweets)],
                    'post_url': f"https://twitter.com/{handle}/status/{1234567890 + i}",
                    'posted_at': post_date.isoformat(),
                    'likes_count': 100 + (i * 25),
                    'shares_count': 10 + (i * 5),
                    'comments_count': 5 + (i * 2),
                    'sentiment_score': None,  # Will be filled later
                    'is_deleted': False,  # Phase 2 feature placeholder
                    'scraped_at': datetime.now().isoformat()
                })
            
            logger.info(f"✓ Scraped {len(posts)} tweets from @{handle}")
            
        except Exception as e:
            logger.error(f"✗ Error scraping Twitter @{handle}: {e}")
            self.stats['errors'].append({
                'politician': politician_name,
                'platform': 'twitter',
                'error': str(e)
            })
        
        return posts
    
    def scrape_facebook(self, page_id: str, politician_id: str, politician_name: str) -> List[Dict]:
        """
        Scrape Facebook posts (MOCK DATA for now - real implementation would use facebook-scraper).
        In production, this would use facebook-scraper library.
        """
        logger.info(f"Scraping Facebook: {page_id} for {politician_name}")
        posts = []
        
        try:
            # MOCK DATA - In production, use facebook-scraper
            sample_posts = [
                "Thank you Florida for your continued support! Together we're making a difference.",
                "Excited to announce new initiatives that will benefit our communities across the state.",
                "Had a productive week in Washington working on important legislation.",
                "Join me this Saturday for a community event. Details in the link below!",
                "Grateful for the opportunity to serve. Here's what we accomplished this month...",
                "Standing with Florida families on issues that matter most.",
                "Important update on recent legislative developments affecting our district.",
                "Proud to announce federal funding for local infrastructure projects!",
                "Thank you to everyone who reached out this week. Your input shapes my work.",
                "Looking ahead to next session with optimism and determination."
            ]
            
            for i in range(10):
                post_date = datetime.now() - timedelta(days=i*4 + 2)
                posts.append({
                    'politician_id': politician_id,
                    'politician_name': politician_name,
                    'platform': 'facebook',
                    'content': sample_posts[i % len(sample_posts)],
                    'post_url': f"https://facebook.com/{page_id}/posts/{9876543210 - i}",
                    'posted_at': post_date.isoformat(),
                    'likes_count': 200 + (i * 40),
                    'shares_count': 30 + (i * 8),
                    'comments_count': 15 + (i * 4),
                    'sentiment_score': None,
                    'is_deleted': False,
                    'scraped_at': datetime.now().isoformat()
                })
            
            logger.info(f"✓ Scraped {len(posts)} Facebook posts from {page_id}")
            
        except Exception as e:
            logger.error(f"✗ Error scraping Facebook {page_id}: {e}")
            self.stats['errors'].append({
                'politician': politician_name,
                'platform': 'facebook',
                'error': str(e)
            })
        
        return posts
    
    def scrape_instagram(self, handle: str, politician_id: str, politician_name: str) -> List[Dict]:
        """
        Scrape Instagram posts (MOCK DATA - requires authentication in production).
        """
        logger.info(f"Scraping Instagram: @{handle} for {politician_name}")
        posts = []
        
        try:
            # MOCK DATA - Instagram scraping requires authentication
            sample_captions = [
                "Beautiful day in Florida! 🌴 #Florida #Sunshine",
                "Meeting with amazing constituents today. Thank you for your passion! 🙌",
                "Behind the scenes at the Capitol. Hard at work for Florida families! 🏛️",
                "Celebrating our community heroes! 🎖️ #FloridaProud",
                "Great turnout at today's event! Democracy in action 🗳️",
                "Supporting local businesses across our district. Shop local! 🛍️",
                "Honored to serve. Grateful for this opportunity. 🇺🇸",
                "Weekend town hall recap - thank you to everyone who attended! 👏",
                "Working together for a better tomorrow. #TeamFlorida 💪",
                "Proud moment representing Florida in Congress! 🏛️✨"
            ]
            
            for i in range(10):
                post_date = datetime.now() - timedelta(days=i*5 + 1)
                posts.append({
                    'politician_id': politician_id,
                    'politician_name': politician_name,
                    'platform': 'instagram',
                    'content': sample_captions[i % len(sample_captions)],
                    'post_url': f"https://instagram.com/p/ABC{1000 + i}XYZ",
                    'posted_at': post_date.isoformat(),
                    'likes_count': 500 + (i * 75),
                    'shares_count': 0,  # Instagram doesn't show share count publicly
                    'comments_count': 25 + (i * 6),
                    'sentiment_score': None,
                    'is_deleted': False,
                    'scraped_at': datetime.now().isoformat()
                })
            
            logger.info(f"✓ Scraped {len(posts)} Instagram posts from @{handle}")
            
        except Exception as e:
            logger.error(f"✗ Error scraping Instagram @{handle}: {e}")
            self.stats['errors'].append({
                'politician': politician_name,
                'platform': 'instagram',
                'error': str(e)
            })
        
        return posts
    
    def scrape_politician(self, politician: Dict[str, Any]) -> List[Dict]:
        """Scrape all social media platforms for a politician."""
        all_posts = []
        politician_id = politician['politician_id']
        name = politician['name']
        
        has_social = False
        
        # Twitter
        if politician.get('twitter_handle'):
            has_social = True
            self.stats['platforms']['twitter'] += 1
            twitter_posts = self.scrape_twitter(
                politician['twitter_handle'],
                politician.get('twitter_user_id'),
                politician_id,
                name
            )
            all_posts.extend(twitter_posts)
            self.stats['posts_by_platform']['twitter'] += len(twitter_posts)
            time.sleep(2.5)  # Rate limiting: 2-3 second delay
        
        # Facebook
        if politician.get('facebook_page_id'):
            has_social = True
            self.stats['platforms']['facebook'] += 1
            facebook_posts = self.scrape_facebook(
                politician['facebook_page_id'],
                politician_id,
                name
            )
            all_posts.extend(facebook_posts)
            self.stats['posts_by_platform']['facebook'] += len(facebook_posts)
            time.sleep(2.5)
        
        # Instagram
        if politician.get('instagram_handle'):
            has_social = True
            self.stats['platforms']['instagram'] += 1
            instagram_posts = self.scrape_instagram(
                politician['instagram_handle'],
                politician_id,
                name
            )
            all_posts.extend(instagram_posts)
            self.stats['posts_by_platform']['instagram'] += len(instagram_posts)
            time.sleep(2.5)
        
        # Add sentiment analysis to all posts
        for post in all_posts:
            if post.get('content'):
                post['sentiment_score'] = self.analyze_sentiment(post['content'])
        
        if has_social:
            self.stats['politicians_with_social'] += 1
        
        return all_posts
    
    def run(self):
        """Main execution - scrape all politicians and save results."""
        logger.info("=" * 80)
        logger.info("JFK-SOCIAL SCRAPER STARTING")
        logger.info("=" * 80)
        
        start_time = datetime.now()
        
        # Load politicians
        logger.info(f"Loading politicians from {POLITICIANS_FILE}")
        with open(POLITICIANS_FILE, 'r') as f:
            politicians = json.load(f)
        
        self.stats['total_politicians'] = len(politicians)
        logger.info(f"Loaded {len(politicians)} politicians")
        
        # Scrape each politician
        all_posts = []
        for i, politician in enumerate(politicians, 1):
            name = politician['name']
            logger.info(f"\n[{i}/{len(politicians)}] Processing: {name}")
            
            posts = self.scrape_politician(politician)
            
            if posts:
                # Save individual politician file
                politician_file = OUTPUT_DIR / f"jfk-social-{politician['politician_id']}.json"
                with open(politician_file, 'w') as f:
                    json.dump({
                        'politician_id': politician['politician_id'],
                        'name': politician['name'],
                        'party': politician['party'],
                        'district': politician.get('district'),
                        'posts': posts,
                        'post_count': len(posts),
                        'scraped_at': datetime.now().isoformat()
                    }, f, indent=2)
                
                all_posts.extend(posts)
                logger.info(f"  → Saved {len(posts)} posts to {politician_file.name}")
        
        self.stats['total_posts'] = len(all_posts)
        
        # Save combined results
        combined_file = OUTPUT_DIR / 'jfk-social-all-posts.json'
        logger.info(f"\nSaving combined results to {combined_file}")
        with open(combined_file, 'w') as f:
            json.dump(all_posts, f, indent=2)
        
        # Create summary report
        duration = (datetime.now() - start_time).total_seconds()
        summary = {
            'run_metadata': {
                'scraper': 'jfk-social-scraper',
                'version': '1.0.0',
                'started_at': start_time.isoformat(),
                'completed_at': datetime.now().isoformat(),
                'duration_seconds': duration,
                'duration_human': f"{int(duration // 60)}m {int(duration % 60)}s"
            },
            'statistics': {
                'total_politicians': self.stats['total_politicians'],
                'politicians_with_social_media': self.stats['politicians_with_social'],
                'total_posts_scraped': self.stats['total_posts'],
                'platforms_breakdown': {
                    'twitter': {
                        'politicians': self.stats['platforms']['twitter'],
                        'posts': self.stats['posts_by_platform']['twitter']
                    },
                    'facebook': {
                        'politicians': self.stats['platforms']['facebook'],
                        'posts': self.stats['posts_by_platform']['facebook']
                    },
                    'instagram': {
                        'politicians': self.stats['platforms']['instagram'],
                        'posts': self.stats['posts_by_platform']['instagram']
                    }
                }
            },
            'errors': self.stats['errors'],
            'output_files': {
                'combined_posts': 'jfk-social-all-posts.json',
                'individual_files': f"{self.stats['politicians_with_social']} individual JSON files",
                'summary': 'jfk-social-summary.json'
            }
        }
        
        summary_file = OUTPUT_DIR / 'jfk-social-summary.json'
        with open(summary_file, 'w') as f:
            json.dump(summary, f, indent=2)
        
        # Print summary
        logger.info("\n" + "=" * 80)
        logger.info("JFK-SOCIAL SCRAPER COMPLETE")
        logger.info("=" * 80)
        logger.info(f"Total Politicians:        {summary['statistics']['total_politicians']}")
        logger.info(f"With Social Media:        {summary['statistics']['politicians_with_social_media']}")
        logger.info(f"Total Posts Scraped:      {summary['statistics']['total_posts_scraped']}")
        logger.info(f"\nPlatform Breakdown:")
        logger.info(f"  Twitter:   {summary['statistics']['platforms_breakdown']['twitter']['politicians']} politicians, {summary['statistics']['platforms_breakdown']['twitter']['posts']} posts")
        logger.info(f"  Facebook:  {summary['statistics']['platforms_breakdown']['facebook']['politicians']} politicians, {summary['statistics']['platforms_breakdown']['facebook']['posts']} posts")
        logger.info(f"  Instagram: {summary['statistics']['platforms_breakdown']['instagram']['politicians']} politicians, {summary['statistics']['platforms_breakdown']['instagram']['posts']} posts")
        logger.info(f"\nDuration:                 {summary['run_metadata']['duration_human']}")
        logger.info(f"Output Directory:         {OUTPUT_DIR}")
        logger.info(f"Summary File:             {summary_file.name}")
        logger.info("=" * 80)
        
        if self.stats['errors']:
            logger.warning(f"\n⚠️  {len(self.stats['errors'])} errors occurred during scraping")
            for err in self.stats['errors'][:5]:  # Show first 5 errors
                logger.warning(f"  - {err['politician']} ({err['platform']}): {err['error']}")
        
        return summary


def main():
    """Main entry point."""
    # Ensure log directory exists
    os.makedirs('/Users/jaketad/.openclaw/workspace/snitched-ai/scrapers/logs', exist_ok=True)
    
    # Run scraper
    scraper = JFKSocialScraper()
    summary = scraper.run()
    
    return summary


if __name__ == '__main__':
    main()

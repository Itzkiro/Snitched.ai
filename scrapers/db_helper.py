"""
Database helper module for Snitched.ai scrapers.
Handles Supabase connections and data insertion.
"""

import os
import json
import logging
from datetime import datetime
from typing import Dict, List, Any, Optional
from dotenv import load_dotenv

# Optional database dependency
try:
    import psycopg2
    from psycopg2.extras import execute_values, Json
    PSYCOPG2_AVAILABLE = True
except ImportError:
    PSYCOPG2_AVAILABLE = False
    logging.warning("psycopg2 not available. Database operations will be disabled.")

load_dotenv()

class DatabaseHelper:
    """Helper class for Supabase database operations."""
    
    def __init__(self):
        """Initialize database connection from environment variables."""
        self.conn = None
        self.connect()
        
    def connect(self):
        """Establish database connection."""
        if not PSYCOPG2_AVAILABLE:
            logging.warning("psycopg2 not installed. Database operations disabled.")
            return
        
        try:
            # Load from environment variables
            db_url = os.getenv('SUPABASE_DB_URL')
            if not db_url:
                logging.warning("SUPABASE_DB_URL not set. Database operations disabled.")
                return
            
            self.conn = psycopg2.connect(db_url)
            logging.info("Database connection established")
        except Exception as e:
            logging.error(f"Failed to connect to database: {e}")
            self.conn = None
    
    def insert_politician(self, data: Dict[str, Any]) -> Optional[str]:
        """Insert or update politician record."""
        if not self.conn:
            logging.warning("No database connection. Skipping insert.")
            return None
        
        try:
            cursor = self.conn.cursor()
            
            # Check if politician exists
            cursor.execute(
                "SELECT politician_id FROM politicians WHERE name = %s AND office = %s",
                (data['name'], data['office'])
            )
            result = cursor.fetchone()
            
            if result:
                # Update existing
                politician_id = result[0]
                update_fields = ', '.join([f"{k} = %s" for k in data.keys() if k != 'politician_id'])
                values = [v for k, v in data.items() if k != 'politician_id']
                values.append(politician_id)
                
                cursor.execute(
                    f"UPDATE politicians SET {update_fields}, updated_at = NOW() WHERE politician_id = %s",
                    values
                )
                logging.info(f"Updated politician: {data['name']}")
            else:
                # Insert new
                columns = ', '.join(data.keys())
                placeholders = ', '.join(['%s'] * len(data))
                cursor.execute(
                    f"INSERT INTO politicians ({columns}) VALUES ({placeholders}) RETURNING politician_id",
                    list(data.values())
                )
                politician_id = cursor.fetchone()[0]
                logging.info(f"Inserted politician: {data['name']}")
            
            self.conn.commit()
            return politician_id
            
        except Exception as e:
            logging.error(f"Error inserting politician: {e}")
            self.conn.rollback()
            return None
    
    def insert_social_posts(self, posts: List[Dict[str, Any]]) -> int:
        """Batch insert social media posts."""
        if not self.conn or not posts:
            return 0
        
        try:
            cursor = self.conn.cursor()
            
            # Prepare data for batch insert
            columns = ['politician_id', 'platform', 'content', 'post_url', 'posted_at', 
                      'likes_count', 'shares_count', 'comments_count']
            values = [[p.get(c) for c in columns] for p in posts]
            
            execute_values(
                cursor,
                f"INSERT INTO social_posts ({', '.join(columns)}) VALUES %s ON CONFLICT (post_url) DO NOTHING",
                values
            )
            
            inserted = cursor.rowcount
            self.conn.commit()
            logging.info(f"Inserted {inserted} social posts")
            return inserted
            
        except Exception as e:
            logging.error(f"Error inserting social posts: {e}")
            self.conn.rollback()
            return 0
    
    def insert_contributions(self, contributions: List[Dict[str, Any]]) -> int:
        """Batch insert FEC contributions."""
        if not self.conn or not contributions:
            return 0
        
        try:
            cursor = self.conn.cursor()
            
            columns = ['politician_id', 'donor_name', 'donor_type', 'amount', 
                      'date', 'is_aipac', 'fec_id', 'source']
            values = [[c.get(col) for col in columns] for c in contributions]
            
            execute_values(
                cursor,
                f"INSERT INTO contributions ({', '.join(columns)}) VALUES %s ON CONFLICT DO NOTHING",
                values
            )
            
            inserted = cursor.rowcount
            self.conn.commit()
            logging.info(f"Inserted {inserted} contributions")
            return inserted
            
        except Exception as e:
            logging.error(f"Error inserting contributions: {e}")
            self.conn.rollback()
            return 0
    
    def insert_court_cases(self, cases: List[Dict[str, Any]]) -> int:
        """Batch insert court cases."""
        if not self.conn or not cases:
            return 0
        
        try:
            cursor = self.conn.cursor()
            
            columns = ['politician_id', 'case_number', 'court', 'case_type', 
                      'status', 'summary', 'filed_date', 'source_url']
            values = [[c.get(col) for col in columns] for c in cases]
            
            execute_values(
                cursor,
                f"INSERT INTO court_cases ({', '.join(columns)}) VALUES %s ON CONFLICT (case_number) DO NOTHING",
                values
            )
            
            inserted = cursor.rowcount
            self.conn.commit()
            logging.info(f"Inserted {inserted} court cases")
            return inserted
            
        except Exception as e:
            logging.error(f"Error inserting court cases: {e}")
            self.conn.rollback()
            return 0
    
    def log_scraper_run(self, scraper_name: str, status: str, 
                       records_processed: int = 0, error_message: str = None) -> None:
        """Log a scraper run."""
        if not self.conn:
            return
        
        try:
            cursor = self.conn.cursor()
            cursor.execute(
                """INSERT INTO scraper_logs 
                   (scraper_name, status, records_processed, error_message, completed_at)
                   VALUES (%s, %s, %s, %s, NOW())""",
                (scraper_name, status, records_processed, error_message)
            )
            self.conn.commit()
        except Exception as e:
            logging.error(f"Error logging scraper run: {e}")
            self.conn.rollback()
    
    def get_politicians_for_scraping(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get politicians that need social media scraping."""
        if not self.conn:
            return []
        
        try:
            cursor = self.conn.cursor()
            cursor.execute(
                """SELECT politician_id, name, twitter_handle, facebook_page_id, 
                          instagram_handle, tiktok_handle
                   FROM politicians 
                   WHERE is_active = true 
                   AND (last_scraped IS NULL OR last_scraped < NOW() - INTERVAL '1 day')
                   LIMIT %s""",
                (limit,)
            )
            
            columns = [desc[0] for desc in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]
            
        except Exception as e:
            logging.error(f"Error fetching politicians: {e}")
            return []
    
    def close(self):
        """Close database connection."""
        if self.conn:
            self.conn.close()
            logging.info("Database connection closed")

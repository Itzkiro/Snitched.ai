#!/usr/bin/env python3
"""
FEC Campaign Finance Scraper for Snitched.ai
Uses OpenFEC API to pull contribution data

Usage:
    python scrape-fec-data.py --candidate "Ron DeSantis" 
    python scrape-fec-data.py --batch --limit 50
    python scrape-fec-data.py --test
"""

import os
import sys
import json
import logging
import argparse
import requests
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from db_helper import DatabaseHelper

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/Users/jaketad/.openclaw/workspace/snitched-ai/scrapers/logs/fec-data.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# AIPAC-related donor patterns
AIPAC_PATTERNS = [
    'AIPAC',
    'AMERICAN ISRAEL PUBLIC AFFAIRS',
    'UNITED DEMOCRACY PROJECT',
    'DEMOCRATIC MAJORITY FOR ISRAEL',
    'PRO-ISRAEL AMERICA',
    'NORPAC',
    'J STREET PAC'
]


class FECScraper:
    """Scraper for FEC campaign finance data."""
    
    def __init__(self, api_key: str, db: DatabaseHelper):
        self.api_key = api_key
        self.db = db
        self.base_url = 'https://api.open.fec.gov/v1'
        self.session = requests.Session()
        self.session.headers.update({'X-Api-Key': api_key})
        
    def search_candidate(self, name: str) -> Optional[Dict[str, Any]]:
        """Search for a candidate by name."""
        logger.info(f"Searching FEC for candidate: {name}")
        
        try:
            # Split name for better matching
            parts = name.split()
            last_name = parts[-1] if parts else name
            
            response = self.session.get(
                f'{self.base_url}/candidates/search/',
                params={
                    'q': last_name,
                    'per_page': 10,
                    'sort': '-election_years'
                }
            )
            response.raise_for_status()
            
            data = response.json()
            results = data.get('results', [])
            
            if not results:
                logger.warning(f"No FEC candidate found for: {name}")
                return None
            
            # Try to match full name
            for candidate in results:
                candidate_name = candidate.get('name', '').upper()
                if name.upper() in candidate_name or candidate_name in name.upper():
                    logger.info(f"Found FEC candidate: {candidate_name} ({candidate['candidate_id']})")
                    return candidate
            
            # Return first result if no exact match
            return results[0]
            
        except Exception as e:
            logger.error(f"Error searching for candidate {name}: {e}")
            return None
    
    def get_contributions(self, candidate_id: str, cycle: int = 2024) -> List[Dict[str, Any]]:
        """Get contributions for a candidate."""
        logger.info(f"Fetching contributions for {candidate_id} in cycle {cycle}")
        contributions = []
        
        try:
            page = 1
            per_page = 100
            
            while True:
                response = self.session.get(
                    f'{self.base_url}/schedules/schedule_a/',
                    params={
                        'two_year_transaction_period': cycle,
                        'contributor_id': candidate_id,
                        'per_page': per_page,
                        'page': page,
                        'sort': '-contribution_receipt_date'
                    }
                )
                response.raise_for_status()
                
                data = response.json()
                results = data.get('results', [])
                
                if not results:
                    break
                
                for contrib in results:
                    contributions.append({
                        'donor_name': contrib.get('contributor_name', 'Unknown'),
                        'donor_type': self._classify_donor_type(contrib),
                        'amount': float(contrib.get('contribution_receipt_amount', 0)),
                        'date': contrib.get('contribution_receipt_date'),
                        'is_aipac': self._is_aipac_donor(contrib.get('contributor_name', '')),
                        'fec_id': contrib.get('committee_id'),
                        'source': 'FEC'
                    })
                
                # Check if there are more pages
                if len(results) < per_page:
                    break
                
                page += 1
                time.sleep(0.5)  # Rate limiting
                
                # Limit total contributions
                if len(contributions) >= 1000:
                    logger.warning(f"Reached contribution limit for {candidate_id}")
                    break
            
            logger.info(f"Found {len(contributions)} contributions for {candidate_id}")
            
        except Exception as e:
            logger.error(f"Error fetching contributions for {candidate_id}: {e}")
        
        return contributions
    
    def _classify_donor_type(self, contrib: Dict) -> str:
        """Classify donor type from contribution data."""
        entity_type = contrib.get('entity_type', '')
        
        if 'committee' in contrib.get('contributor_name', '').lower():
            if 'super pac' in contrib.get('contributor_name', '').lower():
                return 'SuperPAC'
            return 'PAC'
        
        if entity_type == 'IND':
            return 'Individual'
        elif entity_type == 'ORG':
            return 'Corporate'
        elif entity_type == 'PAC':
            return 'PAC'
        
        return 'Individual'  # Default
    
    def _is_aipac_donor(self, donor_name: str) -> bool:
        """Check if donor is AIPAC-related."""
        donor_upper = donor_name.upper()
        return any(pattern.upper() in donor_upper for pattern in AIPAC_PATTERNS)
    
    def scrape_politician_finances(self, politician: Dict[str, Any], cycles: List[int] = None) -> Dict[str, Any]:
        """Scrape all financial data for a politician."""
        if cycles is None:
            cycles = [2024, 2022]  # Last 2 cycles
        
        politician_id = politician['politician_id']
        name = politician['name']
        
        logger.info(f"Scraping FEC data for {name}")
        
        # Search for candidate in FEC
        fec_candidate = self.search_candidate(name)
        if not fec_candidate:
            logger.warning(f"Could not find FEC data for {name}")
            return {
                'politician_id': politician_id,
                'contributions': [],
                'total_raised': 0,
                'aipac_total': 0
            }
        
        # Get contributions for each cycle
        all_contributions = []
        for cycle in cycles:
            cycle_contribs = self.get_contributions(fec_candidate['candidate_id'], cycle)
            for contrib in cycle_contribs:
                contrib['politician_id'] = politician_id
            all_contributions.extend(cycle_contribs)
            time.sleep(1)
        
        # Calculate totals
        total_raised = sum(c['amount'] for c in all_contributions)
        aipac_total = sum(c['amount'] for c in all_contributions if c['is_aipac'])
        
        # Update politician record with AIPAC funding
        if aipac_total > 0:
            tier = self._calculate_juice_box_tier(aipac_total)
            logger.info(f"{name}: ${aipac_total:,.2f} AIPAC funding ({tier})")
        
        return {
            'politician_id': politician_id,
            'fec_candidate_id': fec_candidate.get('candidate_id'),
            'contributions': all_contributions,
            'total_raised': total_raised,
            'aipac_total': aipac_total,
            'juice_box_tier': self._calculate_juice_box_tier(aipac_total)
        }
    
    def _calculate_juice_box_tier(self, amount: float) -> str:
        """Calculate juice box tier based on AIPAC funding."""
        if amount == 0:
            return 'none'
        elif amount < 10000:
            return 'juicebox'
        elif amount < 100000:
            return 'big_gulp'
        else:
            return 'fire_hydrant'
    
    def run_batch_scrape(self, limit: int = 50) -> Dict[str, Any]:
        """Run batch scrape for multiple politicians."""
        logger.info(f"Starting FEC batch scrape for {limit} politicians")
        start_time = datetime.now()
        
        politicians = self.db.get_politicians_for_scraping(limit)
        logger.info(f"Found {len(politicians)} politicians")
        
        total_contributions = []
        processed = 0
        errors = 0
        
        for politician in politicians:
            try:
                result = self.scrape_politician_finances(politician)
                
                # Insert contributions
                if result['contributions']:
                    self.db.insert_contributions(result['contributions'])
                    total_contributions.extend(result['contributions'])
                
                processed += 1
                logger.info(f"Progress: {processed}/{len(politicians)} - {len(result['contributions'])} contributions")
                
            except Exception as e:
                logger.error(f"Error processing {politician['name']}: {e}")
                errors += 1
        
        # Log results
        duration = (datetime.now() - start_time).total_seconds()
        results = {
            'politicians_processed': processed,
            'total_contributions': len(total_contributions),
            'errors': errors,
            'duration_seconds': duration,
            'timestamp': datetime.now().isoformat()
        }
        
        self.db.log_scraper_run(
            'fec-scraper',
            'success' if errors == 0 else 'partial',
            len(total_contributions),
            f"{errors} errors" if errors > 0 else None
        )
        
        logger.info(f"Batch scrape complete: {results}")
        return results


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description='FEC Campaign Finance Scraper')
    parser.add_argument('--candidate', help='Candidate name to scrape')
    parser.add_argument('--batch', action='store_true', help='Run batch scrape')
    parser.add_argument('--limit', type=int, default=50, help='Batch limit')
    parser.add_argument('--cycles', default='2024,2022', help='Election cycles (comma-separated)')
    parser.add_argument('--test', action='store_true', help='Run test mode')
    parser.add_argument('--output', help='Output JSON file path')
    
    args = parser.parse_args()
    
    # Get API key from environment
    api_key = os.getenv('FEC_API_KEY')
    if not api_key:
        logger.error("FEC_API_KEY environment variable not set")
        logger.info("Get your API key at: https://api.open.fec.gov/developers/")
        sys.exit(1)
    
    # Ensure log directory exists
    os.makedirs('/Users/jaketad/.openclaw/workspace/snitched-ai/scrapers/logs', exist_ok=True)
    
    # Initialize
    db = DatabaseHelper()
    scraper = FECScraper(api_key, db)
    
    cycles = [int(c) for c in args.cycles.split(',')]
    
    try:
        if args.test:
            logger.info("Running test mode")
            # Test with a known politician
            test_candidate = scraper.search_candidate("Ron DeSantis")
            if test_candidate:
                print(json.dumps(test_candidate, indent=2))
            else:
                print("No results found in test mode")
        
        elif args.batch:
            results = scraper.run_batch_scrape(args.limit)
            print(json.dumps(results, indent=2, default=str))
            
            if args.output:
                with open(args.output, 'w') as f:
                    json.dump(results, f, indent=2, default=str)
        
        elif args.candidate:
            sample_politician = {
                'politician_id': 'manual-search',
                'name': args.candidate
            }
            result = scraper.scrape_politician_finances(sample_politician, cycles)
            print(json.dumps(result, indent=2, default=str))
        
        else:
            logger.error("Please specify --batch, --candidate, or --test")
            sys.exit(1)
    
    finally:
        db.close()


if __name__ == '__main__':
    main()

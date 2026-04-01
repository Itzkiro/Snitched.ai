#!/usr/bin/env python3
"""
JFK-FEC Scraper for Snitched.ai
Processes all 188 politicians from JFK-Intel Phase 1
Fetches REAL FEC data for 30 federal officials with fec_candidate_id
"""

import os
import sys
import json
import logging
import requests
from datetime import datetime
from typing import List, Dict, Any, Optional
import time
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logs', 'jfk-fec-data.log')),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# AIPAC-related donor patterns (from original scraper)
AIPAC_PATTERNS = [
    'AIPAC',
    'AMERICAN ISRAEL PUBLIC AFFAIRS',
    'UNITED DEMOCRACY PROJECT',
    'DEMOCRATIC MAJORITY FOR ISRAEL',
    'PRO-ISRAEL AMERICA',
    'NORPAC',
    'J STREET PAC'
]


class JFKFECScraper:
    """Scraper for JFK-Intel Phase 1 FEC data."""
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = 'https://api.open.fec.gov/v1'
        self.session = requests.Session()
        self.session.headers.update({'X-Api-Key': api_key})
        
    def get_candidate_totals(self, candidate_id: str, cycles: List[int] = None) -> Dict[str, Any]:
        """Get total financial summary for a candidate."""
        if cycles is None:
            cycles = [2024, 2022, 2020]
        
        logger.info(f"Fetching totals for {candidate_id}")
        
        total_raised = 0
        total_disbursed = 0
        
        try:
            for cycle in cycles:
                response = self.session.get(
                    f'{self.base_url}/candidate/{candidate_id}/totals/',
                    params={
                        'cycle': cycle,
                        'per_page': 100
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    results = data.get('results', [])
                    
                    for result in results:
                        total_raised += float(result.get('receipts', 0) or 0)
                        total_disbursed += float(result.get('disbursements', 0) or 0)
                
                time.sleep(0.3)  # Rate limiting
        
        except Exception as e:
            logger.error(f"Error fetching totals for {candidate_id}: {e}")
        
        return {
            'total_raised': total_raised,
            'total_disbursed': total_disbursed
        }
    
    def get_candidate_committees(self, candidate_id: str, cycle: int = 2024) -> List[str]:
        """Get committee IDs for a candidate."""
        try:
            response = self.session.get(
                f'{self.base_url}/candidate/{candidate_id}/committees/',
                params={
                    'cycle': cycle,
                    'per_page': 20
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                results = data.get('results', [])
                committee_ids = [r.get('committee_id') for r in results if r.get('committee_id')]
                logger.info(f"Found {len(committee_ids)} committees for {candidate_id}")
                return committee_ids
            
        except Exception as e:
            logger.error(f"Error fetching committees for {candidate_id}: {e}")
        
        return []
    
    def get_contributions(self, candidate_id: str, cycle: int = 2024, limit: int = 500) -> List[Dict[str, Any]]:
        """Get contributions for a candidate."""
        logger.info(f"Fetching contributions for {candidate_id} in cycle {cycle}")
        contributions = []
        
        # First get candidate's committees
        committee_ids = self.get_candidate_committees(candidate_id, cycle)
        
        if not committee_ids:
            logger.info(f"No committees found for {candidate_id}")
            return []
        
        try:
            # Fetch contributions for each committee
            for committee_id in committee_ids[:3]:  # Limit to first 3 committees
                page = 1
                per_page = 100
                
                while len(contributions) < limit:
                    response = self.session.get(
                        f'{self.base_url}/schedules/schedule_a/',
                        params={
                            'two_year_transaction_period': cycle,
                            'committee_id': committee_id,
                            'per_page': per_page,
                            'page': page,
                            'sort': '-contribution_receipt_date'
                        }
                    )
                    
                    if response.status_code != 200:
                        logger.warning(f"Failed to fetch page {page} for committee {committee_id}: {response.status_code}")
                        break
                    
                    data = response.json()
                    results = data.get('results', [])
                    
                    if not results:
                        break
                    
                    for contrib in results:
                        contributions.append({
                            'donor_name': contrib.get('contributor_name', 'Unknown'),
                            'donor_type': self._classify_donor_type(contrib),
                            'amount': float(contrib.get('contribution_receipt_amount', 0) or 0),
                            'date': contrib.get('contribution_receipt_date'),
                            'is_aipac': self._is_aipac_donor(contrib.get('contributor_name', '')),
                            'committee_id': contrib.get('committee_id'),
                            'entity_type': contrib.get('entity_type', '')
                        })
                    
                    if len(results) < per_page:
                        break
                    
                    page += 1
                    time.sleep(0.3)
                
                if len(contributions) >= limit:
                    break
            
            logger.info(f"Found {len(contributions)} contributions for {candidate_id}")
            
        except Exception as e:
            logger.error(f"Error fetching contributions for {candidate_id}: {e}")
        
        return contributions[:limit]
    
    def _classify_donor_type(self, contrib: Dict) -> str:
        """Classify donor type from contribution data."""
        entity_type = contrib.get('entity_type', '')
        contributor_name = contrib.get('contributor_name', '').lower()
        
        # Check for PAC/Committee in name
        if 'committee' in contributor_name or 'pac' in contributor_name:
            if 'super pac' in contributor_name:
                return 'SuperPAC'
            return 'PAC'
        
        # Use entity type
        if entity_type == 'IND':
            return 'Individual'
        elif entity_type == 'ORG':
            return 'Corporate'
        elif entity_type == 'PAC' or entity_type == 'COM':
            return 'PAC'
        
        return 'Individual'  # Default
    
    def _is_aipac_donor(self, donor_name: str) -> bool:
        """Check if donor is AIPAC-related."""
        donor_upper = donor_name.upper()
        return any(pattern.upper() in donor_upper for pattern in AIPAC_PATTERNS)
    
    def scrape_politician(self, politician: Dict[str, Any]) -> Dict[str, Any]:
        """Scrape FEC data for a single politician."""
        politician_id = politician['politician_id']
        name = politician['name']
        fec_id = politician.get('source_ids', {}).get('fec_candidate_id')
        
        result = {
            'politician_id': politician_id,
            'name': name,
            'office': politician.get('office'),
            'office_level': politician.get('office_level'),
            'party': politician.get('party'),
            'fec_candidate_id': fec_id,
            'has_fec_data': False,
            'total_raised': 0.0,
            'aipac_total': 0.0,
            'aipac_count': 0,
            'top_donors': [],
            'breakdown': {
                'aipac': 0.0,
                'other_pacs': 0.0,
                'individuals': 0.0,
                'corporate': 0.0
            },
            'contributions': [],
            'error': None
        }
        
        # Skip if no FEC ID (state/local officials)
        if not fec_id:
            logger.info(f"Skipping {name} - no FEC ID (state/local official)")
            return result
        
        try:
            logger.info(f"Processing {name} ({fec_id})")
            
            # Get financial totals
            totals = self.get_candidate_totals(fec_id)
            result['total_raised'] = totals['total_raised']
            
            # Get contributions (focus on 2024 cycle)
            contributions = self.get_contributions(fec_id, cycle=2024, limit=500)
            
            if contributions:
                result['has_fec_data'] = True
                result['contributions'] = contributions
                
                # Calculate AIPAC total
                aipac_contribs = [c for c in contributions if c['is_aipac']]
                result['aipac_total'] = sum(c['amount'] for c in aipac_contribs)
                result['aipac_count'] = len(aipac_contribs)
                
                # Calculate breakdown
                for contrib in contributions:
                    if contrib['is_aipac']:
                        result['breakdown']['aipac'] += contrib['amount']
                    elif contrib['donor_type'] in ['PAC', 'SuperPAC']:
                        result['breakdown']['other_pacs'] += contrib['amount']
                    elif contrib['donor_type'] == 'Individual':
                        result['breakdown']['individuals'] += contrib['amount']
                    elif contrib['donor_type'] == 'Corporate':
                        result['breakdown']['corporate'] += contrib['amount']
                
                # Get top 3 donors
                donor_totals = {}
                for contrib in contributions:
                    donor = contrib['donor_name']
                    donor_totals[donor] = donor_totals.get(donor, 0) + contrib['amount']
                
                top_3 = sorted(donor_totals.items(), key=lambda x: x[1], reverse=True)[:3]
                result['top_donors'] = [
                    {'name': name, 'total': amount}
                    for name, amount in top_3
                ]
                
                logger.info(f"✓ {name}: ${result['total_raised']:,.2f} raised, ${result['aipac_total']:,.2f} AIPAC ({result['aipac_count']} contributions)")
            else:
                logger.info(f"✓ {name}: Has FEC ID but no contributions found in 2024")
            
        except Exception as e:
            logger.error(f"Error processing {name}: {e}")
            result['error'] = str(e)
        
        return result
    
    def run_full_scrape(self, politicians: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Run scrape for all politicians."""
        logger.info(f"Starting JFK-FEC scrape for {len(politicians)} politicians")
        start_time = datetime.now()
        
        results = []
        processed = 0
        with_fec_data = 0
        with_aipac = 0
        errors = 0
        
        for politician in politicians:
            result = self.scrape_politician(politician)
            results.append(result)
            
            processed += 1
            if result['has_fec_data']:
                with_fec_data += 1
            if result['aipac_total'] > 0:
                with_aipac += 1
            if result['error']:
                errors += 1
            
            # Progress update every 10
            if processed % 10 == 0:
                logger.info(f"Progress: {processed}/{len(politicians)} - {with_fec_data} with FEC data, {with_aipac} with AIPAC funding")
            
            # Rate limiting
            time.sleep(0.5)
        
        duration = (datetime.now() - start_time).total_seconds()
        
        summary = {
            'total_politicians': len(politicians),
            'processed': processed,
            'with_fec_data': with_fec_data,
            'with_aipac_funding': with_aipac,
            'errors': errors,
            'total_aipac_funding': sum(r['aipac_total'] for r in results),
            'total_raised_all': sum(r['total_raised'] for r in results),
            'duration_seconds': duration,
            'timestamp': datetime.now().isoformat(),
            'politicians': results
        }
        
        logger.info(f"\n{'='*60}")
        logger.info(f"JFK-FEC Scrape Complete!")
        logger.info(f"Total Politicians: {len(politicians)}")
        logger.info(f"With FEC Data: {with_fec_data}")
        logger.info(f"With AIPAC Funding: {with_aipac}")
        logger.info(f"Total AIPAC Funding: ${summary['total_aipac_funding']:,.2f}")
        logger.info(f"Errors: {errors}")
        logger.info(f"Duration: {duration:.1f}s")
        logger.info(f"{'='*60}\n")
        
        return summary


def main():
    """Main entry point."""
    # Get API key
    api_key = os.environ.get('FEC_API_KEY')
    if not api_key:
        print("Missing required environment variable: FEC_API_KEY")
        sys.exit(1)
    
    # Ensure directories exist
    SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
    PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
    os.makedirs(os.path.join(SCRIPT_DIR, 'logs'), exist_ok=True)
    os.makedirs(os.path.join(PROJECT_DIR, 'data-ingestion', 'jfk-fec-results'), exist_ok=True)

    # Load politicians data
    politicians_file = os.path.join(PROJECT_DIR, 'data-ingestion', 'phase1', 'processed', 'florida_politicians.json')
    logger.info(f"Loading politicians from {politicians_file}")
    
    with open(politicians_file, 'r') as f:
        politicians = json.load(f)
    
    logger.info(f"Loaded {len(politicians)} politicians")
    
    # Count by type
    federal = [p for p in politicians if p.get('office_level') == 'federal']
    state = [p for p in politicians if p.get('office_level') == 'state']
    local = [p for p in politicians if p.get('office_level') == 'local']
    
    logger.info(f"Federal: {len(federal)}, State: {len(state)}, Local: {len(local)}")
    
    # Initialize scraper
    scraper = JFKFECScraper(api_key)
    
    # Run scrape
    summary = scraper.run_full_scrape(politicians)
    
    # Save detailed results
    output_file = os.path.join(PROJECT_DIR, 'data-ingestion', 'jfk-fec-results', 'jfk-fec-full-results.json')
    logger.info(f"Saving results to {output_file}")
    with open(output_file, 'w') as f:
        json.dump(summary, f, indent=2, default=str)
    
    # Save summary only
    summary_file = os.path.join(PROJECT_DIR, 'data-ingestion', 'jfk-fec-results', 'jfk-fec-summary.json')
    summary_only = {k: v for k, v in summary.items() if k != 'politicians'}
    
    # Add top AIPAC recipients
    top_aipac = sorted(
        [p for p in summary['politicians'] if p['aipac_total'] > 0],
        key=lambda x: x['aipac_total'],
        reverse=True
    )[:10]
    
    summary_only['top_10_aipac_recipients'] = [
        {
            'name': p['name'],
            'office': p['office'],
            'party': p['party'],
            'aipac_total': p['aipac_total'],
            'aipac_count': p['aipac_count']
        }
        for p in top_aipac
    ]
    
    with open(summary_file, 'w') as f:
        json.dump(summary_only, f, indent=2, default=str)
    
    logger.info(f"Summary saved to {summary_file}")
    logger.info("JFK-FEC scraper complete!")


if __name__ == '__main__':
    main()

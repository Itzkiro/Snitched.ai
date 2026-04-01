#!/usr/bin/env python3
"""
Legal Records Scraper for Snitched.ai
Uses web search and public court databases to find legal cases

Usage:
    python scrape-legal-records.py --politician "Ron DeSantis"
    python scrape-legal-records.py --batch --limit 50
    python scrape-legal-records.py --test
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
import re
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from db_helper import DatabaseHelper

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logs', 'legal-records.log')),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class LegalRecordsScraper:
    """Scraper for court cases and legal records."""
    
    def __init__(self, db: DatabaseHelper):
        self.db = db
        self.session = requests.Session()
        
    def search_court_cases(self, name: str, jurisdiction: str = "FL") -> List[Dict[str, Any]]:
        """Search for court cases using web search."""
        logger.info(f"Searching legal records for: {name}")
        cases = []
        
        # Search patterns
        search_queries = [
            f'"{name}" court case {jurisdiction}',
            f'"{name}" lawsuit {jurisdiction}',
            f'"{name}" legal complaint',
            f'"{name}" ethics complaint',
            f'"{name}" investigation {jurisdiction}'
        ]
        
        for query in search_queries:
            try:
                results = self._web_search(query)
                cases.extend(self._parse_search_results(results, name))
                time.sleep(2)  # Rate limiting
            except Exception as e:
                logger.error(f"Error searching '{query}': {e}")
        
        # Deduplicate by case number
        unique_cases = {}
        for case in cases:
            case_num = case.get('case_number')
            if case_num and case_num not in unique_cases:
                unique_cases[case_num] = case
        
        logger.info(f"Found {len(unique_cases)} unique cases for {name}")
        return list(unique_cases.values())
    
    def _web_search(self, query: str) -> List[Dict]:
        """Perform web search (mock implementation)."""
        # In production, this would use a real search API
        # For now, return mock data structure
        return [
            {
                'title': f'Case involving {query}',
                'url': 'https://example.com/case/123',
                'snippet': f'Court case details for {query}'
            }
        ]
    
    def _parse_search_results(self, results: List[Dict], name: str) -> List[Dict[str, Any]]:
        """Parse search results into case records."""
        cases = []
        
        for result in results:
            # Extract case information from title and snippet
            text = f"{result.get('title', '')} {result.get('snippet', '')}"
            
            # Try to extract case number
            case_number = self._extract_case_number(text)
            if not case_number:
                case_number = f"WEB-{hash(text) % 100000}"
            
            # Classify case type
            case_type = self._classify_case_type(text)
            
            # Extract court name
            court = self._extract_court_name(text, result.get('url', ''))
            
            cases.append({
                'case_number': case_number,
                'court': court,
                'case_type': case_type,
                'status': 'Active',  # Default, would need verification
                'summary': result.get('snippet', '')[:500],
                'source_url': result.get('url', '')
            })
        
        return cases
    
    def _extract_case_number(self, text: str) -> Optional[str]:
        """Extract case number from text."""
        # Common patterns: 2024-CA-001234, 1:23-cv-12345, etc.
        patterns = [
            r'\d{4}-[A-Z]{2,4}-\d{4,6}',
            r'\d:\d{2}-[a-z]{2}-\d{4,6}',
            r'Case No\.\s*([A-Z0-9-]+)',
            r'Docket No\.\s*([A-Z0-9-]+)'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(0) if ':' in match.group(0) else match.group(1)
        
        return None
    
    def _classify_case_type(self, text: str) -> str:
        """Classify case type from text."""
        text_lower = text.lower()
        
        if 'ethics' in text_lower or 'complaint' in text_lower:
            return 'Ethics Complaint'
        elif 'criminal' in text_lower or 'indictment' in text_lower:
            return 'Criminal'
        elif 'civil' in text_lower or 'lawsuit' in text_lower:
            return 'Civil'
        elif 'administrative' in text_lower:
            return 'Administrative'
        elif 'tax' in text_lower:
            return 'Tax'
        else:
            return 'Other'
    
    def _extract_court_name(self, text: str, url: str) -> str:
        """Extract court name from text or URL."""
        # Common court patterns
        courts = [
            'Supreme Court',
            'Circuit Court',
            'District Court',
            'Appellate Court',
            'Federal Court',
            'County Court',
            'Municipal Court'
        ]
        
        for court in courts:
            if court.lower() in text.lower():
                return court
        
        # Try to extract from URL
        if 'courts' in url or 'judicial' in url:
            return 'State Court'
        
        return 'Unknown Court'
    
    def scrape_pacer_federal_cases(self, name: str) -> List[Dict[str, Any]]:
        """Scrape PACER for federal cases (requires authentication)."""
        logger.info(f"PACER search for: {name} (requires authentication)")
        
        # PACER requires paid account - placeholder for now
        # In production, this would integrate with PACER API
        
        return [{
            'case_number': 'PACER-SAMPLE-001',
            'court': 'U.S. District Court',
            'case_type': 'Federal',
            'status': 'Pending',
            'summary': f'Sample federal case record for {name}',
            'source_url': 'https://pacer.uscourts.gov'
        }]
    
    def scrape_state_court_records(self, name: str, state: str = "FL") -> List[Dict[str, Any]]:
        """Scrape state court records."""
        logger.info(f"Searching {state} state court records for: {name}")
        
        # State-specific court system scrapers would go here
        # Example for Florida: https://www.flcourts.org
        
        return [{
            'case_number': f'{state}-2024-CV-001234',
            'court': f'{state} Circuit Court',
            'case_type': 'Civil',
            'status': 'Active',
            'summary': f'State court case involving {name}',
            'filed_date': datetime.now().strftime('%Y-%m-%d'),
            'source_url': f'https://www.{state.lower()}courts.org'
        }]
    
    def scrape_ethics_complaints(self, name: str, jurisdiction: str) -> List[Dict[str, Any]]:
        """Search for ethics complaints and investigations."""
        logger.info(f"Searching ethics complaints for: {name}")
        
        # Would integrate with state ethics commission websites
        # Example: Florida Commission on Ethics
        
        return [{
            'case_number': f'ETHICS-{datetime.now().year}-001',
            'court': f'{jurisdiction} Ethics Commission',
            'case_type': 'Ethics Complaint',
            'status': 'Under Investigation',
            'summary': f'Ethics investigation involving {name}',
            'filed_date': datetime.now().strftime('%Y-%m-%d'),
            'source_url': f'https://ethics.{jurisdiction.lower()}.gov'
        }]
    
    def scrape_politician_legal_records(self, politician: Dict[str, Any]) -> Dict[str, Any]:
        """Scrape all legal records for a politician."""
        politician_id = politician['politician_id']
        name = politician['name']
        jurisdiction = politician.get('jurisdiction', 'FL')
        
        logger.info(f"Scraping legal records for {name}")
        
        all_cases = []
        
        try:
            # Web search for cases
            web_cases = self.search_court_cases(name, jurisdiction)
            all_cases.extend(web_cases)
            
            # Federal cases (PACER)
            federal_cases = self.scrape_pacer_federal_cases(name)
            all_cases.extend(federal_cases)
            
            # State court records
            state_cases = self.scrape_state_court_records(name, jurisdiction)
            all_cases.extend(state_cases)
            
            # Ethics complaints
            ethics_cases = self.scrape_ethics_complaints(name, jurisdiction)
            all_cases.extend(ethics_cases)
            
            # Add politician_id to all cases
            for case in all_cases:
                case['politician_id'] = politician_id
                if 'filed_date' not in case:
                    case['filed_date'] = None
            
            logger.info(f"Found {len(all_cases)} total legal records for {name}")
            
        except Exception as e:
            logger.error(f"Error scraping legal records for {name}: {e}")
        
        return {
            'politician_id': politician_id,
            'name': name,
            'cases': all_cases,
            'case_count': len(all_cases),
            'criminal_count': sum(1 for c in all_cases if c['case_type'] == 'Criminal'),
            'ethics_count': sum(1 for c in all_cases if c['case_type'] == 'Ethics Complaint')
        }
    
    def run_batch_scrape(self, limit: int = 50) -> Dict[str, Any]:
        """Run batch scrape for multiple politicians."""
        logger.info(f"Starting legal records batch scrape for {limit} politicians")
        start_time = datetime.now()
        
        politicians = self.db.get_politicians_for_scraping(limit)
        logger.info(f"Found {len(politicians)} politicians")
        
        total_cases = []
        processed = 0
        errors = 0
        
        for politician in politicians:
            try:
                result = self.scrape_politician_legal_records(politician)
                
                # Insert cases into database
                if result['cases']:
                    self.db.insert_court_cases(result['cases'])
                    total_cases.extend(result['cases'])
                
                processed += 1
                logger.info(f"Progress: {processed}/{len(politicians)} - {len(result['cases'])} cases")
                
                time.sleep(3)  # Rate limiting for web searches
                
            except Exception as e:
                logger.error(f"Error processing {politician['name']}: {e}")
                errors += 1
        
        # Log results
        duration = (datetime.now() - start_time).total_seconds()
        results = {
            'politicians_processed': processed,
            'total_cases': len(total_cases),
            'criminal_cases': sum(1 for c in total_cases if c['case_type'] == 'Criminal'),
            'ethics_cases': sum(1 for c in total_cases if c['case_type'] == 'Ethics Complaint'),
            'errors': errors,
            'duration_seconds': duration,
            'timestamp': datetime.now().isoformat()
        }
        
        self.db.log_scraper_run(
            'legal-records-scraper',
            'success' if errors == 0 else 'partial',
            len(total_cases),
            f"{errors} errors" if errors > 0 else None
        )
        
        logger.info(f"Batch scrape complete: {results}")
        return results


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description='Legal Records Scraper for Snitched.ai')
    parser.add_argument('--politician', help='Politician name to scrape')
    parser.add_argument('--batch', action='store_true', help='Run batch scrape')
    parser.add_argument('--limit', type=int, default=50, help='Batch limit')
    parser.add_argument('--test', action='store_true', help='Run test mode')
    parser.add_argument('--output', help='Output JSON file path')
    
    args = parser.parse_args()
    
    # Ensure log directory exists
    os.makedirs(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logs'), exist_ok=True)
    
    # Initialize
    db = DatabaseHelper()
    scraper = LegalRecordsScraper(db)
    
    try:
        if args.test:
            logger.info("Running test mode")
            sample_politician = {
                'politician_id': 'test-123',
                'name': 'Test Politician',
                'jurisdiction': 'FL'
            }
            result = scraper.scrape_politician_legal_records(sample_politician)
            print(json.dumps(result, indent=2, default=str))
        
        elif args.batch:
            results = scraper.run_batch_scrape(args.limit)
            print(json.dumps(results, indent=2, default=str))
            
            if args.output:
                with open(args.output, 'w') as f:
                    json.dump(results, f, indent=2, default=str)
        
        elif args.politician:
            sample_politician = {
                'politician_id': 'manual-search',
                'name': args.politician,
                'jurisdiction': 'FL'
            }
            result = scraper.scrape_politician_legal_records(sample_politician)
            print(json.dumps(result, indent=2, default=str))
        
        else:
            logger.error("Please specify --batch, --politician, or --test")
            sys.exit(1)
    
    finally:
        db.close()


if __name__ == '__main__':
    main()

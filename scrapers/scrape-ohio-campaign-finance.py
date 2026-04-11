#!/usr/bin/env python3.11
"""
Ohio Secretary of State — Campaign Finance Scraper
===================================================

Scrapes campaign finance data for Ohio politicians from the Ohio SOS
ORDS/APEX campaign finance disclosure system.

Uses Scrapling's StealthyFetcher to bypass bot protection.

Data flow:
  1. Search for each OH politician by name on the Ohio SOS site
  2. Extract committee info, total receipts, top contributors
  3. Output JSON that can be imported into Supabase

Usage:
  python3.11 scrapers/scrape-ohio-campaign-finance.py
  python3.11 scrapers/scrape-ohio-campaign-finance.py --limit 50
  python3.11 scrapers/scrape-ohio-campaign-finance.py --dry-run
  python3.11 scrapers/scrape-ohio-campaign-finance.py --offset 0 --batch-size 200
"""

import json
import os
import sys
import time
import argparse
import re
from pathlib import Path
from datetime import datetime

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

try:
    from scrapling import Fetcher, StealthyFetcher
except ImportError:
    print("ERROR: scrapling not installed. Run: python3.11 -m pip install 'scrapling[all]'")
    sys.exit(1)

try:
    from supabase import create_client
except ImportError:
    # Fallback: use requests to talk to Supabase REST API
    create_client = None

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SUPABASE_URL = os.environ.get("SUPABASE_URL", os.environ.get("NEXT_PUBLIC_SUPABASE_URL", ""))
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
DELAY_BETWEEN_REQUESTS = 2  # seconds between searches to be respectful

# Ohio SOS Campaign Finance URLs
OHIO_SOS_SEARCH = "https://www6.sos.state.oh.us/ords/f?p=CFDISCLOSURE:2:::NO:2::"
OHIO_SOS_BASE = "https://www6.sos.state.oh.us"

# ---------------------------------------------------------------------------
# Supabase helpers (REST-based, no SDK needed)
# ---------------------------------------------------------------------------

import urllib.request
import urllib.parse

def supabase_select(table: str, params: dict) -> list:
    """Query Supabase via REST API."""
    query = "&".join(f"{k}={urllib.parse.quote(str(v))}" for k, v in params.items())
    url = f"{SUPABASE_URL}/rest/v1/{table}?{query}"
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"  Supabase query error: {e}")
        return []


def supabase_update(table: str, match_col: str, match_val: str, data: dict):
    """Update Supabase via REST API."""
    url = f"{SUPABASE_URL}/rest/v1/{table}?{match_col}=eq.{urllib.parse.quote(match_val)}"
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, method="PATCH", headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    })
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status
    except Exception as e:
        print(f"  Supabase update error: {e}")
        return None


# ---------------------------------------------------------------------------
# Scraper
# ---------------------------------------------------------------------------

def extract_money(text: str) -> float:
    """Extract dollar amount from text like '$1,234.56' or '1234'."""
    if not text:
        return 0.0
    cleaned = re.sub(r'[^0-9.]', '', text.replace(',', ''))
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def scrape_candidate_finance(name: str, fetcher) -> dict | None:
    """
    Search Ohio SOS campaign finance for a candidate by name.
    Returns dict with: total_receipts, total_expenditures, contributors, committee_name
    """
    try:
        # The Ohio SOS APEX app uses a search form. We'll search via URL params.
        # The general transaction search is at:
        # https://www6.sos.state.oh.us/ords/f?p=119:1:0:
        search_url = f"https://www6.sos.state.oh.us/ords/f?p=119:1:0::NO::P1_NAME:{urllib.parse.quote(name)}"

        page = fetcher.get(search_url)
        if not page or page.status != 200:
            # Try alternate URL pattern
            search_url = f"https://www6.sos.state.oh.us/ords/f?p=CFDISCLOSURE:2:::NO:2:P2_CAND_NAME:{urllib.parse.quote(name)}"
            page = fetcher.get(search_url)
            if not page or page.status != 200:
                return None

        # Parse results
        body = page.text if hasattr(page, 'text') else str(page)

        # Look for table rows with financial data
        result = {
            "name": name,
            "committees": [],
            "total_receipts": 0,
            "total_expenditures": 0,
            "contributors": [],
            "scraped_at": datetime.now().isoformat(),
        }

        # Try to find money amounts in the page
        money_pattern = r'\$[\d,]+(?:\.\d{2})?'
        amounts = re.findall(money_pattern, body)
        if amounts:
            # Usually first large amount is total receipts
            parsed_amounts = sorted([extract_money(a) for a in amounts], reverse=True)
            if parsed_amounts:
                result["total_receipts"] = parsed_amounts[0]
                if len(parsed_amounts) > 1:
                    result["total_expenditures"] = parsed_amounts[1]

        # Try to find committee names
        committee_pattern = r'(?:Committee|PAC|Fund)\s+(?:for|of|to)?\s*[A-Z][a-zA-Z\s]+'
        committees = re.findall(committee_pattern, body)
        result["committees"] = list(set(committees[:5]))

        # Try to find contributor names near dollar amounts
        contrib_pattern = r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*\$?([\d,]+(?:\.\d{2})?)'
        contribs = re.findall(contrib_pattern, body)
        for cname, amount in contribs[:10]:
            amt = extract_money(amount)
            if amt > 0:
                result["contributors"].append({"name": cname, "amount": amt})

        return result if result["total_receipts"] > 0 or len(result["contributors"]) > 0 else None

    except Exception as e:
        print(f"  Scrape error for {name}: {e}")
        return None


def scrape_via_followthemoney(name: str, state: str = "OH") -> dict | None:
    """
    Fallback: scrape FollowTheMoney.org for Ohio candidate data.
    This site has better structured data than the Ohio SOS APEX app.
    """
    try:
        fetcher = Fetcher()
        search_name = urllib.parse.quote(name)
        url = f"https://www.followthemoney.org/show-me?s={state}&c-t-eid=0&d-cci=0&c-t-id=0#[{{1|gro=c-t-id,d-id&fiEID={search_name}}}]"

        # Simpler approach: use their entity search
        url = f"https://www.followthemoney.org/entity-details?eid={search_name}"
        page = fetcher.get(url)
        if not page or page.status != 200:
            return None

        body = page.text if hasattr(page, 'text') else str(page)
        money_pattern = r'\$[\d,]+(?:\.\d{2})?'
        amounts = re.findall(money_pattern, body)

        if amounts:
            parsed = sorted([extract_money(a) for a in amounts], reverse=True)
            return {
                "name": name,
                "total_receipts": parsed[0] if parsed else 0,
                "source": "followthemoney",
                "scraped_at": datetime.now().isoformat(),
            }
        return None
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Scrape Ohio campaign finance data")
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--batch-size", type=int, default=200)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--output", type=str, default=None, help="Output JSON file path")
    args = parser.parse_args()

    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")

    # Re-read env after dotenv
    global SUPABASE_URL, SUPABASE_KEY
    SUPABASE_URL = os.environ.get("SUPABASE_URL", os.environ.get("NEXT_PUBLIC_SUPABASE_URL", ""))
    SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
        sys.exit(1)

    print("=" * 60)
    print("  Ohio Campaign Finance Scraper (Scrapling)")
    print("=" * 60)
    print(f"  Offset: {args.offset}, Batch: {args.batch_size}")
    if args.dry_run:
        print("  [DRY RUN]")
    print()

    # Fetch OH politicians from Supabase
    batch_size = args.limit or args.batch_size
    params = {
        "select": "bioguide_id,name,office,office_level,total_funds,top5_donors,contribution_breakdown",
        "bioguide_id": f"like.oh-*",
        "order": "bioguide_id",
        "offset": str(args.offset),
        "limit": str(batch_size),
    }
    politicians = supabase_select("politicians", params)
    print(f"  Fetched {len(politicians)} OH politicians\n")

    if not politicians:
        print("  No politicians found")
        return

    # Initialize fetcher
    fetcher = Fetcher(auto_match=False)

    results = []
    enriched = 0
    skipped = 0
    errors = 0

    for i, pol in enumerate(politicians):
        name = pol["name"]
        progress = f"[{i+1}/{len(politicians)}]"

        # Skip if already has good financial data
        existing_funds = float(pol.get("total_funds") or 0)
        existing_donors = pol.get("top5_donors") or []
        if existing_funds > 0 and len(existing_donors) > 0 and pol.get("contribution_breakdown"):
            skipped += 1
            continue

        try:
            # Try Ohio SOS first
            data = scrape_candidate_finance(name, fetcher)

            # Fallback to FollowTheMoney
            if not data:
                data = scrape_via_followthemoney(name)

            if not data or data.get("total_receipts", 0) == 0:
                skipped += 1
                continue

            results.append({**data, "bioguide_id": pol["bioguide_id"]})

            # Update Supabase if not dry run
            if not args.dry_run:
                update = {"updated_at": datetime.now().isoformat()}

                if data["total_receipts"] > existing_funds:
                    update["total_funds"] = data["total_receipts"]

                contributors = data.get("contributors", [])
                if contributors and len(contributors) > len(existing_donors):
                    update["top5_donors"] = [
                        {"name": c["name"], "amount": c["amount"], "type": "Individual"}
                        for c in contributors[:5]
                    ]

                supabase_update("politicians", "bioguide_id", pol["bioguide_id"], update)

            enriched += 1
            amt = data["total_receipts"]
            amt_str = f"${amt/1e6:.1f}M" if amt >= 1e6 else f"${amt/1e3:.0f}K"
            print(f"{progress} ✓ {name} — {amt_str} receipts, {len(data.get('contributors', []))} donors")

        except Exception as e:
            errors += 1
            print(f"{progress} ✗ {name} — {e}")

        # Rate limit
        time.sleep(DELAY_BETWEEN_REQUESTS)

    # Save results
    if args.output and results:
        output_path = Path(args.output)
        output_path.write_text(json.dumps(results, indent=2))
        print(f"\n  Saved {len(results)} results to {args.output}")

    print(f"\n{'=' * 60}")
    print(f"  SUMMARY")
    print(f"{'=' * 60}")
    print(f"  Processed: {len(politicians)}")
    print(f"  Enriched:  {enriched}")
    print(f"  Skipped:   {skipped}")
    print(f"  Errors:    {errors}")


if __name__ == "__main__":
    main()

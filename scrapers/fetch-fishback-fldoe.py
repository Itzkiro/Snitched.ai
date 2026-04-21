#!/usr/bin/env python3
"""
Targeted FL DOE campaign-finance scrape for James Fishback (Gov R 2026).

Reuses scrape_contributions_playwright() from fl-doe-scraper.py. Writes
results to data-ingestion/fishback-fldoe.json and also upserts summary
fields (total_funds, contribution_breakdown) into the politicians table.

Usage:
    python3 scrapers/fetch-fishback-fldoe.py
"""

import importlib.util
import json
import os
import sys
from pathlib import Path

# Import the hyphenated module by path
HERE = Path(__file__).parent
SCRAPER_PATH = HERE / "fl-doe-scraper.py"
spec = importlib.util.spec_from_file_location("fl_doe_scraper", str(SCRAPER_PATH))
assert spec and spec.loader
fl_doe = importlib.util.module_from_spec(spec)
sys.modules["fl_doe_scraper"] = fl_doe
spec.loader.exec_module(fl_doe)

BIOGUIDE = "fl-gov-james-fishback"
NAME = "James Fishback"
OUT = HERE.parent / "data-ingestion" / "fishback-fldoe.json"

def main() -> int:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("Install playwright: pip install playwright && playwright install chromium")
        return 1

    fl_doe._load_dotenv()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
        page = ctx.new_page()
        try:
            # office_code="All" because Governor isn't STS/STR
            contribs = fl_doe.scrape_contributions_playwright(page, NAME, "All", 3)
        finally:
            browser.close()

    print(f"\nContributions found: {len(contribs)}")
    total_funds = sum(float(c.get("amount", 0)) for c in contribs)
    print(f"Total $: ${total_funds:,.2f}")
    with open(OUT, "w") as f:
        json.dump({"contributions": contribs, "total": total_funds, "count": len(contribs)}, f, indent=2)
    print(f"Wrote {OUT}")

    # Upsert summary into Supabase
    try:
        import urllib.request
        url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if not url or not key:
            print("No SUPABASE env - skipping DB update")
            return 0
        breakdown = {
            "aipac": 0,
            "otherPACs": sum(float(c.get("amount", 0)) for c in contribs if (c.get("contributor_type") or "").upper() in ("PAC", "COMMITTEE", "ORG", "POLITICAL COMMITTEE", "CCE")),
            "individuals": sum(float(c.get("amount", 0)) for c in contribs if (c.get("contributor_type") or "").upper() in ("IND", "INDIVIDUAL", "", "INV")),
            "corporate": sum(float(c.get("amount", 0)) for c in contribs if (c.get("contributor_type") or "").upper() in ("BUS", "BUSINESS", "CORP")),
        }
        patch = {
            "total_funds": total_funds,
            "contribution_breakdown": breakdown,
        }
        req = urllib.request.Request(
            f"{url}/rest/v1/politicians?bioguide_id=eq.{BIOGUIDE}",
            method="PATCH",
            data=json.dumps(patch).encode(),
            headers={
                "Content-Type": "application/json",
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Prefer": "return=minimal",
            },
        )
        with urllib.request.urlopen(req) as r:
            print(f"DB patch status: {r.status}  total_funds=${total_funds:,.2f}  contribs={len(contribs)}")
    except Exception as e:
        print(f"DB patch error: {e}")
    return 0

if __name__ == "__main__":
    sys.exit(main())

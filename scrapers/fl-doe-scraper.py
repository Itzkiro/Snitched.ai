#!/usr/bin/env python3
"""
FL Division of Elections Campaign Finance Scraper
==================================================

Scrapes contribution data for Florida state legislators from the official
FL Division of Elections campaign finance database.

Uses Playwright to bypass Cloudflare and submit the search form in a real browser.

Usage:
    python3 scrapers/fl-doe-scraper.py
    python3 scrapers/fl-doe-scraper.py --limit 5          # Test with 5 legislators
    python3 scrapers/fl-doe-scraper.py --dry-run           # Preview without saving
    python3 scrapers/fl-doe-scraper.py --office SEN         # Only state senators
    python3 scrapers/fl-doe-scraper.py --output data-ingestion/fl-state-contributions.json

Data source: https://dos.elections.myflorida.com/campaign-finance/contributions/
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

# Add project root to path for imports
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

try:
    from playwright.sync_api import sync_playwright, Browser, BrowserContext, Page
except ImportError:
    print("ERROR: playwright not installed. Run: pip3 install playwright && python3 -m playwright install chromium")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

FL_DOE_CONTRIBUTIONS_URL = "https://dos.elections.myflorida.com/campaign-finance/contributions/"

# Delay between requests to be respectful
REQUEST_DELAY_S = 1.5

# Default output path
DEFAULT_OUTPUT = str(PROJECT_ROOT / "data-ingestion" / "fl-state-contributions.json")


# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------

def _load_dotenv() -> None:
    """Load .env file from project root."""
    env_path = PROJECT_ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def _fetch_legislators_via_rest() -> list[dict]:
    """Fetch state legislators via Supabase REST API."""
    import requests

    _load_dotenv()
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", os.environ.get("SUPABASE_ANON_KEY", os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")))

    if not url or not key:
        print("ERROR: SUPABASE_URL and a Supabase key are required")
        sys.exit(1)

    resp = requests.get(
        f"{url}/rest/v1/politicians",
        params={
            "select": "bioguide_id,name,office,office_level,district,party",
            "office_level": "in.(State Senator,State Representative)",
            "order": "name",
        },
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
        },
    )
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# Name parsing
# ---------------------------------------------------------------------------

def strip_accents(text: str) -> str:
    """Remove accented characters for search compatibility."""
    import unicodedata
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def parse_name_for_search(full_name: str) -> tuple[str, str]:
    """
    Split a politician's name into (last, first) for FL DOE search.
    Uses last word as last name (FL DOE uses "Starts With" matching).

    "Marco Rubio" -> ("Rubio", "Marco")
    "Ana Maria Rodriguez" -> ("Rodriguez", "Ana")
    "J.J. Grow" -> ("Grow", "")
    "Jennifer Kincart Jonsson" -> ("Jonsson", "Jennifer")

    Strips accents (e.g. "Ávila" -> "Avila") since FL DOE doesn't support Unicode.
    Drops middle name / initials with periods for cleaner search.
    """
    name = strip_accents(full_name.strip())
    parts = name.split()
    if len(parts) <= 1:
        return (name, "")

    last_name = parts[-1]
    # Use only first name (skip middle names) for cleaner matching
    first_name = parts[0]
    # If first name has periods (J.J.) it may confuse the search — try without
    if "." in first_name and len(parts) > 2:
        first_name = ""  # Search by last name only

    return (last_name, first_name)


def map_office_level_to_doe_code(office_level: str) -> str:
    """Map our office_level to FL DOE office dropdown value."""
    if office_level == "State Senator":
        return "STS"
    elif office_level == "State Representative":
        return "STR"
    return "All"


# ---------------------------------------------------------------------------
# Playwright-based scraper
# ---------------------------------------------------------------------------

def scrape_contributions_playwright(
    page: Page,
    name: str,
    office_code: str,
    max_retries: int = 2,
) -> list[dict]:
    """
    Scrape FL DOE for contributions using Playwright form submission.
    Navigates to the form, fills it, submits, and parses the results.
    Retries on failure or empty results (Cloudflare may intermittently block).
    """
    last_name, first_name = parse_name_for_search(name)

    for attempt in range(max_retries + 1):
        try:
            # Navigate to the contributions form
            page.goto(FL_DOE_CONTRIBUTIONS_URL, timeout=30000)
            page.wait_for_load_state("networkidle", timeout=15000)

            # Set election to "All" via JS and dispatch change event
            page.evaluate('''() => {
                const el = document.querySelector("select[name=election]");
                el.value = "All";
                el.dispatchEvent(new Event("change", { bubbles: true }));
            }''')

            # Fill candidate name
            page.fill('input[name="CanLName"]', last_name)
            page.fill('input[name="CanFName"]', first_name)

            # Set office filter via JS with change event
            page.evaluate(f'''() => {{
                const el = document.querySelector("select[name=office]");
                el.value = "{office_code}";
                el.dispatchEvent(new Event("change", {{ bubbles: true }}));
            }}''')

            # Max rows
            page.fill('input[name="rowlimit"]', '2000')

            # Verify election is set correctly before submitting
            actual_election = page.evaluate('document.querySelector("select[name=election]").value')
            if actual_election != "All":
                print(f"    WARNING: Election reset to {actual_election}, re-setting...")
                page.evaluate('document.querySelector("select[name=election]").value = "All"')

            # Submit
            page.click('input[name="Submit"]')
            page.wait_for_load_state("networkidle", timeout=30000)

            # Check for Cloudflare challenge
            text = page.inner_text("body")
            if "Just a moment" in text or "challenge-platform" in text:
                print(f"    Cloudflare challenge (attempt {attempt + 1}), retrying...")
                time.sleep(3)
                continue

            # Check if the page actually has contribution results
            if "Contribution(s) Selected" not in text:
                if attempt == max_retries:
                    print(f"    No results page (body len={len(text)}, url={page.url})")
                    # Dump first 200 chars for debugging
                    print(f"    Body preview: {text[:200]}")
                else:
                    print(f"    No results page (attempt {attempt + 1}), retrying...")
                time.sleep(3)
                continue

            # Check for 0 contributions (genuine empty result)
            if "0 Contribution(s) Selected" in text:
                # Show search criteria for debugging
                for line in text.split("\n"):
                    line_s = line.strip()
                    if any(x in line_s for x in ["Election Year:", "Office:", "Last Name", "First Name"]):
                        print(f"    {line_s}")
                return []

            results = parse_text_results(text, name)
            if results:
                return results

            # Page has contributions but parser failed — shouldn't happen
            if attempt < max_retries:
                print(f"    Parse failed (attempt {attempt + 1}), retrying...")
                time.sleep(2)

        except Exception as e:
            if attempt < max_retries:
                print(f"    Error (attempt {attempt + 1}): {e}, retrying...")
                time.sleep(3)
            else:
                print(f"    ERROR: {e}")

    return []


def parse_text_results(text: str, expected_name: str = "") -> list[dict]:
    """
    Parse FL DOE contribution results from page text.

    The result page shows fixed-width columns like:
    Candidate/Committee    Date       Amount Typ Contributor Name    Address    City State Zip    Occupation    Inkind Desc
    """
    contributions = []
    lines = text.split("\n")

    # Find the "Total:" line to verify we have data
    total_line = ""
    count_line = ""
    for line in lines:
        if "Total:" in line:
            total_line = line.strip()
        if "Contribution(s) Selected" in line:
            count_line = line.strip()

    if "0 Contribution(s)" in count_line:
        return []

    # Parse data lines — they contain candidate name followed by date and amount
    # Format: "Fine, Randy  (REP)(STS)   03/06/2023   1,000.00 CHE CONTRIBUTOR NAME   ADDRESS   CITY STATE ZIP   OCCUPATION"
    date_pattern = re.compile(r'\d{2}/\d{2}/\d{4}')

    for line in lines:
        line = line.strip()
        if not line or len(line) < 40:
            continue

        # Look for lines with a date pattern (MM/DD/YYYY)
        date_match = date_pattern.search(line)
        if not date_match:
            continue

        # Skip header/footer lines
        if "Candidate/Committee" in line or "Search Criteria" in line:
            continue

        try:
            # Extract candidate (everything before the date)
            date_pos = date_match.start()
            candidate_part = line[:date_pos].strip()

            # Extract date
            date_str = date_match.group()

            # Everything after the date
            after_date = line[date_match.end():].strip()

            # Amount is the first numeric value after date
            amount_match = re.match(r'\s*([\d,]+\.\d{2})\s+(\w{3})\s+(.*)', after_date)
            if not amount_match:
                continue

            amount_str = amount_match.group(1)
            contrib_type = amount_match.group(2)
            rest = amount_match.group(3).strip()

            amount = float(amount_str.replace(",", ""))

            # The rest is: Contributor Name    Address    City State Zip    Occupation
            # These are space-separated but contributor names can have spaces
            # Best effort: split on multiple spaces
            parts = re.split(r'\s{2,}', rest)

            contributor_name = parts[0] if len(parts) > 0 else ""
            address = parts[1] if len(parts) > 1 else ""
            city_state_zip = parts[2] if len(parts) > 2 else ""
            occupation = parts[3] if len(parts) > 3 else ""

            if amount > 0:
                contributions.append({
                    "candidate": candidate_part,
                    "date": date_str,
                    "amount": amount,
                    "type": contrib_type,
                    "contributor_name": contributor_name,
                    "address": address,
                    "city_state_zip": city_state_zip,
                    "occupation": occupation,
                    "employer": "",
                })
        except (ValueError, IndexError):
            continue

    return contributions


# ---------------------------------------------------------------------------
# Processing: aggregate and classify
# ---------------------------------------------------------------------------

def process_contributions(
    contributions: list[dict],
    politician_name: str,
) -> dict[str, Any]:
    """
    Process raw contributions into summary data for a politician.
    Returns dict ready for Supabase update.
    """
    if not contributions:
        return {
            "total_funds": 0,
            "top5_donors": [],
            "contribution_breakdown": {"aipac": 0, "otherPACs": 0, "individuals": 0, "corporate": 0},
            "aipac_funding": 0,
            "israel_lobby_total": 0,
            "israel_lobby_breakdown": {"total": 0, "pacs": 0, "ie": 0, "bundlers": 0},
            "contribution_count": 0,
        }

    total_funds = sum(c["amount"] for c in contributions)

    # Aggregate by donor name
    donor_totals: dict[str, dict] = {}
    israel_lobby_total = 0
    aipac_total = 0

    # Israel lobby patterns (same as FEC sync)
    israel_patterns = [
        "AIPAC", "AMERICAN ISRAEL PUBLIC AFFAIRS",
        "UNITED DEMOCRACY PROJECT",
        "DEMOCRATIC MAJORITY FOR ISRAEL",
        "PRO-ISRAEL AMERICA", "NORPAC",
        "J STREET", "JSTREET",
        "FRIENDS OF ISRAEL", "ISRAEL ALLIES",
        "JEWISH FEDERATION",
    ]
    aipac_patterns = [
        "AIPAC", "AMERICAN ISRAEL PUBLIC AFFAIRS",
        "UNITED DEMOCRACY PROJECT",
    ]

    for c in contributions:
        donor = c["contributor_name"]
        if not donor:
            continue

        donor_upper = donor.upper()
        is_israel = any(p in donor_upper for p in israel_patterns)
        is_aipac = any(p in donor_upper for p in aipac_patterns)

        if is_israel:
            israel_lobby_total += c["amount"]
        if is_aipac:
            aipac_total += c["amount"]

        # Classify donor type
        contrib_type = c.get("type", "").upper()

        if is_israel:
            dtype = "Israel-PAC"
        elif "PAC" in donor_upper or "COMMITTEE" in donor_upper or contrib_type in ("PAC", "COM"):
            dtype = "PAC"
        elif "INC" in donor_upper or "LLC" in donor_upper or "CORP" in donor_upper:
            dtype = "Corporate"
        else:
            dtype = "Individual"

        if donor not in donor_totals:
            donor_totals[donor] = {"amount": 0, "type": dtype, "is_israel_lobby": is_israel}
        donor_totals[donor]["amount"] += c["amount"]

    # Build top 5 donors
    sorted_donors = sorted(donor_totals.items(), key=lambda x: x[1]["amount"], reverse=True)
    top5 = [
        {
            "name": name,
            "amount": round(data["amount"]),
            "type": data["type"],
            "is_israel_lobby": data["is_israel_lobby"],
        }
        for name, data in sorted_donors[:5]
    ]

    # Contribution breakdown
    pac_total = sum(d["amount"] for d in donor_totals.values() if d["type"] == "PAC")
    corp_total = sum(d["amount"] for d in donor_totals.values() if d["type"] == "Corporate")
    indiv_total = sum(d["amount"] for d in donor_totals.values() if d["type"] == "Individual")
    israel_pac_total = sum(d["amount"] for d in donor_totals.values() if d["type"] == "Israel-PAC")

    return {
        "total_funds": round(total_funds),
        "top5_donors": top5,
        "contribution_breakdown": {
            "aipac": round(israel_pac_total),
            "otherPACs": round(pac_total),
            "individuals": round(indiv_total),
            "corporate": round(corp_total),
        },
        "aipac_funding": round(aipac_total),
        "israel_lobby_total": round(israel_lobby_total),
        "israel_lobby_breakdown": {
            "total": round(israel_lobby_total),
            "pacs": round(israel_lobby_total),
            "ie": 0,
            "bundlers": 0,
        },
        "contribution_count": len(contributions),
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape FL DOE campaign finance data")
    parser.add_argument("--limit", type=int, default=0, help="Limit to N legislators (0=all)")
    parser.add_argument("--dry-run", action="store_true", help="Don't save output")
    parser.add_argument("--office", choices=["SEN", "REP", "ALL"], default="ALL", help="Filter by office")
    parser.add_argument("--output", default=DEFAULT_OUTPUT, help="Output JSON path")
    parser.add_argument("--retry-missing", action="store_true", help="Re-scrape only legislators with 0 data from previous run")
    args = parser.parse_args()

    print("=" * 60)
    print("  FL Division of Elections - Campaign Finance Scraper")
    print("=" * 60)
    print(f"  Output:  {args.output}")
    print(f"  Limit:   {'All' if not args.limit else args.limit}")
    print(f"  Office:  {args.office}")
    print(f"  Mode:    {'DRY RUN' if args.dry_run else 'LIVE'}")
    print()

    # Step 1: Get state legislators from Supabase
    print("Step 1: Fetching state legislators from Supabase...")
    _load_dotenv()
    legislators = _fetch_legislators_via_rest()

    if args.office != "ALL":
        office_map = {"SEN": "State Senator", "REP": "State Representative"}
        legislators = [l for l in legislators if l["office_level"] == office_map[args.office]]

    # Load previous results for retry mode
    previous_results: dict[str, dict] = {}
    if args.retry_missing:
        prev_path = Path(args.output)
        if prev_path.exists():
            prev_data = json.loads(prev_path.read_text())
            for r in prev_data.get("results", []):
                previous_results[r["bioguide_id"]] = r
            # Filter to only legislators with 0 data
            missing_ids = {bid for bid, r in previous_results.items() if r["total_funds"] == 0}
            legislators = [l for l in legislators if l["bioguide_id"] in missing_ids]
            print(f"  Retry mode: {len(legislators)} legislators with missing data")

    if args.limit:
        legislators = legislators[:args.limit]

    print(f"  Found {len(legislators)} legislators to process")
    print()

    # Step 2: Scrape contributions using Playwright
    print(f"Step 2: Scraping contributions for {len(legislators)} legislators...")
    print("-" * 60)

    results = []
    success_count = 0
    error_count = 0
    start_time = time.time()

    # Use fresh browser context per request to avoid Cloudflare throttling.
    # Reusing contexts causes CF to start blocking after ~30-40 requests.

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ua = (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36"
        )

        for i, leg in enumerate(legislators):
            name = leg["name"]
            office_level = leg["office_level"]
            district = leg.get("district", "")
            office_code = map_office_level_to_doe_code(office_level)

            print(f"\n[{i+1}/{len(legislators)}] {name} ({office_level}, District {district})")

            ctx = browser.new_context(user_agent=ua)
            page = ctx.new_page()

            contributions = scrape_contributions_playwright(
                page=page,
                name=name,
                office_code=office_code,
            )

            page.close()
            ctx.close()

            summary = process_contributions(contributions, name)
            summary["bioguide_id"] = leg["bioguide_id"]
            summary["name"] = name
            summary["office_level"] = office_level
            summary["raw_contribution_count"] = len(contributions)

            if contributions:
                success_count += 1
                print(f"    Found {len(contributions)} contributions, ${summary['total_funds']:,.0f} total")
                if summary["israel_lobby_total"] > 0:
                    print(f"    Israel lobby: ${summary['israel_lobby_total']:,.0f}")
            else:
                error_count += 1
                print(f"    No data found")

            results.append(summary)

            # Rate limiting
            if i < len(legislators) - 1:
                time.sleep(REQUEST_DELAY_S)

        browser.close()

    # Step 3: Save results
    elapsed = time.time() - start_time

    print("\n" + "=" * 60)
    print("  SCRAPE SUMMARY")
    print("=" * 60)
    print(f"  Total processed:  {len(legislators)}")
    print(f"  With data:        {success_count}")
    print(f"  No data:          {error_count}")
    print(f"  Duration:         {elapsed:.1f}s")

    # Merge with previous results if retrying
    if args.retry_missing and previous_results:
        merged = dict(previous_results)
        for r in results:
            merged[r["bioguide_id"]] = r
        results = list(merged.values())
        success_count = sum(1 for r in results if r["total_funds"] > 0)

    if not args.dry_run:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps({
            "scraped_at": datetime.now().isoformat(),
            "total_legislators": len(results),
            "with_data": success_count,
            "results": results,
        }, indent=2))
        print(f"\n  Saved to: {args.output}")
    else:
        print(f"\n  [DRY RUN] Would save to: {args.output}")

    # Show top funded legislators
    funded = sorted(results, key=lambda r: r["total_funds"], reverse=True)
    top = [r for r in funded if r["total_funds"] > 0][:10]
    if top:
        print("\n  Top 10 by Total Funds:")
        for r in top:
            israel = f"  (Israel: ${r['israel_lobby_total']:,.0f})" if r["israel_lobby_total"] > 0 else ""
            print(f"    {r['name']:<35} ${r['total_funds']:>12,.0f}{israel}")

    # Israel lobby recipients
    israel_recipients = [r for r in results if r["israel_lobby_total"] > 0]
    israel_recipients.sort(key=lambda r: r["israel_lobby_total"], reverse=True)
    if israel_recipients:
        print("\n  Israel Lobby Recipients (State Level):")
        for r in israel_recipients:
            print(f"    {r['name']:<35} ${r['israel_lobby_total']:>12,.0f}")

    print("\n" + "=" * 60)


if __name__ == "__main__":
    main()

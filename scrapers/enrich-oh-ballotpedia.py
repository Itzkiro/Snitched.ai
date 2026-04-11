#!/usr/bin/env python3.11
"""
Enrich Ohio officials via Ballotpedia + Google search.

For each OH politician without financial data:
  1. Search Ballotpedia for their campaign finance page
  2. Extract total raised, top donors, party info
  3. Update Supabase with enriched data
  4. Recompute corruption score

Uses Scrapling Fetcher for HTTP requests.

Usage:
  python3.11 scrapers/enrich-oh-ballotpedia.py --offset 0 --batch-size 175
"""

import json
import os
import sys
import time
import argparse
import re
import urllib.request
import urllib.parse
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scrapling import Fetcher

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DELAY = 3  # seconds between requests

# ---------------------------------------------------------------------------
# Supabase REST helpers
# ---------------------------------------------------------------------------

SUPABASE_URL = ""
SUPABASE_KEY = ""


def sb_get(table, params):
    query = "&".join(f"{k}={urllib.parse.quote(str(v))}" for k, v in params.items())
    url = f"{SUPABASE_URL}/rest/v1/{table}?{query}"
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def sb_patch(table, col, val, data):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{col}=eq.{urllib.parse.quote(val)}"
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, method="PATCH", headers={
        "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json", "Prefer": "return=minimal",
    })
    with urllib.request.urlopen(req) as r:
        return r.status


# ---------------------------------------------------------------------------
# Scrapers
# ---------------------------------------------------------------------------

def extract_money(text):
    if not text:
        return 0
    cleaned = re.sub(r'[^0-9.]', '', text.replace(',', ''))
    try:
        return float(cleaned)
    except ValueError:
        return 0


def scrape_ballotpedia(name, fetcher):
    """Search Ballotpedia for campaign finance info."""
    slug = name.replace(' ', '_')
    url = f"https://ballotpedia.org/{slug}"

    try:
        page = fetcher.get(url)
        if not page or page.status != 200:
            return None

        body = page.text if hasattr(page, 'text') else str(page)

        result = {"name": name, "total_raised": 0, "donors": [], "source": "ballotpedia"}

        # Look for campaign finance section
        # Ballotpedia often has "Campaign finance summary" sections
        money_amounts = re.findall(r'\$([\d,]+(?:\.\d{2})?)', body)
        large_amounts = sorted([extract_money(a) for a in money_amounts if extract_money(a) > 1000], reverse=True)

        if large_amounts:
            # Filter out absurdly large numbers (population stats etc)
            reasonable = [a for a in large_amounts if a < 500_000_000]
            if reasonable:
                result["total_raised"] = reasonable[0]

        # Look for donor/contributor info
        # Common patterns: "Top donors" sections, contributor tables
        donor_pattern = r'(?:donor|contributor|PAC)[^<]*?([A-Z][a-zA-Z\s&]+?)(?:\s*[-–]\s*|\s+)\$([\d,]+)'
        donors = re.findall(donor_pattern, body, re.IGNORECASE)
        for dname, amt in donors[:5]:
            a = extract_money(amt)
            if a > 0:
                result["donors"].append({"name": dname.strip(), "amount": a, "type": "Individual"})

        return result if result["total_raised"] > 0 else None

    except Exception as e:
        return None


def scrape_opensecrets_page(name, state="OH", fetcher=None):
    """Scrape OpenSecrets candidate page for financial data."""
    try:
        # Search OpenSecrets
        search_name = urllib.parse.quote(name)
        url = f"https://www.opensecrets.org/search?q={search_name}&type=candidates"

        page = fetcher.get(url)
        if not page or page.status != 200:
            return None

        body = page.text if hasattr(page, 'text') else str(page)

        # Find candidate links for Ohio
        # Pattern: /members-of-congress/... or /races/...
        links = re.findall(r'href="(/members-of-congress/[^"]+)"', body)
        oh_links = [l for l in links if 'OH' in body[body.find(l)-200:body.find(l)+200]]

        if not oh_links and not links:
            return None

        # Follow first matching link
        detail_url = f"https://www.opensecrets.org{oh_links[0] if oh_links else links[0]}"
        detail = fetcher.get(detail_url)
        if not detail or detail.status != 200:
            return None

        detail_body = detail.text if hasattr(detail, 'text') else str(detail)

        result = {"name": name, "total_raised": 0, "donors": [], "source": "opensecrets"}

        # Extract financial amounts
        money = re.findall(r'\$([\d,]+(?:\.\d{2})?)', detail_body)
        amounts = sorted([extract_money(a) for a in money if extract_money(a) > 5000], reverse=True)
        reasonable = [a for a in amounts if a < 500_000_000]
        if reasonable:
            result["total_raised"] = reasonable[0]

        # Extract top contributors
        contrib_section = re.search(r'Top Contributors.*?</table>', detail_body, re.DOTALL | re.IGNORECASE)
        if contrib_section:
            rows = re.findall(r'<td[^>]*>(.*?)</td>', contrib_section.group(), re.DOTALL)
            for i in range(0, len(rows) - 1, 2):
                dname = re.sub(r'<[^>]+>', '', rows[i]).strip()
                amt = extract_money(rows[i + 1])
                if dname and amt > 0:
                    result["donors"].append({"name": dname, "amount": amt, "type": "PAC"})

        return result if result["total_raised"] > 0 else None

    except Exception:
        return None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--batch-size", type=int, default=175)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")

    global SUPABASE_URL, SUPABASE_KEY
    SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
    SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

    print(f"=== OH Enrichment via Ballotpedia/OpenSecrets (offset={args.offset}) ===\n")

    # Fetch OH politicians without financial data
    pols = sb_get("politicians", {
        "select": "bioguide_id,name,office,office_level,total_funds,top5_donors",
        "bioguide_id": "like.oh-*",
        "or": "(total_funds.is.null,total_funds.eq.0)",
        "order": "bioguide_id",
        "offset": str(args.offset),
        "limit": str(args.batch_size),
    })
    print(f"  Fetched {len(pols)} OH politicians without financial data\n")

    fetcher = Fetcher()
    enriched = 0
    skipped = 0

    for i, pol in enumerate(pols):
        name = pol["name"]
        progress = f"[{i+1}/{len(pols)}]"

        # Try Ballotpedia first
        data = scrape_ballotpedia(name, fetcher)

        # Fallback to OpenSecrets
        if not data:
            data = scrape_opensecrets_page(name, fetcher=fetcher)

        if not data or data.get("total_raised", 0) == 0:
            skipped += 1
            continue

        enriched += 1
        amt = data["total_raised"]
        amt_str = f"${amt/1e6:.1f}M" if amt >= 1e6 else f"${amt/1e3:.0f}K"
        print(f"{progress} ✓ {name} — {amt_str} ({data['source']})")

        if not args.dry_run:
            update = {
                "total_funds": data["total_raised"],
                "updated_at": datetime.now().isoformat(),
            }
            if data.get("donors"):
                update["top5_donors"] = data["donors"][:5]
            sb_patch("politicians", "bioguide_id", pol["bioguide_id"], update)

        time.sleep(DELAY)

    print(f"\n=== Done: {enriched} enriched, {skipped} skipped ===")


if __name__ == "__main__":
    main()

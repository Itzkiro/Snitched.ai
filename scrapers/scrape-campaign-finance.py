#!/usr/bin/env python3
"""
Snitched.ai — Campaign Finance Scraper
========================================

Scrapes campaign finance data from:
1. VoterFocus (county-level): County commissioners, school board, mayors, etc.
2. FL Division of Elections (state-level): State senators, state reps, governor

Produces:
- Total funds raised per politician
- Top 5 donors with names and amounts
- Contribution breakdowns (individual vs business vs PAC)

Usage:
    # Scrape all counties (VoterFocus)
    python3 scrapers/scrape-campaign-finance.py --source voterfocus

    # Scrape specific county
    python3 scrapers/scrape-campaign-finance.py --source voterfocus --county volusia

    # Scrape state-level (FL Division of Elections)
    python3 scrapers/scrape-campaign-finance.py --source fldoe

    # Scrape everything
    python3 scrapers/scrape-campaign-finance.py --source all

    # Dry run (don't push to Supabase)
    python3 scrapers/scrape-campaign-finance.py --source voterfocus --dry-run
"""

import argparse
import csv
import io
import json
import logging
import os
import re
import sys
import time
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests

# ---------------------------------------------------------------------------
# Paths & directories
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
LOG_DIR = PROJECT_DIR / "scrapers" / "logs"
DATA_DIR = PROJECT_DIR / "data-ingestion"

LOG_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    handlers=[
        logging.FileHandler(LOG_DIR / "campaign-finance.log"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger("snitched.campaign-finance")

# ---------------------------------------------------------------------------
# Supabase config
# ---------------------------------------------------------------------------

SUPABASE_URL = os.getenv("SUPABASE_URL")
if not SUPABASE_URL:
    raise RuntimeError("SUPABASE_URL environment variable is required")

SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
if not SUPABASE_SERVICE_KEY:
    raise RuntimeError("SUPABASE_SERVICE_KEY environment variable is required")

SUPABASE_HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

# ---------------------------------------------------------------------------
# HTTP session
# ---------------------------------------------------------------------------

SESSION = requests.Session()
SESSION.headers.update(
    {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    }
)

# ---------------------------------------------------------------------------
# VoterFocus county config
# ---------------------------------------------------------------------------

COUNTIES = {
    "volusia": {
        "name": "Volusia",
        "code": "volusia",
        # Recent election IDs (newest first)
        "elections": [36, 38, 33, 35, 29, 28, 20, 13],
    },
    "flagler": {
        "name": "Flagler",
        "code": "flagler",
        "elections": [],  # Will be auto-detected
    },
    "seminole": {
        "name": "Seminole",
        "code": "seminole",
        "elections": [],
    },
    "stjohns": {
        "name": "St. Johns",
        "code": "stjohns",
        "elections": [],
    },
    "putnam": {
        "name": "Putnam",
        "code": "putnam",
        "elections": [],
    },
    "lake": {
        "name": "Lake",
        "code": "lake",
        "elections": [],
    },
    "brevard": {
        "name": "Brevard",
        "code": "brevard",
        "elections": [],
    },
}

# Israel lobby and notable PAC keywords for contribution tagging
ISRAEL_LOBBY_KEYWORDS = [
    "aipac", "american israel public affairs",
    "united democracy project",
    "democratic majority for israel",
    "pro-israel america",
    "norpac", "j street", "jstreet",
    "friends of israel", "israel allies",
    "israel bonds", "washington pac",
    "joint action committee for political",
]


# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------


def supabase_get_politicians(
    office_levels: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """Fetch politicians from Supabase, optionally filtered by office level."""
    url = (
        f"{SUPABASE_URL}/rest/v1/politicians"
        f"?select=bioguide_id,name,office,office_level,district,total_funds,top5_donors,data_source"
        f"&order=name"
        f"&limit=1000"
    )
    if office_levels:
        # Use Supabase OR filter — URL-encode values with special chars
        from urllib.parse import quote
        levels_filter = ",".join(quote(lvl) for lvl in office_levels)
        url += f"&office_level=in.({levels_filter})"

    resp = requests.get(url, headers=SUPABASE_HEADERS, timeout=30)
    resp.raise_for_status()
    politicians = resp.json()
    logger.info(f"Fetched {len(politicians)} politicians from Supabase")
    return politicians


def supabase_update_politician_funding(
    bioguide_id: str, data: Dict[str, Any]
) -> bool:
    """Update a politician's funding data in Supabase."""
    url = (
        f"{SUPABASE_URL}/rest/v1/politicians"
        f"?bioguide_id=eq.{bioguide_id}"
    )
    headers = {
        **SUPABASE_HEADERS,
        "Prefer": "return=representation",
    }
    # Ensure numeric fields are integers (Supabase column is bigint)
    if "total_funds" in data:
        data["total_funds"] = int(round(data["total_funds"]))
    if "aipac_funding" in data:
        data["aipac_funding"] = int(round(data.get("aipac_funding", 0)))
    if "israel_lobby_total" in data:
        data["israel_lobby_total"] = int(round(data.get("israel_lobby_total", 0)))
    # Round amounts in top5_donors
    if "top5_donors" in data and data["top5_donors"]:
        for d in data["top5_donors"]:
            d["amount"] = round(d["amount"], 2)

    resp = requests.patch(url, headers=headers, json=data, timeout=30)
    if resp.status_code in (200, 204):
        return True
    else:
        logger.error(
            f"Failed to update {bioguide_id}: {resp.status_code} {resp.text[:200]}"
        )
        return False


# ---------------------------------------------------------------------------
# VoterFocus scraper
# ---------------------------------------------------------------------------


class VoterFocusScraper:
    """Scrapes campaign finance data from VoterFocus county election sites."""

    BASE_URL = "https://www.voterfocus.com/CampaignFinance"

    def __init__(self):
        self.stats = {
            "counties_scraped": 0,
            "candidates_found": 0,
            "candidates_matched": 0,
            "candidates_with_data": 0,
            "total_contributions": 0,
            "errors": [],
        }

    def get_elections(self, county_code: str) -> List[Tuple[str, str]]:
        """Fetch available elections for a county. Returns [(id, name), ...]"""
        url = f"{self.BASE_URL}/candidate_pr.php?c={county_code}"
        try:
            resp = SESSION.get(url, timeout=30)
            resp.encoding = "latin-1"
            if resp.status_code != 200:
                logger.warning(
                    f"Failed to fetch elections for {county_code}: HTTP {resp.status_code}"
                )
                return []

            html = resp.text
            elections = re.findall(
                r"<option\s+value='(\d+)'[^>]*>([^<]+)</option>", html
            )
            return [(eid, ename.strip()) for eid, ename in elections]
        except Exception as e:
            logger.error(f"Error fetching elections for {county_code}: {e}")
            return []

    def get_candidates(
        self, county_code: str, election_id: str
    ) -> List[Dict[str, Any]]:
        """Fetch candidate listing for a county/election. Returns list of
        {id, name, office, status, monetary, inkind, expenditures}."""
        url = f"{self.BASE_URL}/candidate_pr.php?c={county_code}&e={election_id}"
        try:
            resp = SESSION.get(url, timeout=30)
            resp.encoding = "latin-1"
            if resp.status_code != 200:
                return []

            html = resp.text
            candidates = []
            current_office = None

            # Split by office sections
            parts = re.split(
                r'<div class="col-xs-12 officename">', html
            )
            for part in parts[1:]:
                office_match = re.match(r"Office:\s*([^<]+)", part)
                if office_match:
                    current_office = office_match.group(1).strip()

                # Find candidate entries
                cand_blocks = re.findall(
                    r"ca=(\d+)[^\"]*\">\s*"
                    r"(?:.*?bold[^>]*>\s*\n?\s*([A-Z].*?)\s*\n)"
                    r"(?:.*?(Active-Filed|Inactive-Withdrawn|Active-Qualified))?"
                    r"(?:.*?\$([\d,]+\.\d{2}))?"  # monetary
                    r"(?:.*?\$([\d,]+\.\d{2}))?"  # in-kind
                    r"(?:.*?\$([\d,]+\.\d{2}))?",  # expenditures
                    part,
                    re.DOTALL,
                )

                for (
                    ca_id,
                    name,
                    status,
                    monetary,
                    inkind,
                    expenditures,
                ) in cand_blocks:
                    candidates.append(
                        {
                            "vf_id": ca_id,
                            "name": name.strip(),
                            "office": current_office,
                            "status": status or "Unknown",
                            "monetary": self._parse_amount(monetary),
                            "inkind": self._parse_amount(inkind),
                            "expenditures": self._parse_amount(expenditures),
                        }
                    )

            return candidates
        except Exception as e:
            logger.error(
                f"Error fetching candidates for {county_code}/e={election_id}: {e}"
            )
            return []

    def get_contributions(
        self, county_code: str, candidate_id: str
    ) -> List[Dict[str, Any]]:
        """Download and parse the CSV export of all contributions for a candidate."""
        url = (
            f"{self.BASE_URL}/export.php"
            f"?op=CFINANCE&cand_id={candidate_id}&dhc=0&county={county_code}"
        )
        try:
            resp = SESSION.get(url, timeout=60)
            resp.encoding = "latin-1"
            if resp.status_code != 200:
                logger.debug(
                    f"No export for candidate {candidate_id}: HTTP {resp.status_code}"
                )
                return []

            text = resp.text
            if not text.strip() or "<html" in text.lower()[:100]:
                return []

            # Parse CSV
            contributions = []
            reader = csv.DictReader(io.StringIO(text))
            for row in reader:
                try:
                    cont_exp = row.get("Cont/Exp", "").strip()
                    if cont_exp != "C":  # Only contributions, not expenditures
                        continue

                    amount_str = row.get("amount", "0").strip()
                    amount = float(amount_str) if amount_str else 0.0

                    name = row.get("name", "").strip()
                    # Clean up double spaces
                    name = re.sub(r"\s+", " ", name)
                    # Remove <br> tags in occupation field
                    occupation = row.get("occupation", "").replace("<br>", " ").strip()

                    cont_type = row.get("cont. type", "").strip()
                    # I = Individual, B = Business, O = Other, C = Committee, P = Party
                    type_map = {
                        "I": "Individual",
                        "B": "Corporate",
                        "O": "Other",
                        "C": "PAC",
                        "P": "PAC",
                    }

                    contributions.append(
                        {
                            "name": name,
                            "amount": amount,
                            "date": row.get("item date", ""),
                            "type": type_map.get(cont_type, "Other"),
                            "occupation": occupation,
                            "city": row.get("city", "").strip(),
                            "state": row.get("state", "").strip(),
                            "item_type": row.get("item type", "").strip(),
                        }
                    )
                except (ValueError, KeyError) as e:
                    continue

            return contributions
        except Exception as e:
            logger.error(
                f"Error downloading contributions for candidate {candidate_id}: {e}"
            )
            return []

    def aggregate_contributions(
        self, contributions: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Aggregate contributions into summary data."""
        if not contributions:
            return {
                "total_funds": 0,
                "top5_donors": [],
                "contribution_breakdown": {
                    "individuals": 0,
                    "corporate": 0,
                    "pacs": 0,
                    "other": 0,
                },
                "israel_lobby_total": 0,
                "total_contributions_count": 0,
            }

        # Sum by donor name
        donor_totals = {}
        type_totals = {"Individual": 0, "Corporate": 0, "PAC": 0, "Other": 0}
        israel_lobby_total = 0
        total_amount = 0

        for c in contributions:
            name = c["name"]
            amount = c["amount"]
            ctype = c["type"]

            total_amount += amount
            type_totals[ctype] = type_totals.get(ctype, 0) + amount

            if name not in donor_totals:
                donor_totals[name] = {
                    "name": name,
                    "amount": 0,
                    "type": ctype,
                    "contributions": 0,
                }
            donor_totals[name]["amount"] += amount
            donor_totals[name]["contributions"] += 1

            # Check for Israel lobby connections
            name_lower = name.lower()
            if any(kw in name_lower for kw in ISRAEL_LOBBY_KEYWORDS):
                israel_lobby_total += amount

        # Top 5 donors by total amount
        top_donors = sorted(
            donor_totals.values(), key=lambda d: d["amount"], reverse=True
        )[:5]

        top5 = []
        for d in top_donors:
            donor_type = d["type"]
            # Check if this is an Israel-PAC
            if any(
                kw in d["name"].lower() for kw in ISRAEL_LOBBY_KEYWORDS
            ):
                donor_type = "Israel-PAC"
            top5.append(
                {
                    "name": d["name"],
                    "amount": round(d["amount"], 2),
                    "type": donor_type,
                }
            )

        return {
            "total_funds": round(total_amount, 2),
            "top5_donors": top5,
            "contribution_breakdown": {
                "individuals": round(type_totals.get("Individual", 0), 2),
                "corporate": round(type_totals.get("Corporate", 0), 2),
                "pacs": round(type_totals.get("PAC", 0), 2),
                "other": round(type_totals.get("Other", 0), 2),
            },
            "israel_lobby_total": round(israel_lobby_total, 2),
            "total_contributions_count": len(contributions),
        }

    def match_candidate_to_politician(
        self,
        candidate_name: str,
        candidate_office: str,
        politicians: List[Dict[str, Any]],
    ) -> Optional[Dict[str, Any]]:
        """Match a VoterFocus candidate to a Supabase politician by name similarity."""
        # Normalize names for comparison
        def normalize(name: str) -> str:
            # Remove middle initials, suffixes, prefixes
            name = name.strip()
            # Remove common suffixes
            name = re.sub(
                r",?\s+(Jr\.?|Sr\.?|III|II|IV)$", "", name, flags=re.IGNORECASE
            )
            # Remove middle initial(s)
            parts = name.split()
            if len(parts) >= 3:
                # Keep first and last, drop middle initials (single chars)
                filtered = [parts[0]] + [
                    p for p in parts[1:] if len(p) > 2 or p == parts[-1]
                ]
                name = " ".join(filtered)
            return name.lower().strip()

        cand_norm = normalize(candidate_name)

        best_match = None
        best_score = 0.0

        for pol in politicians:
            pol_norm = normalize(pol["name"])

            # Try exact match first
            if cand_norm == pol_norm:
                return pol

            # Try last name + first name match
            cand_parts = cand_norm.split()
            pol_parts = pol_norm.split()
            if (
                len(cand_parts) >= 2
                and len(pol_parts) >= 2
                and cand_parts[-1] == pol_parts[-1]
                and cand_parts[0] == pol_parts[0]
            ):
                return pol

            # Fuzzy match
            score = SequenceMatcher(None, cand_norm, pol_norm).ratio()
            if score > best_score:
                best_score = score
                best_match = pol

        # Require high similarity (0.80+) for fuzzy match
        if best_score >= 0.80:
            return best_match

        return None

    def scrape_county(
        self,
        county_code: str,
        politicians: List[Dict[str, Any]],
        max_elections: int = 3,
    ) -> Dict[str, Dict[str, Any]]:
        """Scrape campaign finance for all matching politicians in a county.
        Returns {bioguide_id: funding_data}."""

        county_name = COUNTIES.get(county_code, {}).get("name", county_code)
        logger.info(f"\n{'='*60}")
        logger.info(f"  Scraping {county_name} County")
        logger.info(f"{'='*60}")

        # Get available elections
        elections = self.get_elections(county_code)
        if not elections:
            logger.warning(f"No elections found for {county_code}")
            return {}

        logger.info(f"Found {len(elections)} elections for {county_name}")

        # Track which politicians we've already matched (avoid duplicates)
        matched_politicians = {}  # bioguide_id -> funding_data
        matched_names = set()

        # Scan recent elections (limit to avoid excessive scraping)
        for election_id, election_name in elections[:max_elections]:
            logger.info(f"\n  Election: {election_name} (id={election_id})")

            candidates = self.get_candidates(county_code, election_id)
            logger.info(f"  Found {len(candidates)} candidates")
            self.stats["candidates_found"] += len(candidates)
            time.sleep(1)  # Polite delay

            for cand in candidates:
                # Skip already-matched politicians
                if cand["name"] in matched_names:
                    continue

                # Try to match to our Supabase politicians
                match = self.match_candidate_to_politician(
                    cand["name"], cand["office"], politicians
                )
                if not match:
                    continue

                bioguide_id = match["bioguide_id"]
                if bioguide_id in matched_politicians:
                    continue

                matched_names.add(cand["name"])
                self.stats["candidates_matched"] += 1
                logger.info(
                    f"    Matched: {cand['name']} -> {match['name']} "
                    f"(${cand['monetary']:,.2f} monetary)"
                )

                # If the candidate has $0 monetary, use the summary amount
                if cand["monetary"] <= 0:
                    matched_politicians[bioguide_id] = {
                        "total_funds": 0,
                        "top5_donors": [],
                        "data_source": "voterfocus",
                    }
                    continue

                # Download detailed contribution data
                time.sleep(1.5)  # Polite delay before CSV download
                contributions = self.get_contributions(
                    county_code, cand["vf_id"]
                )

                if contributions:
                    aggregated = self.aggregate_contributions(contributions)
                    self.stats["candidates_with_data"] += 1
                    self.stats["total_contributions"] += len(contributions)
                    logger.info(
                        f"      {len(contributions)} contributions, "
                        f"total ${aggregated['total_funds']:,.2f}"
                    )
                    if aggregated["top5_donors"]:
                        for d in aggregated["top5_donors"][:3]:
                            logger.info(
                                f"        Top donor: {d['name']} "
                                f"(${d['amount']:,.2f}, {d['type']})"
                            )

                    matched_politicians[bioguide_id] = {
                        "total_funds": aggregated["total_funds"],
                        "top5_donors": aggregated["top5_donors"],
                        "aipac_funding": aggregated["israel_lobby_total"],
                        "israel_lobby_total": aggregated["israel_lobby_total"],
                        "data_source": "voterfocus",
                    }
                else:
                    # Use summary amount from candidate listing
                    matched_politicians[bioguide_id] = {
                        "total_funds": cand["monetary"],
                        "top5_donors": [],
                        "data_source": "voterfocus",
                    }

        self.stats["counties_scraped"] += 1
        return matched_politicians

    @staticmethod
    def _parse_amount(amount_str: Optional[str]) -> float:
        """Parse a dollar amount string like '42,813.85' to float."""
        if not amount_str:
            return 0.0
        try:
            return float(amount_str.replace(",", ""))
        except ValueError:
            return 0.0


# ---------------------------------------------------------------------------
# FL Division of Elections scraper (state-level)
# ---------------------------------------------------------------------------


class FLDOEScraper:
    """Scrapes campaign finance data from FL Division of Elections
    (dos.elections.myflorida.com) for state-level officials."""

    CONTRIB_URL = "https://dos.elections.myflorida.com/cgi-bin/contrib.exe"

    def __init__(self):
        self.stats = {
            "politicians_scraped": 0,
            "politicians_with_data": 0,
            "total_contributions": 0,
            "errors": [],
        }

    def search_contributions(
        self,
        candidate_last_name: str,
        candidate_first_name: str = "",
        election: str = "All",
        office: str = "All",
    ) -> List[Dict[str, Any]]:
        """Search for contributions to a candidate via the FLDOE CGI interface.
        Returns tab-delimited contribution data."""

        form_data = {
            "election": election,
            "search_on": "1",
            "CanFName": candidate_first_name,
            "CanLName": candidate_last_name,
            "CanNameSrch": "2",  # Starts with
            "office": office,
            "cdistrict": "",
            "cgroup": "",
            "party": "All",
            "ComName": "",
            "ComNameSrch": "2",
            "committee": "All",
            "cfname": "",
            "clname": "",
            "namesearch": "2",
            "ccity": "",
            "cstate": "",
            "czipcode": "",
            "coccupation": "",
            "cdollar_minimum": "",
            "cdollar_maximum": "",
            "rowlimit": "2000",
            "csort1": "AMT",  # Sort by amount descending
            "csort2": "DAT",
            "cdatefrom": "",
            "cdateto": "",
            "queryformat": "2",  # Tab-delimited file
        }

        try:
            resp = SESSION.post(
                self.CONTRIB_URL,
                data=form_data,
                timeout=60,
                allow_redirects=True,
            )
            if resp.status_code != 200:
                logger.warning(
                    f"FLDOE search failed for {candidate_last_name}: "
                    f"HTTP {resp.status_code}"
                )
                return []

            text = resp.text
            if "<html" in text.lower()[:200] and "No records" in text:
                return []

            # Parse tab-delimited data
            contributions = []
            lines = text.strip().split("\n")
            if len(lines) < 2:
                return []

            # First line is header
            headers = lines[0].split("\t")
            for line in lines[1:]:
                fields = line.split("\t")
                if len(fields) < 6:
                    continue

                try:
                    # Map field positions based on FLDOE format
                    row = dict(zip(headers, fields))
                    amount_str = row.get("Amount", "0").strip().replace(",", "")
                    amount = float(amount_str) if amount_str else 0.0

                    contributor_name = row.get("Contributor Name", "").strip()
                    cont_type = row.get("Type", "").strip()

                    # Type mapping for FLDOE
                    type_map = {
                        "INK": "Other",  # In-kind
                        "CHE": "Individual",
                        "CAS": "Individual",
                        "MON": "Individual",
                        "LOA": "Other",
                    }

                    # Check if contributor is a PAC/committee
                    donor_type = "Individual"
                    if any(
                        kw in contributor_name.upper()
                        for kw in [
                            "PAC",
                            "COMMITTEE",
                            "ASSOC",
                            "CORP",
                            "LLC",
                            "INC",
                            "FUND",
                        ]
                    ):
                        donor_type = "PAC"
                    elif cont_type in type_map:
                        donor_type = type_map[cont_type]

                    contributions.append(
                        {
                            "name": contributor_name,
                            "amount": amount,
                            "date": row.get("Date", ""),
                            "type": donor_type,
                            "occupation": row.get("Occupation", "").strip(),
                        }
                    )
                except (ValueError, KeyError):
                    continue

            return contributions
        except Exception as e:
            logger.error(
                f"Error searching FLDOE for {candidate_last_name}: {e}"
            )
            self.stats["errors"].append(
                f"{candidate_last_name}: {str(e)}"
            )
            return []

    def scrape_politician(
        self, politician: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Scrape campaign finance for a state-level politician."""
        name = politician["name"]
        parts = name.split()
        if len(parts) < 2:
            return None

        last_name = parts[-1]
        first_name = parts[0]

        # Map office_level to FLDOE office codes
        office_level = politician.get("office_level", "")
        office_map = {
            "State Senator": "STS",
            "State Representative": "STR",
            "Governor": "GOV",
            "State Attorney": "SAO",
            "Public Defender": "PUB",
        }
        office = office_map.get(office_level, "All")

        logger.info(f"  Searching FLDOE for {name} ({office_level})")

        contributions = self.search_contributions(
            candidate_last_name=last_name,
            candidate_first_name=first_name,
            office=office,
        )

        if not contributions:
            return None

        self.stats["politicians_scraped"] += 1

        # Use the VoterFocus aggregation logic
        vf = VoterFocusScraper()
        aggregated = vf.aggregate_contributions(contributions)

        if aggregated["total_funds"] > 0:
            self.stats["politicians_with_data"] += 1
            self.stats["total_contributions"] += len(contributions)

        return {
            "total_funds": aggregated["total_funds"],
            "top5_donors": aggregated["top5_donors"],
            "aipac_funding": aggregated["israel_lobby_total"],
            "israel_lobby_total": aggregated["israel_lobby_total"],
            "data_source": "fldoe",
        }


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------


def run_voterfocus(
    counties: List[str],
    dry_run: bool = False,
    max_elections: int = 3,
) -> Dict[str, Dict[str, Any]]:
    """Run VoterFocus scraper for specified counties."""
    scraper = VoterFocusScraper()

    # Get all non-federal, non-state politicians from Supabase
    county_levels = [
        "County Commissioner",
        "School Board",
        "Mayor",
        "City Commissioner",
        "Sheriff",
        "Supervisor of Elections",
        "Property Appraiser",
        "Tax Collector",
        "Clerk of Court",
        "Soil & Water",
        "Judge",
    ]
    politicians = supabase_get_politicians(county_levels)
    logger.info(
        f"Fetched {len(politicians)} county-level politicians to match against"
    )

    all_results = {}

    for county_code in counties:
        if county_code not in COUNTIES:
            logger.warning(f"Unknown county: {county_code}")
            continue

        results = scraper.scrape_county(
            county_code, politicians, max_elections=max_elections
        )
        all_results.update(results)

        # Polite delay between counties
        time.sleep(2)

    # Push to Supabase
    if not dry_run and all_results:
        logger.info(f"\nPushing {len(all_results)} results to Supabase...")
        success = 0
        for bioguide_id, data in all_results.items():
            if supabase_update_politician_funding(bioguide_id, data):
                success += 1
            time.sleep(0.3)
        logger.info(f"Updated {success}/{len(all_results)} politicians in Supabase")

    # Print summary
    logger.info("")
    logger.info("=" * 60)
    logger.info("  VOTERFOCUS SCRAPE SUMMARY")
    logger.info("=" * 60)
    logger.info(f"  Counties scraped:      {scraper.stats['counties_scraped']}")
    logger.info(f"  Candidates found:      {scraper.stats['candidates_found']}")
    logger.info(f"  Candidates matched:    {scraper.stats['candidates_matched']}")
    logger.info(f"  With contribution data:{scraper.stats['candidates_with_data']}")
    logger.info(f"  Total contributions:   {scraper.stats['total_contributions']}")
    if scraper.stats["errors"]:
        logger.info(f"  Errors:                {len(scraper.stats['errors'])}")

    return all_results


def run_fldoe(
    dry_run: bool = False,
) -> Dict[str, Dict[str, Any]]:
    """Run FL Division of Elections scraper for state-level politicians."""
    scraper = FLDOEScraper()

    # Get state-level politicians
    state_levels = ["State Senator", "State Representative", "Governor", "State Attorney", "Public Defender"]
    politicians = supabase_get_politicians(state_levels)

    # Skip politicians that already have data from FEC (shouldn't happen for state)
    # or from a previous FLDOE run
    politicians_to_scrape = [
        p for p in politicians
        if not p.get("total_funds") or p.get("data_source") != "fldoe"
    ]

    logger.info(
        f"Scraping FLDOE for {len(politicians_to_scrape)} state-level politicians "
        f"(skipping {len(politicians) - len(politicians_to_scrape)} with existing data)"
    )

    all_results = {}
    for i, pol in enumerate(politicians_to_scrape):
        result = scraper.scrape_politician(pol)
        if result and result["total_funds"] > 0:
            all_results[pol["bioguide_id"]] = result
            logger.info(
                f"  [{i+1}/{len(politicians_to_scrape)}] {pol['name']}: "
                f"${result['total_funds']:,.2f} from "
                f"{len(result['top5_donors'])} top donors"
            )
        else:
            logger.info(
                f"  [{i+1}/{len(politicians_to_scrape)}] {pol['name']}: "
                f"No data found"
            )

        # Rate limit: FLDOE CGI is slow, be polite
        time.sleep(2)

    # Push to Supabase
    if not dry_run and all_results:
        logger.info(f"\nPushing {len(all_results)} results to Supabase...")
        success = 0
        for bioguide_id, data in all_results.items():
            if supabase_update_politician_funding(bioguide_id, data):
                success += 1
            time.sleep(0.3)
        logger.info(f"Updated {success}/{len(all_results)} politicians in Supabase")

    # Print summary
    logger.info("")
    logger.info("=" * 60)
    logger.info("  FLDOE SCRAPE SUMMARY")
    logger.info("=" * 60)
    logger.info(f"  Politicians scraped:    {scraper.stats['politicians_scraped']}")
    logger.info(f"  With contribution data: {scraper.stats['politicians_with_data']}")
    logger.info(f"  Total contributions:    {scraper.stats['total_contributions']}")
    if scraper.stats["errors"]:
        logger.info(f"  Errors:                 {len(scraper.stats['errors'])}")

    return all_results


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(
        description="Snitched.ai Campaign Finance Scraper"
    )
    parser.add_argument(
        "--source",
        choices=["voterfocus", "fldoe", "all"],
        default="all",
        help="Data source to scrape (default: all)",
    )
    parser.add_argument(
        "--county",
        type=str,
        default=None,
        help="Specific county to scrape (e.g., volusia). Default: all counties.",
    )
    parser.add_argument(
        "--max-elections",
        type=int,
        default=3,
        help="Max elections to scan per county (default: 3)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Don't push to Supabase, just scrape and report",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Output JSON file path (default: data-ingestion/campaign-finance.json)",
    )

    args = parser.parse_args()
    start_time = datetime.now()

    output_path = Path(
        args.output or str(DATA_DIR / "campaign-finance.json")
    )

    all_results = {}

    # VoterFocus (county-level)
    if args.source in ("voterfocus", "all"):
        counties = (
            [args.county]
            if args.county
            else list(COUNTIES.keys())
        )
        vf_results = run_voterfocus(
            counties,
            dry_run=args.dry_run,
            max_elections=args.max_elections,
        )
        all_results.update(vf_results)

    # FL Division of Elections (state-level)
    if args.source in ("fldoe", "all"):
        fldoe_results = run_fldoe(dry_run=args.dry_run)
        all_results.update(fldoe_results)

    # Save to JSON
    output_data = {
        "scraped_at": datetime.now().isoformat(),
        "source": args.source,
        "duration_seconds": (datetime.now() - start_time).total_seconds(),
        "total_politicians_updated": len(all_results),
        "results": {
            bid: data for bid, data in all_results.items()
        },
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(output_data, f, indent=2, default=str)
    logger.info(f"\nSaved results to {output_path}")

    duration = (datetime.now() - start_time).total_seconds()
    logger.info(f"Total duration: {duration:.1f}s")
    logger.info(f"Politicians with funding data: {len(all_results)}")


if __name__ == "__main__":
    main()

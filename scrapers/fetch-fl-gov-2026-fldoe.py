#!/usr/bin/env python3
"""
Targeted FL DOE campaign-finance scrape for FL 2026 Gubernatorial candidates.

Candidates:
  - Byron Donalds  (R, trump-endorsed frontrunner)
  - James Fishback (R, hedge-fund founder - refresh existing)
  - Jay Collins    (R, current Lt. Gov., former state senator)

Reuses scrape_contributions_playwright() from fl-doe-scraper.py. Writes
per-candidate results to data-ingestion/*-fldoe-2026.json.

Usage:
    python3 scrapers/fetch-fl-gov-2026-fldoe.py
    python3 scrapers/fetch-fl-gov-2026-fldoe.py --only donalds
"""

import argparse
import importlib.util
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

HERE = Path(__file__).parent
SCRAPER_PATH = HERE / "fl-doe-scraper.py"
OUT_DIR = HERE.parent / "data-ingestion"


def _load_fl_doe_module() -> Any:
    spec = importlib.util.spec_from_file_location("fl_doe_scraper", str(SCRAPER_PATH))
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules["fl_doe_scraper"] = mod
    spec.loader.exec_module(mod)
    return mod


# (key, display_name, last_name, first_name) — FL DOE uses startswith matching
# on both name fields; we also post-filter by REP and GOV in candidate label.
CANDIDATES = [
    {
        "key": "donalds",
        "name": "Byron Donalds",
        "out": "donalds-fldoe-2026.json",
    },
    {
        "key": "fishback",
        "name": "James Fishback",
        "out": "fishback-fldoe-2026.json",
    },
    {
        "key": "jay-collins",
        "name": "Jay Collins",
        "out": "jay-collins-fldoe-2026.json",
    },
]


def _summarize(contribs: list[dict]) -> dict[str, Any]:
    """Produce a human-readable summary block (no israel-lobby dedup here;
    cross-ref step does HIGH-CONFIDENCE matching against the registry)."""
    total = sum(float(c.get("amount", 0) or 0) for c in contribs)
    by_type: dict[str, float] = {}
    for c in contribs:
        t = (c.get("type") or "").upper()
        by_type[t] = by_type.get(t, 0) + float(c.get("amount", 0) or 0)

    donor_totals: dict[str, float] = {}
    for c in contribs:
        nm = (c.get("contributor_name") or "").strip()
        if not nm:
            continue
        donor_totals[nm] = donor_totals.get(nm, 0) + float(c.get("amount", 0) or 0)

    top = sorted(donor_totals.items(), key=lambda kv: kv[1], reverse=True)[:10]

    return {
        "total_raised": round(total, 2),
        "contribution_count": len(contribs),
        "unique_donors": len(donor_totals),
        "type_breakdown": {k: round(v, 2) for k, v in by_type.items()},
        "top_10_donors": [{"name": n, "amount": round(a, 2)} for n, a in top],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="FL DOE 2026 Gov candidate scrape")
    parser.add_argument(
        "--only",
        help="Comma-separated list of candidate keys: donalds,fishback,jay-collins",
    )
    args = parser.parse_args()

    only_keys = set((args.only or "").split(",")) if args.only else None
    targets = [c for c in CANDIDATES if not only_keys or c["key"] in only_keys]

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("Install playwright: pip install playwright && playwright install chromium")
        return 1

    fl_doe = _load_fl_doe_module()
    fl_doe._load_dotenv()

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ua = (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36"
        )

        for cand in targets:
            print("\n" + "=" * 70)
            print(f"  Scraping FL DOE for: {cand['name']} (key={cand['key']})")
            print("=" * 70)
            ctx = browser.new_context(user_agent=ua)
            page = ctx.new_page()
            try:
                contribs = fl_doe.scrape_contributions_playwright(
                    page=page,
                    name=cand["name"],
                    office_code="All",  # Governor race -> "All"
                    max_retries=3,
                )
            finally:
                page.close()
                ctx.close()

            # Filter to GOV race only (FL DOE may return prior races)
            gov_only = [
                c for c in contribs
                if "(GOV)" in (c.get("candidate") or "").upper()
            ]
            print(f"\n  Raw results: {len(contribs)}  After GOV filter: {len(gov_only)}")

            summary = _summarize(gov_only)
            payload = {
                "candidate_key": cand["key"],
                "candidate_name": cand["name"],
                "scraped_at": datetime.now(timezone.utc).isoformat(),
                "source": "https://dos.elections.myflorida.com/campaign-finance/contributions/",
                "office_filter": "GOV (2026 cycle)",
                "summary": summary,
                "contributions": gov_only,
            }
            out_path = OUT_DIR / cand["out"]
            out_path.write_text(json.dumps(payload, indent=2))
            print(f"  Wrote {out_path}")
            print(f"  Total raised: ${summary['total_raised']:,.2f}")
            print(f"  Unique donors: {summary['unique_donors']}")
            if summary["top_10_donors"]:
                print("  Top 5 donors:")
                for d in summary["top_10_donors"][:5]:
                    print(f"    ${d['amount']:>12,.2f}  {d['name']}")

        browser.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())

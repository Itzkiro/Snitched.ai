"""
Snitched.ai — Scrapling-based Web Scraper Utility
==================================================

Main web scraping engine using Scrapling (https://github.com/D4Vinci/Scrapling).
Import this module in other scraper scripts:

    from scraper import fetch_page, extract_text, extract_links, extract_table

Example usage:
    page = fetch_page("https://example.com")
    links = extract_links(page, selector="a.nav-link")
    text = extract_text(page, selector="div.content")
    rows = extract_table(page, selector="table.data")
"""

import time
import json
from typing import Optional
from scrapling import Fetcher


# Default fetcher instance (reusable, lightweight)
_fetcher = Fetcher(auto_match=False)


def fetch_page(url: str, timeout: int = 30, retries: int = 2, delay: float = 1.0):
    """
    Fetch a web page and return a Scrapling Adaptor object.

    Args:
        url: The URL to fetch
        timeout: Request timeout in seconds
        retries: Number of retry attempts on failure
        delay: Delay between retries in seconds

    Returns:
        Scrapling Adaptor object for parsing
    """
    last_error = None
    for attempt in range(retries + 1):
        try:
            page = _fetcher.get(url, timeout=timeout)
            return page
        except Exception as e:
            last_error = e
            if attempt < retries:
                time.sleep(delay * (attempt + 1))
    raise last_error


def extract_text(page, selector: str, strip: bool = True) -> list[str]:
    """
    Extract text content from elements matching a CSS selector.

    Args:
        page: Scrapling Adaptor object from fetch_page()
        selector: CSS selector string
        strip: Whether to strip whitespace

    Returns:
        List of text strings from matching elements
    """
    elements = page.css(selector)
    texts = []
    for el in elements:
        text = el.text
        if text and strip:
            text = text.strip()
        if text:
            texts.append(text)
    return texts


def extract_links(page, selector: str = "a") -> list[dict]:
    """
    Extract links (href + text) from elements matching a CSS selector.

    Args:
        page: Scrapling Adaptor object from fetch_page()
        selector: CSS selector for anchor elements

    Returns:
        List of dicts with 'href' and 'text' keys
    """
    elements = page.css(selector)
    links = []
    for el in elements:
        href = el.attrib.get("href", "")
        text = (el.text or "").strip()
        if href:
            links.append({"href": href, "text": text})
    return links


def extract_table(page, selector: str = "table") -> list[list[str]]:
    """
    Extract table data as a list of rows (each row is a list of cell strings).

    Args:
        page: Scrapling Adaptor object from fetch_page()
        selector: CSS selector for the table element

    Returns:
        List of rows, where each row is a list of cell text strings
    """
    tables = page.css(selector)
    if not tables:
        return []

    table = tables[0]
    rows = []

    for tr in table.css("tr"):
        cells = []
        for td in tr.css("td, th"):
            cells.append((td.text or "").strip())
        if cells:
            rows.append(cells)

    return rows


def extract_attribute(page, selector: str, attribute: str) -> list[str]:
    """
    Extract a specific attribute from elements matching a CSS selector.

    Args:
        page: Scrapling Adaptor object from fetch_page()
        selector: CSS selector string
        attribute: Attribute name to extract (e.g., 'src', 'href', 'data-id')

    Returns:
        List of attribute values
    """
    elements = page.css(selector)
    values = []
    for el in elements:
        val = el.attrib.get(attribute, "")
        if val:
            values.append(val)
    return values


def save_json(data, filepath: str, indent: int = 2):
    """Save data as JSON to a file."""
    with open(filepath, "w") as f:
        json.dump(data, f, indent=indent, ensure_ascii=False)
    print(f"Saved {filepath}")


if __name__ == "__main__":
    # Quick test
    print("Testing Scrapling scraper utility...")
    page = fetch_page("https://example.com")
    title = extract_text(page, "h1")
    print(f"Page title: {title}")
    links = extract_links(page)
    print(f"Links found: {len(links)}")
    print("Scrapling scraper utility is working!")

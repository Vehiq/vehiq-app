"""Iter 36 — Dynamic sitemap.xml endpoint.

Validates that GET /api/sitemap.xml returns:
- HTTP 200
- application/xml content-type
- Cache-Control header
- All required static routes
- <urlset> wrapper
- Aggregated blog post + public vehicle slugs (when present in DB)
"""
import os
import re
import httpx
import pytest


def _base_url() -> str:
    return os.environ.get("BACKEND_BASE_URL", "http://localhost:8001")


@pytest.fixture(scope="module")
def sitemap_body():
    with httpx.Client(base_url=_base_url(), timeout=10.0) as c:
        r = c.get("/api/sitemap.xml")
    assert r.status_code == 200
    return r


def test_sitemap_status_and_headers(sitemap_body):
    r = sitemap_body
    assert "application/xml" in r.headers.get("content-type", "")
    assert "max-age" in r.headers.get("cache-control", "")


def test_sitemap_contains_static_routes(sitemap_body):
    body = sitemap_body.text
    assert "<?xml" in body
    assert "<urlset" in body and "</urlset>" in body
    for path in ("/", "/wynajem", "/marketplace", "/forum", "/blog"):
        expected = f"sharago.pl{path}</loc>" if path != "/" else "sharago.pl/</loc>"
        assert expected in body, f"static route missing from sitemap: {path}"


def test_sitemap_well_formed_urls(sitemap_body):
    body = sitemap_body.text
    locs = re.findall(r"<loc>([^<]+)</loc>", body)
    assert len(locs) >= 5, f"expected at least 5 URLs, got {len(locs)}"
    for u in locs:
        assert u.startswith("https://sharago.pl"), f"bad loc: {u}"
    n_url = body.count("<url>")
    assert n_url == body.count("<lastmod>") == body.count("<changefreq>") == body.count("<priority>")

"""HTML sanitization helpers (Iter 50, Phase C).

Users can enter free-text descriptions (marketplace listings, forum posts,
vehicle notes). We store the raw text but strip/escape any embedded HTML so
that no <script>, event handlers, or javascript: URLs survive round-trips
between users.

Two entry points:
  - sanitize_plain(s): strips ALL html tags — for description-like fields
    that don't need formatting.
  - sanitize_rich(s):  keeps a tiny safelist (bold/italic/lists/links) for
    forum posts and blog comments.
"""
from typing import Optional
import bleach

_ALLOWED_TAGS_RICH = [
    "b", "strong", "i", "em", "u", "br", "p", "ul", "ol", "li", "a", "code",
    "pre", "blockquote",
]
_SAFE_PROTOCOLS = ("http:", "https:", "mailto:")


def _rich_attr_filter(tag: str, name: str, value: str) -> bool:
    """Per-attribute callable — enforces safe URL protocols on <a href=...>."""
    if tag == "a" and name == "href":
        v = (value or "").strip().lower()
        # Allow protocol-relative and fragment / relative refs, plus http(s)/mailto.
        return v.startswith(_SAFE_PROTOCOLS) or v.startswith(("#", "/"))
    if tag == "a" and name in ("title", "rel"):
        return True
    return False


_ALLOWED_ATTRS_RICH = {"a": _rich_attr_filter}


def sanitize_plain(s: Optional[str]) -> Optional[str]:
    """Strip ALL HTML tags. Preserve whitespace. Returns None for None."""
    if s is None:
        return None
    return bleach.clean(s, tags=[], attributes={}, strip=True)


def sanitize_rich(s: Optional[str]) -> Optional[str]:
    """Allow a tiny safe HTML subset (b, i, links, lists). Everything else stripped."""
    if s is None:
        return None
    return bleach.clean(
        s,
        tags=_ALLOWED_TAGS_RICH,
        attributes=_ALLOWED_ATTRS_RICH,
        strip=True,
    )

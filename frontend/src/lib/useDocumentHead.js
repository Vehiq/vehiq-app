import { useEffect } from "react";

/**
 * Lightweight imperative head-tag manager.
 *
 * react-helmet-async@2 has incomplete tag propagation on React 19 (only <title>
 * reliably updates; <link rel="canonical"> and og:* meta tags fail to mount).
 * Since this is an SPA with no SSR, we just mutate document.head directly.
 *
 * Each tag is upserted via a stable data-vehiq-head="<key>" marker so reloads
 * replace, not duplicate. Returning from the effect does NOT remove tags —
 * they get overwritten on the next route's call. That matches Helmet's UX
 * (no flash of empty head between routes).
 *
 * Usage:
 *   useDocumentHead({
 *     title: "Page title",
 *     description: "...",
 *     canonical: "https://sharago.pl/blog/foo",
 *     ogImage: "https://...",
 *     ogType: "article",
 *   });
 */
function upsertMeta(attr, value, content) {
  let el = document.head.querySelector(`meta[${attr}="${value}"][data-vehiq-head]`);
  if (!el) {
    el = document.head.querySelector(`meta[${attr}="${value}"]`);
    if (el) {
      el.setAttribute("data-vehiq-head", value);
    } else {
      el = document.createElement("meta");
      el.setAttribute(attr, value);
      el.setAttribute("data-vehiq-head", value);
      document.head.appendChild(el);
    }
  }
  el.setAttribute("content", content);
}

function upsertLink(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"][data-vehiq-head]`);
  if (!el) {
    el = document.head.querySelector(`link[rel="${rel}"]`);
    if (el) {
      el.setAttribute("data-vehiq-head", rel);
    } else {
      el = document.createElement("link");
      el.setAttribute("rel", rel);
      el.setAttribute("data-vehiq-head", rel);
      document.head.appendChild(el);
    }
  }
  el.setAttribute("href", href);
}

export default function useDocumentHead({
  title,
  description,
  canonical,
  ogTitle,
  ogDescription,
  ogImage,
  ogUrl,
  ogType = "website",
  twitterCard = "summary_large_image",
  rssFeed,
  rssTitle,
  jsonLd,
} = {}) {
  useEffect(() => {
    if (title) document.title = title;
    if (description) upsertMeta("name", "description", description);
    if (canonical) upsertLink("canonical", canonical);
    if (ogTitle || title) upsertMeta("property", "og:title", ogTitle || title);
    if (ogDescription || description) upsertMeta("property", "og:description", ogDescription || description);
    if (ogUrl || canonical) upsertMeta("property", "og:url", ogUrl || canonical);
    if (ogType) upsertMeta("property", "og:type", ogType);
    if (ogImage) upsertMeta("property", "og:image", ogImage);
    if (twitterCard) upsertMeta("name", "twitter:card", twitterCard);
    if (ogTitle || title) upsertMeta("name", "twitter:title", ogTitle || title);
    if (ogDescription || description) upsertMeta("name", "twitter:description", ogDescription || description);
    if (ogImage) upsertMeta("name", "twitter:image", ogImage);

    // RSS auto-discovery — scoped to the page that provides `rssFeed`.
    // Removed on cleanup so other routes don't leak a stale feed link.
    let rssEl = null;
    if (rssFeed) {
      rssEl = document.head.querySelector('link[data-vehiq-rss="true"]');
      if (!rssEl) {
        rssEl = document.createElement("link");
        rssEl.setAttribute("rel", "alternate");
        rssEl.setAttribute("type", "application/rss+xml");
        rssEl.setAttribute("data-vehiq-rss", "true");
        document.head.appendChild(rssEl);
      }
      rssEl.setAttribute("href", rssFeed);
      rssEl.setAttribute("title", rssTitle || "RSS");
    }

    // JSON-LD structured data — scoped to the page that provides `jsonLd`.
    // Removed on cleanup so other routes don't leak stale structured data.
    let jsonLdEl = null;
    if (jsonLd) {
      jsonLdEl = document.createElement("script");
      jsonLdEl.setAttribute("type", "application/ld+json");
      jsonLdEl.setAttribute("data-vehiq-jsonld", "true");
      jsonLdEl.textContent = typeof jsonLd === "string" ? jsonLd : JSON.stringify(jsonLd);
      document.head.appendChild(jsonLdEl);
    }

    return () => {
      if (rssEl && rssEl.parentNode) {
        rssEl.parentNode.removeChild(rssEl);
      }
      if (jsonLdEl && jsonLdEl.parentNode) {
        jsonLdEl.parentNode.removeChild(jsonLdEl);
      }
    };
  }, [title, description, canonical, ogTitle, ogDescription, ogImage, ogUrl, ogType, twitterCard, rssFeed, rssTitle, jsonLd]);
}

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
 *     canonical: "https://vehiq.pl/blog/foo",
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
  }, [title, description, canonical, ogTitle, ogDescription, ogImage, ogUrl, ogType, twitterCard]);
}

// Vercel Routing Middleware: per-URL meta tags + hreflang (sharago.pl PL, sharago.com EN), <html lang> per host, real 404 status.
import { ROUTES, ADMIN_PREFIX, findRoute } from "./src/routes/paths.js";
import { pageSeo, blogPostSeo, DEFAULT_OG_IMAGE, DEFAULT_OG_IMAGE_EN } from "./src/seo/pages.js";

export const config = {
  matcher: ["/((?!api/|assets/|.*\\..*).*)", "/robots.txt"],
};

const HOSTS = { "sharago.pl": "pl", "sharago.com": "en" };
const API_TIMEOUT_MS = 2500;
const ROBOTS_EN = "User-agent: *\nAllow: /\n\nSitemap: https://sharago.com/sitemap.xml\n";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function apiStatus(path) {
  const base = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
  if (!base) return { status: 0, data: null };
  try {
    const r = await fetch(`${base}/api${path}`, { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    return { status: r.status, data: r.ok ? await r.json() : null };
  } catch {
    return { status: 0, data: null };
  }
}

export function applyHead(html, { lang, seo, noindex }) {
  let out = html.replace(/<html lang="[^"]*"/, `<html lang="${lang}"`);
  if (seo) {
    out = out
      .replace(/<title>[\s\S]*?<\/title>\s*/, "")
      .replace(/<meta name="(?:title|description)"[^>]*>\s*/g, "")
      .replace(/<meta property="og:(?:url|title|description|image|type)"[^>]*>\s*/g, "")
      .replace(/<meta name="twitter:[^"]+"[^>]*>\s*/g, "")
      .replace(/<link rel="canonical"[^>]*>\s*/g, "")
      .replace(/<link rel="alternate" hreflang="[^"]*"[^>]*>\s*/g, "")
      .replace(/<meta property="og:locale" content="[^"]*"/, `<meta property="og:locale" content="${seo.locale}"`);
    if (seo.image !== DEFAULT_OG_IMAGE && seo.image !== DEFAULT_OG_IMAGE_EN) out = out.replace(/<meta property="og:image:(?:width|height)"[^>]*>\s*/g, "");
    const ogTitle = seo.ogTitle || seo.title;
    const tags = [
      `<title>${esc(seo.title)}</title>`,
      `<meta name="description" content="${esc(seo.description)}" />`,
      `<link rel="canonical" href="${esc(seo.url)}" />`,
      `<meta property="og:type" content="${esc(seo.type)}" />`,
      `<meta property="og:url" content="${esc(seo.url)}" />`,
      `<meta property="og:title" content="${esc(ogTitle)}" />`,
      `<meta property="og:description" content="${esc(seo.description)}" />`,
      `<meta property="og:image" content="${esc(seo.image)}" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${esc(ogTitle)}" />`,
      `<meta name="twitter:description" content="${esc(seo.description)}" />`,
      `<meta name="twitter:image" content="${esc(seo.image)}" />`,
      ...seo.alternates.map((a) => `<link rel="alternate" hreflang="${a.hreflang}" href="${esc(a.href)}" />`),
    ];
    out = out.replace("</head>", `    ${tags.join("\n    ")}\n  </head>`);
  }
  if (noindex) out = out.replace("</head>", `    <meta name="robots" content="${noindex}" />\n  </head>`);
  return out;
}

// Returns { status, seo } for a path in the host's language.
export async function resolvePage(pathname, lang) {
  const route = findRoute(pathname);
  if (!route) return { status: 404, seo: null };
  if (route.pattern === ROUTES.blogPost) {
    const { status, data } = await apiStatus(`/blog/${encodeURIComponent(route.params.slug)}`);
    if (status === 404) return { status: 404, seo: null };
    return { status: 200, seo: blogPostSeo(route.params.slug, data, lang) };
  }
  if (route.pattern === ROUTES.legal) {
    const { status } = await apiStatus(`/legal/${encodeURIComponent(route.params.slug)}`);
    return { status: status === 404 ? 404 : 200, seo: null };
  }
  const path = pathname.replace(/\/+$/, "") || "/";
  return { status: 200, seo: pageSeo(path.toLowerCase(), lang) };
}

export default async function middleware(request) {
  if (request.method !== "GET" && request.method !== "HEAD") return;
  const url = new URL(request.url);
  const lang = HOSTS[url.hostname];
  if (!lang) return;
  if (url.pathname === "/robots.txt") {
    if (lang !== "en") return;
    return new Response(ROBOTS_EN, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
  }

  const isAdmin = url.pathname.toLowerCase().startsWith(ADMIN_PREFIX);
  const { status, seo } = isAdmin ? { status: 200, seo: null } : await resolvePage(url.pathname, lang);
  if (lang === "pl" && status === 200 && !seo && !isAdmin) return;
  const robots = isAdmin ? "noindex, nofollow" : status === 404 ? "noindex" : "";

  const indexRes = await fetch(new URL("/index.html", url.origin));
  if (!indexRes.ok) return;
  const html = applyHead(await indexRes.text(), { lang, seo, noindex: robots });
  const headers = {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "public, max-age=0, must-revalidate",
  };
  if (robots) headers["x-robots-tag"] = robots;
  return new Response(request.method === "HEAD" ? null : html, { status, headers });
}

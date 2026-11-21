import fs from "node:fs";
process.env.REACT_APP_BACKEND_URL = process.env.API;
const mw = (await import("/app/frontend/middleware.js")).default;
const indexHtml = fs.readFileSync("/app/frontend/index.html", "utf8");
const realFetch = globalThis.fetch;
globalThis.fetch = (u, o) => String(u).endsWith("/index.html") ? Promise.resolve(new Response(indexHtml, { status: 200 })) : realFetch(u, o);
const paths = process.argv.slice(2);
for (const full of paths) {
  const r = await mw(new Request(full, { headers: { "user-agent": "facebookexternalhit/1.1" } }));
  if (!r) { console.log(`\n### ${full} -> passthrough (index.html z SPA, status 200)`); continue; }
  const html = await r.text();
  console.log(`\n### ${full} -> HTTP ${r.status}`);
  console.log(html.split("\n").filter(l => /og:|canonical|hreflang|<title|<html|robots|twitter:|name="description"/.test(l)).map(l => l.trim()).join("\n"));
}

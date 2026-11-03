// FirstAmen blog builder.
// Reads every published article from the HeyCatch API and writes one real HTML page per article
// (plus the blog index, sitemap and 404 page) into _site/. GitHub Actions runs this every ~15 minutes
// and publishes _site/, so new articles appear on their own with no redeploy.
import fs from 'node:fs/promises';
import path from 'node:path';
import sanitizeHtml from 'sanitize-html';
import * as cheerio from 'cheerio';

// ---- settings ----------------------------------------------------------------------------
// HeyCatch blog key: publishable (read-only, this site's published articles only), safe in source.
const KEY = process.env.HEYCATCH_API_KEY || 'hck_lv_a5d1bea2c0ff7f9530cdba1f';
const API = (process.env.HEYCATCH_API_BASE || 'https://api.heycatch.ai/v1').replace(/\/$/, '');
// Where this blog is served. When you move it to your own domain, change this one line
// (for example 'https://blog.repdbylove.com') and every canonical link and the sitemap follow.
const BASE_URL = (process.env.BASE_URL || 'https://repdbyloveclothing-netizen.github.io/firstamen-blog').replace(/\/$/, '');
const SITE_LANG = 'en';
const OUT = process.env.OUT_DIR || '_site';
const BASE_PATH = new URL(BASE_URL).pathname.replace(/\/$/, ''); // '/firstamen-blog' or ''
const PLAY = 'https://play.google.com/store/apps/details?id=com.rork.firstamen';
const SITE = 'https://repdbylove.com';
// Google Search Console ownership check (shown in the page head so Google can verify the site).
const GOOGLE_VERIFY = 'F7BWcUdsvUYeFd7PT_M83cKnotfcooED19_10rigQtA';

const CSS = `
:root{--ink:#14100F;--soft:#5E5A62;--pink:#C73F67;--gold:#8C6420;--nav:#F0F7FF;--card:#FDFEFF;--pale:#E8F1FD}
*{box-sizing:border-box}
html,body{margin:0}
body{font-family:Poppins,system-ui,sans-serif;-webkit-font-smoothing:antialiased;line-height:1.6;color:var(--ink);background:linear-gradient(180deg,#B8DCF6 0%,#C9DFF6 20%,#D7E2F4 42%,#D9D6EE 70%,#F0D3E6 100%);min-height:100vh;position:relative;overflow-x:hidden;display:flex;flex-direction:column}
a:focus-visible,button:focus-visible{outline:3px solid #7D5BE8;outline-offset:3px;border-radius:8px}
.skies{position:absolute;left:0;right:0;top:0;bottom:0;overflow:hidden;pointer-events:none;z-index:0}
.cl{position:absolute;background:rgba(255,255,255,.7);border-radius:99px;filter:blur(14px);pointer-events:none}
nav.site{background:var(--nav);display:flex;align-items:center;gap:26px;padding:14px 40px;font-size:15px;font-weight:500;position:relative;z-index:2;overflow-x:auto;white-space:nowrap}
.links{display:flex;align-items:center;gap:30px;margin-left:auto;padding-left:24px;flex:none}
nav.site img{height:44px;margin-right:6px;display:block}
nav.site a{color:var(--ink);text-decoration:none;flex:none}
nav.site a:hover{color:var(--pink)}
nav.site a.on{color:var(--pink);font-weight:700}
.eyebrow{font-size:13px;letter-spacing:.18em;text-transform:uppercase;font-weight:500;color:var(--gold)}
.hl{color:var(--pink)}
.card{background:var(--card);border-radius:32px;box-shadow:0 20px 44px rgba(90,120,180,.20)}
.btn{display:inline-block;background:var(--ink);color:#fff;font:700 15px Poppins,system-ui,sans-serif;border-radius:99px;padding:13px 28px;text-decoration:none;border:0;cursor:pointer}
.btn2{display:inline-block;background:#fff;color:var(--ink);border:2px solid var(--ink);font-weight:700;font-size:15px;border-radius:99px;padding:11px 26px;text-decoration:none}
.meta{color:var(--soft);font-weight:500;font-size:15px}
.chip{display:inline-block;background:var(--ink);color:#fff;font-size:12px;font-weight:700;letter-spacing:.04em;border-radius:99px;padding:3px 12px}
.back{display:inline-block;font-weight:700;color:var(--ink);text-decoration:none;background:#fff;border-radius:99px;padding:8px 20px;font-size:14px;box-shadow:0 8px 20px rgba(90,120,180,.18)}
.cols{width:100%;flex:1 0 auto;max-width:1060px;margin:0 auto;padding:60px 32px 80px;display:grid;grid-template-columns:320px minmax(0,1fr);gap:48px;position:relative;z-index:1}
.cols-article{grid-template-columns:260px minmax(0,1fr)}
.side{align-self:start;position:sticky;top:24px}
.side h1{font-size:50px;letter-spacing:-.035em;line-height:1.04;margin:10px 0 14px;font-weight:700}
.side p{color:var(--soft);font-size:17px;margin:0 0 24px}
.btns{display:flex;flex-direction:column;gap:12px;align-items:flex-start}
.entry{display:block;padding:26px 30px;margin-bottom:18px;text-decoration:none;color:var(--ink);transition:transform .15s}
.entry:hover{transform:translateY(-2px)}
.entry b{display:block;font-size:22px;letter-spacing:-.015em;line-height:1.22;margin:8px 0}
.more{margin-top:6px}
.notice{padding:28px 30px;color:var(--soft)}.notice b{color:var(--ink);font-size:20px}
.toc2{margin-top:20px;padding:22px 24px}
.toc2 h2{font-size:16px;margin:0 0 10px}
.toc2 a{display:block;color:var(--ink);text-decoration:none;font-size:14px;padding:7px 0;border-top:1px solid #DCE6F4;line-height:1.35}
.toc2 a:first-of-type{border-top:0}.toc2 a:hover{color:var(--pink)}
.artcol{padding:44px 48px 36px}
.artcol h1{font-size:46px;letter-spacing:-.03em;line-height:1.08;margin:10px 0 10px;font-weight:700}
.ameta{margin:0 0 26px}
.body h2{font-size:28px;margin:1.7em 0 .5em;letter-spacing:-.02em;line-height:1.2;font-weight:700}
.body h3{font-size:20px;margin:1.4em 0 .3em;font-weight:700}
.body h4{font-size:18px;margin:1.2em 0 .3em;font-weight:700}
.body p{margin:0 0 1.1em;font-size:18px;font-weight:400;color:#37323A}
.body ul,.body ol{margin:0 0 1.2em;padding-left:1.4em;font-size:18px;color:#37323A}.body li{margin-bottom:.4em}
.body>h2:first-child{margin-top:0}
.body ul{background:var(--pale);border-radius:24px;padding:20px 26px 20px 46px}
.body .toc ol{background:none;padding:0 0 0 1.2em;margin:0;font-size:16px}
.toc{border:2px solid #D3E2F6;border-radius:24px;padding:16px 26px;margin:0 0 1.6em}
.toc h2{font-size:17px;margin:0 0 6px}
.body a{color:var(--pink);font-weight:500}
.body blockquote{margin:1.6em 0;padding:22px 28px;background:linear-gradient(135deg,#D3E9FB,#F1DAEA);border-radius:24px;font-size:22px;font-weight:700;line-height:1.35}
.body code{background:#EEF2FA;border-radius:6px;padding:2px 6px;font-size:.92em}
.body pre{overflow-x:auto;background:#EEF2FA;border-radius:16px;padding:16px}
.body .tablewrap{overflow-x:auto;margin:0 0 1.2em}
.body table{border-collapse:collapse;width:100%;font-size:16px}
.body th,.body td{border-bottom:1px solid #DCE6F4;padding:10px 12px;text-align:left;vertical-align:top}
[dir=rtl] .body ul,[dir=rtl] .body ol{padding-left:0;padding-right:1.4em}
.toc2{display:block}.toc-inline{display:none}
@media (max-width:899px){
  nav.site{padding:12px 20px;gap:20px}
  .cols,.cols-article{grid-template-columns:minmax(0,1fr);gap:28px;padding:36px 20px 64px}
  .side{position:static}
  .side h1{font-size:40px}
  .toc2{display:none}.toc-inline{display:block}
  .artcol{padding:30px 24px 26px;border-radius:28px}
  .artcol h1{font-size:34px}
  .body p,.body ul,.body ol{font-size:17px}
}
.foot{background:var(--nav);position:relative;z-index:1;margin-top:auto}
.fwrap{max-width:1060px;margin:0 auto;padding:28px 32px 32px;display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap}
.flinks{display:flex;gap:30px;font-size:15px;font-weight:500}
.flinks a{color:var(--ink);text-decoration:none}.flinks a:hover{color:var(--pink)}
.fwrap p{margin:0;font-size:13px;color:var(--soft);text-align:right;line-height:1.5}
@media (max-width:899px){.fwrap{padding:24px 20px 28px;flex-direction:column;align-items:flex-start}.fwrap p{text-align:left}}
@media (prefers-reduced-motion:reduce){.entry{transition:none}}
`;

// ---- helpers -----------------------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtDate = (iso) => {
  const d = new Date(String(iso || '').slice(0, 10) + 'T00:00:00Z');
  return isNaN(d) ? '' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
};
const metaLine = (a) => [fmtDate(a.published || a.published_at), a.read_time ? `${a.read_time} min read` : ''].filter(Boolean).join(' · ');

async function api(route, params = {}, retried = false) {
  const q = new URLSearchParams({ key: KEY, ...params }); // the key is the only credential, as a query parameter
  const res = await fetch(`${API}${route}?${q}`, { signal: AbortSignal.timeout(20000) });
  if (res.status === 429 && !retried) {
    const wait = Math.min(parseInt(res.headers.get('retry-after') || '3', 10) || 3, 30);
    await sleep(wait * 1000);
    return api(route, params, true);
  }
  if (!res.ok) { const e = new Error(`HeyCatch API ${route} answered ${res.status}`); e.status = res.status; throw e; }
  return res.json();
}

async function fetchAll() {
  const all = [];
  for (let offset = 0; ; offset += 50) {
    const r = await api('/articles', { limit: 50, offset });
    const items = r.articles || [];
    all.push(...items);
    if (!items.length || all.length >= (r.total || 0)) break;
  }
  return all;
}

async function pool(items, size, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) { const n = i++; out[n] = await fn(items[n], n); }
  }));
  return out;
}

// ---- article body: sanitise, build the table of contents ---------------------------------
function cleanBody(html) {
  return sanitizeHtml(String(html || ''), {
    allowedTags: ['h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
      'blockquote', 'a', 'strong', 'em', 'code', 'pre', 'br', 'b', 'i', 'hr', 'span'],
    allowedAttributes: { a: ['href'], h2: ['id'], th: ['colspan'], td: ['colspan'] }, // keep the id on h2 for the table of contents
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    transformTags: {
      a: (tag, attribs) => ({ tagName: 'a', attribs: attribs.href && !attribs.href.startsWith('#') && !attribs.href.startsWith('mailto:')
        ? { href: attribs.href, target: '_blank', rel: 'noopener noreferrer' } : attribs }),
    },
  });
}

function buildBody(html) {
  const $ = cheerio.load(`<div id="root">${cleanBody(html)}</div>`, null, false);
  const root = $('#root');
  root.find('table').each((_, t) => { $(t).wrap('<div class="tablewrap"></div>'); });
  // table of contents: every h2 that has an id, except the FAQ (the Key takeaways heading has no id)
  const heads = root.find('h2[id]').toArray().filter((h) => $(h).attr('id') !== 'faq');
  let side = '';
  if (heads.length) {
    const links = heads.map((h) => `<a href="#${esc($(h).attr('id'))}">${esc($(h).text())}</a>`);
    const inline = `<nav class="toc toc-inline" aria-label="Table of contents"><h2>Table of contents</h2><ol>${links.map((l) => `<li>${l}</li>`).join('')}</ol></nav>`;
    const kt = root.find('h2:not([id])').toArray().find((h) => /^\s*key takeaways\s*$/i.test($(h).text()));
    const list = kt ? $(kt).next('ul,ol') : null;
    if (list && list.length) list.after(inline); else root.prepend(inline); // after the takeaways list, else above the article
    side = `<nav class="card toc2" aria-label="Table of contents"><h2>Table of contents</h2>${links.join('')}</nav>`;
  }
  return { html: root.html(), side };
}

// ---- page shell --------------------------------------------------------------------------
const NAV = `<nav class="site" aria-label="Main"><a href="${SITE}/firstamen" aria-label="FirstAmen home"><img src="${BASE_PATH}/assets/firstamen-wordmark.png" alt="FirstAmen" width="112" height="44"></a><div class="links"><a href="${SITE}/firstamen/founder">Founder</a><a class="on" href="${BASE_PATH}/" aria-current="page">Blog</a><a href="${SITE}/firstamen">How it works</a><a href="${SITE}/firstamen">Features</a><a href="${SITE}/firstamen">Pricing</a><a href="${SITE}/firstamen">FAQ</a></div></nav>`;
const FOOT = `<footer class="foot"><div class="fwrap"><div class="flinks"><a href="${SITE}/firstamen">Privacy</a><a href="${SITE}/firstamen">Terms</a><a href="mailto:info@repdbylove.com">Support</a></div><p>FirstAmen by REPDBYLOVE. Made for Android.<br>Google Play is a trademark of Google LLC.</p></div></footer>`;
const SKY = `<div class="skies" aria-hidden="true"><i class="cl" style="left:-60px;top:260px;width:300px;height:90px"></i><i class="cl" style="right:-80px;top:520px;width:340px;height:100px"></i></div>`;

function shell({ title, desc, type, canonical, head = '', cls, main, robots }) {
  return `<!doctype html>
<html lang="${SITE_LANG}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="google-site-verification" content="${GOOGLE_VERIFY}">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${robots ? `<meta name="robots" content="${robots}">\n` : ''}${canonical ? `<link rel="canonical" href="${esc(canonical)}">\n` : ''}<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="${type}">
${canonical ? `<meta property="og:url" content="${esc(canonical)}">\n` : ''}<meta name="twitter:card" content="summary">
<meta name="twitter:description" content="${esc(desc)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;700&display=swap" rel="stylesheet">
<style>${CSS}</style>
${head}</head>
<body>
${NAV}
${SKY}
<main class="cols ${cls}">${main}</main>
${FOOT}
</body>
</html>
`;
}

const intro = `<aside class="side"><div class="eyebrow">Blog</div><h1>Prayer, habits and <span class="hl">mornings.</span></h1><p>Short reads from the FirstAmen team.</p><div class="btns"><a class="btn" href="${PLAY}">Get it on Google Play</a></div></aside>`;

function indexPage(items) {
  const feed = items.length
    ? items.map((a) => `<a class="card entry" href="${BASE_PATH}/${encodeURIComponent(a.slug)}/">${a.read_time ? `<span class="chip">${esc(a.read_time)} MIN</span>` : ''}<b>${esc(a.title)}</b><span class="meta">${esc(fmtDate(a.published || a.published_at))}</span></a>`).join('\n')
    : `<div class="card notice">No articles yet</div>`;
  return shell({
    title: 'FirstAmen Blog', desc: 'Articles from the FirstAmen team about prayer, habits and mornings.', type: 'website',
    canonical: `${BASE_URL}/`, cls: 'cols-index', main: `${intro}<section class="feed">${feed}</section>`,
  });
}

function ldScript(ld, canonical) {
  if (!ld || typeof ld !== 'object' || !Object.keys(ld).length) return '';
  let out = ld;
  if (!Array.isArray(ld) && !ld.url) out = { ...ld, url: canonical, mainEntityOfPage: canonical };
  return `<script type="application/ld+json">${JSON.stringify(out).replace(/</g, '\\u003c')}</script>\n`;
}

function articlePage(a) {
  const canonical = `${BASE_URL}/${encodeURIComponent(a.slug)}/`;
  const { html, side } = buildBody(a.content_html);
  const lang = a.language && a.language !== SITE_LANG ? ` lang="${esc(a.language)}"` : '';
  const rtl = /^(ar|he|fa|ur)(-|$)/i.test(a.language || '') ? ' dir="rtl"' : '';
  return shell({
    title: `${a.title} | FirstAmen Blog`, desc: a.meta_description || '', type: 'article', canonical,
    head: ldScript(a.jsonLd, canonical), cls: 'cols-article',
    main: `<aside class="side"><a class="back" href="${BASE_PATH}/">&larr; All articles</a>${side}</aside>` +
      `<article class="card artcol"${lang}${rtl}><div class="eyebrow">From the blog</div><h1>${esc(a.title)}</h1><p class="meta ameta">${esc(metaLine(a))}</p><div class="body">${html}</div></article>`,
  });
}

function notFoundPage() {
  return shell({
    title: 'Article not found | FirstAmen Blog', desc: 'This article could not be found.', type: 'website', cls: 'cols-article', robots: 'noindex',
    main: `<aside class="side"><a class="back" href="${BASE_PATH}/">&larr; All articles</a></aside><section class="feed"><div class="card notice"><b>Article not found</b><br>We could not find that article. It may have been moved or unpublished.</div></section>`,
  });
}

function sitemap(items) {
  const url = (loc, last) => `  <url><loc>${esc(loc)}</loc>${last ? `<lastmod>${esc(last)}</lastmod>` : ''}</url>`;
  const newest = items.map((a) => String(a.updated || a.published || '').slice(0, 10)).filter(Boolean).sort().pop();
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    [url(`${BASE_URL}/`, newest), ...items.map((a) => url(`${BASE_URL}/${encodeURIComponent(a.slug)}/`, String(a.updated || a.published || '').slice(0, 10)))].join('\n') + `\n</urlset>\n`;
}

// ---- run ---------------------------------------------------------------------------------
const list = await fetchAll(); // a failure here stops the build, so the last good site stays online
const articles = await pool(list, 4, async (item) => (await api(`/articles/${encodeURIComponent(item.slug)}`)).article);

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });
await fs.cp('assets', path.join(OUT, 'assets'), { recursive: true });
await fs.writeFile(path.join(OUT, 'index.html'), indexPage(list));
await fs.writeFile(path.join(OUT, '404.html'), notFoundPage());
await fs.writeFile(path.join(OUT, 'sitemap.xml'), sitemap(articles));
await fs.writeFile(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${BASE_URL}/sitemap.xml\n`);
for (const a of articles) {
  await fs.mkdir(path.join(OUT, a.slug), { recursive: true });
  await fs.writeFile(path.join(OUT, a.slug, 'index.html'), articlePage(a));
}
console.log(`Built ${articles.length} article page(s) + index, sitemap and 404 into ${OUT}/`);

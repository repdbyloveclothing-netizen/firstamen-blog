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
const KEY = process.env.HEYCATCH_API_KEY || 'hck_lv_04c05753d17dd77c9e641ac0';
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
:root{--bg:#12112b;--bg2:#1a1840;--bg3:#1d1a4a;--line:#2c2a5c;--line2:#3a3878;--text:#e9e6f7;--soft:#b9b5da;--body:#dcd8f2;--gold:#f3c76b;--gold2:#ffe0a0;--ink:#1a1740}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
html,body{margin:0}
body{font-family:'DM Sans',system-ui,sans-serif;-webkit-font-smoothing:antialiased;line-height:1.6;color:var(--text);background:var(--bg);min-height:100vh;display:flex;flex-direction:column}
img{max-width:100%}
a{color:var(--gold)}a:hover{color:var(--gold2)}
a:focus-visible,button:focus-visible{outline:3px solid var(--gold);outline-offset:3px;border-radius:8px}
h1,h2,h3,h4{font-family:'Fraunces',Georgia,serif;font-weight:700;margin:0}
.top{background:radial-gradient(ellipse at 50% 0%,#3b2f86 0%,#1d1a4a 45%,#12112b 80%)}
.wrap{max-width:1080px;margin:0 auto;padding-left:20px;padding-right:20px}
.hdr{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;padding-top:22px;padding-bottom:22px}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:#fff;font-family:'Fraunces',Georgia,serif;font-weight:700;font-size:22px}
.brand img{width:36px;height:36px;border-radius:10px}
.nav{display:flex;flex-wrap:wrap;gap:8px 26px}
.nav a{color:#cfcbe8;text-decoration:none;font-size:15px}
.nav a:hover{color:#fff}
.nav a[aria-current]{color:var(--gold)}
.btn{display:inline-block;background:var(--gold);color:var(--ink);text-decoration:none;font-weight:700;padding:16px 30px;border-radius:12px;font-size:16px;border:0}
.btn:hover{background:var(--gold2);color:var(--ink)}
.btn.sm{padding:11px 20px;font-size:14px}
.eyebrow{font-size:14px;letter-spacing:.14em;text-transform:uppercase;font-weight:500;color:var(--gold)}
.hero{text-align:center;padding-top:50px;padding-bottom:70px}
.hero h1{font-size:60px;line-height:1.05;color:#fff;margin:16px 0 0;text-wrap:balance}
.hero p{margin:20px auto 0;font-size:20px;line-height:1.55;color:#cfcbe8;max-width:540px}
.hero .btn{margin-top:30px}
.hl{color:var(--gold)}
.meta{color:var(--soft);font-size:15px}
.chip{display:inline-block;background:var(--line);color:var(--gold);font-size:12px;font-weight:700;letter-spacing:.08em;border-radius:99px;padding:3px 12px}
.back{display:inline-block;font-weight:700;color:var(--gold);text-decoration:none;border:1.5px solid var(--line2);border-radius:12px;padding:9px 18px;font-size:14px}
.back:hover{border-color:var(--gold)}
.cols{width:100%;flex:1 0 auto;max-width:1080px;margin:0 auto;padding:60px 20px 90px}
.feed{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:22px}
.card{background:var(--bg2);border:1px solid var(--line2);border-radius:20px}
.entry{display:block;padding:28px;text-decoration:none;color:var(--text);transition:border-color .15s,transform .15s}
.entry:hover{border-color:var(--gold);transform:translateY(-2px)}
.entry b{display:block;font-family:'Fraunces',Georgia,serif;font-size:23px;line-height:1.22;color:#fff;margin:12px 0 10px}
.notice{padding:28px 30px;color:var(--soft);grid-column:1/-1}.notice b{color:#fff;font-size:20px}
.cols-article{display:grid;grid-template-columns:260px minmax(0,1fr);gap:48px;padding-top:50px}
.side{align-self:start;position:sticky;top:24px}
.toc2{margin-top:20px;padding:22px 24px}
.toc2 h2{font-size:16px;margin:0 0 10px;color:#fff}
.toc2 a{display:block;color:var(--body);text-decoration:none;font-size:14px;padding:7px 0;border-top:1px solid var(--line);line-height:1.35}
.toc2 a:first-of-type{border-top:0}.toc2 a:hover{color:var(--gold)}
.artcol{padding:44px 48px 36px}
.artcol h1{font-size:46px;line-height:1.08;margin:12px 0 10px;color:#fff;text-wrap:balance}
.ameta{margin:0 0 26px}
.body h2{font-size:29px;margin:1.7em 0 .5em;line-height:1.2;color:#fff}
.body h3{font-size:21px;margin:1.4em 0 .3em;color:#fff}
.body h4{font-size:18px;margin:1.2em 0 .3em;color:#fff}
.body p{margin:0 0 1.1em;font-size:18px;color:var(--body);line-height:1.75}
.body ul,.body ol{margin:0 0 1.2em;padding-left:1.4em;font-size:18px;color:var(--body);line-height:1.7}.body li{margin-bottom:.4em}
.body>h2:first-child{margin-top:0}
.body ul{background:var(--bg3);border:1px solid var(--line);border-radius:16px;padding:20px 26px 20px 46px}
.body .toc ol{background:none;padding:0 0 0 1.2em;margin:0;font-size:16px}
.toc{border:1px solid var(--line2);border-radius:16px;padding:16px 26px;margin:0 0 1.6em}
.toc h2{font-size:17px;margin:0 0 6px}
.body a{color:var(--gold);font-weight:500}
.body blockquote{margin:1.6em 0;padding:22px 28px;background:var(--bg3);border-left:3px solid var(--gold);border-radius:12px;font-family:'Fraunces',Georgia,serif;font-size:22px;font-weight:500;line-height:1.4;color:#fff}
.body code{background:#0d0c20;border-radius:6px;padding:2px 6px;font-size:.92em}
.body pre{overflow-x:auto;background:#0d0c20;border-radius:14px;padding:16px}
.body .tablewrap{overflow-x:auto;margin:0 0 1.2em}
.body table{border-collapse:collapse;width:100%;font-size:16px;color:var(--body)}
.body th,.body td{border-bottom:1px solid var(--line);padding:10px 12px;text-align:left;vertical-align:top}
.body th{color:#fff}
[dir=rtl] .body ul,[dir=rtl] .body ol{padding-left:0;padding-right:1.4em}
.toc2{display:block}.toc-inline{display:none}
@media (max-width:899px){
  .hero h1{font-size:42px}
  .cols{padding:36px 20px 64px}
  .cols-article{grid-template-columns:minmax(0,1fr);gap:28px}
  .side{position:static}
  .toc2{display:none}.toc-inline{display:block}
  .artcol{padding:28px 22px 24px}
  .artcol h1{font-size:34px}
  .body p,.body ul,.body ol{font-size:17px}
}
.foot{border-top:1px solid var(--line);background:#0d0c20;margin-top:auto}
.fwrap{max-width:1080px;margin:0 auto;padding:36px 20px;display:flex;align-items:center;justify-content:space-between;gap:20px 40px;flex-wrap:wrap}
.fbrand{margin:0;font-family:'Fraunces',Georgia,serif;font-size:18px;color:#fff}
.fbrand span{font-family:'DM Sans',system-ui,sans-serif;font-size:14px;color:var(--soft)}
.flinks{display:flex;flex-wrap:wrap;gap:8px 22px;font-size:14px}
.flinks a{color:var(--gold);text-decoration:none}.flinks a:hover{text-decoration:underline}
@media (prefers-reduced-motion:reduce){.entry{transition:none}html{scroll-behavior:auto}}
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
const NAV = `<header class="wrap hdr"><a class="brand" href="${SITE}/firstamen"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADgAAAA4CAMAAACfWMssAAAAkFBMVEUZZuP82GMVKpEekvZNVdH44pz9qjz0cmuTO8fcVZmjqNTc4eIrSq9xOdD2nV5YYKxao+SsPbitSLcQG3Gmoaeu0O/0qoiRSMM3PcR1lLdaVXVOLpKFdHCtlXrBPK89SX52wveVwqDBtvL39/n91lD9uDj7l0v9xzr5iFfq6/Uppvr8pUQwOK4lmfcNGG/8548g2NJpAAAAMHRSTlP///////////////////////////////////////////////////////////////9Ppz/1AAAEU0lEQVR42nXVDZuiKhQAYBDNAkKzbGb2895FK7Py//+7PR+gOLt7nmfKhLdzPBAjytvtdrlcxg1E30vZX+eYJhkv+97Jvt+M4whzL7ebK0UC+74v5rld101Td40fYcTNMkJ0I7leEpQdhZz4jW5NRc9wRHgrxZwQXX/FLN2nACmhbBwfY8oAY0KocJribIr4gR3JGXKl7KCmQkY2FbOlPvV9fEp4SJFUyk2RzKZTDnEqWMqOe0tyBWPCUOVU5AKhIErlphAkwSXh4mKIIkgZ5SaBLoHkajHDHJ5PLik3GzfOEBriCIYOFktCkOtinSyKJWMB9aSFapFAXSQpgRVugaMspqKLCT/BOkLYB7hEsTm8Gg73xgLfcxEif6eMPAZDcrMZk67SNp2iK4xY4gFwmrcBbZ41vC4JC5M/bIhHZWYIxf4NXmWExhj7iKFNEWvlBfkTxp4C9KZiZrVHyCllCh11NWYMlXrvdcVu8MasYGzOX6AxOtkAeaiVSqXNisvhAILEvZrA/B3W8aG9Nwjfc0oZK8W9ir9H59w4wgtL3m+PqrKP3Bvta7jM7eNUMASH0y8OzhxXhJghPBk8XaZ99fAary3KAGWYDaWez2f6pdNKAgztRGi9iYtS4BhCCBBnJ8oy3QJSnrIw1SD08WsqHOvnnpZlCuHrOjnPBJThX/geFyE7hLggl01I6WBihqEZ6izEiR5xToiwXE4P2X0P86rBe5vBTviIN7olYQrDL6T7Fqbh3nm9PvwQc1ZyOW/KAMvlTJZfQp2w07Lj8UUXFm99kXOhC0QJN0fXX78t7gWQJUE6xWNryp3Ywas7327fP2qI/yucZKhOYEDhYQdI+fp5qmtVf5xut/N5hlrrWqk7hLoLAJWuXjGO+OH4snecoJSqT7/0rtwBhFetmRFVRwIZHxwZcxvHn0Aj3JUnpZ7PZxyxkOD4EopC0NdkcJ8GIZTS4AjuyHFASkpyjBk5v2BETqldgA1+CA7yYVuO1gqaZm2GXXpl6h6ZUnmAoSrElnoJT6SWeFpaGRsZ1BEhBN+DtkNX7kuruF9UR5aJwIRoCDbh5FUCltCKeXZocnjH7SNUmPq2gujE844Pqu512+Ih2bb/1U9uOX9t+L+wguSwAc+69RiDoTfD9KkWiRmbCF/R1Tzf+9qGC1NT17EFWXjGRjTNLk+cerY+RmXnSwMD3DzKuWsa8dY0mPIrNS1Jh7P1cu1railUC2nefjRbsQX5lje7rxZHav/PCPLQ5PnhcAC43cJ7c2j+dBWeH4nEdcx/HDC2BLcIaXVNOnHIsnadE9e6YccQZK7gZuuHNdQrSP+nc3YzxHv1yuGJsYJwbtEakoiQVsT4Yfg3HCAUpWS45zdOOKRyDWmMUoaM+z3QPd5oB45PUOvAIPgpge33CPdbqnQY1rKlc7LCQ28eqgmiIbhHWA9JeD7CNR7GVXKfat0vED/qwQwrC7Di03mJdoa/AUObHoQhJX9rAAAAAElFTkSuQmCC" alt="" width="36" height="36">FirstAmen</a><nav class="nav" aria-label="Main"><a href="${SITE}/firstamen/founder">Founder</a><a href="${BASE_PATH}/" aria-current="page">Blog</a><a href="${SITE}/firstamen#how">How it works</a><a href="${SITE}/firstamen#features">Features</a><a href="${SITE}/firstamen#pricing">Pricing</a><a href="${SITE}/firstamen#faq">FAQ</a></nav><a class="btn sm" href="${PLAY}">Get it on Google Play</a></header>`;
const FOOT = `<footer class="foot"><div class="fwrap"><p class="fbrand">FirstAmen <span>by REPDBYLOVE</span></p><nav class="flinks" aria-label="Footer"><a href="${SITE}/firstamen/founder">Founder story</a><a href="${SITE}/firstamen/firstamen-privacy">Privacy Policy</a><a href="${SITE}/firstamen/firstamen-terms">Terms</a><a href="${SITE}/firstamen/firstamen-delete">Delete account</a></nav></div></footer>`;

function shell({ title, desc, type, canonical, head = '', cls, main, robots, hero = '' }) {
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
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Fraunces:opsz,wght@9..144,500;9..144,700&display=swap" rel="stylesheet">
<style>${CSS}</style>
<script type="module">
import { analytics } from 'https://esm.sh/@heycatch/sdk@0.8.5';
analytics.init({
  projectKey: 'hck_pk_rZQKDYhERoeO0XV5UW9_2V11-OCbWEyy',
  site: 'landing',
  install: { framework: 'web', agent: 'claude-code' },
});
</script>
${head}</head>
<body>
<div class="top">${NAV}${hero}</div>
<main class="cols ${cls}">${main}</main>
${FOOT}
</body>
</html>
`;
}

const hero = `<section class="wrap hero"><div class="eyebrow">Blog</div><h1>Prayer, habits and <span class="hl">mornings.</span></h1><p>Short reads from the FirstAmen team.</p><a class="btn" href="${PLAY}">Get it on Google Play</a></section>`;

function indexPage(items) {
  const feed = items.length
    ? items.map((a) => `<a class="card entry" href="${BASE_PATH}/${encodeURIComponent(a.slug)}/">${a.read_time ? `<span class="chip">${esc(a.read_time)} MIN</span>` : ''}<b>${esc(a.title)}</b><span class="meta">${esc(fmtDate(a.published || a.published_at))}</span></a>`).join('\n')
    : `<div class="card notice">No articles yet</div>`;
  return shell({
    title: 'FirstAmen Blog', desc: 'Articles from the FirstAmen team about prayer, habits and mornings.', type: 'website',
    canonical: `${BASE_URL}/`, cls: 'cols-index', hero, main: `<section class="feed">${feed}</section>`,
  });
}

function ldScript(ld, canonical) {
  if (!ld || typeof ld !== 'object' || !Object.keys(ld).length) return '';
  let out = ld;
  if (!Array.isArray(ld) && !ld.url) out = { ...ld, url: canonical, mainEntityOfPage: canonical };
  return `<script type="application/ld+json">${JSON.stringify(out).replace(/</g, '\\' + 'u003c')}</script>\n`;
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

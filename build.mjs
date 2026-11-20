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
:root{--coral:#FF5E5B;--orange:#FF8A4C;--amber:#FFA94D;--cream:#FFF7F0;--ink:#2A1420;--soft:#5E4048;--body:#3D2A32;--line:#EBC9B3;--red:#C42F2B;--peach:#FFEFE3}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
html,body{margin:0}
body{font-family:'Poppins',system-ui,sans-serif;-webkit-font-smoothing:antialiased;line-height:1.5;color:var(--ink);background:var(--cream);min-height:100vh;display:flex;flex-direction:column}
img{max-width:100%}
a{color:var(--red)}a:hover{opacity:.85}
a:focus-visible,summary:focus-visible{outline:3px solid var(--ink);outline-offset:3px;border-radius:8px}
h1,h2,h3,h4{margin:0}
.grad{background:linear-gradient(135deg,#FF5E5B 0%,#FF8A4C 55%,#FFA94D 100%)}
.wrap{max-width:1200px;margin:0 auto;padding-left:32px;padding-right:32px}
.hero{border-radius:0 0 64px 64px;position:relative;overflow-x:clip}
.hdr{display:flex;align-items:center;justify-content:space-between;gap:16px 24px;flex-wrap:wrap;padding-top:24px;padding-bottom:24px}
.brand{display:flex;align-items:center;gap:12px;font-weight:800;font-size:24px;letter-spacing:-.5px;color:var(--ink);text-decoration:none}
.brand img{width:42px;height:42px;border-radius:12px}
.links{display:flex;align-items:center;gap:26px;flex-wrap:wrap}
.links a{color:var(--ink);text-decoration:none;font-weight:500;font-size:15px}
.links a[aria-current]{text-decoration:underline;text-underline-offset:6px;font-weight:700}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;font-weight:700;font-size:16px;border-radius:999px;padding:16px 28px;min-height:52px;text-decoration:none;background:var(--ink);color:#fff;border:0}
.btn:hover{opacity:.9;color:#fff}
.btn.sm{padding:11px 20px;min-height:44px;font-size:15px}
.btn.ghost{background:rgba(255,255,255,.7);color:var(--ink);border:2px solid var(--ink)}
.btn.ghost:hover{color:var(--ink)}
.pill{display:inline-block;background:#fff;border-radius:999px;padding:8px 18px;font-weight:600;font-size:14px;color:var(--ink)}
.eyebrow{font-size:13px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:var(--red);margin:0}
.meta{color:var(--soft);font-size:15px}
.chip{display:inline-block;background:var(--ink);color:#fff;font-size:13px;font-weight:700;letter-spacing:.04em;border-radius:999px;padding:6px 14px}
.chip.soft{background:var(--peach);color:var(--ink);letter-spacing:1px}
.mm{display:none}
.phero{text-align:center;padding-top:40px;padding-bottom:150px;display:flex;flex-direction:column;align-items:center;gap:20px}
.phero h1{font-size:72px;line-height:1.02;font-weight:800;letter-spacing:-2.4px;max-width:980px;text-wrap:balance}
.phero p{margin:0;font-size:21px;line-height:1.55;font-weight:500;max-width:620px}
.ahero{padding-top:40px;padding-bottom:110px;max-width:900px;margin:0;display:flex;flex-direction:column;gap:18px;align-items:flex-start}
.ahero h1{font-size:52px;line-height:1.06;font-weight:800;letter-spacing:-1.6px;text-wrap:balance}
.ahero .meta{color:var(--ink);font-weight:500;margin:0}
.cols{width:100%;flex:1 0 auto;max-width:1200px;margin:0 auto;padding:0 32px 90px;position:relative}
.cols-index{margin-top:-96px}
.bfeat{display:flex;flex-wrap:wrap;overflow:hidden;background:#fff;border:1px solid var(--line);border-radius:36px;box-shadow:0 18px 40px rgba(42,20,32,.12);color:var(--ink);text-decoration:none}
.bfeat .l{flex:1 1 380px;min-height:300px;display:flex;align-items:center;justify-content:center;position:relative}
.bfeat .l img{width:150px;height:150px;border-radius:38px;box-shadow:0 24px 50px rgba(42,20,32,.3);transform:rotate(-4deg)}
.bfeat .l .chip{position:absolute;left:28px;top:28px}
.bfeat .r{flex:1.4 1 460px;padding:44px 48px;display:flex;flex-direction:column;justify-content:center;gap:16px}
.bfeat h2{font-size:38px;line-height:1.15;font-weight:800;letter-spacing:-.9px}
.more{margin:56px 0 20px}
.feed{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:24px}
.card{background:#fff;border:1px solid var(--line);border-radius:28px}
.entry{display:flex;flex-direction:column;overflow:hidden;color:var(--ink);text-decoration:none;transition:transform .15s,box-shadow .15s}
.entry:hover{transform:translateY(-3px);box-shadow:0 18px 36px rgba(42,20,32,.12);opacity:1}
.entry .t{height:120px;padding:18px 22px}
.entry .b{padding:24px 26px 28px;display:flex;flex-direction:column;gap:12px;flex:1}
.entry h3{font-size:22px;line-height:1.25;font-weight:700}
.entry .meta{margin-top:auto}
.notice{padding:28px 30px;color:var(--soft)}.notice b{color:var(--ink);font-size:20px}
.back{display:inline-block;font-weight:700;color:var(--ink);text-decoration:none;background:#fff;border:1px solid var(--line);border-radius:999px;padding:10px 20px;font-size:14px}
.cols-article{display:grid;grid-template-columns:260px minmax(0,1fr);gap:40px;padding-top:0}
.side{align-self:start;position:sticky;top:24px;padding-top:28px}
.toc2{margin-top:20px;padding:22px 24px}
.toc2 h2{font-size:16px;margin:0 0 10px}
.toc2 a{display:block;color:var(--body);text-decoration:none;font-size:14px;padding:8px 0;border-top:1px solid var(--line);line-height:1.35}
.toc2 a:first-of-type{border-top:0}.toc2 a:hover{color:var(--red)}
.artcol{padding:44px 48px 36px;margin-top:-72px;position:relative;box-shadow:0 18px 40px rgba(42,20,32,.1);border-radius:32px}
.body h2{font-size:30px;margin:1.7em 0 .5em;line-height:1.2;font-weight:800;letter-spacing:-.5px}
.body h3{font-size:22px;margin:1.4em 0 .3em;font-weight:700}
.body h4{font-size:18px;margin:1.2em 0 .3em;font-weight:700}
.body p{margin:0 0 1.1em;font-size:18px;color:var(--body);line-height:1.75}
.body ul,.body ol{margin:0 0 1.2em;padding-left:1.4em;font-size:18px;color:var(--body);line-height:1.7}.body li{margin-bottom:.4em}
.body>h2:first-child{margin-top:0}
.body ul{background:var(--cream);border:1px solid var(--line);border-radius:20px;padding:20px 26px 20px 46px}
.body .toc ol{background:none;padding:0 0 0 1.2em;margin:0;font-size:16px}
.toc{background:var(--peach);border-radius:20px;padding:18px 26px;margin:0 0 1.6em}
.toc h2{font-size:17px;margin:0 0 6px}
.body a{color:var(--red);font-weight:600}
.body blockquote{margin:1.6em 0;padding:24px 28px;background:var(--peach);border-radius:20px;font-size:22px;font-weight:600;line-height:1.4}
.body code{background:var(--peach);border-radius:6px;padding:2px 6px;font-size:.92em}
.body pre{overflow-x:auto;background:var(--peach);border-radius:14px;padding:16px}
.body .tablewrap{overflow-x:auto;margin:0 0 1.2em}
.body table{border-collapse:collapse;width:100%;font-size:16px;color:var(--body)}
.body th,.body td{border-bottom:1px solid var(--line);padding:10px 12px;text-align:left;vertical-align:top}
.body th{color:var(--ink)}
[dir=rtl] .body ul,[dir=rtl] .body ol{padding-left:0;padding-right:1.4em}
.cta{margin:2.2em 0 0;padding:44px 36px;border-radius:32px;text-align:center;background:linear-gradient(135deg,#FF5E5B 0%,#FF8A4C 55%,#FFA94D 100%)}
.cta h2{font-size:34px;line-height:1.12;font-weight:800;letter-spacing:-.8px;margin:0 0 10px;text-wrap:balance}
.cta p{margin:0 auto 22px;max-width:30em;font-size:17px;color:var(--ink);font-weight:500;line-height:1.6}
.cta .btns{display:flex;flex-wrap:wrap;gap:12px;justify-content:center}
.sidecta{margin-top:20px;padding:22px 24px}
.sidecta b{display:block;font-size:18px;line-height:1.25;margin-bottom:8px}
.sidecta p{margin:0 0 14px;font-size:14px;color:var(--soft);line-height:1.5}
.sidecta .btn{display:flex;padding:12px 16px;font-size:15px;min-height:48px}
.toc2{display:block}.toc-inline{display:none}
.foot{border-top:1px solid var(--line);margin-top:auto}
.fwrap{max-width:1200px;margin:0 auto;padding:28px 32px 48px;display:flex;align-items:center;justify-content:space-between;gap:20px 40px;flex-wrap:wrap;font-size:15px;color:var(--soft)}
.fbrand{margin:0}
.flinks{display:flex;flex-wrap:wrap;gap:8px 22px}
.flinks a{color:var(--soft);text-decoration:none}.flinks a:hover{color:var(--ink);text-decoration:underline}
@media (max-width:899px){
  .cols{padding:0 20px 64px}
  .cols-article{grid-template-columns:minmax(0,1fr);gap:0}
  .side{position:static;padding-top:20px;order:2}
  .toc2{display:none}.toc-inline{display:block}
  .sidecta{display:none}
  .artcol{padding:26px 22px 24px;margin-top:-56px;border-radius:26px}
  .ahero h1{font-size:34px;letter-spacing:-1.1px}
  .ahero{padding-bottom:84px}
  .cta{padding:30px 22px;border-radius:28px}
  .cta h2{font-size:26px}
  .body p,.body ul,.body ol{font-size:17px}
  .body h2{font-size:25px}
}
@media (max-width:760px){
  .wrap{padding-left:20px;padding-right:20px}
  .hdr{flex-wrap:nowrap;padding-top:16px;padding-bottom:16px;position:relative}
  .brand{font-size:20px;gap:10px}.brand img{width:34px;height:34px;border-radius:10px}
  .links,.hdr>.btn{display:none}
  .mm{display:block}
  .mm summary{list-style:none;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.6);display:flex;align-items:center;justify-content:center;cursor:pointer}
  .mm summary::-webkit-details-marker{display:none}
  .mmenu{position:absolute;left:20px;right:20px;top:70px;z-index:30;background:#fff;border-radius:24px;padding:10px;box-shadow:0 18px 40px rgba(42,20,32,.28);display:flex;flex-direction:column;gap:2px}
  .mmenu a{padding:13px 16px;color:var(--ink);text-decoration:none;font-weight:600;font-size:17px;border-radius:14px;min-height:48px;display:flex;align-items:center}
  .mmenu a[aria-current]{background:var(--peach)}
  .mmenu a.btn{margin-top:6px;color:#fff;justify-content:center}
  .hero{border-radius:0 0 36px 36px}
  .phero{padding-top:20px;padding-bottom:100px;gap:14px;text-align:left;align-items:flex-start}
  .phero h1{font-size:42px;letter-spacing:-1.4px}
  .phero p{font-size:17px}
  .cols-index{margin-top:-64px}
  .bfeat{border-radius:28px}
  .bfeat .l{flex-basis:100%;min-height:150px}
  .bfeat .l img{width:84px;height:84px;border-radius:22px}
  .bfeat .l .chip{left:16px;top:16px}
  .bfeat .r{padding:22px 22px 24px;flex-basis:100%;gap:10px}
  .bfeat h2{font-size:26px;letter-spacing:-.5px}
  .more{margin:36px 0 14px}
  .feed{grid-template-columns:1fr;gap:14px}
  .card{border-radius:24px}
  .entry .t{height:64px;padding:16px 20px}
  .entry .b{padding:18px 20px 20px;gap:8px}
  .entry h3{font-size:19px}
  .fwrap{padding:20px 20px 36px;flex-direction:column;align-items:flex-start}
}
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
// Menu links. When the Blog, How it works, Features, Pricing and FAQ pages move to their own pages
// on repdbylove.com, change the addresses here and every blog page follows.
const LINKS = {
  founder: `${SITE}/firstamen/founder`,
  how: `${SITE}/firstamen#how`,
  features: `${SITE}/firstamen#features`,
  pricing: `${SITE}/firstamen#pricing`,
  faq: `${SITE}/firstamen#faq`,
};
const ICON = 'data:image/png;base64,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';
const menuLinks = `<a href="${LINKS.founder}">Founder</a><a href="${BASE_PATH}/" aria-current="page">Blog</a><a href="${LINKS.how}">How it works</a><a href="${LINKS.features}">Features</a><a href="${LINKS.pricing}">Pricing</a><a href="${LINKS.faq}">FAQ</a>`;
const NAV = `<header class="wrap hdr"><a class="brand" href="${SITE}/firstamen"><img src="${ICON}" alt="" width="42" height="42">FirstAmen</a><nav class="links" aria-label="Main">${menuLinks}</nav><a class="btn sm" href="${PLAY}">Get it on Google Play</a><details class="mm"><summary aria-label="Menu"><svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 6h14M3 10h14M3 14h14" stroke="#2A1420" stroke-width="2" stroke-linecap="round"/></svg></summary><nav class="mmenu" aria-label="Menu">${menuLinks}<a class="btn" href="${PLAY}">Get it on Google Play</a></nav></details></header>`;
const FOOT = `<footer class="foot"><div class="fwrap"><p class="fbrand">FirstAmen <span>by REPDBYLOVE</span></p><nav class="flinks" aria-label="Footer"><a href="${SITE}/firstamen/founder">Founder story</a><a href="${SITE}/firstamen/firstamen-privacy">Privacy Policy</a><a href="${SITE}/firstamen/firstamen-terms">Terms</a><a href="${SITE}/firstamen/firstamen-delete">Delete account</a><a href="mailto:info@repdbylove.com">Contact</a></nav></div></footer>`;

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
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${CSS}</style>
<script type="module">
import { analytics } from 'https://esm.sh/@heycatch/sdk@0.8.5';
analytics.init({
  projectKey: 'hck_pk_rZQKDYhERoeO0XV5UW9_2V11-OCbWEyy',
  site: 'landing',
  requestBatching: false,
  install: { framework: 'web', agent: 'claude-code' },
});
var page = location.pathname;
document.addEventListener('click', function (e) {
  var a = e.target.closest && e.target.closest('a[href]');
  if (!a) return;
  var u; try { u = new URL(a.getAttribute('href'), location.href); } catch (x) { return; }
  var sec = a.closest('header') ? 'header' : a.closest('footer') ? 'footer' : a.closest('section[id]') ? a.closest('section[id]').id : a.closest('article') ? 'article' : 'page';
  if (u.hostname === 'play.google.com') analytics.trackEvent('play_click', { location: sec, page: page });
  else if (u.hostname === 'repdbylove.com' && u.pathname.indexOf('/firstamen') === 0) analytics.trackEvent('site_link_click', { location: sec, page: page, to: u.pathname + u.hash });
  else if (u.pathname.indexOf('/firstamen-blog') === 0) analytics.trackEvent('blog_link_click', { location: sec, page: page });
}, true);
var pr = document.getElementById('pricing');
if (pr && 'IntersectionObserver' in window) {
  new IntersectionObserver(function (en, o) {
    if (en[0].isIntersecting) { analytics.trackEvent('pricing_viewed', { page: page }); o.disconnect(); }
  }, { threshold: 0.4 }).observe(pr);
}
</script>
${head}</head>
<body>
<div class="hero grad">${NAV}${hero}</div>
<main class="cols ${cls}">${main}</main>
${FOOT}
</body>
</html>
`;
}

const hero = `<section class="wrap phero"><span class="pill">The FirstAmen Blog</span><h1>Prayer, habits and mornings.</h1><p>Short reads from the FirstAmen team.</p></section>`;

// Soft sunrise tints for the top of each article card; they repeat in order.
const TINTS = ['#FFD9A8,#FFB38A', '#FFC9B8,#FF9F7A', '#FFE3B8,#FFC27A', '#FFD0B0,#FF8A4C', '#FFDDB8,#FFA94D'];

function indexPage(items) {
  const link = (a) => `${BASE_PATH}/${encodeURIComponent(a.slug)}/`;
  const chip = (a, cls = 'chip') => (a.read_time ? `<span class="${cls}">${esc(a.read_time)} MIN</span>` : '');
  let main;
  if (!items.length) {
    main = `<div class="card notice"><b>No articles yet</b></div>`;
  } else {
    const [first, ...rest] = items;
    const featured = `<a class="bfeat" href="${link(first)}"><div class="l grad"><span class="chip">Latest</span><img src="${ICON}" alt=""></div>` +
      `<div class="r"><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">${chip(first, 'chip soft')}<span class="meta">${esc(fmtDate(first.published || first.published_at))}</span></div>` +
      `<h2>${esc(first.title)}</h2><span class="btn" style="align-self:flex-start">Read article</span></div></a>`;
    const grid = rest.length
      ? `<p class="eyebrow more">More to read</p><section class="feed">` + rest.map((a, i) =>
        `<a class="card entry" href="${link(a)}"><div class="t" style="background:linear-gradient(135deg,${TINTS[i % TINTS.length]})">${chip(a)}</div>` +
        `<div class="b"><h3>${esc(a.title)}</h3><span class="meta">${esc(fmtDate(a.published || a.published_at))}</span></div></a>`).join('\n') + `</section>`
      : '';
    main = featured + grid;
  }
  return shell({
    title: 'FirstAmen Blog', desc: 'Articles from the FirstAmen team about prayer, habits and mornings.', type: 'website',
    canonical: `${BASE_URL}/`, cls: 'cols-index', hero, main,
  });
}

function ldScript(ld, canonical) {
  if (!ld || typeof ld !== 'object' || !Object.keys(ld).length) return '';
  let out = ld;
  if (!Array.isArray(ld) && !ld.url) out = { ...ld, url: canonical, mainEntityOfPage: canonical };
  return `<script type="application/ld+json">${JSON.stringify(out).replace(/</g, '\\u003c')}</script>\n`;
}

const ctaBlock = `<section class="cta" lang="en" dir="ltr" aria-labelledby="cta-h"><h2 id="cta-h">Wake up to prayer, not a snooze.</h2><p>FirstAmen is a prayer alarm that does not stop until you pray out loud. Try one free practice prayer during setup. You will make a free account first.</p><div class="btns"><a class="btn" href="${PLAY}" target="_blank" rel="noopener">Get it on Google Play</a><a class="btn ghost" href="${LINKS.how}" target="_blank" rel="noopener">See how it works</a></div></section>`;
const sideCta = `<div class="card sidecta" lang="en" dir="ltr"><b>Pray out loud to stop your alarm.</b><p>Try a free practice prayer in FirstAmen.</p><a class="btn" href="${PLAY}" target="_blank" rel="noopener">Get it on Google Play</a></div>`;

function articlePage(a) {
  const canonical = `${BASE_URL}/${encodeURIComponent(a.slug)}/`;
  const { html, side } = buildBody(a.content_html);
  const lang = a.language && a.language !== SITE_LANG ? ` lang="${esc(a.language)}"` : '';
  const rtl = /^(ar|he|fa|ur)(-|$)/i.test(a.language || '') ? ' dir="rtl"' : '';
  const ahero = `<section class="wrap"${lang}${rtl}><div class="ahero"><span class="pill">From the blog</span><h1>${esc(a.title)}</h1><p class="meta">${esc(metaLine(a))}</p></div></section>`;
  return shell({
    title: `${a.title} | FirstAmen Blog`, desc: a.meta_description || '', type: 'article', canonical,
    head: ldScript(a.jsonLd, canonical), cls: 'cols-article', hero: ahero,
    main: `<aside class="side"><a class="back" href="${BASE_PATH}/">&larr; All articles</a>${side}${sideCta}</aside>` +
      `<article class="card artcol"${lang}${rtl}><div class="body">${html}</div>${ctaBlock}</article>`,
  });
}

function notFoundPage() {
  return shell({
    title: 'Article not found | FirstAmen Blog', desc: 'This article could not be found.', type: 'website', cls: 'cols-index', robots: 'noindex',
    hero: `<section class="wrap phero"><span class="pill">Blog</span><h1>Article not found</h1></section>`,
    main: `<section class="feed"><div class="card notice"><b>We could not find that article.</b><br>It may have been moved or unpublished.<br><br><a class="back" href="${BASE_PATH}/">&larr; All articles</a></div></section>`,
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
await fs.cp('admin', path.join(OUT, 'admin'), { recursive: true }).catch(() => {}); // private admin page (login-protected)
await fs.writeFile(path.join(OUT, 'index.html'), indexPage(list));
await fs.writeFile(path.join(OUT, '404.html'), notFoundPage());
await fs.writeFile(path.join(OUT, 'sitemap.xml'), sitemap(articles));
await fs.writeFile(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${BASE_URL}/sitemap.xml\n`);
for (const a of articles) {
  await fs.mkdir(path.join(OUT, a.slug), { recursive: true });
  await fs.writeFile(path.join(OUT, a.slug, 'index.html'), articlePage(a));
}
console.log(`Built ${articles.length} article page(s) + index, sitemap and 404 into ${OUT}/`);

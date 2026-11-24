// Local article feed for build.mjs.
//
// build.mjs asks the HeyCatch API for this site's published articles. This small server answers the
// same two routes, adding every markdown file in posts/ to the list, so a post committed to this repo
// publishes on the next build without touching the article API (which is read-only).
//
//   GET /v1/articles?limit=&offset=   the merged list, newest first
//   GET /v1/articles/:slug            one full article
//
// Nothing here writes anything: same titles, same feed, just with our own posts included.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import sanitizeHtml from 'sanitize-html';
import * as cheerio from 'cheerio';
import { marked } from 'marked';

const UPSTREAM = (process.env.HEYCATCH_UPSTREAM || 'https://api.heycatch.ai/v1').replace(/\/$/, '');
const KEY = process.env.HEYCATCH_API_KEY || 'hck_lv_04c05753d17dd77c9e641ac0';
const PORT = Number(process.env.LOCAL_FEED_PORT || 8787);
const POSTS_DIR = process.env.POSTS_DIR || 'posts';
const AUTHOR = { '@type': 'Organization', name: 'FirstAmen by REPDBYLOVE' };

const slugify = (t) => String(t || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim()
  .replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 80);

// --- markdown in posts/ ------------------------------------------------------------------
function frontMatter(raw) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!m) return [{}, raw];
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i < 1) continue;
    data[line.slice(0, i).trim().toLowerCase().replace(/\s+/g, '_')] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return [data, raw.slice(m[0].length)];
}

// build.mjs allows a fixed set of tags in an article body; keep our HTML inside that set.
function clean(html) {
  return sanitizeHtml(String(html || ''), {
    allowedTags: ['h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'blockquote', 'a', 'strong', 'em', 'code', 'pre', 'br', 'b', 'i', 'hr', 'span', 'img'],
    allowedAttributes: { a: ['href'], h2: ['id'], img: ['src', 'alt', 'loading'] },
    allowedSchemes: ['http', 'https', 'mailto'],
  });
}

function faq($) {
  const items = [];
  let inFaq = false;
  for (const el of $('#post').children().toArray()) {
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'h2') { inFaq = /(faq|questions|asked)/i.test($(el).text()); continue; }
    if (!inFaq) continue;
    if (/^h[3-4]$/.test(tag)) {
      items.push($(el).text().trim().endsWith('?') ? { q: $(el).text().trim(), a: [] } : null);
      if (!items[items.length - 1]) items.pop();
    } else if (items.length && (tag === 'p' || tag === 'li')) {
      items[items.length - 1].a.push($(el).text().trim());
    }
  }
  return items.map((i) => ({ q: i.q, a: i.a.join(' ').replace(/\s+/g, ' ').trim() })).filter((i) => i.a);
}

async function articles({ publishedOnly = true } = {}) {
  let names = [];
  // files starting with _ are notes for us, never posts
  try { names = (await fs.readdir(POSTS_DIR)).filter((f) => /\.md$/i.test(f) && !f.startsWith('_')); }
  catch { return []; }
  const out = [];
  for (const name of names.sort()) {
    let raw;
    try { raw = await fs.readFile(path.join(POSTS_DIR, name), 'utf8'); } catch { continue; }
    const [fm, body] = frontMatter(raw);
    // A post goes live only when its front matter says so. Anything else stays a draft in the repo.
    if (publishedOnly && !/^(published|live|public)$/i.test(String(fm.status || '').trim())) continue;
    const title = fm.title || /^#\s+(.+)$/m.exec(body)?.[1] || name.replace(/\.md$/i, '');
    const md = body.trim().replace(/^#\s+.+(\r?\n)+/, ''); // the page prints its own H1
    const $ = cheerio.load(`<div id="post">${clean(marked.parse(md))}</div>`, null, false);
    $('#post h2').each((_, h) => {
      const t = $(h).text().trim();
      $(h).attr('id', /(faq|questions|asked)/i.test(t) ? 'faq' : slugify(t));
    });
    const html = $('#post').html();
    const words = $('div#post').text().replace(/\s+/g, ' ').trim().split(' ').length;
    const date = String(fm.date || fm.published || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const questions = faq($);
    out.push({
      id: `local-${slugify(fm.slug || title)}`,
      slug: fm.slug || slugify(title),
      title,
      meta_description: fm.description || fm.meta_description || '',
      keywords: (fm.keywords || '').split(',').map((k) => k.trim()).filter(Boolean),
      published: date, published_at: `${date}T09:00:00.000Z`, updated: date,
      read_time: Math.max(1, Math.round(words / 220)),
      language: 'en',
      content_html: html,
      jsonLd: {
        '@context': 'https://schema.org', '@type': 'Article', headline: title,
        description: fm.description || '', datePublished: date, dateModified: date, author: AUTHOR,
        ...(questions.length ? {
          mainEntity: { '@type': 'FAQPage', mainEntity: questions.map((q) => ({ '@type': 'Question', name: q.q, acceptedAnswer: { '@type': 'Answer', text: q.a } })) },
        } : {}),
      },
    });
  }
  return out;
}

// --- upstream feed -----------------------------------------------------------------------
// The remote feed is optional. Every article now lives in posts/, so when this feed is gone (or
// answers with an error) the build carries on with the committed posts instead of failing.
let upstreamDown = false;
async function upstream(route, params = {}) {
  if (upstreamDown) throw new Error('upstream unavailable');
  const q = new URLSearchParams({ key: KEY, ...params });
  const res = await fetch(`${UPSTREAM}${route}?${q}`, { signal: AbortSignal.timeout(8000) }).catch((e) => {
    upstreamDown = true; throw e;
  });
  if (!res.ok) { upstreamDown = true; throw new Error(`upstream ${route} answered ${res.status}`); }
  return res.json();
}

const newest = (a, b) => String(b.published_at || b.published || '').localeCompare(String(a.published_at || a.published || ''));
const brief = ({ slug, title, meta_description, published, published_at, updated, read_time, language }) =>
  ({ slug, title, meta_description, published, published_at, updated, read_time, language });

// --- server ------------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const route = url.pathname.replace(/^\/v1/, '');
  try {
    if (route === '/articles') {
      const limit = Number(url.searchParams.get('limit') || 50);
      const offset = Number(url.searchParams.get('offset') || 0);
      const mine = await articles();
      let remote = [];
      try { remote = (await upstream('/articles', { limit: 200, offset: 0 })).articles || []; }
      catch (e) { console.warn(`remote feed skipped: ${e.message}`); }
      // A slug that exists in posts/ beats the remote copy of the same article, so pages never double up.
      const mineSlugs = new Set(mine.map((a) => a.slug));
      const all = [...mine, ...remote.filter((a) => !mineSlugs.has(a.slug))].sort(newest);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ articles: all.slice(offset, offset + limit).map(brief), total: all.length, limit, offset }));
      return;
    }
    const one = /^\/articles\/(.+)$/.exec(route);
    if (one) {
      const slug = decodeURIComponent(one[1]);
      const mine = (await articles({ publishedOnly: false })).find((a) => a.slug === slug);
      if (mine) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ article: mine })); return; }
      let full;
      try { full = await upstream(`/articles/${encodeURIComponent(slug)}`); }
      catch { res.writeHead(404, { 'content-type': 'application/json' }); res.end(JSON.stringify({ code: 'NOT_FOUND' })); return; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(full));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ code: 'NOT_FOUND' }));
  } catch (e) {
    // A failure here must fail the build, so the last good site stays online.
    console.error(e.message);
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ code: 'UPSTREAM_ERROR', message: e.message }));
  }
});

server.listen(PORT, '127.0.0.1', async () => {
  const mine = await articles();
  console.log(`Local article feed on 127.0.0.1:${PORT}/v1 with ${mine.length} post(s) from ${POSTS_DIR}/: ${mine.map((a) => a.slug).join(', ') || 'none'}`);
});

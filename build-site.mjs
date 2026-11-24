// Site build entry point. Runs build.mjs with two small additions, applied in memory so build.mjs
// itself keeps working exactly as it does today:
//
//   1. every markdown file in posts/ is served from a local feed (posts-feed.mjs) and merged with
//      the live article list, so a post committed here needs no publishing step
//   2. article bodies may contain <img>, for the hero and inline photos; build.mjs otherwise strips it
//
// If build.mjs ever changes shape, this fails loudly and the last good site stays online.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const PATCHES = [
  [`.body a{color:var(--red);font-weight:600}`,
   `.body img{display:block;width:100%;height:auto;border-radius:24px;margin:1.6em 0;box-shadow:0 14px 34px rgba(42,20,32,.12)}\n.body a{color:var(--red);font-weight:600}`],
  [`      'blockquote', 'a', 'strong', 'em', 'code', 'pre', 'br', 'b', 'i', 'hr', 'span'],`,
   `      'blockquote', 'a', 'strong', 'em', 'code', 'pre', 'br', 'b', 'i', 'hr', 'span', 'img'],`],
  [`    allowedAttributes: { a: ['href'], h2: ['id'], th: ['colspan'], td: ['colspan'] },`,
   `    allowedAttributes: { a: ['href'], h2: ['id'], th: ['colspan'], td: ['colspan'], img: ['src', 'alt', 'loading'] },`],
];

let src = await fs.readFile('build.mjs', 'utf8');
for (const [from, to] of PATCHES) {
  if (!src.includes(from)) throw new Error(`build.mjs changed, so build-site.mjs no longer matches: ${from.trim().slice(0, 48)}`);
  src = src.replace(from, to);
}

// The local feed has to answer before build.mjs asks it for the article list.
const PORT = 8787;
const feed = spawn(process.execPath, ['posts-feed.mjs'], {
  env: { ...process.env, LOCAL_FEED_PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('the local article feed did not start')), 15000);
  feed.stdout.on('data', (d) => { if (String(d).includes('Local article feed')) { clearTimeout(timer); resolve(); } });
  feed.on('exit', (code) => { clearTimeout(timer); reject(new Error(`the local article feed stopped (code ${code})`)); });
});
process.env.HEYCATCH_API_BASE = `http://127.0.0.1:${PORT}/v1`;

const generated = path.resolve('.build-site.generated.mjs');
await fs.writeFile(generated, src);
try {
  await import(pathToFileURL(generated).href);
} finally {
  feed.kill();
  await fs.rm(generated, { force: true });
}

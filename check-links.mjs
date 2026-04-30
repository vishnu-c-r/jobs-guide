#!/usr/bin/env node
// scripts/check-links.mjs
//
// Daily link health check for the jobs guide.
// Reads index.html, extracts URLs from the DATA array, hits each one
// with a HEAD request (fallback to GET on 405), classifies the response,
// and writes LINK_REPORT.md at the repo root.
//
// Usage:  node scripts/check-links.mjs
//
// Run via GitHub Actions daily; commits the report back to the repo.

import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as wait } from 'node:timers/promises';

const HTML_PATH = new URL('../index.html', import.meta.url);
const REPORT_PATH = new URL('../LINK_REPORT.md', import.meta.url);
const TIMEOUT_MS = 10_000;
const CONCURRENCY = 6;

// ---------- Extract entries from index.html ----------
const html = await readFile(HTML_PATH, 'utf8');

// Pull entries: { name: "...", desc: "...", url: "...", ... }
// Match each `{ name: "...", ..., url: "https://...", ... }` block.
const entries = [];
const entryRe = /\{\s*name:\s*"([^"]+)"[^}]*?url:\s*"([^"]+)"[^}]*?\}/g;
let m;
while ((m = entryRe.exec(html)) !== null) {
  entries.push({ name: m[1], url: m[2] });
}

if (!entries.length) {
  console.error('No entries found in index.html. Aborting.');
  process.exit(1);
}

console.log(`Checking ${entries.length} URLs (concurrency ${CONCURRENCY}, timeout ${TIMEOUT_MS}ms)...`);

// ---------- Check one URL ----------
async function fetchOnce(url, method) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        // Mozilla UA — many sites (Cloudflare, Akamai, Indeed) reject default Node UA.
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    return { ok: true, res };
  } catch (err) {
    return { ok: false, err };
  } finally {
    clearTimeout(t);
  }
}

async function checkOne({ name, url }) {
  // Try HEAD first (cheap), fall back to GET for servers that reject HEAD.
  let attempt = await fetchOnce(url, 'HEAD');
  if (attempt.ok && [403, 405, 406, 415, 429].includes(attempt.res.status)) {
    // Some sites only allow GET.
    const second = await fetchOnce(url, 'GET');
    if (second.ok) attempt = second;
  } else if (!attempt.ok) {
    // Single retry on network errors (DNS hiccups happen).
    await wait(500);
    const retry = await fetchOnce(url, 'GET');
    if (retry.ok) attempt = retry;
  }

  if (!attempt.ok) {
    const err = attempt.err;
    const msg = err.name === 'AbortError' ? 'timeout' : (err.cause?.code || err.message);
    return { name, url, status: 0, finalUrl: null, category: 'network-error', error: msg };
  }

  const res = attempt.res;
  const status = res.status;
  const finalUrl = res.url;
  let category;
  if (status >= 200 && status < 300) category = 'ok';
  else if (status >= 300 && status < 400) category = 'redirect';
  else if (status === 404 || status === 410) category = 'gone';                  // truly broken
  else if ([403, 406, 415, 429, 451].includes(status)) category = 'blocked';     // WAF/bot-block, probably alive
  else if (status >= 400 && status < 500) category = 'client-error';
  else if (status === 503) category = 'blocked';                                  // Cloudflare challenge
  else if (status >= 500) category = 'server-error';
  else category = 'unknown';

  return { name, url, status, finalUrl, category };
}

// ---------- Run with bounded concurrency ----------
async function runAll(items, n, fn) {
  const results = [];
  let idx = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (idx < items.length) {
        const i = idx++;
        const r = await fn(items[i]);
        results[i] = r;
        const flag = r.category === 'ok' ? '✓' :
                     r.category === 'redirect' ? '→' :
                     r.category === 'network-error' ? '✗' : '!';
        console.log(`${flag} [${String(i + 1).padStart(3)}/${items.length}] ${r.status || r.error || '?'} ${r.name}`);
        await wait(50); // gentle
      }
    })
  );
  return results;
}

const results = await runAll(entries, CONCURRENCY, checkOne);

// ---------- Categorize ----------
const groups = {
  'gone': [],          // 404/410 — definitely broken
  'network-error': [], // DNS / timeout / TLS — possibly broken
  'client-error': [],  // other 4xx
  'blocked': [],       // 403/429/503 — WAF, almost certainly alive in browser
  'server-error': [],  // 5xx — usually transient
  'redirect': [],
  'ok': [],
};
for (const r of results) groups[r.category]?.push(r);

const broken = [...groups['gone'], ...groups['network-error'], ...groups['client-error']];
const blocked = groups['blocked'];
const watch = [...groups['server-error'], ...groups['redirect']];

// ---------- Write report ----------
const now = new Date();
const timeStr = now.toUTCString();

const lines = [];
lines.push(`# Link Health Report\n`);
lines.push(`**Last run:** ${timeStr}`);
lines.push(`**Total checked:** ${results.length}`);
lines.push(`**OK:** ${groups.ok.length}  ·  **Broken:** ${broken.length}  ·  **Blocked (likely alive):** ${blocked.length}  ·  **Watch:** ${watch.length}\n`);

if (broken.length === 0) {
  lines.push(`> ✓ No broken links detected.\n`);
}

if (broken.length) {
  lines.push(`## ✗ Broken — needs attention\n`);
  lines.push(`| Status | Name | URL | Detail |`);
  lines.push(`|---|---|---|---|`);
  for (const r of broken) {
    lines.push(`| ${r.status || 'NETERR'} | ${r.name} | <${r.url}> | ${r.error || r.category} |`);
  }
  lines.push('');
}

if (blocked.length) {
  lines.push(`## ⊘ Blocked by WAF / bot-protection\n`);
  lines.push(`<sub>These return 403/429/503 to scripts but work fine in browsers. No action needed.</sub>\n`);
  lines.push(`| Status | Name | URL |`);
  lines.push(`|---|---|---|`);
  for (const r of blocked) {
    lines.push(`| ${r.status} | ${r.name} | <${r.url}> |`);
  }
  lines.push('');
}

if (watch.length) {
  lines.push(`## ! Watch — possibly transient\n`);
  lines.push(`| Status | Name | URL | Final URL |`);
  lines.push(`|---|---|---|---|`);
  for (const r of watch) {
    lines.push(`| ${r.status} | ${r.name} | <${r.url}> | ${r.finalUrl || '—'} |`);
  }
  lines.push('');
}

lines.push(`---`);
lines.push(`<sub>Generated by \`scripts/check-links.mjs\` · automated daily by GitHub Actions</sub>`);

await writeFile(REPORT_PATH, lines.join('\n'));
console.log(`\nReport written to LINK_REPORT.md`);
console.log(`OK: ${groups.ok.length}  Broken: ${broken.length}  Blocked: ${blocked.length}  Watch: ${watch.length}`);

// Exit non-zero only on truly broken links — ignore WAF noise
if (broken.length > 0) {
  console.error(`\n${broken.length} broken link(s). See LINK_REPORT.md`);
  process.exitCode = 1;
}

#!/usr/bin/env node
// scripts/fetch-feed.mjs
//
// Pulls live job postings + India startup news into feed.json:
//
//   1. HN "Ask HN: Who is hiring?" current month — via Algolia API (free, no key).
//      Filtered to India / Bangalore / Bengaluru / Kochi / Kerala / "remote, india" mentions.
//   2. RemoteOK API — JSON, public. Filtered to India-friendly remote jobs.
//   3. Inc42 RSS — funding announcements + "X is hiring" coverage.
//      Filtered to BLR / Bengaluru / Kochi / Kerala mentions in title or summary.
//
// Output: feed.json at repo root, read by index.html on the PULSE tab.
//
// Usage (locally):  node scripts/fetch-feed.mjs
// Run by GitHub Action daily.

import { writeFile } from 'node:fs/promises';
import { setTimeout as wait } from 'node:timers/promises';

const OUT = new URL('../feed.json', import.meta.url);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const TIMEOUT_MS = 15_000;

// India-relevance filter — case-insensitive substring match
const INDIA_KEYWORDS = [
  'india', 'bangalore', 'bengaluru', 'kochi', 'kerala', 'cochin', 'ernakulam',
  'mumbai', 'delhi', 'hyderabad', 'chennai', 'pune', 'gurgaon', 'noida',
  'remote (india)', 'remote · india', 'asia/india', 'ist timezone',
];
function isIndiaRelevant(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return INDIA_KEYWORDS.some(kw => t.includes(kw));
}

// BLR/Kochi-specific filter, stricter
function isBlrOrKochi(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return ['bangalore', 'bengaluru', 'kochi', 'kerala', 'cochin', 'ernakulam'].some(kw => t.includes(kw));
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml,application/xml,text/xml,text/html' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

// ============================================================
// 1. HN Who is Hiring (via Algolia)
// ============================================================
async function fetchHN() {
  console.log('[HN] Searching for latest "Ask HN: Who is hiring" thread...');
  // Algolia HN search — find the most recent "Who is hiring" thread by whoishiring user
  const search = await fetchJson(
    'https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&query=hiring&hitsPerPage=5'
  );
  const threads = (search.hits || []).filter(h => /who is hiring/i.test(h.title || ''));
  if (!threads.length) {
    console.log('[HN] No hiring thread found.');
    return [];
  }
  const thread = threads[0];
  console.log(`[HN] Found thread: ${thread.title} (id=${thread.objectID})`);

  // Fetch all comments in the thread
  const item = await fetchJson(`https://hn.algolia.com/api/v1/items/${thread.objectID}`);
  const all = [];
  function walk(node) {
    if (node.text && node.author !== 'whoishiring') all.push(node);
    (node.children || []).forEach(walk);
  }
  walk(item);
  console.log(`[HN] ${all.length} top-level comments. Filtering for India...`);

  const indiaJobs = all
    .filter(c => isIndiaRelevant(stripHtml(c.text)))
    .map(c => {
      const text = stripHtml(c.text);
      // Try to extract company name from typical HN formats:
      // "Company Name | Role | Bangalore | REMOTE..."
      const firstLine = text.split('\n')[0].trim();
      const company = firstLine.split(/\s*\|\s*/)[0].slice(0, 80);
      return {
        source: 'HN',
        title: firstLine.slice(0, 140),
        company: company,
        url: `https://news.ycombinator.com/item?id=${c.id}`,
        snippet: text.slice(0, 280).replace(/\s+/g, ' ').trim(),
        posted_at: c.created_at || null,
      };
    })
    .slice(0, 20); // cap

  console.log(`[HN] ${indiaJobs.length} India-relevant jobs.`);
  return indiaJobs;
}

// ============================================================
// 2. RemoteOK
// ============================================================
async function fetchRemoteOK() {
  console.log('[RemoteOK] Fetching jobs...');
  let data;
  try {
    data = await fetchJson('https://remoteok.com/api');
  } catch (e) {
    console.log(`[RemoteOK] Failed: ${e.message}`);
    return [];
  }
  // First element is a metadata object — skip it
  const jobs = Array.isArray(data) ? data.filter(j => j && j.position) : [];
  console.log(`[RemoteOK] ${jobs.length} total jobs. Filtering for India-friendly...`);

  const filtered = jobs
    .filter(j => {
      const blob = `${j.position || ''} ${j.company || ''} ${j.location || ''} ${j.tags?.join(' ') || ''} ${j.description || ''}`;
      return isIndiaRelevant(blob);
    })
    .map(j => ({
      source: 'REMOTEOK',
      title: (j.position || 'Untitled role').slice(0, 140),
      company: (j.company || 'Unknown').slice(0, 80),
      url: j.url || `https://remoteok.com/remote-jobs/${j.id}`,
      snippet: stripHtml(j.description || '').slice(0, 280).replace(/\s+/g, ' ').trim(),
      posted_at: j.date || null,
    }))
    .slice(0, 15);

  console.log(`[RemoteOK] ${filtered.length} India-friendly jobs.`);
  return filtered;
}

// ============================================================
// 3. Inc42 RSS — startup pulse for BLR/Kochi
// ============================================================
async function fetchInc42() {
  console.log('[Inc42] Fetching RSS...');
  let xml;
  try {
    xml = await fetchText('https://inc42.com/feed/');
  } catch (e) {
    console.log(`[Inc42] Failed: ${e.message}`);
    return [];
  }
  const items = parseRssItems(xml);
  console.log(`[Inc42] ${items.length} items. Filtering for BLR/Kochi...`);

  const filtered = items
    .filter(it => isBlrOrKochi(`${it.title} ${it.description}`))
    .map(it => ({
      source: 'INC42',
      title: it.title.slice(0, 140),
      company: '',
      url: it.link,
      snippet: stripHtml(it.description).slice(0, 280).replace(/\s+/g, ' ').trim(),
      posted_at: it.pubDate || null,
    }))
    .slice(0, 12);

  console.log(`[Inc42] ${filtered.length} BLR/Kochi-relevant items.`);
  return filtered;
}

// ============================================================
// Helpers
// ============================================================
function stripHtml(s) {
  if (!s) return '';
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x?\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRssItems(xml) {
  // Cheap-and-cheerful RSS parser. Good enough for well-formed feeds.
  const items = [];
  const itemRe = /<item\b[\s\S]*?<\/item>/g;
  const matches = xml.match(itemRe) || [];
  for (const block of matches) {
    items.push({
      title: extractTag(block, 'title'),
      link: extractTag(block, 'link'),
      pubDate: extractTag(block, 'pubDate'),
      description: extractTag(block, 'description'),
    });
  }
  return items;
}

function extractTag(block, tag) {
  // Handle CDATA and plain content
  const re = new RegExp(`<${tag}[^>]*>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))\\s*<\\/${tag}>`, 'i');
  const m = block.match(re);
  if (!m) return '';
  return (m[1] || m[2] || '').trim();
}

// ============================================================
// Run all sources in parallel, write feed.json
// ============================================================
const [hnJobs, remoteOkJobs, inc42Items] = await Promise.all([
  fetchHN().catch(e => { console.error('[HN] error:', e.message); return []; }),
  fetchRemoteOK().catch(e => { console.error('[RemoteOK] error:', e.message); return []; }),
  fetchInc42().catch(e => { console.error('[Inc42] error:', e.message); return []; }),
]);

const allItems = [...hnJobs, ...remoteOkJobs, ...inc42Items]
  // Sort newest first when we have dates; items without dates go last
  .sort((a, b) => {
    const aT = a.posted_at ? new Date(a.posted_at).getTime() : 0;
    const bT = b.posted_at ? new Date(b.posted_at).getTime() : 0;
    return bT - aT;
  });

const out = {
  generated_at: new Date().toISOString(),
  sources: {
    hn: hnJobs.length,
    remoteok: remoteOkJobs.length,
    inc42: inc42Items.length,
  },
  items: allItems,
};

await writeFile(OUT, JSON.stringify(out, null, 2));
console.log(`\nWrote ${allItems.length} items to feed.json`);
console.log(`HN: ${hnJobs.length}  RemoteOK: ${remoteOkJobs.length}  Inc42: ${inc42Items.length}`);

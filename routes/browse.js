const express = require('express');
const router = express.Router();
const { requireAuth } = require('./auth');
const sanitizeHtml = require('sanitize-html');

router.use(requireAuth);

// Dynamically import node-fetch (ESM)
let fetch;
async function getFetch() {
  if (!fetch) {
    const mod = await import('node-fetch');
    fetch = mod.default;
  }
  return fetch;
}

// Load cheerio dynamically
let cheerio;
async function getCheerio() {
  if (!cheerio) {
    cheerio = await import('cheerio');
  }
  return cheerio;
}

const FETCH_TIMEOUT = 15000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// POST /api/browse/fetch — fetch and sanitize a URL
router.post('/fetch', async (req, res) => {
  try {
    let { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    // Normalize URL
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    const f = await getFetch();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const response = await f(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
      redirect: 'follow'
    });
    clearTimeout(timeout);

    const contentType = response.headers.get('content-type') || '';
    const html = await response.text();
    const ch = await getCheerio();
    const $ = ch.load(html);

    // Extract metadata
    const title = $('title').first().text().trim() || url;
    const links = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href && text && !href.startsWith('javascript:')) {
        try {
          const resolved = new URL(href, url).href;
          links.push({ href: resolved, text: text.substring(0, 200) });
        } catch (_) {
          links.push({ href, text: text.substring(0, 200) });
        }
      }
    });

    // Sanitize HTML for display
    const sanitized = sanitizeHtml(html, {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'figure', 'figcaption', 'article', 'section', 'nav', 'main', 'header', 'footer', 'aside', 'details', 'summary', 'time']),
      allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        img: ['src', 'alt', 'width', 'height'],
        a: ['href', 'title'],
        '*': ['class', 'id']
      },
      allowedSchemes: ['http', 'https', 'data'],
      transformTags: {
        'a': (tagName, attribs) => {
          if (attribs.href) {
            try { attribs.href = new URL(attribs.href, url).href; } catch (_) {}
          }
          return { tagName, attribs };
        },
        'img': (tagName, attribs) => {
          if (attribs.src) {
            try { attribs.src = new URL(attribs.src, url).href; } catch (_) {}
          }
          return { tagName, attribs };
        }
      }
    });

    // Extract text content for AI consumption
    $('script, style, noscript, svg').remove();
    const textContent = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 8000);

    res.json({ title, url: response.url, sanitizedHtml: sanitized, textContent, links: links.slice(0, 100), contentType });
  } catch (err) {
    console.error('Browse fetch error:', err.message);
    res.status(500).json({ error: `Failed to fetch: ${err.message}` });
  }
});

// POST /api/browse/search — DuckDuckGo search
router.post('/search', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query is required' });

    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&ia=web`;
    const f = await getFetch();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const response = await f(searchUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
      redirect: 'follow'
    });
    clearTimeout(timeout);

    const html = await response.text();
    const ch = await getCheerio();
    const $ = ch.load(html);

    // Extract search result links
    const results = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href && text && href.startsWith('http') && !href.includes('duckduckgo.com')) {
        results.push({ href, text: text.substring(0, 300) });
      }
    });

    const sanitized = sanitizeHtml(html, {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'h3']),
      allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, img: ['src', 'alt'], a: ['href'] }
    });

    res.json({ query, searchUrl, sanitizedHtml: sanitized, results: results.slice(0, 30) });
  } catch (err) {
    console.error('Browse search error:', err.message);
    res.status(500).json({ error: `Search failed: ${err.message}` });
  }
});

// POST /api/browse/extract-links — extract all links from HTML
router.post('/extract-links', async (req, res) => {
  try {
    const { html, baseUrl } = req.body;
    if (!html) return res.status(400).json({ error: 'HTML is required' });

    const ch = await getCheerio();
    const $ = ch.load(html);
    const links = [];

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href && !href.startsWith('javascript:')) {
        let resolved = href;
        if (baseUrl) { try { resolved = new URL(href, baseUrl).href; } catch (_) {} }
        links.push({ href: resolved, text: text.substring(0, 200) });
      }
    });

    res.json({ links });
  } catch (err) {
    res.status(500).json({ error: 'Failed to extract links' });
  }
});

// POST /api/browse/download — download file as base64
router.post('/download', async (req, res) => {
  try {
    let { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    // Normalize URL
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    const f = await getFetch();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await f(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
      redirect: 'follow'
    });
    clearTimeout(timeout);

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    const maxSize = (parseInt(process.env.MAX_FILE_SIZE_MB) || 5) * 1024 * 1024;
    if (buffer.byteLength > maxSize) {
      return res.status(413).json({ error: 'File too large' });
    }

    res.json({ base64, contentType, size: buffer.byteLength, url: response.url });
  } catch (err) {
    console.error('Download error:', err.message);
    res.status(500).json({ error: `Download failed: ${err.message}` });
  }
});

module.exports = router;

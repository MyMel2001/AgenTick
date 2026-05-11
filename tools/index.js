// Tool registry — definitions for LLM function-calling and executor functions
const { files, notes } = require('../db');
const { VirtualCLI } = require('./cli');
const { askLLM } = require('./llm');
const { v4: uuidv4 } = require('uuid');

// Persistent CLI instances per user session
const cliInstances = new Map();
function getCLI(userId) {
  if (!cliInstances.has(userId)) cliInstances.set(userId, new VirtualCLI(userId));
  return cliInstances.get(userId);
}

// Tool definitions for LLM function-calling
const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'note',
      description: 'Create or update a note. Use this to save information, reminders, or any text content.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Title of the note' },
          content: { type: 'string', description: 'Content/body of the note (plaintext, will be encrypted)' },
          action: { type: 'string', enum: ['create', 'update', 'delete', 'list'], description: 'Action to perform' },
          noteId: { type: 'string', description: 'Note ID (required for update/delete)' }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'go_to_url',
      description: 'Navigate the virtual browser to a specific URL. Returns the page title, text content, and links.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The full URL to navigate to (include https://)' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web using DuckDuckGo. Returns search results with titles and URLs.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'go_to_link',
      description: 'Find and follow a link on the current page by describing what link you want. The current page links are analyzed and the best matching link is followed.',
      parameters: {
        type: 'object',
        properties: {
          linkDescription: { type: 'string', description: 'Natural language description of the link to find and follow' },
          currentPageUrl: { type: 'string', description: 'URL of the current page to find links on' }
        },
        required: ['linkDescription', 'currentPageUrl']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'save_file_from_net',
      description: 'Save a file from the internet to the virtual filesystem. Can find download links smartly or use a direct URL.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Direct URL to download, OR a page URL to find the download link on' },
          linkDescription: { type: 'string', description: 'If url is a page, describe which download link to find' },
          savePath: { type: 'string', description: 'Path in virtual filesystem to save the file' },
          fileDescription: { type: 'string', description: 'Description of the file for later search/retrieval' }
        },
        required: ['url', 'savePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'limited_cli',
      description: 'Execute commands in a virtual unix-like shell. Supports: ls, cat, mkdir, rm, cp, mv, pwd, cd, touch, find, echo, head, tail, wc, grep, help.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'file_read',
      description: 'Read a file from the virtual filesystem. Returns the file content.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the file in the virtual filesystem' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'file_write_and_replace',
      description: 'Write content to a file in the virtual filesystem, replacing any existing content.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path for the file' },
          content: { type: 'string', description: 'The text content to write' },
          description: { type: 'string', description: 'Description of the file for search' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'file_append',
      description: 'Append content to an existing file in the virtual filesystem.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the file' },
          content: { type: 'string', description: 'The text content to append' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: 'Get the current local date and time of the system.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  }
];

// Browse helper — shared fetch logic
let fetchFn;
async function doFetch(url) {
  if (!fetchFn) { const mod = await import('node-fetch'); fetchFn = mod.default; }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const resp = await fetchFn(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    signal: controller.signal, redirect: 'follow'
  });
  clearTimeout(timeout);
  return resp;
}

async function fetchPage(url) {
  const resp = await doFetch(url);
  const html = await resp.text();
  const cheerio = await import('cheerio');
  const $ = cheerio.load(html);
  const title = $('title').first().text().trim() || url;
  $('script, style, noscript, svg').remove();
  const textContent = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 6000);
  const links = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (href && text && !href.startsWith('javascript:')) {
      try { links.push({ href: new URL(href, url).href, text: text.substring(0, 150) }); } catch (_) {}
    }
  });
  return { title, textContent, links: links.slice(0, 80), url: resp.url, html };
}

// Tool executors
async function executeTool(toolName, args, context) {
  const userId = context.userId;

  switch (toolName) {
    case 'note': {
      if (args.action === 'list') {
        const allNotes = await notes.all();
        const prefix = `note_${userId}_`;
        const list = allNotes.filter(n => n.id.startsWith(prefix)).map(n => ({ id: n.value.id, title: n.value.title, updatedAt: n.value.updatedAt }));
        return JSON.stringify({ notes: list });
      }
      if (args.action === 'create') {
        const id = uuidv4();
        const now = new Date().toISOString();
        await notes.set(`note_${userId}_${id}`, { id, title: args.title || 'Untitled', encryptedContent: '', iv: '', salt: '', plaintext: args.content || '', createdAt: now, updatedAt: now });
        return JSON.stringify({ success: true, noteId: id, title: args.title });
      }
      if (args.action === 'update' && args.noteId) {
        const key = `note_${userId}_${args.noteId}`;
        const existing = await notes.get(key);
        if (!existing) return JSON.stringify({ error: 'Note not found' });
        await notes.set(key, { ...existing, title: args.title || existing.title, plaintext: args.content !== undefined ? args.content : existing.plaintext, updatedAt: new Date().toISOString() });
        return JSON.stringify({ success: true });
      }
      if (args.action === 'delete' && args.noteId) {
        await notes.delete(`note_${userId}_${args.noteId}`);
        return JSON.stringify({ success: true });
      }
      return JSON.stringify({ error: 'Invalid note action' });
    }

    case 'go_to_url': {
      try {
        const page = await fetchPage(args.url);
        context.currentPageUrl = page.url;
        context.currentPageLinks = page.links;
        return JSON.stringify({ title: page.title, url: page.url, textContent: page.textContent, linkCount: page.links.length });
      } catch (err) {
        return JSON.stringify({ error: `Failed to fetch: ${err.message}` });
      }
    }

    case 'web_search': {
      try {
        const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(args.query)}&ia=web`;
        const page = await fetchPage(searchUrl);
        context.currentPageUrl = searchUrl;
        context.currentPageLinks = page.links;
        const externalLinks = page.links.filter(l => !l.href.includes('duckduckgo.com'));
        return JSON.stringify({ query: args.query, results: externalLinks.slice(0, 15), pageText: page.textContent.substring(0, 3000) });
      } catch (err) {
        return JSON.stringify({ error: `Search failed: ${err.message}` });
      }
    }

    case 'go_to_link': {
      try {
        // First fetch the current page to get links
        const page = await fetchPage(args.currentPageUrl);
        const linksText = page.links.map((l, i) => `[${i}] ${l.text} -> ${l.href}`).join('\n');
        // Ask LLM to pick the best link
        const prompt = `Given these links from the page "${page.title}":\n\n${linksText}\n\nThe user wants to go to: "${args.linkDescription}"\n\nRespond with ONLY the URL of the best matching link. Nothing else.`;
        const chosenUrl = (await askLLM('You are a link selector. Respond with only a URL, no other text.', prompt)).trim();
        if (!chosenUrl || !chosenUrl.startsWith('http')) {
          return JSON.stringify({ error: 'Could not find matching link' });
        }
        const targetPage = await fetchPage(chosenUrl);
        context.currentPageUrl = targetPage.url;
        context.currentPageLinks = targetPage.links;
        return JSON.stringify({ navigatedTo: targetPage.url, title: targetPage.title, textContent: targetPage.textContent, linkCount: targetPage.links.length });
      } catch (err) {
        return JSON.stringify({ error: `Navigation failed: ${err.message}` });
      }
    }

    case 'save_file_from_net': {
      try {
        let downloadUrl = args.url;
        // If linkDescription provided, find the right link first
        if (args.linkDescription) {
          const page = await fetchPage(args.url);
          const linksText = page.links.map((l, i) => `[${i}] ${l.text} -> ${l.href}`).join('\n');
          const prompt = `Given these links:\n\n${linksText}\n\nThe user wants to download: "${args.linkDescription}"\n\nRespond with ONLY the URL of the download link. Nothing else.`;
          downloadUrl = (await askLLM('You are a link selector. Respond with only a URL.', prompt)).trim();
        }
        const resp = await doFetch(downloadUrl);
        const buffer = await resp.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const contentType = resp.headers.get('content-type') || 'application/octet-stream';
        // Store the file (unencrypted base64 for simplicity in tool execution; client can re-encrypt)
        const now = new Date().toISOString();
        await files.set(`file_${userId}_${args.savePath}`, {
          path: args.savePath, encryptedContent: base64, iv: '', salt: '',
          isDirectory: false, description: args.fileDescription || '', mimeType: contentType,
          createdAt: now, updatedAt: now
        });
        return JSON.stringify({ success: true, path: args.savePath, size: buffer.byteLength, contentType });
      } catch (err) {
        return JSON.stringify({ error: `Download failed: ${err.message}` });
      }
    }

    case 'limited_cli': {
      const cli = getCLI(userId);
      const result = await cli.execute(args.command);
      return JSON.stringify(result);
    }

    case 'file_read': {
      const key = `file_${userId}_${args.path}`;
      const file = await files.get(key);
      if (!file) return JSON.stringify({ error: 'File not found' });
      if (file.isDirectory) return JSON.stringify({ error: 'Is a directory' });
      // Return plaintext if available, otherwise encrypted indicator
      if (file.plaintext !== undefined) return JSON.stringify({ content: file.plaintext, path: args.path });
      if (file.encryptedContent && !file.iv) return JSON.stringify({ content: file.encryptedContent, path: args.path, encoding: 'base64' });
      return JSON.stringify({ content: '[encrypted — client decryption required]', path: args.path, encrypted: true });
    }

    case 'file_write_and_replace': {
      const now = new Date().toISOString();
      const key = `file_${userId}_${args.path}`;
      const existing = await files.get(key);
      await files.set(key, {
        path: args.path, encryptedContent: '', iv: '', salt: '',
        isDirectory: false, description: args.description || (existing ? existing.description : ''),
        mimeType: 'text/plain', plaintext: args.content,
        createdAt: existing ? existing.createdAt : now, updatedAt: now
      });
      return JSON.stringify({ success: true, path: args.path, bytesWritten: args.content.length });
    }

    case 'file_append': {
      const key = `file_${userId}_${args.path}`;
      const existing = await files.get(key);
      if (!existing) return JSON.stringify({ error: 'File not found. Use file_write_and_replace to create it.' });
      const currentContent = existing.plaintext || existing.encryptedContent || '';
      const newContent = currentContent + args.content;
      await files.set(key, { ...existing, plaintext: newContent, encryptedContent: '', updatedAt: new Date().toISOString() });
      return JSON.stringify({ success: true, path: args.path, bytesAppended: args.content.length });
    }

    case 'get_current_time': {
      return JSON.stringify({ currentTime: new Date().toLocaleString() });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

module.exports = { toolDefinitions, executeTool };

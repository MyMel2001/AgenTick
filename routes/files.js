const express = require('express');
const router = express.Router();
const { requireAuth } = require('./auth');
const { files } = require('../db');

router.use(requireAuth);

// GET /api/files/list?path=/
router.get('/list', async (req, res) => {
  try {
    const userId = req.session.userId;
    const dirPath = (req.query.path || '/').replace(/\/+$/, '') || '/';

    const allFiles = await files.all();
    const prefix = `file_${userId}_`;

    const entries = [];
    const seen = new Set();

    for (const entry of allFiles) {
      if (!entry.id.startsWith(prefix)) continue;
      const file = entry.value;

      // Check if file is a direct child of dirPath
      const filePath = file.path;
      if (dirPath === '/') {
        // Root: get top-level entries
        const parts = filePath.split('/').filter(Boolean);
        if (parts.length >= 1) {
          const topLevel = '/' + parts[0];
          if (!seen.has(topLevel)) {
            seen.add(topLevel);
            if (parts.length === 1) {
              entries.push({
                name: parts[0],
                path: filePath,
                isDirectory: file.isDirectory || false,
                description: file.description || '',
                createdAt: file.createdAt,
                updatedAt: file.updatedAt,
                size: file.encryptedContent ? file.encryptedContent.length : 0
              });
            } else {
              entries.push({
                name: parts[0],
                path: '/' + parts[0],
                isDirectory: true,
                description: '',
                createdAt: file.createdAt,
                updatedAt: file.updatedAt,
                size: 0
              });
            }
          }
        }
      } else {
        // Subdirectory: get direct children
        if (filePath.startsWith(dirPath + '/')) {
          const relative = filePath.slice(dirPath.length + 1);
          const parts = relative.split('/').filter(Boolean);
          if (parts.length >= 1) {
            const childPath = dirPath + '/' + parts[0];
            if (!seen.has(childPath)) {
              seen.add(childPath);
              if (parts.length === 1) {
                entries.push({
                  name: parts[0],
                  path: filePath,
                  isDirectory: file.isDirectory || false,
                  description: file.description || '',
                  createdAt: file.createdAt,
                  updatedAt: file.updatedAt,
                  size: file.encryptedContent ? file.encryptedContent.length : 0
                });
              } else {
                entries.push({
                  name: parts[0],
                  path: childPath,
                  isDirectory: true,
                  description: '',
                  createdAt: file.createdAt,
                  updatedAt: file.updatedAt,
                  size: 0
                });
              }
            }
          }
        }
      }
    }

    res.json({ path: dirPath, entries });
  } catch (err) {
    console.error('File list error:', err);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// GET /api/files/read?path=/path/to/file
router.get('/read', async (req, res) => {
  try {
    const userId = req.session.userId;
    const filePath = req.query.path;

    if (!filePath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    const key = `file_${userId}_${filePath}`;
    const file = await files.get(key);

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json({
      path: file.path,
      encryptedContent: file.encryptedContent,
      iv: file.iv,
      salt: file.salt,
      isDirectory: file.isDirectory || false,
      description: file.description || '',
      mimeType: file.mimeType || 'text/plain',
      createdAt: file.createdAt,
      updatedAt: file.updatedAt
    });
  } catch (err) {
    console.error('File read error:', err);
    res.status(500).json({ error: 'Failed to read file' });
  }
});

// POST /api/files/write
router.post('/write', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { path: filePath, encryptedContent, iv, salt, description, mimeType } = req.body;

    if (!filePath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    const maxSize = (parseInt(process.env.MAX_FILE_SIZE_MB) || 5) * 1024 * 1024;
    if (encryptedContent && encryptedContent.length > maxSize) {
      return res.status(413).json({ error: 'File too large' });
    }

    const key = `file_${userId}_${filePath}`;
    const existing = await files.get(key);
    const now = new Date().toISOString();

    await files.set(key, {
      path: filePath,
      encryptedContent: encryptedContent || '',
      iv: iv || '',
      salt: salt || '',
      isDirectory: false,
      description: description || '',
      mimeType: mimeType || 'text/plain',
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    });

    res.json({ success: true, path: filePath });
  } catch (err) {
    console.error('File write error:', err);
    res.status(500).json({ error: 'Failed to write file' });
  }
});

// POST /api/files/append
router.post('/append', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { path: filePath, encryptedContent, iv, salt } = req.body;

    if (!filePath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    const key = `file_${userId}_${filePath}`;
    const now = new Date().toISOString();

    // For E2E encrypted files, "append" means the client has already
    // decrypted, appended, and re-encrypted the content. We just overwrite.
    const existing = await files.get(key);

    await files.set(key, {
      path: filePath,
      encryptedContent: encryptedContent || '',
      iv: iv || '',
      salt: salt || '',
      isDirectory: false,
      description: existing ? existing.description : '',
      mimeType: existing ? existing.mimeType : 'text/plain',
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    });

    res.json({ success: true, path: filePath });
  } catch (err) {
    console.error('File append error:', err);
    res.status(500).json({ error: 'Failed to append to file' });
  }
});

// POST /api/files/mkdir
router.post('/mkdir', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { path: dirPath } = req.body;

    if (!dirPath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    const key = `file_${userId}_${dirPath}`;
    const now = new Date().toISOString();

    await files.set(key, {
      path: dirPath,
      encryptedContent: '',
      iv: '',
      salt: '',
      isDirectory: true,
      description: '',
      mimeType: '',
      createdAt: now,
      updatedAt: now
    });

    res.json({ success: true, path: dirPath });
  } catch (err) {
    console.error('Mkdir error:', err);
    res.status(500).json({ error: 'Failed to create directory' });
  }
});

// DELETE /api/files/delete?path=/path/to/file
router.delete('/delete', async (req, res) => {
  try {
    const userId = req.session.userId;
    const filePath = req.query.path;

    if (!filePath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    const key = `file_${userId}_${filePath}`;
    const file = await files.get(key);

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // If directory, delete all children
    if (file.isDirectory) {
      const allFiles = await files.all();
      const prefix = `file_${userId}_${filePath}/`;
      for (const entry of allFiles) {
        if (entry.id.startsWith(prefix) || entry.id === key) {
          await files.delete(entry.id);
        }
      }
    }

    await files.delete(key);
    res.json({ success: true });
  } catch (err) {
    console.error('File delete error:', err);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// GET /api/files/search?q=query
router.get('/search', async (req, res) => {
  try {
    const userId = req.session.userId;
    const query = (req.query.q || '').toLowerCase();

    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const allFiles = await files.all();
    const prefix = `file_${userId}_`;
    const results = [];

    for (const entry of allFiles) {
      if (!entry.id.startsWith(prefix)) continue;
      const file = entry.value;
      if (file.isDirectory) continue;

      const matchesPath = file.path.toLowerCase().includes(query);
      const matchesDesc = (file.description || '').toLowerCase().includes(query);

      if (matchesPath || matchesDesc) {
        results.push({
          path: file.path,
          description: file.description || '',
          mimeType: file.mimeType || 'text/plain',
          createdAt: file.createdAt,
          updatedAt: file.updatedAt
        });
      }
    }

    res.json({ results });
  } catch (err) {
    console.error('File search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;

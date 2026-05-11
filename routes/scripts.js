const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('./auth');
const { scripts } = require('../db');

router.use(requireAuth);

// GET /api/scripts — list all user scripts
router.get('/', async (req, res) => {
  try {
    const userId = req.session.userId;
    const all = await scripts.all();
    const prefix = `script_${userId}_`;
    const userScripts = all
      .filter(s => s.id.startsWith(prefix))
      .map(s => s.value)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ scripts: userScripts });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list scripts' });
  }
});

// POST /api/scripts
router.post('/', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { name, description, code, language } = req.body;

    if (!name || !code) return res.status(400).json({ error: 'Name and code are required' });

    const id = uuidv4();
    const now = new Date().toISOString();

    const script = {
      id,
      userId,
      name,
      description: description || '',
      code,
      language: language || 'javascript',
      createdAt: now,
      updatedAt: now
    };

    await scripts.set(`script_${userId}_${id}`, script);
    res.json({ success: true, script });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create script' });
  }
});

// PUT /api/scripts/:id
router.put('/:id', async (req, res) => {
  try {
    const userId = req.session.userId;
    const key = `script_${userId}_${req.params.id}`;
    const existing = await scripts.get(key);

    if (!existing) return res.status(404).json({ error: 'Script not found' });

    const { name, description, code, language } = req.body;
    const updated = {
      ...existing,
      name: name !== undefined ? name : existing.name,
      description: description !== undefined ? description : existing.description,
      code: code !== undefined ? code : existing.code,
      language: language !== undefined ? language : existing.language,
      updatedAt: new Date().toISOString()
    };

    await scripts.set(key, updated);
    res.json({ success: true, script: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update script' });
  }
});

// DELETE /api/scripts/:id
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.session.userId;
    const key = `script_${userId}_${req.params.id}`;
    if (!(await scripts.get(key))) return res.status(404).json({ error: 'Script not found' });
    await scripts.delete(key);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete script' });
  }
});

module.exports = router;

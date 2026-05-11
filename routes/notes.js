const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('./auth');
const { notes } = require('../db');

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const userId = req.session.userId;
    const allNotes = await notes.all();
    const prefix = `note_${userId}_`;
    const list = allNotes
      .filter(n => n.id.startsWith(prefix))
      .map(n => ({ id: n.value.id, title: n.value.title, createdAt: n.value.createdAt, updatedAt: n.value.updatedAt }))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    res.json({ notes: list });
  } catch (err) { res.status(500).json({ error: 'Failed to list notes' }); }
});

router.get('/:id', async (req, res) => {
  try {
    const userId = req.session.userId;
    const note = await notes.get(`note_${userId}_${req.params.id}`);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    res.json({ note });
  } catch (err) { res.status(500).json({ error: 'Failed to get note' }); }
});

router.post('/', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { title, encryptedContent, iv, salt } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const id = uuidv4();
    const now = new Date().toISOString();
    const note = { id, title, encryptedContent: encryptedContent || '', iv: iv || '', salt: salt || '', createdAt: now, updatedAt: now };
    await notes.set(`note_${userId}_${id}`, note);
    res.json({ success: true, note });
  } catch (err) { res.status(500).json({ error: 'Failed to create note' }); }
});

router.put('/:id', async (req, res) => {
  try {
    const userId = req.session.userId;
    const key = `note_${userId}_${req.params.id}`;
    const existing = await notes.get(key);
    if (!existing) return res.status(404).json({ error: 'Note not found' });
    const { title, encryptedContent, iv, salt } = req.body;
    const updated = { ...existing, title: title !== undefined ? title : existing.title, encryptedContent: encryptedContent !== undefined ? encryptedContent : existing.encryptedContent, iv: iv !== undefined ? iv : existing.iv, salt: salt !== undefined ? salt : existing.salt, updatedAt: new Date().toISOString() };
    await notes.set(key, updated);
    res.json({ success: true, note: updated });
  } catch (err) { res.status(500).json({ error: 'Failed to update note' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const userId = req.session.userId;
    const key = `note_${userId}_${req.params.id}`;
    if (!(await notes.get(key))) return res.status(404).json({ error: 'Note not found' });
    await notes.delete(key);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete note' }); }
});

module.exports = router;

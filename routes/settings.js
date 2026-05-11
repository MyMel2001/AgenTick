const express = require('express');
const router = express.Router();
const { requireAuth } = require('./auth');
const { settings } = require('../db');

router.use(requireAuth);

// GET /api/settings
router.get('/', async (req, res) => {
  try {
    const userId = req.session.userId;
    const userSettings = await settings.get(`settings_${userId}`);

    res.json({
      settings: userSettings || {
        identity: '',
        wallpaperUrl: '',
        theme: 'dark',
        displayName: req.session.username
      }
    });
  } catch (err) {
    console.error('Settings get error:', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/settings
router.put('/', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { identity, wallpaperUrl, theme, displayName } = req.body;

    const existing = await settings.get(`settings_${userId}`) || {};

    const updated = {
      identity: identity !== undefined ? identity : existing.identity || '',
      wallpaperUrl: wallpaperUrl !== undefined ? wallpaperUrl : existing.wallpaperUrl || '',
      theme: theme !== undefined ? theme : existing.theme || 'dark',
      displayName: displayName !== undefined ? displayName : existing.displayName || ''
    };

    await settings.set(`settings_${userId}`, updated);
    res.json({ success: true, settings: updated });
  } catch (err) {
    console.error('Settings update error:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

module.exports = router;

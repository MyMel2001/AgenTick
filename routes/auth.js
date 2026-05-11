const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { users, settings } = require('../db');

const SALT_ROUNDS = 12;

// Middleware: require authentication
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (username.length < 3 || username.length > 32) {
      return res.status(400).json({ error: 'Username must be 3-32 characters' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return res.status(400).json({ error: 'Username may only contain letters, numbers, hyphens, and underscores' });
    }

    // Check if user exists
    const existing = await users.get(`user_${username.toLowerCase()}`);
    if (existing) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    await users.set(`user_${username.toLowerCase()}`, {
      id,
      username: username.toLowerCase(),
      passwordHash,
      createdAt: new Date().toISOString()
    });

    // Create default settings
    await settings.set(`settings_${id}`, {
      identity: '',
      wallpaperUrl: '',
      theme: 'dark',
      displayName: username
    });

    // Auto-login
    req.session.regenerate((err) => {
      if (err) {
        return res.status(500).json({ error: 'Session error' });
      }
      req.session.userId = id;
      req.session.username = username.toLowerCase();
      req.session.save((err) => {
        if (err) {
          return res.status(500).json({ error: 'Session save error' });
        }
        res.json({ success: true, user: { id, username: username.toLowerCase() } });
      });
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await users.get(`user_${username.toLowerCase()}`);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    req.session.regenerate((err) => {
      if (err) {
        return res.status(500).json({ error: 'Session error' });
      }
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.save((err) => {
        if (err) {
          return res.status(500).json({ error: 'Session save error' });
        }
        res.json({ success: true, user: { id: user.id, username: user.username } });
      });
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({
    user: {
      id: req.session.userId,
      username: req.session.username
    }
  });
});

module.exports = router;
module.exports.requireAuth = requireAuth;

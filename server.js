require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Security headers (relaxed CSP for our inline needs)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'"],
      frameSrc: ["'self'", "blob:"],
    }
  }
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Session setup with SQLite store
app.use(session({
  store: new SQLiteStore({
    db: 'sessions.sqlite',
    dir: dataDir,
    concurrentDB: true
  }),
  secret: process.env.SESSION_SECRET || 'agentick-fallback-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false, // set true behind HTTPS reverse proxy
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
  }
}));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// Auth rate limiting (stricter)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth/', authLimiter);

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/files', require('./routes/files'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/notes', require('./routes/notes'));
app.use('/api/browse', require('./routes/browse'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/cron', require('./routes/cron'));
app.use('/api/scripts', require('./routes/scripts'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start heartbeat cron engine
const { startHeartbeat } = require('./cron/engine');
startHeartbeat();

app.listen(PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════╗`);
  console.log(`  ║        AgenTick OS v1.0.0            ║`);
  console.log(`  ║   Agentic AI Operating System        ║`);
  console.log(`  ╠══════════════════════════════════════╣`);
  console.log(`  ║  → http://localhost:${PORT}             ║`);
  console.log(`  ║  → LLM: ${process.env.LLM_MODEL || 'not configured'}`);
  console.log(`  ╚══════════════════════════════════════╝\n`);
});

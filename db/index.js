const { QuickDB } = require('quick.db');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new QuickDB({ filePath: path.join(dataDir, 'agentick.sqlite') });

// Table namespaces
const users = db.table('users');
const files = db.table('files');
const settings = db.table('settings');
const cronJobs = db.table('cron_jobs');
const notes = db.table('notes');
const cronLogs = db.table('cron_logs');
const scripts = db.table('scripts');

module.exports = { db, users, files, settings, cronJobs, notes, cronLogs, scripts };

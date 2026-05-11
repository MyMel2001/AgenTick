const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('./auth');
const { cronJobs, cronLogs } = require('../db');
const { askLLM } = require('../tools/llm');

router.use(requireAuth);

// GET /api/cron — list user's cron jobs
router.get('/', async (req, res) => {
  try {
    const userId = req.session.userId;
    const all = await cronJobs.all();
    const prefix = `cron_${userId}_`;
    const jobs = all
      .filter(e => e.id.startsWith(prefix))
      .map(e => e.value)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ jobs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list jobs' });
  }
});

// POST /api/cron — create a cron job via natural language
router.post('/', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { description } = req.body;

    if (!description) return res.status(400).json({ error: 'Description is required' });

    // Ask AI to parse the natural language into a structured job
    const parsePrompt = `Parse this scheduled task request into a JSON object. The user said: "${description}"

Return ONLY valid JSON with these fields:
{
  "conditionType": "interval" | "schedule" | "daily",
  "intervalMinutes": <number, only for interval type>,
  "scheduleTime": "<HH:MM, for schedule/daily types>",
  "action": "<what the AI should do when triggered, as a clear instruction>",
  "summary": "<short human-readable summary of the job>"
}

Examples:
- "Check the weather every 2 hours" → {"conditionType":"interval","intervalMinutes":120,"action":"Search the web for current weather and save a note with the results","summary":"Check weather every 2 hours"}
- "Every day at 9am, list my files" → {"conditionType":"daily","scheduleTime":"09:00","action":"List all files in the virtual filesystem and create a summary note","summary":"Daily file listing at 9:00 AM"}`;

    const aiResponse = await askLLM('You parse scheduling requests into JSON. Return ONLY valid JSON.', parsePrompt);

    let parsed;
    try {
      // Extract JSON from response
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      parsed = JSON.parse(jsonMatch[0]);
    } catch (_) {
      return res.status(400).json({ error: 'Could not parse the job description. Please be more specific about when and what.' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    const job = {
      id,
      userId,
      description: parsed.summary || description,
      conditionType: parsed.conditionType || 'interval',
      intervalMinutes: parsed.intervalMinutes || 60,
      scheduleTime: parsed.scheduleTime || '09:00',
      action: parsed.action || description,
      active: true,
      lastRun: null,
      createdAt: now
    };

    await cronJobs.set(`cron_${userId}_${id}`, job);
    res.json({ success: true, job });
  } catch (err) {
    console.error('Cron create error:', err);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// DELETE /api/cron/:id
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.session.userId;
    const key = `cron_${userId}_${req.params.id}`;
    const job = await cronJobs.get(key);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    await cronJobs.delete(key);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

// PATCH /api/cron/:id/toggle — toggle active/inactive
router.patch('/:id/toggle', async (req, res) => {
  try {
    const userId = req.session.userId;
    const key = `cron_${userId}_${req.params.id}`;
    const job = await cronJobs.get(key);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    job.active = !job.active;
    await cronJobs.set(key, job);
    res.json({ success: true, active: job.active });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle job' });
  }
});

// GET /api/cron/:id/logs
router.get('/:id/logs', async (req, res) => {
  try {
    const userId = req.session.userId;
    const all = await cronLogs.all();
    const logs = all
      .filter(e => e.value.jobId === req.params.id && e.value.userId === userId)
      .map(e => e.value)
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
      .slice(0, 50);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get logs' });
  }
});

module.exports = router;

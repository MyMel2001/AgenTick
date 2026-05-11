// Heartbeat cron engine — checks and executes scheduled jobs
const { cronJobs, cronLogs } = require('../db');
const { callLLM } = require('../tools/llm');
const { toolDefinitions, executeTool } = require('../tools');
const { v4: uuidv4 } = require('uuid');
const { settings } = require('../db');

const HEARTBEAT_INTERVAL = 60 * 1000; // 60 seconds

function shouldRun(job, now) {
  if (!job.active) return false;

  const lastRun = job.lastRun ? new Date(job.lastRun) : null;

  switch (job.conditionType) {
    case 'interval': {
      // Run every N minutes
      const intervalMs = (job.intervalMinutes || 60) * 60 * 1000;
      if (!lastRun) return true;
      return (now - lastRun) >= intervalMs;
    }
    case 'schedule': {
      // Run at specific HH:MM
      const [hours, minutes] = (job.scheduleTime || '00:00').split(':').map(Number);
      const nowH = now.getHours();
      const nowM = now.getMinutes();
      if (nowH === hours && nowM === minutes) {
        // Check we haven't run this minute already
        if (!lastRun) return true;
        const diffMs = now - lastRun;
        return diffMs > 60000;
      }
      return false;
    }
    case 'daily': {
      // Once per day at specified time
      const [dh, dm] = (job.scheduleTime || '09:00').split(':').map(Number);
      const nowH = now.getHours();
      const nowM = now.getMinutes();
      if (nowH === dh && nowM === dm) {
        if (!lastRun) return true;
        const lastDate = lastRun.toDateString();
        const todayDate = now.toDateString();
        return lastDate !== todayDate;
      }
      return false;
    }
    default:
      return false;
  }
}

async function executeJob(job) {
  const logId = uuidv4();
  const startTime = new Date().toISOString();

  try {
    const userSettings = await settings.get(`settings_${job.userId}`) || {};
    const identity = userSettings.identity || 'a user';

    const systemPrompt = `You are AgenTick AI executing a scheduled task. User identity: ${identity}. Execute the following task and report results concisely.`;
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: job.action }
    ];

    const context = { userId: job.userId, currentPageUrl: null, currentPageLinks: [] };
    let result = '';
    let iterations = 0;

    while (iterations < 5) {
      iterations++;
      const response = await callLLM(messages, { tools: toolDefinitions });
      const choice = response.choices?.[0];
      if (!choice) break;

      if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        messages.push(choice.message);
        for (const tc of choice.message.tool_calls) {
          let toolArgs;
          try { toolArgs = JSON.parse(tc.function.arguments); } catch (_) { toolArgs = {}; }
          const toolResult = await executeTool(tc.function.name, toolArgs, context);
          messages.push({ role: 'tool', tool_call_id: tc.id, content: toolResult });
        }
        continue;
      }

      result = choice.message.content || 'Task completed.';
      break;
    }

    // Log success
    await cronLogs.set(`log_${job.userId}_${logId}`, {
      id: logId, jobId: job.id, userId: job.userId,
      status: 'success', result: result.substring(0, 2000),
      startedAt: startTime, completedAt: new Date().toISOString()
    });

    // Update lastRun
    await cronJobs.set(`cron_${job.userId}_${job.id}`, {
      ...job, lastRun: new Date().toISOString()
    });

    console.log(`[CRON] Job "${job.description}" completed successfully`);
  } catch (err) {
    console.error(`[CRON] Job "${job.description}" failed:`, err.message);
    await cronLogs.set(`log_${job.userId}_${logId}`, {
      id: logId, jobId: job.id, userId: job.userId,
      status: 'error', result: err.message,
      startedAt: startTime, completedAt: new Date().toISOString()
    });
    await cronJobs.set(`cron_${job.userId}_${job.id}`, {
      ...job, lastRun: new Date().toISOString()
    });
  }
}

async function heartbeat() {
  try {
    const allJobs = await cronJobs.all();
    const now = new Date();

    for (const entry of allJobs) {
      const job = entry.value;
      if (shouldRun(job, now)) {
        // Run async — don't block the heartbeat
        executeJob(job).catch(err => console.error('[CRON] Execution error:', err.message));
      }
    }
  } catch (err) {
    console.error('[CRON] Heartbeat error:', err.message);
  }
}

function startHeartbeat() {
  console.log(`[CRON] Heartbeat engine started (interval: ${HEARTBEAT_INTERVAL / 1000}s)`);
  setInterval(heartbeat, HEARTBEAT_INTERVAL);
}

module.exports = { startHeartbeat, heartbeat, shouldRun };

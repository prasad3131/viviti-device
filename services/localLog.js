const fs = require('fs');
const path = require('path');
const config = require('../config');

const QUEUE_FILE = path.join(__dirname, '../logs-queue.json');

function readQueue() {
  try {
    if (fs.existsSync(QUEUE_FILE)) return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
  } catch {}
  return [];
}

function writeQueue(queue) {
  try { fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue)); } catch {}
}

function log(level, source, message, metadata) {
  const entry = { level, source, message, metadata: metadata || null, created_at: new Date().toISOString() };
  console.log(`[${level}] ${source}: ${message}`, metadata || '');

  const queue = readQueue();
  queue.push(entry);
  // keep at most 500 entries to avoid unbounded growth
  if (queue.length > 500) queue.splice(0, queue.length - 500);
  writeQueue(queue);
}

async function flushToApi() {
  const queue = readQueue();
  if (queue.length === 0) return;

  const failed = [];
  for (const entry of queue) {
    try {
      const res = await fetch(`${config.vivitiApiUrl}/api/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      if (!res.ok) failed.push(entry);
    } catch {
      failed.push(entry);
    }
  }

  writeQueue(failed);
  if (queue.length > failed.length) {
    console.log(`[logger] flushed ${queue.length - failed.length} logs to API (${failed.length} failed)`);
  }
}

module.exports = { log, flushToApi };

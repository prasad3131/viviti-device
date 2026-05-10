const config = require('../config');
const { getStorageStats } = require('./storage');

const INTERVAL_MS = 30 * 1000;
let timer = null;

async function sendHeartbeat() {
  const token = config.deviceToken;
  if (!token) return;

  const { total_bytes, available_bytes } = getStorageStats();
  await fetch(`${config.vivitiApiUrl}/api/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, total_bytes, available_bytes }),
  });
}

function startHeartbeat() {
  if (timer) return;
  sendHeartbeat().catch(() => {});
  timer = setInterval(() => sendHeartbeat().catch(() => {}), INTERVAL_MS);
  console.log('[heartbeat] started');
}

function stopHeartbeat() {
  if (timer) { clearInterval(timer); timer = null; }
  console.log('[heartbeat] stopped');
}

module.exports = { startHeartbeat, stopHeartbeat };

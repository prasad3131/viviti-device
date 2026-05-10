const config = require('../config');
const { getStorageStats } = require('./storage');

const INTERVAL_MS = 30 * 1000;

async function sendHeartbeat() {
  const token = config.deviceToken;
  if (!token) return;

  const { total_bytes, available_bytes } = getStorageStats();

  try {
    await fetch(`${config.vivitiApiUrl}/api/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, total_bytes, available_bytes }),
    });
    console.log(`[heartbeat] sent — storage: ${available_bytes} free`);
  } catch (err) {
    console.error('[heartbeat] failed:', err.message);
  }
}

function startHeartbeat() {
  sendHeartbeat();
  setInterval(sendHeartbeat, INTERVAL_MS);
}

module.exports = { startHeartbeat };

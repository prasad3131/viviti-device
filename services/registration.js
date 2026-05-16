const crypto = require('crypto');
const config = require('../config');
const { log } = require('./localLog');

async function tryRegister(name, ownerEmail, token) {
  const res = await fetch(`${config.vivitiApiUrl}/api/devices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, owner_email: ownerEmail, token, relay_url: config.relayUrl }),
  });

  if (!res.ok) {
    const err = await res.text();
    log('error', 'registration', 'Device registration failed', { status: res.status, error: err });
    return false;
  }

  const { device } = await res.json();
  config.saveConfig({ name, token, deviceId: device?.id ?? null, pendingName: null, pendingEmail: null });
  log('info', 'registration', 'Device registered successfully', { name, owner_email: ownerEmail });
  return true;
}

async function registerDevice(name, ownerEmail) {
  const token = crypto.randomBytes(32).toString('hex');
  const RETRIES = 3;
  const DELAY_MS = 10 * 1000;

  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const ok = await tryRegister(name, ownerEmail, token);
      if (ok) return true;
    } catch (err) {
      log('warn', 'registration', `Registration attempt ${attempt} failed`, { error: err.message });
    }
    if (attempt < RETRIES) await new Promise(r => setTimeout(r, DELAY_MS));
  }

  log('error', 'registration', 'All registration attempts failed', { name, owner_email: ownerEmail });
  return false;
}

function isRegistered() {
  return !!config.deviceToken;
}

module.exports = { registerDevice, isRegistered };

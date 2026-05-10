const crypto = require('crypto');
const config = require('../config');
const { log } = require('./localLog');

async function registerDevice(name, ownerEmail) {
  const token = crypto.randomBytes(32).toString('hex');

  try {
    const res = await fetch(`${config.vivitiApiUrl}/api/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, owner_email: ownerEmail, token }),
    });

    if (!res.ok) {
      const err = await res.text();
      log('error', 'registration', 'Device registration failed', { status: res.status, error: err });
      return false;
    }

    config.saveConfig({ name, token });
    log('info', 'registration', 'Device registered successfully', { name, owner_email: ownerEmail });
    return true;
  } catch (err) {
    log('error', 'registration', 'Device registration error', { error: err.message });
    return false;
  }
}

function isRegistered() {
  return !!config.deviceToken;
}

module.exports = { registerDevice, isRegistered };

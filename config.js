const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'device-config.json');

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  }
  return {};
}

function saveConfig(data) {
  const current = loadConfig();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ ...current, ...data }, null, 2));
}

const config = {
  port: process.env.PORT || 3000,
  photoDir: process.env.PHOTO_DIR || '/media/usb/photos',
  vivitiApiUrl: process.env.VIVITI_API_URL || 'https://vivitionline.com',
  relayUrl: process.env.RELAY_URL || '',
  hotspotSsid: 'Viviti-Setup',
  hotspotPassword: 'viviti123',
  get deviceToken() { return loadConfig().token || ''; },
  get deviceName() { return loadConfig().name || 'Viviti Device'; },
  get pendingName() { return loadConfig().pendingName || ''; },
  get pendingEmail() { return loadConfig().pendingEmail || ''; },
  saveConfig,
};

module.exports = config;

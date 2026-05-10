const { execSync, exec } = require('child_process');
const config = require('../config');

function isWifiConnected() {
  try {
    const out = execSync('nmcli -t -f TYPE,STATE d').toString();
    return out.split('\n').some(l => l.startsWith('wifi:connected'));
  } catch {
    return false;
  }
}

function scanWifiNetworks() {
  try {
    const out = execSync('nmcli -t -f SSID,SIGNAL,SECURITY d wifi list').toString();
    const networks = [];
    for (const line of out.split('\n')) {
      const parts = line.split(':');
      if (parts[0]) networks.push({ ssid: parts[0], signal: parts[1], security: parts[2] });
    }
    return networks.filter((n, i, arr) => n.ssid && arr.findIndex(x => x.ssid === n.ssid) === i);
  } catch {
    return [];
  }
}

function startHotspot() {
  try {
    execSync(`nmcli dev wifi hotspot ifname wlan0 ssid "${config.hotspotSsid}" password "${config.hotspotPassword}"`);
    console.log(`[wifi] Hotspot started: ${config.hotspotSsid}`);
  } catch (err) {
    console.error('[wifi] Failed to start hotspot:', err.message);
  }
}

function connectToWifi(ssid, password) {
  return new Promise((resolve, reject) => {
    exec(`nmcli dev wifi connect "${ssid}" password "${password}"`, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout);
    });
  });
}

function stopHotspot() {
  try {
    execSync('nmcli con down Hotspot 2>/dev/null || true');
  } catch {}
}

module.exports = { isWifiConnected, scanWifiNetworks, startHotspot, connectToWifi, stopHotspot };

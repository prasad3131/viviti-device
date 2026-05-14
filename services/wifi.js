const { execSync, exec } = require('child_process');
const fs = require('fs');
const config = require('../config');

const HOSTAPD_CONF = '/tmp/viviti-hostapd.conf';
const HOSTAPD_PID = '/tmp/viviti-hostapd.pid';
const DNSMASQ_PID = '/tmp/viviti-dnsmasq.pid';
const HOTSPOT_IP = '192.168.4.1';

let hotspotActive = false;
let cachedNetworks = [];

function isWifiConnected() {
  try {
    const out = execSync('nmcli -t -f TYPE,STATE d', { stdio: 'pipe' }).toString();
    return out.split('\n').some(l => l.startsWith('wifi:connected'));
  } catch {
    return false;
  }
}

function scanWifiNetworks() {
  if (hotspotActive) return cachedNetworks;
  try {
    execSync('nmcli dev wifi rescan', { stdio: 'ignore' });
  } catch {}
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
    cachedNetworks = scanWifiNetworks();

    fs.writeFileSync(HOSTAPD_CONF, [
      'interface=wlan0',
      'driver=nl80211',
      `ssid=${config.hotspotSsid}`,
      'hw_mode=g',
      'channel=6',
      'wmm_enabled=0',
      'macaddr_acl=0',
      'auth_algs=1',
      'ignore_broadcast_ssid=0',
      'wpa=2',
      `wpa_passphrase=${config.hotspotPassword}`,
      'wpa_key_mgmt=WPA-PSK',
      'wpa_pairwise=TKIP',
      'rsn_pairwise=CCMP',
    ].join('\n'));

    // Stop any existing system dnsmasq so we can bind wlan0
    try { execSync('systemctl stop dnsmasq', { stdio: 'ignore' }); } catch {}

    // Hand wlan0 over from NetworkManager
    execSync('nmcli dev set wlan0 managed no', { stdio: 'ignore' });
    execSync('ip addr flush dev wlan0');
    execSync(`ip addr add ${HOTSPOT_IP}/24 dev wlan0`);
    execSync('ip link set wlan0 up');

    execSync(`hostapd -B -P ${HOSTAPD_PID} ${HOSTAPD_CONF}`);
    execSync([
      'dnsmasq',
      '--interface=wlan0',
      '--bind-interfaces',
      '--dhcp-range=192.168.4.2,192.168.4.20,24h',
      `--pid-file=${DNSMASQ_PID}`,
      '--no-resolv',
      '--no-hosts',
      `--address=/#/${HOTSPOT_IP}`,
    ].join(' '));

    hotspotActive = true;
    console.log(`[wifi] Hotspot started: ${config.hotspotSsid}`);
  } catch (err) {
    console.error('[wifi] Failed to start hotspot:', err.message);
  }
}

function stopHotspot() {
  try {
    try {
      const pid = fs.readFileSync(DNSMASQ_PID, 'utf8').trim();
      execSync(`kill ${pid}`, { stdio: 'ignore' });
    } catch {}
    try {
      const pid = fs.readFileSync(HOSTAPD_PID, 'utf8').trim();
      execSync(`kill ${pid}`, { stdio: 'ignore' });
    } catch {}

    execSync('ip addr flush dev wlan0', { stdio: 'ignore' });
    execSync('nmcli dev set wlan0 managed yes', { stdio: 'ignore' });

    hotspotActive = false;
    console.log('[wifi] Hotspot stopped');
  } catch (err) {
    console.error('[wifi] Failed to stop hotspot:', err.message);
  }
}

function connectToWifi(ssid, password) {
  return new Promise((resolve, reject) => {
    try {
      try { execSync(`nmcli con delete "${ssid}"`, { stdio: 'ignore' }); } catch {}
      execSync(`nmcli con add type wifi con-name "${ssid}" ssid "${ssid}"`);
      execSync(`nmcli con modify "${ssid}" wifi-sec.key-mgmt wpa-psk`);
      execSync(`nmcli con modify "${ssid}" wifi-sec.psk "${password}"`);
      execSync(`nmcli con modify "${ssid}" connection.autoconnect yes`);
      execSync('nmcli dev wifi rescan', { stdio: 'ignore' });
    } catch (err) {
      return reject(err);
    }

    setTimeout(() => {
      exec(`nmcli con up "${ssid}" ifname wlan0`, { timeout: 30000 }, (err, stdout) => {
        if (err) return reject(err);
        resolve(stdout);
      });
    }, 3000);
  });
}

module.exports = { isWifiConnected, scanWifiNetworks, startHotspot, connectToWifi, stopHotspot };

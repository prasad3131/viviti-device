const express = require('express');
const config = require('./config');
const { isWifiConnected, startHotspot, stopHotspot } = require('./services/wifi');
const { startHeartbeat } = require('./services/heartbeat');
const { getStorageStats } = require('./services/storage');
const photosRouter = require('./routes/photos');
const setupRouter = require('./routes/setup');

const app = express();
app.use(express.json());

app.use('/photos', photosRouter);
app.use('/setup', setupRouter);

app.get('/status', (_req, res) => {
  const { total_bytes, available_bytes } = getStorageStats();
  res.json({
    name: config.deviceName,
    token: config.deviceToken,
    wifi: isWifiConnected(),
    total_bytes,
    available_bytes,
    uptime: process.uptime(),
  });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

// ── WiFi state watcher ───────────────────────────────────────────────────────
// Tracks connection state and reacts when WiFi connects or disconnects
let heartbeatStarted = false;
let inHotspotMode = false;

function watchWifi() {
  const connected = isWifiConnected();

  if (connected && !heartbeatStarted) {
    // WiFi just became available (either on boot or after setup/reconnect)
    console.log('[wifi] Connected — starting heartbeat');
    if (inHotspotMode) { stopHotspot(); inHotspotMode = false; }
    startHeartbeat();
    heartbeatStarted = true;
  }

  if (!connected && !inHotspotMode && !heartbeatStarted) {
    // No WiFi on boot — start hotspot for setup
    console.log('[wifi] No WiFi — starting hotspot for setup');
    startHotspot();
    inHotspotMode = true;
    console.log(`[wifi] Connect to "${config.hotspotSsid}" and open http://192.168.4.1:${config.port}/setup`);
  }

  if (!connected && heartbeatStarted) {
    // WiFi dropped while running — NetworkManager will reconnect automatically
    // heartbeat will resume once WiFi is back (next successful fetch)
    console.log('[wifi] WiFi dropped — waiting for reconnect...');
    heartbeatStarted = false; // allow restart when reconnected
  }
}

app.listen(config.port, () => {
  console.log(`Viviti device server running on port ${config.port}`);
  watchWifi();
  setInterval(watchWifi, 10 * 1000); // check every 10s
});

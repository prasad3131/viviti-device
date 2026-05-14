const express = require('express');
const { execSync } = require('child_process');
const config = require('./config');
const { isWifiConnected, startHotspot, stopHotspot } = require('./services/wifi');
const { startHeartbeat, stopHeartbeat } = require('./services/heartbeat');
const { getStorageStats } = require('./services/storage');
const { log, flushToApi } = require('./services/localLog');
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

// ── WiFi root-cause capture ──────────────────────────────────────────────────
function getDisconnectReason() {
  try {
    const out = execSync('journalctl -u NetworkManager -n 30 --no-pager --output=short 2>/dev/null', { stdio: 'pipe' }).toString();
    const lines = out.split('\n').filter(l =>
      /disconnect|deauth|timeout|failed|error|lost/i.test(l)
    );
    return lines.at(-1)?.trim() || 'WiFi disconnected (reason unknown)';
  } catch {
    return 'WiFi disconnected (could not read NetworkManager logs)';
  }
}

// ── WiFi state watcher ───────────────────────────────────────────────────────
let heartbeatRunning = false;
let inHotspotMode = false;
let wasConnected = null;

async function watchWifi() {
  const connected = isWifiConnected();

  // Boot: no WiFi → start hotspot
  if (!connected && wasConnected === null && !inHotspotMode) {
    log('warn', 'wifi', 'No WiFi on boot — starting hotspot for setup');
    startHotspot();
    inHotspotMode = true;
  }

  // WiFi just connected (boot or after setup or after drop)
  if (connected && !heartbeatRunning) {
    if (inHotspotMode) { stopHotspot(); inHotspotMode = false; }
    log('info', 'wifi', 'WiFi connected — flushing logs and starting heartbeat');
    await flushToApi();
    startHeartbeat();
    heartbeatRunning = true;
  }

  // WiFi dropped while running
  if (!connected && wasConnected === true && heartbeatRunning) {
    const reason = getDisconnectReason();
    log('warn', 'wifi', 'WiFi disconnected — heartbeat paused', { reason });
    stopHeartbeat();
    heartbeatRunning = false;
  }

  wasConnected = connected;
}

app.listen(config.port, () => {
  console.log(`Viviti device server running on port ${config.port}`);
  watchWifi();
  setInterval(watchWifi, 10 * 1000);
});

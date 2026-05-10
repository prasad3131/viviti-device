const express = require('express');
const fs = require('fs');
const config = require('./config');
const { isWifiConnected, startHotspot } = require('./services/wifi');
const { startHeartbeat } = require('./services/heartbeat');
const { getStorageStats } = require('./services/storage');
const photosRouter = require('./routes/photos');
const setupRouter = require('./routes/setup');

const app = express();
app.use(express.json());

// Routes
app.use('/photos', photosRouter);
app.use('/setup', setupRouter);

app.get('/status', (req, res) => {
  const { total_bytes, available_bytes } = getStorageStats();
  res.json({
    name: config.deviceName,
    token: config.deviceToken,
    total_bytes,
    available_bytes,
    uptime: process.uptime(),
  });
});

app.get('/health', (req, res) => res.json({ ok: true }));

// Start
app.listen(config.port, () => {
  console.log(`Viviti device server running on port ${config.port}`);

  const wifiConnected = isWifiConnected();
  console.log(`[wifi] Connected: ${wifiConnected}`);

  if (!wifiConnected) {
    console.log('[wifi] No WiFi — starting hotspot for setup...');
    startHotspot();
    console.log(`[wifi] Connect to "${config.hotspotSsid}" then open http://192.168.4.1:${config.port}/setup`);
  } else {
    startHeartbeat();
  }
});

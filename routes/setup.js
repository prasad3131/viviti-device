const express = require('express');
const { scanWifiNetworks, connectToWifi, stopHotspot } = require('../services/wifi');
const { registerDevice } = require('../services/registration');
const { log } = require('../services/localLog');

const router = express.Router();

router.get('/', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Viviti Setup</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:sans-serif;background:#fefcfe;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
    .card{background:#fff;border:1px solid #e0dbe2;border-radius:16px;padding:32px;max-width:420px;width:100%}
    h1{font-size:24px;color:#1a1118;margin-bottom:4px}
    p{color:#6b6070;font-size:14px;margin-bottom:24px}
    label{display:block;font-size:13px;font-weight:600;color:#1a1118;margin-bottom:6px}
    select,input{width:100%;padding:10px 12px;border:1px solid #e0dbe2;border-radius:8px;font-size:14px;margin-bottom:16px;outline:none}
    button{width:100%;padding:12px;background:#257af0;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer}
    button:disabled{opacity:0.6}
    .status{margin-top:16px;font-size:14px;color:#6b6070;text-align:center}
    .divider{border:none;border-top:1px solid #e0dbe2;margin:20px 0}
  </style>
</head>
<body>
  <div class="card">
    <h1>Viviti Setup</h1>
    <p>Connect your Viviti device to your home WiFi and create your account.</p>

    <form id="form">
      <label>Your Name for this Device</label>
      <input type="text" id="deviceName" placeholder="e.g. Living Room Viviti" required/>

      <label>Your Email</label>
      <input type="email" id="ownerEmail" placeholder="you@example.com" required/>

      <hr class="divider"/>

      <label>WiFi Network</label>
      <select id="ssid"><option>Scanning networks...</option></select>

      <label>WiFi Password</label>
      <input type="password" id="password" placeholder="WiFi password" required/>

      <button type="submit" id="btn">Connect &amp; Activate</button>
    </form>
    <div class="status" id="status"></div>
  </div>
  <script>
    fetch('/setup/networks').then(r=>r.json()).then(({networks})=>{
      const sel = document.getElementById('ssid');
      if (!networks.length) { sel.innerHTML = '<option>No networks found</option>'; return; }
      sel.innerHTML = networks.map(n=>'<option value="'+n.ssid+'">'+n.ssid+' ('+n.signal+'%)</option>').join('');
    });

    document.getElementById('form').onsubmit = async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btn');
      const status = document.getElementById('status');
      btn.disabled = true;
      status.textContent = 'Connecting to WiFi...';

      const res = await fetch('/setup/wifi', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          ssid: document.getElementById('ssid').value,
          password: document.getElementById('password').value,
          deviceName: document.getElementById('deviceName').value,
          ownerEmail: document.getElementById('ownerEmail').value,
        })
      });
      const data = await res.json();
      if (data.ok) {
        status.textContent = 'All done! Reconnect to your home WiFi and open the Viviti app.';
      } else {
        status.textContent = 'Failed: ' + (data.error || 'Unknown error');
        btn.disabled = false;
      }
    };
  </script>
</body>
</html>`);
});

router.get('/networks', (_req, res) => {
  res.json({ networks: scanWifiNetworks() });
});

router.post('/wifi', async (req, res) => {
  const { ssid, password, deviceName, ownerEmail } = req.body;
  if (!ssid || !password || !deviceName || !ownerEmail) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  log('info', 'setup', 'Setup submitted — switching to home WiFi', { ssid, deviceName, ownerEmail });

  // Respond before stopping hotspot — phone loses connection when AP goes down
  res.json({ ok: true });

  setImmediate(async () => {
    try {
      stopHotspot();
      await new Promise(r => setTimeout(r, 2000));
      log('info', 'setup', 'Connecting to WiFi', { ssid });
      await connectToWifi(ssid, password);
      log('info', 'setup', 'WiFi connected — registering device', { deviceName, ownerEmail });
      await registerDevice(deviceName, ownerEmail);
    } catch (err) {
      log('error', 'setup', 'Post-setup task failed', { error: err.message });
    }
  });
});

module.exports = router;

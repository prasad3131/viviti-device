const express = require('express');
const config = require('../config');
const { scanWifiNetworks, connectToWifi, stopHotspot } = require('../services/wifi');

const router = express.Router();

// Setup page
router.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Viviti Setup</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:sans-serif;background:#fefcfe;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
    .card{background:#fff;border:1px solid #e0dbe2;border-radius:16px;padding:32px;max-width:400px;width:100%}
    h1{font-size:24px;color:#1a1118;margin-bottom:4px}
    p{color:#6b6070;font-size:14px;margin-bottom:24px}
    label{display:block;font-size:13px;font-weight:600;color:#1a1118;margin-bottom:6px}
    select,input{width:100%;padding:10px 12px;border:1px solid #e0dbe2;border-radius:8px;font-size:14px;margin-bottom:16px;outline:none}
    button{width:100%;padding:12px;background:#257af0;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer}
    button:disabled{opacity:0.6}
    .status{margin-top:16px;font-size:14px;color:#6b6070;text-align:center}
  </style>
</head>
<body>
  <div class="card">
    <h1>Viviti Setup</h1>
    <p>Connect your Viviti device to your home WiFi.</p>
    <form id="form">
      <label>WiFi Network</label>
      <select id="ssid" name="ssid"><option>Loading networks...</option></select>
      <label>Password</label>
      <input type="password" id="password" placeholder="WiFi password"/>
      <button type="submit" id="btn">Connect</button>
    </form>
    <div class="status" id="status"></div>
  </div>
  <script>
    fetch('/setup/networks').then(r=>r.json()).then(({networks})=>{
      const sel = document.getElementById('ssid');
      sel.innerHTML = networks.map(n=>'<option value="'+n.ssid+'">'+n.ssid+' ('+n.signal+'%)</option>').join('');
    });
    document.getElementById('form').onsubmit = async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btn');
      const status = document.getElementById('status');
      btn.disabled = true;
      status.textContent = 'Connecting...';
      const res = await fetch('/setup/wifi', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ ssid: document.getElementById('ssid').value, password: document.getElementById('password').value })
      });
      const data = await res.json();
      if (data.ok) {
        status.textContent = 'Connected! Reconnect to your home WiFi and open the Viviti app.';
      } else {
        status.textContent = 'Failed: ' + (data.error || 'Unknown error');
        btn.disabled = false;
      }
    };
  </script>
</body>
</html>`);
});

// Scan networks
router.get('/networks', (req, res) => {
  const networks = scanWifiNetworks();
  res.json({ networks });
});

// Save WiFi credentials and connect
router.post('/wifi', async (req, res) => {
  const { ssid, password } = req.body;
  if (!ssid || !password) return res.status(400).json({ error: 'Missing ssid or password' });

  try {
    await connectToWifi(ssid, password);
    stopHotspot();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

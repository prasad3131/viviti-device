const WebSocket = require('ws');
const os = require('os');
const config = require('../config');
const { log } = require('./localLog');

let ws = null;
let reconnectTimer = null;
let reconnectDelay = 5000;

function getLocalIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

async function handleHttpReq(msg) {
  const { id, method = 'GET', path, body } = msg;
  const url = `http://localhost:${config.port}${path}`;

  try {
    const options = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
      options.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    const isJson = contentType.includes('application/json') || contentType.includes('text/');

    let responseBody, isBase64;
    if (isJson) {
      responseBody = await res.text();
      isBase64 = false;
    } else {
      const buf = await res.arrayBuffer();
      responseBody = Buffer.from(buf).toString('base64');
      isBase64 = true;
    }

    return { type: 'http_res', id, status: res.status, contentType, body: responseBody, isBase64 };
  } catch (err) {
    return {
      type: 'http_res', id, status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: err.message }),
      isBase64: false,
    };
  }
}

function connect() {
  if (!config.relayUrl || !config.deviceToken) return;

  const url = `${config.relayUrl}?token=${config.deviceToken}`;
  ws = new WebSocket(url);

  ws.on('open', () => {
    reconnectDelay = 5000;
    ws.send(JSON.stringify({ role: 'device', local_ip: getLocalIp() }));
    log('info', 'relay', 'Connected to relay');
  });

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'hb') return;
      if (msg.type === 'http_req') {
        const response = await handleHttpReq(msg);
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(response));
        }
      }
    } catch (err) {
      log('warn', 'relay', 'Message error', { error: err.message });
    }
  });

  ws.on('close', () => {
    ws = null;
    reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 60000);
    log('warn', 'relay', 'Disconnected — will reconnect');
  });

  ws.on('error', (err) => {
    log('warn', 'relay', 'Error', { error: err.message });
  });
}

function startRelay() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (ws) { ws.terminate(); ws = null; }
  connect();
}

function stopRelay() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (ws) { ws.terminate(); ws = null; }
}

module.exports = { startRelay, stopRelay };

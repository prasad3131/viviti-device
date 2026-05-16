const WebSocket = require('ws');
const os = require('os');
const config = require('../config');
const { log } = require('./localLog');

let ws = null;
let reconnectTimer = null;
let reconnectDelay = 5000;

// WebRTC peer connection (one at a time)
let activePc = null;

function getLocalIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

// ── HTTP proxy (shared by both relay and WebRTC data channel) ────────────────

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

// ── WebRTC (werift) ──────────────────────────────────────────────────────────

async function handleWebRtcOffer(sdp) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  // Lazy-require werift so missing package doesn't crash the whole service
  let RTCPeerConnection;
  try {
    ({ RTCPeerConnection } = require('werift'));
  } catch {
    log('warn', 'relay', 'werift not installed — WebRTC unavailable');
    return;
  }

  if (activePc) { try { activePc.close(); } catch {} activePc = null; }

  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  activePc = pc;

  // Incoming data channel from app
  pc.ondatachannel = ({ channel }) => {
    channel.onmessage = async ({ data }) => {
      try {
        const msg = JSON.parse(typeof data === 'string' ? data : Buffer.from(data).toString());
        if (msg.type === 'http_req') {
          const response = await handleHttpReq(msg);
          channel.send(JSON.stringify(response));
        }
      } catch (err) {
        log('warn', 'relay', 'WebRTC data channel error', { error: err.message });
      }
    };
  };

  // Trickle ICE — send candidates to app via relay
  pc.onicecandidate = ({ candidate }) => {
    if (candidate && ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'webrtc_ice', candidate: candidate.toJSON() }));
    }
  };

  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
      try { pc.close(); } catch {}
      if (activePc === pc) activePc = null;
    }
  };

  await pc.setRemoteDescription({ type: 'offer', sdp });
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'webrtc_answer', sdp: answer.sdp }));
  }
}

async function handleWebRtcIce(candidate) {
  if (!activePc || !candidate) return;
  try {
    await activePc.addIceCandidate(candidate);
  } catch (err) {
    log('warn', 'relay', 'Failed to add ICE candidate', { error: err.message });
  }
}

// ── WebSocket relay client ───────────────────────────────────────────────────

function connect() {
  if (!config.relayUrl || !config.deviceToken) return;

  const url = `${config.relayUrl}?token=${config.deviceToken}`;
  ws = new WebSocket(url);

  let lastHb = Date.now();
  const hbCheck = setInterval(() => {
    if (Date.now() - lastHb > 60000) {
      log('warn', 'relay', 'No heartbeat for 60s — reconnecting');
      clearInterval(hbCheck);
      ws.terminate();
    }
  }, 30000);

  ws.on('open', () => {
    reconnectDelay = 5000;
    lastHb = Date.now();
    ws.send(JSON.stringify({ role: 'device', local_ip: getLocalIp() }));
    log('info', 'relay', 'Connected to relay');
  });

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'hb') { lastHb = Date.now(); return; }

      if (msg.type === 'http_req') {
        const response = await handleHttpReq(msg);
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(response));
        return;
      }

      if (msg.type === 'webrtc_offer') { handleWebRtcOffer(msg.sdp); return; }
      if (msg.type === 'webrtc_ice')   { handleWebRtcIce(msg.candidate); return; }
    } catch (err) {
      log('warn', 'relay', 'Message error', { error: err.message });
    }
  });

  ws.on('close', () => {
    clearInterval(hbCheck);
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
  if (activePc) { try { activePc.close(); } catch {} activePc = null; }
}

module.exports = { startRelay, stopRelay };

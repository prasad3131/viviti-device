const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const router = express.Router();

const IMAGE_RE = /\.(jpg|jpeg|png|gif|heic|raw|cr2|arw|nef|dng)$/i;

// Resolve a user-supplied path safely inside photoDir
function safeDirPath(userPath) {
  if (!userPath) return config.photoDir;
  const parts = String(userPath).split('/').map(p => path.basename(p)).filter(Boolean);
  const full = path.join(config.photoDir, ...parts);
  if (!full.startsWith(config.photoDir)) return config.photoDir;
  return full;
}

// ── Folders ───────────────────────────────────────────────────────────────────

router.get('/folders', (req, res) => {
  try {
    const dir = safeDirPath(req.query.path || '');
    fs.mkdirSync(dir, { recursive: true });
    const folders = fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);
    res.json({ folders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/folders', (req, res) => {
  const parentPath = req.body.path || '';
  const name = path.basename(String(req.body.name || ''));
  if (!name) return res.status(400).json({ error: 'name required' });
  const dir = path.join(safeDirPath(parentPath), name);
  if (!dir.startsWith(config.photoDir)) return res.status(400).json({ error: 'invalid path' });
  if (fs.existsSync(dir)) return res.status(409).json({ error: 'Folder already exists' });
  fs.mkdirSync(dir, { recursive: true });
  res.json({ ok: true, name });
});

// ── List photos (paginated) ───────────────────────────────────────────────────

router.get('/', (req, res) => {
  const offset = Math.max(0, parseInt(req.query.offset) || 0);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
  try {
    const dir = safeDirPath(req.query.path || '');
    fs.mkdirSync(dir, { recursive: true });
    const all = fs.readdirSync(dir)
      .filter(f => IMAGE_RE.test(f))
      .map(f => {
        const stat = fs.statSync(path.join(dir, f));
        return { name: f, size: stat.size, modified: stat.mtime };
      })
      .sort((a, b) => new Date(b.modified) - new Date(a.modified));
    res.json({ photos: all.slice(offset, offset + limit), total: all.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Serve photo file ──────────────────────────────────────────────────────────

router.get('/file', (req, res) => {
  const dir = safeDirPath(req.query.path || '');
  const fp = path.join(dir, path.basename(String(req.query.name || '')));
  if (!fp.startsWith(config.photoDir) || !fs.existsSync(fp)) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(fp);
});

// ── Upload ────────────────────────────────────────────────────────────────────

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = safeDirPath(req.query.path || '');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
});

router.post('/upload', upload.array('photos', 50), (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded' });
  res.json({ uploaded: req.files.map(f => ({ name: f.filename, size: f.size })) });
});

// ── Base64 upload (used by relay / WebRTC when not on same WiFi) ─────────────

router.post('/upload-base64', async (req, res) => {
  const { path: folderPath, files } = req.body;
  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: 'No files' });
  }
  const dir = safeDirPath(folderPath);
  try {
    fs.mkdirSync(dir, { recursive: true });
    const saved = [];
    for (const file of files) {
      if (!file.data || !file.name) continue;
      const safeName = `${Date.now()}-${path.basename(String(file.name))}`;
      const fp = path.join(dir, safeName);
      if (!fp.startsWith(config.photoDir)) continue;
      fs.writeFileSync(fp, Buffer.from(file.data, 'base64'));
      saved.push(safeName);
    }
    res.json({ uploaded: saved.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Batch delete ──────────────────────────────────────────────────────────────

router.delete('/files', (req, res) => {
  const { names } = req.body;
  const dir = safeDirPath(req.body.path || '');
  if (!Array.isArray(names)) return res.status(400).json({ error: 'names must be an array' });
  const deleted = names.filter(n => {
    const fp = path.join(dir, path.basename(String(n)));
    if (!fp.startsWith(config.photoDir) || !fs.existsSync(fp)) return false;
    fs.unlinkSync(fp);
    return true;
  });
  res.json({ deleted });
});

module.exports = router;

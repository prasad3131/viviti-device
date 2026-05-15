const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const router = express.Router();

const IMAGE_RE = /\.(jpg|jpeg|png|gif|heic|raw|cr2|arw|nef|dng)$/i;

function safeDir(folder) {
  const safe = folder ? path.basename(String(folder)) : '';
  return safe ? path.join(config.photoDir, safe) : config.photoDir;
}

function safeFile(folder, name) {
  return path.join(safeDir(folder), path.basename(String(name)));
}

// ── Folders ──────────────────────────────────────────────────────────────────

router.get('/folders', (_req, res) => {
  try {
    fs.mkdirSync(config.photoDir, { recursive: true });
    const folders = fs.readdirSync(config.photoDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);
    res.json({ folders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/folders', (req, res) => {
  const name = path.basename(String(req.body.name || ''));
  if (!name) return res.status(400).json({ error: 'name required' });
  const dir = path.join(config.photoDir, name);
  if (fs.existsSync(dir)) return res.status(409).json({ error: 'Folder already exists' });
  fs.mkdirSync(dir, { recursive: true });
  res.json({ ok: true, name });
});

// ── List photos (paginated) ───────────────────────────────────────────────────

router.get('/', (req, res) => {
  const folder = req.query.folder || '';
  const offset = Math.max(0, parseInt(req.query.offset) || 0);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));

  try {
    const dir = safeDir(folder);
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

router.get('/file/:folder/:name', (req, res) => {
  const fp = safeFile(req.params.folder, req.params.name);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
  res.sendFile(fp);
});

// ── Upload (multiple) ─────────────────────────────────────────────────────────

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = safeDir(req.query.folder || '');
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

// ── Batch delete ──────────────────────────────────────────────────────────────

router.delete('/files', (req, res) => {
  const { folder, names } = req.body;
  if (!Array.isArray(names)) return res.status(400).json({ error: 'names must be an array' });
  const deleted = names.filter(n => {
    const fp = safeFile(folder || '', n);
    if (!fs.existsSync(fp)) return false;
    fs.unlinkSync(fp);
    return true;
  });
  res.json({ deleted });
});

module.exports = router;

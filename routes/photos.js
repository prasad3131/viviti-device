const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(config.photoDir, { recursive: true });
    cb(null, config.photoDir);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${file.originalname}`;
    cb(null, unique);
  },
});

const upload = multer({ storage });

// List all photos
router.get('/', (req, res) => {
  try {
    fs.mkdirSync(config.photoDir, { recursive: true });
    const files = fs.readdirSync(config.photoDir)
      .filter(f => /\.(jpg|jpeg|png|gif|heic|raw|cr2|arw|nef|dng)$/i.test(f))
      .map(f => {
        const stat = fs.statSync(path.join(config.photoDir, f));
        return { name: f, size: stat.size, modified: stat.mtime };
      })
      .sort((a, b) => new Date(b.modified) - new Date(a.modified));
    res.json({ photos: files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload photo
router.post('/upload', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ name: req.file.filename, size: req.file.size });
});

// Download photo
router.get('/:name', (req, res) => {
  const filePath = path.join(config.photoDir, path.basename(req.params.name));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  res.sendFile(filePath);
});

// Delete photo
router.delete('/:name', (req, res) => {
  const filePath = path.join(config.photoDir, path.basename(req.params.name));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  fs.unlinkSync(filePath);
  res.json({ ok: true });
});

module.exports = router;

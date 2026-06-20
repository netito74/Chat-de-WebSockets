'use strict';
const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const backgroundsDir = path.join(config.uploads.dir, 'backgrounds');
if (!fs.existsSync(backgroundsDir)) fs.mkdirSync(backgroundsDir, { recursive: true });

const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, backgroundsDir),
  filename: (req, file, cb) => {
    const ext = EXT_BY_MIME[file.mimetype] || '.bin';
    const safeName = `${req.user.id}_${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.uploads.maxSizeMb * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // Validacion de formato por whitelist de MIME type (defensa contra
    // subida de archivos ejecutables/scripts disfrazados de imagen).
    if (!config.uploads.allowedMime.includes(file.mimetype)) {
      return cb(new Error('Formato de imagen no permitido. Usa JPG, PNG, WEBP o GIF.'));
    }
    cb(null, true);
  },
});

router.post('/background', requireAuth, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No se recibio ningun archivo' });
    const url = `/uploads/backgrounds/${req.file.filename}`;
    res.status(201).json({ url });
  });
});

module.exports = router;

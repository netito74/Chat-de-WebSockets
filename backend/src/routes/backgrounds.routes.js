'use strict';
const express = require('express');
const db = require('../db/db');
const validators = require('../utils/validators');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const GRADIENTS = {
  agora_amanecer: 'linear-gradient(135deg, #F6E7D8 0%, #C1572A 100%)',
  agora_egeo: 'linear-gradient(135deg, #E4F0EE 0%, #1F6F6B 100%)',
  agora_noche: 'linear-gradient(135deg, #2B2640 0%, #1F6F6B 100%)',
  agora_marmol: 'linear-gradient(135deg, #F4F1EA 0%, #C9C2B4 100%)',
};

router.get('/gradients', (req, res) => {
  res.json({ gradients: GRADIENTS });
});

router.get('/', (req, res) => {
  const row = db
    .prepare('SELECT bg_type as type, bg_value as value FROM user_backgrounds WHERE user_id = ?')
    .get(req.user.id);
  res.json({ background: row || { type: 'gradient', value: 'agora_egeo' } });
});

router.put('/', (req, res, next) => {
  try {
    let input;
    if (req.body.type === 'upload') {
      input = { type: 'upload', value: String(req.body.value).slice(0, 2048) };
      if (!input.value.startsWith('/uploads/backgrounds/')) {
        return res.status(400).json({ error: 'Referencia de imagen invalida' });
      }
    } else {
      input = validators.background.parse(req.body);
      if (input.type === 'gradient' && !GRADIENTS[input.value]) {
        return res.status(400).json({ error: 'Gradiente desconocido' });
      }
      if (input.type === 'url') {
        try {
          const parsed = new URL(input.value);
          if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
        } catch {
          return res.status(400).json({ error: 'URL de imagen invalida' });
        }
      }
    }
    db.prepare(
      `INSERT INTO user_backgrounds (user_id, bg_type, bg_value, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET bg_type = excluded.bg_type, bg_value = excluded.bg_value, updated_at = datetime('now')`
    ).run(req.user.id, input.type, input.value);
    res.json({ ok: true, background: input });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

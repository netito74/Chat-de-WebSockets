'use strict';
const express = require('express');
const authService = require('../services/authService');
const userService = require('../services/userService');
const conversationService = require('../services/conversationService');
const validators = require('../utils/validators');
const { requireAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const input = validators.register.parse(req.body);
    const { token, user } = await authService.register({
      username: input.username,
      password: input.password,
      preferredLang: input.preferredLang,
    });
    conversationService.ensurePublicMembership(user.id);
    res.status(201).json({ token, user });
  } catch (err) {
    next(err);
  }
});

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const input = validators.login.parse(req.body);
    const { token, user } = await authService.login(input);
    conversationService.ensurePublicMembership(user.id);
    res.json({ token, user });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: userService.toPublic(req.user) });
});

module.exports = router;

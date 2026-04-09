const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const dotenvPath = path.resolve(__dirname, '../../userdata/.env');

// Load .env as object
function loadEnv() {
  const env = fs.readFileSync(dotenvPath, 'utf-8');
  return Object.fromEntries(
    env.split('\n')
      .filter(line => line.includes('='))
      .map(line => line.split('='))
  );
}

// Save object back to .env
function saveEnv(envObj) {
  const lines = fs.readFileSync(dotenvPath, 'utf-8').split('\n');
  const updatedLines = lines.map(line => {
    if (line.startsWith('BOT_PHONE=')) return `BOT_PHONE=${envObj.BOT_PHONE}`;
    if (line.startsWith('BOSS_PHONE=')) return `BOSS_PHONE=${envObj.BOSS_PHONE}`;
    return line;
  });
  fs.writeFileSync(dotenvPath, updatedLines.join('\n'), 'utf-8');
}

// ✅ GET route
router.get('/', (req, res) => {
  if (!req.session.user) return res.redirect('/');
  const env = loadEnv();
  res.render('phonenumber', {
    botPhone: env.BOT_PHONE || '',
    bossPhone: env.BOSS_PHONE || '',
    success: req.query.success === 'true',
    error: null
  });
});

// ✅ POST route
router.post('/', (req, res) => {
  if (!req.session.user) return res.redirect('/');

  try {
    const env = loadEnv();
    env.BOT_PHONE = req.body.botPhone.trim();
    env.BOSS_PHONE = req.body.bossPhone.trim();
    saveEnv(env);
    res.redirect('/phonenumber?success=true');
  } catch (err) {
    const env = loadEnv();
    res.render('phonenumber', {
      botPhone: env.BOT_PHONE || '',
      bossPhone: env.BOSS_PHONE || '',
      success: false,
      error: 'Failed to save phone numbers. Please try again.'
    });
  }
});

module.exports = router;

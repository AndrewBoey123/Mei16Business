const express = require('express');
const router = express.Router();
const fs = require('fs');
const { execSync } = require('child_process');

// --------------------------------------
// Helper: check if n8n is installed
// --------------------------------------
function checkN8NInstalled() {
  try {
    // Method 0 (BEST): check via PATH (same as terminal)
    try {
      execSync('command -v n8n', { stdio: 'ignore' });
      return true;
    } catch {}

    // Method 1: common global binary paths
    if (fs.existsSync('/usr/bin/n8n')) return true;
    if (fs.existsSync('/usr/local/bin/n8n')) return true;
    if (fs.existsSync('/root/.npm-global/bin/n8n')) return true;

    // Method 2: local install inside project
    if (fs.existsSync('/root/Mei/node_modules/.bin/n8n')) return true;
    if (fs.existsSync('/root/Mei/node_modules/n8n')) return true;

    // Method 3 (LAST): running under PM2 (not reliable but useful)
    const list = execSync('pm2 list --silent').toString();
    if (list.includes('n8n')) return true;

    return false;
  } catch {
    return false;
  }
}


// --------------------------------------
// PAGE: /n8n (UI page)
// --------------------------------------
router.get('/', (req, res) => {
  const installed = checkN8NInstalled();
  res.render('n8n_page', { installed });
});

// --------------------------------------
// API: /n8n/check
// --------------------------------------
router.get('/check', (req, res) => {
  const installed = checkN8NInstalled();
  res.json({ installed });
});

module.exports = router;

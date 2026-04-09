const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const ENV_FILE_PATH = path.resolve(__dirname, '../../userdata/.env');

// GET
router.get('/', (req, res) => {
  let status = '';
  let content = '';

  if (!fs.existsSync(ENV_FILE_PATH)) {
    status = 'missing';
  } else {
    try {
      content = fs.readFileSync(ENV_FILE_PATH, 'utf8');
      status = req.query.saved;
    } catch (err) {
      console.error('❌ Failed to read .env file:', err);
      status = 'false';
    }
  }

  res.render('env_editor', { content, status });
});

// POST
router.post('/', (req, res) => {
  const newContent = req.body.content || '';
  try {
    fs.writeFileSync(ENV_FILE_PATH, newContent, 'utf8');
    res.redirect('/env-editor?saved=true');
  } catch (err) {
    console.error('❌ Failed to save .env file:', err);
    res.redirect('/env-editor?saved=false');
  }
});

module.exports = router;

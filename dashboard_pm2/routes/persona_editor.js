const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const personaFiles = {
  short: path.resolve(__dirname, '../../userdata/persona/meipersona-short.txt'),
  long: path.resolve(__dirname, '../../userdata/persona/meipersona-long.txt'),
  group: path.resolve(__dirname, '../../userdata/persona/meipersona-group.txt'),
  reporter: path.resolve(__dirname, '../../userdata/persona/meipersona-boss.txt')
};

// GET: Load all persona content
router.get('/', (req, res) => {
  const data = {};
  for (const key in personaFiles) {
    const filePath = personaFiles[key];
    data[key] = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
  }
  res.render('persona_editor', { data, success: req.query.success });
});

// POST: Save all updates
router.post('/', (req, res) => {
  for (const key in personaFiles) {
    const content = req.body[key] || '';
    fs.writeFileSync(personaFiles[key], content, 'utf-8');
  }
  res.redirect('/persona-editor?success=1');
});

module.exports = router;

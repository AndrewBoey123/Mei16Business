const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const tempPath = path.join(__dirname, '../../userdata/mem/meimemory-temp.txt');
const permPath = path.join(__dirname, '../../userdata/mem/meimemory-perm.txt');

// GET Memory Editor
router.get('/', (req, res) => {
  const temp = fs.existsSync(tempPath) ? fs.readFileSync(tempPath, 'utf8') : '';
  const perm = fs.existsSync(permPath) ? fs.readFileSync(permPath, 'utf8') : '';
  res.render('memory_editor', { temp, perm, message: null }); // 
});

// POST Save Memory
router.post('/', (req, res) => {
  const { tempMemory, permMemory } = req.body;

  try {
    fs.writeFileSync(tempPath, tempMemory, 'utf8');
    fs.writeFileSync(permPath, permMemory, 'utf8');

    res.render('memory_editor', {
      temp: tempMemory,
      perm: permMemory,
      message: ' Memory files saved successfully!',
    });
  } catch (err) {
    console.error('Error saving memory files:', err);
    res.render('memory_editor', {
      temp: tempMemory,
      perm: permMemory,
      message: ' Failed to save memory files.',
    });
  }
});

module.exports = router;

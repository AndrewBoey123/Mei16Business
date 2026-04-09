const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const GUIDE_JSON = path.join(__dirname, '..', '..', 'userdata', 'json', 'guide_state.json');

router.post('/complete', (req, res) => {
  fs.writeFileSync(GUIDE_JSON, JSON.stringify({ firstTime: false }, null, 2));
  return res.json({ success: true });
});

module.exports = router;

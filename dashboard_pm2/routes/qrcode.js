const express = require('express');
const router = express.Router();

// GET QR Code Page
router.get('/', (req, res) => {
  res.render('qrcode');
});

module.exports = router;
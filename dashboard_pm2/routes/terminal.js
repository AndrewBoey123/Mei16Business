// routes/terminal.js
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  // If session exists, user is already authenticated
  if (!req.session || !req.session.user) {
    return res.status(403).send('❌ Forbidden: Not authenticated.');
  }

  // Optional: you can still inspect accessLevel if needed later
  // const { accessLevel, email } = req.session.user;

  res.render('terminal');
});

module.exports = router;

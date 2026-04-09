const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const ENV_PATH = path.resolve(__dirname, '../../userdata/.env');

// Get credentials from .env with defaults
const DEFAULT_USERNAME = 'admin';
const DEFAULT_PASSWORD = 'password';

function getCredentials() {
  try {
    const parsed = dotenv.parse(fs.readFileSync(ENV_PATH));
    return {
      username: parsed.WEBDASHBOARD_USERNAME || DEFAULT_USERNAME,
      password: parsed.WEBDASHBOARD_PASSWORD || DEFAULT_PASSWORD
    };
  } catch (e) {
    return { username: DEFAULT_USERNAME, password: DEFAULT_PASSWORD };
  }
}

// GET: Login page
router.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('login', { 
    error: null, 
    BOT_NAME: process.env.BOT_NAME || "Mei",
    defaultUser: DEFAULT_USERNAME
  });
});

router.post("/login", (req, res) => {
  const { username, password } = req.body;
  
  const creds = getCredentials();
  
  // Simple credential check
  if (username === creds.username && password === creds.password) {
    req.session.user = {
      email: username,
      accessLevel: 'admin'
    };
    console.log(`✅ Login successful for user: ${username}`);
    return res.redirect("/dashboard");
  }
  
  console.log(`❌ Failed login attempt for user: ${username}`);
  return res.render("login", {
    BOT_NAME: process.env.BOT_NAME || "Mei",
    defaultUser: DEFAULT_USERNAME,
    error: "❌ Invalid credentials"
  });
});

// GET: Logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

module.exports = router;

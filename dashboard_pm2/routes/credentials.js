const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const ENV_PATH = path.join(__dirname, '../../userdata/.env');

// Load credentials from .env
function getCreds() {
  const envText = fs.readFileSync(ENV_PATH, 'utf8');
  const lines = envText.split('\n');
  let username = 'admin';
  let password = 'admin';

  for (const line of lines) {
    if (line.startsWith('WEBDASHBOARD_USERNAME=')) {
      username = line.split('=')[1].trim();
    }
    if (line.startsWith('WEBDASHBOARD_PASSWORD=')) {
      password = line.split('=')[1].trim();
    }
  }

  return { username, password };
}

// Save credentials to .env
function saveCreds(newUsername, newPassword) {
  let envText = fs.readFileSync(ENV_PATH, 'utf8');
  envText = envText.replace(/WEBDASHBOARD_USERNAME=.*/g, `WEBDASHBOARD_USERNAME=${newUsername}`);
  envText = envText.replace(/WEBDASHBOARD_PASSWORD=.*/g, `WEBDASHBOARD_PASSWORD=${newPassword}`);
  fs.writeFileSync(ENV_PATH, envText, 'utf8');
}

// GET form
router.get('/', (req, res) => {
  const { username } = getCreds();
  res.render('change_credentials', { currentUsername: username, message: null });
});

// POST form
router.post('/', (req, res) => {
  const { newUsername, newPassword, confirmPassword } = req.body;
  const creds = getCreds();

  const isUsernameChanged = newUsername && newUsername !== creds.username;
  const isPasswordProvided = newPassword && confirmPassword;

  // Rule 1: Prevent username-only change without password
  if (isUsernameChanged && !isPasswordProvided) {
    return res.render('change_credentials', {
      currentUsername: creds.username,
      message: '❌ To change the username, you must also change the password.'
    });
  }

  // Rule 2: Prevent password mismatch
  if (isPasswordProvided && newPassword !== confirmPassword) {
    return res.render('change_credentials', {
      currentUsername: creds.username,
      message: '❌ New passwords do not match.'
    });
  }

  // Set new values based on inputs
  const updatedUsername = newUsername || creds.username;
  const updatedPassword = isPasswordProvided ? newPassword : creds.password;

  saveCreds(updatedUsername, updatedPassword);

  res.render('change_credentials', {
    currentUsername: updatedUsername,
    message: '✅ Credentials updated successfully!'
  });
});

module.exports = {router,
  getCreds,
  saveCreds
};

const express = require('express');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const router = express.Router();

const ENV_PATH = path.join(__dirname, '../../userdata/.env');

// Read .env as object
function readEnv() {
  const parsed = dotenv.parse(fs.readFileSync(ENV_PATH));
  return parsed;
}

// Update .env values (same as before)
function updateEnv(newValues) {
  const updated = fs.readFileSync(ENV_PATH, 'utf-8')
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return line;

      const [key] = line.split('=');
      return newValues.hasOwnProperty(key.trim())
        ? `${key.trim()}=${newValues[key.trim()]}`
        : line;
    })
    .join('\n');

  fs.writeFileSync(ENV_PATH, updated, 'utf-8');
}

// GET current step's env values
router.get('/prefill/:step', (req, res) => {
  const env = readEnv();
  const step = Number(req.params.step);
  let response = {};

  if (step === 1) {
    response = {
      BOT_NAME: env.BOT_NAME || '',
      PERSON: env.PERSON || '',
      JOB: env.JOB || ''
    };
  } else if (step === 2) {
    response = {
      BOSS_EMAIL: env.BOSS_EMAIL || '',
      INDIVIDUAL_CHATS: env.INDIVIDUAL_CHATS || '',
      GROUP_ALLOWED: env.GROUP_ALLOWED || '',
      GROUP_NAMES: env.GROUP_NAMES || ''
    };
  } else if (step === 3) {
    response = {
      localFormat: env.localFormat || '',
      TimeZone: env.TimeZone || ''
    };
  } else if (step === 4) {
    response = {
      BOT_PHONE: env.BOT_PHONE || '',
      BOSS_PHONE: env.BOSS_PHONE || '',
      ASST_BOSS_PHONE: env.ASST_BOSS_PHONE || ''
    };
  } else if (step === 5) {
    response = {
      // Free tier providers (recommended)
      groqApi: env.groqApi || env.GROQ_API_KEY || '',
      GROQ_MODEL: env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      geminiApi: env.geminiApi || env.GEMINI_API_KEY || env.gemma3 || '',
      openrouterApi: env.openrouterApi || env.OPENROUTER_API_KEY || '',
      OPENROUTER_MODEL: env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-70b-instruct:free',
      ollamaUrl: env.ollamaUrl || env.OLLAMA_URL || 'http://localhost:11434',
      // Paid providers (optional)
      deepseekApi: env.deepseekApi || '',
      openaiApi: env.openaiApi || '',
      qwenApi: env.qwenApi || '',
      antApi: env.antApi || ''
    };
  } else if (step === 6) {
    response = {
      AUTORUN: env.AUTORUN || '',
      AUTO_ENGINE_CHOICE: env.AUTO_ENGINE_CHOICE || ''
    };
  } else if (step === 7) {
    response = {
      RESPONSE_DELAY_MIN_SEC: env.RESPONSE_DELAY_MIN_SEC || '',
      RESPONSE_DELAY_MAX_SEC: env.RESPONSE_DELAY_MAX_SEC || '',
      TYPING_DURATION_MIN_SEC: env.TYPING_DURATION_MIN_SEC || '',
      TYPING_DURATION_MAX_SEC: env.TYPING_DURATION_MAX_SEC || '',
      BLOCK_INTERVAL: env.BLOCK_INTERVAL || '',
      BOSS_NOTIFICATION_EXPIRY: env.BOSS_NOTIFICATION_EXPIRY || '',
      MEDIA_EXPIRY_MINUTES: env.MEDIA_EXPIRY_MINUTES || '',
      PERSONA_RELOAD_SECS: env.PERSONA_RELOAD_SECS || '',
      ENV_RELOAD_SECS: env.ENV_RELOAD_SECS || ''
    };
  } else if (step === 8) {
    response = {
      MEISleepMode: env.MEISleepMode || '',
      WAKE_UP_HOUR: env.WAKE_UP_HOUR || '',
      WAKE_UP_MINS: env.WAKE_UP_MINS || '',
      SLEEP_HOUR: env.SLEEP_HOUR || '',
      SLEEP_MINS: env.SLEEP_MINS || '',
      LLM_TIMEOUT_MS: env.LLM_TIMEOUT_MS || ''
    };
  } else if (step === 9) {
    response = {
      WEBDASHBOARD_USERNAME: env.WEBDASHBOARD_USERNAME || '',
      WEBDASHBOARD_PASSWORD: env.WEBDASHBOARD_PASSWORD || ''
    };
  }
  res.json(response);
});

// POST save current step's values
router.post('/save/:step', (req, res) => {
  const step = Number(req.params.step);
  const data = req.body;
  const toSave = {};

  if (step === 1) {
    toSave.BOT_NAME = data.BOT_NAME || '';
    toSave.PERSON = data.PERSON || '';
    toSave.JOB = data.JOB || '';
  } else if (step === 2) {
    toSave.BOSS_EMAIL = data.BOSS_EMAIL || '';
    toSave.INDIVIDUAL_CHATS = data.INDIVIDUAL_CHATS || '';
    toSave.GROUP_ALLOWED = data.GROUP_ALLOWED || '';
    toSave.GROUP_NAMES = data.GROUP_NAMES || '';
  } else if (step === 3) {
    toSave.localFormat = data.localFormat || '';
    toSave.TimeZone = data.TimeZone || '';
  } else if (step === 4) {
    toSave.BOT_PHONE = data.BOT_PHONE || '';
    toSave.BOSS_PHONE = data.BOSS_PHONE || '';
    toSave.ASST_BOSS_PHONE = data.ASST_BOSS_PHONE || '';
  } else if (step === 5) {
    // Free tier providers
    toSave.groqApi = data.groqApi || '';
    toSave.GROQ_MODEL = data.GROQ_MODEL || '';
    toSave.geminiApi = data.geminiApi || '';
    toSave.openrouterApi = data.openrouterApi || '';
    toSave.OPENROUTER_MODEL = data.OPENROUTER_MODEL || '';
    toSave.ollamaUrl = data.ollamaUrl || '';
    // Paid providers
    toSave.deepseekApi = data.deepseekApi || '';
    toSave.openaiApi = data.openaiApi || '';
    toSave.qwenApi = data.qwenApi || '';
    toSave.antApi = data.antApi || '';
  } else if (step === 6) {
    toSave.AUTORUN = data.AUTORUN || '';
    toSave.AUTO_ENGINE_CHOICE = data.AUTO_ENGINE_CHOICE || '';
  } else if (step === 7) {
    toSave.RESPONSE_DELAY_MIN_SEC = data.RESPONSE_DELAY_MIN_SEC || '';
    toSave.RESPONSE_DELAY_MAX_SEC = data.RESPONSE_DELAY_MAX_SEC || '';
    toSave.TYPING_DURATION_MIN_SEC = data.TYPING_DURATION_MIN_SEC || '';
    toSave.TYPING_DURATION_MAX_SEC = data.TYPING_DURATION_MAX_SEC || '';
    toSave.BLOCK_INTERVAL = data.BLOCK_INTERVAL || '';
    toSave.BOSS_NOTIFICATION_EXPIRY = data.BOSS_NOTIFICATION_EXPIRY || '';
    toSave.MEDIA_EXPIRY_MINUTES = data.MEDIA_EXPIRY_MINUTES || '';
    toSave.PERSONA_RELOAD_SECS = data.PERSONA_RELOAD_SECS || '';
    toSave.ENV_RELOAD_SECS = data.ENV_RELOAD_SECS || '';
  } else if (step === 8) {
    toSave.MEISleepMode = data.MEISleepMode || '';
    toSave.WAKE_UP_HOUR = data.WAKE_UP_HOUR || '';
    toSave.WAKE_UP_MINS = data.WAKE_UP_MINS || '';
    toSave.SLEEP_HOUR = data.SLEEP_HOUR || '';
    toSave.SLEEP_MINS = data.SLEEP_MINS || '';
    toSave.LLM_TIMEOUT_MS = data.LLM_TIMEOUT_MS || '';
  } else if (step === 9) {
    toSave.WEBDASHBOARD_USERNAME = data.WEBDASHBOARD_USERNAME || '';
    toSave.WEBDASHBOARD_PASSWORD = data.WEBDASHBOARD_PASSWORD || '';
  }

  try {
    updateEnv(toSave);
    dotenv.config({ path: ENV_PATH, override: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to write .env' });
  }
});

module.exports = router;

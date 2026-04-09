//Import & Setup
const express = require('express'); //simplify node.js code
const router = express.Router();//create sub-app for handling specific routes (eg:apikey)
const path = require('path');//Built in node module
const fs = require('fs');// to read/write file
const dotenv = require('dotenv');//lib for loading & parsing .env files

const envPath = path.join(__dirname, '../../userdata/.env');// to locate .env file

dotenv.config({
  path: envPath,
  override: true
});

function loadEnv() {
  const envConfig = dotenv.parse(fs.readFileSync(envPath));//Read .env file
  return envConfig;//dotenv;convert .env file into a javascript obj
}

//Save any updated .env values
function saveEnv(updatedValues) {
 const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  const updatedLines = lines.map(line => {
    if (line.startsWith('deepseekApi=')) return `deepseekApi=${updatedValues.deepseekApi}`;
    if (line.startsWith('openaiApi=')) return `openaiApi=${updatedValues.openaiApi}`;
    if (line.startsWith('qwenApi=')) return `qwenApi=${updatedValues.qwenApi}`;
    if (line.startsWith('antApi=')) return `antApi=${updatedValues.antApi}`;
    return line;
  });

  fs.writeFileSync(envPath, updatedLines.join('\n'), 'utf-8');//Write all lines back to .env file
}

// ✅ GET: Show API key editor form
router.get('/', (req, res) => {
  const env = loadEnv();//Load .env file
  res.render('apikey', {
    deepseekApi: env.deepseekApi || '',
    openaiApi: env.openaiApi || '',
    qwenApi: env.qwenApi || '',
    antApi: env.antApi || '',
    saved: req.query.saved === 'true',
  });
});

// ✅ POST: Save updates
router.post('/', (req, res) => {
  const { deepseekApi, openaiApi, qwenApi, antApi } = req.body;//Extract the data

  saveEnv({ deepseekApi, openaiApi, qwenApi, antApi });// Update the .env file

  res.redirect('/apikey?saved=true');// Redirect to save the file
});

module.exports = router;//Export this router so it is available in the app.js

//Summary:
//1. This is a router handler that read API keys from . env 
//2. Display them in HTML form
//3. Save back to .env 

const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const ROOT = path.resolve(__dirname, '..', '..');
const CHAT_HISTORY_FOLDER = path.join(ROOT, 'userdata', 'chathistory');
const JSON_FOLDER = path.join(ROOT, 'userdata', 'json');


//  For access to env
const dotenv = require('dotenv');
const ENV_PATH = path.join(__dirname, '..', '..', 'userdata', '.env');

function getType() {
  try {
    const parsed = dotenv.parse(fs.readFileSync(ENV_PATH));
    return parsed.TYPE || "WW";
  } catch {
    return "WW";
  }
}


// Utility: crude check if buffer is text
function isText(buf) {
  try {
    const sample = buf.slice(0, 200).toString('utf8');
    return !/\x00/.test(sample);
  } catch {
    return false;
  }
}

function listFilesInVersion(versionInput) {
  const inputStr = String(versionInput);
  // Try to use exact folder name first
  const directPath = path.join(ROOT, inputStr);
  if (fs.existsSync(directPath)) {
    return fs.readdirSync(directPath)
      .filter(f => fs.statSync(path.join(directPath, f)).isFile());
  }

  // Fallback: try matching by number (for old versions)
  const m = inputStr.match(/(\d+)/);
  if (!m) throw new Error(`Invalid version: ${versionInput}`);
  const num = m[1];
  const match = fs.readdirSync(ROOT, { withFileTypes: true })
    .filter(d => d.isDirectory() && new RegExp(`^Mei${num}`, 'i').test(d.name))
    .map(d => d.name)[0];
  if (!match) throw new Error(`No matching Mei folder found for version: ${versionInput}`);

  const folderPath = path.join(ROOT, match);
  return fs.readdirSync(folderPath)
    .filter(f => fs.statSync(path.join(folderPath, f)).isFile());
}


function getChatFiles() {
  if (!fs.existsSync(CHAT_HISTORY_FOLDER)) return [];
  return fs.readdirSync(CHAT_HISTORY_FOLDER)
    .filter(f => f.endsWith('.json'))
    .map(file => {
      const full = path.join(CHAT_HISTORY_FOLDER, file);
      return { file, mtime: fs.statSync(full).mtime };
    })
    .sort((a, b) => b.mtime - a.mtime)
    .map(({ file }) => file);
}

function getJsonFiles() {
  if (!fs.existsSync(JSON_FOLDER)) return [];
  return fs.readdirSync(JSON_FOLDER)
    .filter(f => f.endsWith('.json'))
    .sort();
}


// Render editor
router.get('/', (req, res) => {
  const type = getType(); // ✅ dynamically read every time

  let selectedVersion = req.query.version || "";
  const versionNum = selectedVersion.match(/\d+/)?.[0] || "";

  // ✅ Only append once
  if (type === "Sock" && !selectedVersion.includes("Sock")) {
    selectedVersion = `${selectedVersion}/Mei${versionNum}_Sock`;
  } else if (type === "Web" && !selectedVersion.includes("Web")) {
    selectedVersion = `${selectedVersion}/Mei${versionNum}_Web`;
  }


  let files = [];
  try { files = listFilesInVersion(selectedVersion); } catch (_) {}

  res.render('mei_editor', {
  selectedVersion,
  files,
  jsonFiles: getJsonFiles(),
  chatFiles: getChatFiles()
  });

});



// Load file (with binary detection)
// Load file (with binary detection)
router.get('/load/:version/:filename', (req, res) => {
  try {
    let folder = String(req.params.version);
    let folderPath = path.join(ROOT, folder);

    // If exact folder doesn't exist, try numeric prefix fallback (e.g., Mei15 → Mei15Free)
    if (!fs.existsSync(folderPath)) {
      const m = folder.match(/(\d+)/);
      if (m) {
        const candidates = fs.readdirSync(ROOT, { withFileTypes: true })
          .filter(d => d.isDirectory() && new RegExp(`^Mei${m[1]}`, 'i').test(d.name))
          .map(d => d.name);
        if (candidates.length > 0) {
          folder = candidates[0];
          folderPath = path.join(ROOT, folder);
        }
      }
    }

    const filePath = path.join(folderPath, req.params.filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ code: '// ❌ File not found' });
    }

    const buf = fs.readFileSync(filePath);

    if (req.params.filename.endsWith('-linux')) {
      const stats = fs.statSync(filePath);
      return res.json({
        code:
          `// ⚠️ This file (${req.params.filename}) is a Linux executable.\n` +
          `// Size: ${stats.size} bytes\n` +
          `// Last Modified: ${stats.mtime}\n` +
          `// Editing is disabled.\n`
      });
    }

    if (isText(buf)) {
      return res.json({ code: buf.toString('utf8') });
    } else {
      const hex = buf.toString('hex').match(/.{1,32}/g).join('\n');
      return res.json({
        code: `// ⚠️ Binary file (${req.params.filename}) shown as hex dump\n\n${hex}`
      });
    }
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});


// Save file
// Save file
router.post('/save/:version/:filename', (req, res) => {
  try {
    let folder = String(req.params.version);
    let folderPath = path.join(ROOT, folder);

    // If exact folder doesn't exist, try numeric prefix fallback (e.g., Mei15 → Mei15Free)
    if (!fs.existsSync(folderPath)) {
      const m = folder.match(/(\d+)/);
      if (m) {
        const candidates = fs.readdirSync(ROOT, { withFileTypes: true })
          .filter(d => d.isDirectory() && new RegExp(`^Mei${m[1]}`, 'i').test(d.name))
          .map(d => d.name);
        if (candidates.length > 0) {
          folder = candidates[0];
          folderPath = path.join(ROOT, folder);
        }
      }
    }

    const filePath = path.join(folderPath, req.params.filename);
    fs.writeFile(filePath, req.body.code || '', 'utf8', (err) => {
      if (err) return res.status(500).json({ error: 'Save failed' });
      res.sendStatus(200);
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});


// Load chat JSON
router.get('/load-chat/:filename', (req, res) => {
  const filePath = path.join(CHAT_HISTORY_FOLDER, req.params.filename);
  fs.readFile(filePath, (err, buf) => {
    if (err) return res.status(500).json({ error: 'Could not read chat file' });

    if (isText(buf)) {
      res.json({ code: buf.toString('utf8') });
    } else {
      const hex = buf.toString('hex').match(/.{1,32}/g).join('\n');
      res.json({
        code: `// ⚠️ Non-text chat file (${req.params.filename}) shown as hex dump\n\n${hex}`
      });
    }
  });
});

router.get('/load-json/:filename', (req, res) => {
  const filePath = path.join(JSON_FOLDER, req.params.filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'JSON file not found' });
  }

  const buf = fs.readFileSync(filePath);
  res.json({ code: buf.toString('utf8') });
});


// Save chat JSON
router.post('/save-chat/:filename', (req, res) => {
  const filePath = path.join(CHAT_HISTORY_FOLDER, req.params.filename);
  fs.writeFile(filePath, req.body.code || '', 'utf8', (err) => {
    if (err) return res.status(500).json({ error: 'Chat save failed' });
    res.sendStatus(200);
  });
});

// Save JSON folder file
router.post('/save-json/:filename', (req, res) => {
  try {
    const filePath = path.join(JSON_FOLDER, req.params.filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'JSON file not found' });
    }

    fs.writeFile(filePath, req.body.code || '', 'utf8', (err) => {
      if (err) return res.status(500).json({ error: 'JSON save failed' });
      res.sendStatus(200);
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;

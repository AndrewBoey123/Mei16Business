// routes/backup.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const archiver = require('archiver');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// Resolve userdata: server.js is at .../dashboard/server.js
// From routes/, go up TWO levels to sibling /userdata
const USERDATA = path.resolve(__dirname, '..', '..', 'userdata');

// Folder resolvers
const DIRS = {
  all: USERDATA,
  persona: path.join(USERDATA, 'persona'),
  mem: path.join(USERDATA, 'mem'),
  img: path.join(USERDATA, 'img'),
  chathistory: path.join(USERDATA, 'chathistory'),
  json: path.join(USERDATA, 'json'),           // <── holds mei_version.json now
  text: path.join(USERDATA, 'text'),

};

// Important single files
const ENV_FILE = path.join(USERDATA, '.env');
const VERSION_FILE_NEW = path.join(DIRS.json, 'mei_version.json'); // new location
const VERSION_FILE_OLD = path.join(USERDATA, 'mei_version.json');  // legacy path

// Render page
router.get('/', (req, res) => {
  if (!req.session?.user) return res.redirect('/');
  res.render('backup', {
    user: req.session.user,
    title: 'Backup Userdata',
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Utility: create ZIP into temp file then download
async function createAndSendZip(res, srcDir, zipName, addFn) {
  if (!fs.existsSync(srcDir)) {
    res.status(404).send('Source folder not found');
    return;
  }

  const tmpZip = path.join(os.tmpdir(), `${zipName}-${Date.now()}.zip`);
  const output = fs.createWriteStream(tmpZip);
  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.on('error', (err) => {
    console.error(`[backup/${zipName}] Archive error:`, err);
    res.status(500).send('Failed to create archive');
  });

  archive.pipe(output);
  addFn(archive, srcDir);
  archive.finalize();

  output.on('close', () => {
    res.download(tmpZip, err => {
      fs.unlink(tmpZip, () => {}); // cleanup temp file
    });
  });
}

// Add helpers
const addWholeDir = (archive, dir, destName = false) =>
  archive.directory(dir, destName === false ? false : destName);
const addOnlyTxt  = (archive, dir) => archive.glob('**/*.txt',  { cwd: dir, dot: true });
const addOnlyJson = (archive, dir) => archive.glob('**/*.json', { cwd: dir, dot: true });

// ─────────────────────────────────────────────────────────────────────────────
// /backup/api/all → zip chathistory, img, mem, persona, json (+ .env, version shim)
router.get('/api/all', async (req, res) => {
  try {
    const tmpZip = path.join(os.tmpdir(), `userdata-${Date.now()}.zip`);
    const output = fs.createWriteStream(tmpZip);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('error', (err) => {
      console.error('[backup/all] Archive error:', err);
      res.status(500).send('Failed to create archive');
    });

    archive.pipe(output);

    // Add the chosen folders (now includes json/)
    const PICK = [
      { dir: DIRS.chathistory, name: 'chathistory' },
      { dir: DIRS.img,         name: 'img' },
      { dir: DIRS.mem,         name: 'mem' },
      { dir: DIRS.persona,     name: 'persona' },
      { dir: DIRS.json,        name: 'json' },
      { dir: DIRS.text,        name: 'text' },
    ];

    for (const { dir, name } of PICK) {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        archive.directory(dir, name);
      }
    }

    // Add .env if exists
    if (fs.existsSync(ENV_FILE) && fs.statSync(ENV_FILE).isFile()) {
      archive.file(ENV_FILE, { name: '.env' });
    }

    // Backward-compat shim for old mei_version.json
    if (!fs.existsSync(VERSION_FILE_NEW) && fs.existsSync(VERSION_FILE_OLD)) {
      archive.file(VERSION_FILE_OLD, { name: 'json/mei_version.json' });
    }

    archive.finalize();

    output.on('close', () => {
      res.download(tmpZip, err => {
        fs.unlink(tmpZip, () => {});
      });
    });
  } catch (e) {
    console.error('[backup/all] Exception while building zip:', e);
    res.status(500).send('Failed while preparing archive');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Individual folders
router.get('/api/persona',     (req, res) => createAndSendZip(res, DIRS.persona,     'persona',     addWholeDir));
router.get('/api/mem',         (req, res) => createAndSendZip(res, DIRS.mem,         'mem',         addWholeDir));
router.get('/api/img',         (req, res) => createAndSendZip(res, DIRS.img,         'img',         addWholeDir));
router.get('/api/chathistory', (req, res) => createAndSendZip(res, DIRS.chathistory, 'chathistory', addWholeDir));
router.get('/api/json',        (req, res) => createAndSendZip(res, DIRS.json,        'json',        addWholeDir));
router.get('/api/text',    (req, res) => createAndSendZip(res, DIRS.text,    'text',    addWholeDir));

module.exports = router;

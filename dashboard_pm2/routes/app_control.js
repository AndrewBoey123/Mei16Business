// routes/app_control.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec } = require('child_process'); // run in a background
const router = express.Router();

// Project root (one up from /dashboard/routes)
const ROOT = path.resolve(__dirname, '..', '..');
const USERDATA = path.join(ROOT, 'userdata');

require('dotenv').config({ path: path.join(USERDATA, '.env') });

const PM2_PROCESS_NAME = 'Mei';

/* ----------------------------- Utility ----------------------------- */

// Normalize version input: accept "18" or "Mei18" and return {folder:"Mei18", file:"Mei18.js", cwd:...}
function getScriptPath(versionInput) {
  const version = String(versionInput).trim();

  // 1️⃣ Exact match first (Mei15Free → Mei15Free/Mei15Free.js)
  const exactFolder = path.join(ROOT, version);
  const exactFile = path.join(exactFolder, `${version}.js`);

  if (fs.existsSync(exactFile)) {
    return {
      scriptFile: exactFile,
      scriptCwd: exactFolder
    };
  }

  // 2️⃣ Fallback: numeric match (Mei15 → Mei15Free / Mei15Business)
  const m = version.match(/(\d+)/);
  if (!m) throw new Error(`Invalid version: ${version}`);

  const num = m[1];

  const folders = fs.readdirSync(ROOT, { withFileTypes: true })
    .filter(d => d.isDirectory() && new RegExp(`^Mei${num}`, 'i').test(d.name))
    .map(d => d.name);

  if (!folders.length)
    throw new Error(`No matching Mei folder for version ${version}`);

  const folder = folders[0];
  const file = path.join(ROOT, folder, `${folder}.js`);

  if (!fs.existsSync(file))
    throw new Error(`Bot file missing: ${file}`);

  return {
    scriptFile: file,
    scriptCwd: path.join(ROOT, folder)
  };
}


/* ------------------------ Proxmox API Client ----------------------- */

function pveRequest(method, apiPath, form = {}) {
  const { PVE_URL, PVE_TOKEN_NAME, PVE_TOKEN_VALUE } = process.env;
  if (!PVE_URL) throw new Error('Missing PVE_URL');

  const url = new URL(`${PVE_URL}/api2/json/${apiPath}`);
  const body = new URLSearchParams(form).toString();

  const opts = {
    method,
    headers: {
      'Authorization': `PVEAPIToken=${PVE_TOKEN_NAME}=${PVE_TOKEN_VALUE}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  agent: new https.Agent({ rejectUnauthorized: false }), // allow self-signed
  };

  return new Promise((resolve, reject) => {
    const req = https.request(url, opts, (res) => {
      let data = '';
      res.on('data', (d) => (data += d));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (method !== 'GET' && body) req.write(body);
    req.end();
  });
}
const pvePost = (p, f) => pveRequest('POST', p, f);
const pveGet  = (p)     => pveRequest('GET',  p);

// Status helpers
async function getGuestStatus(type, node, id) {
  const r = await pveGet(`nodes/${node}/${type}/${id}/status/current`);
  if (r.status < 200 || r.status >= 300) return { ok: false, statusCode: r.status, raw: r.body };
  try {
    const j = JSON.parse(r.body);
    return { ok: true, state: String(j?.data?.status || 'unknown').toLowerCase() };
  } catch {
    return { ok: false, statusCode: r.status, raw: r.body };
  }
}

async function waitUntilStopped(type, node, id, timeoutMs = 90000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = await getGuestStatus(type, node, id);
    if (s.ok && s.state !== 'running') return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function waitUntilUnlocked(type, node, id, timeoutMs = 90000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = await pveGet(`nodes/${node}/${type}/${id}/status/current`);
    if (r.status >= 200 && r.status < 300) {
      try {
        const j = JSON.parse(r.body);
        if (!j?.data?.lock) return true; // unlocked
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function triggerStart(node, type, id) {
  const r = await pvePost(`nodes/${node}/${type}/${id}/status/start`);
  if (r.status < 200 || r.status >= 300)
    return { ok: false, status: r.status, error: (r.body || '').slice(0, 400) };
  try {
    return { ok: true, upid: JSON.parse(r.body)?.data };
  } catch {
    return { ok: false, status: r.status, error: (r.body || '').slice(0, 400) };
  }
}

async function waitTaskDone(node, upid, timeoutMs = 120000) {
  const enc = encodeURIComponent(upid);
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = await pveGet(`nodes/${node}/tasks/${enc}/status`);
    if (r.status >= 200 && r.status < 300) {
      try {
        const j = JSON.parse(r.body);
        const st = j?.data?.status;
        if (st && st !== 'running') return j.data; // {status:'OK'|'ERROR', exitstatus:...}
      } catch {}
    }
    await new Promise((rr) => setTimeout(rr, 1000));
  }
  return { status: 'TIMEOUT' };
}


/* --------------------------- Version listing --------------------------- */
// GET: available versions (scan folders, ASC, e.g., Mei15, Mei16, ...)
// Returns: { success: true, versions: ["Mei15","Mei16",...]}
router.get('/versions', (_req, res) => {
  try {
    const dirs = fs.readdirSync(ROOT, { withFileTypes: true })
      .filter(d => d.isDirectory() && /^Mei\d+.*$/i.test(d.name))
      .map(d => d.name)
      .sort((a, b) => {
        const na = parseInt(a.replace(/\D/g, ''), 10);
        const nb = parseInt(b.replace(/\D/g, ''), 10);
        return na - nb;
      });

    res.json({ success: true, versions: dirs });
  } catch (err) {
    console.error('Error reading Mei folders:', err);
    res.status(500).json({ success: false, message: 'Could not read Mei folders' });
  }
});



/* ------------------------------ Bot control ------------------------------ */

// POST: start selected version (force one bot only)
router.post('/start', (req, res) => {
  const { version } = req.body || {};
  if (!version) return res.status(400).json({ success: false, message: 'Version missing' });

  const { scriptFile, scriptCwd } = getScriptPath(version);
  if (!fs.existsSync(scriptFile)) {
    return res.status(404).json({ success: false, message: `Bot file not found: ${scriptFile}` });
  }

  // Read shared .env
  const envPath = path.join(USERDATA, '.env');
  if (!fs.existsSync(envPath)) {
    return res.status(400).json({ success: false, message: '.env not found' });
  }

  const autorunOK = String(process.env.AUTORUN || '').trim().toLowerCase() === 'yes';


  // Stop old bot, then start new one
  exec(`pm2 delete ${PM2_PROCESS_NAME}`, () => {
    const startCmd = `pm2 start ${scriptFile} --name ${PM2_PROCESS_NAME} --update-env`;
    exec(startCmd, { cwd: scriptCwd, env: { ...process.env, NODE_ENV: 'production' } }, (err, _stdout, stderr) => {
      if (err) {
        return res.status(500).json({ success: false, message: 'Bot failed to start', error: stderr || err.message });
      }

      // ✅ Only run pm2 save/startup if AUTORUN is enabled
      if (autorunOK) {
        exec('pm2 save && pm2 startup', (saveErr, out) => {
          if (saveErr) console.error('⚠️ PM2 save/startup failed:', saveErr.message);
          else console.log('✅ PM2 auto-startup registered:\n', out);
        });
      } else {
        console.log('⚠️ Bot started but not registered for auto-startup (AUTORUN=No).');
      }

      return res.json({ success: true, message: `Started ${path.basename(scriptCwd)}` });
    });
  });
});


// POST: stop bot
router.post('/stop', (_req, res) => {
  exec(`pm2 delete ${PM2_PROCESS_NAME} && pm2 save`, (err) => {
    if (err) return res.status(500).json({ success: false, message: 'Failed to stop bot (is it running?)' });
    return res.json({ success: true, message: 'Bot stopped' });
  });
});

// GET: status (which version is running)
router.get('/status', (_req, res) => {
  exec('pm2 jlist', (err, stdout) => {
    if (err) return res.json({ success: true, version: null });
    try {
      const list = JSON.parse(stdout);
      const bot = list.find(p => p.name === PM2_PROCESS_NAME && p.pm2_env.status === 'online');
      if (!bot) return res.json({ success: true, version: null });

      // const execPath = bot.pm2_env.pm_exec_path || '';
      const execPath = bot.pm2_env.pm_exec_path || '';

      // Match: /Mei16Enterprise/Mei16Enterprise.js
      const m = execPath.match(/[\\/](Mei\d[\w_-]*)[\\/]\1\.js$/i);

      let version = 'Unknown';

      if (m && m[1]) {
        version = m[1];
      } else {
        // fallback: folder name only
        const f = execPath.match(/[\\/](Mei\d[\w_-]*)[\\/]/i);
        if (f && f[1]) version = f[1];
      }

      return res.json({ success: true, version });

    } catch {
      return res.json({ success: true, version: null });
    }
  });
});



/* ------------------------------ QR reset ------------------------------ */

// POST: rescan-qr (only when bot is stopped)
router.post('/rescan-qr', (_req, res) => {
  exec('pm2 jlist', (err, stdout) => {
    if (err) return res.json({ success: false, message: 'Failed to check bot status' });

    try {
      const list = JSON.parse(stdout);
      const running = list.some(p => p.name === PM2_PROCESS_NAME && p.pm2_env.status === 'online');
      if (running) return res.json({ success: false, message: 'Stop the bot before rescanning QR.' });
    } catch {
      return res.json({ success: false, message: 'Error parsing PM2 output' });
    }

    const deleted = [];
    const CLIENT_ID = process.env.WA_CLIENT_ID || 'MEI';
    const WA_DATA_DIR = process.env.WA_DATA_DIR || path.join(ROOT, 'userdata', 'whatsapp');
    const QR_DIR = process.env.QR_DIR || path.join(ROOT, 'userdata', 'qr');

    // Targets for both new and old whatsapp-web.js layouts
    const targets = [
      path.join(WA_DATA_DIR, `session-${CLIENT_ID}`),                 // new layout
      path.join(WA_DATA_DIR, '.wwebjs_auth', `session-${CLIENT_ID}`), // old nested
      path.join(WA_DATA_DIR, '.wwebjs_auth'),
      path.join(WA_DATA_DIR, '.wwebjs_cache'),
    ];

    for (const p of targets) {
      try {
        if (fs.existsSync(p)) {
          fs.rmSync(p, { recursive: true, force: true });
          deleted.push(path.relative(ROOT, p));
        }
      } catch (_) {}
    }

    // Delete all QR files
    try {
      if (fs.existsSync(QR_DIR)) {
        for (const f of fs.readdirSync(QR_DIR)) {
          fs.rmSync(path.join(QR_DIR, f), { recursive: true, force: true });
        }
        deleted.push(path.relative(ROOT, path.join(QR_DIR, '*')));
      }
    } catch (_) {}

    return res.json({ success: true, deleted });
  });
});


/* ------------------------------ Reboot ------------------------------ */

// POST /reboot – respond first, reboot after
router.post('/reboot', (req, res) => {
  const { spawn, exec } = require('child_process');
  const isLinux = process.platform === 'linux' || process.platform === 'darwin';
  const cmd = isLinux ? 'sudo -n reboot' : 'shutdown /r /t 0';

  const envPath = path.join(USERDATA, '.env');
  let autorunOK = false;

  if (fs.existsSync(envPath)) {
    const envText = fs.readFileSync(envPath, 'utf8');
    const autorunMatch = envText.match(/^AUTORUN=(.+)$/m);
    autorunOK = autorunMatch && autorunMatch[1].trim().toLowerCase() === 'yes';
  }

  // Handle persistence logic before reboot
  if (autorunOK) {
    console.log('✅ AUTORUN enabled — saving PM2 state before reboot...');
    exec('pm2 save', (err) => {
      if (err) console.error('⚠️ Failed to save PM2 state:', err.message);
      else console.log('✅ PM2 state saved successfully.');
    });
  } else {
    console.log('⚠️ AUTORUN disabled — removing bot from PM2 before reboot...');
    exec(`pm2 delete ${PM2_PROCESS_NAME} && pm2 save`, (err) => {
      if (err) console.error('⚠️ Failed to clean PM2 state:', err.message);
      else console.log('✅ Bot removed — it will not restart after reboot.');
    });
  }

  // Send immediate response so the dashboard isn't cut off
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Connection', 'close');
  res.status(200).end(JSON.stringify({ success: true, message: 'Rebooting…' }));

  // Perform reboot after short delay
  setTimeout(() => {
    const child = spawn('sh', ['-c', `${cmd} >/dev/null 2>&1 &`], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
  }, 800);
});

// clear logs (SAFE + FALLBACK)
router.post('/clear-logs', (req, res) => {
  exec('pm2 jlist', (err, stdout) => {
    // PM2 not running or no process list
    if (err || !stdout) {
      return res.json({
        success: true,
        message: 'PM2 not running — no logs to clear'
      });
    }

    let list = [];
    try {
      list = JSON.parse(stdout);
    } catch {
      return res.json({
        success: true,
        message: 'No logs to clear'
      });
    }

    const hasMei = list.some(p => p.name === PM2_PROCESS_NAME);

    const cmd = hasMei
      ? `pm2 flush ${PM2_PROCESS_NAME}`
      : 'pm2 flush';

    exec(cmd, (flushErr) => {
      if (flushErr) {
        return res.status(500).json({
          success: false,
          message: 'Failed to clear PM2 logs'
        });
      }

      res.json({
        success: true,
        message: hasMei
          ? 'Mei logs cleared'
          : 'No Mei process found — all PM2 logs cleared'
      });
    });
  });
});



module.exports = router;

// dashboard.js
// ─────────────────────────────────────────────────────────────────────────────
// Required libraries
const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../userdata/.env'), override: true });
// bytenode removed - open source version
const pm2 = require('pm2');  // ✅ add this
const http = require('http');
const https = require('https');
const session = require('express-session');
const bodyParser = require('body-parser');
// const favicon = require('serve-favicon');
const socketIO = require('socket.io');
const { exec, spawnSync } = require('child_process'); // exec for /api/install, spawnSync for updates binary
const archiver = require('archiver'); // for streaming .zip




// ─────────────────────────────────────────────────────────────────────────────
// First-time User Guide JSON Helper
// ─────────────────────────────────────────────────────────────────────────────
const GUIDE_JSON = path.join(__dirname, '..', 'userdata', 'json', 'guide_state.json');

function readGuideJson() {
  try {
    return JSON.parse(fs.readFileSync(GUIDE_JSON, "utf8"));
  } catch (e) {
    return { firstTime: true };
  }
}

function writeGuideJson(val) {
  fs.writeFileSync(GUIDE_JSON, JSON.stringify({ firstTime: val }, null, 2));
}




// ─────────────────────────────────────────────────────────────────────────────
const app = express();

// Env switches
const LIVE = process.env.LIVE || 'No';
const USE_HTTPS = /^(yes|on|true|1)$/i.test(process.env.USE_HTTPS || 'No');
const PORT = Number(process.env.PORT) || (USE_HTTPS ? 443 : 2051);

// Security/header
app.disable('x-powered-by');

// ─────────────────────────────────────────────────────────────────────────────
// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Core middleware
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Static files
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));
app.use('/css', express.static(path.join(PUBLIC_DIR, 'css')));
app.use('/assets', express.static(path.join(PUBLIC_DIR, 'assets')));

// Userdata root (sibling of /dashboard)
const USERDATA = path.resolve(__dirname, '..', 'userdata');

// Serve /userdata directly (for safe direct download links if needed)
app.use('/userdata', express.static(USERDATA));

// Serve MeiXX folders (like /Mei15)
const ROOT = path.resolve(__dirname, '..');
app.use(express.static(ROOT));

// Serve /userdata/img via /media (for gallery)
app.use(
  '/media',
  express.static(path.join(USERDATA, 'img'), {
    index: false,
    dotfiles: 'ignore',
    maxAge: '1h',
    setHeaders(res, filePath) {
      // Simple hardening: only allow common image types
      const ok = /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(filePath);
      if (!ok) res.setHeader('Content-Type', 'application/octet-stream');
    }
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Favicon (ICO/PNG fallback + explicit /favicon.ico route)
// Dynamic favicon based on domain
app.get("/favicon.ico", async (req, res) => {
  try {
    const hostname = req.hostname; // bot.worknova.xyz, web.mei.trading
    res.set("Cache-Control", "no-cache");

    // -----------------------------
    // MEI OFFICIAL
    // -----------------------------
    if (hostname.endsWith("mei.trading") || hostname.endsWith("meibot.cloud")) {
      const meiIcon = path.join(PUBLIC_DIR, "assets", "logo.png");
      if (fs.existsSync(meiIcon)) {
        return res.sendFile(meiIcon);
      }
    }

    // -----------------------------
    // RESELLER (root domain logo)
    // -----------------------------
    const parts = hostname.split(".");
    if (parts.length >= 2) {
      const baseDomain = parts.slice(-2).join(".");
      const resellerUrl = `https://${baseDomain}/img/dashboard/botlogo.png`;

      const https = require("https");
      const ok = await new Promise(resolve => {
        const r = https.request(resellerUrl, { method: "HEAD" }, rr =>
          resolve(rr.statusCode >= 200 && rr.statusCode < 400)
        );
        r.on("error", () => resolve(false));
        r.end();
      });

      if (ok) {
        return res.redirect(resellerUrl);
      }
    }

    // -----------------------------
    // FALLBACKS
    // -----------------------------
    const fallbacks = [
      path.join(PUBLIC_DIR, "favicon.ico"),
      path.join(PUBLIC_DIR, "mei.png"),
      path.join(PUBLIC_DIR, "assets", "logo.png")
    ];

    const fallback = fallbacks.find(p => fs.existsSync(p));
    if (fallback) {
      return res.sendFile(fallback);
    }

    res.status(204).end();
  } catch {
    res.status(204).end();
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// Session (place before routes)
app.use(
  session({
    secret: 'mei-dashboard-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: USE_HTTPS // true when serving over HTTPS
    }
  })
);

// ─────────────────────────────────────────────────────────────
// BRAND dynamic loader (reads .env fresh every request)
// ─────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  try {
    const envPath = path.join(__dirname, '..', 'userdata', '.env');
    const content = fs.readFileSync(envPath, 'utf8');

    let BRAND = 'Mei'; // default

    content.split('\n').forEach(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      const [key, ...rest] = line.split('=');
      if (key === 'BRAND') {
        const val = rest.join('=').trim();
        if (val) BRAND = val;
      }
    });

    res.locals.BRAND = BRAND;

  } catch (e) {
    res.locals.BRAND = 'Mei';
  }

  next();
});


// ─────────────────────────────────────────────────────────────────────────────
// Prevent browser caching of authenticated pages
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});



// ─────────────────────────────────────────────────────────────────────────────
// Auth middlewares
function isAuthenticated(req, res, next) {
  if (!req.session.user) return res.redirect('/');
  next();
}
function isAuthenticatedApi(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic loader (.jsc when LIVE=On/Yes, else .js)
function loadModule(name, isFunction = false, ...args) {
  const jsPath = path.join(__dirname, 'routes', `${name}.js`);
//  const jscPath = path.join(__dirname, 'routes', `${name}.jsc`);
  let selected = jsPath;
//  if ((LIVE === 'On' || LIVE === 'Yes') && fs.existsSync(jscPath)) {
//    selected = jscPath;
//  }
  try {
    const mod = require(selected);
    return isFunction ? mod(...args) : mod;
  } catch (err) {
    console.error(`❌ Failed to load module '${name}' from ${selected}`);
    throw err;
  }
}

// Open source edition - all features enabled
const EDITION = "opensource";

function getEdition() {
  return EDITION;
}

// GLOBAL flag to get edition
app.get("/api/edition", (req, res) => {
  const edition = getEdition();
  res.json({ edition, productName });
});


// ─────────────────────────────────────────────────────────────────────────────
// function for callmebot alerts:
function notifyWhatsApp(msg) {
  const bossphone = process.env.BOSS_PHONE; // e.g. 60123456789 (without @c.us)
  const apikey = process.env.CALLMEBOT_APIKEY; // Your callmebot API key

  if (!bossphone || !apikey) {
    console.warn('❌ BOSS_PHONE or CALLMEBOT_APIKEY missing in .env');
    return;
  }

  const encodedMsg = encodeURIComponent(msg);
  const url = `https://api.callmebot.com/whatsapp.php?phone=${bossphone}&text=${encodedMsg}&apikey=${apikey}`;
  //https://api.callmebot.com/whatsapp.php?phone=60123916822&text=This+is+a+test&apikey=3584180
  exec(`curl -s "${url}"`, (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Callmebot alert failed:', error);
    } else {
      console.log('✅ Callmebot alert sent:', stdout.trim());
    }
  });
}

// function to send message by CallMeBot
function checkMeiInstance() {
  pm2.connect(err => {
    if (err) {
      console.error('❌ Failed to connect to PM2:', err);
      return;
    }

    pm2.list((err, list) => {
      if (err) {
        console.error('❌ PM2 list failed:', err);
        return pm2.disconnect();
      }

      const target = list.find(p => p.name === 'Mei'); // Change to your actual PM2 process name
      if (!target || target.pm2_env.status !== 'online') {
        console.log('⚠️ Mei instance is DOWN. Sending alert...');
        notifyWhatsApp('⚠️ Mei instance is DOWN on the server!');
      } else {
        console.log('✅ Mei instance is running normally.');
        notifyWhatsApp('✅ Mei instance is running normally.');
      }

      pm2.disconnect();
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Route modules (after we create io, pm2 logs will be loaded)
const authRoutes = loadModule('auth');
const envEditorRouter = loadModule('env_editor');
const personaEditorRouter = loadModule('persona_editor');
const chathistoryRouter = loadModule('chathistory');
const phonenumberRouter = loadModule('phonenumber');
const apikeyRouter = loadModule('apikey');
const memoryEditorRouter = loadModule('memory_editor');
const qrCodeRouter = loadModule('qrcode');
// const { router: credentialsRouter } = loadModule('credentials');
const terminalRoute = loadModule('terminal');
const appControlRouter = loadModule('app_control');
const meiEditorRouter = loadModule('mei_editor');
const wizardRouter = loadModule('wizard');
const backupRouter = loadModule('backup');
const gallery = require('./routes/gallery');
const fileManager = require('./routes/file_manager');    // new file manager page
const guideRouter = require('./routes/guide'); //first time user guide page 
// const sendRoutes = require('./routes/send'); // NEW: Import send routes
const n8nPageRouter = require('./routes/n8n_page'); // n8n page
const n8nRouter = require('./routes/n8n');// auto Rag API endpoint routes



// ─────────────────────────────────────────────────────────────────────────────
// Mount routes
app.use('/', authRoutes);
app.use('/env-editor', isAuthenticated, envEditorRouter);
app.use('/persona-editor', isAuthenticated, personaEditorRouter);
app.use('/chathistory', isAuthenticated, chathistoryRouter);
app.use('/phonenumber', isAuthenticated, phonenumberRouter);
app.use('/apikey', isAuthenticated, apikeyRouter);
app.use('/memory-editor', isAuthenticated, memoryEditorRouter);
app.use('/qr-code', isAuthenticated, qrCodeRouter);
// app.use('/credentials', isAuthenticated, credentialsRouter);
// OTA/Updates removed - open source version
app.use('/terminal', isAuthenticated, terminalRoute);
app.use('/api/app-control', isAuthenticatedApi, appControlRouter);
app.use('/mei-editor', isAuthenticated, meiEditorRouter);
app.use('/wizard', isAuthenticated, wizardRouter);
app.use('/backup', isAuthenticated, backupRouter);
app.use('/images', isAuthenticated, gallery); // ✅ protect gallery
app.use('/fileman', isAuthenticated, fileManager);  // page at /fileman
// RAG page removed - open source version
app.use('/guide', isAuthenticated, guideRouter); // first time user guide page
// app.use('/send', sendRoutes);
app.use('/n8n-page', isAuthenticated, n8nPageRouter); // n8n page
app.use('/n8n', n8nRouter); // auto Rag API endpoint routes

// Views
app.get('/dashboard', isAuthenticated, (req, res) => {
  const guide = readGuideJson();

  res.render('dashboard', {
    user: req.session.user,
    showGuide: guide.firstTime
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Install: page + API

// Page: /install
app.get('/install', isAuthenticated, (req, res) => {
  res.render('install', { user: req.session.user, title: 'Install / Update Packages', message: null });
});

// Action: POST /api/install → runs `npm i whatsapp-web.js puppeteer@latest`
app.post('/api/install', isAuthenticatedApi, (req, res) => {
  //const cwd = __dirname;
  const cwd = path.resolve(__dirname, '..');  // go up one level from /dashboard
  const cmd = 'npm i @whiskeysockets/baileys pino whatsapp-web.js puppeteer@latest';

  const child = exec(cmd, { cwd, maxBuffer: 1024 * 1024 * 20 });

  let output = '';
  child.stdout.on('data', d => {
    output += d.toString();
  });
  child.stderr.on('data', d => {
    output += d.toString();
  });

  child.on('close', code => {
    res.json({ success: code === 0, code, output });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// user guide url decision

function checkUrl(url) {
  return new Promise(resolve => {
    const req = https.request(url, { method: "HEAD" }, res => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on("error", () => resolve(false));
    req.end();
  });
}

app.get("/api/guide/resolve", async (req, res) => {
  const { edition = "unknown", hostname = "" } = req.query;

  const isMei = hostname.endsWith("mei.trading") || hostname.endsWith("meibot.cloud");

  try {
    // -----------------------------
    // MEI OFFICIAL
    // -----------------------------
    if (isMei) {

      if (edition === "unknown") {
        return res.json({
          url: "https://meibot.cloud/user_guide.htm"
        });
      }

      const map = {
        free: "userguide_free.htm?jump=freePDF",
        business: "userguide_business.htm?jump=businessPDF",
        enterprise: "userguide_enterprise.htm?jump=enterprisePDF"
      };

      const file = map[edition] || "user_guide.htm";

      const primary = `https://meibot.cloud/${file}`;
      const fallback = `https://bot2.mei.trading/${file}`;

      if (await checkUrl(primary)) {
        return res.json({ url: primary });
      }

      return res.json({ url: fallback });
    }

    // -----------------------------
    // RESELLER (ROOT DOMAIN)
    // -----------------------------
    const parts = hostname.split(".");
    const baseDomain = parts.slice(-2).join(".");
    const origin = `https://${baseDomain}`;

    if (!["free", "business", "enterprise"].includes(edition)) {
      // unknown or opensource editions - link to external docs
      return res.json({
        url: "https://meibot.cloud/user_guide.htm"
      });
    }

    const map = {
      free: "userguide_free.htm?jump=freePDF",
      business: "userguide_business.htm?jump=businessPDF",
      enterprise: "userguide_enterprise.htm?jump=enterprisePDF"
    };

    const candidate = `${origin}/${map[edition]}`;

    if (await checkUrl(candidate)) {
      return res.json({ url: candidate });
    }

    return res.json({
      url: `${origin}/user_guide.htm`
    });

  } catch (err) {
    return res.json({
      url: "https://bot.mei.trading/user_guide.htm"
    });
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// Server (HTTP or HTTPS) + Socket.IO
let server;
if (USE_HTTPS) {
  // Pull cert paths from env or fallback to common locations
  const SSL_KEY_PATH = process.env.SSL_KEY_PATH || '/etc/ssl/private/dashboard.key';
  const SSL_CERT_PATH = process.env.SSL_CERT_PATH || '/etc/ssl/certs/dashboard.crt';

  const sslOptions = {
    key: fs.readFileSync(SSL_KEY_PATH),
    cert: fs.readFileSync(SSL_CERT_PATH)
  };

  server = https.createServer(sslOptions, app);
} else {
  server = http.createServer(app);
}

const io = socketIO(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });
app.set('io', io);

// Socket-powered route (pm2 logs over websockets) — needs io
loadModule('pm2_logs', true, io);

// Start server
server.listen(PORT, '0.0.0.0', () => {
  const proto = USE_HTTPS ? 'https' : 'http';
  console.log(`Mei Dashboard running at ${proto}://localhost:${PORT}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// First check immediately on startup for the CallMeBot
checkMeiInstance(); // Run once on startup
setInterval(checkMeiInstance, 1 * 60 * 60 * 1000); // Every 1 hours
// ─────────────────────────────────────────────────────────────────────────────

// Terminal WebSocket route (attach after server is ready)
loadModule('terminal_ws', true, server);

// ─────────────────────────────────────────────────────────────
// 404 fallback handler (custom message for UserGuide + generic)
// ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  // ✅ Handle missing User Guide PDFs nicely
  if (req.path.match(/^\/Mei\d+\/UserGuideMei\d+\.pdf$/i)) {
    return res.status(404).send(`
      <html>
        <head>
          <title>User Guide Not Found</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding-top: 80px; background-color: #f8f9fa; }
            h2 { color: #333; }
            p { color: #555; }
            a {
              display: inline-block;
              margin-top: 15px;
              padding: 8px 16px;
              background-color: #007bff;
              color: white;
              border-radius: 4px;
              text-decoration: none;
            }
            a:hover { background-color: #0056b3; }
          </style>
        </head>
        <body>
          <h2>Oops! User Guide not found for this version.</h2>
          <p>The requested file doesn’t exist on this server.</p>
          <a href="/">← Back to Dashboard</a>
        </body>
      </html>
    `);
  }

  // ✅ Generic 404 for all other missing pages
  return res.status(404).send(`
    <html>
      <head>
        <title>Page Not Found</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding-top: 80px; background-color: #f8f9fa; }
          h2 { color: #333; }
          p { color: #555; }
          a {
            display: inline-block;
            margin-top: 15px;
            padding: 8px 16px;
            background-color: #6c757d;
            color: white;
            border-radius: 4px;
            text-decoration: none;
          }
          a:hover { background-color: #5a6268; }
        </style>
      </head>
      <body>
        <h2>🚫 Page Not Found</h2>
        <p>The page you're looking for doesn't exist.</p>
        <a href="/">← Back to Dashboard</a>
      </body>
    </html>
  `);
});


// Basic 404 for APIs (avoid sending HTML for API routes)
app.use('/api', (_req, res) => res.status(404).json({ success: false, message: 'API route not found' }));

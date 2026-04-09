"use strict";
const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");

const { runDownloader, fetchManifest } = require("../utils/mei_downloader");
const DOTENV_PATH = path.join(__dirname, "../../userdata/.env");
const VERSION_FILE = path.join(__dirname, "../../userdata/mei_version.json");

// helper: read current MEI_VERSION from .env
function readCurrentVersion() {
  if (!fs.existsSync(DOTENV_PATH)) return null;
  const txt = fs.readFileSync(DOTENV_PATH, "utf8");
  const m = txt.match(/^MEI_VERSION\s*=\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

// helper: set MEI_VERSION in .env (create/update)
function setEnvVar(key, value) {
  let txt = fs.existsSync(DOTENV_PATH) ? fs.readFileSync(DOTENV_PATH, "utf8") : "";
  const re = new RegExp(`^${key}\\s*=.*$`, "m");
  if (re.test(txt)) {
    txt = txt.replace(re, `${key}=${value}`);
  } else {
    if (txt.length && !txt.endsWith("\n")) txt += "\n";
    txt += `${key}=${value}\n`;
  }
  fs.writeFileSync(DOTENV_PATH, txt, "utf8");
}

function isAuthenticated(req,res,next){
  if (!req.session || !req.session.user) return res.status(401).json({ok:false, error:"Not authenticated"});
  next();
}

// GET /ota/versions -> manifest + flags
router.get("/versions", isAuthenticated, async (req, res) => {
  try {
    const manifest = await fetchManifest(); // sorted desc
    const current = readCurrentVersion();
    const enriched = manifest.map(item => {
      const folder = path.join(__dirname, "..", "..", `Mei${String(item.version).replace(/\./g,"_")}`);
      return {
        ...item,
        downloaded: fs.existsSync(folder),
        current: String(current) === `Mei${String(item.version).replace(/\./g,"_")}` || String(current) === String(item.version)
      };
    });
    res.json({ ok:true, current, versions: enriched });
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
});

// POST /ota/download {version?} -> download specific or latest
router.post("/download", isAuthenticated, async (req,res) => {
  try {
    const { version } = req.body || {};
    const chosen = await runDownloader(version || null);
    res.json({ ok:true, downloaded: chosen });
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
});

// POST /ota/switch {version} -> switch MEI_VERSION in .env
router.post("/switch", isAuthenticated, async (req,res) => {
  try {
    const { version } = req.body || {};
    if (!version) return res.status(400).json({ ok:false, error:"version is required" });

    // version can be "18" or "Mei18" or "18.0"
    const slug = String(version).startsWith("Mei") ? String(version) : `Mei${String(version).replace(/\./g,"_")}`;
    const targetFolder = path.join(__dirname, "..", "..", slug);
    if (!fs.existsSync(targetFolder)) {
      return res.status(400).json({ ok:false, error:`Folder not found: ${slug}. Download it first.` });
    }

    setEnvVar("MEI_VERSION", slug);

    // optional: write a small file for UI
    const info = { switched_to: slug, at: new Date().toISOString() };
    try {
      const existing = fs.existsSync(VERSION_FILE)? JSON.parse(fs.readFileSync(VERSION_FILE,"utf8")) : [];
      existing.push({ action:"switch", ...info });
      fs.writeFileSync(VERSION_FILE, JSON.stringify(existing,null,2),"utf8");
    } catch {}

    res.json({ ok:true, message:`MEI_VERSION is now ${slug}. Restart the bot to apply.` });
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
});

// GET /ota/current -> current MEI_VERSION
router.get("/current", isAuthenticated, (req,res) => {
  return res.json({ ok:true, current: readCurrentVersion() });
});

module.exports = router;

// dashboard/utils/mei_downloader.js
"use strict";

const fs = require("fs");
const https = require("https");
const path = require("path");
const os = require("os");
const AdmZip = require("adm-zip");

// ─────────────────────────────────────────────────────────────────────────────
// pkg-aware base paths
// - When packaged:   execPath ≈ .../dashboard/routes/updates-cli-<platform>
// - When from source: __dirname = .../dashboard/utils
// Project root is always "two levels up" from BASE_DIR.
const isPkg = typeof process.pkg !== "undefined";
const BASE_DIR = isPkg ? path.dirname(process.execPath) : __dirname;
const PROJECT_ROOT = path.resolve(BASE_DIR, "..", "..");   // → parent of dashboard
const DOWNLOAD_DIR  = PROJECT_ROOT;                         // keep MeiXX here

const LOG_FILE = path.join(PROJECT_ROOT, "userdata", "mei_ota_debug.log");
function debugLog(msg) {
  try { fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`); } catch {}
}


// ─────────────────────────────────────────────────────────────────────────────
// small fs helpers
function ensureEmptyDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src, dest) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function moveOrCopy(src, dest) {
  try {
    fs.renameSync(src, dest); // fast if same device
  } catch {
    copyRecursive(src, dest);
    fs.rmSync(src, { recursive: true, force: true });
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const cleanup = () => { try { if (fs.existsSync(dest)) fs.unlinkSync(dest); } catch {} };

    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        file.close(() => cleanup());
        return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    }).on("error", (err) => {
      file.close(() => cleanup());
      reject(err);
    });
  });
}

function extractZipSmart(zipPath, targetDir) {
  // create temp directory for extraction
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "mei-zip-"));
  const tmpExtract = path.join(tmpBase, "extract");
  fs.mkdirSync(tmpExtract, { recursive: true });

  // extract zip to temp
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(tmpExtract, true);

  // prepare target folder
  const topEntries = fs.readdirSync(tmpExtract);
  ensureEmptyDir(targetDir);

  // handle single-root-folder ZIP (e.g. Mei19/Mei16_Sock/... inside)
  if (topEntries.length === 1) {
    const only = path.join(tmpExtract, topEntries[0]);
    if (fs.statSync(only).isDirectory()) {
      for (const child of fs.readdirSync(only)) {
        moveOrCopy(path.join(only, child), path.join(targetDir, child));
      }
      fs.rmSync(tmpBase, { recursive: true, force: true });
    }
  } 
  // handle multiple-root entries (rare)
  else {
    for (const entry of topEntries) {
      moveOrCopy(path.join(tmpExtract, entry), path.join(targetDir, entry));
    }
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }

  // ✅ recursively fix permissions inside target folder
  try {
    function fixPermissionsRecursively(dir) {
      for (const entry of fs.readdirSync(dir)) {
        const filePath = path.join(dir, entry);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
          fixPermissionsRecursively(filePath);
          continue;
        }

        // apply file permissions
        if (entry.endsWith("-linux")) {
          fs.chmodSync(filePath, 0o777); // full access for executables
        } else {
          fs.chmodSync(filePath, 0o644); // normal readable files
        }
      }
    }

    fixPermissionsRecursively(targetDir);
  } catch {}

  // done
}




/**
 * Install a package given: { version, source_url, onProgress? }
 * NOTE: This function does NOT touch mei_version.json (the CLI handles that).
 */
async function installFromSource({ version, source_url, onProgress }) {
  if (!version || !source_url) throw new Error("installFromSource requires {version, source_url}");

  const slug       = `Mei${String(version).replace(/\./g, "_")}`;  // e.g., Mei18
  const zipName    = `${slug}.zip`;
  const destZip    = path.join(DOWNLOAD_DIR, zipName);
  const targetDir  = path.join(DOWNLOAD_DIR, slug);

  if (onProgress) onProgress("downloading");
  await downloadFile(source_url, destZip);

  try {
    if (onProgress) onProgress("extracting");
    extractZipSmart(destZip, targetDir);
  } finally {
    try { fs.unlinkSync(destZip); } catch {}
  }

  if (onProgress) onProgress("done");
  return { version, folder: targetDir };
}

module.exports = { installFromSource, PROJECT_ROOT };

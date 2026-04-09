// MeiMapping1.js - Open Source Version
const path = require("path");
const fs = require("fs/promises");

// Default paths (can be overridden via setBasePath)
let BASE_PATH = path.resolve(__dirname, '..', '..', 'userdata');

function resolvePaths() {
  return {
    BASE_PATH: BASE_PATH,
    WHATSAPP_PATH: path.join(BASE_PATH, "whatsapp", "session-MEI"),
    MAPPING_FILE: path.join(BASE_PATH, "json", "mapping.json"),
    CHAT_HISTORY: path.join(BASE_PATH, "chathistory"),
    ENV_PATH: path.join(BASE_PATH, ".env")
  };
}

function setBasePath(newBasePath) {
  BASE_PATH = newBasePath;
}

// --------------------------------------------------
// MAPPING CORE
// --------------------------------------------------
async function readMapping() {
  const { MAPPING_FILE } = resolvePaths();
  try {
    const data = await fs.readFile(MAPPING_FILE, "utf8");
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function buildMapping() {
  const { WHATSAPP_PATH, MAPPING_FILE } = resolvePaths();
  const regex = /^lid-mapping-(\d+)\.json$/;

  let files = [];
  try {
    files = await fs.readdir(WHATSAPP_PATH);
  } catch {
    return await readMapping();
  }

  const existing = await readMapping();
  const map = new Map();

  for (const item of existing) {
    if (item.phoneNumber && item.lid) {
      map.set(item.phoneNumber, item);
    }
  }

  for (const file of files) {
    if (!regex.test(file)) continue;

    const phoneNumber = file.match(regex)[1];
    const filePath = path.join(WHATSAPP_PATH, file);

    try {
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw);
      const lid = typeof parsed === "string" ? parsed : parsed.lid;
      if (lid) map.set(phoneNumber, { phoneNumber, lid });
    } catch {}
  }

  const merged = Array.from(map.values());
  await fs.mkdir(path.dirname(MAPPING_FILE), { recursive: true });
  await fs.writeFile(MAPPING_FILE, JSON.stringify(merged, null, 2));

  return merged;
}

async function getPhoneFromLID(lid) {
  if (!lid) return null;
  const clean = lid.replace("@lid", "");

  let map = await readMapping();
  let found = map.find(m => m.lid === clean);
  if (found) return found.phoneNumber;

  await buildMapping();
  map = await readMapping();
  found = map.find(m => m.lid === clean);

  return found ? found.phoneNumber : lid;
}

async function getLIDFromPhone(phone) {
  if (!phone) return null;

  let map = await readMapping();
  let found = map.find(m => m.phoneNumber === phone);
  if (found) return found.lid;

  await buildMapping();
  map = await readMapping();
  found = map.find(m => m.phoneNumber === phone);

  return found ? found.lid : phone;
}

// --------------------------------------------------
// CHANGE LID → PHONE IN CHAT HISTORY
// --------------------------------------------------
async function changeLID(useLID) {
  const { CHAT_HISTORY } = resolvePaths();
  const mapping = await buildMapping();

  let files = [];
  try {
    files = await fs.readdir(CHAT_HISTORY);
  } catch {
    return;
  }

  for (const file of files) {
    if (!file.endsWith(".json")) continue;

    const name = file.replace(".json", "");
    const filePath = path.join(CHAT_HISTORY, file);

    let targetId = null;

    if (useLID) {
      // phone → LID
      const match = mapping.find(m => m.phoneNumber === name);
      if (!match) continue;
      targetId = match.lid;
    } else {
      // LID → phone
      const match = mapping.find(m => m.lid === name);
      if (!match) continue;
      targetId = match.phoneNumber;
    }

    const raw = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(raw);

    const updated = data.map(row => ({
      ...row,
      user_phone: targetId
    }));

    const newPath = path.join(CHAT_HISTORY, `${targetId}.json`);

    await fs.writeFile(newPath, JSON.stringify(updated, null, 2));

    if (newPath !== filePath) {
      await fs.unlink(filePath);
    }
  }
}

// --------------------------------------------------
// SYNC VERSIONS (for compatibility with synchronous code)
// --------------------------------------------------
const { spawnSync } = require('child_process');

// These synchronous versions use the original binary logic as fallback
// but now use the JS implementation when possible
function getPhoneFromLIDSync(lid, basePath) {
  if (!lid) return null;
  const clean = lid.replace("@lid", "");
  
  // Try to read from mapping file synchronously
  const mappingFile = path.join(basePath || BASE_PATH, "json", "mapping.json");
  try {
    const data = fs.readFileSync(mappingFile, "utf8");
    const map = JSON.parse(data);
    const found = map.find(m => m.lid === clean);
    if (found) return found.phoneNumber;
  } catch {
    // Fallback to returning the lid itself
  }
  
  return clean;
}

function getLIDFromPhoneSync(phone, basePath) {
  if (!phone) return null;
  
  // Try to read from mapping file synchronously
  const mappingFile = path.join(basePath || BASE_PATH, "json", "mapping.json");
  try {
    const data = fs.readFileSync(mappingFile, "utf8");
    const map = JSON.parse(data);
    const found = map.find(m => m.phoneNumber === phone);
    if (found) return found.lid;
  } catch {
    // Fallback to returning the phone itself
  }
  
  return phone;
}

// --------------------------------------------------
// MODULE EXPORTS
// --------------------------------------------------
module.exports = {
  // Async functions (primary)
  readMapping,
  buildMapping,
  getPhoneFromLID,
  getLIDFromPhone,
  changeLID,
  setBasePath,
  
  // Sync functions (for backward compatibility)
  getPhoneFromLIDSync,
  getLIDFromPhoneSync
};

// --------------------------------------------------
// CLI ENTRY (for backward compatibility)
// --------------------------------------------------
async function main() {
  const cmd = process.argv[2];
  const arg = process.argv[3];
  const basePath = process.argv[4];

  if (basePath) setBasePath(basePath);

  switch (cmd) {
    case "getPhone":
      process.stdout.write(await getPhoneFromLID(arg) || "");
      break;

    case "getLID":
      process.stdout.write(await getLIDFromPhone(arg) || "");
      break;

    case "build":
      process.stdout.write(JSON.stringify(await buildMapping()));
      break;

    case "read":
      process.stdout.write(JSON.stringify(await readMapping()));
      break;

    case "changeLID": {
      const flag = String(arg).toLowerCase();
      const useLID = flag === "false" || flag === "0" || flag === "no";
      await changeLID(useLID);
      break;
    }
  }
}

if (require.main === module) {
  main();
}

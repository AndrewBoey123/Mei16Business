// MEIHelper8.js - Open Source Version (No License)
const fs = require('fs');
const path = require('path');
const os = require('os');

const HelperVersion = path.basename(__filename).replace(/\.[^/.]+$/, "");

// ===== Terminal Log Helper =====
function terminalLog(msg) {
    process.stderr.write(`${HelperVersion}: ${msg}\n`);
}

// ===== Helper Functions =====
function getPauseData(file) {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function savePauseData(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function setGlobalPause(file, value) {
    const data = getPauseData(file);
    data.global = value;
    savePauseData(file, data);
    terminalLog(`Global pause is now: ${value}`);
}

function pauseUser(file, phone) {
    const data = getPauseData(file);
    if (!data.paused.includes(phone)) {
        data.paused.push(phone);
        savePauseData(file, data);
        terminalLog(`Paused user: ${phone}`);
    } else {
        terminalLog(`User ${phone} already paused.`);
    }
}

function unpauseUser(file, phone) {
    const data = getPauseData(file);
    const index = data.paused.indexOf(phone);
    if (index !== -1) {
        data.paused.splice(index, 1);
        savePauseData(file, data);
        terminalLog(`Unpaused user: ${phone}`);
    }
}

function isUserPaused(file, phone) {
    const data = getPauseData(file);
    return (data.global || data.paused.includes(phone));
}

function formatTimestamp(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;
}

function loadPersona(long, short, group, coder, boss) {
    if (![long, short, group, coder, boss].every(f => fs.existsSync(f))) {
        terminalLog(`Missing persona files.`);
        process.exit(1);
    }
    // Return data instead of console.log (for JS module usage)
    return {
        MEIPersonaLong: fs.readFileSync(long, "utf-8"),
        MEIPersonaShort: fs.readFileSync(short, "utf-8"),
        MEIPersonaGroup: fs.readFileSync(group, "utf-8"),
        MEIPersonaCoder: fs.readFileSync(coder, "utf-8"),
        MEIPersonaBoss: fs.readFileSync(boss, "utf-8")
    };
}

function clearSessionAndCache() {
    // Clear LocalAuth session
    const sessionPath = path.join(__dirname, '..', '..', 'userdata', '.wwebjs_auth');
    if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });

    // Clear cache (always beside Mei16_Sock.js)
    const cachePath = path.join(__dirname, '.wwebjs_cache');
    if (fs.existsSync(cachePath)) fs.rmSync(cachePath, { recursive: true, force: true });

    console.log("WhatsApp session and cache cleared.");
}

function wasBossNotified(phone, file, expiryMs) {
    if (!fs.existsSync(file)) return false;
    try {
        const data = JSON.parse(fs.readFileSync(file, "utf-8"));
        const last = data.users?.[phone]?.lastNotifiedEpoch || 0;
        return (Date.now() - last < Number(expiryMs));
    } catch (err) {
        terminalLog(`Read fail: ${err.message}`);
        return false;
    }
}

function updateNotificationTimestamp(phone, name, file) {
    try {
        const now = Date.now();
        let data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf-8")) : { users: {} };
        data.users[phone] = {
            whatsappName: name,
            phone,
            lastNotifiedEpoch: now,
            lastNotifiedDateTime: formatTimestamp(now)
        };
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
        terminalLog(`Updated: ${phone}`);
    } catch (err) {
        terminalLog(`Failed to update: ${err.message}`);
        process.exit(1);
    }
}

function logChat(phone, name, msg, reply, dir) {
    const file = path.join(dir, `${phone}.json`);
    const tmpFile = file + ".tmp";

    const entry = {
        datetime: new Date().toISOString(),
        user_phone: phone,
        user_name: name,
        user_message: msg,
        mei_response: reply
    };

    let history = [];
    try {
        if (fs.existsSync(file)) {
            history = JSON.parse(fs.readFileSync(file, "utf-8"));
        }
    } catch (e) {
        terminalLog(`JSON parse error in ${file}: ${e.message}`);
    }

    history.push(entry);

    // Ensure directory exists before writing
    fs.mkdirSync(path.dirname(tmpFile), { recursive: true });

    fs.writeFileSync(tmpFile, JSON.stringify(history, null, 2));
    fs.renameSync(tmpFile, file);

    terminalLog(`Chat is logged.`);
    console.log("ok");
}

function getLastChatHistory(phone, lines, dir) {
    const file = path.join(dir, `${phone}.json`);
    if (!fs.existsSync(file)) return "";
    try {
        const history = JSON.parse(fs.readFileSync(file, "utf-8"));
        const sliced = history.slice(-Number(lines));
        const output = sliced.map(e => `${e.user_name}: ${e.user_message}\nYou: ${e.mei_response}`);
        return output.join("\n");
    } catch (err) {
        return "";
    }
}

function countWordsAndTokens(input) {
    const words = input.trim().split(/\s+/).filter(Boolean).length;
    const tokens = (input.match(/\b\w+\b|[^\s\w]/g) || []).length;
    return { words, tokens };
}

function getCurrentDateTime(locale, tz) {
    const now = new Date().toLocaleString(locale, { timeZone: tz });
    const d = new Date(now);
    const hr = d.getHours();
    const ampm = hr >= 12 ? "PM" : "AM";
    const h12 = hr % 12 || 12;
    console.log(`${d.getDate()} ${d.toLocaleString(locale, { month: "short" })} ${d.getFullYear()}, ${h12}.${String(d.getMinutes()).padStart(2, '0')}${ampm}`);
}

// ===== Module Exports =====
module.exports = {
    loadPersona,
    logChat,
    getLastChatHistory,
    getCurrentDateTime,
    countWordsAndTokens,
    isUserPaused,
    setGlobalPause,
    pauseUser,
    unpauseUser,
    clearSessionAndCache,
    wasBossNotified,
    updateNotificationTimestamp
};

// ===== CLI Dispatcher (for backward compatibility if needed) =====
if (require.main === module) {
    const [,, command, ...args] = process.argv;

    switch (command) {
        case "pause": pauseUser(args[0], args[1]); break;
        case "unpause": unpauseUser(args[0], args[1]); break;
        case "pauseall": setGlobalPause(args[0], true); break;
        case "unpauseall": setGlobalPause(args[0], false); break;
        case "isUserPaused": isUserPaused(args[0], args[1]); break;
        case "loadPersona": loadPersona(args[0], args[1], args[2], args[3], args[4]); break;
        case "clearSessionAndCache": clearSessionAndCache(); break;
        case "wasBossNotified": wasBossNotified(args[0], args[1], args[2]); break;
        case "updateNotificationTimestamp": updateNotificationTimestamp(args[0], args[1], args[2]); break;
        case "logChat": logChat(args[0], args[1], args[2], args[3], args[4]); break;
        case "getLastChatHistory": getLastChatHistory(args[0], args[1], args[2]); break;
        case "countWordsAndTokens": countWordsAndTokens(args.slice(0, -1).join(" ")); break;
        case "getCurrentDateTime": getCurrentDateTime(args[0], args[1]); break;
        default:
            terminalLog(`Unknown command: ${command}`);
            process.exit(1);
    }
}

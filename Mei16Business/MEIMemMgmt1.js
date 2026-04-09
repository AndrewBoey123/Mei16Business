// MEIMemMgmt1.js - Open Source Version
const fs = require('fs');
const path = require('path');

const HelperVersion = path.basename(__filename).replace(/\.[^/.]+$/, "");

// Memory files path (relative to userdata)
const MEM_DIR = path.join(__dirname, '..', '..', 'userdata', 'mem');
const PERM_FILE = path.join(MEM_DIR, 'meimemory-perm.txt');
const TEMP_FILE = path.join(MEM_DIR, 'meimemory-temp.txt');

// Ensure directory exists
if (!fs.existsSync(MEM_DIR)) {
    fs.mkdirSync(MEM_DIR, { recursive: true });
}

function ensureFile(file) {
    if (!fs.existsSync(file)) fs.writeFileSync(file, '', 'utf-8');
}

function log(msg) {
    process.stderr.write(`${HelperVersion}: ${msg}\n`);
}

// === Memory Command Handler ===
function handleMemoryCommand(phone, message) {
    if (!phone || !message) return `${HelperVersion}: Missing phone or message`;

    const lower = message.toLowerCase().trim();
    const words = lower.split(" ");
    const firstTwoWords = words.slice(0, 2).join(" ");
    const restOfMessage = message.trim().split(" ").slice(2).join(" ");

    log(`Command: ${firstTwoWords}`);
    log(`Message: ${restOfMessage}`);

    ensureFile(PERM_FILE);
    ensureFile(TEMP_FILE);

    switch (firstTwoWords) {
        case "add perm":
            if (!restOfMessage) return "⚠️ Nothing to add to permanent memory.";
            fs.appendFileSync(PERM_FILE, `\n${restOfMessage}`, 'utf-8');
            return "✅ [Permanent memory updated] 🧠💾";

        case "add temp":
            if (!restOfMessage) return "⚠️ Nothing to add to temporary memory.";
            fs.appendFileSync(TEMP_FILE, `\n${restOfMessage}`, 'utf-8');
            return "✅ [Temporary memory updated] 📝⏳";

        case "replace perm":
            if (!restOfMessage) return "⚠️ Nothing provided to replace permanent memory.";
            fs.writeFileSync(PERM_FILE, restOfMessage, 'utf-8');
            return "✅ [Permanent memory replaced] 🧠🔁";

        case "replace temp":
            if (!restOfMessage) return "⚠️ Nothing provided to replace temporary memory.";
            fs.writeFileSync(TEMP_FILE, restOfMessage, 'utf-8');
            return "✅ [Temporary memory replaced] 📝🔁";

        case "show perm":
            const perm = fs.readFileSync(PERM_FILE, 'utf-8').trim();
            return perm || "🧠 [Permanent memory is empty] 🗑️";

        case "show temp":
            const temp = fs.readFileSync(TEMP_FILE, 'utf-8').trim();
            return temp || "📝 [Temporary memory is empty] 🗑️";

        case "wipe perm":
            fs.writeFileSync(PERM_FILE, '', 'utf-8');
            return "✅ [Permanent memory wiped clean] 🧠🗑️";

        case "wipe temp":
            fs.writeFileSync(TEMP_FILE, '', 'utf-8');
            return "✅ [Temporary memory wiped clean] 📝🗑️";

        default:
            return "❌ [Unrecognized memory command. Please check spelling or format]";
    }
}

// === Module Exports ===
module.exports = { handleMemoryCommand };

// === CLI Interface (for backward compatibility) ===
if (require.main === module) {
    const args = process.argv.slice(2);
    const message = args[0] ?? '';
    const phone = args[1] ?? 'unknown';
    log(`Received memory command for phone: ${phone}`);
    const output = handleMemoryCommand(phone, message);
    console.log(output);
}

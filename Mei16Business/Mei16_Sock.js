// Mei16-baileys.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', 'userdata', '.env'), override: true, silent: true });

const fs = require('fs');
const readline = require('readline');

// ==============================
// MODULE IMPORTS
// ==============================
const { AIQuery } = require("./MEIAIQuery1.js"); // Done
const MEIBoss = require('./MEIBoss2.js'); // Done
const { handleGroupMessage } = require('./MEIGroup3.js'); // Done
const { downloadBaileysMedia, handleIncomingMedia, handleReplyForPendingMedia, cleanupExpiredMedia } = require('./MEIMedia1.js'); // Done
const { summarizeImage, detectMediaTypeForAi } = require('./MEIImage1.js'); // Done
const { handleImageSaveCommand } = require("./MEIImageSave1.js"); // Done
const { handleImageRequest } = require("./MEIImageSend1.js"); // Done
const VoiceInterpret = require('./MEIVoiceInterpret1.js'); // Done
const VoiceGenerate = require('./MEIVoiceGen2.js'); // Done
const { runFollowUpWorkflow, confirmFollowUpApproved } = require('./MEIFollowUp4.js'); // Done
// RAG removed - requires paid OpenAI embeddings
const { handleInitiateCommand } = require("./MEIInitiate3.js"); // Done
const {summarizePdf} = require("./MeiPdf01.js")
const { translateBossCommand } = require('./MeiBossCmd.js');

// Baileys imports
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const qrcodeImage = require('qrcode');
const axios = require('axios');
const P = require("pino");
const e = require('cors');
const { Console } = require('console');

// ==============================
// BOT CONFIGURATION & CONSTANTS
// ==============================
const MEIVersion = path.basename(__filename).replace(/\.[^/.]+$/, "");

// WhatsApp directories setup
const WA_DATA_DIR = process.env.WA_DATA_DIR || path.resolve(__dirname, '../../userdata/whatsapp/session-MEI');
fs.mkdirSync(WA_DATA_DIR, { recursive: true });
const QR_DIR = process.env.QR_DIR || path.resolve(__dirname, '../../userdata/qr');
const QR_FILE = path.join(QR_DIR, 'qr.png');

// ==============================
// AI ENGINE CONFIGURATION
// ==============================
// AI Provider URLs and Models
const deepseekURL = "https://api.deepseek.com/chat/completions";
const deepseekModel = "deepseek-chat";

const openaiURL = "https://api.openai.com/v1/chat/completions";
const openaiModel = "gpt-4.1"; // or gpt-4o

const qwenURL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions";
const qwenModel = "qwen-turbo";

// DO NOT USE ANTHROPIC FOR GROUP CHAT BOT - Individual chats only
const antURL = "https://api.anthropic.com/v1/messages";
const antModel = "claude-3-7-sonnet-20250219";

// AI Provider URLs and Models
// Free Tier Providers (Recommended)
const groqURL = "https://api.groq.com/openai/v1/chat/completions";
// Note: GROQ_MODEL can be overridden via .env (e.g., llama-3.3-70b-versatile, gemma2-9b-it, mixtral-8x7b-32768)
let groqModel = "llama-3.3-70b-versatile"; // Updated from deprecated 3.1

const geminiURL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
const geminiModel = "gemini-1.5-flash";

const openrouterURL = "https://openrouter.ai/api/v1/chat/completions";
// Note: OPENROUTER_MODEL can be overridden via .env (e.g., openai/gpt-oss-120b, anthropic/claude-3.7-sonnet)
let openrouterModel = "meta-llama/llama-3.1-70b-instruct:free";

const localURL = "http://localhost:11434/v1/chat/completions";
const localModel = "qwen2.5:3b";

// Selected AI Engine (set during initialization)
let chosenEngine = "";
let chosenAPI = "";
let chosenURL = "";
let chosenModel = "";

// ==============================
// PERSONA & MEMORY MANAGEMENT
// ==============================
let MEIPersonaLong = "";
let MEIPersonaShort = "";
let MEIPersonaGroup = "";
let MEIPersonaCoder = "";
let MEIPersonaBoss = "";

// ==============================
// MODULE IMPORTS (Replacing Binaries)
// ==============================
const {
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
    updateNotificationTimestamp,
    loadPersona
} = require('./MEIHelper8');

const { getPhoneFromLID, getLIDFromPhone, changeLID } = require('./MeiMapping1');
const { handleMemoryCommand } = require('./MEIMemMgmt1');

// ==============================
// ENVIRONMENT CONFIGURATION
// ==============================
function parseDotenv(content) {
    const result = {};
    content.split('\n').forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
            const key = match[1];
            let value = match[2] || '';
            value = value.replace(/^['"]|['"]$/g, '');
            result[key] = value;
        }
    });
    return result;
}

async function reloadEnv(sock) {
    try {
        const envText = fs.readFileSync(path.join(__dirname, '..', '..', 'userdata/.env'), 'utf-8');
        const parsed = parseDotenv(envText);

        // Core bot configuration
        global.BOT_NAME = parsed.BOT_NAME || "Mei";
        global.PERSON = parsed.PERSON || "Person";
        global.JOB = parsed.JOB || "Sales";
        global.GROUP_ALLOWED = parsed.GROUP_ALLOWED || "No";
        global.INDIVIDUAL_CHATS = parsed.INDIVIDUAL_CHATS || "Yes";
        global.LID_MAPPING = parsed.LID_MAPPING || true;

        // Voice configuration
        global.USEVOICE = parsed.USEVOICE || "No";
        global.VOICELANGUAGE = parsed.VOICELANGUAGE || "en";
        global.VOICE_API_KEY = parsed.VOICE_API_KEY;
        global.VOICE_MODEL_ID = parsed.VOICE_MODEL_ID;
        global.VOICE_ID = parsed.VOICE_ID;
        global.VOICE_SPEED = parsed.VOICE_SPEED;
        global.VOICE_STABILITY = parsed.VOICE_STABILITY;
        global.VOICE_SIMILARITY = parsed.VOICE_SIMILARITY;
        global.VOICE_SPEAKER_BOOST = parsed.VOICE_SPEAKER_BOOST;

        // Group and persona settings
        global.GROUP_NAMES = (parsed.GROUP_NAMES || "")
            .split(",")
            .map(name => name.trim().toLowerCase());
        global.PERSONA_RELOAD_SECS = parseFloat(parsed.PERSONA_RELOAD_SECS || "10");
        global.IMPLEMENTERS_MODE = parsed.IMPLEMENTERS_MODE || "Off";
        // TA and RAG features removed for open source version

        // Timing and history settings
        global.HISTORY_SHORT = parseInt(parsed.HISTORY_SHORT || "5");
        global.HISTORY_LONG = parseInt(parsed.HISTORY_LONG || "25");
        global.LOCAL_FORMAT = parsed.localFormat || "en-US";
        global.TIME_ZONE = parsed.TimeZone || "Asia/Kuala_Lumpur";

        // Phone numbers
        global.BOT_PHONE = parsed.BOT_PHONE;
        global.ASST_BOSS_PHONE = (parsed.ASST_BOSS_PHONE || "")
                .split(",")
                .map(phone => Number(phone.trim()))
                .filter(num => !isNaN(num));
        const rawBossPhone = parsed.BOSS_PHONE?.trim();

        // API Keys
        global.deepseekApi = parsed.deepseekApi;
        global.openaiApi = parsed.openaiApi;
        global.qwenApi = parsed.qwenApi;
        global.antApi = parsed.antApi;
        global.localApi = parsed.localApi;
        global.gemma3 = parsed.gemma3;
        global.groqApi = parsed.groqApi;
        global.GROQ_MODEL = parsed.GROQ_MODEL || "llama-3.3-70b-versatile";
        global.geminiApi = parsed.geminiApi || parsed.gemma3;
        global.openrouterApi = parsed.openrouterApi;
        global.OPENROUTER_MODEL = parsed.OPENROUTER_MODEL || "meta-llama/llama-3.1-70b-instruct:free";

        // Bot behavior settings
        global.autoClearCache = parsed.AUTO_CLEAR_CACHE || "N";
        global.autoEngineChoice = parsed.AUTO_ENGINE_CHOICE || "1"; // default to GROQ

        // Delays and timing
        global.BLOCK_INTERVAL = parseInt(parsed.BLOCK_INTERVAL) || 10;
        global.RESPONSE_DELAY_MIN_SEC = parseInt(parsed.RESPONSE_DELAY_MIN_SEC) || 2;
        global.RESPONSE_DELAY_MAX_SEC = parseInt(parsed.RESPONSE_DELAY_MAX_SEC) || 3;
        global.TYPING_DURATION_MIN_SEC = parseInt(parsed.TYPING_DURATION_MIN_SEC) || 2;
        global.TYPING_DURATION_MAX_SEC = parseInt(parsed.TYPING_DURATION_MAX_SEC) || 3;
        global.BOSS_NOTIFICATION_EXPIRY = parseInt(parsed.BOSS_NOTIFICATION_EXPIRY) || 60;
        global.MEDIA_EXPIRY_MINUTES = parseInt(parsed.MEDIA_EXPIRY_MINUTES) || 2;
        global.ENV_RELOAD_SECS = parseInt(parsed.ENV_RELOAD_SECS) || 5;

        // Sleep mode settings
        global.MEISleepMode = parsed.MEISleepMode || "Off";
        global.WAKE_UP_HOUR = parseInt(parsed.WAKE_UP_HOUR) || 6;
        global.WAKE_UP_MINS = parseInt(parsed.WAKE_UP_MINS) || 30;
        global.SLEEP_HOUR = parseInt(parsed.SLEEP_HOUR) || 3;
        global.SLEEP_MINS = parseInt(parsed.SLEEP_MINS) || 59;

        // File paths
        global.PERSONA_FILE_LONG = path.join(__dirname, '..', '..', 'userdata/persona/meipersona-long.txt'); 
        global.PERSONA_FILE_SHORT = path.join(__dirname, '..', '..', 'userdata/persona/meipersona-short.txt'); 
        global.PERSONA_FILE_GROUP = path.join(__dirname, '..', '..', 'userdata/persona/meipersona-group.txt'); 
        global.PERSONA_FILE_BOSS = path.join(__dirname, '..', '..', 'userdata/persona/meipersona-boss.txt'); 
        global.PERSONA_FILE_CODER = path.join(__dirname, '..', '..', 'userdata/persona/meipersona-coder-c.txt'); 

        global.SALES_NOTIFICATION_FILE = path.join(__dirname, '..', '..', 'userdata/json/notifyboss-sales.json');
        global.ABUSE_NOTIFICATION_FILE = path.join(__dirname, '..', '..', 'userdata/json/notifyboss-abuse.json');
        global.PAUSED_FILE = path.join(__dirname, '..', '..', 'userdata/json/pausedUsers.json');
        global.CHAT_HISTORY_DIR = path.join(__dirname, '..', '..', 'userdata/chathistory'); 
        // Resolve BOSS_PHONE to include WhatsApp ID
        if (rawBossPhone) {
            global.BOSS_PHONE = rawBossPhone.includes('@') ? rawBossPhone : rawBossPhone + "@s.whatsapp.net";
            console.log('[Env Reloaded] BOSS_PHONE:', global.BOSS_PHONE);
        }

    } catch (err) {
        console.error('Failed to reload .env manually:', err.message);
    }
}

// ==============================
// INITIALIZATIONS
// ==============================
// Load initial environment and persona
reloadEnv();  
setInterval(() => reloadEnv(sock), global.ENV_RELOAD_SECS * 1000);
loadPersonaLocal();

// Persona Reload Interval
setInterval(() => {
    reloadIfNeeded(); // this will throttle by PERSONA_RELOAD_SECS
}, global.PERSONA_RELOAD_SECS * 2000);

// Media cleanup every 5 minutes
setInterval(() => {
    cleanupExpiredMedia();
}, 5 * 60 * 1000);

// ==============================
// VALIDATION FUNCTIONS
// ==============================
function isValidPhoneNumber(num) {
    const cleaned = num.trim();
    return /^\d{10,15}$/.test(cleaned);
}

if (!isValidPhoneNumber(global.BOT_PHONE)) {
    console.error(`Invalid BOT_PHONE: "${global.BOT_PHONE}". Digits only, 10–15 characters.`);
    process.exit(1);
}

let expiryBossReport = global.BOSS_NOTIFICATION_EXPIRY * 60 * 1000; // convert to milliseconds

// ==============================
// HELPER FUNCTIONS
// ==============================
// Note: runHelper and runHelperCommand removed - using JS module imports instead

// ==============================
// PERSONA MANAGEMENT
// ==============================
function loadPersonaLocal() {
    // Load persona using the JS module function
    const personaData = loadPersona(
        global.PERSONA_FILE_LONG,
        global.PERSONA_FILE_SHORT,
        global.PERSONA_FILE_GROUP,
        global.PERSONA_FILE_CODER,
        global.PERSONA_FILE_BOSS
    );
    
    // Use the returned persona data
    try {
        const replaceVars = (text) =>
        text.replace(/{{BOT_NAME}}/g, global.BOT_NAME || "Mei");

        // Identity blocks for persona injection
        const identityBlock = `Your name is ${global.BOT_NAME || "Mei"}.
You work as a ${global.JOB || "Assistant"}.
You talk to ${global.PERSON || "customers"}.`;

        const bossIdentityBlock = `Your name is ${global.BOT_NAME || "Mei"}.
You work as a ${global.JOB || "Assistant"}.`;

        // Inject identity blocks (Coder gets none)
        MEIPersonaLong  = identityBlock + "\n\n" + replaceVars(personaData.MEIPersonaLong);
        MEIPersonaShort = identityBlock + "\n\n" + replaceVars(personaData.MEIPersonaShort);
        MEIPersonaGroup = identityBlock + "\n\n" + replaceVars(personaData.MEIPersonaGroup);
        MEIPersonaBoss  = bossIdentityBlock + "\n\n" + replaceVars(personaData.MEIPersonaBoss);
        MEIPersonaCoder = replaceVars(personaData.MEIPersonaCoder); // No injection
    } catch (err) {
        console.error(`[${MEIVersion}] Failed loading persona files:`, err.message);
    }
}

function getMemoryPersona() {
    const permFile = path.join(__dirname, '..', '..', `userdata/mem/meimemory-perm.txt`);
    const tempFile = path.join(__dirname, '..', '..', `userdata/mem/meimemory-temp.txt`);

    if (!fs.existsSync(permFile)) fs.writeFileSync(permFile, '', 'utf-8');
    if (!fs.existsSync(tempFile)) fs.writeFileSync(tempFile, '', 'utf-8');

    const perm = fs.readFileSync(permFile, 'utf-8').trim();
    const temp = fs.readFileSync(tempFile, 'utf-8').trim();

    let memoryBlock = "";

    // PERMANENT MEMORY
    if (perm) {
        memoryBlock += `\n\nImportant Knowledge & Info YOU Must ALWAYS REMEMBER:\n${perm}`;
    }
    // TEMP MEMORY
    if (temp) {
        memoryBlock += `\n\nComing Days' & Weeks' Updates plus Important Info:\n${temp}`;
    }

    // Market Trend Scanner integration
    return memoryBlock;
}

function refreshMemoryIntoPersona() {
    const memoryAddOn = getMemoryPersona();
    // TA feature removed for open source
    MEIPersonaGroup += `\n${memoryAddOn}`;
    MEIPersonaLong += `\n${memoryAddOn}`;
}

let lastReloadTime = 0;
function reloadIfNeeded() {
    const now = Date.now();
    const intervalMs = Math.max(1000, global.PERSONA_RELOAD_SECS * 1000); // at least 1 sec
    if (now - lastReloadTime > intervalMs) {
        loadPersonaLocal();
        refreshMemoryIntoPersona();
        lastReloadTime = now;
    }
}

// ==============================
// FILE SYSTEM SETUP
// ==============================
if (!fs.existsSync(global.CHAT_HISTORY_DIR)) fs.mkdirSync(global.CHAT_HISTORY_DIR);
if (!fs.existsSync(global.SALES_NOTIFICATION_FILE)) fs.writeFileSync(global.SALES_NOTIFICATION_FILE, JSON.stringify({ users: {} }, null, 2));
if (!fs.existsSync(global.ABUSE_NOTIFICATION_FILE)) fs.writeFileSync(global.ABUSE_NOTIFICATION_FILE, JSON.stringify({ users: {} }, null, 2));
const defaultData = { paused: [], global: false };
if (!fs.existsSync(global.PAUSED_FILE)) fs.writeFileSync(global.PAUSED_FILE, JSON.stringify(defaultData, null, 2));

// ==============================
// BAILEYS CLIENT SETUP
// ==============================
let sock;

async function start() {
    const { state, saveCreds } = await useMultiFileAuthState(WA_DATA_DIR)
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger: P({ level: "silent" }),
    })

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('\nScan this QR code with WhatsApp:');
            qrcode.generate(qr, { small: true });
            
            try {
                fs.mkdirSync(QR_DIR, { recursive: true });
                qrcodeImage.toFile(QR_FILE, qr, { width: 300, margin: 2 })
                    .then(() => console.log('QR saved to:', QR_FILE))
                    .catch(err => {
                        console.error('Failed to save QR image:', err?.message || err);
                        console.log('Showing ASCII QR instead:');
                        qrcode.generate(qr, { small: true });
                    });
            } catch (err) {
                console.error('Failed to save QR image:', err?.message || err);
            }
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
            console.log('Connection closed. Reconnecting...', shouldReconnect);
            if (shouldReconnect) {
                start();
            }
        } else if (connection === 'open') {
            console.log('WhatsApp connected successfully!');
            
            // Get bot phone number
            const user = sock.user;
            if (user && user.id) {
                const phone = user.id.split(':')[0];
                // Guardrail to prevent inconsistency in BOT PHONE
                if (phone.split('@')[0] != global.BOT_PHONE){
                    console.log("Inconsistency in BOT PHONE Number make sure to change the BOT PHONE number in BOT Settings");
                    process.exit(1);
                }else{
                    console.log('Mei AI Bot number is:', phone);
                }
            }
            
            // Reload environment with socket
            reloadEnv(sock);
            console.log("Boss phone's WhatsApp ID:", global.BOSS_PHONE);
        }
    });

    sock.ev.on("creds.update", saveCreds)

    sock.ev.on("messages.upsert", async (msgUpdate) => {
        await handleMessageUpsert(msgUpdate);
    });
}

// ==============================
// UTILITY FUNCTIONS
// ==============================
function customDelay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendPicturesToUser(folderPath, sock, userChatId) {
    try {
        const files = fs.readdirSync(folderPath)
                        .filter(file => /\.(jpe?g|png)$/i.test(file))
                        .slice(0, 10); // Limit to 10 images

        for (const fileName of files) {
            const filePath = path.join(folderPath, fileName);
            const media = {
                url: filePath
            };
            await sock.sendMessage(userChatId, { image: media });
            await customDelay(1500); // delay 1.5 sec between sends
        }

        console.log(`Sent ${files.length} images to ${userChatId}`);
    } catch (err) {
        console.error("Error sending images:", err);
    }
}

async function waitForUserInputOrDefault(defaultValue, timeoutMs) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

        let answered = false;

        rl.question('', (answer) => {
            if (!answered) {
                answered = true;
                rl.close();
                resolve(answer.trim() || defaultValue);
            }
        });

        setTimeout(() => {
            if (!answered) {
                answered = true;
                rl.close();
                console.log(`(Auto-selecting "${defaultValue}" after ${timeoutMs / 1000} secs)`);
                resolve(defaultValue);
            }
        }, timeoutMs);
    });
}

// ==============================
// BOT INITIALIZATION
// ==============================
async function initializeBot() {
    console.log("Starting Mei AI Business Bot...");
    await changeLID(global.LID_MAPPING === "On");
    // Handle Clear Cache Question
    console.log("Clear WhatsApp-Web Auth & Cache folder? (Y/N): ");
    let clearData = await waitForUserInputOrDefault(global.autoClearCache || "N", 2000);
    console.log(`Selected: ${clearData}`);

    if (clearData.toUpperCase() === 'Y') {
        let result = clearSessionAndCache();
        console.log("Result from MEIHelper:", result);
    }

    // Handle AI Engine Selection
    console.log("Choose AI engine: 1.GROQ(Free) 2.Gemini(Free) 3.OpenRouter(Free) 4.Local 5.DeepSeek 6.OpenAI 7.Qwen 8.Anthropic: ");
    let engineChoice = await waitForUserInputOrDefault(global.autoEngineChoice || "1", 2000);
    console.log(`Selected AI Engine: ${engineChoice}`);

    switch (engineChoice.trim()) {
        case "1":
            chosenEngine = "groq"; chosenAPI = global.groqApi; chosenURL = groqURL; chosenModel = global.GROQ_MODEL || groqModel;
            break;
        case "2":
            chosenEngine = "gemini"; chosenAPI = global.geminiApi; chosenURL = geminiURL; chosenModel = geminiModel;
            break;
        case "3":
            chosenEngine = "openrouter"; chosenAPI = global.openrouterApi; chosenURL = openrouterURL; chosenModel = global.OPENROUTER_MODEL || openrouterModel;
            break;
        case "4":
            chosenEngine = "local"; chosenAPI = global.localApi; chosenURL = localURL; chosenModel = localModel;
            break;
        case "5":
            chosenEngine = "deepseek"; chosenAPI = global.deepseekApi; chosenURL = deepseekURL; chosenModel = deepseekModel;
            break;
        case "6":
            chosenEngine = "openai"; chosenAPI = global.openaiApi; chosenURL = openaiURL; chosenModel = openaiModel;
            break;
        case "7":
            chosenEngine = "qwen"; chosenAPI = global.qwenApi; chosenURL = qwenURL; chosenModel = qwenModel;
            break;
        case "8":
            chosenEngine = "anthropic"; chosenAPI = global.antApi; chosenURL = antURL; chosenModel = antModel;
            break;
        default:
            chosenEngine = "groq"; chosenAPI = global.groqApi; chosenURL = groqURL; chosenModel = global.GROQ_MODEL || groqModel;
    }

    start();
}

// ==============================
// AI PROVIDER FUNCTIONS
// ==============================
async function getAIResponse(engine, persona, message, maxTokens, temperature) {
    switch (engine.toLowerCase()) {
        case "groq":
            return await callGROQ(persona, message, maxTokens, temperature);
        case "gemini":
            return await callGemini(persona, message, maxTokens, temperature);
        case "openrouter":
            return await callOpenRouter(persona, message, maxTokens, temperature);
        case "deepseek":
            return await callDeepSeek(persona, message, maxTokens, temperature);
        case "qwen":
            return await callQwen(persona, message, maxTokens, temperature);
        case "anthropic":
            return await callAnt(persona, message, maxTokens, temperature);
        case "local":
            return await callLocal(persona, message, maxTokens, temperature);
        case "openai":
            return await callOpenAI(persona, message, maxTokens, temperature);
        default:
            return await callGROQ(persona, message, maxTokens, temperature);
    }
}

async function callGROQ(persona, message, maxTokens, temperature, fallback = false) {
    try {
        const model = fallback ? "llama-3.3-70b-versatile" : (global.GROQ_MODEL || groqModel);
        console.log(`[GROQ] Using model: ${model}`);
        
        const response = await axios.post(groqURL, {
            model: model,
            messages: [{ role: "system", content: persona }, { role: "user", content: message }],
            temperature: temperature,
            max_tokens: maxTokens,
            top_p: 1,
            frequency_penalty: 0.0,
            presence_penalty: 0.0
        }, {
            headers: { "Authorization": `Bearer ${global.groqApi}`, "Content-Type": "application/json" },
            timeout: 60000 // 60 second timeout
        });
        
        const content = response.data.choices?.[0]?.message?.content;
        
        if (!content || content.trim() === "") {
            console.warn("[GROQ] Empty response. Full response:", JSON.stringify(response.data));
            
            // Fallback to default model if custom model returns empty (prevent infinite loop)
            if (!fallback && model !== "llama-3.3-70b-versatile") {
                console.log("[GROQ] Falling back to default model (llama-3.3-70b-versatile)");
                return await callGROQ(persona, message, maxTokens, temperature, true);
            }
            return "This is an automated Whatsapp reply. The user is not available now. g";
        }
        
        return content;
    } catch (error) {
        console.error("GROQ Error:", error?.response?.data || error.message);
        return "This is an automated Whatsapp reply. The user is not available now. g";
    }
}

async function callOpenRouter(persona, message, maxTokens, temperature) {
    try {
        const response = await axios.post(openrouterURL, {
            model: global.OPENROUTER_MODEL || openrouterModel,
            messages: [{ role: "system", content: persona }, { role: "user", content: message }],
            temperature: temperature,
            max_tokens: maxTokens,
            top_p: 1,
            frequency_penalty: 0.0,
            presence_penalty: 0.0
        }, {
            timeout: 60000, // 60 second timeout
            headers: { 
                "Authorization": `Bearer ${global.openrouterApi}`, 
                "Content-Type": "application/json",
                "HTTP-Referer": "https://meibot.local",
                "X-Title": "Mei Bot"
            }
        });
        return response.data.choices[0].message.content;
    } catch (error) {
        console.error("OpenRouter Error:", error?.response?.data || error.message);
        return "This is an automated Whatsapp reply. The user is not available now. o";
    }
}

async function callOpenAI(persona, message, maxTokens, temperature) {
    try {
        const response = await axios.post(openaiURL, {
            model: openaiModel,
            messages: [{ role: "system", content: persona }, { role: "user", content: message }],
            temperature: temperature,
            max_tokens: maxTokens,
            top_p: 1,
            frequency_penalty: 0.0,
            presence_penalty: 0.0
        }, {
            headers: { "Authorization": `Bearer ${global.openaiApi}`, "Content-Type": "application/json" },
            timeout: 60000 // 60 second timeout
        });
        return response.data.choices[0].message.content;
  } catch (error) {
    console.error("OpenAI Error:", error?.response?.data || error.message);
        return "This is an automated reply. The user is not available now. o";
    }
}

async function callDeepSeek(persona, message, maxTokens, temperature) {
    try {
        const response = await axios.post(deepseekURL, {
            model: deepseekModel,
            messages: [{ role: "system", content: persona }, { role: "user", content: message }],
            temperature: temperature,
            max_tokens: maxTokens,
            top_p: 1,
            frequency_penalty: 0.0,
            presence_penalty: 0.0
        }, {
            headers: { "Authorization": `Bearer ${global.deepseekApi}`, "Content-Type": "application/json" },
            timeout: 60000 // 60 second timeout
        });
        return response.data.choices[0].message.content;
  } catch (error) {
    console.error("DeepSeek Error:", error?.response?.data || error.message);
        return "This is an automated Whatsapp reply. The user is not available now. d";
    }
}

async function callQwen(persona, message, maxTokens, temperature) {
    try {
        const response = await axios.post(qwenURL, {
            model: qwenModel,
            messages: [{ role: "system", content: persona }, { role: "user", content: message }],
            temperature: temperature,
            max_tokens: maxTokens,
            top_p: 1,
            frequency_penalty: 0.0,
            presence_penalty: 0.0
        }, {
            headers: { "Authorization": `Bearer ${global.qwenApi}`, "Content-Type": "application/json" },
            timeout: 60000 // 60 second timeout
        });
        return response.data.choices[0].message.content;
  } catch (error) {
    console.error("Qwen Error:", error?.response?.data || error.message);
        return "This is an automated Whatsapp reply. The user is not available now. q";
    }
}

async function callLocal(persona, message, maxTokens, temperature) {
    try {
        const response = await axios.post(localURL, {
            model: localModel,
            messages: [{ role: "system", content: persona }, { role: "user", content: message }],
            temperature: temperature,
            max_tokens: maxTokens,
            top_p: 1,
            frequency_penalty: 0.0,
            presence_penalty: 0.0
        }, {
            headers: { "Authorization": `Bearer ${global.localApi}`, "Content-Type": "application/json" }
        });
        return response.data.choices[0].message.content;
  } catch (error) {
    console.error("Local LLM Error:", error?.response?.data || error.message);
        return "This is an automated Whatsapp reply. The user is not available now. l";
    }
}

async function callAnt(persona, message, maxTokens = 1024, temperature = 0.5) {
  try {
    const response = await axios.post(antURL, {
      model: antModel,
      system: persona, // Anthropic's correct way for persona, different from other providers
      max_tokens: maxTokens,
      temperature: temperature,
      messages: [
        { role: "user", content: message } // only "user" and "assistant" are allowed here
      ]
    }, {
      headers: {
        "x-api-key": `${global.antApi}`,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01"
      },
      timeout: 60000 // 60 second timeout
    });
    return response.data.content?.[0]?.text;
  } catch (error) {
    console.error("Anthropic Error:", error?.response?.data || error.message);
    return "This is an automated Whatsapp reply. The user is not available now. a";
  }
}
// Debug log removed
async function callGemini(persona, message, maxTokens, temperature) {
    try {
        // Gemini URL uses a query parameter for the API Key
        const urlWithKey = `${geminiURL}?key=${global.geminiApi}`;
        const response = await axios.post(urlWithKey, {
            // System instructions are passed separately from the conversation history
            system_instruction: {
                parts: [{ text: persona }]
            },
            contents: [
                {
                    role: "user",
                    parts: [{ text: message }]
                }
            ],
            generationConfig: {
                temperature: temperature,
                maxOutputTokens: maxTokens,
                topP: 1,
            }
        }, {
            headers: { "Content-Type": "application/json" },
            timeout: 60000 // 60 second timeout
        });

        // Gemini response path: candidates -> content -> parts -> text
        return response.data.candidates[0].content.parts[0].text;

    } catch (error) {
        console.error("Gemini Error:", error?.response?.data || error.message);
        return "This is an automated Whatsapp reply. The user is not available now.";
    }
}

// ==============================
// RAG (RETRIEVAL-AUGMENTED GENERATION)
// ==============================
// RAG feature removed - requires paid OpenAI embeddings

// =======================================
// IMAGE INTENT DETECTION AND IMAGE SEND
// =======================================
async function detectPhotoIntent(history, userName, userMessage) {
    let mergedChat = history += `\n${userName}: ${userMessage}`;
    
    const prompt = `
    Based on this conversation history given below, decide whether it is appropriate to send photos, images, pictures, documents or pdfs in reply.
    - Give more weight to the most recent messages when making your decision.    
    - Reply "YES" if sending an image is clearly relevant, appropriate, or specifically requested saying it has been lost, deleted or misplaced.  
    - Reply "REPEAT" if the user is asking again for images or repeating a previous image request.  
    - Reply "NO" if the context does not suggest an image request, or if asking about some other info.  
    Reply only with "YES", "REPEAT", or "NO".  
    Message: "${mergedChat}"
    `;

    const result = await AIQuery(prompt, chosenURL, chosenModel, chosenAPI, MEIPersonaLong, 0.3, 10);
    const imageRequestMatch = result.trim().toUpperCase();
    return {imageRequestMatch, mergedChat};
}

// function to send image for better code reusability
async function imageSend(userPhone, cleanPhoneNo, userName, userMessage, imageRequestMatch, mergedChat){
    try {
        if (imageRequestMatch == "YES") {
            const { success, logMessage } = await handleImageRequest(
                mergedChat,
                sock,
                userPhone,
                chosenURL,
                chosenModel,
                chosenAPI,
                MEIPersonaShort,
                0.5,
                250
            );

            if (success) {
                const success_prompt = `Tell ${global.PERSON} that what he asked for in his message: ${userMessage} has
                been shared ${logMessage}. Answer in a natural and casual manner in under 20 words. Never use greetings or
                mention non meaningful file or folder name in your answer`;
                const success_msg = await AIQuery(success_prompt, chosenURL, chosenModel, chosenAPI, MEIPersonaShort, 0.3, 100);
                await sock.sendMessage(userPhone, { text: success_msg });
                logChat(cleanPhoneNo, userName, userMessage, logMessage, global.CHAT_HISTORY_DIR);
                return true;
            }
        }else if (imageRequestMatch == "REPEAT"){
            const repeat_prompt = `Using strictly between 5 to 20 words, reply ${global.PERSON} that the images have
            already been sent earlier. Avoid greetings. Avoid using the same sentence structure as your previous replies.
            Always vary your reply contextually based on this chat history: ${mergedChat}`;
            const repeat_msg = await AIQuery(repeat_prompt, chosenURL, chosenModel, chosenAPI, MEIPersonaShort, 0.3, 100);
            await sock.sendMessage(userPhone, { text: repeat_msg });
            logChat(cleanPhoneNo, userName, userMessage, repeat_msg, global.CHAT_HISTORY_DIR);
            return true;
        }
        return false;
    } catch (err) {
        console.warn("Image request handling error:", err.message);
        return false;
    }
}

// ==============================
// SLEEP/WAKE MANAGEMENT
// ==============================
function isMEIAwake() {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const wakeMinutes = global.WAKE_UP_HOUR * 60 + global.WAKE_UP_MINS;
    const sleepMinutes = global.SLEEP_HOUR * 60 + global.SLEEP_MINS;
    
    // Case 1: Normal same-day range (e.g., 8AM to 11PM)
    if (wakeMinutes < sleepMinutes) {
        return nowMinutes >= wakeMinutes && nowMinutes < sleepMinutes;
    }
    // Case 2: Overnight range (e.g., 1AM to 11PM next day)
    return nowMinutes >= wakeMinutes || nowMinutes < sleepMinutes;
}

// ==============================
// WHATSAPP INTERACTION HELPERS
// ==============================
async function simulateSeen(msg) {
    try {
        await sock.readMessages([msg.key]);
        console.log(`${MEIVersion} marked the chat as SEEN for ${msg.key.remoteJid}`);
    } catch (err) {
        console.warn("Failed to mark as seen:", err.message);
    }
}

async function simulateDelays(msg) {
    // Convert min/max from sec to ms
    const responseDelayMs = Math.floor(
        Math.random() * (global.RESPONSE_DELAY_MAX_SEC - global.RESPONSE_DELAY_MIN_SEC) * 1000
    ) + (global.RESPONSE_DELAY_MIN_SEC * 1000);

    const typingDurationMs = Math.floor(
        Math.random() * (global.TYPING_DURATION_MAX_SEC - global.TYPING_DURATION_MIN_SEC) * 1000
    ) + (global.TYPING_DURATION_MIN_SEC * 1000);

    console.log(`${MEIVersion} delaying response by ${(responseDelayMs / 1000).toFixed(2)} seconds...`);
    await customDelay(responseDelayMs);

    console.log(`${MEIVersion} is typing. Delay by ${(typingDurationMs / 1000).toFixed(2)} seconds...`);
    
    // Send typing indicator
    await sock.sendPresenceUpdate('composing', msg.key.remoteJid);
    await customDelay(typingDurationMs);
    await sock.sendPresenceUpdate('paused', msg.key.remoteJid);
}

// ==============================
// MESSAGE BLOCKS MANAGEMENT
// ==============================
let MsgBlocks = {};

// Block message handling
// Handled duplicate message sending due to race condition using a processing flag
setInterval(async () => {
    for (const [key, value] of Object.entries(MsgBlocks)) {

        const diff = Date.now() - value.time;
        const cleanPhoneNo_block = key.split('@')[0];
        let cleanPhoneNo = await getPhoneFromLID(cleanPhoneNo_block);
        if ((cleanPhoneNo?.includes('@lid') || cleanPhoneNo === null)) {
            cleanPhoneNo = cleanPhoneNo_block;
        }

        userPhone = await getLIDFromPhone(cleanPhoneNo)+"@lid";
        if (global?.LID_MAPPING === "false") {
            cleanPhoneNo = userPhone.replace('@lid', '');
        }

        if (value.processing) continue;
        value.processing = true;

        if (diff >= global.BLOCK_INTERVAL * 1000) { // 10 seconds
            try {
                // This prevents stale error
                const { imagePrompt, msg, userName, chatHistoryShort, chatHistoryLong, currentDateTime } = value;
                const blockMessages = value.messages.join(", ");

                // delete the record after processing
                delete MsgBlocks[key];

                // === IMAGE REQUEST DETECTION FOR INDIVIDUAL CHATS ===
                const { imageRequestMatch, mergedChat } = await detectPhotoIntent(chatHistoryShort, userName, blockMessages);
                const img_send_result = await imageSend(key, cleanPhoneNo, userName, blockMessages, imageRequestMatch, mergedChat);
                if (img_send_result) continue;

                // === RAG FOR INDIVIDUAL CHATS ===
                // RAG feature removed

                // === INDIVIDUAL CHAT RESPONSE GENERATION ===
                const isFirstTime = !fs.existsSync(path.join(global.CHAT_HISTORY_DIR, `${cleanPhoneNo}.json`));
                let prompt = "";

                if (isFirstTime) {
                    // FIRST TIME CONTACT
                    prompt = `A new ${global.PERSON} has messaged YOU for the first time. The local date & time now is ${currentDateTime}. 
                    Please greet this ${global.PERSON}, introduce yourself, and ask for this ${global.PERSON}'s name & MUST REPLY to this chat 
                    below by the new ${global.PERSON}:\n\n${global.PERSON}: "${blockMessages}". \n${imagePrompt}.`;
                } else {
                    // RETURNING CONTACT
                    prompt = `This is your most recent chat history with ${userName}:\n${chatHistoryLong}\n${userName}: ${blockMessages}. \n${imagePrompt}.\n
                    The local date & time now is ${currentDateTime}.\nBased on the above chats, your given persona & your role in the company, 
                    generate a reply, without any greeting (unless the ${global.PERSON} is greeting you), to the latest message from ${userName}. 
                    Vary your replies if the topic has already been replied or answered.`;
                }

                const { words, tokens } = countWordsAndTokens(prompt);
                console.log(`Word Count: ${words}    Token Count: ${tokens}`);

                // Simulate human-like delays
                await simulateDelays(msg);

                // Send AI reply
                const reply = await getAIResponse(chosenEngine, MEIPersonaLong, prompt, 150, 0.5);
                try {
                    await sock.sendMessage(key, { text: reply });
                    console.log("Replied:", reply);
                    logChat( cleanPhoneNo, userName, blockMessages, reply, global.CHAT_HISTORY_DIR);
                } catch (err) {
                    console.error(`[${MEIVersion}] Failed to reply to user ${key}: ${err.message}`);
                    logChat( cleanPhoneNo, userName, blockMessages, "[Reply failed]", global.CHAT_HISTORY_DIR);
                }

            } catch (err) {
                console.error("Error in message processing:", err);
            } finally {
                // Always release processing lock
                value.processing = false;
            }

        } else {
            // If not yet due, allow next iteration to check again
            value.processing = false;
        }
    }
}, 1000); // Triggers every second

// ==============================
// MAIN MESSAGE HANDLER
// ==============================
async function handleMessageUpsert(msgUpdate) {
    // Process ALL messages, not just the first one
    for (const msg of msgUpdate.messages) {
        if (!msg.message || msg.key.fromMe) continue;
        await simulateSeen(msg);
        await processSingleMessage(msg);
    }
}

async function processSingleMessage(msg){
    
    // ==============================
    // VARIABLE RESET - ON EVERY MESSAGE
    // ==============================
    let MEIReply = "";
    let imageSummary = "";
    let imagePrompt = "";
    let pdfSummary = "";
    let pdfPrompt = "";
    let media = null;
    let mediaType = "";
    let mediaTypeAI = "";
    let historyContext = "";
    
    // ==============================
    // CONSTANT VARIABLES (don't reset these)
    // ==============================
    let remoteId = msg.key.remoteJid;

    //sender_phoneNumber
    remoteId = remoteId.replace('@s.whatsapp.net', '');
    //sender_lid
    let userPhone; 
    let boss_lid = null;
    if (global.BOSS_PHONE) {
        boss_lid = global.BOSS_PHONE.replace('@s.whatsapp.net', '');
        boss_lid = await getLIDFromPhone(boss_lid)+"@lid";
    }

    // Check if this is a group chat
    const isGroupChat = remoteId.endsWith('@g.us');
    
    let cleanPhoneNo = await getPhoneFromLID(remoteId);
    if ((cleanPhoneNo?.includes('@lid') || cleanPhoneNo === null)) {
        cleanPhoneNo = remoteId;
    }   

    // For groups, use the group ID directly (don't convert to LID)
    if (isGroupChat) {
        userPhone = remoteId;
    } else {
        userPhone = await getLIDFromPhone(cleanPhoneNo)+"@lid";
    }
    
    if (global?.LID_MAPPING === "false") {
        cleanPhoneNo = userPhone.replace('@lid', '');
    }

    // const cleanPhoneNo = userPhone.replace(/[@.a-zA-Z]+/g, "");
    const currentDateTime = getCurrentDateTime(global.LOCAL_FORMAT, global.TIME_ZONE);
    
    // Extract user name - Baileys doesn't have notifyName, using pushName instead
    const userName = msg.pushName || "User";

    let userMessage =
    msg.message.conversation ||
    msg.message.extendedTextMessage?.text ||
    msg.message.imageMessage?.caption ||
    msg.message.videoMessage?.caption ||
    msg.message.documentMessage?.caption ||
    msg.message.documentWithCaptionMessage?.message?.documentMessage?.caption ||
    (
        msg.message.documentMessage?.fileName ? "File: " + msg.message.documentMessage.fileName : ""
    ) ||
    (
        msg.message.documentWithCaptionMessage?.message?.documentMessage?.fileName ? "File: " + msg.message.documentWithCaptionMessage.message.documentMessage.fileName : ""
    ) ||
    "";

    const isAssistBoss = global.ASST_BOSS_PHONE.includes(Number(cleanPhoneNo));
    const isBoss = await MEIBoss.isBossMode(msg, boss_lid) || isAssistBoss;
    
    // === PAUSE CHECKING (Global or Individual) ===
    if (!isBoss) {
        const isUserOrGlobalPaused = isUserPaused(global.PAUSED_FILE, cleanPhoneNo);
        if (isUserOrGlobalPaused === "true") {
            // Log the message even though the bot is paused
            logChat( cleanPhoneNo, userName, userMessage, "[Pause feature activated]", global.CHAT_HISTORY_DIR);
            console.log(`${MEIVersion} ignoring message — Paused globally / individually for ${cleanPhoneNo}.`);
            return;
        }
    }

    // === SLEEP MODE CHECK ===
    if (global.MEISleepMode==="On" && !isMEIAwake() ) {
        console.log (`${MEIVersion} ignoring message. MEI is currently sleeping Zzzzzzzz.`);
        return;
    }

    // ==============================
    // BOSS COMMANDS HANDLING
    // ==============================
    if (isBoss) {

        let translatedBossCommand;

        // New features, allow Boss commands on voice as well:
        if (msg.message.audioMessage){
            boss_media = await downloadBaileysMedia(msg)
            if (boss_media){
                const voiceDir = path.join(__dirname, '../../userdata/voice');
                const userId = userPhone.replace(/[@.]/g, '_');
                const ts = Date.now();
                
                // Save the audio file
                const audioBuffer = Buffer.from(boss_media.data, 'base64');
                audioPath = path.join(voiceDir, `user_audio_${userId}_${ts}.${boss_media.mimetype.includes('ogg') ? 'ogg' : 'mp3'}`);
                
                // Ensure directory exists
                if (!fs.existsSync(voiceDir)) {
                    fs.mkdirSync(voiceDir, { recursive: true });
                }
                
                // Save file
                fs.writeFileSync(audioPath, audioBuffer);
                console.log(`Audio file saved: ${audioPath}`);

                // Process voice note
                try {
                    const boss_interpretedCmd = await VoiceInterpret(audioPath);
                
                    if (boss_interpretedCmd){
                        console.log(`Boss's voice command: ${boss_interpretedCmd}`);
                        translatedBossCommand = await translateBossCommand(boss_interpretedCmd, chosenURL, chosenModel, chosenAPI, 0.2, 100);
                        if (translatedBossCommand){
                            console.log(`Translated Boss Command: ${translatedBossCommand}`);
                            if (translatedBossCommand == "false") {
                                return;
                            };
                        }else{
                            console.log(`Error Translating Boss Command`);
                        }
                    }
                } catch (voiceErr) {
                    console.error(`[Boss Voice] Transcription failed:`, voiceErr.message);
                    await sock.sendMessage(userPhone, { text: "❌ Voice command failed. Please try again or type your command." });
                }
                
                // Cleanup audio file
                if (fs.existsSync(audioPath)) {
                    fs.unlinkSync(audioPath);
                }

            }
        }

        if (translatedBossCommand){
            userMessage = translatedBossCommand;
        }
        bossCmd = userMessage.toLowerCase();
        parts = userMessage.split(" ");
        console.log(bossCmd);

        // === PAUSE/UNPAUSE COMMANDS ===
        if (bossCmd.startsWith("pause all")) {
            setGlobalPause(global.PAUSED_FILE, true);
            MEIReply = `${MEIVersion} Global pause activated.`;
            await sock.sendMessage(userPhone, { text: MEIReply });
            logChat( cleanPhoneNo, userName, userMessage, MEIReply, global.CHAT_HISTORY_DIR);
            return;
        }

        if (bossCmd.startsWith("unpause all")) {
            setGlobalPause(global.PAUSED_FILE, false);
            MEIReply = `${MEIVersion} Global pause lifted.`;
            await sock.sendMessage(userPhone, { text: MEIReply });
            logChat( cleanPhoneNo, userName, userMessage, MEIReply, global.CHAT_HISTORY_DIR);
            return;
        }

        if (parts.length === 2 && bossCmd.startsWith("pause ")) {
            const target = parts[1].replace(/[^0-9]/g, "");        
            pauseUser(global.PAUSED_FILE, target);  
            console.log("I AM USERPHONE", + userPhone)      
            MEIReply = `${MEIVersion} Paused user: ${target}`;
            await sock.sendMessage(userPhone, { text: MEIReply });
            logChat( cleanPhoneNo, userName, userMessage, MEIReply, global.CHAT_HISTORY_DIR);
            return;
        }

        if (parts.length === 2 && bossCmd.startsWith("unpause ")) {
            const target = parts[1].replace(/[^0-9]/g, "");        
            unpauseUser(global.PAUSED_FILE, target);        
            MEIReply = `${MEIVersion} Unpaused user: ${target}`;
            await sock.sendMessage(userPhone, { text: MEIReply });
            logChat( cleanPhoneNo, userName, userMessage, MEIReply, global.CHAT_HISTORY_DIR);
            return;
        }

        if (parts.length === 2 && bossCmd.startsWith("delete ")) {
            const target = parts[1].replace(/[^0-9]/g, "");
            const filePath = path.join(global.CHAT_HISTORY_DIR, `${target}.json`);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                MEIReply = `${MEIVersion} Deleted chat for user: ${target}`;
                await sock.sendMessage(userPhone, { text: MEIReply });
            }else{
                MEIReply = `${MEIVersion} Chat for user: ${target} doesn't exist`;
                await sock.sendMessage(userPhone, { text: MEIReply });
            }
            logChat( cleanPhoneNo, userName, userMessage, MEIReply, global.CHAT_HISTORY_DIR);
            return;
        }

        // === MEMORY MANAGEMENT COMMANDS ===
        const firstTwoWords = bossCmd.trim().split(/\s+/).slice(0, 2).join(" ");
        const validMemCommands = [
            "add perm", "add temp", "replace perm", "replace temp",
            "show perm", "show temp", "wipe perm", "wipe temp"
        ];

        if (validMemCommands.includes(firstTwoWords)) {
            const memoryReply = handleMemoryCommand(global.BOT_PHONE, userMessage);
            if (memoryReply && memoryReply !== "Unrecognized memory command.") {
                await sock.sendMessage(userPhone, { text: memoryReply });
                logChat( cleanPhoneNo, userName, userMessage, memoryReply, global.CHAT_HISTORY_DIR);
                return;
            } else {
                console.warn(`[MEMORY WARNING] Unknown memory command from Boss: "${userMessage}"`);
                return;
            }
        }

        // Warn if boss tried to send some invalid memory-related command
        if (isBoss && !validMemCommands.includes(firstTwoWords) && (bossCmd.includes("perm") || bossCmd.includes("temp"))) {
            console.warn(`[WARNING] Boss sent a memory-style command, but "${firstTwoWords}" was not recognized.`);
        }

        // === IMAGE SAVE COMMANDS ===
        try {
            const isImageSaveCommand = /^save images in /i.test(userMessage);
            const isImageMedia = msg.message.imageMessage || msg.message.documentMessage;

            if (isImageSaveCommand || isImageMedia) {
                await handleImageSaveCommand(msg, sock, userMessage);
                return;
            }
        } catch (err) {
            console.error(`${MEIVersion} image save command failed:`, err.message);
        }

        // === FOLLOW-UP MODULE TRIGGER ===
        const lowerMsg = userMessage.trim().toLowerCase();
        const followMatch = lowerMsg.match(/^follow up(?:\s+(\d+))?$/);
        if (followMatch) {
            let daysToScan = followMatch[1] ? Number(followMatch[1]) : 3;
            if (isNaN(daysToScan) || daysToScan < 1 || daysToScan > 30) {
                await sock.sendMessage(userPhone, { text: `${MEIVersion}: Invalid day range. Please use: follow up 1 ~ 30 only.` });
                return;
            }
            await runFollowUpWorkflow(
                sock,
                userPhone,
                chosenEngine,
                chosenURL,
                chosenAPI,
                chosenModel,
                MEIPersonaShort,
                daysToScan
            );

            await sock.sendMessage(userPhone, { text: `${MEIVersion}: Scanned past ${daysToScan} day(s). Reply with your approved list within 2 mins.` });
            return;
        }

        // Boss replies with approval for follow-ups
        if (userMessage.toLowerCase().startsWith("follow up")) {
            await confirmFollowUpApproved(
                sock,
                global.BOSS_PHONE,
                userName,
                userMessage,
                chosenEngine,
                chosenURL,
                chosenAPI,
                chosenModel,
                MEIPersonaShort
            );
            await sock.sendMessage(userPhone, { text: `${MEIVersion}: Follow-ups completed (if valid).` });
            return;
        }

        // === INITIATE/CONTACT COMMANDS ===
        const bossCmdInit = userMessage.toLowerCase().trim();
        if (/^(initiate|contact)\s+/.test(bossCmdInit)) {
            await handleInitiateCommand(
                msg,
                sock,
                userMessage,
                chosenURL,
                chosenModel,
                chosenAPI,
                MEIPersonaShort,
                0.5,
                200
            );
            return;
        }

        // === BOSS DATA ANALYSIS & REPORTING ===
        if (userMessage){

            const BossChatPrompt = `Below is the chat history between YOU & your Boss:\n${getLastChatHistory(cleanPhoneNo, global.HISTORY_SHORT.toString(), global.CHAT_HISTORY_DIR)}\nAnd Boss latest chat is: "${userMessage}". ${imagePrompt}.\n
            The local date & time now is: ${currentDateTime}.\nDetermine if Boss is requesting a data analysis on the ${global.PERSON}s' chats, enquiries, sales, 
            or messages related to the company's products or services.
            Reply YES in the format below, if Boss is asking for data analysis of ${global.PERSON}'s chats and data on what or when they chat.
            Reply in this format STRICTLY:\nIS_REPORT: YES or NO\nREPLY: <your reply to Boss based on persona, if IS_REPORT is NO.>\n`;

            const bossResponse = await getAIResponse(chosenEngine, MEIPersonaBoss, BossChatPrompt, 100, 0.4);
            console.log (`Is Boss asking for data analysis? ${bossResponse}\n\n`);

            const match = bossResponse.match(/IS_REPORT:\s*(YES|NO)(?:\s*REPLY:\s*([\s\S]*))?/i);

            if (!match) {
                console.error(`[${MEIVersion}] Unexpected bossResponse format: "${bossResponse}"`);
                try {
                    await sock.sendMessage(userPhone, { text: "Sorry, unable to process your request. Can rephrase?" });
                    logChat( cleanPhoneNo, userName, userMessage, "[Boss Mode parse error]", global.CHAT_HISTORY_DIR);
                } catch (err) {
                    console.error(`[${MEIVersion}] Failed to reply to Boss: ${err.message}`);
                    logChat( cleanPhoneNo, userName, userMessage, "[Reply to Boss failed]", global.CHAT_HISTORY_DIR);
                }
                return;
            }

            const isReport = match[1].trim().toUpperCase();
            const aiReply = match[2] ? match[2].trim() : "";

            if (isReport === "NO") {
                try {
                    await sock.sendMessage(userPhone, { text: aiReply });
                    console.log(`${MEIVersion} replied: ${aiReply}`);
                    logChat( cleanPhoneNo, userName, userMessage, aiReply, global.CHAT_HISTORY_DIR);
                } catch (err) {
                    console.error(`[${MEIVersion}] Failed to reply to Boss: ${err.message}`);
                    logChat( cleanPhoneNo, userName, userMessage, "[Reply to Boss failed]", global.CHAT_HISTORY_DIR);
                }
                return;
            }

            // === DATA ANALYSIS CODE GENERATION AND EXECUTION ===
            const codePrompt = `Below is the chat history between YOU & your Boss:\n${getLastChatHistory(cleanPhoneNo, global.HISTORY_SHORT.toString(), global.CHAT_HISTORY_DIR)}\nAnd his latest chat is: "${userMessage}". ${imagePrompt}.\n
            The local date & time now is: ${currentDateTime}. Generate the necessary codes to get these data for Boss.`;
            
            const gptCode = await MEIBoss.askAIforCodes(codePrompt, chosenURL, chosenModel, chosenAPI, MEIPersonaCoder);

            console.log("Code Gen:\n", gptCode);
            if (/console\.log/.test(gptCode)) {
                console.warn(`${MEIVersion} blocks code: Console.log was used.`);
                MEIReply = "Blocked execution. Please rephrase your request.";
                await sock.sendMessage(userPhone, { text: MEIReply });
                console.log(`${MEIVersion} replied: ${MEIReply}`);
                logChat( cleanPhoneNo, userName, userMessage, MEIReply, global.CHAT_HISTORY_DIR);
                return;
            }

            if (MEIBoss.extractCodeFromGPTReply(gptCode) !== null) {
                // Force cleanup and get all chats
                MEIBoss.getAllChatsFromFolder(global.CHAT_HISTORY_DIR || './chathistory');
                const result = MEIBoss.runDynamicCode(gptCode);
                console.log("Execution Result:\n", result);

                const smartReplyPrompt = `Below is the chat history between your Boss & YOU:\n${getLastChatHistory(cleanPhoneNo, global.HISTORY_SHORT.toString(), global.CHAT_HISTORY_DIR)}\nYour Boss' latest chat is:\n"${userMessage}". ${imagePrompt}, and 
                you executed a code and got this result:\n"${result}".\nThe date & time now is: ${currentDateTime}. Provide the answer to your Boss without showing any code. 
                Do not use quotation marks and do not include the word Javascript. Keep all answers straight-forward, short and summarized. NO greetings and NO question.`;

                const explainedReply = await getAIResponse(chosenEngine, MEIPersonaBoss, smartReplyPrompt, 1000, 0.3);
                await sock.sendMessage(userPhone, { text: explainedReply });
                console.log(`${MEIVersion} replied: ${explainedReply}`);
                logChat( cleanPhoneNo, userName, userMessage, explainedReply, global.CHAT_HISTORY_DIR);
                return;
            }

        }

        return;
    }

    // ==============================
    // GROUP CHAT HANDLING
    // ==============================
    const isGroup = userPhone.endsWith('@g.us');
    if (isGroup) {
        const groupMetadata = await sock.groupMetadata(userPhone);
        const chatName = groupMetadata.subject.toLowerCase().trim();
        const groupName = groupMetadata.subject;
        const allowedGroups = global.GROUP_NAMES.map(name => name.toLowerCase().trim());

        if (global.GROUP_ALLOWED === "Yes" && allowedGroups.includes(chatName)) {
            const senderName = userName;

            const history = getLastChatHistory(cleanPhoneNo, global.HISTORY_SHORT.toString(), global.CHAT_HISTORY_DIR);

            // === MEDIA & IMAGE DETECTION FOR GROUPS ===
            if (msg.message.imageMessage || msg.message.videoMessage || msg.message.audioMessage || msg.message.documentMessage) {
                try {
                    // Download media using Baileys
                    media = await downloadBaileysMedia(msg);
                    
                    if (media) {
                        mediaType = media.messageType;
                        mediaTypeAI = detectMediaTypeForAi(media);

                        console.log(`Media type detected for AI: ${mediaTypeAI}`);
                        console.log(`Media type detected for Boss forwarding: ${mediaType}`);
                        console.log(`Media MIME type: ${media.mimetype}`);

                        // Image summary with actual Baileys media
                        if (mediaTypeAI === "image") {
                            imageSummary = await summarizeImage(media, userMessage, global.openaiApi, MEIPersonaLong);
                            if (imageSummary) {
                                console.log(`Image summary generated: ${imageSummary}`);
                            }
                        } else if (mediaTypeAI == "pdf") {
                            // Try PDF summarization, but fallback to forwarding if it fails
                            try {
                                pdfSummary = await summarizePdf(media, global.groqApi);
                                if (pdfSummary) {
                                    console.log(`[PDF] Summary generated: ${pdfSummary}`);
                                }
                            } catch (pdfErr) {
                                console.log(`[PDF] Summarization failed (${pdfErr.message}), forwarding without AI summary.`);
                                pdfSummary = "[PDF document]";
                            }
                        } else {
                            console.warn(`Skipping AI image analysis on non-image media type: ${mediaTypeAI}.`);
                        }
                        // To log the Summary of image and pdf sent on group
                        logChat( cleanPhoneNo, userName, `[User sent a media file with this description: ${imageSummary || ""} ${pdfSummary || ""}], along with this chat: "${userMessage}"`, "", global.CHAT_HISTORY_DIR);
                    } else {
                        console.warn('Failed to download media from Baileys message');
                    }
                } catch (err) {
                    console.warn("Failed to process media for summary:", err.message);
                }

                // === VOICE NOTE HANDLING FOR GROUPS ===
                if (global.USEVOICE === "Yes" && mediaType === "audio") {
                    let audioPath = "";
                    let replyPath = "";
                    try {
                        const voiceDir = path.join(__dirname, '../../userdata/voice');
                        const userId = userPhone.replace(/[@.]/g, '_');
                        const ts = Date.now();
                        
                        // Save the audio file
                        const audioBuffer = Buffer.from(media.data, 'base64');
                        audioPath = path.join(voiceDir, `user_audio_${userId}_${ts}.${media.mimetype.includes('ogg') ? 'ogg' : 'mp3'}`);
                        
                        // Ensure directory exists
                        if (!fs.existsSync(voiceDir)) {
                            fs.mkdirSync(voiceDir, { recursive: true });
                        }
                        
                        // Save file
                        fs.writeFileSync(audioPath, audioBuffer);
                        console.log(`Audio file saved: ${audioPath}`);

                        // Process voice note
                        const interpretedText = await VoiceInterpret(audioPath);
                        
                        if (interpretedText) {
                            console.log(`User's voice message: ${interpretedText}`);
                            
                            // Image request detection for voice notes
                            const { imageRequestMatch, mergedChat } = await detectPhotoIntent(history, userName, interpretedText);
                            const img_send_result = await imageSend(userPhone, cleanPhoneNo, userName, interpretedText, imageRequestMatch, mergedChat);
                            if (img_send_result) return;

                            const cleanHistory = (history || '')
                                .split('\n')
                                .filter(line => line.trim().toLowerCase() !== 'you:')
                                .join('\n');

                            const wholeMessage = `Group name: ${groupName}, 
                            The local date & time now is: ${currentDateTime}.
                            Below is the group chat history between YOU and other group members (latest at the bottom):\n${cleanHistory}\n
                            ${senderName} sends a voice message: "${interpretedText}."
                            Generate a natural reply based on the chat histories, emphasizing your reply more towards replying the latest chat from ${senderName}.`;

                            const aiReply = await getAIResponse(chosenEngine, MEIPersonaGroup, wholeMessage, 150, 0.3);
                            console.log(`AI to reply using voice: ${aiReply}`);

                            // Generate and send voice reply (fallback to text if no voice API)
                            replyPath = path.join(voiceDir, `bot_reply_${userId}_${ts}.mp3`);
                            const voiceResult = await VoiceGenerate(aiReply, replyPath);

                            if (voiceResult) {
                                await sock.sendMessage(userPhone, {
                                    audio: { url: replyPath },
                                    mimetype: 'audio/mpeg',
                                });
                            } else {
                                // Fallback to text if voice generation not available
                                await sock.sendMessage(userPhone, { text: aiReply });
                            }

                            logChat( cleanPhoneNo, senderName, `[User sent a voice message]: ${interpretedText}`,`${aiReply}`,global.CHAT_HISTORY_DIR);
                            return;
                        }

                    } catch (err) {
                        console.error("Error while handling voice message:", err.message);
                    }finally{
                        // Cleanup audio file
                        if (fs.existsSync(replyPath)) {
                            fs.unlinkSync(replyPath);
                        }
                        if (fs.existsSync(audioPath)) {
                            fs.unlinkSync(audioPath);
                        }
                    }
                }
            }

            // === IMAGE REQUEST DETECTION FOR GROUPS ===
            if (!imageSummary && !msg.message.documentMessage){
                const { imageRequestMatch, mergedChat } = await detectPhotoIntent(history, userName, userMessage);
                const img_send_result = await imageSend(userPhone, cleanPhoneNo, userName, userMessage, imageRequestMatch, mergedChat);
                if (img_send_result) return;
            }

            const cleanedHistory = history
                .split('\n')
                .filter(line => line.trim().toLowerCase() !== 'you:')
                .join('\n');

            // === MARKET SCANNER FOR GROUPS ===
            // Build dynamic group prompt with optional image summary
            const groupPromptParts = [
                `Group name: ${groupName}`,
                `The local date & time now is: ${currentDateTime}.`,
                `Below is the group chat history between YOU and other group members (latest at the bottom):\n${cleanedHistory}\n`,
                `${senderName}: "${userMessage}"`,
            ];

            if (imageSummary) {
                groupPromptParts.push(`${senderName} also sent an image. Here is what you see:\n${imageSummary}. MUST consider this image too, when you reply. `);
            }

            if (pdfSummary) {
                groupPromptParts.push(`${senderName} also sent a document pdf. Here is what you see:\n${pdfSummary}. MUST consider this document pdf too, when you reply. `);
            }

            groupPromptParts.push(`Generate a natural reply based on the chat histories, emphasizing your reply more towards replying the latest chat from ${senderName}. ` +
            `Do not include "You:" in your replies.`);

            // Final prompt and group message handling
            const groupPrompt = groupPromptParts.join("\n");
            let groupResult = "skipped";
            try {
                groupResult = await handleGroupMessage({
                    msg,
                    chat: { isGroup: true },
                    groupName,
                    botName: global.BOT_NAME,
                    botNumber: global.BOT_PHONE,
                    client: sock,
                    CHAT_HISTORY_DIR: global.CHAT_HISTORY_DIR,
                    personaLong: MEIPersonaGroup,
                    personaShort: MEIPersonaShort,
                    chosenURL,
                    chosenAPI,
                    chosenModel,
                    prompt: groupPrompt,
                    HISTORY_SHORT: global.HISTORY_SHORT,
                    logChat
                });
                // TA feature removed for open source version
            } catch (err) {
                console.error(`${global.BOT_NAME} on ${MEIVersion}: Group reply failed: ${err.message}`);
                groupResult = "error";
            }

            if (groupResult === "replied") {
                console.log(`${global.BOT_NAME} on ${MEIVersion}: replied Group message from ${groupName}`);
            } else {
                console.log(`${global.BOT_NAME} on ${MEIVersion}: didn't reply for Group ${groupName}, logged only.`);
            }
            return;

        } else {
            console.log(`${global.BOT_NAME} on ${MEIVersion}: ignoring message — Not in allowed groups (${groupName})`);
            return;
        }
    }


    // ==============================
    // INDIVIDUAL CHAT HANDLING
    // ==============================
    if (global.INDIVIDUAL_CHATS === "Yes") {
        // === BLOCK EMPTY MESSAGES ===
        const hasDocument = !!msg.message.documentMessage || !!msg.message.documentWithCaptionMessage;
        if (!userMessage && !msg.message.imageMessage && !msg.message.videoMessage && !msg.message.audioMessage && !hasDocument) {
            console.log(`Empty message received from ${userPhone}, ignoring.`);
            return;
        }

        let chatHistoryShort = getLastChatHistory(cleanPhoneNo, global.HISTORY_SHORT.toString(), global.CHAT_HISTORY_DIR);
        let chatHistoryLong = getLastChatHistory(cleanPhoneNo, global.HISTORY_LONG.toString(), global.CHAT_HISTORY_DIR);

        // === MEDIA HANDLING FOR INDIVIDUAL CHATS ===
        if (msg.message.imageMessage || msg.message.videoMessage || msg.message.audioMessage || msg.message.documentMessage || msg.message.documentWithCaptionMessage) {
            try {
                media = await downloadBaileysMedia(msg);
                if (media) {
                    mediaType = media.messageType;
                    mediaTypeAI = detectMediaTypeForAi(media);

                    console.log(`Media type detected for AI: ${mediaTypeAI}`);
                    console.log(`Media type detected for Boss forwarding: ${mediaType}`);

                    if (mediaTypeAI === "image") {
                        imageSummary = await summarizeImage(media, userMessage, global.openaiApi, MEIPersonaLong);
                        if (imageSummary) {
                            imagePrompt = `This latest chat also has an image of this description: ${imageSummary}`;
                        }
                    } else if (mediaTypeAI == "pdf"){
                        // Try PDF summarization, but fallback to forwarding if it fails
                        try {
                            pdfSummary = await summarizePdf(media, global.groqApi);
                            if (pdfSummary) {
                                pdfPrompt = `This latest chat also has a document pdf of this description: ${pdfSummary}`;
                            }
                        } catch (pdfErr) {
                            console.log(`[PDF] Summarization failed (${pdfErr.message}), forwarding without AI summary.`);
                            pdfSummary = "[PDF document]";
                        }
                    } else {
                        console.warn(`Skipping AI analysis on non-image and non-pdf media type: ${mediaTypeAI}`);
                    }
                }
            } catch (err) {
                console.warn("Failed to process image for summary:", err.message);
            }
        }

        // Handle non-image media forwarding to boss
        if (msg.message.imageMessage || msg.message.videoMessage || msg.message.audioMessage || msg.message.documentMessage || msg.message.documentWithCaptionMessage) {
            const handled = await handleIncomingMedia(msg, sock, chatHistoryShort, userName,cleanPhoneNo);
            if (handled) {
                logChat( cleanPhoneNo, userName, `[User sent a media file with this description: ${imageSummary || ""} ${pdfSummary || ""}], along with this chat: "${userMessage}"`, "[Media forwarded to Boss]", global.CHAT_HISTORY_DIR);
            }

            const handledReply = await handleReplyForPendingMedia(msg, sock, chatHistoryShort,cleanPhoneNo);
            if (handledReply) {
                logChat( cleanPhoneNo, userName, `[User sent a media file with this description: ${imageSummary || ""} ${pdfSummary || ""}] with no chat message.`, "[Forwarded + Media clarified]", global.CHAT_HISTORY_DIR);
            }
        }

        if (pdfPrompt){
            prompt = `This is your most recent chat history with ${userName}:\n${chatHistoryLong}\n${userName}: ${userMessage}. ${pdfPrompt || ""}. \n
            The local date & time now is ${currentDateTime}.\nBased on the above chats, your given persona & your role in the company, 
            generate a reply, without any greeting (unless the ${global.PERSON} is greeting you), to the latest message from ${userName}. 
            Vary your replies if the topic has already been replied or answered.`;
            const reply = await getAIResponse(chosenEngine, MEIPersonaLong, prompt, 150, 0.5);
            try {
                await sock.sendMessage(userPhone, { text: reply });
                console.log("Replied:", reply);
                logChat( cleanPhoneNo, userName, userMessage, reply, global.CHAT_HISTORY_DIR);
            } catch (err) {
                console.error(`[${MEIVersion}] Failed to reply to user ${userPhone}: ${err.message}`);
                logChat( cleanPhoneNo, userName, userMessage, "[Reply failed]", global.CHAT_HISTORY_DIR);
            }finally{
                return;
            }
        }


        // === VOICE NOTES FOR INDIVIDUAL CHATS ===
        // ALWAYS transcribe voice notes for AI understanding
        // USEVOICE only controls whether we reply with voice or text
        let voiceInterpretedText = null;
        if (mediaTypeAI.startsWith("audio")) {
            let audioPath = "";
            let replyPath = "";
            try {
                const voiceDir = path.join(__dirname, '../../userdata/voice');
                const userId = userPhone.replace(/[@.]/g, '_');
                const ts = Date.now();
                
                // Save the audio file
                const audioBuffer = Buffer.from(media.data, 'base64');
                audioPath = path.join(voiceDir, `user_audio_${userId}_${ts}.${media.mimetype.includes('ogg') ? 'ogg' : 'mp3'}`);
                
                // Ensure directory exists
                if (!fs.existsSync(voiceDir)) {
                    fs.mkdirSync(voiceDir, { recursive: true });
                }
                
                // Save file
                fs.writeFileSync(audioPath, audioBuffer);
                console.log(`[Voice] Audio file saved: ${audioPath}`);

                // ALWAYS transcribe voice note (for AI understanding)
                try {
                    voiceInterpretedText = await VoiceInterpret(audioPath);
                    console.log(`[Voice] Transcribed: ${voiceInterpretedText}`);
                } catch (voiceErr) {
                    console.error(`[Voice] Transcription failed:`, voiceErr.message);
                    voiceInterpretedText = null;
                }
                
                // If USEVOICE=Yes, also send voice reply
                if (global.USEVOICE === "Yes" && voiceInterpretedText) {
                    // Image request detection for voice notes
                    const { imageRequestMatch, mergedChat } = await detectPhotoIntent(chatHistoryShort, userName, voiceInterpretedText);
                    const img_send_result = await imageSend(userPhone, cleanPhoneNo, userName, voiceInterpretedText, imageRequestMatch, mergedChat);
                    if (img_send_result) return;

                    const cleanHistory = (chatHistoryLong || '')
                        .split('\n')
                        .filter(line => line.trim().toLowerCase() !== 'you:')
                        .join('\n');

                    // RAG for individual voice notes
                    const wholeMessage = `The local date & time now is: ${currentDateTime}.
                    Below is the chat history between YOU and ${userName} (latest at the bottom):\n${cleanHistory}\n
                    ${userName} sends a voice message: "${voiceInterpretedText}"
                    Generate a natural reply based on the chat histories, emphasizing your reply more towards replying the latest chat from ${userName}.`;

                    const aiReply = await getAIResponse(chosenEngine, MEIPersonaLong, wholeMessage, 200, 0.3);
                    console.log(`[Voice] AI reply: ${aiReply}`);

                    // Generate and send voice reply (fallback to text if no voice API)
                    replyPath = path.join(voiceDir, `bot_reply_${userId}_${ts}.mp3`);
                    const voiceResult = await VoiceGenerate(aiReply, replyPath);

                    if (voiceResult) {
                        await sock.sendMessage(userPhone, {
                            audio: { url: replyPath },
                            mimetype: 'audio/mpeg',
                        });
                    } else {
                        // Fallback to text if voice generation not available
                        await sock.sendMessage(userPhone, { text: aiReply });
                    }

                    logChat(cleanPhoneNo, userName, `[User sent a voice message]: ${voiceInterpretedText}`, `${aiReply}`, global.CHAT_HISTORY_DIR);
                    
                    // Cleanup and return (voice reply handled)
                    if (fs.existsSync(replyPath)) fs.unlinkSync(replyPath);
                    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
                    return;
                }
                
                // If not USEVOICE, use the transcribed text as userMessage for normal text reply
                // BUT still log it properly as a voice message in chat history
                if (voiceInterpretedText) {
                    userMessage = voiceInterpretedText;
                    console.log(`[Voice] Using transcription for text reply: ${userMessage}`);
                    // Log as voice message even when USEVOICE=No (for proper chat history display)
                    logChat(cleanPhoneNo, userName, `[User sent a voice message]: ${voiceInterpretedText}`, `[Transcribed - text reply mode]`, global.CHAT_HISTORY_DIR);
                }

            } catch (err) {
                console.error("[Voice] Error handling voice message:", err.message);
            } finally {
                // Cleanup audio file
                if (fs.existsSync(replyPath)) {
                    fs.unlinkSync(replyPath);
                }
                if (fs.existsSync(audioPath)) {
                    fs.unlinkSync(audioPath);
                }
            }
        }

        // === ABUSE & MISUSE DETECTION ===
        historyContext = getLastChatHistory(cleanPhoneNo, global.HISTORY_SHORT.toString(), global.CHAT_HISTORY_DIR) || "";
        const lineCount = (historyContext.match(/\n/g) || []).length;
        console.log (`Number of lines of chats: ${lineCount}`);

        // Trigger every HISTORY_SHORT worth of lines for abuse detection
        if (lineCount >= global.HISTORY_SHORT) {
            const abusePrompt = `Based on these OVERALL chats below:\n\n${historyContext}\n${userName}: ${userMessage}. ${imagePrompt}.\n\nDo YOU think ${userName} 
            is wasting your time and has no intention of enquiring or buying your company's products & services? Reply strictly with only one word: YES or NO. Do NOT explain.`;

            let aiDecision = await getAIResponse(chosenEngine, MEIPersonaShort, abusePrompt, 15, 0.4);
            console.log(`Is this person's chats IRRELEVANT & WASTING TIME ? =========================> ${aiDecision}`);

            let abuseResponse = aiDecision.trim().toUpperCase();
            if (abuseResponse.startsWith("YES")) {
                let cleanUserPhone = userPhone.replace(/[@.a-zA-Z]+/g, "");

                const wasNotified = wasBossNotified(cleanPhoneNo, global.ABUSE_NOTIFICATION_FILE, expiryBossReport.toString());

                if (wasNotified) {
                    console.log(`Reported to Boss of ${cleanPhoneNo} Irrelevant Chats within the last X minutes. Skipping notification.`);
                } else {
                    let notificationMsg = `🔔 *IRRELEVANT CHATS ALERT!!!*\n\n${global.PERSON}: *${userName}*\n\nPhone: *+${cleanPhoneNo}*\n\n*Conversation:*\n${historyContext}\n\nLast chat: ${userMessage}`;
                    
                    console.log(`BOSS PHONE: ${global.BOSS_PHONE}`);
                    if (boss_lid) {
                        await sock.sendMessage(boss_lid, { text: notificationMsg });
                    } else {
                        console.warn('[ Mei16_Sock ] BOSS_PHONE not set, skipping boss notification');
                    }
                    
                    // Sends notifications to all assistant boss as well
                    for (let phone of global.ASST_BOSS_PHONE){
                        let assistant_lid = await getLIDFromPhone(phone)+"@lid";
                        await sock.sendMessage(assistant_lid, { text: notificationMsg });
                    }

                    updateNotificationTimestamp(cleanPhoneNo, userName, global.ABUSE_NOTIFICATION_FILE);
                    console.log(`Reported to Boss of IRRELEVANT CHATS from ${cleanPhoneNo}: ${notificationMsg}`);
                }

                logChat( cleanPhoneNo, userName, userMessage, "Your conversations are out of topic.", global.CHAT_HISTORY_DIR);
                return;
            }
        } else {
            console.log(`Skipping abuse detection: Chat history too short (${lineCount} lines) for ${userPhone}`);
        }

        // Message Blocks Management
        if (!isBoss) {
            const phoneKeys = Object.keys(MsgBlocks);
            if (!phoneKeys.includes(userPhone)) {
                MsgBlocks[userPhone] = {
                    time: Date.now(),
                    messages: [userMessage],
                    imagePrompt,
                    msg,
                    userName,
                    chatHistoryShort, // Remains same for the block
                    chatHistoryLong, // Remains same for the block
                    currentDateTime,
                    processing: false
                };
            } else {
                MsgBlocks[userPhone].time = Date.now();
                MsgBlocks[userPhone].messages.push(userMessage);
                MsgBlocks[userPhone].imagePrompt = `${MsgBlocks[userPhone].imagePrompt} plus an image of this description: ${imageSummary}`
            }
        }

        // === SALES POTENTIAL DETECTION (Async - Non Blocking) ===
        // Run this in background AFTER sending reply to user
        (async () => {
            const salesHistoryContext = getLastChatHistory(cleanPhoneNo, global.HISTORY_SHORT.toString(), global.CHAT_HISTORY_DIR) || "";
            const intentCheckPrompt = `Based on these OVERALL chats below:\n\n${salesHistoryContext}\n${userName}: ${userMessage}. ${imagePrompt}.\n\n
            Do YOU think this ${global.PERSON} has the potential in ${global.JOB} opportunity? Reply strictly with only one word: YES or NO. DO NOT explain.`;

            try {
                let intentDecision = await getAIResponse(chosenEngine, MEIPersonaShort, intentCheckPrompt, 15, 0.5);
                console.log(`AI DETECTION OF POSITIVE POTENTIAL =========================> ${intentDecision}`);

                let salesResponse = intentDecision.trim().toUpperCase();
                if (salesResponse.startsWith("YES")) {
                    let cleanUserPhone = userPhone.replace(/[@.a-zA-Z]+/g, "");

                    const wasNotified = wasBossNotified(cleanPhoneNo, global.SALES_NOTIFICATION_FILE, expiryBossReport.toString());

                    if (wasNotified) {
                        console.log(`Boss was notified of ${cleanPhoneNo} within the last X minutes. Skipping notification.`);
                    } else {
                        let notificationMsg = `🔔 *Potential Notification!*\n\n${global.PERSON}: *${userName}*\n\nPhone: *+${cleanPhoneNo}*\n\n*Conversation:*\n${salesHistoryContext}\n\nLast chat: ${userMessage}`;
                        
                        if (boss_lid) {
                            await sock.sendMessage(boss_lid, { text: notificationMsg });
                        } else {
                            console.warn('[ Mei16_Sock ] BOSS_PHONE not set, skipping boss notification');
                        }

                        // Sends notifications to all assistant boss as well
                        for (let phone of global.ASST_BOSS_PHONE){
                            const ass_phoneNum = await getLIDFromPhone(phone)+"@lid"
                            await sock.sendMessage(ass_phoneNum, { text: notificationMsg });
                        }

                        updateNotificationTimestamp(cleanPhoneNo, userName, global.SALES_NOTIFICATION_FILE);
                        console.log(`Notified Boss of potential from ${cleanPhoneNo}: ${notificationMsg}`);
                    }
                }
            } catch (err) {
                console.error("Sales potential detection error:", err.message);
            }
        })();

    }
    
}

// ==============================
// START THE BOT
// ==============================
console.log("Hello World");
initializeBot();
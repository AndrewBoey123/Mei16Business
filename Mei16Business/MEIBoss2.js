// MEIBoss2.js - Updated for open source (no binaries)
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { NodeVM } = require('vm2');
const HelperVersion = path.basename(__filename).replace(/\.[^/.]+$/, "");
const { AIQuery } = require("./MEIAIQuery1.js");
const { getPhoneFromLID, getLIDFromPhone } = require('./MeiMapping1.js');

// === EXPORTED BOSS FUNCTIONS ===
function getAllChatsFromFolder(folderPath = path.join(__dirname, '..', '..', 'userdata', 'chathistory')) { 
    if (!fs.existsSync(folderPath)) {
        console.warn(`getAllChatsFromFolder: Folder ${folderPath} does not exist.`);
        return [];
    }

    const files = fs.readdirSync(folderPath);
    let allChats = [];

    for (const file of files) {
        const fullPath = path.join(folderPath, file);
        const stat = fs.statSync(fullPath);

        // ✅ Skip folders and non-json files
        if (stat.isDirectory() || !file.endsWith('.json')) {
            continue;
        }

        try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const json = JSON.parse(content);
            allChats = allChats.concat(json);
        } catch (err) {
            console.warn(`Failed to read/parse ${file}:`, err.message);
        }
    }

    return allChats;
}

function extractCodeFromGPTReply(reply) {
    if (!reply || typeof reply !== 'string') return null;

    const codeMatch = reply.match(/```(?:js|javascript)?\s*([\s\S]+?)\s*```/);
    if (codeMatch) return codeMatch[1].trim();
    return null;
}

async function askAIforCodes(prompt, chosenURL, chosenModel, chosenAPI, MEIPersonaCoder) {
    try {
        const response = await axios.post(chosenURL, {
            model: chosenModel,
            messages: [
                { role: "system", content: MEIPersonaCoder },
                { role: "user", content: prompt }
            ],
            temperature: 0.4,
            max_tokens: 2000
        }, {
            headers: {
                "Authorization": `Bearer ${chosenAPI}`,
                "Content-Type": "application/json"
            }
        });
        return response.data.choices[0].message.content;
    } catch (err) {
        console.error("AI report codes error:", err);
        return "module.exports = 'AI generate codes errors for report';";
    }
}

function runDynamicCode(rawCode) {
    // Clean GPT wrapping
    rawCode = rawCode.replace(/^\s*```(?:js|javascript)?\s*|```$/g, '').trim();

    const wrapped = `module.exports = (function() {\n${rawCode}\n})();`;

    const vm = new NodeVM({
        console: 'inherit',
        timeout: 10000,
        sandbox: {},
        require: {
            external: true,
            builtin: ['fs', 'path'],
            root: "./"
        }
    });

    try {
        const histDir = path.join(__dirname, '..', '..', 'userdata', 'chathistory');
        if (!fs.existsSync(histDir)) {
            fs.mkdirSync(histDir);
            console.log(`[${HelperVersion}] Created missing 'chathistory' directory.`);
        }

        try {
            const result = vm.run(wrapped, 'reportcoder.js');
            if (result === undefined) return "No result returned from code.";
            if (typeof result === "string") return result;
            if (typeof result === "number" || typeof result === "boolean") return result.toString();
            return JSON.stringify(result, null, 2);
        } catch (err) {
            console.error(`${HelperVersion} error inside sandboxed GPT code:`, err.message);
            return "Error executing code in sandbox.";
        }
    } catch (err) {
        console.error("Report codes error:", err.message);
        return "Error executing the report codes.";
    }
}

// UPDATED: Baileys-compatible boss detection
async function isBossMode(msg, BOSS_PHONE) {
    // Baileys uses msg.key.remoteJid instead of msg.from
    let messageFrom = msg.key?.remoteJid;
    messageFrom = messageFrom.replace('@s.whatsapp.net', '');

    let cleanPhoneNo = await getPhoneFromLID(messageFrom, path.resolve(__dirname,'..','..','userdata'));

    if ((cleanPhoneNo?.includes('@lid') || cleanPhoneNo === null)) {
        cleanPhoneNo = messageFrom;
    }   

    const userPhone = await getLIDFromPhone(cleanPhoneNo, path.resolve(__dirname,'..','..','userdata')) + "@lid";

    if (userPhone === BOSS_PHONE || cleanPhoneNo == BOSS_PHONE){
        console.log("Boss detected... switching to Boss Mode!");
        return true;
    }
    return false;
}

// Export all boss functions
module.exports = {
    getAllChatsFromFolder,
    extractCodeFromGPTReply,
    askAIforCodes,
    runDynamicCode,
    isBossMode
};

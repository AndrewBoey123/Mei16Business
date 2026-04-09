// MEIFollowUp4.js (Final Fixed Version with Auto-Clear Timer) - Baileys Compatible
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { logChat } = require('./MEIHelper8');

const CHAT_HISTORY_DIR = path.join(__dirname, '..', '..', 'userdata', 'chathistory');
let bossFollowUpList = [];
let bossFollowUpExpiryTimer = null;
let followUpClient = null; // <== NEW: cache client for expiry messages

function getAllChatFiles(days = 3) {
    const files = fs.readdirSync(CHAT_HISTORY_DIR).filter(f => f.length <= 21); // 21 used considering the length of lid & phoneNumber
    const cutoff = Date.now() - days * 86400000;
    const result = [];

    for (const file of files) {
        const filepath = path.join(CHAT_HISTORY_DIR, file);
        try {
            const json = JSON.parse(fs.readFileSync(filepath, 'utf8'));
            const last = json[json.length - 1];
            if (!last || new Date(last.datetime).getTime() < cutoff) continue;
            result.push({ file, chats: json });
        } catch {}
    }
    return result;
}

function extractLast5Pairs(chatArray) {
    const pairs = [];
    let i = chatArray.length - 1;
    while (i >= 0 && pairs.length < 5) {
        const u = chatArray[i];
        if (u?.user_message && u?.mei_response) {
            pairs.unshift(`${u.user_name}: ${u.user_message}\nYou: ${u.mei_response}`);
        }
        i--;
    }
    return pairs.join("\n");
}

async function askAI(engine, key, url, model, persona, prompt) {
    try {
        const headers = {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json'
        };
        const payload = {
            model,
            messages: [
                { role: 'system', content: persona },
                { role: 'user', content: prompt }
            ],
            temperature: 0.4,
            max_tokens: 4000
        };
        const res = await axios.post(url, payload, { headers });
        return res.data.choices[0].message.content.trim();
    } catch (err) {
        console.warn("AI Error:", err?.response?.data || err.message);
        return null;
    }
}

async function getProspectList(chatFiles, engine, key, url, model, persona) {
    const prospects = [];
    for (const { file, chats } of chatFiles) {
        const convo = extractLast5Pairs(chats);
        const prompt = `Here are the latest chats:\n${convo}\n\nBased on your persona & job descriptions, do you think this ${global.PERSON} ` +
        `is worth following up to conclude the ${global.JOB} process?\nReply strictly YES or NO only.`;
        //console.log (`The follow up prompt: ${prompt}`);
        const decision = await askAI(engine, key, url, model, persona, prompt);
        if (decision?.toUpperCase().startsWith("YES")) {
            // CHANGED: Handle both phone number formats
            const phone = file.replace('.json', '');
            const name = chats[chats.length - 1].user_name || "User";
            prospects.push({ name, phone, convo });
        }
    }
    return prospects;
}

function startBossApprovalExpiryTimer(bossPhone) {
    if (bossFollowUpExpiryTimer) clearTimeout(bossFollowUpExpiryTimer);
    bossFollowUpExpiryTimer = setTimeout(async () => {
        console.warn("Boss took too long to approve. Clearing prospect list from memory.");
        bossFollowUpList = [];
        bossFollowUpExpiryTimer = null;

        if (followUpClient && typeof followUpClient.sendMessage === 'function') {
            try {
                await followUpClient.sendMessage(bossPhone, "Follow-up list expired. Type 'follow up' again to restart.");
            } catch (err) {
                console.warn(`Failed to notify Boss about expiry: ${err.message}`);
            }
        } else {
            console.warn("No WhatsApp client available to notify Boss of expiry.");
        }
    }, 2 * 60 * 1000); // 2 minutes
}

async function confirmWithBoss(client, bossPhone, prospects, persona, engine, key, url, model) {
    const listText = prospects.map(p => `- ${p.name} +${p.phone.replace(/[^\d]/g, '')}`).join("\n");
    const prompt = `These are the names & numbers you must follow up:\n${listText}\n\n ` +
    `Reply strictly only by saying "Follow up" followed by listing all the name and numbers (no other words) in BULLET format.`;
    const reply = await askAI(engine, key, url, model, persona, prompt);

    bossFollowUpList = prospects;
    followUpClient = client; // cache client for expiry use
    startBossApprovalExpiryTimer(bossPhone); // now uses global vars, no params needed

    if (client && typeof client.sendMessage === 'function') {
        try {
            await client.sendMessage(bossPhone, { text: reply }); // CHANGED: Baileys format
        } catch (err) {
            console.warn(`Failed to give Boss follow up list: ${err.message}`);
        }
    } else {
        console.warn("No WhatsApp client available — skipping actual message to Boss.");
        console.log("Message to Boss:\n" + reply);
    }
}

function parseBossApproval(bossReply) {
    const approved = [];

    if (!bossReply || !bossReply.toLowerCase().startsWith('follow up')) return approved;

    // Normalize bullets (• or -), commas, and newlines into lines
    const lines = bossReply
        .replace(/•/g, '-')             // normalize bullet symbol to dash
        .replace(/,\s*/g, '\n')         // split by commas into new lines
        .split('\n')                    // final split
        .map(l => l.trim())             // clean whitespace
        .filter(l => l.length > 0);     // ignore empty

    for (const line of lines) {
        if (line.toLowerCase().startsWith('follow up')) continue;

        const match = line.match(/-\s*(.+?)\s*\+(\d{10,15})/);
        if (match) {
            approved.push({
                name: match[1].trim(),
                phone: match[2].trim()
            });
        }
    }

    return approved;
}

async function sendFollowUps(client, bossPhone, bossName, approvedList, engine, key, url, model, persona) {
    for (const approved of approvedList) {
        const matched = bossFollowUpList.find(p =>
            p.name.trim().toLowerCase() === approved.name.trim().toLowerCase() &&
            p.phone.replace(/[^\d]/g, '') === approved.phone
        );

        if (matched) {
            const prompt = `Summarize and write a friendly follow-up message:\n\n${matched.convo}\n\n ` +
            `Use casual Whatsapp style, maximum 30 words. DO NOT use emoticons.`;
            const message = await askAI(engine, key, url, model, persona, prompt);

            console.log(`Follow-up to ${matched.name} (+${matched.phone}):`);
            console.log(message);
            console.log('---------------------------------------------------');

            if (client && typeof client.sendMessage === 'function') {
                try {
                    // CHANGED: Format phone number for Baileys and use proper message format
                    const targetPhone = matched.phone.includes('@') 
                        ? matched.phone 
                        : matched.phone + (matched.phone.length <= 12 ? '@s.whatsapp.net' : '@lid');
                                    
                    await client.sendMessage(targetPhone, { text: message });
                    logChat(targetPhone.split('@')[0], matched.name, "", message, CHAT_HISTORY_DIR);
                } catch (err) {
                    console.warn(`Failed to send message to ${matched.name} (+${matched.phone}):`, err.message || err);
                }
            } else {
                console.warn(`No WhatsApp client — would send to ${matched.phone}:`, message);
            }

            await new Promise(r => setTimeout(r, 1000));
        } else {
            console.warn(`Approved contact not found in bossFollowUpList: ${approved.name} ${approved.phone}`);
        }
    }

    // Save Logs to Boss
    const allNumbers = approvedList.map(a => a.phone).join(', ');
    const summaryMsg = `[Follow Up Successfully sent to following contact(s): ${allNumbers}]`;
    try {
        logChat(bossPhone.split('@')[0], bossName, "", summaryMsg, CHAT_HISTORY_DIR);
    } catch (err) {
        console.warn("Failed to log summary to boss:", err.message);
    }

    bossFollowUpList = [];
    if (bossFollowUpExpiryTimer) {
        clearTimeout(bossFollowUpExpiryTimer);
        bossFollowUpExpiryTimer = null;
    }
}

// === Cleanup Timer on Exit ===
process.on('exit', () => {
    if (bossFollowUpExpiryTimer) clearTimeout(bossFollowUpExpiryTimer);
});

module.exports = {
    runFollowUpWorkflow: async (client, bossPhone, engine, url, key, model, persona, days = 3) => {
        const files = getAllChatFiles(days);
        const prospects = await getProspectList(files, engine, key, url, model, persona);
        if (prospects.length === 0) {
            console.log("No prospects found.");
            return;
        }

        console.log("Prospects detected by AI:");
        prospects.forEach(p => {
            console.log(`- ${p.name} (+${p.phone.replace(/[^\d]/g, '')})`);
        });

        await confirmWithBoss(client, bossPhone, prospects, persona, engine, key, url, model);
    },

    confirmFollowUpApproved: async (client, bossPhone, bossName, bossReplyText, engine, url, key, model, persona) => {
        if (bossFollowUpList.length === 0) {
            console.log("No approved list to follow up.");
            return;
        }

        if (bossFollowUpExpiryTimer) {
            clearTimeout(bossFollowUpExpiryTimer);
            bossFollowUpExpiryTimer = null;
        }

        if (!bossReplyText || bossReplyText.toLowerCase().includes('follow up all')) {
            console.log("Boss approved ALL contacts to follow up.");
            await sendFollowUps(client, bossPhone, bossName, bossFollowUpList.map(p => ({
                name: p.name,
                phone: p.phone.replace(/[^\d]/g, '')
            })), engine, key, url, model, persona);
            return;
        }

        const approvedList = parseBossApproval(bossReplyText);
        if (approvedList.length === 0) {
            console.log("No valid approvals found in Boss reply.");
            return;
        }

        console.log(`Boss approved ${approvedList.length} contact(s).`);
        await sendFollowUps(client, bossPhone, bossName, approvedList, engine, key, url, model, persona);
    }
};

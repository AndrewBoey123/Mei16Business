// MEIGroup2.js
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const HelperVersion = path.basename(__filename).replace(/\.[^/.]+$/, "");

const { logChat, getLastChatHistory } = require('./MEIHelper8');





// Detect if Mei's BotName is mentioned:
function isBotNameMentioned(botName, msgText) {
    return msgText.toLowerCase().includes(botName.toLowerCase());
}


// AI decision logic using OpenAI-compatible API
/*
async function getGroupReplyDecision(persona, prompt, aiApiKey, aiModel, aiURL) {
    try {
        const response = await axios.post(aiURL, {
            model: aiModel,
            messages: [
                { role: "system", content: persona },
                { role: "user", content: prompt }
            ],
            temperature: 0.6,
            max_tokens: 300
        }, {
            headers: { "Authorization": `Bearer ${aiApiKey}`, "Content-Type": "application/json" }
        });

        return response.data.choices[0].message.content.trim();
    } catch (err) {
        console.error("Group AI error:", err);
        return "REPLY: ";
    }
}
*/

// NEW REPLACEMENT FOR ABOVE
const { default: axiosRetry } = require('axios-retry');
axiosRetry(axios, { retries: 2, retryDelay: axiosRetry.exponentialDelay });
const TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS || "120000");


async function getGroupReplyDecision(persona, prompt, aiApiKey, aiModel, aiURL) {
    try {
        const response = await axios.post(
            aiURL,
            {
                model: aiModel,
                messages: [
                    { role: "system", content: persona },
                    { role: "user", content: prompt }
                ],
                temperature: 0.5,
                max_tokens: 800
            },
            {
                headers: {
                    "Authorization": `Bearer ${aiApiKey}`,
                    "Content-Type": "application/json"
                },
                //timeout: 90000 // 90s timeout
                //timeout: 120000 // 2 minutes timeout
                timeout: TIMEOUT_MS // defined in .env file
            }
        );

        return response.data.choices[0].message.content.trim();
    } catch (err) {
        console.error(`[${HelperVersion}] Group AI error: ${err.code || err.message}`);
        return "REPLY: ";
    }
}
// NEW REPLACEMENT FOR ABOVE




// Extract reply from format: REPLY: <text>
function extractGroupReply(responseText) {
    const match = responseText.match(/REPLY:\s*([\s\S]*)/i);
    return match ? match[1].trim() : "";
}

// Parse decision block into object
function parseGroupDecisionAIResponse(responseText) {
    const result = {
        shouldReply: false,
        type: "",
        reason: ""
    };

    const replyMatch = responseText.match(/REPLY:\s*(YES|NO)/i);
    const typeMatch = responseText.match(/TYPE:\s*(\w+)/i);
    const reasonMatch = responseText.match(/REASON:\s*(.*)/i);

    if (replyMatch && replyMatch[1].toLowerCase() === "yes") {
        result.shouldReply = true;
    }
    if (typeMatch) result.type = typeMatch[1].toLowerCase();
    if (reasonMatch) result.reason = reasonMatch[1].trim();

    return result;
}

// Wrapper for friendly override prompt
function wrapFriendlyPrompt(originalPrompt) {
    return `
Reply to the original chat prompt:
${originalPrompt}

REPLY:`;
}

// Log all group messages to JSON file
function logGroupChat(jsonPath, userPhone, userName, msgText, botReply = "") {
    const newLog = {
        datetime: new Date().toISOString(),
        user_phone: userPhone,
        user_name: userName,
        user_message: msgText,
        mei_response: botReply
    };

    const existing = fs.existsSync(jsonPath)
        ? JSON.parse(fs.readFileSync(jsonPath, "utf8"))
        : [];

    existing.push(newLog);
    fs.writeFileSync(jsonPath, JSON.stringify(existing, null, 2));
}

// === Main handler for approved group messages ===
async function handleGroupMessage(options) {
    const {
        msg,
        chat,
        groupName,
        botName, //for name mentioned of bot
        botNumber, //for future use of @mention in whatsapp
        client,
        CHAT_HISTORY_DIR,
        personaLong,
        personaShort,
        chosenURL,
        chosenAPI,
        chosenModel,
        prompt,
        HISTORY_SHORT,
    } = options;

    const senderPhone = msg.key.remoteJid;
    const cleanedPhone = senderPhone.split('@')[0];
    const senderName = msg.pushName || "GroupMember";

    // For Baileys all caption and Filename need to be handled seperately
    const msgText =
    msg.message.conversation ||
    msg.message.extendedTextMessage?.text ||
    msg.message.imageMessage?.caption ||
    msg.message.videoMessage?.caption ||
    (
        (msg.message.documentMessage?.caption || "") + 
        (msg.message.documentMessage?.fileName ? " " + msg.message.documentMessage.fileName : "")
    ) ||
    "";

    const isBotMentioned = isBotNameMentioned(botName, msgText);

    const chatFile = path.join(CHAT_HISTORY_DIR, `${cleanedPhone}.json`);

    const hasMedia = msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.documentMessage;
    if (!msgText && !hasMedia) {
        console.log(`Empty group message from ${senderName}, skipping...`);
        return "skipped";
    }

    const history = getLastChatHistory(cleanedPhone, HISTORY_SHORT, CHAT_HISTORY_DIR);

    const cleanedHistory = history
        .split('\n')
        .filter(line => line.trim().toLowerCase() !== 'you:')
        .join('\n');

    const aiDecisionPrompt = `
        You are an intelligent WhatsApp bot named "${botName}" deciding whether to reply in a group chat.
        ROLE: as described in your system persona.
        Recent chat history (latest last):
        ${cleanedHistory}
        New message from ${senderName}: "${msgText}"
        Evaluate the chat history, context and put more emphasis on the latest chat and then decide:
        1. Should the bot reply?
        2. What type of message is this? (casual, job_related, repeat, off_topic)
        3. Why?
        Format your response strictly like this:
        REPLY: YES or NO
        TYPE: one-word-type
        REASON: your short explanation
        `;

    const aiRawDecision = await getGroupReplyDecision(personaShort, aiDecisionPrompt, chosenAPI, chosenModel, chosenURL);
    const decision = parseGroupDecisionAIResponse(aiRawDecision);

    console.log(`[DECISION] REPLY: ${decision.shouldReply} | TYPE: ${decision.type} | REASON: ${decision.reason}`);

    const forceReply = !decision.shouldReply && (isBotMentioned);

    if (!decision.shouldReply && !forceReply) {
        console.log(`MEI skipped reply (AI decision: NO, No mention of Bot Name). Reason: ${decision.reason}`);
        logGroupChat(chatFile, cleanedPhone, senderName, msgText, "");
        return "logged_only";
    } else if (forceReply) {
        console.log(`Overriding AI decision because bot name was detected.`);
    }

    const finalPrompt = forceReply
        ? wrapFriendlyPrompt(prompt)
        : prompt;

    const aiRaw = await getGroupReplyDecision(personaLong, finalPrompt, chosenAPI, chosenModel, chosenURL);

    let reply = extractGroupReply(aiRaw);
    if (!reply) reply = aiRaw.trim();

    const loweredReply = reply.toLowerCase();
    if (!loweredReply || loweredReply === "(empty)") {
        console.log(`AI decided not to reply to group ${groupName} for message from ${senderName}`);
        logGroupChat(chatFile, cleanedPhone, senderName, msgText, "");
        return "logged_only";
    }

    const cleanedReply = reply.trim().toUpperCase();
    if (["YES", "NO", "REPLY:"].includes(cleanedReply) || cleanedReply.startsWith("TYPE:") || cleanedReply.startsWith("REASON:")) {
        console.log("AI response looks like a decision block. Skipping actual reply.");
        logGroupChat(chatFile, cleanedPhone, senderName, msgText, "");
        return "logged_only";
    }

  //  await msg.reply(reply); //original

  try {
    await client.sendMessage(senderPhone, { text: reply });
} catch (err) {
    console.error(`Failed to reply to group message from ${senderName}: ${err.message}`);
    console.warn("Skipping reply to prevent crash.");
    logGroupChat(chatFile, cleanedPhone, senderName, msgText, "[Reply failed]");
    return "error";
}


    logGroupChat(chatFile, cleanedPhone, senderName, msgText, reply);
    console.log("AI replied to group:", reply);
    return "replied";
}

async function sendTAImagesToGroup(client, chatId, imagePaths) {
    if (!Array.isArray(imagePaths) || imagePaths.length === 0) {
        console.log("No images to send.");
        return;
    }

    for (const imgPath of imagePaths) {
        try {
            const media = {
                url: imgPath
            };
            await client.sendMessage(chatId, { image: media });
            console.log(`Sent image: ${imgPath}`);
        } catch (err) {
            console.error(`Failed to send image ${imgPath}:`, err.message);
        }
    }
}

module.exports = {
    handleGroupMessage, sendTAImagesToGroup, isBotNameMentioned
};

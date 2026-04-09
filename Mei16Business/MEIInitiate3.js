// MEIInitiate3.js compatible with Baileys

const fs = require("fs");
const path = require("path");

const { AIQuery } = require("./MEIAIQuery1.js");
const { logChat } = require('./MEIHelper8');

const HelperVersion = path.basename(__filename).replace(/\.[^/.]+$/, "");

// meihelper
const CHAT_HISTORY_DIR = path.join(__dirname, '..', '..', 'userdata', 'chathistory');

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Handle Initiate/Contact command from user — supports up to 10 numbers
 * Updated for Baileys compatibility
 */
async function handleInitiateCommand(msg, sock, userMessage, chosenURL, chosenModel, chosenAPI, Persona, Temp, MaxToken) {
    const userPhone = msg.key.remoteJid;
    const userName = msg.pushName || "User";
                       
    console.log(`[${HelperVersion}] Initiate command from ${userPhone}: ${userMessage}`);

    if (!userMessage.toLowerCase().startsWith("initiate") && !userMessage.toLowerCase().startsWith("contact")) return;

    // limit the total numbers that the message can be sent to 
    let max_numbers = 10
    const numberPattern = `(?:\\+?\\d{10,15}\\s*){1,${max_numbers}}`;
    const regex = new RegExp(`^\\s*(Initiate|Contact)\\s+(${numberPattern})([\\s\\S]+)$`, 'i');
    const match = userMessage.match(regex);

    if (match) {
        const command = match[1];
        const numberBlock = match[2];
        const promptText = match[3].trim();

        const numberMatches = numberBlock.match(/\+?\d{10,15}/g);

        if (!numberMatches || numberMatches.length === 0) {
            try {
                await sock.sendMessage(userPhone, { text: "No valid numbers found. Format: Contact +60123456789 message" });
            } catch (err) {
                console.error(`[${HelperVersion}] Failed to send error message:`, err.message);
            }
            return;
        }

        // Get target phone numbers for context
        const targetNumbers = numberMatches.join(', ');
        const botName = global.BOT_NAME || process.env.BOT_NAME || "Mei";
        
        const aiPrompt = `
You are ${botName}, a sales assistant. Your Boss wants you to send a WhatsApp message to a new contact (${targetNumbers}).

IMPORTANT INSTRUCTIONS:
- DO NOT assume the recipient's name unless explicitly provided in the boss' message
- Address the recipient in a friendly, professional manner (e.g., "Hi there!", "Hello!", "Hi!") if no name is given
- The boss may mention their own name or reference themselves in the message - do not confuse this with the recipient's name
- Keep the tone conversational and natural for a first-time sales outreach
- Only use names if they are clearly identified as the recipient's name in the boss' message

Boss' message: "${promptText}"

Generate a WhatsApp message based on the boss' instructions. Output just the message body, chunked up like a real WhatsApp conversation with each chunk separated by '|'. Use at most 3 chunks.

Your Output:
`.trim();

        let finalMessage = "";

        try {
            finalMessage = await AIQuery(
                aiPrompt,
                chosenURL,
                chosenModel,
                chosenAPI,
                Persona,
                Temp,
                MaxToken
            );

            // Chunk the final Message into n parts to make the initiate message generated look more natural
            finalMessage_Chunked = finalMessage.split('|').map(i => i.trim());
            finalMessage = finalMessage_Chunked.join(' '); 


            finalMessage = finalMessage.trim();
            if (!finalMessage || finalMessage.length < 3) {
                throw new Error("AIQuery returned an invalid or empty message.");
            }
            console.log(`[${HelperVersion}] Final message to send: ${finalMessage}`);
        } catch (aiErr) {
            console.error(`[${HelperVersion}] Error calling AIQuery:`, aiErr);
            try {
                await sock.sendMessage(userPhone, { text: "Failed to generate message from AI. Please try again later." });
            } catch (err) {
                console.error(`[${HelperVersion}] Failed to send error message:`, err.message);
            }
            return;
        }

        const resultLines = [];
        for (const numRaw of numberMatches) {
            let cleaned = numRaw.trim().replace(/\D/g, ''); // remove non-digits

            // Gets the name of the person we want to contact
            let contactPersonName;
            try{
                let contactPersonChat = JSON.parse(fs.readFileSync(path.join(CHAT_HISTORY_DIR, `${cleaned}.json`)));
                contactPersonChat = contactPersonChat[contactPersonChat.length - 1];
                contactPersonName = contactPersonChat.user_name || global.PERSON;
            }catch{
                contactPersonName = global.PERSON;
            }        
            
            // Format phone number for Baileys (international format without +)
            if (cleaned.startsWith('0')) {
                cleaned = '6' + cleaned.slice(1); // Convert local Malaysian to international
            }
            
            // Baileys uses @s.whatsapp.net format
            const number = cleaned.length <= 12 ? cleaned + "@s.whatsapp.net" : cleaned + "@lid";

            try {
                for (let chunk of finalMessage_Chunked){
                    if (chunk){
                        await sock.sendMessage(number, { text: chunk });     
                    }
                }
                logChat(cleaned, contactPersonName, "", finalMessage, CHAT_HISTORY_DIR);
                console.log(`[${HelperVersion}] Message sent to ${number}`);
                resultLines.push(`✅ ${numRaw}`);
            } catch (err) {
                console.error(`[${HelperVersion}] Error sending to ${number}:`, err.message);
                resultLines.push(`❌ ${numRaw}`);
            }
            await delay(1000); // wait 1 second before next number
        }

        const replyText =
            `📤 *Message Generated:*\n\`\`\`\n${finalMessage}\n\`\`\`\n\n` +
            `📬 *Delivery Status:*\n` +
            resultLines.join("\n");

        try {
            await sock.sendMessage(userPhone, { text: replyText });
        } catch (err) {
            console.error(`[${HelperVersion}] Error sending confirmation to user:`, err.message);
        }

        // === Log to Boss after all sends ===
        const allNumbers = numberMatches.map(n => n.trim()).join(', ');
        const bossLogMsg = `[Initiated BOSS CONTACT with this message: ${finalMessage} To: ${allNumbers}]`;
        try {
            // Use global.BOSS_PHONE instead of userPhone to avoid LID issue
            const bossPhoneNormalized = global.BOSS_PHONE ? global.BOSS_PHONE.split('@')[0] : userPhone.split('@')[0];
            logChat(bossPhoneNormalized, userName, "", bossLogMsg, CHAT_HISTORY_DIR);
        } catch (err) {
            console.warn(`[${HelperVersion}] Failed to log boss contact:`, err.message);
        }

        return;
    }

    // Handle unmatched message
    if (userMessage.length > 0) {
        console.log(`[${HelperVersion}] Unrecognized initiate command from ${userPhone}: ${userMessage}`);
        try {
            await sock.sendMessage(userPhone, { 
                text: "Invalid command.\nUse: Contact +60123456789 [message]\nSupports up to 10 numbers." 
            });
        } catch (err) {
            console.error(`[${HelperVersion}] Failed to reply invalid command message:`, err.message);
        }
    }
}

module.exports = {
    handleInitiateCommand
};
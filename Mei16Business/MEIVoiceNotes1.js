const fs = require('fs');
const path = require('path');
//require('dotenv').config({ path: path.join(__dirname, '..', 'userdata', '.env') }); //old codes which may have PM2 cache problem
//require('dotenv').config({ path: path.join(__dirname, '..', 'userdata', '.env'), override: true });

const VoiceInterpret = require('./MEIVoiceInterpret1.js');
const VoiceGenerate = require('./MEIVoiceGen2.js');
const { AIQuery } = require('./MEIAIQuery1.js');
const { logChat } = require('./MEIHelper8');
const { proto } = require('@whiskeysockets/baileys');



async function handleGroupVoiceNote({
    msg,
    media,
    history,
    groupName,
    currentDateTime,
    senderName,
    chosenEngine,
    MEIPersonaGroup,
    client
}) {
    if (global.USEVOICE !== "Yes") return null;

    const voiceDir = path.resolve('../../userdata/voice');
    const userId = msg.from.replace(/[@.]/g, '_');
    const ts = Date.now();
    const oggPath = path.join(voiceDir, `user_audio_${userId}_${ts}.ogg`);
    const mp3Path = oggPath.replace('.ogg', '.mp3');
    const replyPath = path.join(voiceDir, `bot_reply_${userId}_${ts}.mp3`);

    let interpretedText = null;
    let replyMode = null;

    try {
        console.log("Received media type is:", media?.mimetype);

        if (media.mimetype === 'audio/ogg; codecs=opus') {
            fs.writeFileSync(oggPath, media.data, 'base64');

            if (!fs.existsSync(oggPath)) {
                console.error("Audio file was not saved correctly.");
                return null;
            }

            await new Promise(resolve => setTimeout(resolve, 200));
            interpretedText = await VoiceInterpret(oggPath);

            if (!interpretedText) {
                console.warn("Voice message was empty or failed to transcribe.");
                return null;
            }

            console.log(`User's voice message: ${interpretedText}`);
            replyMode = 'audio';
        }

        const cleanHistory = (history || '')
            .split('\n')
            .filter(line => line.trim().toLowerCase() !== 'you:')
            .join('\n');

        const wholeMessage = `Group name: ${groupName}, 
The local date & time now is: ${currentDateTime}.
Below is the group chat history between YOU and other group members (latest at the bottom):\n${cleanHistory}\n
${senderName} now sends a voice chat: "${interpretedText}"
Generate a natural reply based on the chat histories, emphasizing your reply more towards replying the latest chat from ${senderName}.`;

        const aiReply = await AIQuery(wholeMessage, chosenEngine, null, null, MEIPersonaGroup, 0.6, 150);
        console.log(`AI to reply using voice: ${aiReply}`);

        if (replyMode === 'audio') {
            await VoiceGenerate(aiReply, replyPath);

            if (!fs.existsSync(replyPath) || fs.statSync(replyPath).size < 1024) {
                console.error("Reply audio file missing or too small. Skipping send.");
                return null;
            }

            try {
                // Send voice note using Baileys
                const audioBuffer = fs.readFileSync(replyPath);
                await client.sendMessage(msg.from, {
                    audio: audioBuffer,
                    mimetype: 'audio/mp4',
                    ptt: true // voice note format
                });
            } catch (err) {
                console.error("sendMessage failed:", err.message);
            }

            logChat(msg.from, senderName, `[User sent a voice message]: ${interpretedText}`, `${aiReply}`, global.CHAT_HISTORY_DIR);
            return aiReply;
        }

    } catch (err) {
        console.error("Error while handling voice message:", err.message);
        throw err;
    } finally {
        [oggPath, mp3Path, replyPath].forEach(file => {
            if (fs.existsSync(file)) fs.unlinkSync(file);
        });
    }

    return null;
}


async function handleIndiVoiceNote({
    msg,
    media,
    chatHistoryShort,
    currentDateTime,
    senderName,
    userPhone,
    chosenEngine,
    chosenModel,
    chosenAPI,
    MEIPersonaLong,
    client
}) {
    if (global.USEVOICE !== "Yes") return null;

    const voiceDir = path.resolve('../../userdata/voice');
    const userId = msg.from.replace(/[@.]/g, '_');
    const ts = Date.now();
    const oggPath = path.join(voiceDir, `user_audio_${userId}_${ts}.ogg`);
    const mp3Path = oggPath.replace('.ogg', '.mp3');
    const replyPath = path.join(voiceDir, `bot_reply_${userId}_${ts}.mp3`);

    let interpretedText = null;
    let replyMode = null;

    try {
        console.log("Received media type is:", media?.mimetype);

        if (media.mimetype === 'audio/ogg; codecs=opus') {
            fs.writeFileSync(oggPath, media.data, 'base64');

            if (!fs.existsSync(oggPath)) {
                console.error("Audio file was not saved correctly.");
                return null;
            }

            await new Promise(resolve => setTimeout(resolve, 200));
            interpretedText = await VoiceInterpret(oggPath);

            if (!interpretedText) {
                console.warn("Voice message was empty or failed to transcribe.");
                return null;
            }

            console.log(`User's voice message: ${interpretedText}`);
            replyMode = 'audio';
        }

        const cleanHistory = (chatHistoryShort || '')
            .split('\n')
            .filter(line => line.trim().toLowerCase() !== 'you:')
            .join('\n');

const wholeMessage = `The local date & time now is: ${currentDateTime}.
Below is the chat history between YOU and ${senderName} (latest at the bottom):\n${cleanHistory}\n
${senderName} now sends a voice chat: "${interpretedText}"
Generate a natural reply based on the chat histories, emphasizing your reply more towards replying the latest chat from ${senderName}.`;

        const aiReply = await AIQuery(wholeMessage, chosenEngine, chosenModel, chosenAPI, MEIPersonaLong, 0.5, 200);
        console.log(`AI replies ${senderName} using voice: ${aiReply}`);

        if (replyMode === 'audio') {
            await VoiceGenerate(aiReply, replyPath);

            if (!fs.existsSync(replyPath) || fs.statSync(replyPath).size < 1024) {
                console.error("Reply audio file missing or too small. Skipping send.");
                return null;
            }

            try {
                // Send voice note using Baileys
                const audioBuffer = fs.readFileSync(replyPath);
                await client.sendMessage(msg.from, {
                    audio: audioBuffer,
                    mimetype: 'audio/mp4',
                    ptt: true // voice note format
                });
                logChat(userPhone, senderName, interpretedText, aiReply, global.CHAT_HISTORY_DIR);
            } catch (err) {
                console.error("sendMessage failed:", err.message);
            }

            return aiReply;
        }

    } catch (err) {
        console.error("Error while handling voice message:", err.message);
        throw err;
    } finally {
        [oggPath, mp3Path, replyPath].forEach(file => {
            if (fs.existsSync(file)) fs.unlinkSync(file);
        });
    }

    return null;
}

module.exports = { handleGroupVoiceNote, handleIndiVoiceNote };

// MEIMedia1.js compatible with Baileys
const fs = require("fs");
const path = require('path');
const pendingMedia = {}; // { [userPhone]: { media, mediaType, timestamp, userName } }
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const { logChat } = require('./MEIHelper8');

const HelperVersion = path.basename(__filename).replace(/\.[^/.]+$/, "");

const CHAT_HISTORY_DIR = path.join(__dirname, '..', '..', 'userdata', 'chathistory');

// Baileys-compatible getBossName function
async function getBossName(client) {
    try {
        return "Boss"; // Simplified for Baileys
    } catch (err) {
        console.warn(`${HelperVersion}: unable to fetch Boss name:`, err.message);
        return "Boss";
    }
}

function prepareBossForwardMessage(userName, userPhone, chatHistoryShort, mediaType, userMessage = "",cleanPhoneNo) {
    return `📤 *Media Alert to Boss*\n\nPerson: *${userName}*\nPhone: *+${cleanPhoneNo}*\nMedia Type: ${mediaType}\n\n` +
           `📄 *Recent Chat History:*\n${chatHistoryShort}\n\n` +
           (userMessage ? `*User Message with Media:*\n"${userMessage}"` : "*No message text included with media.*");
}

function getMediaType(mime) {
    if (mime.startsWith("image/")) return "Image";
    if (mime.startsWith("video/")) return "Video";
    if (mime.startsWith("audio/")) return "Audio";
    if (mime.includes("pdf")) return "PDF Document";
    if (mime.includes("word")) return "Word Document";
    if (mime.includes("excel")) return "Excel Spreadsheet";
    if (mime.includes("zip") || mime.includes("rar")) return "Compressed File";
    return "File";
}

// ==============================
// BAILEYS MEDIA DOWNLOAD UTILITY
// ==============================
async function downloadBaileysMedia(msg) {
    try {
        let messageType = null;
        let messageContent = null;

        if (msg.message.imageMessage) {
            messageType = 'image';
            messageContent = msg.message.imageMessage;
        } else if (msg.message.videoMessage) {
            messageType = 'video'; 
            messageContent = msg.message.videoMessage;
        } else if (msg.message.audioMessage) {
            messageType = 'audio';
            messageContent = msg.message.audioMessage;
        } else if (msg.message.documentMessage) {
            messageType = 'document';
            messageContent = msg.message.documentMessage;
        } else if (msg.message.documentWithCaptionMessage?.message?.documentMessage) {
            messageType = 'document';
            messageContent = msg.message.documentWithCaptionMessage.message.documentMessage;
        }

        if (!messageContent) {
            console.log('No media content found in message');
            return null;
        }

        const stream = await downloadContentFromMessage(messageContent, messageType);
        
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        return {
            data: buffer.toString('base64'),
            mimetype: messageContent.mimetype || 'application/octet-stream',
            filename: messageContent.fileName || `media.${messageType}`,
            messageType: messageType
        };

    } catch (err) {
        console.error('Error downloading Baileys media:', err.message);
        return null;
    }
}

async function handleIncomingMedia(msg, sock, chatHistoryShort, userName,cleanPhoneNo) {
    const userPhone = msg.key.remoteJid;
    const media = await downloadBaileysMedia(msg); // <--- updated here

    const bossName = await getBossName(sock);

    if (!media) return false;

    const fileType = getMediaType(media.mimetype);

    // We need the message here this way so that it doesnt go to pending message if pdf sent without caption
    const userMessage =
    msg.message.conversation ||
    msg.message.extendedTextMessage?.text ||
    msg.message.imageMessage?.caption ||
    msg.message.videoMessage?.caption ||
    (
        (msg.message.documentMessage?.caption || "") + 
        (msg.message.documentMessage?.fileName ? " " + msg.message.documentMessage.fileName : "")
    ) ||
    "";

    const hasText = !!userMessage.trim();

    if (hasText || fileType === "Image") {
        const forwardMsg = prepareBossForwardMessage(
            userName,
            userPhone.replace(/[@.a-zA-Z]+/g, ""),
            chatHistoryShort,
            fileType,
            userMessage || "(no caption)",
            cleanPhoneNo
        );

        try {
            await sock.sendMessage(global.BOSS_PHONE, { text: forwardMsg });
            
            if (fileType === "Image") {
                await sock.sendMessage(global.BOSS_PHONE, { 
                    image: Buffer.from(media.data, 'base64'),
                    caption: `Forwarded ${fileType.toLowerCase()} from ${userName}`
                });
            } else if (fileType === "Video") {
                await sock.sendMessage(global.BOSS_PHONE, { 
                    video: Buffer.from(media.data, 'base64'),
                    caption: `Forwarded ${fileType.toLowerCase()} from ${userName}`
                });
            } else if (fileType === "Audio") {
                await sock.sendMessage(global.BOSS_PHONE, { 
                    audio: Buffer.from(media.data, 'base64'),
                    caption: `Forwarded ${fileType.toLowerCase()} from ${userName}`
                });
            } else {
                await sock.sendMessage(global.BOSS_PHONE, { 
                    document: Buffer.from(media.data, 'base64'),
                    mimetype: media.mimetype,
                    fileName: media.filename || "file.pdf",
                    caption: `Forwarded ${fileType.toLowerCase()} from ${userName}`
                });
            }
            
            await new Promise(resolve => setTimeout(resolve, 1200));

            console.log(`Forwarded ${fileType} from ${userName} to Boss.`);

            logChat(global.BOSS_PHONE.split('@')[0], bossName, "", forwardMsg, CHAT_HISTORY_DIR);

        } catch (err) {
            console.warn(`Failed to forward media from ${userName}:`, err.message);
        }

        return true;
    }

    pendingMedia[userPhone] = {
        media,
        mediaType: fileType,
        timestamp: Date.now(),
        userName
    };

    return true;
}

async function handleReplyForPendingMedia(msg, sock, chatHistoryShort,cleanPhoneNo) {
    const userPhone = msg.key.remoteJid;
    
    const userMessage = msg.message?.conversation || 
                       msg.message?.extendedTextMessage?.text || 
                       "";

    const bossName = await getBossName(sock);

    if (!pendingMedia[userPhone]) return false;

    const { media, mediaType, timestamp, userName } = pendingMedia[userPhone];

    const age = (Date.now() - timestamp) / 1000 / 60;
    if (age > global.MEDIA_EXPIRY_MINUTES) {
        console.log(`Pending media for ${userPhone} expired (${Math.floor(age)} mins old). Skipping.`);
        delete pendingMedia[userPhone];

        try {
            await sock.sendMessage(userPhone, { 
                text: `Sorry, the file you sent me expired after ${global.MEDIA_EXPIRY_MINUTES} mins.\nPlease resend it, so that I can forward it to my Boss.`
            });
        } catch (err) {
            console.warn(`Failed to send expiry notice to ${userPhone}:`, err.message);
        }

        return false;
    }

    const forwardMsg = prepareBossForwardMessage(userName, userPhone.replace(/[@.a-zA-Z]+/g, ""), chatHistoryShort, mediaType, userMessage,cleanPhoneNo);
    
    try {
        await sock.sendMessage(global.BOSS_PHONE, { text: forwardMsg });
        
        if (mediaType === "Image") {
            await sock.sendMessage(global.BOSS_PHONE, { 
                image: Buffer.from(media.data, 'base64'),
                caption: `Forwarded ${mediaType.toLowerCase()} from ${userName}`
            });
        } else if (mediaType === "Video") {
            await sock.sendMessage(global.BOSS_PHONE, { 
                video: Buffer.from(media.data, 'base64'),
                caption: `Forwarded ${mediaType.toLowerCase()} from ${userName}`
            });
        } else if (mediaType === "Audio") {
            await sock.sendMessage(global.BOSS_PHONE, { 
                audio: Buffer.from(media.data, 'base64'),
                caption: `Forwarded ${mediaType.toLowerCase()} from ${userName}`
            });
        } else {
            await sock.sendMessage(global.BOSS_PHONE, { 
                document: Buffer.from(media.data, 'base64'),
                mimetype: media.mimetype,
                fileName: media.filename || "file.pdf",
                caption: `Forwarded ${mediaType.toLowerCase()} from ${userName}`
            });
        }
        
        console.log(`Forwarded ${mediaType} with message from ${userName} to Boss.`);
    } catch (err) {
        console.warn(`Failed to forward media from ${userName} to Boss:`, err.message);
        return false;
    }

    logChat(global.BOSS_PHONE.split('@')[0], bossName, "", forwardMsg, CHAT_HISTORY_DIR);

    console.log(`Forwarded cached ${mediaType} + reply from ${userName} to Boss.`);
    delete pendingMedia[userPhone];
    return true;
}

function cleanupExpiredMedia() {
    const now = Date.now();
    const cutoff = global.MEDIA_EXPIRY_MINUTES * 60 * 1000;
    for (const phone in pendingMedia) {
        if (now - pendingMedia[phone].timestamp > cutoff) {
            console.log(`Auto-cleaned expired media for ${phone}`);
            delete pendingMedia[phone];
        }
    }
}

module.exports = {
    downloadBaileysMedia,
    handleIncomingMedia,
    handleReplyForPendingMedia,
    cleanupExpiredMedia
};

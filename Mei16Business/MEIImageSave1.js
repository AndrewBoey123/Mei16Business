// MEIImageSave1.js

const fs = require("fs");
const path = require("path");
const mime = require("mime-types");
const { downloadBaileysMedia } = require('./MEIMedia1.js');  

const HelperVersion = path.basename(__filename).replace(/\.[^/.]+$/, "");

//const ROOT_IMG_FOLDER = path.join(__dirname, "img");
//const ROOT_IMG_FOLDER = path.join(process.cwd(), "..", "userdata", "img");
const ROOT_IMG_FOLDER = path.join(__dirname, '..', '..', "userdata", "img"); //docker and ubuntu friendly
fs.mkdirSync(ROOT_IMG_FOLDER, { recursive: true }); //ensure folder exist

const MAX_IMAGES = 8;
const SESSION_TIMEOUT = 80000;

const imageSessions = {}; // { [sender]: { folder, fullPath, imageCount, timeout } }

/**
 * Start session to store images into a named folder inside ./img
 */
function startImageSaveSession(sender, folderNameRaw, client, msg) {
    const folderName = folderNameRaw.replace(/[\\/:*?"<>|]/g, "_");
    const fullFolderPath = path.join(ROOT_IMG_FOLDER, folderName);

    fs.mkdirSync(fullFolderPath, { recursive: true });

    if (imageSessions[sender]) {
        clearTimeout(imageSessions[sender].timeout);
        delete imageSessions[sender];
    }

    imageSessions[sender] = {
        folder: folderName,
        fullPath: fullFolderPath,
        imageCount: 0,
        timeout: setTimeout(async () => {
            const session = imageSessions[sender];
            const totalFiles = fs.existsSync(session.fullPath)
                ? fs.readdirSync(session.fullPath).filter(f => fs.statSync(path.join(session.fullPath, f)).isFile()).length
                : 0;

            try {
                if (totalFiles === 0) {
                    fs.rmSync(session.fullPath, { recursive: true, force: true });
                    await client.sendMessage(sender, { text: `Session for '${session.folder}' expired. No images saved. Folder deleted.` });
                } else {
                    await client.sendMessage(sender, { text: `Session for '${session.folder}' expired. ${totalFiles} image(s) kept.` });
                }
            } catch (err) {
                console.error(`[${HelperVersion}] Failed to send session timeout message:`, err.message);
            }

            delete imageSessions[sender];
        }, SESSION_TIMEOUT),
    };

    try {
        return client.sendMessage(sender, { text: `Folder '${folderName}' is ready. Send up to ${MAX_IMAGES} images.` });
    } catch (err) {
        console.error(`[${HelperVersion}] Failed to send folder ready message:`, err.message);
    }
}

/**
 * Handle media from user and store into current session folder
 */
async function handleIncomingImageMedia(msg, client) {
    const sender = msg.key.remoteJid;
    const session = imageSessions[sender];

    if (!session) {
        try {
            await client.sendMessage(sender, { text: "Please send:\nSave images in <FolderName>\n...before uploading." });
        } catch (err) {
            console.error(`[${HelperVersion}] Failed to reply no-session message:`, err.message);
        }
        return;
    }

    let media;
    try {
        media = await downloadBaileysMedia(msg);
    } catch (err) {
        console.error(`[${HelperVersion}] Failed to download media:`, err.message);
        try {
            await client.sendMessage(sender, { text: "Failed to download media." });
        } catch (_) {}
        return;
    }

    if (!media || !media.data) {
        try {
            await client.sendMessage(sender, { text: "Media download was empty." });
        } catch (_) {}
        return;
    }
    
    const mimeType = media.mimetype || 'image/jpeg';
    const extension = mime.extension(mimeType) || "jpg";
    const uniqueName = `img_${Date.now()}.${extension}`;
    const savePath = path.join(session.fullPath, uniqueName);

    try {
        const mediaBuffer = Buffer.from(media.data, 'base64');
        fs.writeFileSync(savePath, mediaBuffer);
        session.imageCount += 1;
        const remaining = MAX_IMAGES - session.imageCount;

        if (remaining <= 0) {
            clearTimeout(session.timeout);
            delete imageSessions[sender];
            await client.sendMessage(sender, { text: `Saved image. Limit of ${MAX_IMAGES} reached. Session closed.` });
        } else {
            await client.sendMessage(sender, { text: `Saved to '${session.folder}'. You can send ${remaining} more.` });
        }
    } catch (err) {
        console.error(`[${HelperVersion}] Failed to save image or reply:`, err.message);
    }
}


/**
 * Entry point to be used from Mei13.js
 */
async function handleImageSaveCommand(msg, client, userMessage) {
    const sender = msg.key.remoteJid;
    const body = userMessage.trim() || "";

    const match = body.match(/^save images in (.+)$/i);
    if (match) {
        return startImageSaveSession(sender, match[1], client, msg);
    }

    if (msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.documentMessage) {
        return handleIncomingImageMedia(msg, client);
    }

    if (body.length > 0) {
        try {
            return client.sendMessage(sender, { text: "Invalid command.\nSend: Save images in <FolderName>\nThen send up to 8 images." });
        } catch (err) {
            console.error(`[${HelperVersion}] Failed to reply invalid command message:`, err.message);
        }
    }
}

module.exports = {
    handleImageSaveCommand
};
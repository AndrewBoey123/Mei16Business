// MEIImageSend1.js

const fs = require("fs");
const path = require("path");
const { AIQuery } = require("./MEIAIQuery1.js");

const HelperVersion = path.basename(__filename).replace(/\.[^/.]+$/, "");

const IMAGE_ROOT = path.join(__dirname, '..', '..', "userdata", "img");

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Trying to get all the folder names to let AI decide which folder is most suitable to get the image from:
function getFolders(parentDir) {
  return fs.readdirSync(parentDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
}

async function extractImageTopic(userQuery, chosenURL, chosenModel, chosenAPI, Persona, Temp, MaxToken) {
    const folders = getFolders(IMAGE_ROOT); // ["classroom", "graduation", "charts", ...]
    const folderList = folders.join(", ");

    const systemPrompt = `
    You are given a list of folder names that contain images:
    ${folderList}

    The user query will be the conversation history, including multiple messages between users.

    Your task:
    - Carefully review the entire conversation to understand the context.
    - Give more emphasis to the most recent user messages to determine the main topic.
    - Pick the folder name from the list that best matches the request based on the conversation context.
    - If none match, return "null".
    - If the request is generic and multiple folders are relevant, return the folder names separated by a hyphen ("|") with no extra words.
    Example: if both "cars" and "bikes" match, return "cars|bikes".
    Only return the folder name(s) or "null" without any extra explanation or text.
    `;

    try {
        const result = await AIQuery(userQuery, chosenURL, chosenModel, chosenAPI, systemPrompt, Temp, MaxToken);
        console.log (`[${HelperVersion}] ImageSend AI returns folder name: ${result}`);
        if (!result || result.length < 2) return "general";
        return result.toLowerCase().trim().replace(/[^a-z0-9\s|().-]/gi, ""); // accepts hyphen, bracket, spaces, fullstop
    } catch (err) {
        console.warn(`[${HelperVersion}] Failed to extract topic:`, err.message);
        return "general";
    }
}

/**
 * Load and return all image file paths from a folder (up to 10 max)
 */
function getAllImagesFromFolder(folderPath) {
    if (!fs.existsSync(folderPath)) return [];
    return fs.readdirSync(folderPath)
        .filter(file => /\.(jpg|jpeg|png|pdf)$/i.test(file))
        .slice(0, 10) // Limit to first 10 images only
        .map(file => path.join(folderPath, file));
}

// Made use of Sets to avoid duplications
function findAllExistingFoldersIgnoreCase(candidatePaths) {
    const results = new Set();
    for (const candidate of candidatePaths) {
        const parentDir = path.dirname(candidate);
        const targetName = path.basename(candidate).toLowerCase();
        if (!fs.existsSync(parentDir)) continue;

        const realMatch = fs.readdirSync(parentDir).find(
            f => f.toLowerCase() === targetName
        );
        if (realMatch) results.add(path.join(parentDir, realMatch));
    }
    return [...results];
}

/**
 * Main function - Updated for Baileys compatibility
 */
async function handleImageRequest(userQuery, client, chatId, chosenURL, chosenModel, chosenAPI, Persona, Temp, MaxToken) {
    const rawTopic = await extractImageTopic(userQuery, chosenURL, chosenModel, chosenAPI, Persona, Temp, MaxToken);
    let logMessage = "[The following image were sent: "

    console.log("Raw Topic Below")
    console.log(rawTopic)

    // split string like "folder1, folder2, folder3" into ["folder1","folder2","folder3"]
    const topics = rawTopic.split("|")
        .map(t => t.trim())
        .filter(t => t.length > 0);

    let topicFolders = [];

    console.log(topics);

    for (const topic of topics) {
        console.log(topic);
        const topicFolderCandidates = [
            path.join(IMAGE_ROOT, topic),
            path.join(IMAGE_ROOT, topic.replace(/\s+/g, "_")),
            path.join(IMAGE_ROOT, topic.replace(/\s+/g, "")),
            path.join(IMAGE_ROOT, topic.endsWith("s") ? topic.slice(0, -1) : topic + "s"),
        ];
        topicFolders = topicFolders.concat(findAllExistingFoldersIgnoreCase(topicFolderCandidates));
    }
    console.log(topicFolders);

    // fallback if nothing matched
    if (topicFolders.length === 0) {
        topicFolders.push(path.join(IMAGE_ROOT, "general"));
    }

    if (topicFolders.length === 1) {
        // single folder → send up to 10 images
        const selectedImages = getAllImagesFromFolder(topicFolders[0]);
        if (selectedImages.length == 0){
            return {
                success: false,
                logMessage: "[No similar images found - failed to send]"
            };
        }
        console.log(selectedImages);
        for (const imgPath of selectedImages) {
            try {

                // Baileys way of sending images
                const media = {
                    url: imgPath
                };
                const ext = path.extname(imgPath).toLowerCase();

                if (ext === ".pdf") {
                    await client.sendMessage(chatId, {
                        document: media,
                        mimetype: "application/pdf",
                        fileName: path.basename(imgPath)
                    });
                } else {
                    await client.sendMessage(chatId, { image: media });
                }

                logMessage += path.basename(imgPath) + ", "
                await delay(1500);
            } catch (err) {
                console.warn(`[${HelperVersion}] Failed to send image ${imgPath}:`, err.message);
            }
        }
        logMessage += `from '${path.basename(topicFolders[0])}' folder]`;
        console.log(`[${HelperVersion}] Sent ${selectedImages.length} photo(s) for topic "${topics.join(", ")}" to ${chatId}`);
    } else {
        // multiple folders → send 1 image from each
        for (const folder of topicFolders) {
            const selectedImages = getAllImagesFromFolder(folder);
            if (selectedImages.length > 0) {
                try {

                    // Baileys way of sending images
                    const media = {
                        url: selectedImages[0]
                    };
                    const ext = path.extname(selectedImages[0]).toLowerCase();

                    if (ext === ".pdf") {
                        await client.sendMessage(chatId, {
                            document: media,
                            mimetype: "application/pdf",
                            fileName: path.basename(selectedImages[0])
                        });
                    } else {
                        await client.sendMessage(chatId, { image: media });
                    }

                    logMessage += `${path.basename(selectedImages[0])} from '${path.basename(folder)}' folder, `;
                    await delay(1500);
                } catch (err) {
                    console.warn(`[${HelperVersion}] Failed to send image from ${folder}:`, err.message);
                }
            }
        }
        logMessage += "]"
        console.log(`[${HelperVersion}] Sent 1 photo from each of ${topicFolders.length} folders for topic "${topics.join(", ")}" to ${chatId}`);
    }

    return {
        success: true,
        logMessage: logMessage
    };
}

module.exports = {
    handleImageRequest
};
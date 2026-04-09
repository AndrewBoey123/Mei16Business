const path = require('path');
const axios = require('axios');
const HelperVersion = path.basename(__filename).replace(/\.[^/.]+$/, "");

// PDF to Image conversion
let fromBuffer;
try {
    ({ fromBuffer } = require("pdf2pic"));
} catch (err) {
    console.warn(`[${HelperVersion}] pdf2pic not installed. PDF summarization will be disabled.`);
}

const GROQ_VISION_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

async function analyzeImageWithGroq(imageBuffer, apiKey) {
    const base64Image = imageBuffer.toString("base64");
    const dataURL = `data:image/png;base64,${base64Image}`;

    try {
        const res = await axios.post(
            GROQ_VISION_ENDPOINT,
            {
                model: VISION_MODEL,
                messages: [
                    {
                        role: "system",
                        content: "You are a document analysis assistant. Describe the content clearly and concisely."
                    },
                    {
                        role: "user",
                        content: [
                            { 
                                type: "text", 
                                text: "Analyze this document page. If it contains text, provide a summary of the key information. If it's a form or certificate, describe what it is and the important fields visible." 
                            },
                            { type: "image_url", image_url: { url: dataURL } }
                        ]
                    }
                ],
                max_tokens: 300,
                temperature: 0.3
            },
            {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                },
                timeout: 30000
            }
        );

        return res.data?.choices?.[0]?.message?.content || "No description available.";
    } catch (err) {
        console.error(`[${HelperVersion}] Vision API Error:`, err.response?.data?.error?.message || err.message);
        throw err;
    }
}

async function summarizePdf(media, groqApiKey) {
    console.log(`[${HelperVersion}] Starting PDF summarization...`);

    if (!fromBuffer) {
        throw new Error("pdf2pic not installed");
    }

    if (!media?.data || !media?.filename) {
        throw new Error("Invalid media object");
    }

    if (!groqApiKey) {
        throw new Error("No GROQ API key provided");
    }

    try {
        // Convert PDF buffer
        const buffer = Buffer.from(media.data, "base64");
        
        const options = {
            density: 150,
            format: "png",
            width: 1024,
            height: 1024
        };

        console.log(`[${HelperVersion}] Converting PDF to images...`);
        const convert = fromBuffer(buffer, options);
        const result = await convert.bulk(-1, { responseType: "buffer" });

        if (!result || result.length === 0) {
            console.warn(`[${HelperVersion}] No pages converted from PDF.`);
            return "[PDF received - could not extract pages]";
        }

        console.log(`[${HelperVersion}] PDF converted to ${result.length} page(s). Analyzing with GROQ...`);

        // Analyze first 3 pages
        const pagesToAnalyze = Math.min(result.length, 3);
        let fullDescription = "";

        for (let i = 0; i < pagesToAnalyze; i++) {
            console.log(`[${HelperVersion}] Analyzing page ${i + 1}/${pagesToAnalyze}...`);
            try {
                const description = await analyzeImageWithGroq(result[i].buffer, groqApiKey);
                fullDescription += `Page ${i + 1}: ${description}\n\n`;
            } catch (err) {
                console.error(`[${HelperVersion}] Failed to analyze page ${i + 1}:`, err.message);
                fullDescription += `Page ${i + 1}: [Analysis failed]\n\n`;
            }
        }

        // Final summary
        console.log(`[${HelperVersion}] PDF analysis complete!`);
        
        // Trim and clean up
        const summary = fullDescription.trim();
        if (summary.length > 500) {
            return summary.substring(0, 500) + "... [truncated]";
        }
        return summary || "[PDF received - no content extracted]";

    } catch (err) {
        console.error(`[${HelperVersion}] Error in summarizePdf(): ${err.message}`);
        throw err;
    }
}

module.exports = {
    summarizePdf
};

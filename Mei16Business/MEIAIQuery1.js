const fs = require("fs");
const path = require("path");
const axios = require("axios");
const HelperVersion = path.basename(__filename).replace(/\.[^/.]+$/, "");

/**
 * Universal GPT query function with all parameters passed in.
 * Example usage:
 * AIQuery("Can you decide if you should reply. Yes or No only", url, model, apiKey, persona, 0.3, 500)
 */
 
async function AIQuery(prompt, chosenURL, chosenModel, chosenAPI, Persona, Temp, MaxToken) {
    try {
        const response = await axios.post(chosenURL, {
            model: chosenModel,
            messages: [
                { role: "system", content: Persona },
                { role: "user", content: prompt }
            ],
            temperature: Temp,
            max_tokens: MaxToken
        }, {
            headers: {
                "Authorization": `Bearer ${chosenAPI}`,
                "Content-Type": "application/json"
            }
        });

        if (!response.data || !response.data.choices || !response.data.choices[0]) {
            console.error(`[${HelperVersion}] Invalid AI response format`);
            return "";
        }

        return response.data.choices[0].message.content;

    } catch (err) {
        console.error(`[${HelperVersion}] AI generated errors:`, err.response?.data || err.message);
        return "";
    }
}

module.exports = {
    AIQuery
};
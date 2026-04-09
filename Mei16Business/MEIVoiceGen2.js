const path = require("path");
const axios = require('axios');
const fs = require('fs');

/**
 * Voice Generation - Converts text to speech using ElevenLabs
 * Falls back to text-only if no API key is configured
 * 
 * @param {string} text - Text to convert to speech
 * @param {string} outputFilePath - Path to save the audio file
 * @returns {Promise<string|null>} - Returns output path on success, null if no API key (fallback to text)
 */
async function VoiceGenerate(text, outputFilePath) {
    const voiceId = process.env.VOICE_ID;
    const apiKey = process.env.VOICE_API_KEY;
    
    // If no API key configured, return null to indicate text-only fallback
    if (!apiKey) {
        console.log('Voice generation skipped: No VOICE_API_KEY configured (ElevenLabs). Falling back to text.');
        return null;
    }
    
    if (!voiceId) {
        console.log('Voice generation skipped: No VOICE_ID configured. Falling back to text.');
        return null;
    }

    const modelId = process.env.VOICE_MODEL_ID || "eleven_turbo_v2_5";
    const speed = parseFloat(process.env.VOICE_SPEED || "1.0");
    const stability = parseFloat(process.env.VOICE_STABILITY || "0.5");
    const similarityBoost = parseFloat(process.env.VOICE_SIMILARITY || "0.5");
    const speakerBoost = process.env.VOICE_SPEAKER_BOOST === 'true';

    try {
        const response = await axios({
            method: 'POST',
            url: `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
            data: {
                text: text,
                model_id: modelId,
                voice_settings: {
                    speed: speed,
                    stability: stability,
                    similarity_boost: similarityBoost,
                    use_speaker_boost: speakerBoost
                }
            },
            headers: {
                'xi-api-key': apiKey,
                'Content-Type': 'application/json'
            },
            responseType: 'arraybuffer',
            timeout: 30000
        });

        fs.writeFileSync(outputFilePath, response.data);
        return outputFilePath;
    } catch (error) {
        console.error('Voice generation failed:', error.response?.data || error.message);
        return null; // Return null to indicate fallback to text
    }
}

module.exports = VoiceGenerate;

/*
Available ElevenLabs voices (examples):
Afifa = UcqZLa941Kkt8ZhEEybf  // Malay voice
Constance = ykMqqjWs4pQdCIvGPn0z  // Malaysian Singaporean Chinese voice

Model: eleven_multilingual_v2 or eleven_turbo_v2_5
Settings:
- Speed: ~1.16x = 1.16 (max: 1.20)
- Stability: ~1% = 0.01 (max: 1.0)
- Similarity Boost: ~92% = 0.92 (max: 1.0)
- Speaker Boost: Toggle ON = true
*/

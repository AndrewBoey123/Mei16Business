const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { exec } = require('child_process');
const FormData = require('form-data');

// Voice transcription timeout (ms) - configurable via env
const VOICE_TIMEOUT = parseInt(process.env.VOICE_TIMEOUT_MS) || 60000;

/**
 * Voice Interpretation - Converts voice to text using GROQ Whisper (free) or OpenAI Whisper
 * Priority: GROQ (free tier) -> OpenAI (paid fallback)
 */
async function VoiceInterpret(oggFilePath) {
    const VOICELANGUAGE = process.env.VOICELANGUAGE || 'en';
    const mp3Path = oggFilePath.replace('.ogg', '.mp3');

    console.log(`[VoiceInterpret] Starting conversion: ${oggFilePath} -> ${mp3Path}`);

    return new Promise((resolve, reject) => {
        exec(`ffmpeg -i "${oggFilePath}" -ar 16000 -ac 1 "${mp3Path}"`, async (error) => {
            if (error) {
                console.error(`[VoiceInterpret] FFmpeg failed:`, error.message);
                return reject(error);
            }
            console.log(`[VoiceInterpret] FFmpeg conversion successful`);

            try {
                // Priority 1: GROQ Whisper (free tier)
                const groqApi = process.env.GROQ_API_KEY || process.env.groqApi;
                console.log(`[VoiceInterpret] GROQ API key present: ${groqApi ? 'YES' : 'NO'}`);
                
                if (groqApi) {
                    try {
                        const form = new FormData();
                        form.append('file', fs.createReadStream(mp3Path));
                        form.append('model', 'whisper-large-v3');
                        form.append('language', VOICELANGUAGE);

                        console.log(`[VoiceInterpret] Sending to GROQ Whisper...`);
                        const response = await axios.post(
                            'https://api.groq.com/openai/v1/audio/transcriptions',
                            form,
                            {
                                headers: {
                                    ...form.getHeaders(),
                                    'Authorization': `Bearer ${groqApi}`
                                },
                                timeout: VOICE_TIMEOUT
                            }
                        );

                        fs.unlink(mp3Path, () => {});
                        console.log(`[VoiceInterpret] GROQ success: ${response.data.text?.substring(0, 50)}...`);
                        return resolve(response.data.text);
                    } catch (groqError) {
                        console.error(`[VoiceInterpret] GROQ Whisper failed:`, groqError.message);
                        if (groqError.response) {
                            console.error(`[VoiceInterpret] GROQ status: ${groqError.response.status}`, groqError.response.data);
                        }
                    }
                }

                // Priority 2: OpenAI Whisper (fallback)
                const openaiApi = process.env.openaiApi || process.env.OPENAI_API_KEY;
                if (openaiApi) {
                    const form = new FormData();
                    form.append('file', fs.createReadStream(mp3Path));
                    form.append('model', 'whisper-1');
                    form.append('language', VOICELANGUAGE);

                    const response = await axios.post(
                        'https://api.openai.com/v1/audio/transcriptions',
                        form,
                        {
                            headers: {
                                ...form.getHeaders(),
                                'Authorization': `Bearer ${openaiApi}`
                            },
                            timeout: VOICE_TIMEOUT
                        }
                    );

                    fs.unlink(mp3Path, () => {});
                    console.log('Voice interpreted using OpenAI Whisper');
                    return resolve(response.data.text);
                }

                // No API available
                fs.unlink(mp3Path, () => {});
                reject(new Error('No voice API configured. Set GROQ_API_KEY (free) or openaiApi.'));

            } catch (err) {
                fs.unlink(mp3Path, () => {});
                reject(err);
            }
        });
    });
}

module.exports = VoiceInterpret;

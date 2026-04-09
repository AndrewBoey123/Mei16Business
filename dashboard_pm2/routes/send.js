const express = require('express');
const router = express.Router();
const sockManager = require('../../Mei16/Mei16_Sock/Mei16_Sock.js');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../userdata/.env') });

router.get('/test', (req, res) => {
  res.send("Hello n8n, your request arrived successfully.");
});

router.post('/sendMsg', async (req, res) => {
  const { number, message } = req.body;

  console.log('=== SEND MESSAGE N8N DEBUG START ===');
  console.log('Number:', number);
  console.log('Message:', message);

  // -------------------------------
  // WHATSAPP SOCKET CHECK
  // -------------------------------
  const sock = sockManager.getSock();

  if (!sockManager.isReady()) {
    console.log('ERROR: WhatsApp not ready');
    return res.status(503).json({ error: 'WhatsApp not ready' });
  }

  try {
    const chatId = number.includes('@s.whatsapp.net')
      ? number
      : `${number}@s.whatsapp.net`;

    const result = await sock.sendMessage(chatId, { text: message });

    res.json({
      success: true,
      messageId: result.key.id,
      timestamp: result.messageTimestamp
    });
  } catch (err) {
    console.error('SEND MESSAGE ERROR:', err.message);
    res.status(500).json({ error: err.message });
  }

  console.log('=== SEND MESSAGE N8N DEBUG END ===');
});

module.exports = router;

# Mei16Business - WhatsApp AI Business Bot

A production-grade WhatsApp AI Business Bot platform designed for enterprise customer service, sales engagement, and business automation.

## Features

- 🤖 Multiple AI Engine Support (DeepSeek, OpenAI, Qwen, Anthropic, Groq)
- 📱 WhatsApp Integration via Baileys (Sock mode)
- 🌐 Web Admin Dashboard
- 🗣️ Voice Message Support (TTS & STT)
- 📊 Task & Goal Management
- 💾 Persistent Chat History
- 🔐 Admin/Boss Command System

## Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/AndrewBoey123/Mei16Business.git
cd Mei16Business

# Install dependencies
npm install

# Configure your bot
cp userdata/.env userdata/.env.local
# Edit userdata/.env with your API keys and settings

# Start the bot
npm run node_mei
```

### One-Line Install (Alternative)

```bash
curl -sSL https://raw.githubusercontent.com/AndrewBoey123/Mei16Business/main/install.sh | bash
```

## Configuration

Edit `userdata/.env` with your settings:

```env
# Bot Identity
SERIAL_ID=YourSerialKey
BOT_NAME=YourBotName
BOT_PHONE=60123456789
BOSS_PHONE=60123456789

# AI API Keys
deepseekApi=sk-your-deepseek-key
openaiApi=sk-your-openai-key
qwenApi=sk-your-qwen-key

# Dashboard
PORT=3000
```

## Usage

After starting, scan the QR code displayed to link your WhatsApp account.

### Boss Commands
Send commands from the BOSS_PHONE number:
- `STATUS` - Check bot status
- `RESTART` - Restart the bot
- More commands in the documentation

## Project Structure

```
Mei16Business/
├── Mei16Business/          # Main bot code (Sock mode)
├── dashboard_pm2/          # Web admin dashboard
├── userdata/               # Configuration & data
├── package.json
└── check-deps.js
```

## License

Read: https://andrew.education/meilicense.html

## Authors

- Andrew Boey
- Engelbert Pereira  
- Dhruba Rahman
- Hafiz Aiman

Homepage: https://www.andrew.education

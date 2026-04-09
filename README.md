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
- Git

**Windows & macOS Users:** The one-line installer only supports Linux. Please follow manual installation below.

### Installation

```bash
# Clone the repository
git clone https://github.com/AndrewBoey123/Mei16Business.git Mei
cd Mei

# Install dependencies
npm install

# Configure your bot
cp userdata/.env userdata/.env.local
# Edit userdata/.env with your API keys and settings

# Start the bot
npm run node_mei
```

### One-Line Install (Linux only)

```bash
curl -sSL https://raw.githubusercontent.com/AndrewBoey123/Mei16Business/main/install.sh | sudo bash
```

### Windows & macOS Installation

#### Windows:
1. Install [Node.js 20+](https://nodejs.org)
2. Install [Git for Windows](https://git-scm.com/download/win)
3. Open PowerShell or CMD and run:

```powershell
git clone https://github.com/AndrewBoey123/Mei16Business.git Mei
cd Mei
npm install
# Edit userdata\.env with your settings
npm run node_mei
```

#### macOS:
1. Install Homebrew (if not installed):
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

2. Install dependencies:
```bash
brew install node ffmpeg graphicsmagick ghostscript
```

3. Clone and run:
```bash
git clone https://github.com/AndrewBoey123/Mei16Business.git Mei
cd Mei
npm install
# Edit userdata/.env with your settings
npm run node_mei
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

Read: https://meibot.cloud/terms_of_service.htm

## Authors

- Andrew Boey
- Hafiz Aiman

Homepage: https://meibot.cloud

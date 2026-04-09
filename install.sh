#!/bin/bash
# Mei16Business One-Line Installer

set -e

REPO_URL="https://github.com/YOUR_USERNAME/Mei16Business.git"
INSTALL_DIR="Mei16Business"

echo "=========================================="
echo "  Mei16Business Installer"
echo "=========================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo "Please install Node.js 18+ first:"
    echo "  https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version is too old (found: $(node --version))"
    echo "Please upgrade to Node.js 18+"
    exit 1
fi

echo "✅ Node.js $(node --version) found"
echo ""

# Clone repository
if [ -d "$INSTALL_DIR" ]; then
    echo "⚠️  Directory $INSTALL_DIR already exists!"
    read -p "Remove and reinstall? (y/N): " confirm
    if [[ $confirm == [yY] ]]; then
        rm -rf "$INSTALL_DIR"
    else
        echo "Installation cancelled."
        exit 0
    fi
fi

echo "📥 Downloading Mei16Business..."
git clone "$REPO_URL" "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Check system dependencies
echo ""
echo "🔍 Checking system dependencies..."
npm run check-deps || true

echo ""
echo "=========================================="
echo "✅ Installation Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo ""
echo "1. Edit your configuration:"
echo "   cd $INSTALL_DIR"
echo "   nano userdata/.env"
echo ""
echo "2. Add your API keys:"
echo "   - SERIAL_ID"
echo "   - BOT_PHONE, BOSS_PHONE"
echo "   - deepseekApi or openaiApi"
echo ""
echo "3. Start the bot:"
echo "   npm run node_mei"
echo ""
echo "4. Scan the QR code with WhatsApp to link your account"
echo ""

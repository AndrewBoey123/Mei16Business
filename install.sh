#!/bin/bash
# Mei16Business One-Line Installer
# Auto-installs: Node.js 20, ffmpeg, graphicsmagick, ghostscript

set -e

REPO_URL="https://github.com/AndrewBoey123/Mei16Business"
INSTALL_DIR="Mei"

echo "=========================================="
echo "  Mei16Business Installer"
echo "=========================================="
echo ""

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "win32" ]]; then
    OS="windows"
else
    OS=$(uname -s)
fi

echo "📍 Detected OS: $OS"
echo ""

# Windows-specific instructions
if [ "$OS" = "windows" ] || [[ "$OS" == *"MINGW"* ]] || [[ "$OS" == *"MSYS"* ]]; then
    echo "⚠️  Windows detected!"
    echo ""
    echo "Please install the following manually:"
    echo ""
    echo "1. Node.js 20+: https://nodejs.org"
    echo "2. Git for Windows: https://git-scm.com/download/win"
    echo ""
    echo "Optional (for full features):"
    echo "3. ffmpeg: https://ffmpeg.org/download.html#build-windows"
    echo "4. GraphicsMagick: http://www.graphicsmagick.org/download.html"
    echo "5. Ghostscript: https://ghostscript.com/releases/gsdnld.html"
    echo ""
    echo "Then run these commands:"
    echo ""
    echo "  git clone https://github.com/AndrewBoey123/Mei16Business.git Mei"
    echo "  cd Mei"
    echo "  npm install"
    echo "  npm run node_mei"
    echo ""
    exit 0
fi

# macOS-specific instructions
if [ "$OS" = "macos" ] || [[ "$OSTYPE" == "darwin"* ]]; then
    echo "⚠️  macOS detected!"
    echo ""
    echo "Please install the following using Homebrew:"
    echo ""
    echo "1. Install Homebrew (if not installed):"
    echo '   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
    echo ""
    echo "2. Install dependencies:"
    echo "   brew install node ffmpeg graphicsmagick ghostscript"
    echo ""
    echo "Then run these commands:"
    echo ""
    echo "  git clone https://github.com/AndrewBoey123/Mei16Business.git Mei"
    echo "  cd Mei"
    echo "  npm install"
    echo "  npm run node_mei"
    echo ""
    exit 0
fi

# Function to install Node.js
install_nodejs() {
    echo "📦 Installing Node.js 20..."
    if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
    elif [ "$OS" = "centos" ] || [ "$OS" = "rhel" ] || [ "$OS" = "fedora" ]; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
        yum install -y nodejs
    else
        echo "❌ Unsupported OS for automatic Node.js installation"
        echo "Please install Node.js 20+ manually from https://nodejs.org/"
        exit 1
    fi
}

# Function to install system dependencies
install_system_deps() {
    echo "📦 Installing system dependencies (ffmpeg, graphicsmagick, ghostscript)..."
    if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
        apt-get update
        apt-get install -y ffmpeg graphicsmagick ghostscript curl unzip
    elif [ "$OS" = "centos" ] || [ "$OS" = "rhel" ] || [ "$OS" = "fedora" ]; then
        yum install -y ffmpeg GraphicsMagick ghostscript curl unzip
    else
        echo "⚠️  Could not auto-install system dependencies"
        echo "You may need to manually install: ffmpeg, graphicsmagick, ghostscript"
    fi
}

# Check if running as root for system installs
if [ "$EUID" -ne 0 ] && [ -z "$SKIP_SYSTEM_INSTALL" ]; then
    echo "⚠️  This installer needs sudo/root to install Node.js and system dependencies"
    echo ""
    echo "Run with sudo:"
    echo "  curl -sSL https://raw.githubusercontent.com/AndrewBoey123/Mei16Business/main/install.sh | sudo bash"
    echo ""
    echo "Or skip system installation (if Node.js is already installed):"
    echo "  SKIP_SYSTEM_INSTALL=1 curl -sSL ... | bash"
    exit 1
fi

# Install system dependencies
install_system_deps

# Check/Install Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found"
    install_nodejs
else
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        echo "❌ Node.js version is too old (found: $(node --version))"
        install_nodejs
    else
        echo "✅ Node.js $(node --version) found"
    fi
fi

echo ""

# Check if directory exists
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

# Download and extract (no git history)
echo "📥 Downloading Mei16Business..."
curl -sL "${REPO_URL}/archive/refs/heads/main.zip" -o mei16_temp.zip
unzip -q mei16_temp.zip
mv Mei16Business-main "$INSTALL_DIR"
rm mei16_temp.zip

# Remove git-related files
cd "$INSTALL_DIR"
rm -rf .git .gitignore .github

echo "✅ Downloaded to $INSTALL_DIR/"
echo ""

# Install dependencies
echo "📦 Installing npm dependencies..."
npm install

# Check system dependencies
echo ""
echo "🔍 Verifying system dependencies..."
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
echo "📖 For more info: $REPO_URL"
echo ""

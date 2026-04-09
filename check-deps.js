#!/usr/bin/env node
// Check system dependencies for MEI Bot

const { execSync } = require('child_process');

console.log('🔍 Checking system dependencies...\n');

const checks = [
    { name: 'Node.js', cmd: 'node --version', required: true },
    { name: 'FFmpeg (for voice notes)', cmd: 'ffmpeg -version', required: false },
    { name: 'GraphicsMagick (for PDF)', cmd: 'which gm', required: false },
    { name: 'Ghostscript (for PDF)', cmd: 'which gs', required: false }
];

let allGood = true;

for (const check of checks) {
    try {
        const result = execSync(check.cmd, { encoding: 'utf8', stdio: 'pipe' });
        console.log(`✅ ${check.name}: ${result.trim()}`);
    } catch (err) {
        allGood = false;
        const icon = check.required ? '❌' : '⚠️';
        console.log(`${icon} ${check.name}: NOT FOUND`);
        if (check.name.includes('FFmpeg')) {
            console.log(`   → Voice note transcription will be disabled`);
            console.log(`   → Install: sudo apt-get install -y ffmpeg`);
        } else if (check.name.includes('GraphicsMagick') || check.name.includes('Ghostscript')) {
            console.log(`   → PDF summarization will be disabled`);
            console.log(`   → Install: sudo apt-get install -y graphicsmagick ghostscript`);
        }
    }
}

console.log('\n' + (allGood ? '✅ All dependencies installed!' : '⚠️  Some optional dependencies missing'));
process.exit(allGood ? 0 : 0); // Exit 0 even if optional deps missing

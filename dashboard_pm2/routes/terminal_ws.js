// routes/terminal_ws.js
const WebSocket = require('ws');
const pty = require('node-pty');
const path = require('path');

const isWindows = process.platform === 'win32';
const SHELL = isWindows ? 'powershell.exe' : '/bin/bash';
const SHELL_ARGS = isWindows ? ['-NoLogo'] : ['-l'];
const rootPath = path.join(__dirname, '..', '..');
const WS_PATH = '/terminal';

module.exports = (server) => {
  const wss = new WebSocket.Server({ server, path: WS_PATH });

  wss.on('connection', (ws) => {
    // Start with conservative default size
    const p = pty.spawn(SHELL, SHELL_ARGS, {
      name: 'xterm-256color',
      cols: 80,  // Reduced from 120 to prevent horizontal overflow
      rows: 24,  // Reduced from 30 to better match common terminal sizes
      cwd: rootPath,
      env: { 
        ...process.env, 
        TERM: 'xterm-256color',
        LINES: '24',    // Explicitly set
        COLUMNS: '80'   // Explicitly set
      },
    });

    // PTY -> Browser
    p.onData((data) => {
      try { 
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data); 
        }
      } catch {} 
    });

    // Browser -> PTY
    ws.on('message', (raw) => {
      try {
        const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);

        // Handle resize messages
        if (text.startsWith('{')) {
          try {
            const msg = JSON.parse(text);
            if (msg?.type === 'resize') {
              const cols = Math.max(10, Math.min(200, +msg.cols || 80));
              const rows = Math.max(5, Math.min(60, +msg.rows || 24));
              p.resize(cols, rows);
              return;
            }
          } catch {
            // Not a resize message, fall through
          }
        }

        p.write(text);
      } catch {}
    });

    // Cleanup
    const cleanup = () => {
      try { p.kill(); } catch {}
      try { ws.close(); } catch {}
    };

    ws.on('close', cleanup);
    ws.on('error', cleanup);
    p.onExit(cleanup);
  });
};
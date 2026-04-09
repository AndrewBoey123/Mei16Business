// routes/pm2_logs.js
const path = require('path');
const { spawn } = require('child_process');

module.exports = function(io) {
  const isWin = process.platform === 'win32';
  const pm2Path = isWin
    ? `"${path.join(__dirname, '..', '..', 'node_modules', '.bin', 'pm2.cmd')}"` // for Windows
    : 'pm2'; // for Linux/macOS

  io.on('connection', (socket) => {
    const logStream = spawn(`${pm2Path} logs Mei --raw`, [], {
      shell: true,
      windowsHide: true
    });

    logStream.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        const trimmed = line.trim();

        // Remove PM2 startup info line
        if (
          trimmed.includes('[TAILING] Tailing last') &&
          trimmed.includes('change the value with --lines option')
        ) return;

        if (trimmed) {
          socket.emit('mei-log', trimmed);
        }
      });
    });

    logStream.stderr.on('data', (data) => {
      const msg = `${data.toString().trim()}`;
      socket.emit('mei-log', msg);
    });

    socket.on('disconnect', () => {
      logStream.kill();
    });
  });
};

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const chatHistoryFolder = path.join(__dirname, '../../userdata/chathistory');

const multer = require('multer');

const upload = multer({
  dest: path.join(chatHistoryFolder, '_tmp'),
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname) !== '.json') {
      return cb(new Error('Only .json files are allowed'));
    }
    cb(null, true);
  }
});

// Highlight helpers
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function highlight(text, keyword) {
  if (!text || !keyword) return text;
  const escaped = escapeRegExp(keyword);
  const regex = new RegExp(`(${escaped})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

router.get('/', (req, res) => {
  
  const fileList = fs.readdirSync(chatHistoryFolder)
  .filter(f => f.endsWith('.json'))
  .map(file => {
    const fullPath = path.join(chatHistoryFolder, file);
    return { file, mtime: fs.statSync(fullPath).mtime };
  })
  .sort((a, b) => b.mtime - a.mtime)
  .map(f => f.file);

  const selectedFile = req.query.file;
  let search = req.query.search || '';
  const startDate = req.query.start || '';
  const endDate = req.query.end || '';

  let chatData = null;
  let noResultsFound = false;


  if (selectedFile) {
    const filePath = path.join(chatHistoryFolder, selectedFile);
    if (fs.existsSync(filePath)) {
      try {
        const rawData = fs.readFileSync(filePath);
        let parsedData = JSON.parse(rawData);

        // Filter by date
        if (startDate || endDate) {
          parsedData = parsedData.filter(entry => {
            const entryDate = new Date(entry.datetime);
            const afterStart = !startDate || entryDate >= new Date(startDate);
            const beforeEnd = !endDate || entryDate <= new Date(endDate);
            return afterStart && beforeEnd;
          });
        }

        // Keyword filter
        if (search) {
          const lower = search.toLowerCase();
          const filtered = parsedData.filter(entry =>
            (entry.user_name && entry.user_name.toLowerCase().includes(lower)) ||
            (entry.user_phone && entry.user_phone.toLowerCase().includes(lower)) ||
            (entry.user_message && entry.user_message.toLowerCase().includes(lower)) ||
            (entry.mei_response && entry.mei_response.toLowerCase().includes(lower))
          );

          if (filtered.length === 0) {
            noResultsFound = true;
            chatData = parsedData; // restore full chat
            search = ''; // disable highlighting
          } else {
            chatData = filtered;
          }
        } else {
          chatData = parsedData;
        }
      } catch (err) {
        console.error('Error reading chat file:', err);
      }
    }
  }

  res.render('chathistory', {
    fileList,
    selectedFile,
    chatData,
    search,
    startDate,
    endDate,
    highlight,
    noResultsFound,
    uploadMessage: null
  });
});

router.get('/download-json', (req, res) => {
  const file = req.query.file;
  const filePath = path.join(chatHistoryFolder, file);
  if (!file || !fs.existsSync(filePath)) return res.status(404).send('File not found');
  res.download(filePath, file);
});

router.get('/download-zip', (req, res) => {
  const zipName = 'all_chats.zip';
  res.setHeader('Content-Disposition', `attachment; filename=${zipName}`);
  res.setHeader('Content-Type', 'application/zip');

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);

  fs.readdirSync(chatHistoryFolder).forEach(file => {
    const fullPath = path.join(chatHistoryFolder, file);
    if (fs.statSync(fullPath).isFile() && file.endsWith('.json')) {
      archive.file(fullPath, { name: file });
    }
  });

  archive.finalize();
});



//Delete Chat
router.post('/delete-chat', (req, res) => {
  const requestedFile = req.body.file;
  if (!requestedFile) return res.status(400).json({ success: false, message: 'No file specified' });

  // Do case-insensitive matching
  const matchedFile = fs.readdirSync(chatHistoryFolder).find(
    f => f.toLowerCase() === requestedFile.toLowerCase()
  );

  if (!matchedFile) {
    return res.status(404).json({ success: false, message: 'File does not exist' });
  }

  const filePath = path.join(chatHistoryFolder, matchedFile);

  try {
    fs.unlinkSync(filePath);
    return res.json({ success: true, message: `Chat file "${matchedFile}" deleted successfully.` });
  } catch (err) {
    console.error('❌ Error deleting chat file:', err);
    return res.status(500).json({ success: false, message: 'Failed to delete file' });
  }
});

//Upload Chat as Json
router.post('/upload', upload.single('chatFile'), (req, res) => {
  const tempPath = req.file.path;
  const originalName = req.file.originalname;
  const targetPath = path.join(chatHistoryFolder, originalName);

  fs.rename(tempPath, targetPath, (err) => {
    if (err) {
      console.error('Upload error:', err);
      return res.render('chathistory', {
        fileList: fs.readdirSync(chatHistoryFolder).filter(f => f.endsWith('.json')),
        selectedFile: '',
        chatData: null,
        search: '',
        startDate: '',
        endDate: '',
        highlight,
        noResultsFound: false,
        uploadMessage: '❌ Failed to upload file.'
      });
    }

    return res.redirect('/chathistory?file=' + encodeURIComponent(originalName));
  });
});


module.exports = router;
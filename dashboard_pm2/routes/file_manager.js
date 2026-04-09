/**
 * Modern File Manager v2
 * Windows Explorer-style web file manager with FileGator-inspired features
 * Route: /fileman2
 * 
 * Features:
 * - Breadcrumb navigation
 * - Icon/List view toggle
 * - Drag & drop upload with progress
 * - Context menus (right-click)
 * - Copy/Move/Rename/Delete files & folders
 * - Download (single & bulk zip)
 * - Zip/Unzip archives
 * - File preview (images, text, code)
 * - Search/filter
 * - Multi-select operations
 * - 100% responsive (mobile-first design)
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const multer = require('multer');
const archiver = require('archiver');
const AdmZip = require('adm-zip');

const router = express.Router();

// ───── Config ─────
const ROOT_DIR = process.env.FILEMAN_ROOT
  ? path.resolve(process.env.FILEMAN_ROOT)
  : path.resolve(__dirname, '../../../');

const UPLOAD_TEMP = path.join(ROOT_DIR, '.uploads');

// Ensure upload temp exists
(async () => {
  try {
    await fsp.mkdir(UPLOAD_TEMP, { recursive: true });
  } catch (e) {}
})();

// ───── Security: Path traversal protection ─────
function safeJoin(base, target) {
  const p = path.resolve(base, target);
  if (!p.startsWith(base + path.sep) && p !== base) {
    throw new Error('Path traversal blocked');
  }
  return p;
}

// ───── Helper: Get file icon based on extension ─────
function getFileIcon(filename) {
  const ext = path.extname(filename).toLowerCase();
  const iconMap = {
    // Images
    '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.gif': 'image',
    '.webp': 'image', '.svg': 'image', '.bmp': 'image', '.ico': 'image',
    // Videos
    '.mp4': 'video', '.webm': 'video', '.mov': 'video', '.avi': 'video', '.mkv': 'video',
    // Audio
    '.mp3': 'audio', '.wav': 'audio', '.ogg': 'audio', '.flac': 'audio', '.m4a': 'audio',
    // Documents
    '.pdf': 'pdf',
    '.doc': 'word', '.docx': 'word',
    '.xls': 'excel', '.xlsx': 'excel', '.csv': 'excel',
    '.ppt': 'powerpoint', '.pptx': 'powerpoint',
    // Code
    '.js': 'code', '.ts': 'code', '.html': 'code', '.htm': 'code', '.css': 'code',
    '.json': 'code', '.xml': 'code', '.yaml': 'code', '.yml': 'code',
    '.py': 'code', '.java': 'code', '.cpp': 'code', '.c': 'code', '.h': 'code',
    '.php': 'code', '.rb': 'code', '.go': 'code', '.rs': 'code',
    '.sql': 'code', '.sh': 'code', '.bat': 'code', '.ps1': 'code',
    // Archives
    '.zip': 'zip', '.rar': 'zip', '.7z': 'zip', '.tar': 'zip', '.gz': 'zip',
    // Text
    '.txt': 'text', '.md': 'text', '.log': 'text', '.env': 'text',
    // Executables
    '.exe': 'exe', '.msi': 'exe', '.dmg': 'exe', '.app': 'exe',
  };
  return iconMap[ext] || 'file';
}

// ───── Helper: Format file size ─────
function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

// ───── Helper: Format date ─────
function formatDate(date) {
  const d = new Date(date);
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ───── Helper: Check if file is previewable ─────
function isPreviewable(filename) {
  const ext = path.extname(filename).toLowerCase();
  const previewable = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico', '.bmp',
    '.txt', '.md', '.json', '.js', '.ts', '.html', '.css', '.xml', '.yaml', '.yml',
    '.py', '.java', '.cpp', '.c', '.h', '.php', '.rb', '.go', '.rs', '.sql', '.sh',
    '.log', '.env', '.bat', '.ps1'];
  return previewable.includes(ext);
}

// ───── Helper: Get mime type ─────
function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeMap = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp', '.ico': 'image/x-icon',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain', '.md': 'text/markdown',
    '.json': 'application/json', '.js': 'text/javascript',
    '.html': 'text/html', '.css': 'text/css',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

// ───── Multer Storage Configuration ─────
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const baseDir = req.body.dir || '';
      // Handle folder uploads - file.originalname may contain path like "folder/file.txt"
      const fullPath = file.originalname;
      const lastSlash = fullPath.lastIndexOf('/');
      
      if (lastSlash > 0) {
        // File is inside a subfolder
        const subPath = fullPath.substring(0, lastSlash);
        const abs = safeJoin(ROOT_DIR, path.posix.join(baseDir, subPath));
        await fsp.mkdir(abs, { recursive: true });
        cb(null, abs);
      } else {
        // File is in root of upload
        const abs = safeJoin(ROOT_DIR, baseDir);
        await fsp.mkdir(abs, { recursive: true });
        cb(null, abs);
      }
    } catch (e) {
      cb(e);
    }
  },
  filename: (req, file, cb) => {
    // Extract just the filename from path like "folder/file.txt"
    const fullPath = file.originalname;
    const lastSlash = fullPath.lastIndexOf('/');
    const fileName = lastSlash > 0 ? fullPath.substring(lastSlash + 1) : fullPath;
    cb(null, fileName);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 * 1024 }, // 10GB limit
  preservePath: true // Keep the full path from filename (e.g., "folder/file.js")
});

// ───── MAIN VIEW ─────
router.get('/', async (req, res, next) => {
  try {
    res.render('file_manager', {
      pageTitle: 'File Manager Pro',
      currentPath: req.query.dir || ''
    });
  } catch (err) {
    next(err);
  }
});

// ───── API: GET DIRECTORY TREE ─────
router.get('/api/tree', async (req, res) => {
  try {
    const rel = (req.query.dir || '').replace(/\\/g, '/');
    const abs = safeJoin(ROOT_DIR, rel);
    const showHidden = req.query.showHidden === 'true';

    const items = await fsp.readdir(abs, { withFileTypes: true });
    const dirs = items
      .filter(i => i.isDirectory() && (showHidden || !i.name.startsWith('.')))
      .map(i => ({
        name: i.name,
        rel: rel ? `${rel}/${i.name}` : i.name
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({ ok: true, dirs });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ───── API: LIST FILES & FOLDERS ─────
router.get('/api/list', async (req, res) => {
  try {
    const rel = (req.query.dir || '').replace(/\\/g, '/');
    const abs = safeJoin(ROOT_DIR, rel);
    const showHidden = req.query.showHidden === 'true';

    await fsp.access(abs);
    const items = await fsp.readdir(abs, { withFileTypes: true });

    const files = [];
    const folders = [];

    await Promise.all(items.map(async (item) => {
      // Skip hidden files/folders unless showHidden is enabled
      if (!showHidden && item.name.startsWith('.')) return;

      const itemPath = path.join(abs, item.name);
      const stat = await fsp.stat(itemPath);

      const baseInfo = {
        name: item.name,
        path: rel ? `${rel}/${item.name}` : item.name,
        modified: stat.mtime,
        created: stat.birthtime,
        size: stat.size
      };

      if (item.isDirectory()) {
        folders.push({
          ...baseInfo,
          type: 'folder',
          icon: 'folder',
          itemCount: (await fsp.readdir(itemPath).catch(() => [])).length
        });
      } else {
        files.push({
          ...baseInfo,
          type: 'file',
          ext: path.extname(item.name).toLowerCase(),
          icon: getFileIcon(item.name),
          previewable: isPreviewable(item.name),
          mime: getMimeType(item.name)
        });
      }
    }));

    // Sort: folders first, then alphabetically
    folders.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));

    res.json({ 
      ok: true, 
      items: [...folders, ...files],
      currentPath: rel,
      parentPath: rel ? path.dirname(rel).replace(/\\/g, '/') : null
    });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ───── API: UPLOAD FILES ─────
router.post('/api/upload', (req, res, next) => {
  upload.array('files', 50)(req, res, (err) => {
    if (err) {
      console.error('[Upload] Multer error:', err);
      return res.status(400).json({ ok: false, error: err.message });
    }
    
    // Continue with handler
    handleUpload(req, res);
  });
});

async function handleUpload(req, res) {
  try {
    const files = req.files || [];

    const fileResults = await Promise.all(files.map(async (f) => {
      try {
        const stat = await fsp.stat(f.path);
        // Extract just the filename from path like "folder/file.txt"
        const fullPath = f.originalname;
        const lastSlash = fullPath.lastIndexOf('/');
        const displayName = lastSlash > 0 ? fullPath : f.originalname;
        return {
          name: displayName,
          declaredSize: f.size,   // size reported by client (multipart header)
          savedSize: stat.size,   // actual bytes written to disk
          verified: f.size === stat.size
        };
      } catch {
        return { name: f.originalname, declaredSize: f.size, savedSize: null, verified: false };
      }
    }));

    const totalDeclared = files.reduce((s, f) => s + (f.size || 0), 0);
    const totalSaved    = fileResults.reduce((s, f) => s + (f.savedSize || 0), 0);

    res.json({
      ok: true,
      message: `Uploaded ${files.length} file(s)`,
      files: fileResults,
      verification: {
        totalDeclaredBytes: totalDeclared,
        totalSavedBytes: totalSaved,
        verified: totalDeclared === totalSaved
      }
    });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
}

// ───── API: CREATE FOLDER ─────
router.post('/api/mkdir', express.json(), async (req, res) => {
  try {
    const { dir = '', name } = req.body || {};
    if (!name) throw new Error('Folder name required');
    if (/[\\\/:*?"<>|]/.test(name)) throw new Error('Invalid folder name');

    const abs = safeJoin(ROOT_DIR, path.posix.join(dir, name));
    await fsp.mkdir(abs, { recursive: false });
    
    res.json({ ok: true, message: 'Folder created' });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ───── API: RENAME ─────
router.post('/api/rename', express.json(), async (req, res) => {
  try {
    const { dir = '', oldName, newName, isFolder = false } = req.body || {};
    if (!oldName || !newName) throw new Error('Names required');
    if (/[\\\/:*?"<>|]/.test(newName)) throw new Error('Invalid name');

    const from = safeJoin(ROOT_DIR, path.posix.join(dir, oldName));
    const to = safeJoin(ROOT_DIR, path.posix.join(dir, newName));
    
    await fsp.access(from);
    await fsp.rename(from, to);
    
    res.json({ ok: true, message: 'Renamed successfully' });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ───── API: DELETE (files or folders) ─────
router.post('/api/delete', express.json(), async (req, res) => {
  try {
    const { items } = req.body || {}; // Array of { path, isFolder }
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('No items to delete');
    }

    const results = [];
    for (const item of items) {
      try {
        const abs = safeJoin(ROOT_DIR, item.path);
        
        // Prevent deleting root
        if (abs === ROOT_DIR) {
          results.push({ path: item.path, error: 'Cannot delete root' });
          continue;
        }

        if (item.isFolder) {
          await fsp.rm(abs, { recursive: true, force: true });
        } else {
          await fsp.unlink(abs);
        }
        results.push({ path: item.path, success: true });
      } catch (err) {
        results.push({ path: item.path, error: err.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    res.json({ 
      ok: true, 
      message: `Deleted ${successCount}/${items.length} items`,
      results
    });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ───── API: CHECK CONFLICTS ─────
router.post('/api/check-conflicts', express.json(), async (req, res) => {
  try {
    const { items, targetDir } = req.body || {};
    if (!Array.isArray(items) || targetDir === undefined) {
      throw new Error('Invalid parameters');
    }

    const targetAbs = safeJoin(ROOT_DIR, targetDir);
    const conflicts = [];

    for (const item of items) {
      const name = path.basename(item.path);
      const destAbs = path.join(targetAbs, name);
      
      try {
        await fsp.access(destAbs);
        // File exists - get info
        const stat = await fsp.stat(destAbs);
        conflicts.push({
          sourcePath: item.path,
          targetPath: item.path, // Relative to targetDir
          name: name,
          isFolder: stat.isDirectory(),
          existingSize: stat.size,
          existingModified: stat.mtime
        });
      } catch {
        // File doesn't exist - no conflict
      }
    }

    res.json({ ok: true, conflicts });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ───── API: COPY ─────
// conflictResolution: 'skip', 'overwrite', 'rename'
router.post('/api/copy', express.json(), async (req, res) => {
  try {
    const { items, targetDir, conflictResolution = 'rename' } = req.body || {}; // items: array of { path, isFolder }
    if (!Array.isArray(items) || targetDir === undefined || targetDir === null) {
      throw new Error('Invalid parameters');
    }

    const targetAbs = safeJoin(ROOT_DIR, targetDir);
    const results = [];
    const verificationFiles = [];
    let totalSrcBytes = 0, totalDstBytes = 0;

    for (const item of items) {
      try {
        const sourceAbs = safeJoin(ROOT_DIR, item.path);
        const name = path.basename(item.path);
        const destAbs = path.join(targetAbs, name);

        // Check if destination exists
        const exists = await fileExists(destAbs);
        let finalDest = destAbs;

        if (exists) {
          if (conflictResolution === 'skip') {
            results.push({ path: item.path, success: true, skipped: true, message: 'Skipped (file exists)' });
            continue;
          } else if (conflictResolution === 'overwrite') {
            // Check if source and destination are the same file (only skip for overwrite)
            if (sourceAbs === destAbs) {
              results.push({ path: item.path, success: true, skipped: true, message: 'Source and destination are the same file' });
              continue;
            }
            // Delete existing file first
            await fsp.unlink(destAbs);
            finalDest = destAbs;
          } else {
            // rename - use auto-rename with timestamp
            finalDest = await resolveDestPath(destAbs);
            // After renaming, check if by chance the resolved path equals source (rare but possible)
            if (sourceAbs === finalDest) {
              results.push({ path: item.path, success: true, skipped: true, message: 'Source and destination are the same file' });
              continue;
            }
          }
        }

        if (item.isFolder) {
          const sub = await copyRecursive(sourceAbs, finalDest);
          totalSrcBytes += sub.totalSrcBytes;
          totalDstBytes += sub.totalDstBytes;
          verificationFiles.push({
            name,
            isFolder: true,
            srcSize: sub.totalSrcBytes,
            dstSize: sub.totalDstBytes,
            verified: sub.totalSrcBytes === sub.totalDstBytes,
            children: sub.fileResults
          });
        } else {
          const srcStat = await fsp.stat(sourceAbs);
          await fsp.copyFile(sourceAbs, finalDest);
          const dstStat = await fsp.stat(finalDest);
          totalSrcBytes += srcStat.size;
          totalDstBytes += dstStat.size;
          verificationFiles.push({
            name,
            isFolder: false,
            srcSize: srcStat.size,
            dstSize: dstStat.size,
            verified: srcStat.size === dstStat.size
          });
        }
        results.push({ path: item.path, success: true });
      } catch (err) {
        results.push({ path: item.path, error: err.message });
        verificationFiles.push({ name: path.basename(item.path), error: err.message, verified: false });
      }
    }

    const successCount = results.filter(r => r.success).length;
    res.json({
      ok: true,
      message: `Copied ${successCount}/${items.length} items`,
      results,
      verification: {
        totalSrcBytes,
        totalDstBytes,
        verified: totalSrcBytes === totalDstBytes && successCount === items.length,
        files: verificationFiles
      }
    });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// Helper: Check if file exists
async function fileExists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Helper: If destPath already exists, append timestamp before extension.
// If the timestamped name also exists, append a counter (2), (3), etc.
async function resolveDestPath(destAbs) {
  try {
    await fsp.access(destAbs);
  } catch {
    return destAbs; // doesn't exist, use as-is
  }

  const ext = path.extname(destAbs);
  const base = destAbs.slice(0, destAbs.length - ext.length);
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const tsPath = `${base}_${ts}${ext}`;

  try {
    await fsp.access(tsPath);
  } catch {
    return tsPath; // timestamped name is free
  }

  // Timestamped name also taken — add counter
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}_${ts}(${i})${ext}`;
    try {
      await fsp.access(candidate);
    } catch {
      return candidate;
    }
  }

  return tsPath; // fallback (extremely unlikely)
}

// Helper: Recursive copy — returns { totalSrcBytes, totalDstBytes, fileResults }
async function copyRecursive(src, dest) {
  let totalSrcBytes = 0, totalDstBytes = 0;
  const fileResults = [];

  await fsp.mkdir(dest, { recursive: true });
  const entries = await fsp.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    try {
      if (entry.isDirectory()) {
        const sub = await copyRecursive(srcPath, destPath);
        totalSrcBytes += sub.totalSrcBytes;
        totalDstBytes += sub.totalDstBytes;
        fileResults.push(...sub.fileResults);
      } else if (entry.isSymbolicLink()) {
        const linkTarget = await fsp.readlink(srcPath);
        await fsp.symlink(linkTarget, destPath).catch(() => {});
      } else {
        const srcStat = await fsp.stat(srcPath);
        await fsp.copyFile(srcPath, destPath);
        const dstStat = await fsp.stat(destPath);
        totalSrcBytes += srcStat.size;
        totalDstBytes += dstStat.size;
        fileResults.push({
          name: path.relative(src, srcPath),
          srcSize: srcStat.size,
          dstSize: dstStat.size,
          verified: srcStat.size === dstStat.size
        });
      }
    } catch (err) {
      console.warn(`[fileman] copy skipped: ${srcPath} → ${err.message}`);
      fileResults.push({ name: entry.name, error: err.message, verified: false });
    }
  }
  return { totalSrcBytes, totalDstBytes, fileResults };
}

// ───── API: MOVE ─────
// conflictResolution: 'skip', 'overwrite', 'rename'
router.post('/api/move', express.json(), async (req, res) => {
  try {
    const { items, targetDir, conflictResolution = 'skip' } = req.body || {};
    if (!Array.isArray(items) || targetDir === undefined || targetDir === null) {
      throw new Error('Invalid parameters');
    }

    const targetAbs = safeJoin(ROOT_DIR, targetDir);
    const results = [];

    for (const item of items) {
      try {
        const sourceAbs = safeJoin(ROOT_DIR, item.path);
        const name = path.basename(item.path);
        const destAbs = path.join(targetAbs, name);

        // Check if destination exists
        const exists = await fileExists(destAbs);
        let finalDest = destAbs;

        if (exists) {
          if (conflictResolution === 'skip') {
            results.push({ path: item.path, success: true, skipped: true, message: 'Skipped (file exists)' });
            continue;
          } else if (conflictResolution === 'overwrite') {
            // Delete existing file first
            await fsp.unlink(destAbs);
            finalDest = destAbs;
          } else {
            // rename - use auto-rename with timestamp
            finalDest = await resolveDestPath(destAbs);
          }
        }

        await fsp.rename(sourceAbs, finalDest);
        results.push({ path: item.path, success: true });
      } catch (err) {
        results.push({ path: item.path, error: err.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    res.json({ 
      ok: true, 
      message: `Moved ${successCount}/${items.length} items`,
      results
    });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ───── API: DOWNLOAD SINGLE FILE ─────
router.get('/api/download', async (req, res) => {
  try {
    const filePath = (req.query.path || '').replace(/\\/g, '/');
    if (!filePath) throw new Error('Path required');

    const abs = safeJoin(ROOT_DIR, filePath);
    const stat = await fsp.stat(abs);
    
    if (stat.isDirectory()) {
      // Download folder as zip
      const folderName = path.basename(filePath);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${folderName}.zip"`);
      
      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.on('error', (err) => res.status(500).json({ error: err.message }));
      archive.pipe(res);
      archive.directory(abs, folderName);
      await archive.finalize();
    } else {
      // Download single file
      res.setHeader('Content-Type', getMimeType(filePath));
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
      res.sendFile(abs);
    }
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ───── API: BULK DOWNLOAD ─────
router.post('/api/bulk-download', express.json(), async (req, res) => {
  try {
    const { items } = req.body || {}; // Array of { path, isFolder }
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('No items to download');
    }

    const zipName = `download_${Date.now()}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => res.status(500).json({ error: err.message }));
    archive.pipe(res);

    for (const item of items) {
      const abs = safeJoin(ROOT_DIR, item.path);
      const name = path.basename(item.path);
      
      if (item.isFolder) {
        archive.directory(abs, name);
      } else {
        archive.file(abs, { name });
      }
    }

    await archive.finalize();
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ───── API: CREATE ZIP ─────
router.post('/api/zip', express.json(), async (req, res) => {
  try {
    const { dir = '', items, zipName } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('No items to zip');
    }

    const absDir = safeJoin(ROOT_DIR, dir);
    const zipFileName = zipName || `archive_${Date.now()}.zip`;
    const zipPath = path.join(absDir, zipFileName);

    const archive = archiver('zip', { zlib: { level: 6 } });
    const output = fs.createWriteStream(zipPath);

    await new Promise((resolve, reject) => {
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);

      for (const item of items) {
        const abs = safeJoin(ROOT_DIR, item.path);
        const name = path.basename(item.path);
        
        if (item.isFolder) {
          archive.directory(abs, name);
        } else {
          archive.file(abs, { name });
        }
      }

      archive.finalize();
    });

    res.json({ ok: true, message: `Created ${zipFileName}` });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ───── API: EXTRACT ZIP ─────
router.post('/api/unzip', express.json(), async (req, res) => {
  try {
    const { dir = '', file } = req.body || {};
    if (!file) throw new Error('Zip file path required');

    const absDir = safeJoin(ROOT_DIR, dir);
    const zipPath = safeJoin(ROOT_DIR, file);

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(absDir, true); // true = overwrite

    res.json({ ok: true, message: 'Extracted successfully' });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ───── API: PREVIEW FILE ─────
router.get('/api/preview', async (req, res) => {
  try {
    const filePath = (req.query.path || '').replace(/\\/g, '/');
    if (!filePath) throw new Error('Path required');

    const abs = safeJoin(ROOT_DIR, filePath);
    const stat = await fsp.stat(abs);
    
    if (stat.isDirectory()) {
      throw new Error('Cannot preview directory');
    }

    // Size limit for text files (5MB)
    if (stat.size > 5 * 1024 * 1024) {
      throw new Error('File too large for preview');
    }

    const mime = getMimeType(filePath);
    
    // Images - return URL
    if (mime.startsWith('image/')) {
      // Return base64 for small images
      const data = await fsp.readFile(abs);
      const base64 = data.toString('base64');
      res.json({ 
        ok: true, 
        type: 'image',
        mime,
        data: `data:${mime};base64,${base64}`,
        size: stat.size
      });
      return;
    }

    // Text files - return content
    const content = await fsp.readFile(abs, 'utf-8');
    res.json({ 
      ok: true, 
      type: 'text',
      mime,
      content,
      size: stat.size,
      name: path.basename(filePath)
    });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ───── API: SAVE FILE ─────
router.post('/api/save', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const { path: filePath, content } = req.body || {};
    if (!filePath) throw new Error('File path required');
    if (content === undefined) throw new Error('Content required');

    const abs = safeJoin(ROOT_DIR, filePath.replace(/\\/g, '/'));
    
    // Check if file exists and is not a directory
    try {
      const stat = await fsp.stat(abs);
      if (stat.isDirectory()) {
        throw new Error('Cannot edit a directory');
      }
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      // File doesn't exist, will create it
    }

    // Check file size (max 10MB for editing)
    const contentBuffer = Buffer.from(content, 'utf-8');
    if (contentBuffer.length > 10 * 1024 * 1024) {
      throw new Error('File too large to save (max 10MB)');
    }

    await fsp.writeFile(abs, contentBuffer, 'utf-8');
    
    res.json({ 
      ok: true, 
      message: 'File saved successfully',
      size: contentBuffer.length
    });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ───── API: SEARCH ─────
router.get('/api/search', async (req, res) => {
  try {
    const { dir = '', q = '' } = req.query;
    if (!q.trim()) throw new Error('Search query required');

    const absDir = safeJoin(ROOT_DIR, dir);
    const results = [];
    const searchTerm = q.toLowerCase();

    async function searchRecursive(currentPath, relPath) {
      const items = await fsp.readdir(currentPath, { withFileTypes: true });
      
      for (const item of items) {
        if (item.name.startsWith('.')) continue;

        const itemRel = relPath ? `${relPath}/${item.name}` : item.name;
        const itemAbs = path.join(currentPath, item.name);

        if (item.name.toLowerCase().includes(searchTerm)) {
          const stat = await fsp.stat(itemAbs);
          results.push({
            name: item.name,
            path: itemRel,
            isFolder: item.isDirectory(),
            size: stat.size,
            modified: stat.mtime,
            icon: item.isDirectory() ? 'folder' : getFileIcon(item.name)
          });
        }

        if (item.isDirectory()) {
          await searchRecursive(itemAbs, itemRel);
        }
      }
    }

    await searchRecursive(absDir, dir);
    res.json({ ok: true, results, count: results.length });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ───── API: GET FILE INFO ─────
router.get('/api/info', async (req, res) => {
  try {
    const filePath = (req.query.path || '').replace(/\\/g, '/');
    if (!filePath) throw new Error('Path required');

    const abs = safeJoin(ROOT_DIR, filePath);
    const stat = await fsp.stat(abs);
    const isFolder = stat.isDirectory();

    const info = {
      name: path.basename(filePath),
      path: filePath,
      isFolder,
      size: stat.size,
      sizeFormatted: isFolder ? '-' : formatSize(stat.size),
      created: stat.birthtime,
      modified: stat.mtime,
      accessed: stat.atime,
      permissions: (stat.mode & 0o777).toString(8)
    };

    if (isFolder) {
      const items = await fsp.readdir(abs);
      info.itemCount = items.filter(n => !n.startsWith('.')).length;
    }

    res.json({ ok: true, info });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

module.exports = router;

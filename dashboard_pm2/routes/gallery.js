const express = require("express");
const path = require("path");
const fs = require("fs").promises;
const multer = require("multer");
const { execSync } = require("child_process");

const router = express.Router();

const USERDATA = path.resolve(__dirname, "..", "..", "userdata");
const IMG_ROOT = path.join(USERDATA, "img");

// ─────────────────────────────────────────────────────────────────────────────
// Blocked file types (server-side)
const blockedExt = [
  ".js", ".mjs", ".cjs", ".php", ".asp", ".aspx", ".jsp", ".sh", ".bash", ".bat", ".cmd", ".ps1",
  ".exe", ".dll", ".so", ".bin", ".msi", ".com", ".env", ".json", ".lock", ".ini", ".conf", ".log",
  ".db", ".sqlite", ".pyc", ".o", ".class", ".jar", ".wasm", ".obj", ".7z", ".tar",
  ".gz", ".iso"
];

// ─────────────────────────────────────────────────────────────────────────────
// Multer Storage + File Filter
const storage = multer.diskStorage({
  destination: async (req, _file, cb) => {
    try {
      let sub = sanitizeRel(req.body.dir || req.query.dir || "");
      if (!sub && req.headers.referer) {
        const match = req.headers.referer.match(/[?&]dir=([^&]+)/);
        if (match) sub = decodeURIComponent(match[1]);
      }
      const dest = sub ? path.join(IMG_ROOT, sub) : IMG_ROOT;
      await fs.mkdir(dest, { recursive: true });
      cb(null, dest);
    } catch (e) {
      cb(e);
    }
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, "_");
    const uniqueSuffix = Math.floor(Math.random() * 10000); // optional small unique id
    cb(null, safeName.replace(/(\.[\w\d_-]+)$/i, `_${uniqueSuffix}$1`)); // logo_1234.png
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (blockedExt.includes(ext)) {
      return cb(new Error(`File type "${ext}" is not allowed for security reasons.`));
    }
    cb(null, true);
  },
  limits: {
    files: 15,
    fileSize: 100 * 1024 * 1024, // 100 MB per file
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
function sanitizeRel(input) {
  return String(input).replace(/(\.\.[/\\])/g, "").replace(/^[/\\]+/, "").trim();
}

function getFreeSpaceMB(dirPath) {
  try {
    const output = execSync(`df -Pm "${dirPath}" | awk 'NR==2 {print $4}'`)
      .toString()
      .trim();
    return parseInt(output, 10) || 0;
  } catch (err) {
    console.error("⚠️ Failed to get free space:", err.message);
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
router.get("/", async (req, res, next) => {
  try {
    const sub = sanitizeRel(req.query.dir || "");
    const fileRel = sanitizeRel(req.query.file || "");
    const baseFolder = sub ? path.join(IMG_ROOT, sub) : IMG_ROOT;
    const resolvedBase = path.resolve(baseFolder);
    if (!resolvedBase.startsWith(IMG_ROOT)) return res.status(400).send("Invalid path");

    const tree = await buildTree(IMG_ROOT);
    let selectedRel = fileRel || (await firstImageInFolder(resolvedBase));
    let selected = null;
    if (selectedRel) {
      selected = {
        rel: selectedRel,
        name: path.basename(selectedRel),
        folder: path.dirname(selectedRel),
      };
    }

    const createParent = sub ? path.dirname(sub) : "";
    res.render("gallery", {
      title: "Image Preview",
      tree,
      activeDir: sub || (selected ? selected.folder : ""),
      selected,
      createParent,
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Upload multiple files (max 15 files)
router.post("/upload", (req, res) => {
  upload.array("files", 15)(req, res, async (err) => {
    try {
      const dir = sanitizeRel(req.body.dir || req.query.dir || "");

      // Handle Multer or filter error
      if (err) {
        console.error("Upload error:", err.message);
        return res.json({ success: false, message: "❌ " + err.message });
      }

      // 1️⃣ Check free disk space
      const freeMB = getFreeSpaceMB(IMG_ROOT);
      if (freeMB < 500) {
        return res.json({
          success: false,
          message:
            "⚠️ Your Mei Cloud server does not have sufficient space. Please inform our Customer Support to add space.",
        });
      }

      // 2️⃣ Validate file presence
      if (!req.files || req.files.length === 0) {
        return res.json({ success: false, message: "No files uploaded." });
      }

      console.log(`📦 Uploaded ${req.files.length} file(s) to ${dir || "root"}`);
      res.json({ success: true, count: req.files.length });
    } catch (error) {
      console.error("Upload failed:", error.message);
      res.status(500).json({ success: false, message: "Upload failed." });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Folder + File management (same as before)
async function buildTree(root, base = "") {
  const dirents = await fs.readdir(root, { withFileTypes: true });
  const folders = [];
  const files = [];

  for (const d of dirents) {
    const full = path.join(root, d.name);
    if (d.isDirectory()) {
      const rel = path.join(base, d.name).split(path.sep).join("/");
      folders.push({
        type: "dir",
        name: d.name,
        rel,
        children: await buildTree(full, rel),
      });
    } else {
      const rel = path.join(base, d.name).split(path.sep).join("/");
      files.push({ type: "file", name: d.name, rel, folder: base });
    }
  }
  return [...folders, ...files];
}

async function firstImageInFolder(absFolder) {
  const dirents = await fs.readdir(absFolder, { withFileTypes: true });
  for (const d of dirents) {
    if (d.isFile()) {
      return path
        .relative(IMG_ROOT, path.join(absFolder, d.name))
        .split(path.sep)
        .join("/");
    }
  }
  return null;
}

// Delete / Rename / Folder routes
router.post("/delete", express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const rel = sanitizeRel(req.body.rel || "");
    const target = path.join(IMG_ROOT, rel);
    await fs.unlink(target);
    const folder = path.dirname(rel);
    res.redirect("/images" + (folder && folder !== "." ? "?dir=" + encodeURIComponent(folder) : ""));
  } catch {
    res.status(500).send("Delete failed");
  }
});

router.post("/folder/create", express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const parent = sanitizeRel(req.body.parent || "");
    const name = String(req.body.name || "").trim();
    if (!name || /[/\\]/.test(name))
      return res.send(`<script>alert("❌ Invalid folder name.");window.location.href="/images";</script>`);
    const relNewFolder = parent ? path.join(parent, name) : name;
    await fs.mkdir(path.join(IMG_ROOT, relNewFolder), { recursive: false });
    res.redirect("/images?dir=" + encodeURIComponent(relNewFolder));
  } catch {
    res.status(500).send("Create folder failed");
  }
});

router.post("/folder/delete", express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const rel = sanitizeRel(req.body.rel || "");
    if (!rel) return res.status(400).send("Cannot delete root");
    await fs.rm(path.join(IMG_ROOT, rel), { recursive: true, force: true });
    const parent = path.dirname(rel);
    res.redirect("/images" + (parent && parent !== "." ? "?dir=" + encodeURIComponent(parent) : ""));
  } catch {
    res.status(500).send("Delete folder failed");
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// Rename File or Folder
router.post("/rename", express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const rel = sanitizeRel(req.body.rel || ""); // old relative path
    const newName = String(req.body.newName || "").trim();

    if (!rel || !newName)
      return res.status(400).send("Missing parameters");

    if (/[/\\]/.test(newName))
      return res.status(400).send("❌ Invalid new name");

    const oldPath = path.join(IMG_ROOT, rel);
    const newPath = path.join(path.dirname(oldPath), newName);

    // prevent renaming outside img folder
    if (!oldPath.startsWith(IMG_ROOT) || !newPath.startsWith(IMG_ROOT))
      return res.status(400).send("Invalid path");

    await fs.rename(oldPath, newPath);

    // ✅ Automatically select the renamed file
    const newRel = path.join(path.dirname(rel), newName).split(path.sep).join("/");
    const folder = path.dirname(newRel);
    res.redirect(
      "/images?dir=" +
        encodeURIComponent(folder) +
        "&file=" +
        encodeURIComponent(newRel)
    );
  } catch (err) {
    console.error("Rename failed:", err.message);
    res.status(500).send("Rename failed");
  }
});



router.post("/folder/rename", express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const rel = sanitizeRel(req.body.rel || "");
    const newName = String(req.body.newName || "").trim();

    if (!rel || !newName)
      return res.status(400).send("Missing parameters");

    if (/[/\\]/.test(newName))
      return res.status(400).send("❌ Invalid new name");

    const oldPath = path.join(IMG_ROOT, rel);
    const newPath = path.join(path.dirname(oldPath), newName);

    if (!oldPath.startsWith(IMG_ROOT) || !newPath.startsWith(IMG_ROOT))
      return res.status(400).send("Invalid path");

    await fs.rename(oldPath, newPath);

    // ✅ Auto select/open the renamed folder
    const newRel = path.join(path.dirname(rel), newName);
    res.redirect("/images?dir=" + encodeURIComponent(newRel));
  } catch (err) {
    console.error("Folder rename failed:", err.message);
    res.status(500).send("Folder rename failed");
  }
});



router.get(/^\/media\/(.+)/, async (req, res) => {
  try {
    const rel = req.params[0];
    const abs = path.join(IMG_ROOT, rel);
    const resolved = path.resolve(abs);

    // 🔒 Security check
    if (!resolved.startsWith(IMG_ROOT))
      return res.status(400).send("Invalid file path");

    if (!fs.existsSync(resolved))
      return res.status(404).send("File not found");

    const ext = path.extname(resolved).toLowerCase();
    const basename = path.basename(resolved);

    // 🚫 Blocked extensions
    const blocked = [
      ".js", ".mjs", ".php", ".asp", ".aspx", ".jsp", ".sh", ".bat", ".cmd",
      ".ps1", ".exe", ".dll", ".so", ".bin", ".msi", ".com", ".jar"
    ];
    if (blocked.includes(ext))
      return res.status(403).send("Access to this file type is blocked.");

    // 🧠 Basic MIME map (common types)
    const mimeMap = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".bmp": "image/bmp",
      ".svg": "image/svg+xml",
      ".pdf": "application/pdf",
      ".txt": "text/plain; charset=utf-8",
      ".csv": "text/csv; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".xml": "application/xml; charset=utf-8",
      ".html": "text/html; charset=utf-8",
      ".htm": "text/html; charset=utf-8",
      ".mp4": "video/mp4",
      ".webm": "video/webm",
      ".ogg": "video/ogg",
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".zip": "application/zip",
      ".rar": "application/vnd.rar",
      ".7z": "application/x-7z-compressed",
      ".doc": "application/msword",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".xls": "application/vnd.ms-excel",
      ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".ppt": "application/vnd.ms-powerpoint",
      ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    };

    const contentType = mimeMap[ext] || "application/octet-stream";

    // ✅ Inline only for safe, viewable types
    const inlineSafe = [
      "image/", "video/", "audio/", "text/", "application/pdf",
      "application/json", "application/xml", "application/xhtml+xml"
    ];
    const shouldInline = inlineSafe.some(type => contentType.startsWith(type));

    // 🧾 Headers
    res.setHeader("Content-Type", contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    const forceDownload = req.query.download === "1";

    res.setHeader(
      "Content-Disposition",
      forceDownload
        ? `attachment; filename="${basename}"`
        : `inline; filename="${basename}"`
    );


    // 📤 Stream file
    fs.createReadStream(resolved).pipe(res);
  } catch (err) {
    console.error("Media route error:", err);
    res.status(500).send("Internal Server Error");
  }
});


module.exports = router;

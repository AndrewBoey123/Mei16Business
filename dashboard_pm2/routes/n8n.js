const express = require('express');
const router = express.Router();
const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------
// SAFE OpenAI loader 
// ---------------------------------------------------------
let OpenAI = null;
try {
  OpenAI = require("openai");
} catch (err) {
  console.log("⚠ openai package not installed. RAG features disabled.");
}


// ---------------------------------------------------------
// LOAD ENV (.env inside userdata)
// ---------------------------------------------------------
require("dotenv").config({
  path: path.resolve(__dirname, "../../userdata/.env"),
  override: true
});

// SERIAL_ID removed - open source version

// ---------------------------------------------------------
// SAFE OpenAI initializer
// ---------------------------------------------------------
function getOpenAI() {
  const key = process.env.openaiApi;
  if (!key) throw new Error("Missing OpenAI API Key");
  return new OpenAI({ apiKey: key });
}

// ---------------------------------------------------------
// Chunking function
// ---------------------------------------------------------
function chunkText(text, chunkSize = 500, overlap = 50) {
  const words = text.split(" ");
  const chunks = [];
  let start = 0;

  while (start < words.length) {
    const end = start + chunkSize;
    const chunk = words.slice(start, end).join(" ").trim();
    if (chunk) chunks.push(chunk);

    start += chunkSize - overlap;
  }

  return chunks;
}

// ---------------------------------------------------------
// Core RAG generator (dynamic)
// ---------------------------------------------------------
async function textToRagJSON(TEXT_FILE, RAG_FILE) {
  console.log("📘 Reading:", TEXT_FILE);

  const text = fs.readFileSync(TEXT_FILE, "utf8");
  const chunks = chunkText(text);

  console.log(`📘 Total chunks: ${chunks.length}`);

  const ragData = [];

  for (let i = 0; i < chunks.length; i++) {
    console.log(`➡ Embedding ${i + 1}/${chunks.length}`);

    const openai = getOpenAI();

    const embeddingRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: chunks[i]
    });

    ragData.push({
      id: i,
      text: chunks[i],
      vector: embeddingRes.data[0].embedding,
      title: chunks[i].split(" ").slice(0, 7).join(" ")
    });

    // Save progress
    if ((i + 1) % 5 === 0 || i === chunks.length - 1) {
      fs.writeFileSync(RAG_FILE, JSON.stringify(ragData, null, 2));
      console.log(`💾 Saved at ${i + 1} chunks`);
    }
  }

  console.log("🟩 RAG complete");
  return ragData;
}

// ---------------------------------------------------------
// TEST ENDPOINT
// ---------------------------------------------------------
router.get('/test', (req, res) => {
  res.send("Auto RAG route operational");
});
// ---------------------------------------------------------
// MAIN ENDPOINT: GET /rag-create/create
// MATCHES N8N EXACTLY
// ---------------------------------------------------------
router.get('/rag-create', async (req, res) => {
  try {

    // -----------------------------------------------------
    // PREVENT CRASH IF OPENAI MODULE IS NOT INSTALLED
    // -----------------------------------------------------
    if (!OpenAI) {
      return res.status(500).json({
        success: false,
        error: "OpenAI module is not installed. Please install: npm install openai"
      });
    }

    console.log("🟦 /rag-create/create triggered");

    // GET query from n8n node
    const inputFile = String(req.query.inputFile || "").trim();
    const outputFile = String(req.query.outputFile || "").trim();

    if (!inputFile || !outputFile) {
      return res.status(400).json({
        success: false,
        error: "Missing inputFile and outputFile query parameters"
      });
    }

    // Resolve full paths inside userdata
    const TEXT_FILE = path.join(__dirname, "../../userdata/text", inputFile);
    const RAG_FILE = path.join(__dirname, "../../userdata/vectordb", outputFile);

    // Validate input file exists
    if (!fs.existsSync(TEXT_FILE)) {
      return res.status(404).json({
        success: false,
        error: "Input text file not found: " + inputFile
      });
    }

    // Validate OpenAI key first
    try {
      const o = getOpenAI();
      await o.embeddings.create({
        model: "text-embedding-3-small",
        input: "test"
      });
    } catch (err) {
      return res.status(400).json({
        success: false,
        error: "Invalid OpenAI API Key",
        details: err.message
      });
    }

    // Run RAG async in background
    textToRagJSON(TEXT_FILE, RAG_FILE)
      .then(() => console.log(`🟩 RAG generated: ${RAG_FILE}`))
      .catch(err => console.error("❌ RAG failed:", err));

    // Return immediately
    return res.json({
      success: true,
      message: "RAG generation started",
      inputFile,
      outputFile
    });

  } catch (err) {
    console.error("❌ /rag-create/create error:", err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;

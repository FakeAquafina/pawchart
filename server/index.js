require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const { createWorker } = require("tesseract.js");
const { fromPath } = require("pdf2pic");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

const app = express();
const PORT = process.env.PORT || 3456;
const DB_PATH = process.env.DB_PATH || "./pawchart.db";
const UPLOADS_DIR = process.env.UPLOADS_DIR || "./uploads";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2:3b";

// ── Setup ──────────────────────────────────────────────────────────────────
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ── Schema ─────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS pets (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    type       TEXT    NOT NULL DEFAULT 'dog',
    breed      TEXT,
    birthdate  TEXT,
    created_at TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS records (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    pet_id        INTEGER REFERENCES pets(id) ON DELETE SET NULL,
    pet_name      TEXT,
    visit_date    TEXT,
    clinic        TEXT,
    vet           TEXT,
    services      TEXT,
    medications   TEXT,
    total_cost    TEXT,
    notes         TEXT,
    reminder_date TEXT,
    source_file   TEXT,
    raw_ocr_text  TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reminders (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id   INTEGER REFERENCES records(id) ON DELETE CASCADE,
    pet_id      INTEGER REFERENCES pets(id) ON DELETE CASCADE,
    pet_name    TEXT,
    due_date    TEXT NOT NULL,
    label       TEXT,
    dismissed   INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now'))
  );
`);

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "*" }));
app.use(express.json());
app.use("/uploads", express.static(UPLOADS_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
    cb(null, allowed.includes(file.mimetype));
  },
});

// ── Helpers ────────────────────────────────────────────────────────────────
const REMINDER_INTERVALS = {
  "annual exam": 365, "wellness exam": 365, "yearly exam": 365,
  "rabies": 365, "distemper": 365, "bordetella": 180, "leptospirosis": 365,
  "heartworm test": 365, "flea": 30, "tick": 30, "flea & tick": 30,
  "dental": 180, "teeth cleaning": 180, "deworming": 90,
  "vaccine": 365, "vaccination": 365, "booster": 365,
  "bloodwork": 365, "urinalysis": 365,
};

function getReminderDays(services = []) {
  let minDays = null;
  for (const svc of services) {
    const lower = svc.toLowerCase();
    for (const [key, days] of Object.entries(REMINDER_INTERVALS)) {
      if (lower.includes(key)) {
        if (minDays === null || days < minDays) minDays = days;
      }
    }
  }
  return minDays;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

// ── OCR: Extract text from image or PDF ───────────────────────────────────
async function extractTextFromFile(filePath, mimeType) {
  let imagePath = filePath;
  let tempFile = null;

  // Convert first page of PDF to an image for Tesseract
  if (mimeType === "application/pdf") {
    const converter = fromPath(filePath, {
      density: 200,
      saveFilename: `ocr_${Date.now()}`,
      savePath: UPLOADS_DIR,
      format: "png",
      width: 2000,
    });
    const result = await converter(1);
    imagePath = result.path;
    tempFile = imagePath;
  }

  const worker = await createWorker("eng");
  try {
    const { data: { text } } = await worker.recognize(imagePath);
    return text;
  } finally {
    await worker.terminate();
    if (tempFile) fs.unlink(tempFile, () => {});
  }
}

// ── Ollama: Parse raw OCR text into structured JSON ───────────────────────
async function parseWithOllama(rawText) {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      format: "json",
      options: {
        temperature: 0.0,
        num_predict: 512,
      },
      messages: [
        {
          role: "system",
          content: "You are a JSON extraction API. You only output valid JSON. No explanations, no markdown, no extra text. Only a raw JSON object.",
        },
        {
          role: "user",
          content: [
            "Extract veterinary visit information from this OCR text.",
            "Return ONLY this JSON structure, replacing null with found values:",
            "",
            '{"petName":null,"petType":null,"visitDate":null,"clinic":null,"vet":null,"services":[],"medications":[],"totalCost":null,"notes":null}',
            "",
            "Rules:",
            "- petType must be dog, cat, other, or null",
            "- visitDate must be YYYY-MM-DD format or null",
            "- services and medications must be arrays of strings",
            "- totalCost must include the $ sign or be null",
            "",
            "OCR TEXT:",
            rawText,
          ].join("\n"),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const text = data.message?.content || "";
  const cleaned = text.replace(/```json|```/g, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in Ollama response");
  return JSON.parse(jsonMatch[0]);
}
// ── Pet Routes ─────────────────────────────────────────────────────────────
app.get("/api/pets", (req, res) => {
  res.json(db.prepare("SELECT * FROM pets ORDER BY name").all());
});

app.post("/api/pets", (req, res) => {
  const { name, type = "dog", breed, birthdate } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Name required" });
  const result = db.prepare(
    "INSERT INTO pets (name, type, breed, birthdate) VALUES (?, ?, ?, ?)"
  ).run(name.trim(), type, breed || null, birthdate || null);
  res.status(201).json(db.prepare("SELECT * FROM pets WHERE id=?").get(result.lastInsertRowid));
});

app.put("/api/pets/:id", (req, res) => {
  const { name, type, breed, birthdate } = req.body;
  db.prepare("UPDATE pets SET name=?, type=?, breed=?, birthdate=? WHERE id=?")
    .run(name, type, breed || null, birthdate || null, req.params.id);
  res.json(db.prepare("SELECT * FROM pets WHERE id=?").get(req.params.id));
});

app.delete("/api/pets/:id", (req, res) => {
  db.prepare("DELETE FROM pets WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ── Record Routes ──────────────────────────────────────────────────────────
app.get("/api/records", (req, res) => {
  const { pet_id } = req.query;
  const rows = pet_id
    ? db.prepare("SELECT * FROM records WHERE pet_id=? ORDER BY visit_date DESC").all(pet_id)
    : db.prepare("SELECT * FROM records ORDER BY visit_date DESC").all();
  res.json(rows.map(r => ({
    ...r,
    services: JSON.parse(r.services || "[]"),
    medications: JSON.parse(r.medications || "[]"),
  })));
});

app.post("/api/records", (req, res) => {
  const { pet_id, pet_name, visit_date, clinic, vet, services = [],
    medications = [], total_cost, notes, source_file, raw_ocr_text } = req.body;

  const reminderDays = getReminderDays(services);
  const reminder_date = reminderDays && visit_date ? addDays(visit_date, reminderDays) : null;

  const result = db.prepare(`
    INSERT INTO records (pet_id, pet_name, visit_date, clinic, vet, services, medications,
      total_cost, notes, reminder_date, source_file, raw_ocr_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    pet_id || null, pet_name || null, visit_date || null, clinic || null, vet || null,
    JSON.stringify(services), JSON.stringify(medications),
    total_cost || null, notes || null, reminder_date, source_file || null, raw_ocr_text || null
  );

  const record = db.prepare("SELECT * FROM records WHERE id=?").get(result.lastInsertRowid);

  if (reminder_date) {
    db.prepare(`INSERT INTO reminders (record_id, pet_id, pet_name, due_date, label) VALUES (?, ?, ?, ?, ?)`)
      .run(record.id, pet_id || null, pet_name || null, reminder_date, services[0] || "Follow-up");
  }

  res.status(201).json({
    ...record,
    services: JSON.parse(record.services || "[]"),
    medications: JSON.parse(record.medications || "[]"),
  });
});

app.delete("/api/records/:id", (req, res) => {
  db.prepare("DELETE FROM records WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ── Reminder Routes ────────────────────────────────────────────────────────
app.get("/api/reminders", (req, res) => {
  res.json(db.prepare(`
    SELECT r.*, p.name as pet_display_name, p.type as pet_type
    FROM reminders r LEFT JOIN pets p ON r.pet_id = p.id
    WHERE r.dismissed = 0 ORDER BY r.due_date ASC
  `).all());
});

app.patch("/api/reminders/:id/dismiss", (req, res) => {
  db.prepare("UPDATE reminders SET dismissed=1 WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ── Scan Route: Tesseract → Ollama ─────────────────────────────────────────
app.post("/api/scan", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const filePath = req.file.path;
  const mimeType = req.file.mimetype;

  try {
    console.log(`[scan] OCR: ${req.file.filename}`);
    const rawText = await extractTextFromFile(filePath, mimeType);

    if (!rawText || rawText.trim().length < 20) {
      return res.status(422).json({
        error: "Could not read text from this file. Try a clearer, well-lit photo.",
      });
    }

    console.log(`[scan] OCR done (${rawText.length} chars). Parsing with Ollama...`);
    const extracted = await parseWithOllama(rawText);
    console.log(`[scan] Done.`);

    res.json({
      ...extracted,
      sourceFile: req.file.filename,
      rawOcrText: rawText,
    });

  } catch (err) {
    console.error("[scan] Error:", err.message);
    res.status(500).json({ error: "Failed to process receipt: " + err.message });
  }
});

// ── Health Check ───────────────────────────────────────────────────────────
app.get("/api/health", async (req, res) => {
  let ollamaStatus = "unreachable";
  let modelLoaded = null;
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (r.ok) {
      const data = await r.json();
      ollamaStatus = "ok";
      modelLoaded = data.models?.find(m => m.name.startsWith(OLLAMA_MODEL.split(":")[0]))?.name || null;
    }
  } catch { /* unreachable */ }

  res.json({
    status: "ok",
    version: "2.0.0",
    mode: "local — Tesseract OCR + Ollama",
    ollama: { status: ollamaStatus, url: OLLAMA_URL, model: OLLAMA_MODEL, modelLoaded },
  });
});

// ── Serve Frontend ─────────────────────────────────────────────────────────
const FRONTEND = path.join(__dirname, "public");
if (fs.existsSync(FRONTEND)) {
  app.use(express.static(FRONTEND));
  app.get("*", (req, res) => res.sendFile(path.join(FRONTEND, "index.html")));
}

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`PawChart API  →  http://0.0.0.0:${PORT}`);
  console.log(`Mode          →  Tesseract OCR + Ollama (${OLLAMA_MODEL})`);
  console.log(`Ollama        →  ${OLLAMA_URL}`);
});

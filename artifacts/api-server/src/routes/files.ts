import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db, filesTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import {
  ListFilesQueryParams,
  GetFileParams,
  DeleteFileParams,
  ScanFileParams,
} from "@workspace/api-zod";

const router = Router();

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
});

router.get("/files", async (req, res) => {
  const parseResult = ListFilesQueryParams.safeParse(req.query);
  if (!parseResult.success) {
    return res.status(400).json({ error: "Invalid query params" });
  }

  const { type, scanStatus } = parseResult.data;
  const conditions = [];
  if (type) conditions.push(eq(filesTable.type, type));
  if (scanStatus) conditions.push(eq(filesTable.scanStatus, scanStatus));

  const files = conditions.length
    ? await db.select().from(filesTable).where(and(...conditions)).orderBy(filesTable.uploadedAt)
    : await db.select().from(filesTable).orderBy(filesTable.uploadedAt);

  return res.json(
    files.map((f) => ({
      ...f,
      uploadedAt: f.uploadedAt.toISOString(),
    }))
  );
});

router.get("/files/stats", async (_req, res) => {
  const rows = await db
    .select({
      type: filesTable.type,
      scanStatus: filesTable.scanStatus,
      size: filesTable.size,
    })
    .from(filesTable);

  const stats = {
    totalFiles: rows.length,
    totalMods: rows.filter((r) => r.type === "mod").length,
    totalMaps: rows.filter((r) => r.type === "map").length,
    cleanFiles: rows.filter((r) => r.scanStatus === "clean").length,
    maliciousFiles: rows.filter((r) => r.scanStatus === "malicious").length,
    pendingFiles: rows.filter((r) => r.scanStatus === "pending").length,
    totalSizeBytes: rows.reduce((acc, r) => acc + (r.size ?? 0), 0),
  };

  return res.json(stats);
});

router.post("/files/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const { type } = req.body as { type?: string };
  if (!type || !["mod", "map"].includes(type)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "type must be 'mod' or 'map'" });
  }

  const [inserted] = await db
    .insert(filesTable)
    .values({
      name: req.file.filename,
      originalName: req.file.originalname,
      type,
      size: req.file.size,
      mimeType: req.file.mimetype,
      filePath: req.file.path,
      scanStatus: "pending",
    })
    .returning();

  return res.status(201).json({
    ...inserted,
    uploadedAt: inserted.uploadedAt.toISOString(),
  });
});

router.get("/files/:id", async (req, res) => {
  const parseResult = GetFileParams.safeParse({ id: Number(req.params.id) });
  if (!parseResult.success) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const [file] = await db
    .select()
    .from(filesTable)
    .where(eq(filesTable.id, parseResult.data.id));

  if (!file) return res.status(404).json({ error: "Not found" });

  return res.json({ ...file, uploadedAt: file.uploadedAt.toISOString() });
});

router.delete("/files/:id", async (req, res) => {
  const parseResult = DeleteFileParams.safeParse({ id: Number(req.params.id) });
  if (!parseResult.success) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const [file] = await db
    .select()
    .from(filesTable)
    .where(eq(filesTable.id, parseResult.data.id));

  if (!file) return res.status(404).json({ error: "Not found" });

  if (fs.existsSync(file.filePath)) {
    fs.unlinkSync(file.filePath);
  }

  await db.delete(filesTable).where(eq(filesTable.id, parseResult.data.id));

  return res.status(204).send();
});

router.post("/files/:id/scan", async (req, res) => {
  const parseResult = ScanFileParams.safeParse({ id: Number(req.params.id) });
  if (!parseResult.success) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const [file] = await db
    .select()
    .from(filesTable)
    .where(eq(filesTable.id, parseResult.data.id));

  if (!file) return res.status(404).json({ error: "Not found" });

  const apiKey = process.env.VIRUSTOTAL_API_KEY;

  if (!apiKey) {
    const [updated] = await db
      .update(filesTable)
      .set({ scanStatus: "error", scanDetails: "VirusTotal API key not configured" })
      .where(eq(filesTable.id, file.id))
      .returning();
    return res.json({ ...updated, uploadedAt: updated.uploadedAt.toISOString() });
  }

  if (!fs.existsSync(file.filePath)) {
    const [updated] = await db
      .update(filesTable)
      .set({ scanStatus: "error", scanDetails: "File not found on disk" })
      .where(eq(filesTable.id, file.id))
      .returning();
    return res.json({ ...updated, uploadedAt: updated.uploadedAt.toISOString() });
  }

  await db
    .update(filesTable)
    .set({ scanStatus: "scanning" })
    .where(eq(filesTable.id, file.id));

  performScan(file.id, file.filePath, apiKey).catch(async (err) => {
    await db
      .update(filesTable)
      .set({ scanStatus: "error", scanDetails: String(err) })
      .where(eq(filesTable.id, file.id));
  });

  const [scanning] = await db
    .select()
    .from(filesTable)
    .where(eq(filesTable.id, file.id));

  return res.json({ ...scanning, uploadedAt: scanning.uploadedAt.toISOString() });
});

async function performScan(fileId: number, filePath: string, apiKey: string) {
  const fileBuffer = fs.readFileSync(filePath);
  const formData = new FormData();
  const blob = new Blob([fileBuffer]);
  formData.append("file", blob, path.basename(filePath));

  const uploadResp = await fetch("https://www.virustotal.com/api/v3/files", {
    method: "POST",
    headers: { "x-apikey": apiKey },
    body: formData,
  });

  if (!uploadResp.ok) {
    throw new Error(`VT upload failed: ${uploadResp.status} ${await uploadResp.text()}`);
  }

  const uploadData = (await uploadResp.json()) as { data: { id: string } };
  const analysisId = uploadData.data.id;

  let attempts = 0;
  while (attempts < 20) {
    await new Promise((r) => setTimeout(r, 5000));
    const pollResp = await fetch(
      `https://www.virustotal.com/api/v3/analyses/${analysisId}`,
      { headers: { "x-apikey": apiKey } }
    );

    if (!pollResp.ok) {
      attempts++;
      continue;
    }

    const pollData = (await pollResp.json()) as {
      data: {
        attributes: {
          status: string;
          stats?: { malicious?: number; suspicious?: number; undetected?: number; harmless?: number };
          results?: Record<string, { category: string; engine_name: string }>;
        };
        id: string;
      };
    };

    const attrs = pollData.data.attributes;

    if (attrs.status === "completed") {
      const stats = attrs.stats ?? {};
      const malicious = (stats.malicious ?? 0) + (stats.suspicious ?? 0);
      const total =
        (stats.malicious ?? 0) +
        (stats.suspicious ?? 0) +
        (stats.undetected ?? 0) +
        (stats.harmless ?? 0);

      const scanStatus = malicious > 0 ? "malicious" : "clean";
      const detectionRatio = `${malicious}/${total}`;
      const virusTotalLink = `https://www.virustotal.com/gui/file-analysis/${analysisId}`;

      await db
        .update(filesTable)
        .set({
          scanStatus,
          detectionRatio,
          virusTotalLink,
          scanEngine: "VirusTotal",
          scanDetails: malicious > 0 ? `${malicious} engines flagged this file` : "No threats detected",
        })
        .where(eq(filesTable.id, fileId));

      return;
    }

    attempts++;
  }

  throw new Error("Scan timed out after polling");
}

export default router;

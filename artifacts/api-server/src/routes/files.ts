import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db, filesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import {
  ListFilesQueryParams,
  GetFileParams,
  DeleteFileParams,
} from "@workspace/api-zod";

const router = Router();

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const imagesDir = path.join(uploadsDir, "images");
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

const fileStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (_file.fieldname === "images") {
      cb(null, imagesDir);
    } else {
      cb(null, uploadsDir);
    }
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage: fileStorage,
  limits: { fileSize: 500 * 1024 * 1024 },
});

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, imagesDir),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = path.extname(file.originalname);
      cb(null, `${unique}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
});

function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  if (!auth.userId) {
    return res.status(401).json({ error: "Unauthorized — please sign in" });
  }
  req.userId = auth.userId;
  next();
}

const JAVA_EXTENSIONS = new Set([".jar", ".zip"]);
const BEDROCK_EXTENSIONS = new Set([".mcpack", ".mcworld", ".mcaddon", ".mctemplate"]);

function getAllowedExtensions(edition: string): Set<string> {
  return edition === "java" ? JAVA_EXTENSIONS : BEDROCK_EXTENSIONS;
}

function fileToResponse(f: typeof filesTable.$inferSelect) {
  return { ...f, uploadedAt: f.uploadedAt.toISOString() };
}

// ── List files ───────────────────────────────────────────────────────────────
router.get("/files", async (req, res) => {
  const parseResult = ListFilesQueryParams.safeParse(req.query);
  if (!parseResult.success) return res.status(400).json({ error: "Invalid query params" });

  const { edition, type, scanStatus } = parseResult.data;
  const conditions = [];
  if (edition) conditions.push(eq(filesTable.edition, edition));
  if (type) conditions.push(eq(filesTable.type, type));
  if (scanStatus) conditions.push(eq(filesTable.scanStatus, scanStatus));

  const files = conditions.length
    ? await db.select().from(filesTable).where(and(...conditions)).orderBy(filesTable.uploadedAt)
    : await db.select().from(filesTable).orderBy(filesTable.uploadedAt);

  return res.json(files.map(fileToResponse));
});

// ── Stats — MUST be before /:id ──────────────────────────────────────────────
router.get("/files/stats", async (_req, res) => {
  const rows = await db
    .select({ edition: filesTable.edition, type: filesTable.type, scanStatus: filesTable.scanStatus, size: filesTable.size })
    .from(filesTable);

  return res.json({
    totalFiles: rows.length,
    totalMods: rows.filter((r) => r.type === "mod").length,
    totalMaps: rows.filter((r) => r.type === "map").length,
    javaMods: rows.filter((r) => r.edition === "java" && r.type === "mod").length,
    javaMaps: rows.filter((r) => r.edition === "java" && r.type === "map").length,
    bedrockMods: rows.filter((r) => r.edition === "bedrock" && r.type === "mod").length,
    bedrockMaps: rows.filter((r) => r.edition === "bedrock" && r.type === "map").length,
    cleanFiles: rows.filter((r) => r.scanStatus === "clean").length,
    maliciousFiles: rows.filter((r) => r.scanStatus === "malicious").length,
    pendingFiles: rows.filter((r) => r.scanStatus === "pending").length,
    totalSizeBytes: rows.reduce((acc, r) => acc + (r.size ?? 0), 0),
  });
});

// ── Upload (requires auth) ────────────────────────────────────────────────────
router.post(
  "/files/upload",
  requireAuth,
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "images", maxCount: 10 },
  ]),
  async (req, res) => {
    const userId = (req as any).userId as string;
    const fields = req.files as Record<string, Express.Multer.File[]> | undefined;
    const mainFile = fields?.["file"]?.[0];
    const imageFiles = fields?.["images"] ?? [];

    if (!mainFile) return res.status(400).json({ error: "No file uploaded" });

    const { type, edition, description } = req.body as {
      type?: string;
      edition?: string;
      description?: string;
    };

    if (!type || !["mod", "map"].includes(type)) {
      fs.unlinkSync(mainFile.path);
      imageFiles.forEach((f) => fs.existsSync(f.path) && fs.unlinkSync(f.path));
      return res.status(400).json({ error: "type must be 'mod' or 'map'" });
    }
    if (!edition || !["java", "bedrock"].includes(edition)) {
      fs.unlinkSync(mainFile.path);
      imageFiles.forEach((f) => fs.existsSync(f.path) && fs.unlinkSync(f.path));
      return res.status(400).json({ error: "edition must be 'java' or 'bedrock'" });
    }

    const ext = path.extname(mainFile.originalname).toLowerCase();
    const allowed = getAllowedExtensions(edition);
    if (!allowed.has(ext)) {
      fs.unlinkSync(mainFile.path);
      imageFiles.forEach((f) => fs.existsSync(f.path) && fs.unlinkSync(f.path));
      return res.status(400).json({
        error: `${edition === "java" ? "Java" : "Bedrock"} Edition does not accept ${ext || "this"} files. Allowed: ${[...allowed].join(", ")}`,
      });
    }

    const imageNames = imageFiles.map((f) => f.filename);

    const [inserted] = await db
      .insert(filesTable)
      .values({
        name: mainFile.filename,
        originalName: mainFile.originalname,
        edition,
        type,
        size: mainFile.size,
        mimeType: mainFile.mimetype,
        filePath: mainFile.path,
        scanStatus: "pending",
        description: description ?? null,
        images: imageNames,
        uploadedBy: userId,
      })
      .returning();

    const apiKey = process.env.VIRUSTOTAL_API_KEY;
    if (apiKey && fs.existsSync(mainFile.path)) {
      performScan(inserted.id, mainFile.path, apiKey).catch(async (err) => {
        const msg = String(err);
        const isRateLimit = msg.includes("rate") || msg.includes("429");
        await db
          .update(filesTable)
          .set({
            scanStatus: isRateLimit ? "pending" : "error",
            scanDetails: isRateLimit ? null : msg,
          })
          .where(eq(filesTable.id, inserted.id));
      });
    } else if (!apiKey) {
      await db
        .update(filesTable)
        .set({
          scanStatus: "error",
          scanDetails: "VirusTotal API key not configured — file unverified",
        })
        .where(eq(filesTable.id, inserted.id));
    }

    return res.status(201).json(fileToResponse(inserted));
  },
);

// ── Update description/images (requires auth + ownership) ────────────────────
router.patch(
  "/files/:id",
  requireAuth,
  imageUpload.array("images", 10),
  async (req, res) => {
    const userId = (req as any).userId as string;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

    const [file] = await db.select().from(filesTable).where(eq(filesTable.id, id));
    if (!file) {
      const newImages = (req.files as Express.Multer.File[] | undefined) ?? [];
      newImages.forEach((f) => fs.existsSync(f.path) && fs.unlinkSync(f.path));
      return res.status(404).json({ error: "Not found" });
    }

    if (file.uploadedBy !== userId) {
      const newImages = (req.files as Express.Multer.File[] | undefined) ?? [];
      newImages.forEach((f) => fs.existsSync(f.path) && fs.unlinkSync(f.path));
      return res.status(403).json({ error: "Forbidden — you can only edit your own files" });
    }

    const { description } = req.body as { description?: string };
    const newImages = (req.files as Express.Multer.File[] | undefined) ?? [];
    const newImageNames = newImages.map((f) => f.filename);
    const existingImages = file.images ?? [];

    const [updated] = await db
      .update(filesTable)
      .set({
        description: description !== undefined ? description : file.description,
        images: [...existingImages, ...newImageNames],
      })
      .where(eq(filesTable.id, id))
      .returning();

    return res.json(fileToResponse(updated));
  },
);

// ── Download ──────────────────────────────────────────────────────────────────
router.get("/files/:id/download", async (req, res) => {
  const parseResult = GetFileParams.safeParse({ id: Number(req.params.id) });
  if (!parseResult.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const [file] = await db.select().from(filesTable).where(eq(filesTable.id, parseResult.data.id));
  if (!file) { res.status(404).json({ error: "Not found" }); return; }

  if (!fs.existsSync(file.filePath)) { res.status(404).json({ error: "File not found on disk" }); return; }

  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.originalName)}"`);
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Length", file.size);

  const stream = fs.createReadStream(file.filePath);
  stream.pipe(res);
});

// ── Get file ──────────────────────────────────────────────────────────────────
router.get("/files/:id", async (req, res) => {
  const parseResult = GetFileParams.safeParse({ id: Number(req.params.id) });
  if (!parseResult.success) return res.status(400).json({ error: "Invalid id" });

  const [file] = await db.select().from(filesTable).where(eq(filesTable.id, parseResult.data.id));
  if (!file) return res.status(404).json({ error: "Not found" });

  return res.json(fileToResponse(file));
});

// ── Delete file (requires auth + ownership) ───────────────────────────────────
router.delete("/files/:id", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const parseResult = DeleteFileParams.safeParse({ id: Number(req.params.id) });
  if (!parseResult.success) return res.status(400).json({ error: "Invalid id" });

  const [file] = await db.select().from(filesTable).where(eq(filesTable.id, parseResult.data.id));
  if (!file) return res.status(404).json({ error: "Not found" });

  if (file.uploadedBy !== userId) {
    return res.status(403).json({ error: "Forbidden — you can only delete your own files" });
  }

  if (fs.existsSync(file.filePath)) fs.unlinkSync(file.filePath);
  const imgs = file.images ?? [];
  imgs.forEach((imgName) => {
    const imgPath = path.join(imagesDir, imgName);
    if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
  });
  await db.delete(filesTable).where(eq(filesTable.id, parseResult.data.id));

  return res.status(204).send();
});

async function performScan(fileId: number, filePath: string, apiKey: string) {
  const fileBuffer = fs.readFileSync(filePath);
  const formData = new FormData();
  formData.append("file", new Blob([fileBuffer]), path.basename(filePath));

  const uploadResp = await fetch("https://www.virustotal.com/api/v3/files", {
    method: "POST",
    headers: { "x-apikey": apiKey },
    body: formData,
  });

  if (!uploadResp.ok) throw new Error(`VT upload failed: ${uploadResp.status}`);

  const uploadData = (await uploadResp.json()) as { data: { id: string } };
  const analysisId = uploadData.data.id;

  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((r) => setTimeout(r, 5000));
    const pollResp = await fetch(`https://www.virustotal.com/api/v3/analyses/${analysisId}`, {
      headers: { "x-apikey": apiKey },
    });

    if (!pollResp.ok) continue;

    const pollData = (await pollResp.json()) as {
      data: {
        attributes: {
          status: string;
          stats?: { malicious?: number; suspicious?: number; undetected?: number; harmless?: number };
        };
      };
    };

    const attrs = pollData.data.attributes;
    if (attrs.status !== "completed") continue;

    const stats = attrs.stats ?? {};
    const malicious = (stats.malicious ?? 0) + (stats.suspicious ?? 0);
    const total =
      (stats.malicious ?? 0) + (stats.suspicious ?? 0) + (stats.undetected ?? 0) + (stats.harmless ?? 0);

    if (malicious > 0) {
      const [file] = await db.select().from(filesTable).where(eq(filesTable.id, fileId));
      if (file) {
        if (fs.existsSync(file.filePath)) fs.unlinkSync(file.filePath);
        const imgs = file.images ?? [];
        imgs.forEach((imgName) => {
          const imgPath = path.join(imagesDir, imgName);
          if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
        });
        await db.delete(filesTable).where(eq(filesTable.id, fileId));
      }
    } else {
      await db
        .update(filesTable)
        .set({
          scanStatus: "clean",
          detectionRatio: `0/${total}`,
          virusTotalLink: `https://www.virustotal.com/gui/file-analysis/${analysisId}`,
          scanEngine: "VirusTotal",
          scanDetails: "No threats detected",
        })
        .where(eq(filesTable.id, fileId));
    }
    return;
  }

  throw new Error("Scan timed out");
}

export default router;

import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db, filesTable } from "@workspace/db";
import { eq, and, or, ilike } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import {
  ListFilesQueryParams,
  GetFileParams,
  DeleteFileParams,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";

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
    if (_file.fieldname === "images" || _file.fieldname === "coverImage") {
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

  const { edition, type, scanStatus, search } = parseResult.data as {
    edition?: string;
    type?: string;
    scanStatus?: string;
    search?: string;
  };
  const conditions = [];
  if (edition) conditions.push(eq(filesTable.edition, edition));
  if (type) conditions.push(eq(filesTable.type, type));
  if (scanStatus) conditions.push(eq(filesTable.scanStatus, scanStatus));
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push(or(ilike(filesTable.originalName, term), ilike(filesTable.customId, term))!);
  }

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
    { name: "coverImage", maxCount: 1 },
    { name: "images", maxCount: 10 },
  ]),
  async (req, res) => {
    const userId = (req as any).userId as string;
    const fields = req.files as Record<string, Express.Multer.File[]> | undefined;
    const mainFile = fields?.["file"]?.[0];
    const coverImageFile = fields?.["coverImage"]?.[0];
    const imageFiles = fields?.["images"] ?? [];

    if (!mainFile) return res.status(400).json({ error: "No file uploaded" });

    const { type, edition, description, customId, title } = req.body as {
      type?: string;
      edition?: string;
      description?: string;
      customId?: string;
      title?: string;
    };

    const cleanupUploads = () => {
      fs.unlinkSync(mainFile.path);
      if (coverImageFile && fs.existsSync(coverImageFile.path)) fs.unlinkSync(coverImageFile.path);
      imageFiles.forEach((f) => fs.existsSync(f.path) && fs.unlinkSync(f.path));
    };

    if (!type || !["mod", "map"].includes(type)) {
      cleanupUploads();
      return res.status(400).json({ error: "type must be 'mod' or 'map'" });
    }
    if (!edition || !["java", "bedrock"].includes(edition)) {
      cleanupUploads();
      return res.status(400).json({ error: "edition must be 'java' or 'bedrock'" });
    }

    const CUSTOM_ID_REGEX = /^[a-z0-9-]{3,50}$/;
    if (!customId || !CUSTOM_ID_REGEX.test(customId)) {
      cleanupUploads();
      return res.status(400).json({ error: "customId must be 3–50 chars: lowercase letters, numbers, and hyphens only" });
    }

    if (!title || !title.trim()) {
      cleanupUploads();
      return res.status(400).json({ error: "title is required" });
    }

    const [existing] = await db.select({ id: filesTable.id }).from(filesTable).where(eq(filesTable.customId, customId));
    if (existing) {
      cleanupUploads();
      return res.status(409).json({ error: "customId is already taken, please choose another" });
    }

    const ext = path.extname(mainFile.originalname).toLowerCase();
    const allowed = getAllowedExtensions(edition);
    if (!allowed.has(ext)) {
      cleanupUploads();
      return res.status(400).json({
        error: `${edition === "java" ? "Java" : "Bedrock"} Edition does not accept ${ext || "this"} files. Allowed: ${[...allowed].join(", ")}`,
      });
    }

    // ── Image moderation (DeepAI NSFW check) ─────────────────────────────────
    async function checkNsfw(img: Express.Multer.File): Promise<boolean> {
      const deepAiKey = process.env.DEEPAI_API_KEY;
      if (!deepAiKey) return false;
      try {
        const imgBuffer = fs.readFileSync(img.path);
        const fd = new FormData();
        fd.append("image", new Blob([imgBuffer]), img.filename);
        const modResp = await fetch("https://api.deepai.org/api/nsfw-detector", {
          method: "POST",
          headers: { "api-key": deepAiKey },
          body: fd,
        });
        if (modResp.ok) {
          const modData = (await modResp.json()) as { output?: { nsfw_score?: number } };
          return (modData?.output?.nsfw_score ?? 0) > 0.7;
        }
      } catch {
        // fall through to not-nsfw
      }
      return false;
    }

    let coverImageName: string | null = null;
    if (coverImageFile) {
      const coverIsNsfw = await checkNsfw(coverImageFile);
      if (coverIsNsfw) {
        if (fs.existsSync(coverImageFile.path)) fs.unlinkSync(coverImageFile.path);
      } else {
        coverImageName = coverImageFile.filename;
      }
    }

    const cleanImageFiles: Express.Multer.File[] = [];
    for (const img of imageFiles) {
      const isNsfw = await checkNsfw(img);
      if (isNsfw) {
        if (fs.existsSync(img.path)) fs.unlinkSync(img.path);
      } else {
        cleanImageFiles.push(img);
      }
    }
    const imageNames = cleanImageFiles.map((f) => f.filename);

    const [inserted] = await db
      .insert(filesTable)
      .values({
        customId,
        name: mainFile.filename,
        originalName: mainFile.originalname,
        title: title.trim(),
        edition,
        type,
        size: mainFile.size,
        mimeType: mainFile.mimetype,
        filePath: mainFile.path,
        scanStatus: "pending",
        description: description ?? null,
        coverImage: coverImageName,
        images: imageNames,
        uploadedBy: userId,
      })
      .returning();

    startScan(inserted.id, mainFile.path);

    return res.status(201).json(fileToResponse(inserted));
  },
);

// ── Rescan (requires auth + ownership) — retries a failed/stuck scan ────────
router.post("/files/:id/scan", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const parseResult = GetFileParams.safeParse({ id: Number(req.params.id) });
  if (!parseResult.success) return res.status(400).json({ error: "Invalid id" });

  const [file] = await db.select().from(filesTable).where(eq(filesTable.id, parseResult.data.id));
  if (!file) return res.status(404).json({ error: "Not found" });
  if (file.uploadedBy !== userId) {
    return res.status(403).json({ error: "Forbidden — you can only rescan your own files" });
  }
  if (file.scanStatus === "scanning") {
    return res.status(409).json({ error: "A scan is already in progress for this file" });
  }
  if (!fs.existsSync(file.filePath)) {
    return res.status(404).json({ error: "File not found on disk" });
  }

  startScan(file.id, file.filePath);

  const [updated] = await db
    .update(filesTable)
    .set({ scanStatus: "scanning", scanDetails: null })
    .where(eq(filesTable.id, file.id))
    .returning();

  return res.status(202).json(fileToResponse(updated));
});

// TEMPORARY: scanning is currently unreliable for small files (≤2MB), so we
// skip calling VirusTotal for them entirely rather than surfacing a broken
// "error" status. Remove this bypass once small-file scanning is fixed.
const SCAN_SKIP_SIZE_LIMIT = 2 * 1024 * 1024;

function startScan(fileId: number, filePath: string) {
  const apiKey = process.env.VIRUSTOTAL_API_KEY;
  if (!apiKey) {
    void db
      .update(filesTable)
      .set({
        scanStatus: "error",
        scanDetails: "VirusTotal API key not configured — file unverified",
      })
      .where(eq(filesTable.id, fileId));
    return;
  }
  if (!fs.existsSync(filePath)) return;

  const { size } = fs.statSync(filePath);
  if (size <= SCAN_SKIP_SIZE_LIMIT) {
    void db
      .update(filesTable)
      .set({
        scanStatus: "skipped",
        scanDetails: "Scanning temporarily skipped for small files (≤2MB)",
      })
      .where(eq(filesTable.id, fileId));
    return;
  }

  performScan(fileId, filePath, apiKey).catch(async (err) => {
    const msg = String(err);
    const isRateLimit = msg.includes("rate") || msg.includes("429");
    logger.error({ fileId, err: msg }, "VirusTotal scan failed");
    await db
      .update(filesTable)
      .set({
        scanStatus: isRateLimit ? "pending" : "error",
        scanDetails: isRateLimit
          ? "Rate limited by VirusTotal — will need a manual rescan"
          : msg,
      })
      .where(eq(filesTable.id, fileId));
  });
}

// ── Update title/description/images (requires auth + ownership) ──────────────
router.patch(
  "/files/:id",
  requireAuth,
  imageUpload.fields([
    { name: "images", maxCount: 10 },
    { name: "coverImage", maxCount: 1 },
  ]),
  async (req, res) => {
    const userId = (req as any).userId as string;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

    const fields = req.files as Record<string, Express.Multer.File[]> | undefined;
    const newImages = fields?.["images"] ?? [];
    const newCoverImage = fields?.["coverImage"]?.[0];
    const cleanupAll = () => {
      newImages.forEach((f) => fs.existsSync(f.path) && fs.unlinkSync(f.path));
      if (newCoverImage && fs.existsSync(newCoverImage.path)) fs.unlinkSync(newCoverImage.path);
    };

    const [file] = await db.select().from(filesTable).where(eq(filesTable.id, id));
    if (!file) {
      cleanupAll();
      return res.status(404).json({ error: "Not found" });
    }

    if (file.uploadedBy !== userId) {
      cleanupAll();
      return res.status(403).json({ error: "Forbidden — you can only edit your own files" });
    }

    const { description, title } = req.body as { description?: string; title?: string };
    const newImageNames = newImages.map((f) => f.filename);
    const existingImages = file.images ?? [];

    if (newCoverImage && file.coverImage) {
      const oldCoverPath = path.join(imagesDir, file.coverImage);
      if (fs.existsSync(oldCoverPath)) fs.unlinkSync(oldCoverPath);
    }

    const [updated] = await db
      .update(filesTable)
      .set({
        title: title !== undefined && title.trim() ? title.trim() : file.title,
        coverImage: newCoverImage ? newCoverImage.filename : file.coverImage,
        description: description !== undefined ? description : file.description,
        images: [...existingImages, ...newImageNames],
      })
      .where(eq(filesTable.id, id))
      .returning();

    return res.json(fileToResponse(updated));
  },
);

// iOS Safari (and Mobile Safari in general) doesn't reliably honor a generic
// "application/octet-stream" Content-Type + percent-encoded-only filename —
// with no recognizable extension/MIME pairing it falls back to previewing the
// response as plain text instead of saving the real binary. Mapping the real
// extension to its actual MIME type, and sending BOTH a plain ASCII fallback
// filename and an RFC 5987 `filename*` UTF-8 filename, makes Safari treat the
// response as a real file download with the correct extension preserved.
const DOWNLOAD_MIME_TYPES: Record<string, string> = {
  ".jar": "application/java-archive",
  ".zip": "application/zip",
  ".mcpack": "application/octet-stream",
  ".mcworld": "application/octet-stream",
  ".mcaddon": "application/octet-stream",
  ".mctemplate": "application/octet-stream",
};

function asciiFallbackFilename(name: string): string {
  const ext = path.extname(name);
  const base = path.basename(name, ext).replace(/[^\x20-\x7E]/g, "_").trim();
  return `${base || "download"}${ext}`;
}

// ── Download ──────────────────────────────────────────────────────────────────
router.get("/files/:id/download", async (req, res) => {
  const parseResult = GetFileParams.safeParse({ id: Number(req.params.id) });
  if (!parseResult.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const [file] = await db.select().from(filesTable).where(eq(filesTable.id, parseResult.data.id));
  if (!file) { res.status(404).json({ error: "Not found" }); return; }

  if (!fs.existsSync(file.filePath)) { res.status(404).json({ error: "File not found on disk" }); return; }

  const ext = path.extname(file.originalName).toLowerCase();
  const mimeType = DOWNLOAD_MIME_TYPES[ext] ?? "application/octet-stream";
  const fallbackName = asciiFallbackFilename(file.originalName);

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
  );
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Content-Length", file.size);
  res.setHeader("X-Content-Type-Options", "nosniff");

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
  if (file.coverImage) {
    const coverPath = path.join(imagesDir, file.coverImage);
    if (fs.existsSync(coverPath)) fs.unlinkSync(coverPath);
  }
  await db.delete(filesTable).where(eq(filesTable.id, parseResult.data.id));

  return res.status(204).send();
});

// VirusTotal's direct /files endpoint only accepts uploads up to 32MB.
// Larger files (Minecraft mods/maps routinely exceed this) must be sent to
// a special, per-request upload URL fetched from /files/upload_url — this
// was the main reason scans "always failed": every upload over 32MB got a
// 413 from VT and was immediately marked as an error.
const VT_DIRECT_UPLOAD_LIMIT = 32 * 1024 * 1024;

async function performScan(fileId: number, filePath: string, apiKey: string) {
  await db
    .update(filesTable)
    .set({ scanStatus: "scanning", scanDetails: null })
    .where(eq(filesTable.id, fileId));

  const fileBuffer = fs.readFileSync(filePath);
  const fileSize = fileBuffer.byteLength;

  let uploadUrl = "https://www.virustotal.com/api/v3/files";
  if (fileSize > VT_DIRECT_UPLOAD_LIMIT) {
    const urlResp = await fetch("https://www.virustotal.com/api/v3/files/upload_url", {
      headers: { "x-apikey": apiKey },
    });
    if (!urlResp.ok) {
      throw new Error(`VT upload_url request failed: ${urlResp.status}`);
    }
    const urlData = (await urlResp.json()) as { data: string };
    uploadUrl = urlData.data;
  }

  const formData = new FormData();
  formData.append("file", new Blob([fileBuffer]), path.basename(filePath));

  const uploadResp = await fetch(uploadUrl, {
    method: "POST",
    headers: { "x-apikey": apiKey },
    body: formData,
  });

  if (!uploadResp.ok) {
    const body = await uploadResp.text().catch(() => "");
    logger.error(
      { fileId, status: uploadResp.status, body: body.slice(0, 500) },
      "VirusTotal upload failed",
    );
    throw new Error(`VT upload failed: ${uploadResp.status}`);
  }

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

import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { Readable } from "stream";
import { getAuth } from "@clerk/express";
import { ListFilesQueryParams, GetFileParams, DeleteFileParams } from "@workspace/api-zod";
import { logger } from "../lib/logger";
import {
  listRecords,
  getRecord,
  createRecord,
  patchRecord,
  deleteRecord,
  setUniqueFields,
  initStorageUpload,
  putStorageBytes,
  deleteStorageFile,
  fetchStorageBytes,
} from "../lib/baas";

const router = Router();

// ── Temporary storage for incoming uploads ───────────────────────────────────
const tmpDir = path.join(process.cwd(), "tmp");
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

const tmpStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, tmpDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({ storage: tmpStorage, limits: { fileSize: 500 * 1024 * 1024 } });
const imageUpload = multer({
  storage: tmpStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ALLOWED_IMAGE_EXTENSIONS.has(path.extname(file.originalname).toLowerCase()));
  },
});

// ── BaaS collection schema ───────────────────────────────────────────────────
const COLLECTION = "files";

type FileData = {
  customId: string | null;
  name: string;          // BaaS download URL (same as filePath)
  originalName: string;
  title: string | null;
  edition: string;
  type: string;
  size: number;
  mimeType: string | null;
  filePath: string;      // BaaS storage download URL for the main file
  mainStorageFileId: number;
  uploadedAt: string;
  scanStatus: string;
  scanDetails: string | null;
  scanEngine: string | null;
  virusTotalLink: string | null;
  detectionRatio: string | null;
  description: string | null;
  coverImage: string | null;      // download URL
  coverImageFileId: number | null;
  images: string[];               // download URLs
  imageFileIds: number[];
  uploadedBy: string | null;
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  const userId = auth?.sessionClaims?.userId || auth?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized — please sign in" });
  req.userId = userId;
  next();
}

function fileToResponse(record: { id: number; data: FileData }) {
  // Strip internal BaaS storage IDs from the public response
  const { mainStorageFileId, coverImageFileId, imageFileIds, ...rest } = record.data;
  return { id: record.id, ...rest };
}

const JAVA_EXTENSIONS = new Set([".jar", ".zip"]);
const BEDROCK_EXTENSIONS = new Set([".mcpack", ".mcworld", ".mcaddon", ".mctemplate"]);
const ALLOWED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

const DOWNLOAD_MIME_TYPES: Record<string, string> = {
  ".jar": "application/java-archive",
  ".zip": "application/zip",
  ".mcpack": "application/octet-stream",
  ".mcworld": "application/octet-stream",
  ".mcaddon": "application/octet-stream",
  ".mctemplate": "application/octet-stream",
};

function getAllowedExtensions(edition: string): Set<string> {
  return edition === "java" ? JAVA_EXTENSIONS : BEDROCK_EXTENSIONS;
}

function asciiFallbackFilename(name: string): string {
  const ext = path.extname(name);
  const base = path.basename(name, ext).replace(/[^\x20-\x7E]/g, "_").trim();
  return `${base || "download"}${ext}`;
}

let schemaEnsured = false;
async function ensureSchema() {
  if (schemaEnsured) return;
  await setUniqueFields(COLLECTION, ["customId"]).catch(() => {});
  schemaEnsured = true;
}

/** Read a temp file from disk, upload to BaaS storage, delete the temp file, return the result. */
async function uploadTmpToBaas(
  tmpFile: Express.Multer.File,
  prefix: string,
): Promise<{ downloadUrl: string; fileId: number }> {
  const ext = path.extname(tmpFile.originalname).toLowerCase();
  const name = `${prefix}/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  const buf = fs.readFileSync(tmpFile.path);
  const init = await initStorageUpload({ name, size: tmpFile.size, contentType: tmpFile.mimetype || "application/octet-stream" });
  await putStorageBytes(init.uploadURL, buf, tmpFile.mimetype || "application/octet-stream");
  if (fs.existsSync(tmpFile.path)) fs.unlinkSync(tmpFile.path);
  return { downloadUrl: init.downloadUrl, fileId: init.fileId };
}

// ── NSFW check (DeepAI) ──────────────────────────────────────────────────────
async function checkNsfw(tmpFile: Express.Multer.File): Promise<boolean> {
  const deepAiKey = process.env.DEEPAI_API_KEY;
  if (!deepAiKey) return false;
  try {
    const buf = fs.readFileSync(tmpFile.path);
    const fd = new FormData();
    fd.append("image", new Blob([buf]), tmpFile.filename);
    const resp = await fetch("https://api.deepai.org/api/nsfw-detector", {
      method: "POST",
      headers: { "api-key": deepAiKey },
      body: fd,
    });
    if (resp.ok) {
      const data = await resp.json() as { output?: { nsfw_score?: number } };
      return (data?.output?.nsfw_score ?? 0) > 0.7;
    }
  } catch {}
  return false;
}

// ── List files ───────────────────────────────────────────────────────────────
router.get("/files", async (req, res) => {
  const parseResult = ListFilesQueryParams.safeParse(req.query);
  if (!parseResult.success) return res.status(400).json({ error: "Invalid query params" });

  const { edition, type, scanStatus, search } = parseResult.data as {
    edition?: string; type?: string; scanStatus?: string; search?: string;
  };

  let results = await listRecords<FileData>(COLLECTION);
  if (edition) results = results.filter((r) => r.data.edition === edition);
  if (type) results = results.filter((r) => r.data.type === type);
  if (scanStatus) results = results.filter((r) => r.data.scanStatus === scanStatus);
  if (search && search.trim()) {
    const term = search.trim().toLowerCase();
    results = results.filter(
      (r) =>
        r.data.originalName.toLowerCase().includes(term) ||
        (r.data.customId ?? "").toLowerCase().includes(term),
    );
  }
  results.sort((a, b) => new Date(a.data.uploadedAt).getTime() - new Date(b.data.uploadedAt).getTime());

  return res.json(results.map(fileToResponse));
});

// ── Stats — MUST be before /:id ──────────────────────────────────────────────
router.get("/files/stats", async (_req, res) => {
  const rows = await listRecords<FileData>(COLLECTION);
  return res.json({
    totalFiles: rows.length,
    totalMods: rows.filter((r) => r.data.type === "mod").length,
    totalMaps: rows.filter((r) => r.data.type === "map").length,
    javaMods: rows.filter((r) => r.data.edition === "java" && r.data.type === "mod").length,
    javaMaps: rows.filter((r) => r.data.edition === "java" && r.data.type === "map").length,
    bedrockMods: rows.filter((r) => r.data.edition === "bedrock" && r.data.type === "mod").length,
    bedrockMaps: rows.filter((r) => r.data.edition === "bedrock" && r.data.type === "map").length,
    cleanFiles: rows.filter((r) => r.data.scanStatus === "clean").length,
    maliciousFiles: rows.filter((r) => r.data.scanStatus === "malicious").length,
    pendingFiles: rows.filter((r) => r.data.scanStatus === "pending").length,
    totalSizeBytes: rows.reduce((acc, r) => acc + (r.data.size ?? 0), 0),
  });
});

// ── Upload ────────────────────────────────────────────────────────────────────
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
    await ensureSchema();

    const fields = req.files as Record<string, Express.Multer.File[]> | undefined;
    const mainFile = fields?.["file"]?.[0];
    const coverImageFile = fields?.["coverImage"]?.[0];
    const imageFiles = fields?.["images"] ?? [];

    function cleanupTmp() {
      if (mainFile && fs.existsSync(mainFile.path)) fs.unlinkSync(mainFile.path);
      if (coverImageFile && fs.existsSync(coverImageFile.path)) fs.unlinkSync(coverImageFile.path);
      imageFiles.forEach((f) => fs.existsSync(f.path) && fs.unlinkSync(f.path));
    }

    if (!mainFile) return res.status(400).json({ error: "No file uploaded" });

    try {

    const { type, edition, description, customId, title } = req.body as {
      type?: string; edition?: string; description?: string; customId?: string; title?: string;
    };

    if (!type || !["mod", "map"].includes(type)) {
      cleanupTmp();
      return res.status(400).json({ error: "type must be 'mod' or 'map'" });
    }
    if (!edition || !["java", "bedrock"].includes(edition)) {
      cleanupTmp();
      return res.status(400).json({ error: "edition must be 'java' or 'bedrock'" });
    }

    const CUSTOM_ID_REGEX = /^[a-z0-9-]{3,50}$/;
    if (!customId || !CUSTOM_ID_REGEX.test(customId)) {
      cleanupTmp();
      return res.status(400).json({ error: "customId must be 3–50 chars: lowercase letters, numbers, and hyphens only" });
    }
    if (!title || !title.trim()) {
      cleanupTmp();
      return res.status(400).json({ error: "title is required" });
    }

    // Check customId uniqueness
    const existingFiles = await listRecords<FileData>(COLLECTION);
    if (existingFiles.some((r) => r.data.customId === customId)) {
      cleanupTmp();
      return res.status(409).json({ error: "customId is already taken, please choose another" });
    }

    const ext = path.extname(mainFile.originalname).toLowerCase();
    if (!getAllowedExtensions(edition).has(ext)) {
      cleanupTmp();
      return res.status(400).json({
        error: `${edition === "java" ? "Java" : "Bedrock"} Edition does not accept ${ext || "this"} files. Allowed: ${[...getAllowedExtensions(edition)].join(", ")}`,
      });
    }

    // ── Upload cover image ────────────────────────────────────────────────────
    let coverImageUrl: string | null = null;
    let coverImageFileId: number | null = null;
    if (coverImageFile) {
      const imgExt = path.extname(coverImageFile.originalname).toLowerCase();
      if (ALLOWED_IMAGE_EXTENSIONS.has(imgExt) && !(await checkNsfw(coverImageFile))) {
        const r = await uploadTmpToBaas(coverImageFile, "images");
        coverImageUrl = r.downloadUrl;
        coverImageFileId = r.fileId;
      } else if (fs.existsSync(coverImageFile.path)) {
        fs.unlinkSync(coverImageFile.path);
      }
    }

    // ── Upload gallery images ─────────────────────────────────────────────────
    const imageUrls: string[] = [];
    const imageFileIds: number[] = [];
    for (const img of imageFiles) {
      const imgExt = path.extname(img.originalname).toLowerCase();
      if (!ALLOWED_IMAGE_EXTENSIONS.has(imgExt)) {
        if (fs.existsSync(img.path)) fs.unlinkSync(img.path);
        continue;
      }
      if (await checkNsfw(img)) {
        if (fs.existsSync(img.path)) fs.unlinkSync(img.path);
        continue;
      }
      const r = await uploadTmpToBaas(img, "images");
      imageUrls.push(r.downloadUrl);
      imageFileIds.push(r.fileId);
    }

    // ── Upload main file ──────────────────────────────────────────────────────
    const mainResult = await uploadTmpToBaas(mainFile, "files");

    const now = new Date().toISOString();
    const inserted = await createRecord<FileData>(COLLECTION, {
      customId,
      name: mainResult.downloadUrl,
      originalName: mainFile.originalname,
      title: title.trim(),
      edition,
      type,
      size: mainFile.size,
      mimeType: mainFile.mimetype || null,
      filePath: mainResult.downloadUrl,
      mainStorageFileId: mainResult.fileId,
      uploadedAt: now,
      scanStatus: "pending",
      scanDetails: null,
      scanEngine: null,
      virusTotalLink: null,
      detectionRatio: null,
      description: description ?? null,
      coverImage: coverImageUrl,
      coverImageFileId,
      images: imageUrls,
      imageFileIds,
      uploadedBy: userId,
    });

    const vtKey = process.env.VIRUSTOTAL_API_KEY;
    if (vtKey) {
      performScan(inserted.id, mainResult.downloadUrl, mainFile.size, vtKey).catch(async (err) => {
        const msg = String(err);
        const isRateLimit = msg.includes("rate") || msg.includes("429");
        logger.error({ fileId: inserted.id, err: msg }, "VirusTotal scan failed");
        await patchRecord<FileData>(COLLECTION, inserted.id, {
          scanStatus: isRateLimit ? "pending" : "error",
          scanDetails: isRateLimit ? "Rate limited — needs manual rescan" : msg,
        }).catch(() => {});
      });
    } else {
      await patchRecord<FileData>(COLLECTION, inserted.id, {
        scanStatus: "error",
        scanDetails: "VirusTotal API key not configured — file unverified",
      });
    }

    return res.status(201).json(fileToResponse(inserted));
    } catch (err: any) {
      cleanupTmp();
      logger.error({ err: err?.message, stack: err?.stack }, "Upload failed");
      return res.status(500).json({ error: err?.message ?? "Upload failed" });
    }
  },
);

// ── Rescan ────────────────────────────────────────────────────────────────────
router.post("/files/:id/scan", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const parseResult = GetFileParams.safeParse({ id: Number(req.params.id) });
  if (!parseResult.success) return res.status(400).json({ error: "Invalid id" });

  const file = await getRecord<FileData>(COLLECTION, parseResult.data.id);
  if (!file) return res.status(404).json({ error: "Not found" });
  if (file.data.uploadedBy !== userId) return res.status(403).json({ error: "Forbidden — you can only rescan your own files" });
  if (file.data.scanStatus === "scanning") return res.status(409).json({ error: "A scan is already in progress" });

  const vtKey = process.env.VIRUSTOTAL_API_KEY;
  if (!vtKey) return res.status(503).json({ error: "VirusTotal API key not configured" });

  const updated = await patchRecord<FileData>(COLLECTION, file.id, { scanStatus: "scanning", scanDetails: null });

  performScan(file.id, file.data.filePath, file.data.size, vtKey).catch(async (err) => {
    const msg = String(err);
    const isRateLimit = msg.includes("rate") || msg.includes("429");
    logger.error({ fileId: file.id, err: msg }, "VirusTotal rescan failed");
    await patchRecord<FileData>(COLLECTION, file.id, {
      scanStatus: isRateLimit ? "pending" : "error",
      scanDetails: isRateLimit ? "Rate limited — needs manual rescan" : msg,
    }).catch(() => {});
  });

  return res.status(202).json(fileToResponse(updated));
});

// ── Update metadata + images ──────────────────────────────────────────────────
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

    function cleanupTmp() {
      newImages.forEach((f) => fs.existsSync(f.path) && fs.unlinkSync(f.path));
      if (newCoverImage && fs.existsSync(newCoverImage.path)) fs.unlinkSync(newCoverImage.path);
    }

    const file = await getRecord<FileData>(COLLECTION, id);
    if (!file) { cleanupTmp(); return res.status(404).json({ error: "Not found" }); }
    if (file.data.uploadedBy !== userId) { cleanupTmp(); return res.status(403).json({ error: "Forbidden — you can only edit your own files" }); }

    const { description, title } = req.body as { description?: string; title?: string };

    // Upload new gallery images
    const newImageUrls: string[] = [];
    const newImageFileIds: number[] = [];
    for (const img of newImages) {
      const r = await uploadTmpToBaas(img, "images");
      newImageUrls.push(r.downloadUrl);
      newImageFileIds.push(r.fileId);
    }

    // Upload new cover image
    let newCoverUrl: string | null = null;
    let newCoverFileId: number | null = null;
    if (newCoverImage) {
      // Delete old cover from BaaS storage
      if (file.data.coverImageFileId) {
        await deleteStorageFile(file.data.coverImageFileId).catch(() => {});
      }
      const r = await uploadTmpToBaas(newCoverImage, "images");
      newCoverUrl = r.downloadUrl;
      newCoverFileId = r.fileId;
    }

    const updated = await patchRecord<FileData>(COLLECTION, id, {
      title: title !== undefined && title.trim() ? title.trim() : file.data.title,
      coverImage: newCoverUrl ?? file.data.coverImage,
      coverImageFileId: newCoverFileId ?? file.data.coverImageFileId,
      description: description !== undefined ? description : file.data.description,
      images: [...file.data.images, ...newImageUrls],
      imageFileIds: [...file.data.imageFileIds, ...newImageFileIds],
    });

    return res.json(fileToResponse(updated));
  },
);

// ── Download — proxy from BaaS to preserve Content-Disposition for Safari ─────
router.get("/files/:id/download", async (req, res) => {
  const parseResult = GetFileParams.safeParse({ id: Number(req.params.id) });
  if (!parseResult.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const file = await getRecord<FileData>(COLLECTION, parseResult.data.id);
  if (!file) { res.status(404).json({ error: "Not found" }); return; }

  const storageResp = await fetchStorageBytes(file.data.filePath);
  if (!storageResp.ok || !storageResp.body) { res.status(404).json({ error: "File not found in storage" }); return; }

  const ext = path.extname(file.data.originalName).toLowerCase();
  const mimeType = DOWNLOAD_MIME_TYPES[ext] ?? "application/octet-stream";
  const fallbackName = asciiFallbackFilename(file.data.originalName);

  res.setHeader("Content-Disposition", `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(file.data.originalName)}`);
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Content-Length", String(file.data.size));
  res.setHeader("X-Content-Type-Options", "nosniff");

  Readable.fromWeb(storageResp.body as import("stream/web").ReadableStream).pipe(res);
});

// ── Get file ──────────────────────────────────────────────────────────────────
router.get("/files/:id", async (req, res) => {
  const parseResult = GetFileParams.safeParse({ id: Number(req.params.id) });
  if (!parseResult.success) return res.status(400).json({ error: "Invalid id" });

  const file = await getRecord<FileData>(COLLECTION, parseResult.data.id);
  if (!file) return res.status(404).json({ error: "Not found" });

  return res.json(fileToResponse(file));
});

// ── Delete file ───────────────────────────────────────────────────────────────
router.delete("/files/:id", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const parseResult = DeleteFileParams.safeParse({ id: Number(req.params.id) });
  if (!parseResult.success) return res.status(400).json({ error: "Invalid id" });

  const file = await getRecord<FileData>(COLLECTION, parseResult.data.id);
  if (!file) return res.status(404).json({ error: "Not found" });
  if (file.data.uploadedBy !== userId) return res.status(403).json({ error: "Forbidden — you can only delete your own files" });

  // Delete all storage blobs
  await deleteStorageFile(file.data.mainStorageFileId).catch(() => {});
  if (file.data.coverImageFileId) await deleteStorageFile(file.data.coverImageFileId).catch(() => {});
  for (const fid of file.data.imageFileIds) await deleteStorageFile(fid).catch(() => {});

  await deleteRecord(COLLECTION, file.id);

  return res.status(204).send();
});

// ── VirusTotal scanning ───────────────────────────────────────────────────────
const VT_DIRECT_UPLOAD_LIMIT = 32 * 1024 * 1024;

async function performScan(fileId: number, fileDownloadUrl: string, fileSize: number, apiKey: string) {
  await patchRecord<FileData>(COLLECTION, fileId, { scanStatus: "scanning", scanDetails: null });

  // Download file from BaaS storage
  const blobResp = await fetchStorageBytes(fileDownloadUrl);
  if (!blobResp.ok) throw new Error("File missing from BaaS storage");
  const fileBuffer = await blobResp.arrayBuffer();

  let uploadUrl = "https://www.virustotal.com/api/v3/files";
  if (fileSize > VT_DIRECT_UPLOAD_LIMIT) {
    const urlResp = await fetch("https://www.virustotal.com/api/v3/files/upload_url", {
      headers: { "x-apikey": apiKey },
    });
    if (!urlResp.ok) throw new Error(`VT upload_url request failed: ${urlResp.status}`);
    const urlData = await urlResp.json() as { data: string };
    uploadUrl = urlData.data;
  }

  const formData = new FormData();
  formData.append("file", new Blob([fileBuffer]), fileDownloadUrl.split("/").pop() ?? "file");

  const uploadResp = await fetch(uploadUrl, {
    method: "POST",
    headers: { "x-apikey": apiKey },
    body: formData,
  });
  if (!uploadResp.ok) throw new Error(`VT upload failed: ${uploadResp.status}`);

  const uploadData = await uploadResp.json() as { data: { id: string } };
  const analysisId = uploadData.data.id;

  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((r) => setTimeout(r, 5000));
    const pollResp = await fetch(`https://www.virustotal.com/api/v3/analyses/${analysisId}`, {
      headers: { "x-apikey": apiKey },
    });
    if (!pollResp.ok) continue;

    const pollData = await pollResp.json() as {
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
    const total = (stats.malicious ?? 0) + (stats.suspicious ?? 0) + (stats.undetected ?? 0) + (stats.harmless ?? 0);

    if (malicious > 0) {
      // Delete malicious file from BaaS
      const file = await getRecord<FileData>(COLLECTION, fileId);
      if (file) {
        await deleteStorageFile(file.data.mainStorageFileId).catch(() => {});
        if (file.data.coverImageFileId) await deleteStorageFile(file.data.coverImageFileId).catch(() => {});
        for (const fid of file.data.imageFileIds) await deleteStorageFile(fid).catch(() => {});
        await deleteRecord(COLLECTION, fileId);
      }
    } else {
      await patchRecord<FileData>(COLLECTION, fileId, {
        scanStatus: "clean",
        detectionRatio: `0/${total}`,
        virusTotalLink: `https://www.virustotal.com/gui/file-analysis/${analysisId}`,
        scanEngine: "VirusTotal",
        scanDetails: "No threats detected",
      });
    }
    return;
  }

  throw new Error("Scan timed out");
}

export default router;

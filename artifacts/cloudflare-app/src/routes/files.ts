import { Hono } from "hono";
import {
  listRecords,
  getRecord,
  createRecord,
  patchRecord,
  deleteRecord,
  setUniqueFields,
  isDuplicateFieldError,
  initStorageUpload,
  putStorageBytes,
  deleteStorageFile,
  fetchStorageBytes,
} from "../lib/baas";
import { requireAuth } from "../lib/clerkAuth";
import { ListFilesQueryParams, GetFileParams, DeleteFileParams } from "@workspace/api-zod";
import type { Bindings, Variables } from "../env.d";

const COLLECTION = "files";

type FileData = {
  customId: string | null;
  name: string;
  originalName: string;
  title: string | null;
  edition: string;
  type: string;
  size: number;
  mimeType: string | null;
  filePath: string; // BaaS storage download URL for the main file
  mainStorageFileId: number; // BaaS storage fileId, needed to delete the blob later
  uploadedAt: string;
  scanStatus: string;
  scanDetails: string | null;
  scanEngine: string | null;
  virusTotalLink: string | null;
  detectionRatio: string | null;
  description: string | null;
  coverImage: string | null; // download URL
  coverImageFileId: number | null;
  images: string[]; // download URLs
  imageFileIds: number[];
  uploadedBy: string | null;
};

const files = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const JAVA_EXTENSIONS = new Set([".jar", ".zip"]);
const BEDROCK_EXTENSIONS = new Set([".mcpack", ".mcworld", ".mcaddon", ".mctemplate"]);
const ALLOWED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

function getAllowedExtensions(edition: string): Set<string> {
  return edition === "java" ? JAVA_EXTENSIONS : BEDROCK_EXTENSIONS;
}

function extname(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx === -1 ? "" : filename.slice(idx).toLowerCase();
}

function uniqueFilename(filename: string): string {
  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  return `${unique}${extname(filename)}`;
}

function fileToResponse(record: { id: number; data: FileData }) {
  const { mainStorageFileId, coverImageFileId, imageFileIds, ...rest } = record.data;
  return { id: record.id, ...rest };
}

let schemaEnsured = false;
async function ensureSchema(env: Bindings) {
  if (schemaEnsured) return;
  await setUniqueFields(env, COLLECTION, ["customId"]).catch(() => {});
  schemaEnsured = true;
}

async function findByCustomId(env: Bindings, customId: string) {
  const all = await listRecords<FileData>(env, COLLECTION);
  return all.find((r) => r.data.customId === customId) ?? null;
}

// ── List files ───────────────────────────────────────────────────────────────
files.get("/files", async (c) => {
  const query = Object.fromEntries(new URL(c.req.url).searchParams);
  const parseResult = ListFilesQueryParams.safeParse(query);
  if (!parseResult.success) return c.json({ error: "Invalid query params" }, 400);

  const { edition, type, scanStatus, search } = parseResult.data as {
    edition?: string;
    type?: string;
    scanStatus?: string;
    search?: string;
  };

  let results = await listRecords<FileData>(c.env, COLLECTION);

  if (edition) results = results.filter((r) => r.data.edition === edition);
  if (type) results = results.filter((r) => r.data.type === type);
  if (scanStatus) results = results.filter((r) => r.data.scanStatus === scanStatus);
  if (search && search.trim()) {
    const term = search.trim().toLowerCase();
    results = results.filter(
      (r) => r.data.originalName.toLowerCase().includes(term) || (r.data.customId ?? "").toLowerCase().includes(term),
    );
  }

  results.sort((a, b) => new Date(a.data.uploadedAt).getTime() - new Date(b.data.uploadedAt).getTime());

  return c.json(results.map(fileToResponse));
});

// ── Stats — MUST be before /:id ──────────────────────────────────────────────
files.get("/files/stats", async (c) => {
  const rows = await listRecords<FileData>(c.env, COLLECTION);

  return c.json({
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

// ── Upload (requires auth) ────────────────────────────────────────────────────
files.post("/files/upload", requireAuth, async (c) => {
  const userId = c.get("userId");
  await ensureSchema(c.env);
  const body = await c.req.parseBody({ all: true });

  const mainFile = body["file"] as File | undefined;
  const coverImageFile = body["coverImage"] as File | undefined;
  const rawImages = body["images"];
  const imageFiles = (Array.isArray(rawImages) ? rawImages : rawImages ? [rawImages] : []).filter(
    (f): f is File => f instanceof File,
  );

  if (!mainFile || !(mainFile instanceof File)) return c.json({ error: "No file uploaded" }, 400);

  const type = body["type"] as string | undefined;
  const edition = body["edition"] as string | undefined;
  const description = body["description"] as string | undefined;
  const customId = body["customId"] as string | undefined;
  const title = body["title"] as string | undefined;

  if (!type || !["mod", "map"].includes(type)) {
    return c.json({ error: "type must be 'mod' or 'map'" }, 400);
  }
  if (!edition || !["java", "bedrock"].includes(edition)) {
    return c.json({ error: "edition must be 'java' or 'bedrock'" }, 400);
  }

  const CUSTOM_ID_REGEX = /^[a-z0-9-]{3,50}$/;
  if (!customId || !CUSTOM_ID_REGEX.test(customId)) {
    return c.json({ error: "customId must be 3–50 chars: lowercase letters, numbers, and hyphens only" }, 400);
  }

  if (!title || !title.trim()) {
    return c.json({ error: "title is required" }, 400);
  }

  const existing = await findByCustomId(c.env, customId);
  if (existing) return c.json({ error: "customId is already taken, please choose another" }, 409);

  const ext = extname(mainFile.name);
  const allowed = getAllowedExtensions(edition);
  if (!allowed.has(ext)) {
    return c.json(
      {
        error: `${edition === "java" ? "Java" : "Bedrock"} Edition does not accept ${ext || "this"} files. Allowed: ${[...allowed].join(", ")}`,
      },
      400,
    );
  }

  // ── Image moderation (DeepAI NSFW check) ─────────────────────────────────
  const deepAiKey = c.env.DEEPAI_API_KEY;

  async function checkNsfw(img: File): Promise<boolean> {
    if (!deepAiKey) return false;
    try {
      const fd = new FormData();
      fd.append("image", img, img.name);
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

  let coverImageUrl: string | null = null;
  let coverImageFileId: number | null = null;
  if (coverImageFile && coverImageFile instanceof File && ALLOWED_IMAGE_EXTENSIONS.has(extname(coverImageFile.name))) {
    const coverIsNsfw = await checkNsfw(coverImageFile);
    if (!coverIsNsfw) {
      const init = await initStorageUpload(c.env, {
        name: `images/${uniqueFilename(coverImageFile.name)}`,
        size: coverImageFile.size,
        contentType: coverImageFile.type || "application/octet-stream",
      });
      await putStorageBytes(c.env, init.uploadURL, await coverImageFile.arrayBuffer(), coverImageFile.type || "application/octet-stream");
      coverImageUrl = init.downloadUrl;
      coverImageFileId = init.fileId;
    }
  }

  const imageUrls: string[] = [];
  const imageFileIds: number[] = [];
  for (const img of imageFiles) {
    if (!ALLOWED_IMAGE_EXTENSIONS.has(extname(img.name))) continue;
    const isNsfw = await checkNsfw(img);
    if (!isNsfw) {
      const init = await initStorageUpload(c.env, {
        name: `images/${uniqueFilename(img.name)}`,
        size: img.size,
        contentType: img.type || "application/octet-stream",
      });
      await putStorageBytes(c.env, init.uploadURL, await img.arrayBuffer(), img.type || "application/octet-stream");
      imageUrls.push(init.downloadUrl);
      imageFileIds.push(init.fileId);
    }
  }

  const mainInit = await initStorageUpload(c.env, {
    name: `files/${uniqueFilename(mainFile.name)}`,
    size: mainFile.size,
    contentType: mainFile.type || "application/octet-stream",
  });
  await putStorageBytes(c.env, mainInit.uploadURL, await mainFile.arrayBuffer(), mainFile.type || "application/octet-stream");

  const now = new Date().toISOString();
  const inserted = await createRecord<FileData>(c.env, COLLECTION, {
    customId,
    name: mainInit.downloadUrl,
    originalName: mainFile.name,
    title: title.trim(),
    edition,
    type,
    size: mainFile.size,
    mimeType: mainFile.type || null,
    filePath: mainInit.downloadUrl,
    mainStorageFileId: mainInit.fileId,
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

  const apiKey = c.env.VIRUSTOTAL_API_KEY;
  if (apiKey) {
    c.executionCtx.waitUntil(
      performScan(c.env, inserted.id, mainInit.downloadUrl, apiKey).catch(async (err) => {
        const msg = String(err);
        const isRateLimit = msg.includes("rate") || msg.includes("429");
        await patchRecord<FileData>(c.env, COLLECTION, inserted.id, {
          scanStatus: isRateLimit ? "pending" : "error",
          scanDetails: isRateLimit ? null : msg,
        }).catch(() => {});
      }),
    );
  } else {
    await patchRecord<FileData>(c.env, COLLECTION, inserted.id, {
      scanStatus: "error",
      scanDetails: "VirusTotal API key not configured — file unverified",
    });
  }

  return c.json(fileToResponse(inserted), 201);
});

// ── Update description/images (requires auth + ownership) ────────────────────
files.patch("/files/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ error: "Invalid id" }, 400);

  const file = await getRecord<FileData>(c.env, COLLECTION, id);
  if (!file) return c.json({ error: "Not found" }, 404);
  if (file.data.uploadedBy !== userId) return c.json({ error: "Forbidden — you can only edit your own files" }, 403);

  const body = await c.req.parseBody({ all: true });
  const description = body["description"] as string | undefined;
  const title = body["title"] as string | undefined;
  const rawImages = body["images"];
  const newImages = (Array.isArray(rawImages) ? rawImages : rawImages ? [rawImages] : []).filter(
    (f): f is File => f instanceof File,
  );
  const newCoverImage = body["coverImage"] as File | undefined;

  const newImageUrls: string[] = [];
  const newImageFileIds: number[] = [];
  for (const img of newImages) {
    const init = await initStorageUpload(c.env, {
      name: `images/${uniqueFilename(img.name)}`,
      size: img.size,
      contentType: img.type || "application/octet-stream",
    });
    await putStorageBytes(c.env, init.uploadURL, await img.arrayBuffer(), img.type || "application/octet-stream");
    newImageUrls.push(init.downloadUrl);
    newImageFileIds.push(init.fileId);
  }

  let newCoverImageUrl: string | null = null;
  let newCoverImageFileId: number | null = null;
  if (newCoverImage && newCoverImage instanceof File) {
    const init = await initStorageUpload(c.env, {
      name: `images/${uniqueFilename(newCoverImage.name)}`,
      size: newCoverImage.size,
      contentType: newCoverImage.type || "application/octet-stream",
    });
    await putStorageBytes(c.env, init.uploadURL, await newCoverImage.arrayBuffer(), newCoverImage.type || "application/octet-stream");
    newCoverImageUrl = init.downloadUrl;
    newCoverImageFileId = init.fileId;
    if (file.data.coverImageFileId) {
      await deleteStorageFile(c.env, file.data.coverImageFileId).catch(() => {});
    }
  }

  const updated = await patchRecord<FileData>(c.env, COLLECTION, id, {
    title: title !== undefined && title.trim() ? title.trim() : file.data.title,
    coverImage: newCoverImageUrl ?? file.data.coverImage,
    coverImageFileId: newCoverImageFileId ?? file.data.coverImageFileId,
    description: description !== undefined ? description : file.data.description,
    images: [...file.data.images, ...newImageUrls],
    imageFileIds: [...file.data.imageFileIds, ...newImageFileIds],
  });

  return c.json(fileToResponse(updated));
});

// ── Download ──────────────────────────────────────────────────────────────────
files.get("/files/:id/download", async (c) => {
  const parseResult = GetFileParams.safeParse({ id: Number(c.req.param("id")) });
  if (!parseResult.success) return c.json({ error: "Invalid id" }, 400);

  const file = await getRecord<FileData>(c.env, COLLECTION, parseResult.data.id);
  if (!file) return c.json({ error: "Not found" }, 404);

  const resp = await fetchStorageBytes(file.data.filePath);
  if (!resp.ok) return c.json({ error: "File not found in storage" }, 404);

  c.header("Content-Disposition", `attachment; filename="${encodeURIComponent(file.data.originalName)}"`);
  c.header("Content-Type", "application/octet-stream");
  c.header("Content-Length", String(file.data.size));
  return c.body(resp.body);
});

// ── Get file ──────────────────────────────────────────────────────────────────
files.get("/files/:id", async (c) => {
  const parseResult = GetFileParams.safeParse({ id: Number(c.req.param("id")) });
  if (!parseResult.success) return c.json({ error: "Invalid id" }, 400);

  const file = await getRecord<FileData>(c.env, COLLECTION, parseResult.data.id);
  if (!file) return c.json({ error: "Not found" }, 404);

  return c.json(fileToResponse(file));
});

// ── Delete file (requires auth + ownership) ───────────────────────────────────
files.delete("/files/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const parseResult = DeleteFileParams.safeParse({ id: Number(c.req.param("id")) });
  if (!parseResult.success) return c.json({ error: "Invalid id" }, 400);

  const file = await getRecord<FileData>(c.env, COLLECTION, parseResult.data.id);
  if (!file) return c.json({ error: "Not found" }, 404);
  if (file.data.uploadedBy !== userId) return c.json({ error: "Forbidden — you can only delete your own files" }, 403);

  await deleteStorageFile(c.env, file.data.mainStorageFileId).catch(() => {});
  if (file.data.coverImageFileId) await deleteStorageFile(c.env, file.data.coverImageFileId).catch(() => {});
  for (const fid of file.data.imageFileIds) await deleteStorageFile(c.env, fid).catch(() => {});
  await deleteRecord(c.env, COLLECTION, parseResult.data.id);

  return c.body(null, 204);
});

async function performScan(env: Bindings, fileId: number, fileDownloadUrl: string, apiKey: string) {
  const blobResp = await fetchStorageBytes(fileDownloadUrl);
  if (!blobResp.ok) throw new Error("File missing from storage");
  const fileBuffer = await blobResp.arrayBuffer();

  const formData = new FormData();
  formData.append("file", new Blob([fileBuffer]), fileDownloadUrl.split("/").pop());

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
    const total = (stats.malicious ?? 0) + (stats.suspicious ?? 0) + (stats.undetected ?? 0) + (stats.harmless ?? 0);

    if (malicious > 0) {
      const file = await getRecord<FileData>(env, COLLECTION, fileId);
      if (file) {
        await deleteStorageFile(env, file.data.mainStorageFileId).catch(() => {});
        if (file.data.coverImageFileId) await deleteStorageFile(env, file.data.coverImageFileId).catch(() => {});
        for (const fid of file.data.imageFileIds) await deleteStorageFile(env, fid).catch(() => {});
        await deleteRecord(env, COLLECTION, fileId);
      }
    } else {
      await patchRecord<FileData>(env, COLLECTION, fileId, {
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

export default files;

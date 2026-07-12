import { Hono } from "hono";
import { eq, and, or, ilike } from "drizzle-orm";
import { StorageClient } from "@supabase/storage-js";
import { getDb, filesTable } from "../db";
import { requireAuth } from "../lib/clerkAuth";
import {
  ListFilesQueryParams,
  GetFileParams,
  DeleteFileParams,
} from "@workspace/api-zod";
import type { Bindings, Variables } from "../env.d";

const BUCKET = "uploads";

function getStorage(env: Bindings) {
  return new StorageClient(`${env.SUPABASE_URL}/storage/v1`, {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  });
}

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

function fileToResponse(f: typeof filesTable.$inferSelect) {
  return { ...f, uploadedAt: f.uploadedAt.toISOString() };
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

  const db = getDb(c.env.DATABASE_URL);
  const conditions = [];
  if (edition) conditions.push(eq(filesTable.edition, edition));
  if (type) conditions.push(eq(filesTable.type, type));
  if (scanStatus) conditions.push(eq(filesTable.scanStatus, scanStatus));
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push(or(ilike(filesTable.originalName, term), ilike(filesTable.customId, term))!);
  }

  const results = conditions.length
    ? await db.select().from(filesTable).where(and(...conditions)).orderBy(filesTable.uploadedAt)
    : await db.select().from(filesTable).orderBy(filesTable.uploadedAt);

  return c.json(results.map(fileToResponse));
});

// ── Stats — MUST be before /:id ──────────────────────────────────────────────
files.get("/files/stats", async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const rows = await db
    .select({ edition: filesTable.edition, type: filesTable.type, scanStatus: filesTable.scanStatus, size: filesTable.size })
    .from(filesTable);

  return c.json({
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
files.post("/files/upload", requireAuth, async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env.DATABASE_URL);
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
    return c.json(
      { error: "customId must be 3–50 chars: lowercase letters, numbers, and hyphens only" },
      400,
    );
  }

  if (!title || !title.trim()) {
    return c.json({ error: "title is required" }, 400);
  }

  const [existing] = await db.select({ id: filesTable.id }).from(filesTable).where(eq(filesTable.customId, customId));
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
  // `images` stores bare filenames (not full R2 keys) to match the frontend's
  // `${base}/api/uploads/images/${imgName}` URL construction; the "images/"
  // prefix is applied when reading/writing R2.
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

  const storage = getStorage(c.env);

  let coverImageName: string | null = null;
  if (coverImageFile && coverImageFile instanceof File && ALLOWED_IMAGE_EXTENSIONS.has(extname(coverImageFile.name))) {
    const coverIsNsfw = await checkNsfw(coverImageFile);
    if (!coverIsNsfw) {
      const filename = uniqueFilename(coverImageFile.name);
      await storage.from(BUCKET).upload(`images/${filename}`, new Blob([await coverImageFile.arrayBuffer()]), {
        contentType: coverImageFile.type || "application/octet-stream",
      });
      coverImageName = filename;
    }
  }

  const cleanImageNames: string[] = [];
  for (const img of imageFiles) {
    if (!ALLOWED_IMAGE_EXTENSIONS.has(extname(img.name))) continue;
    const isNsfw = await checkNsfw(img);
    if (!isNsfw) {
      const filename = uniqueFilename(img.name);
      await storage.from(BUCKET).upload(`images/${filename}`, new Blob([await img.arrayBuffer()]), {
        contentType: img.type || "application/octet-stream",
      });
      cleanImageNames.push(filename);
    }
  }

  const mainKey = `files/${uniqueFilename(mainFile.name)}`;
  const mainStorage = getStorage(c.env);
  await mainStorage.from(BUCKET).upload(mainKey, new Blob([await mainFile.arrayBuffer()]), {
    contentType: mainFile.type || "application/octet-stream",
  });

  const [inserted] = await db
    .insert(filesTable)
    .values({
      customId,
      name: mainKey,
      originalName: mainFile.name,
      title: title.trim(),
      edition,
      type,
      size: mainFile.size,
      mimeType: mainFile.type,
      filePath: mainKey,
      scanStatus: "pending",
      description: description ?? null,
      coverImage: coverImageName,
      images: cleanImageNames,
      uploadedBy: userId,
    })
    .returning();

  const apiKey = c.env.VIRUSTOTAL_API_KEY;
  if (apiKey) {
    c.executionCtx.waitUntil(
      performScan(db, c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY, inserted.id, mainKey, apiKey).catch(async (err) => {
        const msg = String(err);
        const isRateLimit = msg.includes("rate") || msg.includes("429");
        await db
          .update(filesTable)
          .set({
            scanStatus: isRateLimit ? "pending" : "error",
            scanDetails: isRateLimit ? null : msg,
          })
          .where(eq(filesTable.id, inserted.id));
      }),
    );
  } else {
    await db
      .update(filesTable)
      .set({ scanStatus: "error", scanDetails: "VirusTotal API key not configured — file unverified" })
      .where(eq(filesTable.id, inserted.id));
  }

  return c.json(fileToResponse(inserted), 201);
});

// ── Update description/images (requires auth + ownership) ────────────────────
files.patch("/files/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ error: "Invalid id" }, 400);

  const db = getDb(c.env.DATABASE_URL);
  const [file] = await db.select().from(filesTable).where(eq(filesTable.id, id));
  if (!file) return c.json({ error: "Not found" }, 404);
  if (file.uploadedBy !== userId) return c.json({ error: "Forbidden — you can only edit your own files" }, 403);

  const body = await c.req.parseBody({ all: true });
  const description = body["description"] as string | undefined;
  const title = body["title"] as string | undefined;
  const rawImages = body["images"];
  const newImages = (Array.isArray(rawImages) ? rawImages : rawImages ? [rawImages] : []).filter(
    (f): f is File => f instanceof File,
  );
  const newCoverImage = body["coverImage"] as File | undefined;

  const newImageNames: string[] = [];
  const patchStorage = getStorage(c.env);
  for (const img of newImages) {
    const filename = uniqueFilename(img.name);
    await patchStorage.from(BUCKET).upload(`images/${filename}`, new Blob([await img.arrayBuffer()]), {
      contentType: img.type || "application/octet-stream",
    });
    newImageNames.push(filename);
  }
  const existingImages = file.images ?? [];

  let newCoverImageName: string | null = null;
  if (newCoverImage && newCoverImage instanceof File) {
    newCoverImageName = uniqueFilename(newCoverImage.name);
    await patchStorage.from(BUCKET).upload(`images/${newCoverImageName}`, new Blob([await newCoverImage.arrayBuffer()]), {
      contentType: newCoverImage.type || "application/octet-stream",
    });
    if (file.coverImage) {
      await patchStorage.from(BUCKET).remove([`images/${file.coverImage}`]);
    }
  }

  const [updated] = await db
    .update(filesTable)
    .set({
      title: title !== undefined && title.trim() ? title.trim() : file.title,
      coverImage: newCoverImageName ?? file.coverImage,
      description: description !== undefined ? description : file.description,
      images: [...existingImages, ...newImageNames],
    })
    .where(eq(filesTable.id, id))
    .returning();

  return c.json(fileToResponse(updated));
});

// ── Download ──────────────────────────────────────────────────────────────────
files.get("/files/:id/download", async (c) => {
  const parseResult = GetFileParams.safeParse({ id: Number(c.req.param("id")) });
  if (!parseResult.success) return c.json({ error: "Invalid id" }, 400);

  const db = getDb(c.env.DATABASE_URL);
  const [file] = await db.select().from(filesTable).where(eq(filesTable.id, parseResult.data.id));
  if (!file) return c.json({ error: "Not found" }, 404);

  const { data: blob, error: dlError } = await getStorage(c.env).from(BUCKET).download(file.filePath);
  if (dlError || !blob) return c.json({ error: "File not found in storage" }, 404);

  c.header("Content-Disposition", `attachment; filename="${encodeURIComponent(file.originalName)}"`);
  c.header("Content-Type", "application/octet-stream");
  c.header("Content-Length", String(file.size));
  return c.body(blob.stream() as unknown as ReadableStream);
});

// ── Serve images (redirect to Supabase public URL) ───────────────────────────
// Requires the "uploads" bucket to be set to PUBLIC in Supabase dashboard.
files.get("/uploads/images/:name", async (c) => {
  const { data } = getStorage(c.env).from(BUCKET).getPublicUrl(`images/${c.req.param("name")}`);
  return Response.redirect(data.publicUrl, 302);
});

// ── Get file ──────────────────────────────────────────────────────────────────
files.get("/files/:id", async (c) => {
  const parseResult = GetFileParams.safeParse({ id: Number(c.req.param("id")) });
  if (!parseResult.success) return c.json({ error: "Invalid id" }, 400);

  const db = getDb(c.env.DATABASE_URL);
  const [file] = await db.select().from(filesTable).where(eq(filesTable.id, parseResult.data.id));
  if (!file) return c.json({ error: "Not found" }, 404);

  return c.json(fileToResponse(file));
});

// ── Delete file (requires auth + ownership) ───────────────────────────────────
files.delete("/files/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const parseResult = DeleteFileParams.safeParse({ id: Number(c.req.param("id")) });
  if (!parseResult.success) return c.json({ error: "Invalid id" }, 400);

  const db = getDb(c.env.DATABASE_URL);
  const [file] = await db.select().from(filesTable).where(eq(filesTable.id, parseResult.data.id));
  if (!file) return c.json({ error: "Not found" }, 404);
  if (file.uploadedBy !== userId) return c.json({ error: "Forbidden — you can only delete your own files" }, 403);

  const delStorage = getStorage(c.env);
  await delStorage.from(BUCKET).remove([file.filePath]);
  const imgKeys = (file.images ?? []).map((n) => `images/${n}`);
  if (imgKeys.length) await delStorage.from(BUCKET).remove(imgKeys);
  await db.delete(filesTable).where(eq(filesTable.id, parseResult.data.id));

  return c.body(null, 204);
});

async function performScan(
  db: ReturnType<typeof getDb>,
  supabaseUrl: string,
  supabaseKey: string,
  fileId: number,
  key: string,
  apiKey: string,
) {
  const storage = new StorageClient(`${supabaseUrl}/storage/v1`, {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
  });
  const { data: blob, error } = await storage.from(BUCKET).download(key);
  if (error || !blob) throw new Error("File missing from storage");
  const fileBuffer = await blob.arrayBuffer();

  const formData = new FormData();
  formData.append("file", new Blob([fileBuffer]), key.split("/").pop());

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
        const keys = [file.filePath, ...(file.images ?? []).map((n) => `images/${n}`)];
        await storage.from(BUCKET).remove(keys);
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

export default files;

import type { Bindings } from "../env.d";

/**
 * Thin client for the user's self-hosted BaaS platform
 * (baas-platform.mcfoxy.workers.dev), replacing direct Neon/Supabase access.
 *
 * API contract (confirmed against the live deployment):
 * - Records:  GET/POST /v1/data/:collection , GET/PATCH/DELETE /v1/data/:collection/:id
 *   - PATCH merges the provided `data` fields into the existing record (partial update).
 *   - There is NO server-side filtering/search — list endpoints return everything
 *     (paginated via limit/offset), so callers must filter client-side.
 * - Unique fields: PUT /v1/collections/:collection/schema { uniqueFields: string[] }
 *   Enforced server-side; violating POST/PATCH returns 409 with
 *   { error: "Duplicate value for unique field: <field>" }.
 * - Storage: POST /v1/storage/upload { name, size, contentType } -> { uploadURL, downloadUrl, fileId }
 *   then PUT the raw bytes to `uploadURL` (base URL + path, NOT under /v1 — it's a signed,
 *   short-lived upload token). `downloadUrl` is a public absolute URL requiring no auth.
 *   DELETE /v1/storage/:fileId removes it.
 */

export type BaasRecord<T> = {
  id: number;
  collection: string;
  data: T;
  createdAt: string;
  updatedAt: string;
};

export class BaasError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

// Fallback base URL when BAAS_SERVICE binding isn't available (dev / wrangler dev)
const BAAS_FALLBACK_BASE = "https://baas-platform.mcfoxy.workers.dev";

function resolveBaasBase(env: Bindings): string {
  return (env.BAAS_BASE_URL || BAAS_FALLBACK_BASE).replace(/\/$/, "");
}

/**
 * Makes a request to the BaaS platform.
 *
 * On Cloudflare (production): uses the BAAS_SERVICE Service Binding so the
 * Worker-to-Worker call goes through the internal fast-path instead of the
 * public internet (avoids the workers.dev cross-Worker HTTPS restriction that
 * causes Cloudflare error 1042).
 *
 * In development (Replit): falls back to a normal HTTPS fetch using BAAS_BASE_URL.
 */
async function baasFetch(env: Bindings, path: string, init?: RequestInit): Promise<Response> {
  if (!env.BAAS_API_KEY) throw new BaasError("BAAS_API_KEY is not configured", 503);

  const headers: Record<string, string> = {
    "X-API-Key": env.BAAS_API_KEY,
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };

  const url = `${resolveBaasBase(env)}${path}`;
  const req = new Request(url, { ...init, headers });

  // Use Service Binding in production to avoid the workers.dev cross-Worker restriction
  if (env.BAAS_SERVICE) {
    return env.BAAS_SERVICE.fetch(req);
  }

  return fetch(req);
}

async function parseJsonOrThrow(resp: Response): Promise<any> {
  const text = await resp.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!resp.ok) {
    const message = typeof body === "object" && body?.error ? body.error : String(body);
    throw new BaasError(message, resp.status);
  }
  return body;
}

// ── Generic data records ────────────────────────────────────────────────────

const PAGE_SIZE = 200;

/** Fetches every record in a collection (paginating past the default 50-row limit). */
export async function listRecords<T>(env: Bindings, collection: string): Promise<BaasRecord<T>[]> {
  const all: BaasRecord<T>[] = [];
  let offset = 0;
  while (true) {
    const resp = await baasFetch(env, `/api/v1/data/${collection}?limit=${PAGE_SIZE}&offset=${offset}`);
    const body = await parseJsonOrThrow(resp);
    all.push(...body.data);
    if (body.data.length < PAGE_SIZE || all.length >= body.total) break;
    offset += PAGE_SIZE;
  }
  return all;
}

export async function getRecord<T>(env: Bindings, collection: string, id: number): Promise<BaasRecord<T> | null> {
  const resp = await baasFetch(env, `/api/v1/data/${collection}/${id}`);
  if (resp.status === 404) return null;
  return parseJsonOrThrow(resp);
}

export async function createRecord<T>(env: Bindings, collection: string, data: T): Promise<BaasRecord<T>> {
  const resp = await baasFetch(env, `/api/v1/data/${collection}`, {
    method: "POST",
    body: JSON.stringify({ data }),
  });
  return parseJsonOrThrow(resp);
}

/** Partially updates a record — only the provided fields in `data` are merged in server-side. */
export async function patchRecord<T>(
  env: Bindings,
  collection: string,
  id: number,
  data: Partial<T>,
): Promise<BaasRecord<T>> {
  const resp = await baasFetch(env, `/api/v1/data/${collection}/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ data }),
  });
  return parseJsonOrThrow(resp);
}

export async function deleteRecord(env: Bindings, collection: string, id: number): Promise<void> {
  const resp = await baasFetch(env, `/api/v1/data/${collection}/${id}`, { method: "DELETE" });
  if (!resp.ok && resp.status !== 404) await parseJsonOrThrow(resp);
}

/** Declares a set of fields that must be unique within a collection (enforced server-side). */
export async function setUniqueFields(env: Bindings, collection: string, uniqueFields: string[]): Promise<void> {
  const resp = await baasFetch(env, `/api/v1/collections/${collection}/schema`, {
    method: "PUT",
    body: JSON.stringify({ uniqueFields }),
  });
  await parseJsonOrThrow(resp);
}

/** Thrown by createRecord/patchRecord when a unique-field constraint is violated (HTTP 409). */
export function isDuplicateFieldError(err: unknown): err is BaasError {
  return err instanceof BaasError && err.status === 409;
}

// ── Object storage ──────────────────────────────────────────────────────────

export type StorageUploadInit = {
  uploadURL: string;
  objectPath: string;
  downloadUrl: string;
  fileId: number;
};

/** Step 1 of a storage upload: reserves an object and returns a signed upload URL. */
export async function initStorageUpload(
  env: Bindings,
  params: { name: string; size: number; contentType: string },
): Promise<StorageUploadInit> {
  const resp = await baasFetch(env, `/api/v1/storage/upload`, {
    method: "POST",
    body: JSON.stringify(params),
  });
  return parseJsonOrThrow(resp);
}

/** Step 2: PUTs the raw file bytes to the signed URL returned by initStorageUpload. */
export async function putStorageBytes(env: Bindings, uploadURL: string, body: BodyInit, contentType: string): Promise<void> {
  const url = `${resolveBaasBase(env)}${uploadURL}`;
  const req = new Request(url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body,
  });
  const resp = env.BAAS_SERVICE ? await env.BAAS_SERVICE.fetch(req) : await fetch(req);
  if (!resp.ok) throw new BaasError(await resp.text(), resp.status);
}

/** Uploads a File/Blob to BaaS storage in one call; returns the public download URL. */
export async function uploadFile(
  env: Bindings,
  file: File,
): Promise<{ downloadUrl: string; fileId: number }> {
  const init = await initStorageUpload(env, {
    name: file.name,
    size: file.size,
    contentType: file.type || "application/octet-stream",
  });
  await putStorageBytes(env, init.uploadURL, await file.arrayBuffer(), file.type || "application/octet-stream");
  return { downloadUrl: init.downloadUrl, fileId: init.fileId };
}

export async function deleteStorageFile(env: Bindings, fileId: number): Promise<void> {
  const resp = await baasFetch(env, `/api/v1/storage/${fileId}`, { method: "DELETE" });
  if (!resp.ok && resp.status !== 404) await parseJsonOrThrow(resp);
}

/** Fetches the raw bytes of a stored object directly from its public download URL. */
export async function fetchStorageBytes(downloadUrl: string): Promise<Response> {
  return fetch(downloadUrl);
}

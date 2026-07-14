/**
 * BaaS client for Node.js (api-server)
 * Mirrors artifacts/cloudflare-app/src/lib/baas.ts but reads credentials
 * from process.env instead of Cloudflare Worker Bindings.
 *
 * API contract:
 * - Records:  GET/POST /api/v1/data/:collection, GET/PATCH/DELETE /api/v1/data/:collection/:id
 * - Storage:  POST /api/v1/storage/upload → { uploadURL, downloadUrl, fileId }
 *             PUT <uploadURL> (signed path, relative to base URL)
 *             DELETE /api/v1/storage/:fileId
 * - Schema:   PUT /api/v1/collections/:collection/schema { uniqueFields }
 */

function baseUrl(): string {
  const url = process.env.BAAS_BASE_URL;
  if (!url) throw new Error("BAAS_BASE_URL is not set");
  return url;
}

function apiKey(): string {
  const key = process.env.BAAS_API_KEY;
  if (!key) throw new Error("BAAS_API_KEY is not set");
  return key;
}

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

async function baasFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      "X-API-Key": apiKey(),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
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

/** Fetches every record in a collection (paginating past the default limit). */
export async function listRecords<T>(collection: string): Promise<BaasRecord<T>[]> {
  const all: BaasRecord<T>[] = [];
  let offset = 0;
  while (true) {
    const resp = await baasFetch(`/api/v1/data/${collection}?limit=${PAGE_SIZE}&offset=${offset}`);
    const body = await parseJsonOrThrow(resp);
    all.push(...body.data);
    if (body.data.length < PAGE_SIZE || all.length >= body.total) break;
    offset += PAGE_SIZE;
  }
  return all;
}

export async function getRecord<T>(collection: string, id: number): Promise<BaasRecord<T> | null> {
  const resp = await baasFetch(`/api/v1/data/${collection}/${id}`);
  if (resp.status === 404) return null;
  return parseJsonOrThrow(resp);
}

export async function createRecord<T>(collection: string, data: T): Promise<BaasRecord<T>> {
  const resp = await baasFetch(`/api/v1/data/${collection}`, {
    method: "POST",
    body: JSON.stringify({ data }),
  });
  return parseJsonOrThrow(resp);
}

/** Partially updates a record — only the provided fields in `data` are merged in server-side. */
export async function patchRecord<T>(
  collection: string,
  id: number,
  data: Partial<T>,
): Promise<BaasRecord<T>> {
  const resp = await baasFetch(`/api/v1/data/${collection}/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ data }),
  });
  return parseJsonOrThrow(resp);
}

export async function deleteRecord(collection: string, id: number): Promise<void> {
  const resp = await baasFetch(`/api/v1/data/${collection}/${id}`, { method: "DELETE" });
  if (!resp.ok && resp.status !== 404) await parseJsonOrThrow(resp);
}

/** Declares a set of fields that must be unique within a collection (enforced server-side). */
export async function setUniqueFields(collection: string, uniqueFields: string[]): Promise<void> {
  const resp = await baasFetch(`/api/v1/collections/${collection}/schema`, {
    method: "PUT",
    body: JSON.stringify({ uniqueFields }),
  });
  await parseJsonOrThrow(resp);
}

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

/** Step 1: reserves an object and returns a signed upload URL. */
export async function initStorageUpload(params: {
  name: string;
  size: number;
  contentType: string;
}): Promise<StorageUploadInit> {
  const resp = await baasFetch(`/api/v1/storage/upload`, {
    method: "POST",
    body: JSON.stringify(params),
  });
  return parseJsonOrThrow(resp);
}

/** Step 2: PUTs the raw file bytes to the signed URL returned by initStorageUpload. */
export async function putStorageBytes(
  uploadURL: string,
  body: Buffer | ArrayBuffer,
  contentType: string,
): Promise<void> {
  const fullUrl = `${baseUrl()}${uploadURL}`;
  const resp = await fetch(fullUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body,
  });
  if (!resp.ok) throw new BaasError(await resp.text(), resp.status);
}

export async function deleteStorageFile(fileId: number): Promise<void> {
  const resp = await baasFetch(`/api/v1/storage/${fileId}`, { method: "DELETE" });
  if (!resp.ok && resp.status !== 404) await parseJsonOrThrow(resp);
}

/** Fetches the raw bytes of a stored object from its public download URL (no auth required). */
export async function fetchStorageBytes(downloadUrl: string): Promise<Response> {
  return fetch(downloadUrl);
}

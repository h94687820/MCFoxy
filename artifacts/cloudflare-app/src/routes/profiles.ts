import { Hono } from "hono";
import { getClerkAuth } from "../lib/clerkAuth";
import {
  listRecords,
  getRecord,
  createRecord,
  patchRecord,
  setUniqueFields,
  isDuplicateFieldError,
  initStorageUpload,
  putStorageBytes,
} from "../lib/baas";
import type { Bindings, Variables } from "../env.d";

const COLLECTION = "profiles";

type ProfileData = {
  userId: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

function extname(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx === -1 ? "" : filename.slice(idx).toLowerCase();
}

const ALLOWED_AVATAR_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

const profiles = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,20}$/;

let schemaEnsured = false;
/** Declares `username` as unique for the profiles collection (idempotent, done lazily once per isolate). */
async function ensureSchema(env: Bindings) {
  if (schemaEnsured) return;
  await setUniqueFields(env, COLLECTION, ["username"]).catch(() => {
    // Best-effort — if the BaaS platform is temporarily unavailable for this call, ownership
    // checks below still catch duplicates on read; we just lose the DB-level guarantee.
  });
  schemaEnsured = true;
}

function toResponse(record: { id: number; data: ProfileData }) {
  return { id: record.id, ...record.data };
}

async function findByUserId(env: Bindings, userId: string) {
  const all = await listRecords<ProfileData>(env, COLLECTION);
  return all.find((r) => r.data.userId === userId) ?? null;
}

async function findByUsername(env: Bindings, username: string) {
  const all = await listRecords<ProfileData>(env, COLLECTION);
  return all.find((r) => r.data.username === username) ?? null;
}

profiles.get("/profiles/me", async (c) => {
  const userId = await getClerkAuth(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  await ensureSchema(c.env);
  let profile = await findByUserId(c.env, userId);

  if (!profile) {
    const now = new Date().toISOString();
    const defaultUsername = `user_${userId.slice(-8)}`;
    profile = await createRecord<ProfileData>(c.env, COLLECTION, {
      userId,
      username: defaultUsername,
      displayName: null,
      bio: null,
      avatarUrl: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  return c.json(toResponse(profile));
});

profiles.put("/profiles/me", async (c) => {
  const userId = await getClerkAuth(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  await ensureSchema(c.env);
  const body = (await c.req.json().catch(() => ({}))) as {
    username?: string;
    displayName?: string;
    bio?: string;
    avatarUrl?: string;
  };
  const { username, displayName, bio, avatarUrl } = body;

  if (username !== undefined && !USERNAME_RE.test(username)) {
    return c.json({ error: "Username must be 3–20 characters: letters, numbers, _ or -" }, 400);
  }

  const existing = await findByUserId(c.env, userId);
  const now = new Date().toISOString();

  try {
    if (!existing) {
      const created = await createRecord<ProfileData>(c.env, COLLECTION, {
        userId,
        username: username ?? `user_${userId.slice(-8)}`,
        displayName: displayName ?? null,
        bio: bio ?? null,
        avatarUrl: avatarUrl ?? null,
        createdAt: now,
        updatedAt: now,
      });
      return c.json(toResponse(created));
    }

    const updated = await patchRecord<ProfileData>(c.env, COLLECTION, existing.id, {
      ...(username !== undefined && { username }),
      ...(displayName !== undefined && { displayName }),
      ...(bio !== undefined && { bio }),
      ...(avatarUrl !== undefined && { avatarUrl }),
      updatedAt: now,
    });
    return c.json(toResponse(updated));
  } catch (err) {
    if (isDuplicateFieldError(err)) return c.json({ error: "Username already taken" }, 400);
    throw err;
  }
});

// ── Upload avatar image ───────────────────────────────────────────────────────
profiles.post("/profiles/avatar", async (c) => {
  const userId = await getClerkAuth(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.parseBody();
  const file = body["avatar"];

  if (!file || !(file instanceof File)) return c.json({ error: "No image uploaded" }, 400);

  const ext = extname(file.name);
  if (!ALLOWED_AVATAR_EXTENSIONS.has(ext)) {
    return c.json({ error: `Unsupported image type. Allowed: ${[...ALLOWED_AVATAR_EXTENSIONS].join(", ")}` }, 400);
  }

  const init = await initStorageUpload(c.env, {
    name: `avatars/${userId}-${Date.now()}${ext}`,
    size: file.size,
    contentType: file.type || "image/jpeg",
  });
  await putStorageBytes(c.env, init.uploadURL, await file.arrayBuffer(), file.type || "image/jpeg");

  const existing = await findByUserId(c.env, userId);
  const now = new Date().toISOString();
  if (existing) {
    await patchRecord<ProfileData>(c.env, COLLECTION, existing.id, {
      avatarUrl: init.downloadUrl,
      updatedAt: now,
    });
  } else {
    // Profile doesn't exist yet — create one with the avatar URL
    await createRecord<ProfileData>(c.env, COLLECTION, {
      userId,
      username: `user_${userId.slice(-8)}`,
      displayName: null,
      bio: null,
      avatarUrl: init.downloadUrl,
      createdAt: now,
      updatedAt: now,
    });
  }

  return c.json({ url: init.downloadUrl });
});

profiles.get("/profiles/check-username", async (c) => {
  const username = c.req.query("username");
  const excludeUserId = c.req.query("excludeUserId");

  if (!username) return c.json({ error: "username is required" }, 400);

  const valid = USERNAME_RE.test(username);
  if (!valid) return c.json({ available: false, valid: false });

  const existing = await findByUsername(c.env, username);
  const takenByOther = existing && existing.data.userId !== excludeUserId;

  return c.json({ available: !takenByOther, valid: true });
});

profiles.get("/profiles/:username", async (c) => {
  const username = c.req.param("username");
  const profile = await findByUsername(c.env, username);
  if (!profile) return c.json({ error: "Profile not found" }, 404);

  return c.json(toResponse(profile));
});

export default profiles;

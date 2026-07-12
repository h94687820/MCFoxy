import { Hono } from "hono";
import { eq, and, ne } from "drizzle-orm";
import { StorageClient } from "@supabase/storage-js";
import { getDb, profilesTable } from "../db";
import { getClerkAuth } from "../lib/clerkAuth";
import type { Bindings, Variables } from "../env.d";

const BUCKET = "uploads";

function getStorage(env: Bindings) {
  return new StorageClient(`${env.SUPABASE_URL}/storage/v1`, {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  });
}

function extname(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx === -1 ? "" : filename.slice(idx).toLowerCase();
}

const ALLOWED_AVATAR_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

const profiles = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,20}$/;

profiles.get("/profiles/me", async (c) => {
  const userId = await getClerkAuth(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const db = getDb(c.env.DATABASE_URL);
  let [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId));

  if (!profile) {
    const defaultUsername = `user_${userId.slice(-8)}`;
    const [created] = await db
      .insert(profilesTable)
      .values({ userId, username: defaultUsername })
      .returning();
    profile = created;
  }

  return c.json(profile);
});

profiles.put("/profiles/me", async (c) => {
  const userId = await getClerkAuth(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const db = getDb(c.env.DATABASE_URL);
  const body = (await c.req.json().catch(() => ({}))) as {
    username?: string;
    displayName?: string;
    bio?: string;
    avatarUrl?: string;
  };
  const { username, displayName, bio, avatarUrl } = body;

  if (username !== undefined) {
    if (!USERNAME_RE.test(username)) {
      return c.json({ error: "Username must be 3–20 characters: letters, numbers, _ or -" }, 400);
    }

    const [taken] = await db
      .select()
      .from(profilesTable)
      .where(and(eq(profilesTable.username, username), ne(profilesTable.userId, userId)));

    if (taken) {
      return c.json({ error: "Username already taken" }, 400);
    }
  }

  const [existing] = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId));

  if (!existing) {
    const [created] = await db
      .insert(profilesTable)
      .values({
        userId,
        username: username ?? `user_${userId.slice(-8)}`,
        displayName: displayName ?? null,
        bio: bio ?? null,
        avatarUrl: avatarUrl ?? null,
      })
      .returning();
    return c.json(created);
  }

  const [updated] = await db
    .update(profilesTable)
    .set({
      ...(username !== undefined && { username }),
      ...(displayName !== undefined && { displayName }),
      ...(bio !== undefined && { bio }),
      ...(avatarUrl !== undefined && { avatarUrl }),
      updatedAt: new Date(),
    })
    .where(eq(profilesTable.userId, userId))
    .returning();

  return c.json(updated);
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

  const filename = `avatars/${userId}-${Date.now()}${ext}`;
  const storage = getStorage(c.env);
  const { error } = await storage.from(BUCKET).upload(filename, new Blob([await file.arrayBuffer()]), {
    contentType: file.type || "image/jpeg",
    upsert: true,
  });

  if (error) return c.json({ error: "Upload failed: " + error.message }, 500);

  const { data } = storage.from(BUCKET).getPublicUrl(filename);

  // Update profile avatarUrl
  const db = getDb(c.env.DATABASE_URL);
  const [existing] = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId));
  if (existing) {
    await db.update(profilesTable).set({ avatarUrl: data.publicUrl, updatedAt: new Date() }).where(eq(profilesTable.userId, userId));
  }

  return c.json({ url: data.publicUrl });
});

profiles.get("/profiles/check-username", async (c) => {
  const username = c.req.query("username");
  const excludeUserId = c.req.query("excludeUserId");

  if (!username) return c.json({ error: "username is required" }, 400);

  const valid = USERNAME_RE.test(username);
  if (!valid) return c.json({ available: false, valid: false });

  const db = getDb(c.env.DATABASE_URL);
  const conditions = excludeUserId
    ? and(eq(profilesTable.username, username), ne(profilesTable.userId, excludeUserId))
    : eq(profilesTable.username, username);

  const [existing] = await db.select().from(profilesTable).where(conditions);

  return c.json({ available: !existing, valid: true });
});

profiles.get("/profiles/:username", async (c) => {
  const username = c.req.param("username");
  const db = getDb(c.env.DATABASE_URL);

  const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.username, username));
  if (!profile) return c.json({ error: "Profile not found" }, 404);

  return c.json(profile);
});

export default profiles;

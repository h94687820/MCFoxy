import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, profilesTable } from "@workspace/db";
import { eq, and, ne } from "drizzle-orm";

const router = Router();

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,20}$/;

router.get("/profiles/me", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  let [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.userId, userId));

  if (!profile) {
    const defaultUsername = `user_${userId.slice(-8)}`;
    const [created] = await db
      .insert(profilesTable)
      .values({ userId, username: defaultUsername })
      .returning();
    profile = created;
  }

  return res.json(profile);
});

router.put("/profiles/me", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { username, displayName, bio, avatarUrl } = req.body as {
    username?: string;
    displayName?: string;
    bio?: string;
    avatarUrl?: string;
  };

  if (username !== undefined) {
    if (!USERNAME_RE.test(username)) {
      return res.status(400).json({
        error: "Username must be 3–20 characters: letters, numbers, _ or -",
      });
    }

    const [taken] = await db
      .select()
      .from(profilesTable)
      .where(and(eq(profilesTable.username, username), ne(profilesTable.userId, userId)));

    if (taken) {
      return res.status(400).json({ error: "Username already taken" });
    }
  }

  let [existing] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.userId, userId));

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
    return res.json(created);
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

  return res.json(updated);
});

router.get("/profiles/check-username", async (req, res) => {
  const { username, excludeUserId } = req.query as {
    username?: string;
    excludeUserId?: string;
  };

  if (!username) return res.status(400).json({ error: "username is required" });

  const valid = USERNAME_RE.test(username);
  if (!valid) {
    return res.json({ available: false, valid: false });
  }

  const conditions = excludeUserId
    ? and(eq(profilesTable.username, username), ne(profilesTable.userId, excludeUserId))
    : eq(profilesTable.username, username);

  const [existing] = await db.select().from(profilesTable).where(conditions);

  return res.json({ available: !existing, valid: true });
});

router.get("/profiles/:username", async (req, res) => {
  const { username } = req.params;

  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.username, username));

  if (!profile) return res.status(404).json({ error: "Profile not found" });

  return res.json(profile);
});

export default router;

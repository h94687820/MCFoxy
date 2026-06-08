import { Router } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateSettingsBody } from "@workspace/api-zod";

const router = Router();

async function getOrCreateSettings() {
  const [existing] = await db.select().from(settingsTable).limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(settingsTable)
    .values({ theme: "default", darkMode: true, virusTotalEnabled: true })
    .returning();
  return created;
}

router.get("/settings", async (_req, res) => {
  const settings = await getOrCreateSettings();
  return res.json(settings);
});

router.put("/settings", async (req, res) => {
  const parseResult = UpdateSettingsBody.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: "Invalid settings" });
  }

  const current = await getOrCreateSettings();

  const [updated] = await db
    .update(settingsTable)
    .set(parseResult.data)
    .where(eq(settingsTable.id, current.id))
    .returning();

  return res.json(updated);
});

export default router;

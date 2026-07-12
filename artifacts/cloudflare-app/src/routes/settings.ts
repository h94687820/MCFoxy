import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb, settingsTable } from "../db";
import { UpdateSettingsBody } from "@workspace/api-zod";
import type { Bindings, Variables } from "../env.d";

const settings = new Hono<{ Bindings: Bindings; Variables: Variables }>();

async function getOrCreateSettings(db: ReturnType<typeof getDb>) {
  const [existing] = await db.select().from(settingsTable).limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(settingsTable)
    .values({ theme: "default", darkMode: true, virusTotalEnabled: true })
    .returning();
  return created;
}

settings.get("/settings", async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  return c.json(await getOrCreateSettings(db));
});

settings.put("/settings", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parseResult = UpdateSettingsBody.safeParse(body);
  if (!parseResult.success) {
    return c.json({ error: "Invalid settings" }, 400);
  }

  const db = getDb(c.env.DATABASE_URL);
  const current = await getOrCreateSettings(db);

  const [updated] = await db
    .update(settingsTable)
    .set(parseResult.data)
    .where(eq(settingsTable.id, current.id))
    .returning();

  return c.json(updated);
});

export default settings;

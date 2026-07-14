import { Hono } from "hono";
import { UpdateSettingsBody } from "@workspace/api-zod";
import { listRecords, createRecord, patchRecord } from "../lib/baas";
import type { Bindings, Variables } from "../env.d";

const COLLECTION = "settings";

type SettingsData = {
  theme: string;
  darkMode: boolean;
  virusTotalEnabled: boolean;
};

const settings = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function toResponse(record: { id: number; data: SettingsData }) {
  return { id: record.id, ...record.data };
}

async function getOrCreateSettings(env: Bindings) {
  const all = await listRecords<SettingsData>(env, COLLECTION);
  if (all.length > 0) return all[0];

  return createRecord<SettingsData>(env, COLLECTION, {
    theme: "default",
    darkMode: true,
    virusTotalEnabled: true,
  });
}

settings.get("/settings", async (c) => {
  return c.json(toResponse(await getOrCreateSettings(c.env)));
});

settings.put("/settings", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parseResult = UpdateSettingsBody.safeParse(body);
  if (!parseResult.success) {
    return c.json({ error: "Invalid settings" }, 400);
  }

  const current = await getOrCreateSettings(c.env);
  const updated = await patchRecord<SettingsData>(c.env, COLLECTION, current.id, parseResult.data);

  return c.json(toResponse(updated));
});

export default settings;

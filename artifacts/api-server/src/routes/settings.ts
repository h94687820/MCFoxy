import { Router } from "express";
import { UpdateSettingsBody } from "@workspace/api-zod";
import { listRecords, createRecord, patchRecord } from "../lib/baas";

const router = Router();

const COLLECTION = "settings";

type SettingsData = {
  theme: string;
  darkMode: boolean;
  virusTotalEnabled: boolean;
};

function toResponse(record: { id: number; data: SettingsData }) {
  return { id: record.id, ...record.data };
}

async function getOrCreateSettings() {
  const all = await listRecords<SettingsData>(COLLECTION);
  if (all.length > 0) return all[0];
  return createRecord<SettingsData>(COLLECTION, {
    theme: "default",
    darkMode: true,
    virusTotalEnabled: true,
  });
}

router.get("/settings", async (_req, res) => {
  return res.json(toResponse(await getOrCreateSettings()));
});

router.put("/settings", async (req, res) => {
  const parseResult = UpdateSettingsBody.safeParse(req.body);
  if (!parseResult.success) return res.status(400).json({ error: "Invalid settings" });

  const current = await getOrCreateSettings();
  const updated = await patchRecord<SettingsData>(COLLECTION, current.id, parseResult.data);
  return res.json(toResponse(updated));
});

export default router;

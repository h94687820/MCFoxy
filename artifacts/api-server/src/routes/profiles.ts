import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { getAuth } from "@clerk/express";
import {
  listRecords,
  createRecord,
  patchRecord,
  setUniqueFields,
  isDuplicateFieldError,
  initStorageUpload,
  putStorageBytes,
  deleteStorageFile,
} from "../lib/baas";

const router = Router();

const COLLECTION = "profiles";
const USERNAME_RE = /^[a-zA-Z0-9_-]{3,20}$/;
const ALLOWED_AVATAR_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

// ── Temp storage for avatar uploads ─────────────────────────────────────────
const tmpDir = path.join(process.cwd(), "tmp");
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, tmpDir),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${unique}${path.extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ALLOWED_AVATAR_EXTENSIONS.has(path.extname(file.originalname).toLowerCase()));
  },
});

type ProfileData = {
  userId: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

function toResponse(record: { id: number; data: ProfileData }) {
  return { id: record.id, ...record.data };
}

async function findByUserId(userId: string) {
  const all = await listRecords<ProfileData>(COLLECTION);
  return all.find((r) => r.data.userId === userId) ?? null;
}

async function findByUsername(username: string) {
  const all = await listRecords<ProfileData>(COLLECTION);
  return all.find((r) => r.data.username === username) ?? null;
}

let schemaEnsured = false;
async function ensureSchema() {
  if (schemaEnsured) return;
  await setUniqueFields(COLLECTION, ["username"]).catch(() => {});
  schemaEnsured = true;
}

// ── Avatar upload ────────────────────────────────────────────────────────────
router.post("/profiles/avatar", avatarUpload.single("avatar"), async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!req.file) return res.status(400).json({ error: "No avatar file uploaded, or file type not allowed" });

  const tmpFile = req.file;
  try {
    const ext = path.extname(tmpFile.originalname).toLowerCase();
    const name = `avatars/${userId}-${Date.now()}${ext}`;
    const fileBuffer = fs.readFileSync(tmpFile.path);
    const init = await initStorageUpload({ name, size: tmpFile.size, contentType: tmpFile.mimetype || "image/jpeg" });
    await putStorageBytes(init.uploadURL, fileBuffer, tmpFile.mimetype || "image/jpeg");

    const existing = await findByUserId(userId);
    if (existing) {
      // Delete old avatar from storage if it exists
      if (existing.data.avatarUrl && (existing as any).data.avatarFileId) {
        await deleteStorageFile((existing as any).data.avatarFileId).catch(() => {});
      }
      await patchRecord<ProfileData>(COLLECTION, existing.id, {
        avatarUrl: init.downloadUrl,
        updatedAt: new Date().toISOString(),
      });
    } else {
      const now = new Date().toISOString();
      await createRecord<ProfileData>(COLLECTION, {
        userId,
        username: `user_${userId.slice(-8)}`,
        displayName: null,
        bio: null,
        avatarUrl: init.downloadUrl,
        createdAt: now,
        updatedAt: now,
      });
    }

    return res.json({ url: init.downloadUrl });
  } finally {
    if (fs.existsSync(tmpFile.path)) fs.unlinkSync(tmpFile.path);
  }
});

// ── Get my profile ────────────────────────────────────────────────────────────
router.get("/profiles/me", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  await ensureSchema();
  let profile = await findByUserId(userId);

  if (!profile) {
    const now = new Date().toISOString();
    profile = await createRecord<ProfileData>(COLLECTION, {
      userId,
      username: `user_${userId.slice(-8)}`,
      displayName: null,
      bio: null,
      avatarUrl: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  return res.json(toResponse(profile));
});

// ── Update my profile ─────────────────────────────────────────────────────────
router.put("/profiles/me", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  await ensureSchema();
  const { username, displayName, bio, avatarUrl } = req.body as {
    username?: string;
    displayName?: string;
    bio?: string;
    avatarUrl?: string;
  };

  if (username !== undefined && !USERNAME_RE.test(username)) {
    return res.status(400).json({ error: "Username must be 3–20 characters: letters, numbers, _ or -" });
  }

  const existing = await findByUserId(userId);
  const now = new Date().toISOString();

  try {
    if (!existing) {
      const created = await createRecord<ProfileData>(COLLECTION, {
        userId,
        username: username ?? `user_${userId.slice(-8)}`,
        displayName: displayName ?? null,
        bio: bio ?? null,
        avatarUrl: avatarUrl ?? null,
        createdAt: now,
        updatedAt: now,
      });
      return res.json(toResponse(created));
    }

    const updated = await patchRecord<ProfileData>(COLLECTION, existing.id, {
      ...(username !== undefined && { username }),
      ...(displayName !== undefined && { displayName }),
      ...(bio !== undefined && { bio }),
      ...(avatarUrl !== undefined && { avatarUrl }),
      updatedAt: now,
    });
    return res.json(toResponse(updated));
  } catch (err) {
    if (isDuplicateFieldError(err)) return res.status(400).json({ error: "Username already taken" });
    throw err;
  }
});

// ── Check username availability ───────────────────────────────────────────────
router.get("/profiles/check-username", async (req, res) => {
  const { username, excludeUserId } = req.query as { username?: string; excludeUserId?: string };
  if (!username) return res.status(400).json({ error: "username is required" });

  const valid = USERNAME_RE.test(username);
  if (!valid) return res.json({ available: false, valid: false });

  const existing = await findByUsername(username);
  const takenByOther = existing && existing.data.userId !== excludeUserId;
  return res.json({ available: !takenByOther, valid: true });
});

// ── Get public profile by username ────────────────────────────────────────────
router.get("/profiles/:username", async (req, res) => {
  const profile = await findByUsername(req.params.username);
  if (!profile) return res.status(404).json({ error: "Profile not found" });
  return res.json(toResponse(profile));
});

export default router;

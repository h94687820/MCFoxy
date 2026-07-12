import { defineConfig } from "drizzle-kit";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_DATABASE_URL = "postgresql://localhost:5432/postgres";

if (!process.env.NEON_DATABASE_URL) {
  console.warn(
    "NEON_DATABASE_URL was not provided. Falling back to a default connection string; drizzle-kit commands will fail until a real database is provisioned.",
  );
}

// Connection strings pasted from some UIs pick up stray internal whitespace
// (e.g. a wrapped host segment); strip it defensively since a bare
// postgres:// URL never legitimately contains whitespace.
const sanitizedUrl = (process.env.NEON_DATABASE_URL || DEFAULT_DATABASE_URL).replace(/\s+/g, "");

export default defineConfig({
  schema: path.join(__dirname, "../../lib/db/src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: sanitizedUrl,
  },
});

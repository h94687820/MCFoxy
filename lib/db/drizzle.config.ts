import { defineConfig } from "drizzle-kit";
import path from "path";

const DEFAULT_DATABASE_URL = "postgresql://localhost:5432/postgres";

if (!process.env.DATABASE_URL) {
  console.warn(
    "DATABASE_URL was not provided. Falling back to a default connection string; drizzle-kit commands will fail until a real database is provisioned.",
  );
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || DEFAULT_DATABASE_URL,
  },
});

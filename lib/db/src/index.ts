import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const DEFAULT_DATABASE_URL = "postgresql://localhost:5432/postgres";

if (!process.env.DATABASE_URL) {
  console.warn(
    "DATABASE_URL was not provided. Falling back to a default connection string; database operations will fail until a real database is provisioned.",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || DEFAULT_DATABASE_URL,
});
export const db = drizzle(pool, { schema });

export * from "./schema";

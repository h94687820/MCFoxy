import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
// Schema definitions are plain drizzle-orm/pg-core table declarations with no
// Node-specific driver code, so they're safe to import directly into the
// Workers runtime and stay in sync with the Replit-hosted app's schema.
import * as schema from "@workspace/db/schema";

export function getDb(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}

export * from "@workspace/db/schema";

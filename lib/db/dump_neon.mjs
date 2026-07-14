import pg from "pg";

const { Client } = pg;
const url = process.env.NEON_DATABASE_URL;
if (!url) {
  console.error("NO_NEON_DATABASE_URL");
  process.exit(1);
}

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const files = (await client.query("SELECT * FROM files ORDER BY id")).rows;
const profiles = (await client.query("SELECT * FROM profiles ORDER BY id")).rows;
const settings = (await client.query("SELECT * FROM settings ORDER BY id")).rows;

await client.end();

const fs = await import("node:fs/promises");
await fs.writeFile(
  "/tmp/neon_dump.json",
  JSON.stringify({ files, profiles, settings }, null, 2),
);

console.log(
  JSON.stringify({
    filesCount: files.length,
    profilesCount: profiles.length,
    settingsCount: settings.length,
  }),
);

// Writes a local .dev.vars file (gitignored) for `wrangler dev`, sourced
// from this Repl's environment secrets. Never commit .dev.vars.
import { writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const keys = [
  "NEON_DATABASE_URL",
  "CLERK_SECRET_KEY",
  "CLERK_PUBLISHABLE_KEY",
  "DEEPAI_API_KEY",
  "VIRUSTOTAL_API_KEY",
];

const lines = keys
  .filter((k) => process.env[k])
  .map((k) => {
    // NEON_DATABASE_URL (and possibly others pasted through the same UI) can
    // pick up stray internal whitespace; strip it since it's never valid in
    // a real connection string / API key.
    const value = process.env[k].replace(/\s+/g, "");
    return `${k === "NEON_DATABASE_URL" ? "DATABASE_URL" : k}=${value}`;
  });

writeFileSync(path.join(__dirname, "../.dev.vars"), lines.join("\n") + "\n");
console.log(`Wrote .dev.vars with ${lines.length} of ${keys.length} keys present.`);

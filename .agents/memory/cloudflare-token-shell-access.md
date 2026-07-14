---
name: Secrets can go empty in shells until re-saved
description: Any project secret (not just CLOUDFLARE_API_TOKEN) can show up empty in ShellExec/process.env even though viewEnvVars lists it as existing — re-request via requestSecrets before concluding a feature is blocked
---

**Update (2026-07-14):** confirmed this is not Cloudflare-specific. In one session, `NEON_DATABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `CLOUDFLARE_API_TOKEN`, `DEEPAI_API_KEY`, and `VIRUSTOTAL_API_KEY` were
ALL empty strings in `ShellExec` env (`printenv` showed the key with no value) even though
`viewEnvVars({type:"secret"})` reported all of them as existing. Meanwhile `CLERK_SECRET_KEY` in the
same shell had a real value. Re-requesting the empty ones via `requestSecrets` fixed them immediately —
no code or platform change needed. Also note: secrets are not exposed inside CodeExecution's
`"use impure"` `process.env` at all (always undefined there); only real app processes and `ShellExec`
see them, and even then a stale/never-really-saved secret shows as an empty string, not an error.

**How to apply:** before concluding any secret-gated feature (deploy tokens, external DB URLs, storage
keys, etc.) is broken or unreachable, check with `printenv` / `${#VAR}` in `ShellExec` first. If a listed
secret comes back empty, don't assume a platform restriction — call `requestSecrets` for that key and
recheck.

Earlier investigation (2026-07-12) found `CLOUDFLARE_API_TOKEN` empty in both agent `ShellExec`
and the user's own Shell tab, causing `wrangler` to fall back to interactive OAuth login (which
hangs forever — the OAuth callback needs a `localhost` port only reachable on a real external
machine, not inside the Replit container).

**Correction:** after the user rolled/regenerated the token in the Cloudflare dashboard and
re-saved it via the secure `requestSecrets` flow, `CLOUDFLARE_API_TOKEN` showed up correctly in
shell env and `wrangler whoami` / `wrangler deploy` worked directly from Replit's own shell —
no OAuth, no external machine needed.

**Why:** the original value was apparently never a valid, properly-saved secret (e.g. stale/
placeholder), not because Replit blocks this class of secret from shells. Don't assume a secret
is platform-blocked just because one shell check shows it empty — a fresh `requestSecrets` round
can fix it outright.

**How to apply:** if a Cloudflare (or similar external-provider) deploy command falls back to
interactive OAuth, first check whether the token secret is actually populated/valid before
concluding it's an architectural restriction — re-request it via `requestSecrets` and recheck
`env` before telling the user it can only be done from their own machine.

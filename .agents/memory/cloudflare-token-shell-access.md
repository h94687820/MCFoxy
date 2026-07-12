---
name: Cloudflare token shell access
description: CLOUDFLARE_API_TOKEN reaches shells fine once it's a real, valid secret value — earlier "missing" symptom was a stale/invalid secret, not a platform block
---

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

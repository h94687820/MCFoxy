---
name: Cloudflare token not available in any shell
description: Why `wrangler deploy` / `wrangler login` cannot be automated from Replit shells for this project
---

`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` exist as configured secrets (visible in
the secrets list) but are **not** injected into process env for either the agent's `ShellExec`
or the user's own Replit Shell tab — confirmed by direct `env` checks in both contexts on
2026-07-12. Other secrets (`NEON_DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`)
were accessible in the same checks, so this isn't a blanket secrets outage — it looks like a
deliberate boundary specifically around tokens that grant broad external cloud-account control.

**Why:** Because the token is missing, `wrangler` falls back to interactive OAuth login, which
opens a browser URL whose callback must hit a `localhost` port — but that port lives inside the
Replit container and is not reachable from the public internet, so the OAuth flow hangs forever
("Port opened, but not exposed to the web").

**How to apply:** Don't try to route around this by testing more shell contexts, spawning
temp workflows, or hunting for stored wrangler credentials — already ruled out (no
`~/.wrangler` config with a stored token exists either). `wrangler deploy`/`wrangler login`
for this project can only succeed if run from a real terminal outside Replit (the user's own
machine), or by switching the deployment target to Replit's native Publish flow, which needs
no external token.

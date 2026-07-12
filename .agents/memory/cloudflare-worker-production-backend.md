---
name: Cloudflare Worker is a separate production backend
description: artifacts/cloudflare-app is a hand-rolled Hono/Workers reimplementation of artifacts/api-server, deployed independently via wrangler — fixes to api-server do not reach production until ported here and redeployed.
---

## The architecture
- `artifacts/cloudflare-app` (Hono, Workers runtime) is the **actual production backend** for this project's Cloudflare deployment — reached via `workers.dev` subdomain, deployed with `pnpm --filter @workspace/cloudflare-app run deploy` (wrangler), NOT through Replit's own Deployments/publish flow.
- `artifacts/api-server` (Express) only serves the Replit dev preview. It shares the same `@workspace/db` schema but its **route handlers are hand-duplicated, not imported** — `cloudflare-app/src/routes/*.ts` reimplements files/profiles/settings routes from scratch for the Workers runtime (no Node APIs).
- **Any backend fix (new fields, new endpoints, validation changes) made in `api-server` must be manually ported into the matching `cloudflare-app/src/routes/*.ts` file**, or production silently stays on old behavior even though the Replit preview looks fixed.

**Why:** there is no shared route-handler code between the two backends — only the DB schema and zod contracts are shared. This was invisible until inspecting `artifacts/cloudflare-app` directly; it wasn't in the originally-registered artifacts list shown at session start.

## Clerk auth on the Workers domain
- `cloudflare-app/src/index.ts` proxies Clerk's Frontend API at `/api/__clerk` (ported from the Express `clerkProxyMiddleware`), needed because the `*.workers.dev` domain has no CNAME to Clerk and no custom zone.
- The frontend's `ClerkProvider` reads `proxyUrl` from `import.meta.env.VITE_CLERK_PROXY_URL` — per the clerk-auth skill this is normally **auto-populated by Replit's own publish pipeline**, which never runs here since deploys go through wrangler instead.
- Fix: set `VITE_CLERK_PROXY_URL=https://<workers-subdomain>.workers.dev/api/__clerk` explicitly in `cloudflare-app/package.json`'s `build` script (inline env var prefix on the `pnpm --filter minecraft-hub run build` call). Without it, every authenticated action (upload, avatar change, etc.) fails with "Unauthorized" **only in the Cloudflare-deployed production**, never in the Replit dev preview — because dev talks to Clerk directly and doesn't need the proxy.
- Get the workers.dev subdomain via `curl https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/subdomain` (with `CLOUDFLARE_API_TOKEN`); confirm no custom domain/zone is attached before assuming the workers.dev URL is canonical.

## CLOUDFLARE_API_TOKEN accessibility (supersedes older note)
- As of 2026-07-12, `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` **are** readable from the agent shell and `wrangler deploy`/`wrangler whoami`/Cloudflare API calls work directly — re-check token access before assuming deploys can't be automated; this constraint may have been temporary or account-specific.

---
name: Clerk proxy breaks with dev keys
description: Clerk's Frontend API proxy feature (proxyUrl / Clerk-Proxy-Url header) rejects requests with "Invalid host" when the publishable key is a Development instance (pk_test_...); only Production instances (pk_live_...) with a dashboard-verified proxy domain support it.
---

## The rule
Never route Clerk Frontend API calls through a custom same-origin proxy when the publishable key is `pk_test_...` (a Development instance). Let the browser talk to Clerk's own domain directly instead — dev instances already allow cross-origin calls from any origin, so no proxy is needed.

**Why:** Clerk's proxy feature requires a Production instance with the proxy domain explicitly verified in the Clerk Dashboard. A dev-instance key sent through any reverse proxy gets rejected at Clerk's edge with `{"code":"host_invalid","message":"Invalid host"}` on every Frontend API call (client bootstrap, sign-in, sign-out, profile) — this silently breaks all auth UI while the page still renders normally, since the failure only shows up in the network tab, not as a visible layout bug.

**How to apply:**
- Diagnostic signal: curl the proxy path's Clerk client endpoint (e.g. `<domain>/api/__clerk/v1/client?__clerk_api_version=...`) — a 400 with `host_invalid` confirms this exact issue.
- Check the key type before touching proxy code: `grep -o "pk_[a-zA-Z0-9_]*" <bundled JS>` — if it's `pk_test_`, remove/skip the proxy for that deployment target rather than trying to "fix" the proxy config.
- This project's Express middleware (`clerkProxyMiddleware.ts`) already guards this correctly by only proxying when `NODE_ENV === "production"`; any other deployment target (e.g. a separate Cloudflare Worker) that reimplements the proxy must carry the same guard, or simply not proxy at all when no `pk_live_` key exists.
- Fix applied once: dropped `VITE_CLERK_PROXY_URL` from the build step entirely so `ClerkProvider`'s `proxyUrl` prop is `undefined`, letting Clerk connect directly to its own `*.clerk.accounts.dev` domain.

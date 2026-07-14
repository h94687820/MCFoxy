import { Hono } from "hono";
import health from "./routes/health";
import files from "./routes/files";
import profiles from "./routes/profiles";
import settings from "./routes/settings";
import type { Bindings, Variables } from "./env.d";
import { BaasError } from "./lib/baas";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── Global JSON error handler ─────────────────────────────────────────────────
// Catches unhandled exceptions from route handlers and returns a structured
// JSON response instead of Cloudflare's generic "Internal Server Error" HTML.
app.onError((err, c) => {
  if (err instanceof BaasError) {
    return c.json({ error: err.message }, err.status as 400 | 401 | 403 | 404 | 409 | 500 | 503);
  }
  console.error("Unhandled error:", err);
  return c.json({ error: err instanceof Error ? err.message : "Internal server error" }, 500);
});

// NOTE: Clerk proxy removed — it only works with pk_live (production) keys.
// With pk_test (development) keys it returns "host_invalid". The frontend
// connects directly to Clerk's FAPI without going through a proxy.

app.route("/api", health);
app.route("/api", files);
app.route("/api", profiles);
app.route("/api", settings);

// ── Temporary auth debug endpoint (remove after diagnosis) ───────────────────
app.get("/api/debug-auth", async (c) => {
  const authHeader = c.req.header("Authorization") ?? "(none)";
  const hasSecret = !!c.env.CLERK_SECRET_KEY;
  const secretPrefix = c.env.CLERK_SECRET_KEY?.slice(0, 12) ?? "(empty)";

  if (!authHeader.startsWith("Bearer ")) {
    return c.json({ error: "no Bearer token in request", authHeader, hasSecret, secretPrefix });
  }

  const token = authHeader.slice(7).trim();
  const { verifyToken } = await import("@clerk/backend");

  try {
    const payload = await verifyToken(token, { secretKey: c.env.CLERK_SECRET_KEY });
    return c.json({ ok: true, userId: (payload as any).sub, payload });
  } catch (err) {
    return c.json({
      error: err instanceof Error ? err.message : String(err),
      tokenPrefix: token.slice(0, 30),
      hasSecret,
      secretPrefix,
    }, 401);
  }
});

// Anything else falls through to the static assets binding (the built
// minecraft-hub SPA), configured with `not_found_handling =
// "single-page-application"` in wrangler.toml so client-side routes resolve
// to index.html.
app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;

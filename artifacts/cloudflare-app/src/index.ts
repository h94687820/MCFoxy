import { Hono } from "hono";
import health from "./routes/health";
import files from "./routes/files";
import profiles from "./routes/profiles";
import settings from "./routes/settings";
import type { Bindings, Variables } from "./env.d";
import { BaasError } from "./lib/baas";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── Global error handler ──────────────────────────────────────────────────────
app.onError((err, c) => {
  if (err instanceof BaasError) {
    return c.json(
      { error: err.message },
      err.status as 400 | 401 | 403 | 404 | 409 | 500 | 503,
    );
  }
  console.error("[app] Unhandled error:", err);
  return c.json(
    { error: err instanceof Error ? err.message : "Internal server error" },
    500,
  );
});

app.route("/api", health);
app.route("/api", files);
app.route("/api", profiles);
app.route("/api", settings);

// Serve the built minecraft-hub SPA for all other routes.
// not_found_handling = "single-page-application" in wrangler.toml handles
// client-side routes by returning index.html.
app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;

import { Hono } from "hono";
import health from "./routes/health";
import files from "./routes/files";
import profiles from "./routes/profiles";
import settings from "./routes/settings";
import type { Bindings, Variables } from "./env.d";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const CLERK_FAPI = "https://frontend-api.clerk.dev";
const CLERK_PROXY_PATH = "/api/__clerk";

/**
 * Reverse-proxies Clerk's Frontend API through this domain, mirroring the
 * Express `clerkProxyMiddleware` used on Replit — lets Clerk auth work on a
 * custom/workers.dev domain without CNAME DNS configuration. Ported to plain
 * `fetch` since `http-proxy-middleware` is Node-only and doesn't run on
 * Workers.
 */
app.all(`${CLERK_PROXY_PATH}/*`, async (c) => {
  const url = new URL(c.req.url);
  const targetPath = url.pathname.replace(CLERK_PROXY_PATH, "");
  const target = `${CLERK_FAPI}${targetPath}${url.search}`;

  const forwardedHost =
    c.req.header("x-forwarded-host")?.split(",")[0]?.trim() || c.req.header("host") || "";
  const protocol = c.req.header("x-forwarded-proto") || "https";

  const headers = new Headers(c.req.raw.headers);
  headers.set("Clerk-Proxy-Url", `${protocol}://${forwardedHost}${CLERK_PROXY_PATH}`);
  headers.set("Clerk-Secret-Key", c.env.CLERK_SECRET_KEY);
  headers.delete("host");

  const resp = await fetch(target, {
    method: c.req.method,
    headers,
    body: ["GET", "HEAD"].includes(c.req.method) ? undefined : c.req.raw.body,
    // @ts-expect-error - Workers-specific fetch option required for streaming request bodies
    duplex: "half",
  });

  return new Response(resp.body, { status: resp.status, headers: resp.headers });
});

app.route("/api", health);
app.route("/api", files);
app.route("/api", profiles);
app.route("/api", settings);

// Anything else falls through to the static assets binding (the built
// minecraft-hub SPA), configured with `not_found_handling =
// "single-page-application"` in wrangler.toml so client-side routes resolve
// to index.html.
app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;

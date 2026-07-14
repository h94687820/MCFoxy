import { createClerkClient, verifyToken } from "@clerk/backend";
import type { Context, Next } from "hono";
import type { Bindings, Variables } from "../env.d";

/**
 * Verifies the Clerk session for the incoming request.
 *
 * Strategy:
 * 1. If there is an `Authorization: Bearer <token>` header (sent by the SPA
 *    on Cloudflare via `useAuth().getToken()`), verify the raw session JWT
 *    directly with `verifyToken` — this is the correct edge-compatible path
 *    for client→API calls and does NOT rely on cookies.
 * 2. Fall back to `authenticateRequest` for cookie-based sessions (used in
 *    the Replit dev environment where everything is on the same origin).
 */
export async function getClerkAuth(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
): Promise<string | null> {
  // ── 1. Bearer token (Cloudflare / cross-origin SPA) ──────────────────────
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    try {
      const payload = await verifyToken(token, {
        secretKey: c.env.CLERK_SECRET_KEY,
      });
      return payload.sub ?? null;
    } catch {
      return null;
    }
  }

  // ── 2. Cookie-based session (Replit dev / same-origin) ────────────────────
  const clerkClient = createClerkClient({
    secretKey: c.env.CLERK_SECRET_KEY,
    publishableKey: c.env.CLERK_PUBLISHABLE_KEY,
  });

  const requestState = await clerkClient.authenticateRequest(c.req.raw, {
    authorizedParties: undefined,
  });

  if (!requestState.isSignedIn) return null;
  const auth = requestState.toAuth();
  return auth?.userId ?? null;
}

export async function requireAuth(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  next: Next,
) {
  const userId = await getClerkAuth(c);
  if (!userId) {
    return c.json({ error: "Unauthorized — please sign in" }, 401);
  }
  c.set("userId", userId);
  await next();
}

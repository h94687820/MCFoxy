import { verifyToken } from "@clerk/backend";
import type { Context, Next } from "hono";
import type { Bindings, Variables } from "../env.d";

/**
 * Reads the Clerk Bearer token from the Authorization header and verifies it.
 * Returns the userId (sub claim) on success, null on failure.
 *
 * The frontend sends Authorization: Bearer <token> via ClerkTokenBridge in App.tsx,
 * which calls useAuth().getToken() before every API request.
 */
export async function getClerkUserId(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
): Promise<string | null> {
  const secretKey = c.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    console.error("[clerk] CLERK_SECRET_KEY is not configured");
    return null;
  }

  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7).trim();
  if (!token) return null;

  try {
    const payload = await verifyToken(token, { secretKey });
    return (payload as { sub?: string }).sub ?? null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[clerk] token verification failed:", msg);
    return null;
  }
}

/** Middleware: requires a valid Clerk session. Sets c.var.userId on success. */
export async function requireAuth(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  next: Next,
) {
  const userId = await getClerkUserId(c);
  if (!userId) {
    return c.json({ error: "Unauthorized — please sign in" }, 401);
  }
  c.set("userId", userId);
  await next();
}

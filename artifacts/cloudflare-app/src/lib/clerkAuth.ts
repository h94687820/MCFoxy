import { verifyToken } from "@clerk/backend";
import type { Context, Next } from "hono";
import type { Bindings, Variables } from "../env.d";

/**
 * Verifies a Clerk Bearer token sent in the `Authorization: Bearer <token>` header.
 *
 * Uses `verifyToken` from @clerk/backend, which:
 *  1. Extracts the `kid` from the JWT header.
 *  2. Fetches the matching public key from Clerk's Backend API (https://api.clerk.com/v1/jwks)
 *     using `secretKey` for authentication — NO publishableKey needed.
 *  3. Verifies the JWT signature and standard claims (exp, nbf, iss).
 *  4. Returns the payload, from which we extract `sub` (the Clerk userId).
 *
 * Why not `authenticateRequest`?
 *   `authenticateRequest` is designed for browser/cookie-based sessions and implements
 *   a 3-way "handshake" flow. When it receives a Bearer token it may return status
 *   "handshake" instead of "signed-in", causing a spurious 401 for logged-in users.
 *   For API routes that receive Bearer tokens, `verifyToken` is the correct tool.
 */
export async function getClerkAuth(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
): Promise<string | null> {
  if (!c.env.CLERK_SECRET_KEY) {
    console.error("CLERK_SECRET_KEY is not configured");
    return null;
  }

  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7).trim();
  if (!token) return null;

  try {
    const payload = await verifyToken(token, {
      secretKey: c.env.CLERK_SECRET_KEY,
    });
    const sub = (payload as { sub?: string }).sub ?? null;
    console.log("Clerk verifyToken success, userId:", sub);
    return sub;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Clerk verifyToken failed:", msg, "| token prefix:", token.slice(0, 20), "| secretKey set:", !!c.env.CLERK_SECRET_KEY, "| secretKey prefix:", c.env.CLERK_SECRET_KEY?.slice(0, 10));
    return null;
  }
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

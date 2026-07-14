import { createClerkClient } from "@clerk/backend";
import type { Context, Next } from "hono";
import type { Bindings, Variables } from "../env.d";

/**
 * Verifies the Clerk session for the incoming request.
 *
 * Uses `authenticateRequest` from the Clerk backend SDK, which handles both:
 * - `Authorization: Bearer <token>` headers  (sent by the SPA on Cloudflare)
 * - `__session` / `__client_uat` cookies      (sent in same-origin dev flows)
 *
 * Previously we used a manual `verifyToken` path for Bearer tokens, but that
 * fails silently on Cloudflare because `verifyToken` without `publishableKey`
 * cannot determine the JWKS endpoint and always throws → 401 for logged-in users.
 */
export async function getClerkAuth(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
): Promise<string | null> {
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

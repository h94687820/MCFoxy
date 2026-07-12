import { createClerkClient } from "@clerk/backend";
import type { Context, Next } from "hono";
import type { Bindings, Variables } from "../env.d";

/**
 * Verifies the Clerk session for the incoming request (cookie or Bearer
 * token) and stashes the userId on the context. Ported from the Express
 * `getAuth(req)` + `clerkMiddleware` pattern used in artifacts/api-server —
 * @clerk/backend's `authenticateRequest` is the Workers/edge-compatible
 * equivalent (no Node-specific APIs).
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

---
name: Clerk Auth setup
description: Clerk provisioned for ModVault; Google OAuth, Tailwind v4 layer quirks, and file ownership guard pattern
---

## Clerk is provisioned (Replit-managed)
- `setupClerkWhitelabelAuth()` was called; keys are auto-set in secrets
- Google OAuth is enabled by default — no code change needed
- Development mode warning ("pk_test…") in console is expected and harmless

## Tailwind v4 + Clerk layer order (CRITICAL)
In `index.css`, `@layer theme, base, clerk, components, utilities` MUST come before `@import "tailwindcss"`.
Also `tailwindcss({ optimize: false })` in `vite.config.ts` prevents clerk theme layer reordering in prod builds.

## Clerk appearance
- Uses `shadcn` base theme from `@clerk/themes`
- `cssLayerName: "clerk"` to integrate with Tailwind v4 layers
- `publishableKeyFromHost` from `@clerk/react/internal` — never raw env var
- `proxyUrl={clerkProxyUrl}` is unconditional (empty in dev, auto-set in prod)

## File ownership pattern
- `uploadedBy: text("uploaded_by")` column in `filesTable` stores Clerk `userId`
- API: `requireAuth` middleware reads `getAuth(req).userId` from `@clerk/express`
- Upload route stores `uploadedBy: userId` on insert
- PATCH + DELETE check `file.uploadedBy !== userId` → 403
- Frontend: `const isOwner = !!user && file.uploadedBy === user.id` (from `useUser()`)
- Delete button on dashboard hidden for non-owners
- Edit description / add images controls on detail page hidden for non-owners

## Route structure
- `/sign-in/*?` and `/sign-up/*?` — required wildcard pattern for Clerk OAuth callbacks
- All other routes fall through to `<AppContent>` (wrapped in `<Layout>`)
- `ClerkProvider` is INSIDE `<WouterRouter base={basePath}>`
- `routerPush/routerReplace` strip the basePath before calling `setLocation`

**Why:** Clerk reads `window.location.pathname` directly for routing; without `/*?` wildcard, OAuth sub-paths like `/sign-in/sso-callback` return 404.

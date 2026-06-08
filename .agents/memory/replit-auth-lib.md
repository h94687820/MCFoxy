---
name: Replit Auth lib tsconfig
description: How to correctly set up lib/replit-auth-web as a composite TypeScript lib in this workspace
---

## Rules

1. `lib/replit-auth-web/tsconfig.json` must include `composite`, `declarationMap`, `emitDeclarationOnly` and a `references` entry to `../api-client-react`.
2. Do NOT add `"types": ["vite/client"]` to the composite lib — vite is not in its dependencies, so tsc will error with "Cannot find type definition file for 'vite/client'".
3. The `use-auth.ts` file originally used `import.meta.env.BASE_URL` — this causes TS2339 in composite builds. Workaround: cast through `globalThis` to avoid the Vite-specific type.
4. `@workspace/replit-auth-web` CANNOT be added with `pnpm add` (not in npm registry). Must be manually inserted into `package.json` devDependencies as `"@workspace/replit-auth-web": "workspace:*"` then run `pnpm install`.

**Why:** composite libs are typechecked by `tsc --build` which has stricter type resolution than Vite's bundler mode; Vite-specific globals don't exist at tsc compile time.

**How to apply:** any time replit-auth-web is added to a new workspace package, edit package.json directly rather than using pnpm add.

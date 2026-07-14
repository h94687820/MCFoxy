#!/bin/bash
# Deploy the full app to Cloudflare Workers
# Builds minecraft-hub SPA, then deploys the cloudflare-app Worker.
#
# Required env vars (set as Replit secrets):
#   CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN
#   BAAS_API_KEY, BAAS_BASE_URL
#   CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY
#
# Optional:
#   VIRUSTOTAL_API_KEY, DEEPAI_API_KEY

set -e

cd "$(dirname "$0")/artifacts/cloudflare-app"

echo ""
echo "──────────────────────────────────────────"
echo " Step 1: Pushing Worker secrets"
echo "──────────────────────────────────────────"

push_secret() {
  local name="$1"
  local value="$2"
  if [ -z "$value" ]; then
    echo "⚠️  Skipping $name (not set)"
    return
  fi
  echo "$value" | npx wrangler secret put "$name" --non-interactive 2>&1 | tail -1
  echo "✅ $name"
}

push_secret BAAS_API_KEY         "$BAAS_API_KEY"
push_secret BAAS_BASE_URL        "$BAAS_BASE_URL"
push_secret CLERK_SECRET_KEY     "$CLERK_SECRET_KEY"
push_secret CLERK_PUBLISHABLE_KEY "$CLERK_PUBLISHABLE_KEY"
push_secret VIRUSTOTAL_API_KEY   "$VIRUSTOTAL_API_KEY"
push_secret DEEPAI_API_KEY       "$DEEPAI_API_KEY"

echo ""
echo "──────────────────────────────────────────"
echo " Step 2: Building frontend (minecraft-hub)"
echo "──────────────────────────────────────────"
cd "$(dirname "$0")"
pnpm --filter @workspace/minecraft-hub run build

echo ""
echo "──────────────────────────────────────────"
echo " Step 3: Deploying Cloudflare Worker"
echo "──────────────────────────────────────────"
cd "$(dirname "$0")/artifacts/cloudflare-app"
npx wrangler deploy

echo ""
echo "✅ Deployment complete!"

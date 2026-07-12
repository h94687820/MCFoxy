#!/bin/bash
# Deploy the Cloudflare Workers app (artifacts/cloudflare-app)
set -e
cd "$(dirname "$0")/artifacts/cloudflare-app"
npx wrangler deploy

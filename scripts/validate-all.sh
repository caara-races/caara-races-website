#!/bin/sh

set -e

echo "=== validate markdown documents ==="
node scripts/validate-markdown.js

echo "=== validate races.yaml ==="
node scripts/validate-races.js

echo "=== validate javascript code ==="
npx biome ci

#!/bin/sh

set -e

echo "=== validate markdown documents ==="
node scripts/validate-markdown.js

echo "=== validate races.yaml ==="
node scripts/validate-races.js

echo "=== validate towns.yaml ==="
node scripts/validate-data.js schemas/towns.yaml content/_data/towns.yaml

echo "=== validate repeaters.yaml ==="
node scripts/validate-data.js schemas/repeaters.yaml content/_data/repeaters.yaml

echo "=== validate javascript code ==="
npx biome ci

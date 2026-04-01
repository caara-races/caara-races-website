#!/bin/bash

set -e

echo "=== generate checkpoint gpx ==="
node scripts/generate-checkpoints-gpx.js

echo "=== generate maps ==="
node scripts/generate-maps.js

echo "=== render site ==="
npx eleventy

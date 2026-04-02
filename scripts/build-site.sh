#!/bin/bash

echo "=== generate checkpoint gpx ==="
if ! node scripts/generate-checkpoints-gpx.js; then
  ((CI)) && exit 1
  echo "WARNING: failed to geocode checkpoints" >&2
fi

echo "=== generate maps ==="
if ! node scripts/generate-maps.js; then
  ((CI)) && exit 1
  echo "WARNING: failed to generate maps" >&2
fi

echo "=== render site ==="
npx eleventy

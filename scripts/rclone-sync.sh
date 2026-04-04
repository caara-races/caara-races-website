#!/bin/sh

set -e
TOKEN=$(
  curl -sSf "https://auth.oddbit.com/realms/caara-races/protocol/openid-connect/token" \
    -d "grant_type=client_credentials" \
    -d "client_id=caara-races-deployer" \
    -d "client_secret=$RCLONE_CLIENT_SECRET" | jq -r .access_token
)

rclone sync _site/ :webdav: \
  --webdav-url https://caara-races-dev.oddbit.com/deploy/ \
  --webdav-headers "Authorization,Bearer $TOKEN" \
  -v

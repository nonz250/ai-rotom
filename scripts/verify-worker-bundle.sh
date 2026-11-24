#!/usr/bin/env bash
#
# verify-worker-bundle.sh
#
# Verify that the Cloudflare Worker bundle does not import Node.js built-in
# modules. wrangler leaves `node:*` imports external instead of failing, so a
# party storage module (which writes files) leaking into the core server would
# only break at deploy or run time without this check.
#
# Run `npm run worker:bundle --workspace=@nonz250/ai-rotom` first.
# This script fails (exit 1) if the invariant is violated.

set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly BUNDLE_FILE="${REPO_ROOT}/packages/mcp-server/.wrangler/bundle/worker.js"

if [[ ! -f "${BUNDLE_FILE}" ]]; then
  echo "::error::worker bundle not found: ${BUNDLE_FILE}" >&2
  echo "::error::run 'npm run worker:bundle --workspace=@nonz250/ai-rotom' before invoking this script" >&2
  exit 1
fi

if matches="$(grep -nE '(\bfrom|\bimport|\bimport\(|\brequire\()[[:space:]]*["'"'"']node:' "${BUNDLE_FILE}")"; then
  echo "::error::worker bundle imports Node.js built-in modules:" >&2
  echo "${matches}" >&2
  exit 1
fi

echo "OK: worker bundle has no Node.js built-in imports"

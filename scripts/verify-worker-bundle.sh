#!/usr/bin/env bash
#
# verify-worker-bundle.sh
#
# Verify that the Cloudflare Worker bundle does not import Node.js built-in
# modules. wrangler leaves `node:*` imports external instead of failing, so a
# party storage module (which writes files) leaking into the core server would
# only break at deploy or run time without this check.
#
# This is a regression check for the "no nodejs_compat" invariant, not a
# security boundary. It only looks for `node:` imports and does not detect
# arbitrary fetch, data exfiltration or other malicious code. Keep it anyway,
# since wrangler bundles such imports without failing.
#
# Run `npm run bundle --workspace=@ai-rotom/remote-server` first.
# This script fails (exit 1) if the invariant is violated.

set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly BUNDLE_DIR="${REPO_ROOT}/packages/remote-server/.wrangler/bundle"

# バンドルのファイル名は wrangler.toml の main に合わせて変わり、分割されたチャンクが
# サブディレクトリに出ることもあるので、出力先の JavaScript をすべて調べる。
# macOS 標準の bash 3.2 には mapfile がないので、while read で集める。
bundle_files=()
while IFS= read -r file; do
  bundle_files+=("${file}")
done < <(find "${BUNDLE_DIR}" -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' \) 2>/dev/null)
if [[ ${#bundle_files[@]} -eq 0 ]]; then
  echo "::error::worker bundle not found in: ${BUNDLE_DIR}" >&2
  echo "::error::run 'npm run bundle --workspace=@ai-rotom/remote-server' before invoking this script" >&2
  exit 1
fi

if matches="$(grep -nE '(\bfrom|\bimport|\bimport\(|\brequire\()[[:space:]]*["'"'"']node:' "${bundle_files[@]}")"; then
  echo "::error::worker bundle imports Node.js built-in modules:" >&2
  echo "${matches}" >&2
  exit 1
fi

echo "OK: worker bundle has no Node.js built-in imports"

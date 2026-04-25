#!/usr/bin/env bash
#
# verify-dist-bundle.sh
#
# Verify that the built MCP server bundle (packages/mcp-server/dist/index.mjs)
# does not contain any unbundled references to packages that must be inlined.
#
# The published tarball does not declare these packages as runtime dependencies,
# so any residual import/require/dynamic-import would break the published
# package at runtime. This script fails (exit 1) if such references remain.
#
# Packages that must be fully inlined:
#   - @smogon/calc                           (npm 未 publish)
#   - @pokesol/pokesol-text-parser-ts        (publish 物の dependencies に含めない方針)
#
# Intended to be invoked from CI (GitHub Actions) as well as locally.

set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly DIST_FILE="${REPO_ROOT}/packages/mcp-server/dist/index.mjs"

readonly INLINED_PACKAGES=(
  "@smogon/calc"
  "@pokesol/pokesol-text-parser-ts"
)

if [[ ! -f "${DIST_FILE}" ]]; then
  echo "::error::dist bundle not found: ${DIST_FILE}" >&2
  echo "::error::run 'npm run build' before invoking this script" >&2
  exit 1
fi

found_hits=0

for pkg in "${INLINED_PACKAGES[@]}"; do
  # Each pattern matches one of: static ESM import, dynamic import(), or CJS
  # require(), targeting "<pkg>" or "<pkg>/<subpath>".
  pattern_static="from[[:space:]]+[\"'\`]${pkg}(/[^\"'\`]*)?[\"'\`]"
  pattern_dynamic="import[[:space:]]*\([[:space:]]*[\"'\`]${pkg}(/[^\"'\`]*)?[\"'\`][[:space:]]*\)"
  pattern_require="require[[:space:]]*\([[:space:]]*[\"'\`]${pkg}(/[^\"'\`]*)?[\"'\`][[:space:]]*\)"

  for pattern in "${pattern_static}" "${pattern_dynamic}" "${pattern_require}"; do
    if grep -E -n "${pattern}" "${DIST_FILE}" >/dev/null 2>&1; then
      echo "::error::unbundled ${pkg} reference detected in ${DIST_FILE}" >&2
      echo "::error::matching pattern: ${pattern}" >&2
      grep -E -n "${pattern}" "${DIST_FILE}" >&2 || true
      found_hits=1
    fi
  done
done

if [[ "${found_hits}" -ne 0 ]]; then
  exit 1
fi

echo "OK: no unbundled inlined-package references in ${DIST_FILE}"
exit 0

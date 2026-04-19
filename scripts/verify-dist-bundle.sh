#!/usr/bin/env bash
#
# verify-dist-bundle.sh
#
# Verify that the built MCP server bundle (packages/mcp-server/dist/index.mjs)
# does not contain any unbundled references to the @smogon/calc package.
#
# The published tarball does not declare @smogon/calc as a runtime dependency,
# so any residual import/require/dynamic-import of @smogon/calc would break the
# published package at runtime. This script fails (exit 1) if such references
# remain.
#
# Intended to be invoked from CI (GitHub Actions) as well as locally.

set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly DIST_FILE="${REPO_ROOT}/packages/mcp-server/dist/index.mjs"

# Patterns that indicate @smogon/calc is still referenced as an external module
# rather than inlined into the bundle.
#
# Each pattern matches one of: static ESM import, dynamic import(), or CJS
# require(), targeting "@smogon/calc" or "@smogon/calc/<subpath>".
readonly PATTERN_STATIC_IMPORT='from[[:space:]]+["'"'"'`]@smogon/calc(/[^"'"'"'`]*)?["'"'"'`]'
readonly PATTERN_DYNAMIC_IMPORT='import[[:space:]]*\([[:space:]]*["'"'"'`]@smogon/calc(/[^"'"'"'`]*)?["'"'"'`][[:space:]]*\)'
readonly PATTERN_REQUIRE='require[[:space:]]*\([[:space:]]*["'"'"'`]@smogon/calc(/[^"'"'"'`]*)?["'"'"'`][[:space:]]*\)'

if [[ ! -f "${DIST_FILE}" ]]; then
  echo "::error::dist bundle not found: ${DIST_FILE}" >&2
  echo "::error::run 'npm run build' before invoking this script" >&2
  exit 1
fi

found_hits=0

for pattern in "${PATTERN_STATIC_IMPORT}" "${PATTERN_DYNAMIC_IMPORT}" "${PATTERN_REQUIRE}"; do
  if grep -E -n "${pattern}" "${DIST_FILE}" >/dev/null 2>&1; then
    echo "::error::unbundled @smogon/calc reference detected in ${DIST_FILE}" >&2
    echo "::error::matching pattern: ${pattern}" >&2
    grep -E -n "${pattern}" "${DIST_FILE}" >&2 || true
    found_hits=1
  fi
done

if [[ "${found_hits}" -ne 0 ]]; then
  exit 1
fi

echo "OK: no unbundled @smogon/calc references in ${DIST_FILE}"
exit 0

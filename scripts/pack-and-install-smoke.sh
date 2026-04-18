#!/usr/bin/env bash
#
# pack-and-install-smoke.sh
#
# Validate the publish tarball for @nonz250/ai-rotom:
#   1. `npm pack` the workspace into a tarball
#   2. Extract and inspect the tarball's static structure
#      - package.json must NOT declare @smogon/calc as a runtime dependency
#      - vendor/ directory must not be shipped
#      - dist/index.mjs must have no unbundled @smogon/calc references
#      - LICENSE and THIRD_PARTY_LICENSES.md must be shipped
#   3. `npm install` the tarball into a fresh scratch project to confirm the
#      package is installable as-is
#
# Runtime / JSON-RPC startup verification is intentionally OUT OF SCOPE; that is
# handled by a separate `npm run test:dist` target. This script focuses on the
# static shape of the published artifact and its installability.

set -euo pipefail

readonly WORKSPACE_NAME='@nonz250/ai-rotom'
readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly EXTRACTED_PACKAGE_SUBDIR='package'

# Reuses the same @smogon/calc detection patterns as verify-dist-bundle.sh.
readonly PATTERN_STATIC_IMPORT='from[[:space:]]+["'"'"'`]@smogon/calc(/[^"'"'"'`]*)?["'"'"'`]'
readonly PATTERN_DYNAMIC_IMPORT='import[[:space:]]*\([[:space:]]*["'"'"'`]@smogon/calc(/[^"'"'"'`]*)?["'"'"'`][[:space:]]*\)'
readonly PATTERN_REQUIRE='require[[:space:]]*\([[:space:]]*["'"'"'`]@smogon/calc(/[^"'"'"'`]*)?["'"'"'`][[:space:]]*\)'

WORK_DIR=''

cleanup() {
  if [[ -n "${WORK_DIR}" && -d "${WORK_DIR}" ]]; then
    rm -rf "${WORK_DIR}"
  fi
}
trap cleanup EXIT

WORK_DIR="$(mktemp -d)"
readonly EXTRACT_DIR="${WORK_DIR}/extract"
readonly INSTALL_DIR="${WORK_DIR}/install"
mkdir -p "${EXTRACT_DIR}" "${INSTALL_DIR}"

echo ">>> Step 1/8: npm pack workspace=${WORKSPACE_NAME}"
(
  cd "${REPO_ROOT}"
  npm pack --workspace="${WORKSPACE_NAME}" --pack-destination "${WORK_DIR}" >/dev/null
)

# Resolve the tarball path (single tarball is expected under WORK_DIR root).
TARBALL="$(find "${WORK_DIR}" -maxdepth 1 -type f -name '*.tgz' -print -quit)"
readonly TARBALL
if [[ -z "${TARBALL}" || ! -f "${TARBALL}" ]]; then
  echo "::error::failed to locate tarball produced by npm pack under ${WORK_DIR}" >&2
  exit 1
fi
echo "  OK: tarball created at ${TARBALL}"

echo ">>> Step 2/8: extract tarball"
tar -xzf "${TARBALL}" -C "${EXTRACT_DIR}"
readonly PACKAGE_DIR="${EXTRACT_DIR}/${EXTRACTED_PACKAGE_SUBDIR}"
if [[ ! -d "${PACKAGE_DIR}" ]]; then
  echo "::error::expected extracted package directory at ${PACKAGE_DIR}" >&2
  exit 1
fi
echo "  OK: extracted to ${PACKAGE_DIR}"

echo ">>> Step 3/8: verify package.json has no @smogon/calc runtime dependency"
HAS_SMOGON_DEP="$(
  node --input-type=module -e "
    import { readFileSync } from 'node:fs';
    const pkg = JSON.parse(readFileSync(process.argv[1], 'utf8'));
    const deps = pkg.dependencies ?? {};
    process.stdout.write(Object.prototype.hasOwnProperty.call(deps, '@smogon/calc') ? 'yes' : 'no');
  " "${PACKAGE_DIR}/package.json"
)"
readonly HAS_SMOGON_DEP
if [[ "${HAS_SMOGON_DEP}" == 'yes' ]]; then
  echo "::error::package.json still declares @smogon/calc as a runtime dependency" >&2
  exit 1
fi
echo "  OK: @smogon/calc is not declared as a runtime dependency"

echo ">>> Step 4/8: verify vendor/ is not shipped"
if [[ -e "${PACKAGE_DIR}/vendor" ]]; then
  echo "::error::vendor/ directory must not be included in the published tarball" >&2
  exit 1
fi
echo "  OK: vendor/ is absent"

echo ">>> Step 5/8: verify dist/index.mjs has no unbundled @smogon/calc refs"
readonly DIST_FILE="${PACKAGE_DIR}/dist/index.mjs"
if [[ ! -f "${DIST_FILE}" ]]; then
  echo "::error::missing dist/index.mjs in published tarball: ${DIST_FILE}" >&2
  exit 1
fi
for pattern in "${PATTERN_STATIC_IMPORT}" "${PATTERN_DYNAMIC_IMPORT}" "${PATTERN_REQUIRE}"; do
  if grep -E -n "${pattern}" "${DIST_FILE}" >/dev/null 2>&1; then
    echo "::error::unbundled @smogon/calc reference detected in ${DIST_FILE}" >&2
    echo "::error::matching pattern: ${pattern}" >&2
    grep -E -n "${pattern}" "${DIST_FILE}" >&2 || true
    exit 1
  fi
done
echo "  OK: dist/index.mjs is fully bundled"

echo ">>> Step 6/8: verify LICENSE and THIRD_PARTY_LICENSES.md are shipped"
for required_file in 'LICENSE' 'THIRD_PARTY_LICENSES.md'; do
  if [[ ! -f "${PACKAGE_DIR}/${required_file}" ]]; then
    echo "::error::missing required file in published tarball: ${required_file}" >&2
    exit 1
  fi
  echo "  OK: ${required_file} is present"
done

echo ">>> Step 7/8: npm install tarball into a fresh scratch project"
(
  cd "${INSTALL_DIR}"
  npm init -y >/dev/null
  npm install "${TARBALL}" >/dev/null
)
echo "  OK: npm install succeeded"

echo ">>> Step 8/8: done"
echo 'All pack/install smoke checks passed.'
exit 0

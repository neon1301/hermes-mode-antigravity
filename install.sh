#!/usr/bin/env bash
# Hermes Fleet Plugin Installer for Google Antigravity (v3.6.10)
set -euo pipefail

echo "=========================================="
echo "  Hermes Fleet v3.6.10 Installer for Antigravity"
echo "=========================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${AGY_PLUGIN_DIR:-${HOME}/.gemini/config/plugins/hermes-fleet}"

echo "Target plugin directory: ${TARGET_DIR}"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is not installed or not in PATH. Please install Node.js >= 20." >&2
  exit 1
fi

NODE_VER="$(node -v | sed 's/^v//')"
MAJOR_VER="${NODE_VER%%.*}"
if [ "${MAJOR_VER}" -lt 20 ]; then
  echo "Warning: Node.js version is ${NODE_VER}. Node.js >= 20 is recommended." >&2
fi

mkdir -p "${TARGET_DIR}"

# Remove stale items from earlier versions
rm -rf "${TARGET_DIR}/rules" "${TARGET_DIR}/agents/mozgoeb.md"

ITEMS=(
  "plugin.json"
  "package.json"
  "hooks.json"
  "LICENSE"
  "README.md"
  "CHANGELOG.md"
  "TROUBLESHOOTING.md"
  "hooks"
  "assets"
  "skills"
  "agents"
)

for item in "${ITEMS[@]}"; do
  if [ -e "${SCRIPT_DIR}/${item}" ]; then
    rm -rf "${TARGET_DIR:?}/${item}"
    cp -R "${SCRIPT_DIR}/${item}" "${TARGET_DIR}/"
    echo "  [OK] Copied: ${item}"
  fi
done

echo ""
echo "Running hook self-tests..."
node "${TARGET_DIR}/hooks/consistency.test.mjs"
node "${TARGET_DIR}/hooks/context-injector.test.mjs"
node "${TARGET_DIR}/hooks/clean-edits-guard.test.mjs"
node "${TARGET_DIR}/hooks/qa-gate.test.mjs"

echo ""
echo "=========================================="
echo "Hermes Fleet v3.6.10 installed successfully!"
echo "1. Open a new chat in Google Antigravity."
echo "2. Trigger with: /hermes or @dmitry, @elena, @kritik, @viktor, @stanislav"
echo "=========================================="

#!/usr/bin/env bash
# Hermes Fleet Plugin Installer for Google Antigravity (v3.9.0)
set -euo pipefail

echo "=========================================="
echo "  Hermes Fleet v3.9.0 Installer for Antigravity"
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
  "THIRD_PARTY_NOTICES.md"
  "verify.ps1"
  "verify.sh"
  "install.ps1"
  "install.sh"
  "hooks"
  "assets"
  "skills"
  "agents"
  "docs"
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
node "${TARGET_DIR}/hooks/test-runner.mjs"

echo ""
echo "=========================================="
VERSION=$(node -e "console.log(JSON.parse(require('fs').readFileSync('plugin.json', 'utf8')).version)")
echo "Hermes Fleet v${VERSION} installed successfully!"
echo "1. Open a new chat in Google Antigravity."
echo "2. Trigger with: /hermes or @dmitry, @elena, @kritik, @viktor, @stanislav"
echo "=========================================="

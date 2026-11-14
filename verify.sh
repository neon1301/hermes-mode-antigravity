#!/usr/bin/env bash
set -e

echo "🏛️ [HERMES LOCAL CI] Starting verification..."

# 1. Check Node.js existence and version >= 20
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js is not installed or not found in PATH. Node.js >= 20.0.0 is required." >&2
  exit 1
fi

NODE_VERSION=$(node -v)
MAJOR_VERSION=$(echo "$NODE_VERSION" | sed 's/^v//' | cut -d'.' -f1)

if [ "$MAJOR_VERSION" -lt 20 ]; then
  echo "❌ Node.js version $NODE_VERSION is too old. Node.js >= 20.0.0 is required (found v$MAJOR_VERSION)." >&2
  exit 1
fi
echo "✅ Node.js runtime: $NODE_VERSION (>= 20)"

# 2. Manifest check (plugin.json and hooks.json)
echo "🔍 Validating manifests and hooks..."
node -e "
  const fs = require('fs');
  const plugin = JSON.parse(fs.readFileSync('plugin.json', 'utf8'));
  const hooks = JSON.parse(fs.readFileSync('hooks.json', 'utf8'));
  if (plugin.name !== 'hermes-fleet' || !plugin.version) throw new Error('Invalid plugin.json');
  if (!hooks['hermes-context-injector'] || !hooks['hermes-clean-edits'] || !hooks['hermes-qa-gate']) {
    throw new Error('Missing required hooks in hooks.json');
  }
  console.log('Manifest & hooks check passed: version ' + plugin.version);
"

# 3. Run test suites
echo "🧪 Running test suites (npm test)..."
npm test

echo "[hermes] LOCAL CI PASS"
exit 0

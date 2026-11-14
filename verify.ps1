$ErrorActionPreference = "Stop"

Write-Host "🏛️ [HERMES LOCAL CI] Starting verification..." -ForegroundColor Cyan

# 1. Check Node.js existence and version >= 20
try {
    $nodeVersionRaw = node -v 2>$null
} catch {
    $nodeVersionRaw = $null
}

if (-not $nodeVersionRaw) {
    Write-Error "❌ Node.js is not installed or not found in PATH. Node.js >= 20.0.0 is required."
    exit 1
}

$cleanVersion = $nodeVersionRaw.TrimStart('v')
$majorVersion = [int]($cleanVersion.Split('.')[0])

if ($majorVersion -lt 20) {
    Write-Error "❌ Node.js version $nodeVersionRaw is too old. Node.js >= 20.0.0 is required (found v$majorVersion)."
    exit 1
}
Write-Host "✅ Node.js runtime: $nodeVersionRaw (>= 20)" -ForegroundColor Green

# 2. Manifest check (plugin.json and hooks.json)
Write-Host "🔍 Validating manifests and hooks..." -ForegroundColor Cyan
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
if ($LASTEXITCODE -ne 0) {
    Write-Error "❌ Manifest validation failed."
    exit 1
}

# 3. Run test suites
Write-Host "🧪 Running test suites (npm test)..." -ForegroundColor Cyan
& npm test
if ($LASTEXITCODE -ne 0) {
    Write-Error "❌ Hermes test suite failed."
    exit 1
}

Write-Host "[hermes] LOCAL CI PASS" -ForegroundColor Green
exit 0

# Hermes Fleet Plugin Installer for Google Antigravity (v4.7.2)
$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Hermes Fleet v4.7.2 Installer for Antigravity" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    throw "Node.js is not installed or not in PATH. Please install Node.js >= 20."
}
$nodeVer = (node -v).TrimStart('v')
$majorVer = [int]($nodeVer.Split('.')[0])
if ($majorVer -lt 20) {
    Write-Warning "Node.js version is $nodeVer (Node.js >= 20 recommended)."
}

$sourceDir = $PSScriptRoot
$targetDir = Join-Path $env:USERPROFILE ".gemini\config\plugins\hermes-fleet"

Write-Host "Target plugin directory: $targetDir" -ForegroundColor Yellow

if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
}

$items = @(
    "plugin.json",
    "package.json",
    "hooks.json",
    "LICENSE",
    "README.md",
    "README.ru.md",
    "CHANGELOG.md",
    "TROUBLESHOOTING.md",
    "THIRD_PARTY_NOTICES.md",
    "verify.ps1",
    "verify.sh",
    "install.ps1",
    "install.sh",
    "hooks",
    "assets",
    "skills",
    "agents",
    "docs",
    "scripts"
)

# Items shipped by older versions or repo-only artifacts that must not linger in the target
$staleItems = @(
    "rules",
    "logs"
)

foreach ($stale in $staleItems) {
    $stalePath = Join-Path $targetDir $stale
    if (Test-Path $stalePath) {
        Remove-Item -Path $stalePath -Recurse -Force
        Write-Host "  [OK] Removed stale: $stale" -ForegroundColor Green
    }
}

foreach ($item in $items) {
    $itemPath = Join-Path $sourceDir $item
    $destPath = Join-Path $targetDir $item
    if (Test-Path $itemPath) {
        if ((Get-Item $itemPath).PSIsContainer -and (Test-Path $destPath)) {
            Remove-Item -Path $destPath -Recurse -Force
        }
        Copy-Item -Path $itemPath -Destination $destPath -Recurse -Force
        Write-Host "  [OK] Copied: $item" -ForegroundColor Green
    }
}

if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Host "`nRunning hook self-tests..." -ForegroundColor Cyan
    node (Join-Path $targetDir "hooks\test-runner.mjs")
    if ($LASTEXITCODE -ne 0) { throw "test-runner.mjs failed" }
}

$pluginJson = Get-Content (Join-Path $sourceDir "plugin.json") -Raw | ConvertFrom-Json
$version = $pluginJson.version

Write-Host "`nHermes Fleet v$version installed successfully!" -ForegroundColor Green
Write-Host "1. Open a new chat in Google Antigravity." -ForegroundColor Cyan
Write-Host "2. Trigger with: /hermes or @dmitry, @elena, @kritik, @viktor, @stanislav" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Hermes Fleet Plugin Installer for Google Antigravity (v3.6.7)
$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Hermes Fleet v3.6.7 Installer for Antigravity" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$sourceDir = $PSScriptRoot
$targetDir = Join-Path $env:USERPROFILE ".gemini\config\plugins\hermes-fleet"

Write-Host "Target plugin directory: $targetDir" -ForegroundColor Yellow

if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
}

$items = @(
    "plugin.json",
    "hooks.json",
    "LICENSE",
    "README.md",
    "hooks",
    "assets",
    "skills",
    "agents"
)

# Items shipped by older versions that must not linger in the target (e.g. always-on rules/AGENTS.md before v3.6.7)
$staleItems = @(
    "rules"
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
    node (Join-Path $targetDir "hooks\context-injector.test.mjs")
    if ($LASTEXITCODE -ne 0) { throw "context-injector.test.mjs failed" }
    node (Join-Path $targetDir "hooks\clean-edits-guard.test.mjs")
    if ($LASTEXITCODE -ne 0) { throw "clean-edits-guard.test.mjs failed" }
    node (Join-Path $targetDir "hooks\qa-gate.test.mjs")
    if ($LASTEXITCODE -ne 0) { throw "qa-gate.test.mjs failed" }
}

Write-Host "`nHermes Fleet v3.6.7 installed successfully!" -ForegroundColor Green
Write-Host "1. Open a new chat in Google Antigravity." -ForegroundColor Cyan
Write-Host "2. Trigger with: /hermes or @dmitry, @elena, @mozgoeb, @viktor, @stanislav" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

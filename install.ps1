# Hermes Fleet Plugin Installer for Google Antigravity
$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  🏛️ Hermes Fleet Installer for Antigravity" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$sourceDir = $PSScriptRoot
$targetDir = Join-Path $env:USERPROFILE ".gemini\config\plugins\hermes-fleet"

Write-Host "Целевая папка плагина: $targetDir" -ForegroundColor Yellow

if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
}

$items = @("plugin.json", "hooks.json", "hooks", "README.md", "assets", "rules", "skills", "agents")

foreach ($item in $items) {
    $itemPath = Join-Path $sourceDir $item
    if (Test-Path $itemPath) {
        Copy-Item -Path $itemPath -Destination $targetDir -Recurse -Force
        Write-Host "  [OK] Скопировано: $item" -ForegroundColor Green
    }
}

Write-Host "`nПлагин успешно установлен!" -ForegroundColor Green
Write-Host "1. Перезапустите Google Antigravity или откройте новый чат." -ForegroundColor Cyan
Write-Host "2. Для вызова режима напишите в чате: /hermes или обратитесь к специалисту: @dmitry, @viktor, @elena" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

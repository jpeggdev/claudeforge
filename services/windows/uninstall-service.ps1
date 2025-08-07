# ClaudeForge Windows Service Uninstallation Script
# Run as Administrator

param(
    [string]$InstallPath = "C:\Program Files\claudeforge",
    [string]$ServiceName = "ClaudeForgeServer"
)

# Check if running as administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Error "This script must be run as Administrator. Exiting..."
    exit 1
}

Write-Host "ClaudeForge Server - Windows Service Uninstallation" -ForegroundColor Red
Write-Host "==================================================" -ForegroundColor Red

# Stop the service if running
Write-Host "`nStopping service..." -ForegroundColor Yellow
try {
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    Write-Host "Service stopped" -ForegroundColor Green
} catch {
    Write-Host "Service was not running" -ForegroundColor Gray
}

# Uninstall the service
if (Test-Path "$InstallPath\service-wrapper.js") {
    Write-Host "Uninstalling service..." -ForegroundColor Yellow
    Set-Location $InstallPath
    node service-wrapper.js uninstall
    Start-Sleep -Seconds 3
}

# Remove firewall rules
Write-Host "`nRemoving firewall rules..." -ForegroundColor Yellow
Remove-NetFirewallRule -DisplayName "ClaudeForge Server" -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName "ClaudeForge Web Interface" -ErrorAction SilentlyContinue

# Ask if user wants to remove installation directory
$response = Read-Host "`nDo you want to remove the installation directory? (Y/N)"
if ($response -eq 'Y' -or $response -eq 'y') {
    Write-Host "Removing installation directory..." -ForegroundColor Yellow
    Remove-Item -Path $InstallPath -Recurse -Force
    Write-Host "Directory removed" -ForegroundColor Green
}

Write-Host "`n==================================================" -ForegroundColor Green
Write-Host "Uninstallation Complete!" -ForegroundColor Green
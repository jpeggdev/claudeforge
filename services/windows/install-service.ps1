# ClaudeForge Windows Service Installation Script
# Run as Administrator

param(
    [string]$InstallPath = "C:\Program Files\claudeforge",
    [string]$ServiceName = "ClaudeForgeServer",
    [string]$DisplayName = "ClaudeForge Server",
    [string]$Description = "ClaudeForge Server with Web Management Interface"
)

# Check if running as administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Error "This script must be run as Administrator. Exiting..."
    exit 1
}

Write-Host "ClaudeForge Server - Windows Service Installation" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green

# Check if Node.js is installed
try {
    $nodeVersion = node --version
    Write-Host "Node.js version: $nodeVersion" -ForegroundColor Cyan
} catch {
    Write-Error "Node.js is not installed. Please install Node.js first."
    exit 1
}

# Install node-windows globally if not already installed
Write-Host "`nInstalling node-windows package..." -ForegroundColor Yellow
npm install -g node-windows

# Create installation directory if it doesn't exist
if (!(Test-Path $InstallPath)) {
    Write-Host "Creating installation directory: $InstallPath" -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
}

# Copy application files
Write-Host "Copying application files..." -ForegroundColor Yellow
$currentPath = Split-Path -Parent $PSScriptRoot | Split-Path -Parent
Copy-Item -Path "$currentPath\*" -Destination $InstallPath -Recurse -Force -Exclude @("node_modules", ".git", "services")

# Navigate to installation directory
Set-Location $InstallPath

# Install dependencies
Write-Host "`nInstalling dependencies..." -ForegroundColor Yellow
npm install --production

# Build the project
Write-Host "Building the project..." -ForegroundColor Yellow
npm run build

# Create service wrapper script
$serviceScript = @"
const Service = require('node-windows').Service;
const path = require('path');

// Create a new service object
const svc = new Service({
    name: '$ServiceName',
    description: '$Description',
    script: path.join(__dirname, 'dist', 'index.js'),
    nodeOptions: [
        '--harmony',
        '--max_old_space_size=4096'
    ],
    env: [
        {
            name: 'NODE_ENV',
            value: 'production'
        },
        {
            name: 'CLAUDEFORGE_CONFIG',
            value: path.join(__dirname, 'config.json')
        },
        {
            name: 'CLAUDEFORGE_PORT',
            value: '3000'
        },
        {
            name: 'CLAUDEFORGE_WEB_PORT',
            value: '8080'
        }
    ]
});

// Listen for the 'install' event
svc.on('install', function() {
    console.log('Service installed successfully');
    svc.start();
});

svc.on('uninstall', function() {
    console.log('Service uninstalled successfully');
});

svc.on('start', function() {
    console.log('Service started successfully');
});

svc.on('stop', function() {
    console.log('Service stopped');
});

svc.on('error', function(err) {
    console.error('Service error:', err);
});

// Check command line arguments
const args = process.argv.slice(2);
const command = args[0];

switch(command) {
    case 'install':
        console.log('Installing service...');
        svc.install();
        break;
    case 'uninstall':
        console.log('Uninstalling service...');
        svc.uninstall();
        break;
    case 'start':
        console.log('Starting service...');
        svc.start();
        break;
    case 'stop':
        console.log('Stopping service...');
        svc.stop();
        break;
    default:
        console.log('Usage: node service-wrapper.js [install|uninstall|start|stop]');
        break;
}
"@

# Save service wrapper script
$serviceScript | Out-File -FilePath "$InstallPath\service-wrapper.js" -Encoding UTF8

# Install the service
Write-Host "`nInstalling Windows service..." -ForegroundColor Yellow
Set-Location $InstallPath
node service-wrapper.js install

# Create firewall rules
Write-Host "`nCreating firewall rules..." -ForegroundColor Yellow
New-NetFirewallRule -DisplayName "ClaudeForge Server" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName "ClaudeForge Web Interface" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow -ErrorAction SilentlyContinue

Write-Host "`n================================================" -ForegroundColor Green
Write-Host "Installation Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Service Name: $ServiceName" -ForegroundColor Cyan
Write-Host "Installation Path: $InstallPath" -ForegroundColor Cyan
Write-Host "Web Interface: http://localhost:8080" -ForegroundColor Cyan
Write-Host ""
Write-Host "Service Management Commands:" -ForegroundColor Yellow
Write-Host "  Start:     net start $ServiceName" -ForegroundColor White
Write-Host "  Stop:      net stop $ServiceName" -ForegroundColor White
Write-Host "  Status:    sc query $ServiceName" -ForegroundColor White
Write-Host ""
Write-Host "To uninstall the service, run:" -ForegroundColor Yellow
Write-Host "  node $InstallPath\service-wrapper.js uninstall" -ForegroundColor White
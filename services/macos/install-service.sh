#!/bin/bash

# ClaudeForge macOS Service Installation Script
# Run with sudo

set -e

SERVICE_NAME="com.claudeforge.server"
INSTALL_PATH="/usr/local/opt/claudeforge"
PLIST_PATH="/Library/LaunchDaemons/${SERVICE_NAME}.plist"
LOG_PATH="/usr/local/var/log/claudeforge"
CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$CURRENT_DIR")")"

echo "ClaudeForge Server - macOS Service Installation"
echo "============================================="

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "This script must be run as root (use sudo)" 
   exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed"
    echo "Install Node.js using Homebrew: brew install node"
    exit 1
fi

NODE_PATH=$(which node)
echo "Node.js found at: $NODE_PATH"

# Create installation directory
echo ""
echo "Creating installation directory..."
mkdir -p "$INSTALL_PATH"

# Copy application files
echo "Copying application files..."
rsync -av --exclude='node_modules' --exclude='.git' --exclude='services' "$PROJECT_ROOT/" "$INSTALL_PATH/"

# Navigate to installation directory
cd "$INSTALL_PATH"

# Install dependencies
echo ""
echo "Installing dependencies..."
npm install --production

# Build the project
echo "Building the project..."
npm run build

# Create log directory
echo ""
echo "Creating log directory..."
mkdir -p "$LOG_PATH"

# Copy and update plist file
echo "Installing launch daemon..."
cp "$CURRENT_DIR/${SERVICE_NAME}.plist" "$PLIST_PATH"

# Update the plist file with correct node path
sed -i '' "s|/usr/local/bin/node|$NODE_PATH|g" "$PLIST_PATH"

# Set proper permissions
chmod 644 "$PLIST_PATH"
chown root:wheel "$PLIST_PATH"

# Load the service
echo "Loading service..."
launchctl load -w "$PLIST_PATH"

# Start the service
echo "Starting service..."
launchctl start "$SERVICE_NAME"

# Check service status
sleep 2
if launchctl list | grep -q "$SERVICE_NAME"; then
    echo ""
    echo "============================================="
    echo "Installation Complete!"
    echo ""
    echo "Service Name: $SERVICE_NAME"
    echo "Installation Path: $INSTALL_PATH"
    echo "Log Files: $LOG_PATH"
    echo "Web Interface: http://localhost:8080"
    echo ""
    echo "Service Management Commands:"
    echo "  Status:  sudo launchctl list | grep $SERVICE_NAME"
    echo "  Start:   sudo launchctl start $SERVICE_NAME"
    echo "  Stop:    sudo launchctl stop $SERVICE_NAME"
    echo "  Restart: sudo launchctl stop $SERVICE_NAME && sudo launchctl start $SERVICE_NAME"
    echo "  Logs:    tail -f $LOG_PATH/stdout.log"
    echo "  Errors:  tail -f $LOG_PATH/stderr.log"
    echo ""
    echo "The service will automatically start on system boot."
else
    echo ""
    echo "Warning: Service installation may have failed."
    echo "Check logs at: $LOG_PATH"
fi
#!/bin/bash

# ClaudeForge macOS Service Uninstallation Script
# Run with sudo

set -e

SERVICE_NAME="com.claudeforge.server"
INSTALL_PATH="/usr/local/opt/claudeforge"
PLIST_PATH="/Library/LaunchDaemons/${SERVICE_NAME}.plist"
LOG_PATH="/usr/local/var/log/claudeforge"

echo "ClaudeForge Server - macOS Service Uninstallation"
echo "==============================================="

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "This script must be run as root (use sudo)" 
   exit 1
fi

# Stop the service if running
echo ""
echo "Stopping service..."
if launchctl list | grep -q "$SERVICE_NAME"; then
    launchctl stop "$SERVICE_NAME" 2>/dev/null || true
    echo "Service stopped"
else
    echo "Service was not running"
fi

# Unload the service
if [ -f "$PLIST_PATH" ]; then
    echo "Unloading service..."
    launchctl unload -w "$PLIST_PATH" 2>/dev/null || true
    
    # Remove plist file
    echo "Removing launch daemon..."
    rm -f "$PLIST_PATH"
fi

# Ask if user wants to remove installation directory
echo ""
read -p "Do you want to remove the installation directory? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Removing installation directory..."
    rm -rf "$INSTALL_PATH"
    echo "Directory removed"
fi

# Ask if user wants to remove log files
echo ""
read -p "Do you want to remove log files? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Removing log files..."
    rm -rf "$LOG_PATH"
    echo "Log files removed"
fi

echo ""
echo "==============================================="
echo "Uninstallation Complete!"
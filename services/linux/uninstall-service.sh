#!/bin/bash

# ClaudeForge Linux Service Uninstallation Script (systemd)
# Run with sudo

set -e

SERVICE_NAME="claudeforge"
INSTALL_PATH="/opt/claudeforge"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
LOG_PATH="/var/log/claudeforge"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${RED}ClaudeForge Server - Linux Service Uninstallation${NC}"
echo -e "${RED}===============================================${NC}"

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}This script must be run as root (use sudo)${NC}" 
   exit 1
fi

# Stop the service if running
echo ""
echo "Stopping service..."
if systemctl is-active --quiet "$SERVICE_NAME"; then
    systemctl stop "$SERVICE_NAME"
    echo "Service stopped"
else
    echo "Service was not running"
fi

# Disable the service
if systemctl is-enabled --quiet "$SERVICE_NAME" 2>/dev/null; then
    echo "Disabling service..."
    systemctl disable "$SERVICE_NAME"
    echo "Service disabled"
fi

# Remove service file
if [ -f "$SERVICE_FILE" ]; then
    echo "Removing service file..."
    rm -f "$SERVICE_FILE"
    systemctl daemon-reload
    echo "Service file removed"
fi

# Remove firewall rules if ufw is available
if command -v ufw &> /dev/null; then
    echo ""
    echo "Removing firewall rules..."
    ufw delete allow 3000/tcp 2>/dev/null || true
    ufw delete allow 8080/tcp 2>/dev/null || true
fi

# Ask if user wants to remove installation directory
echo ""
read -p "Do you want to remove the installation directory? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Backup config if it exists
    if [ -f "$INSTALL_PATH/config.json" ]; then
        echo "Backing up config.json to /tmp/claudeforge-config-backup.json"
        cp "$INSTALL_PATH/config.json" "/tmp/claudeforge-config-backup.json"
    fi
    
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
    # Also clear journal logs
    journalctl --vacuum-time=0 -u "$SERVICE_NAME" 2>/dev/null || true
    echo "Log files removed"
fi

echo ""
echo -e "${GREEN}===============================================${NC}"
echo -e "${GREEN}Uninstallation Complete!${NC}"

if [ -f "/tmp/claudeforge-config-backup.json" ]; then
    echo ""
    echo -e "${YELLOW}Your config file has been backed up to:${NC}"
    echo "/tmp/claudeforge-config-backup.json"
fi
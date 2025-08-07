#!/bin/bash

# Universal MCP Proxy Service Installation Script
# Detects OS and runs appropriate installer

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}MCP Proxy Server - Service Installation${NC}"
echo -e "${BLUE}=======================================${NC}"
echo ""

# Detect operating system
OS="unknown"
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "win32" ]]; then
    OS="windows"
fi

echo "Detected operating system: $OS"
echo ""

case $OS in
    linux)
        echo -e "${GREEN}Installing for Linux (systemd)...${NC}"
        echo "This script will install MCP Proxy as a systemd service."
        echo ""
        read -p "Continue with installation? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            sudo bash "$(dirname "$0")/../services/linux/install-service.sh"
        else
            echo "Installation cancelled."
        fi
        ;;
        
    macos)
        echo -e "${GREEN}Installing for macOS (launchd)...${NC}"
        echo "This script will install MCP Proxy as a launchd service."
        echo ""
        read -p "Continue with installation? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            sudo bash "$(dirname "$0")/../services/macos/install-service.sh"
        else
            echo "Installation cancelled."
        fi
        ;;
        
    windows)
        echo -e "${GREEN}Installing for Windows...${NC}"
        echo "Please run the PowerShell script as Administrator:"
        echo ""
        echo -e "${YELLOW}PowerShell.exe -ExecutionPolicy Bypass -File services\\windows\\install-service.ps1${NC}"
        echo ""
        echo "Or navigate to services/windows/ and run install-service.ps1"
        ;;
        
    *)
        echo -e "${RED}Error: Unsupported operating system${NC}"
        echo "Supported systems: Linux (systemd), macOS, Windows"
        exit 1
        ;;
esac
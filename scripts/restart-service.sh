#!/bin/bash

# MCP Proxy Service Restart Script
# This script properly restarts the service without hanging the terminal

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Restarting MCP Proxy Service...${NC}"

# Stop the service
echo "Stopping service..."
sudo systemctl stop mcp-proxy

# Wait a moment for clean shutdown
sleep 2

# Start the service
echo "Starting service..."
sudo systemctl start mcp-proxy

# Wait for service to initialize
sleep 2

# Show status
echo -e "${GREEN}Service restarted successfully!${NC}"
echo ""
sudo systemctl status mcp-proxy --no-pager

# Show the web interface URL
echo ""
echo -e "${GREEN}Web interface available at: http://localhost:8080${NC}"
echo ""

# Show recent logs
echo -e "${YELLOW}Recent logs:${NC}"
sudo journalctl -u mcp-proxy -n 20 --no-pager
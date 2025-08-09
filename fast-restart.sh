#!/bin/bash

# ClaudeForge Fast Restart Script
# Optimized for speed with different restart strategies

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Parse arguments
MODE=${1:-fast}
SKIP_BUILD=${2:-false}

case $MODE in
  "dev")
    echo -e "${YELLOW}Starting in development mode with hot-reload...${NC}"
    npm run dev
    ;;
    
  "reload")
    echo -e "${GREEN}Reloading configuration (no restart)...${NC}"
    systemctl --user reload claudeforge
    echo -e "${GREEN}✓ Configuration reloaded${NC}"
    ;;
    
  "fast")
    echo -e "${YELLOW}Fast restart with incremental build...${NC}"
    
    # Only build if not skipping
    if [ "$SKIP_BUILD" != "skip" ]; then
      echo "Building (incremental)..."
      npm run build:fast
    fi
    
    echo "Restarting service..."
    systemctl --user restart claudeforge
    
    # Quick health check
    sleep 1
    if curl -sf http://localhost:8080/api/health > /dev/null 2>&1; then
      echo -e "${GREEN}✓ Service restarted successfully${NC}"
    else
      echo -e "${YELLOW}⚠ Service starting...${NC}"
    fi
    ;;
    
  "quick")
    echo -e "${YELLOW}Quick restart (no build)...${NC}"
    systemctl --user restart claudeforge
    echo -e "${GREEN}✓ Service restarted${NC}"
    ;;
    
  "full")
    echo -e "${YELLOW}Full rebuild and restart...${NC}"
    npm run build
    systemctl --user daemon-reload
    systemctl --user restart claudeforge
    echo -e "${GREEN}✓ Full restart complete${NC}"
    ;;
    
  "status")
    systemctl --user status claudeforge --no-pager
    ;;
    
  "logs")
    journalctl --user -u claudeforge -f
    ;;
    
  *)
    echo "Usage: $0 [mode] [skip-build]"
    echo ""
    echo "Modes:"
    echo "  dev      - Start in development mode with hot-reload"
    echo "  reload   - Reload config without restart (fastest)"
    echo "  fast     - Incremental build + restart (default)"
    echo "  quick    - Restart without build"
    echo "  full     - Full rebuild + restart"
    echo "  status   - Show service status"
    echo "  logs     - Follow service logs"
    echo ""
    echo "Examples:"
    echo "  $0              # Fast restart with incremental build"
    echo "  $0 reload       # Just reload config"
    echo "  $0 fast skip    # Fast restart, skip build"
    echo "  $0 dev          # Development mode"
    ;;
esac
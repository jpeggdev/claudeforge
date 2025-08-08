#!/bin/bash

# User-friendly ClaudeForge service management script
# No sudo required!

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

PROJECT_DIR="$HOME/code/ai/mcp_proxy"
SERVICE_NAME="mcp-proxy"

case "$1" in
    install)
        echo -e "${GREEN}Installing ClaudeForge as user service...${NC}"
        
        # Create user systemd directory if it doesn't exist
        mkdir -p ~/.config/systemd/user
        
        # Copy service file
        cp "$PROJECT_DIR/services/user/mcp-proxy.service" ~/.config/systemd/user/
        
        # Reload user systemd
        systemctl --user daemon-reload
        
        # Enable and start service
        systemctl --user enable $SERVICE_NAME
        systemctl --user start $SERVICE_NAME
        
        echo -e "${GREEN}Service installed and started!${NC}"
        echo "Web interface: http://localhost:8080"
        ;;
        
    start)
        echo -e "${GREEN}Starting ClaudeForge...${NC}"
        systemctl --user start $SERVICE_NAME
        sleep 1
        systemctl --user status $SERVICE_NAME --no-pager
        ;;
        
    stop)
        echo -e "${YELLOW}Stopping ClaudeForge...${NC}"
        systemctl --user stop $SERVICE_NAME
        ;;
        
    restart)
        echo -e "${YELLOW}Restarting ClaudeForge...${NC}"
        systemctl --user restart $SERVICE_NAME
        sleep 1
        systemctl --user status $SERVICE_NAME --no-pager
        ;;
        
    status)
        systemctl --user status $SERVICE_NAME --no-pager
        ;;
        
    logs)
        journalctl --user -u $SERVICE_NAME -f
        ;;
        
    uninstall)
        echo -e "${RED}Uninstalling ClaudeForge service...${NC}"
        systemctl --user stop $SERVICE_NAME 2>/dev/null || true
        systemctl --user disable $SERVICE_NAME 2>/dev/null || true
        rm -f ~/.config/systemd/user/$SERVICE_NAME.service
        systemctl --user daemon-reload
        echo "Service uninstalled"
        ;;
        
    build)
        echo -e "${GREEN}Building ClaudeForge...${NC}"
        cd "$PROJECT_DIR"
        npm install
        npm run build
        echo -e "${GREEN}Build complete!${NC}"
        ;;
        
    *)
        echo "ClaudeForge User Service Manager"
        echo "Usage: $0 {install|start|stop|restart|status|logs|build|uninstall}"
        echo ""
        echo "  install   - Install and start the service"
        echo "  start     - Start the service"
        echo "  stop      - Stop the service"
        echo "  restart   - Restart the service"
        echo "  status    - Show service status"
        echo "  logs      - Show live logs"
        echo "  build     - Build the TypeScript project"
        echo "  uninstall - Remove the service"
        echo ""
        echo "No sudo required! Runs as your user."
        exit 1
        ;;
esac
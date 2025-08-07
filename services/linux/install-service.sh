#!/bin/bash

# ClaudeForge Linux Service Installation Script (systemd)
# Run with sudo

set -e

SERVICE_NAME="claudeforge"
INSTALL_PATH="/opt/claudeforge"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
LOG_PATH="/var/log/claudeforge"
CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$CURRENT_DIR")")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}ClaudeForge Server - Linux Service Installation${NC}"
echo -e "${GREEN}=============================================${NC}"

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}This script must be run as root (use sudo)${NC}" 
   exit 1
fi

# Check Linux distribution
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$NAME
    VER=$VERSION_ID
    echo "Detected OS: $OS $VER"
else
    echo -e "${YELLOW}Warning: Cannot detect OS version${NC}"
fi

# Check if systemd is available
if ! command -v systemctl &> /dev/null; then
    echo -e "${RED}Error: systemd is not available on this system${NC}"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    echo "Install Node.js using your package manager:"
    echo "  Ubuntu/Debian: sudo apt install nodejs npm"
    echo "  RHEL/CentOS:   sudo yum install nodejs npm"
    echo "  Arch:          sudo pacman -S nodejs npm"
    exit 1
fi

NODE_PATH=$(which node)
echo "Node.js found at: $NODE_PATH"

# Ask for the user to run the service as
echo ""
read -p "Enter the username to run the service as (default: $SUDO_USER): " SERVICE_USER
SERVICE_USER=${SERVICE_USER:-$SUDO_USER}

# Check if user exists
if ! id "$SERVICE_USER" &>/dev/null; then
    echo -e "${RED}Error: User $SERVICE_USER does not exist${NC}"
    exit 1
fi

# Create installation directory
echo ""
echo "Creating installation directory..."
mkdir -p "$INSTALL_PATH"

# Copy application files
echo "Copying application files..."
cp -r "$PROJECT_ROOT/"* "$INSTALL_PATH/" 2>/dev/null || true
rm -rf "$INSTALL_PATH/services" "$INSTALL_PATH/node_modules" "$INSTALL_PATH/.git"

# Set ownership
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_PATH"

# Navigate to installation directory
cd "$INSTALL_PATH"

# Install dependencies
echo ""
echo "Installing all dependencies (including dev dependencies for build)..."
sudo -u "$SERVICE_USER" npm install

# Build the project
echo "Building the project..."
sudo -u "$SERVICE_USER" npm run build

# Remove dev dependencies after build to save space
echo "Removing dev dependencies..."
sudo -u "$SERVICE_USER" npm prune --production

# Create log directory
echo ""
echo "Creating log directory..."
mkdir -p "$LOG_PATH"
chown "$SERVICE_USER:$SERVICE_USER" "$LOG_PATH"

# Create data directory for persistent storage
mkdir -p "$INSTALL_PATH/data"
chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_PATH/data"

# Copy example config if no config exists
if [ ! -f "$INSTALL_PATH/config.json" ]; then
    if [ -f "$INSTALL_PATH/config.example.json" ]; then
        echo "Creating config from example..."
        cp "$INSTALL_PATH/config.example.json" "$INSTALL_PATH/config.json"
        chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_PATH/config.json"
        echo -e "${YELLOW}Please edit $INSTALL_PATH/config.json to configure your MCP servers${NC}"
    fi
fi

# Create systemd service file
echo "Creating systemd service file..."
cat > "$SERVICE_FILE" << EOF
[Unit]
Description=ClaudeForge Server
Documentation=https://github.com/yourusername/claudeforge
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$INSTALL_PATH
ExecStart=$NODE_PATH $INSTALL_PATH/dist/index.js
Restart=always
RestartSec=10

# Environment variables
Environment="NODE_ENV=production"
Environment="CLAUDEFORGE_CONFIG=$INSTALL_PATH/config.json"
Environment="CLAUDEFORGE_PORT=3000"
Environment="CLAUDEFORGE_WEB_PORT=8080"

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=claudeforge

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=false
ReadWritePaths=$INSTALL_PATH/logs $INSTALL_PATH/data /home/$SERVICE_USER

# Resource limits
LimitNOFILE=65536
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd daemon
echo "Reloading systemd daemon..."
systemctl daemon-reload

# Enable the service
echo "Enabling service to start on boot..."
systemctl enable "$SERVICE_NAME"

# Start the service
echo "Starting service..."
systemctl start "$SERVICE_NAME"

# Check service status
sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
    echo ""
    echo -e "${GREEN}=============================================${NC}"
    echo -e "${GREEN}Installation Complete!${NC}"
    echo ""
    echo "Service Name: $SERVICE_NAME"
    echo "Installation Path: $INSTALL_PATH"
    echo "Config File: $INSTALL_PATH/config.json"
    echo "Running as user: $SERVICE_USER"
    echo "Web Interface: http://localhost:8080"
    echo ""
    echo -e "${YELLOW}Service Management Commands:${NC}"
    echo "  Status:  sudo systemctl status $SERVICE_NAME"
    echo "  Start:   sudo systemctl start $SERVICE_NAME"
    echo "  Stop:    sudo systemctl stop $SERVICE_NAME"
    echo "  Restart: sudo systemctl restart $SERVICE_NAME"
    echo "  Logs:    sudo journalctl -u $SERVICE_NAME -f"
    echo "  Enable:  sudo systemctl enable $SERVICE_NAME"
    echo "  Disable: sudo systemctl disable $SERVICE_NAME"
    echo ""
    echo "The service is enabled and will start automatically on system boot."
    
    # Show current status
    echo ""
    echo -e "${YELLOW}Current Service Status:${NC}"
    systemctl status "$SERVICE_NAME" --no-pager || true
else
    echo ""
    echo -e "${RED}Warning: Service installation may have failed.${NC}"
    echo "Check logs with: sudo journalctl -u $SERVICE_NAME -n 50"
fi

# Configure firewall if ufw is available
if command -v ufw &> /dev/null; then
    echo ""
    read -p "Do you want to configure UFW firewall rules? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Adding firewall rules..."
        ufw allow 3000/tcp comment 'ClaudeForge Server'
        ufw allow 8080/tcp comment 'ClaudeForge Web Interface'
        echo "Firewall rules added"
    fi
fi
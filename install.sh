#!/bin/bash

# ClaudeForge - Easy Installation Script
# Installs as a user service - no sudo/admin rights required
# Author: Jeff Pegg <jpeggdev@gmail.com>
# Website: https://claudeforge.com

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_header() {
    echo ""
    echo "======================================"
    echo "$1"
    echo "======================================"
    echo ""
}

# Detect OS
detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
    elif [[ "$OSTYPE" == "cygwin" || "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
        OS="windows"
    else
        print_error "Unsupported operating system: $OSTYPE"
        exit 1
    fi
    print_status "Detected OS: $OS"
}

# Check for Node.js
check_node() {
    print_header "Checking Node.js installation"
    
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v)
        print_status "Node.js is installed: $NODE_VERSION"
        
        # Check minimum version (18.0.0)
        REQUIRED_VERSION="18.0.0"
        CURRENT_VERSION=$(node -v | cut -d'v' -f2)
        
        if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$CURRENT_VERSION" | sort -V | head -n1)" = "$REQUIRED_VERSION" ]; then
            print_status "Node.js version meets requirements (>= v$REQUIRED_VERSION)"
        else
            print_error "Node.js version is too old. Required: >= v$REQUIRED_VERSION, Current: v$CURRENT_VERSION"
            print_error "Please update Node.js manually from: https://nodejs.org/"
            exit 1
        fi
    else
        print_error "Node.js is not installed"
        print_error "Please install Node.js (>= v18.0.0) from: https://nodejs.org/"
        exit 1
    fi
}

# Check for npm
check_npm() {
    if command -v npm &> /dev/null; then
        NPM_VERSION=$(npm -v)
        print_status "npm is installed: v$NPM_VERSION"
    else
        print_error "npm is not installed"
        exit 1
    fi
}

# Install dependencies
install_dependencies() {
    print_header "Installing project dependencies"
    
    # Install main project dependencies
    print_status "Installing main project dependencies..."
    npm install
    
    # Install mcp-servers dependencies
    if [ -d "mcp-servers" ]; then
        print_status "Installing MCP servers dependencies..."
        cd mcp-servers
        npm install
        cd ..
    fi
    
    # Install scripts dependencies
    if [ -d "scripts" ]; then
        print_status "Installing scripts dependencies..."
        cd scripts
        npm install
        cd ..
    fi
    
    print_status "All dependencies installed successfully"
}

# Build the project
build_project() {
    print_header "Building the project"
    
    print_status "Compiling TypeScript..."
    npm run build
    
    if [ -d "dist" ]; then
        print_status "Build completed successfully"
    else
        print_error "Build failed - dist directory not created"
        exit 1
    fi
}

# Setup configuration files
setup_config() {
    print_header "Setting up configuration files"
    
    # Create .env file if it doesn't exist
    if [ ! -f ".env" ]; then
        cat > .env << EOF
# ClaudeForge Configuration
CLAUDEFORGE_CONFIG=./config.json
CLAUDEFORGE_PORT=3000
CLAUDEFORGE_WEB_PORT=8080
CLAUDEFORGE_DEFAULT_PERMISSIONS=allow

# Add your API tokens here if needed:
# GITHUB_PERSONAL_ACCESS_TOKEN=your-github-token-here
# DATABASE_URL=postgresql://localhost/mydb
EOF
        print_status "Created .env file"
    else
        print_status ".env file already exists"
    fi
    
    # Create config.json with NO servers by default
    if [ ! -f "config.json" ]; then
        cat > config.json << EOF
{
  "port": 3000,
  "webPort": 8080,
  "defaultPermissions": "allow",
  "servers": []
}
EOF
        print_status "Created config.json (no servers configured)"
        print_warning "You can add MCP servers later via the web interface at http://localhost:8080"
    else
        print_status "config.json already exists"
    fi
}

# Install as user service
install_user_service() {
    print_header "Installing as user service (no sudo required)"
    
    INSTALL_DIR=$(pwd)
    USER_HOME=$HOME
    
    if [[ "$OS" == "linux" ]]; then
        print_status "Installing systemd user service for Linux..."
        
        # Create user systemd directory if it doesn't exist
        mkdir -p $USER_HOME/.config/systemd/user
        
        # Create service file
        cat > $USER_HOME/.config/systemd/user/claudeforge.service << EOF
[Unit]
Description=ClaudeForge - MCP Server Orchestration Platform (User Service)
After=network.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=$(which node) $INSTALL_DIR/dist/index.js
Restart=always
RestartSec=10
Environment="NODE_ENV=production"
Environment="CLAUDEFORGE_CONFIG=$INSTALL_DIR/config.json"

[Install]
WantedBy=default.target
EOF
        
        # Reload systemd user daemon
        systemctl --user daemon-reload
        
        # Enable and start the service
        systemctl --user enable claudeforge.service
        systemctl --user start claudeforge.service
        
        # Enable lingering to start service on boot without login
        loginctl enable-linger $USER
        
        print_status "User service installed and started"
        print_status "Service will start automatically on boot (even without login)"
        
    elif [[ "$OS" == "macos" ]]; then
        print_status "Installing launchd user agent for macOS..."
        
        # Create LaunchAgents directory if it doesn't exist
        mkdir -p $USER_HOME/Library/LaunchAgents
        
        # Create plist file
        cat > $USER_HOME/Library/LaunchAgents/com.claudeforge.user.plist << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.claudeforge.user</string>
    <key>ProgramArguments</key>
    <array>
        <string>$(which node)</string>
        <string>$INSTALL_DIR/dist/index.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$INSTALL_DIR</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$USER_HOME/Library/Logs/claudeforge-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>$USER_HOME/Library/Logs/claudeforge-stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>NODE_ENV</key>
        <string>production</string>
        <key>CLAUDEFORGE_CONFIG</key>
        <string>$INSTALL_DIR/config.json</string>
    </dict>
</dict>
</plist>
EOF
        
        # Load the service
        launchctl load -w $USER_HOME/Library/LaunchAgents/com.claudeforge.user.plist
        
        print_status "User agent installed and started"
        print_status "Service will start automatically when you log in"
        
    elif [[ "$OS" == "windows" ]]; then
        print_status "Creating Windows startup script..."
        
        # Create startup batch file
        STARTUP_DIR="$APPDATA/Microsoft/Windows/Start Menu/Programs/Startup"
        mkdir -p "$STARTUP_DIR"
        
        cat > "$STARTUP_DIR/claudeforge.bat" << EOF
@echo off
cd /d "$INSTALL_DIR"
start /min node dist/index.js
EOF
        
        # Also create a VBS script to run it hidden
        cat > "$STARTUP_DIR/claudeforge.vbs" << EOF
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run chr(34) & "$STARTUP_DIR\claudeforge.bat" & Chr(34), 0
Set WshShell = Nothing
EOF
        
        print_status "Created Windows startup script"
        print_status "Service will start automatically when you log in"
        
        # Try to start it now
        print_status "Starting service now..."
        cscript //nologo "$STARTUP_DIR/claudeforge.vbs"
    fi
}

# Verify service installation
verify_service() {
    print_header "Verifying service installation"
    
    sleep 3  # Give service time to start
    
    if [[ "$OS" == "linux" ]]; then
        if systemctl --user is-active --quiet claudeforge; then
            print_status "Service is running"
            echo ""
            echo "Service commands:"
            echo "  Status:  systemctl --user status claudeforge"
            echo "  Start:   systemctl --user start claudeforge"
            echo "  Stop:    systemctl --user stop claudeforge"
            echo "  Restart: systemctl --user restart claudeforge"
            echo "  Logs:    journalctl --user -u claudeforge -f"
        else
            print_error "Service is not running"
            print_status "Check logs: journalctl --user -u claudeforge -n 50"
        fi
        
    elif [[ "$OS" == "macos" ]]; then
        if launchctl list | grep -q com.claudeforge.user; then
            print_status "Service is loaded and running"
            echo ""
            echo "Service commands:"
            echo "  Status:  launchctl list | grep claudeforge"
            echo "  Start:   launchctl start com.claudeforge.user"
            echo "  Stop:    launchctl stop com.claudeforge.user"
            echo "  Logs:    tail -f ~/Library/Logs/claudeforge-*.log"
        else
            print_error "Service is not loaded"
        fi
        
    elif [[ "$OS" == "windows" ]]; then
        # Check if process is running
        if tasklist | grep -q "node.exe"; then
            print_status "Service appears to be running"
        else
            print_warning "Could not verify if service is running"
        fi
    fi
    
    # Test web interface
    print_status "Testing web interface..."
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:8080 | grep -q "200\|301\|302"; then
        print_status "Web interface is accessible at http://localhost:8080"
    else
        print_warning "Web interface may take a moment to start. Try accessing http://localhost:8080 in a few seconds"
    fi
}

# Create uninstall script
create_uninstall_script() {
    cat > uninstall.sh << 'EOF'
#!/bin/bash

# ClaudeForge - Uninstall Script

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${GREEN}Uninstalling ClaudeForge user service...${NC}"

if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    systemctl --user stop claudeforge
    systemctl --user disable claudeforge
    rm -f $HOME/.config/systemd/user/claudeforge.service
    systemctl --user daemon-reload
    loginctl disable-linger $USER
    echo -e "${GREEN}Linux user service uninstalled${NC}"
    
elif [[ "$OSTYPE" == "darwin"* ]]; then
    launchctl unload -w $HOME/Library/LaunchAgents/com.claudeforge.user.plist
    rm -f $HOME/Library/LaunchAgents/com.claudeforge.user.plist
    echo -e "${GREEN}macOS user agent uninstalled${NC}"
    
elif [[ "$OSTYPE" == "cygwin" || "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    rm -f "$APPDATA/Microsoft/Windows/Start Menu/Programs/Startup/claudeforge.bat"
    rm -f "$APPDATA/Microsoft/Windows/Start Menu/Programs/Startup/claudeforge.vbs"
    taskkill /F /IM node.exe 2>/dev/null || true
    echo -e "${GREEN}Windows startup script removed${NC}"
fi

echo -e "${GREEN}Uninstall complete!${NC}"
echo "Note: Project files and dependencies were not removed."
EOF
    chmod +x uninstall.sh
    print_status "Created uninstall.sh script"
}

# Print next steps
print_next_steps() {
    print_header "Installation Complete!"
    
    echo "ClaudeForge has been installed as a user service!"
    echo ""
    echo "Web Interface:"
    echo "  URL: http://localhost:8080"
    echo "  Use this to configure MCP servers and manage permissions"
    echo ""
    echo "Configuration Files:"
    echo "  Config: $(pwd)/config.json"
    echo "  Environment: $(pwd)/.env"
    echo ""
    
    if [[ "$OS" == "linux" ]]; then
        echo "Service Management (no sudo required):"
        echo "  Status:  systemctl --user status claudeforge"
        echo "  Start:   systemctl --user start claudeforge"
        echo "  Stop:    systemctl --user stop claudeforge"
        echo "  Restart: systemctl --user restart claudeforge"
        echo "  Logs:    journalctl --user -u claudeforge -f"
    elif [[ "$OS" == "macos" ]]; then
        echo "Service Management (no sudo required):"
        echo "  Status:  launchctl list | grep claudeforge"
        echo "  Start:   launchctl start com.claudeforge.user"
        echo "  Stop:    launchctl stop com.claudeforge.user"
        echo "  Logs:    tail -f ~/Library/Logs/claudeforge-*.log"
    elif [[ "$OS" == "windows" ]]; then
        echo "Service Management:"
        echo "  The service runs from: %APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup"
        echo "  To stop: Use Task Manager to end node.exe process"
    fi
    
    echo ""
    echo "The service will start automatically when you log in."
    echo ""
    echo "To uninstall later, run: ./uninstall.sh"
    echo ""
    echo "IMPORTANT: No MCP servers are configured by default."
    echo "Add servers via the web interface at http://localhost:8080"
}

# Main installation flow
main() {
    print_header "ClaudeForge - User Service Installation"
    echo "No sudo/admin rights required!"
    echo ""
    
    detect_os
    check_node
    check_npm
    install_dependencies
    build_project
    setup_config
    install_user_service
    verify_service
    create_uninstall_script
    print_next_steps
}

# Run main function
main
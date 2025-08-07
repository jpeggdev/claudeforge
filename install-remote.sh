#!/bin/bash

# ClaudeForge - Remote Installation Script
# This script downloads and installs ClaudeForge from GitHub
# Author: Jeff Pegg <jpeggdev@gmail.com>
# Website: https://claudeforge.com
#
# Usage: curl -sSL https://raw.githubusercontent.com/jpegg/claudeforge/main/install-remote.sh | bash

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
GITHUB_USER="jpegg"
GITHUB_REPO="claudeforge"
INSTALL_DIR="$HOME/claudeforge"
BRANCH="main"

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

print_info() {
    echo -e "${BLUE}[i]${NC} $1"
}

print_header() {
    echo ""
    echo -e "${BLUE}================================================${NC}"
    echo -e "${BLUE}     ClaudeForge - One-Line Installation${NC}"
    echo -e "${BLUE}================================================${NC}"
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

# Check for required tools
check_requirements() {
    print_header
    print_info "Checking system requirements..."
    
    # Check for curl or wget
    if ! command -v curl &> /dev/null && ! command -v wget &> /dev/null; then
        print_error "Neither curl nor wget is installed. Please install one of them."
        exit 1
    fi
    
    # Check for git
    if ! command -v git &> /dev/null; then
        print_error "Git is not installed. Installing git..."
        if [[ "$OS" == "linux" ]]; then
            if command -v apt-get &> /dev/null; then
                sudo apt-get update && sudo apt-get install -y git
            elif command -v yum &> /dev/null; then
                sudo yum install -y git
            elif command -v pacman &> /dev/null; then
                sudo pacman -S --noconfirm git
            else
                print_error "Could not install git. Please install it manually."
                exit 1
            fi
        elif [[ "$OS" == "macos" ]]; then
            if command -v brew &> /dev/null; then
                brew install git
            else
                print_error "Please install git manually or install Homebrew first"
                exit 1
            fi
        fi
    fi
    print_status "Git is installed"
    
    # Check for Node.js
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v)
        print_status "Node.js is installed: $NODE_VERSION"
        
        # Check minimum version (18.0.0)
        REQUIRED_VERSION="18.0.0"
        CURRENT_VERSION=$(node -v | cut -d'v' -f2)
        
        if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$CURRENT_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
            print_error "Node.js version is too old. Required: >= v$REQUIRED_VERSION, Current: v$CURRENT_VERSION"
            install_node
        fi
    else
        print_error "Node.js is not installed"
        install_node
    fi
    
    # Check for npm
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed"
        exit 1
    fi
    print_status "npm is installed: v$(npm -v)"
}

# Install Node.js
install_node() {
    print_info "Installing Node.js..."
    
    if [[ "$OS" == "linux" ]]; then
        print_info "Installing Node.js via NodeSource repository..."
        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif [[ "$OS" == "macos" ]]; then
        if command -v brew &> /dev/null; then
            print_info "Installing Node.js via Homebrew..."
            brew install node
        else
            print_error "Please install Node.js manually from https://nodejs.org/"
            print_info "Or install Homebrew first: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
            exit 1
        fi
    else
        print_error "Please install Node.js manually from https://nodejs.org/"
        exit 1
    fi
    
    # Verify installation
    if command -v node &> /dev/null; then
        print_status "Node.js installed successfully: $(node -v)"
    else
        print_error "Failed to install Node.js"
        exit 1
    fi
}

# Clone or update repository
download_claudeforge() {
    print_info "Downloading ClaudeForge..."
    
    if [ -d "$INSTALL_DIR" ]; then
        print_warning "ClaudeForge directory already exists at $INSTALL_DIR"
        read -p "Do you want to update the existing installation? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            cd "$INSTALL_DIR"
            print_info "Updating ClaudeForge..."
            git fetch origin
            git reset --hard origin/$BRANCH
            print_status "ClaudeForge updated successfully"
        else
            print_error "Installation cancelled"
            exit 1
        fi
    else
        print_info "Cloning ClaudeForge repository..."
        git clone --depth 1 --branch $BRANCH "https://github.com/$GITHUB_USER/$GITHUB_REPO.git" "$INSTALL_DIR"
        print_status "ClaudeForge downloaded successfully to $INSTALL_DIR"
    fi
}

# Run the local installation script
run_local_installer() {
    print_info "Running ClaudeForge installer..."
    cd "$INSTALL_DIR"
    
    # Make the installer executable
    chmod +x install.sh
    
    # Run the installer
    ./install.sh
}

# Add to PATH
add_to_path() {
    print_info "Adding ClaudeForge to PATH..."
    
    # Create a claudeforge command
    cat > "$HOME/.local/bin/claudeforge" << EOF
#!/bin/bash
cd "$INSTALL_DIR"
node dist/index.js "\$@"
EOF
    
    chmod +x "$HOME/.local/bin/claudeforge"
    
    # Add to shell config if not already there
    SHELL_CONFIG=""
    if [ -f "$HOME/.bashrc" ]; then
        SHELL_CONFIG="$HOME/.bashrc"
    elif [ -f "$HOME/.zshrc" ]; then
        SHELL_CONFIG="$HOME/.zshrc"
    fi
    
    if [ -n "$SHELL_CONFIG" ]; then
        if ! grep -q ".local/bin" "$SHELL_CONFIG"; then
            echo "" >> "$SHELL_CONFIG"
            echo "# Added by ClaudeForge installer" >> "$SHELL_CONFIG"
            echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >> "$SHELL_CONFIG"
            print_status "Added ~/.local/bin to PATH in $SHELL_CONFIG"
            print_warning "Please run: source $SHELL_CONFIG"
        fi
    fi
}

# Print success message
print_success() {
    echo ""
    echo -e "${GREEN}================================================${NC}"
    echo -e "${GREEN}     ClaudeForge Installation Complete!${NC}"
    echo -e "${GREEN}================================================${NC}"
    echo ""
    echo "ClaudeForge has been installed to: $INSTALL_DIR"
    echo ""
    echo "The service is running and will start automatically on login."
    echo ""
    echo "Web Interface: http://localhost:8080"
    echo "API Endpoint: http://localhost:3000"
    echo ""
    echo "To manage the service:"
    if [[ "$OS" == "linux" ]]; then
        echo "  Status:  systemctl --user status claudeforge"
        echo "  Stop:    systemctl --user stop claudeforge"
        echo "  Start:   systemctl --user start claudeforge"
        echo "  Logs:    journalctl --user -u claudeforge -f"
    elif [[ "$OS" == "macos" ]]; then
        echo "  Status:  launchctl list | grep claudeforge"
        echo "  Stop:    launchctl stop com.claudeforge.user"
        echo "  Start:   launchctl start com.claudeforge.user"
        echo "  Logs:    tail -f ~/Library/Logs/claudeforge-*.log"
    fi
    echo ""
    echo "Configuration files:"
    echo "  $INSTALL_DIR/config.json"
    echo "  $INSTALL_DIR/.env"
    echo ""
    echo "To uninstall:"
    echo "  cd $INSTALL_DIR && ./uninstall.sh"
    echo ""
    echo -e "${GREEN}Enjoy using ClaudeForge!${NC}"
}

# Main installation flow
main() {
    # Trap errors
    trap 'print_error "Installation failed. Please check the error messages above."' ERR
    
    detect_os
    check_requirements
    
    # Create necessary directories
    mkdir -p "$HOME/.local/bin"
    
    download_claudeforge
    run_local_installer
    add_to_path
    print_success
}

# Run the installer
main "$@"
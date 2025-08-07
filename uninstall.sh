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

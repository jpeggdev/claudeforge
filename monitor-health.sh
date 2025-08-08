#!/bin/bash

# ClaudeForge Health Monitor Script
# This script checks the health of both the web server and proxy server

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
WEB_PORT=${CLAUDEFORGE_WEB_PORT:-8080}
PROXY_PORT=${CLAUDEFORGE_PORT:-3000}
MAX_RETRIES=3
RETRY_DELAY=2

# Function to check a single endpoint
check_endpoint() {
    local url=$1
    local name=$2
    local retries=0
    
    while [ $retries -lt $MAX_RETRIES ]; do
        if curl -sf "$url" > /dev/null 2>&1; then
            echo -e "${GREEN}✓${NC} $name is healthy"
            return 0
        fi
        retries=$((retries + 1))
        if [ $retries -lt $MAX_RETRIES ]; then
            sleep $RETRY_DELAY
        fi
    done
    
    echo -e "${RED}✗${NC} $name is not responding"
    return 1
}

# Function to check service status
check_service_status() {
    if systemctl --user is-active claudeforge > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} ClaudeForge service is active"
        return 0
    else
        echo -e "${RED}✗${NC} ClaudeForge service is not active"
        return 1
    fi
}

# Function to check ports are listening
check_ports() {
    local web_listening=false
    local proxy_listening=false
    
    if ss -tlnp 2>/dev/null | grep -q ":$WEB_PORT"; then
        web_listening=true
        echo -e "${GREEN}✓${NC} Web server port $WEB_PORT is listening"
    else
        echo -e "${RED}✗${NC} Web server port $WEB_PORT is not listening"
    fi
    
    if ss -tlnp 2>/dev/null | grep -q ":$PROXY_PORT"; then
        proxy_listening=true
        echo -e "${GREEN}✓${NC} Proxy server port $PROXY_PORT is listening"
    else
        echo -e "${RED}✗${NC} Proxy server port $PROXY_PORT is not listening"
    fi
    
    if [ "$web_listening" = true ] && [ "$proxy_listening" = true ]; then
        return 0
    else
        return 1
    fi
}

# Function to get detailed health status
get_health_status() {
    local health_response
    health_response=$(curl -sf "http://localhost:$WEB_PORT/api/health" 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} Health API responded:"
        echo "$health_response" | jq . 2>/dev/null || echo "$health_response"
        return 0
    else
        echo -e "${RED}✗${NC} Health API not responding"
        return 1
    fi
}

# Function to check recent errors in logs
check_recent_errors() {
    local error_count
    error_count=$(journalctl --user -u claudeforge --since "5 minutes ago" 2>/dev/null | grep -c -i error || true)
    
    if [ "$error_count" -gt 0 ]; then
        echo -e "${YELLOW}⚠${NC} Found $error_count error(s) in recent logs"
        echo "Recent errors:"
        journalctl --user -u claudeforge --since "5 minutes ago" 2>/dev/null | grep -i error | tail -5
    else
        echo -e "${GREEN}✓${NC} No errors in recent logs"
    fi
}

# Main health check
main() {
    echo "========================================="
    echo "ClaudeForge Health Check"
    echo "========================================="
    echo ""
    
    local exit_code=0
    
    # Check service status
    if ! check_service_status; then
        exit_code=1
    fi
    echo ""
    
    # Check ports
    if ! check_ports; then
        exit_code=1
    fi
    echo ""
    
    # Check endpoints
    echo "Checking endpoints..."
    if ! check_endpoint "http://localhost:$WEB_PORT/api/health" "Web server"; then
        exit_code=1
    fi
    
    if ! check_endpoint "http://localhost:$PROXY_PORT/health" "Proxy server"; then
        exit_code=1
    fi
    echo ""
    
    # Get detailed health status
    get_health_status
    echo ""
    
    # Check for recent errors
    check_recent_errors
    echo ""
    
    # Summary
    echo "========================================="
    if [ $exit_code -eq 0 ]; then
        echo -e "${GREEN}Overall Status: HEALTHY${NC}"
    else
        echo -e "${RED}Overall Status: UNHEALTHY${NC}"
        echo ""
        echo "Troubleshooting steps:"
        echo "1. Check service status: systemctl --user status claudeforge"
        echo "2. View logs: journalctl --user -u claudeforge -f"
        echo "3. Restart service: systemctl --user restart claudeforge"
        echo "4. Rebuild and restart: npm run build && systemctl --user restart claudeforge"
    fi
    echo "========================================="
    
    exit $exit_code
}

# Handle script arguments
case "${1:-}" in
    --watch|-w)
        # Continuous monitoring mode
        while true; do
            clear
            main
            echo ""
            echo "Refreshing in 10 seconds... (Press Ctrl+C to stop)"
            sleep 10
        done
        ;;
    --json|-j)
        # JSON output for programmatic use
        web_health=$(curl -sf "http://localhost:$WEB_PORT/api/health" 2>/dev/null || echo '{"status":"error"}')
        proxy_health=$(curl -sf "http://localhost:$PROXY_PORT/health" 2>/dev/null || echo '{"status":"error"}')
        service_active=$(systemctl --user is-active claudeforge 2>/dev/null || echo "inactive")
        
        jq -n \
            --argjson web "$web_health" \
            --argjson proxy "$proxy_health" \
            --arg service "$service_active" \
            '{
                service: $service,
                web: $web,
                proxy: $proxy,
                timestamp: now | todate
            }'
        ;;
    --help|-h)
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  --watch, -w    Continuous monitoring mode (refreshes every 10 seconds)"
        echo "  --json, -j     Output results in JSON format"
        echo "  --help, -h     Show this help message"
        echo ""
        echo "Environment variables:"
        echo "  CLAUDEFORGE_WEB_PORT    Web server port (default: 8080)"
        echo "  CLAUDEFORGE_PORT        Proxy server port (default: 3000)"
        ;;
    *)
        main
        ;;
esac
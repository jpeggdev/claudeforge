# MCP Server Debugging Guide

## Overview
This guide helps you debug MCP server connections and add new servers to the proxy.

## Quick Diagnostics

### 1. Check Server Status
```bash
# View all servers and their status
curl -s http://localhost:8080/api/servers | python3 -m json.tool | grep -E '"name"|"status"'

# Check specific server details
curl -s http://localhost:8080/api/servers | python3 -m json.tool | grep -A 20 '"your-server-name"'
```

### 2. Check Logs
```bash
# View recent logs
curl -s http://localhost:8080/api/logs | python3 -m json.tool | tail -50

# Check logs for specific server
curl -s http://localhost:8080/api/logs | python3 -m json.tool | grep -B2 -A5 '"serverId": "your-server-id"'

# Check systemd service logs
journalctl --user -u mcp-proxy -n 50 --no-pager
```

## Testing MCP Servers

### Use the Test Script
```bash
cd /home/jpegg/code/ai/mcp_proxy/scripts
node test-mcp-server.js
```

This will test different server types and show you what's working.

### Manual Testing

#### STDIO Servers
```bash
# Test if server starts and responds
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}},"id":1}' | \
  node /path/to/server.js
```

#### SSE Servers
```bash
# Test SSE connection
curl -N -H "Accept: text/event-stream" https://your-sse-endpoint

# The server should send an "endpoint" event
# Expected: event: endpoint
#          data: /messages?sessionId=xxx
```

#### HTTP/Streamable-HTTP Servers
```bash
# Test HTTP endpoint
curl -X POST http://your-endpoint \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}},"id":1}'
```

## Common Issues and Solutions

### 1. Server Times Out
**Problem**: Connection timeout after 30 seconds

**Solutions**:
- For SSE: Check if endpoint URL is correct (e.g., `/sse` vs `/mcp`)
- For STDIO: Verify the binary path is correct
- Check if server requires environment variables

### 2. Server Exits Immediately
**Problem**: Process exited with code 1

**Solutions**:
- Check stderr output in logs for error messages
- Verify it's actually an MCP server (not a CLI tool)
- Check required arguments and environment variables

### 3. Wrong Binary Path
**Problem**: Server doesn't implement MCP protocol

**Solutions**:
- Find the correct binary:
  ```bash
  ls -la /path/to/package/dist/
  find /path/to/package -name "*mcp*.js" -o -name "*server*.js"
  ```
- Check package.json for bin entries:
  ```bash
  cat /path/to/package/package.json | grep -A5 '"bin"'
  ```

### 4. Missing Environment Variables
**Problem**: Server fails authentication or configuration

**Solutions**:
- Check documentation for required env vars
- Add to config.json:
  ```json
  "env": {
    "API_KEY": "your-key",
    "OTHER_VAR": "value"
  }
  ```

## Adding New MCP Servers

### Step 1: Identify Server Type
Determine the transport type:
- **stdio**: Local process communication
- **sse**: Server-Sent Events (remote)
- **websocket**: WebSocket connection
- **http/streamable-http**: HTTP POST requests

### Step 2: Find Correct Configuration

#### For NPM Packages
```bash
# Install the package
npm install -g @org/mcp-server-name

# Find the binary
ls -la ~/.npm-global/lib/node_modules/@org/mcp-server-name/

# Check package.json
cat ~/.npm-global/lib/node_modules/@org/mcp-server-name/package.json | grep -A10 '"bin"'
```

#### For Local Development
```bash
# Build the server
npm run build

# Find the output
ls -la dist/
```

### Step 3: Test the Server
Use the test script to verify it works:
```javascript
// Edit test-mcp-server.js to add your server
await testStdioServer('node', ['/path/to/your/server.js']);
```

### Step 4: Add to Configuration
Edit `/home/jpegg/code/ai/mcp_proxy/config.json`:

#### STDIO Server Example
```json
{
  "id": "my-server",
  "name": "My Server",
  "command": "node",
  "transport": "stdio",
  "args": [
    "/path/to/server.js",
    "optional-arg"
  ],
  "env": {
    "API_KEY": "if-needed"
  }
}
```

#### SSE Server Example
```json
{
  "id": "my-sse-server",
  "name": "My SSE Server",
  "transport": "sse",
  "endpoint": "https://example.com/sse"
}
```

#### HTTP Server Example
```json
{
  "id": "my-http-server",
  "name": "My HTTP Server",
  "transport": "streamable-http",
  "url": "http://localhost:3000/mcp"
}
```

### Step 5: Reload and Test
The config auto-reloads, or you can:
1. Click the 📄 button in the web UI
2. Or POST to `/api/config/reload`

Then check if it connected:
```bash
curl -s http://localhost:8080/api/servers | python3 -m json.tool | grep -A5 '"my-server"'
```

## Debugging Checklist

- [ ] Is it actually an MCP server? (not a CLI tool)
- [ ] Is the binary path correct?
- [ ] Are all required arguments provided?
- [ ] Are environment variables set?
- [ ] Is the transport type correct?
- [ ] For SSE: Is the endpoint URL correct?
- [ ] For HTTP: Is the server running?
- [ ] Check stderr output in logs
- [ ] Test manually with the test script
- [ ] Check if server requires special initialization

## Known Working Servers

| Server | Transport | Notes |
|--------|-----------|-------|
| @modelcontextprotocol/server-filesystem | stdio | Works out of the box |
| @modelcontextprotocol/server-github | stdio | Requires GITHUB_PERSONAL_ACCESS_TOKEN |
| context7 | sse | Use endpoint: https://mcp.context7.com/sse |
| mcp-chrome-bridge | stdio | Use dist/mcp/mcp-server-stdio.js |

## Known Non-MCP Tools
These are CLI tools, not MCP servers:
- @21st-dev/cli - Installation tool for MCP configs
- Various CLI utilities that happen to have "mcp" in the name

## Getting Help

1. Check the server's documentation/README
2. Look for example configurations in the repository
3. Use the test script to debug connection issues
4. Check the logs for detailed error messages
5. Try different binary paths if unsure
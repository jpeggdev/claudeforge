# ClaudeForge Development Guide

This document provides essential information for AI assistants working on the ClaudeForge project.

## Project Overview

ClaudeForge is a Model Context Protocol (MCP) orchestration platform that acts as a proxy between MCP clients and multiple MCP servers. It provides comprehensive debugging, monitoring, and permission management capabilities through a modern web interface.

## Architecture

```
ClaudeForge (Node.js/TypeScript)
├── Proxy Server (Port 3000)
│   ├── SSE MCP Handler (Legacy HTTP+SSE)
│   ├── Streamable HTTP Handler (2025 spec)
│   └── WebSocket Transport
├── Web Server (Port 8080)
│   ├── REST API
│   ├── WebSocket for real-time updates
│   └── Static file serving
├── Debug Manager
│   ├── Message interception
│   └── Request-response pairing
├── Firehose Manager
│   ├── Event capture (ALL system activity)
│   ├── Real-time streaming
│   └── Noise reduction filters
└── Server Manager
    ├── Stdio servers
    ├── SSE servers
    ├── WebSocket servers
    └── HTTP servers
```

## Key Components

### 1. Proxy Server (`src/proxy-server.ts`)
- Main orchestrator that manages MCP server connections
- Handles client requests and routes them to appropriate servers
- Manages server lifecycle (start, stop, restart)

### 2. Web Server (`src/web-server.ts`)
- Provides web management interface on port 8080
- REST API for configuration and control
- WebSocket for real-time status updates
- Serves the static web UI from `/public`

### 3. Debug Manager (`src/debug-manager.ts`)
- Intercepts all MCP messages
- Pairs requests with responses
- Tracks timing and performance metrics
- Provides export capabilities

### 4. Firehose Manager (`src/firehose-manager.ts`)
- Captures ALL system events (MCP, HTTP, WebSocket, system)
- Real-time event streaming via SSE
- Buffer management and filtering
- Noise reduction capabilities

### 5. Server Manager (`src/server-manager.ts`)
- Manages multiple MCP server connections
- Supports stdio, SSE, WebSocket, and HTTP transports
- Handles server initialization and capability discovery

## Development Commands

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Development mode with watch
npm run dev

# Type checking
npx tsc --noEmit

# Run tests
npm test

# Start production server
npm start
```

## Service Management (User Service)

ClaudeForge runs as a user service, NOT a system service. Never use sudo.

```bash
# Build and restart the service
npm run build && systemctl --user restart claudeforge

# Check service status
systemctl --user status claudeforge

# View logs
journalctl --user -u claudeforge -f

# Stop service
systemctl --user stop claudeforge

# Start service
systemctl --user start claudeforge

# Restart service
systemctl --user restart claudeforge

# Enable auto-start on login
systemctl --user enable claudeforge

# Disable auto-start
systemctl --user disable claudeforge
```

The service file is located at: `~/.config/systemd/user/claudeforge.service`

## Configuration

### Main Config (`config.json`)
```json
{
  "port": 3000,        // Proxy server port
  "webPort": 8080,     // Web interface port
  "defaultPermissions": "allow",
  "servers": [
    {
      "id": "unique-id",
      "name": "Display Name",
      "transport": "stdio|sse|websocket|http",
      "command": "command-to-run",
      "args": ["arg1", "arg2"],
      "env": {
        "KEY": "value"
      },
      "disabled": false  // Optional: disable without removing
    }
  ]
}
```

### Reload Config Without Restart
```bash
# Via API
curl -X POST http://localhost:8080/api/config/reload

# Or use the web UI reload button (📄)
```

## Web Interface Structure

### HTML (`public/index.html`)
- Single-page application
- Two tab groups:
  - **MCP Server tabs** (left): Tools, Resources, Prompts, Server Logs
  - **System tabs** (right): Firehose, Debug Inspector, System Logs
- Uses inline styles and vanilla JavaScript

### JavaScript (`public/app.js`)
- `MCPProxyManager` class handles all UI logic
- WebSocket connection for real-time updates
- Firehose filtering and noise reduction
- Debug message handling

## Key Features Implementation

### 1. Firehose Stream
- Captures ALL events via `FirehoseManager`
- Real-time display with auto-scroll
- Noise reduction filters (WebSocket messages, stats, heartbeats, etc.)
- Custom exclusion patterns
- Export capabilities

### 2. Debug Inspector
- Wraps MCP transports with `DebugTransportWrapper`
- Intercepts messages bidirectionally
- Pairs requests with responses
- Tracks timing and performance

### 3. Permission Management
- Granular tool permissions (read, write, execute)
- Session-based permission tracking
- Default allow/deny policies
- Real-time permission updates

## API Endpoints

### Server Management
- `GET /api/servers` - List servers with capabilities
- `POST /api/servers/:id/restart` - Restart a server
- `DELETE /api/servers/:id` - Stop a server
- `POST /api/config/reload` - Reload configuration

### Debug & Monitoring
- `GET /api/debug/status` - Debug status and stats
- `POST /api/debug/enable` - Enable debugging
- `GET /api/debug/messages` - Get debug messages
- `GET /api/debug/export` - Export debug data
- `GET /api/debug/stream` - SSE stream of debug events

### Firehose
- `GET /api/firehose/status` - Get statistics
- `POST /api/firehose/pause` - Pause streaming
- `GET /api/firehose/stream` - SSE event stream
- `GET /api/firehose/export` - Export events

## Testing & Debugging

### Quick Test Commands
```bash
# Test if service is running
curl http://localhost:8080/api/servers

# Watch firehose stream
node firehose-viewer.js

# Check debug status
curl http://localhost:8080/api/debug/status

# Enable debugging
curl -X POST http://localhost:8080/api/debug/enable
```

### Common Issues

1. **Service won't start**
   - Check logs: `journalctl --user -u claudeforge -f`
   - Verify ports 3000 and 8080 are free
   - Ensure Node.js v18+ is installed

2. **MCP servers not connecting**
   - Check server command and args in config.json
   - Verify environment variables (API keys, tokens)
   - Look for errors in the web UI or logs

3. **TypeScript compilation errors**
   - Run `npx tsc --noEmit` to check types
   - Ensure all imports use `.js` extension
   - Check for missing type definitions

## Code Style Guidelines

1. **TypeScript**
   - Use explicit types for public methods
   - Prefer interfaces over type aliases
   - Use `.js` extensions in imports (for ESM)

2. **Error Handling**
   - Always catch and log errors appropriately
   - Use try-catch in async functions
   - Provide meaningful error messages

3. **Logging**
   - Use LogManager for structured logging
   - Include context (serverId, sessionId)
   - Use appropriate log levels (error, warning, info)

## Adding New Features

### Adding a New MCP Server
1. Add configuration to `config.json`
2. Restart service: `systemctl --user restart claudeforge`
3. Check web UI for new server

### Adding a New API Endpoint
1. Add route in `src/web-server.ts`
2. Implement handler logic
3. Update this documentation
4. Rebuild: `npm run build`
5. Restart: `systemctl --user restart claudeforge`

### Adding a New Transport Type
1. Create transport class in `src/transports/`
2. Implement `Transport` interface
3. Add to `ServerManager.connectToServer()`
4. Update configuration schema

## Environment Variables

```bash
# Override configuration
export CLAUDEFORGE_CONFIG=/path/to/config.json
export CLAUDEFORGE_PORT=3000
export CLAUDEFORGE_WEB_PORT=8080
export CLAUDEFORGE_DEFAULT_PERMISSIONS=allow

# Development
export NODE_ENV=development
```

## Important Notes

1. **Never use sudo** - This is a user service
2. **Always rebuild** before restarting the service
3. **Check logs** when debugging issues
4. **Test locally** before deploying changes
5. **Update documentation** when adding features

## Useful File Paths

- Config: `~/code/ai/claudeforge/config.json`
- Service: `~/.config/systemd/user/claudeforge.service`
- Source: `~/code/ai/claudeforge/src/`
- Built: `~/code/ai/claudeforge/dist/`
- Web UI: `~/code/ai/claudeforge/public/`
- Logs: `journalctl --user -u claudeforge`

## Recent Updates (2025)

1. **Firehose System**: Complete event capture and streaming
2. **Debug Inspector**: MCP message interception and analysis
3. **Noise Reduction**: Smart filtering for cleaner debugging
4. **UI Separation**: MCP server tabs vs System tabs
5. **Streamable HTTP**: Support for 2025-03-26 MCP specification
6. **Config Hot-Reload**: Reload without service restart

## Contact

- Author: Jeff Pegg
- Email: jpeggdev@gmail.com
- Website: claudeforge.com
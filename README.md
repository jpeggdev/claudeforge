# ClaudeForge

ClaudeForge is a powerful orchestration platform for Model Context Protocol (MCP) servers. It acts as a transparent proxy between MCP clients and multiple MCP servers, providing a sophisticated web-based interface for managing tool permissions, server lifecycle, debugging, and comprehensive system monitoring.

**Website:** [claudeforge.com](https://claudeforge.com)  
**Author:** Jeff Pegg ([jpeggdev@gmail.com](mailto:jpeggdev@gmail.com))

## Features

### Core Capabilities
- **Transparent Proxying**: Clients connect to the proxy as if it were a single MCP server
- **Multiple Server Support**: Connect to multiple MCP servers (stdio, SSE, WebSocket, HTTP)
- **Dual Protocol Support**: Supports both legacy HTTP+SSE (2024-11-05) and new Streamable HTTP (2025-03-26)
- **Web Management Interface**: Configure tool permissions through a modern web UI
- **Permission Management**: Granular control over which tools are exposed to clients
- **Server Lifecycle Management**: Start, stop, and restart MCP servers
- **Configuration Hot-Reload**: Reload config.json without restarting the service

### Advanced Debugging & Monitoring
- **🔥 Firehose Stream**: Real-time view of ALL system activity (MCP, HTTP, WebSocket, system events)
- **Debug Inspector**: MCP message interception and analysis with request-response pairing
- **Noise Reduction**: Smart filtering to hide repetitive/unhelpful messages
- **System Logs**: Comprehensive logging with level filtering and real-time updates
- **WebSocket Monitoring**: Track all WebSocket connections and messages
- **Performance Metrics**: Response times, error counts, event rates

### Developer Features
- **Real-time Status Updates**: WebSocket-based status monitoring
- **Event Export**: Export debug data and firehose streams for analysis
- **Custom Exclusion Patterns**: Define custom filters for noise reduction
- **Graceful Shutdown**: Properly shuts down all connected servers on exit

## Architecture

```
┌─────────────┐
│  MCP Client │
└──────┬──────┘
       │ HTTP/SSE/Streamable
       ▼
┌─────────────────────────────────────┐
│           ClaudeForge Proxy          │
│  ┌─────────────────────────────┐    │
│  │   🔥 Firehose Manager        │    │
│  │   📊 Debug Inspector         │    │
│  │   🔐 Permission Manager      │    │
│  └─────────────────────────────┘    │
└──────┬───────────────────┬──────────┘
       │                   │
       ▼                   ▼
┌──────────────┐    ┌──────────────┐
│ Web Interface│    │  MCP Servers │
│   Port 8080  │    │              │
└──────────────┘    └──────────────┘
                           │
   ┌───────┬───────┬───────┴───────┐
   ▼       ▼       ▼               ▼
┌──────┐ ┌──────┐ ┌──────┐     ┌──────┐
│Server│ │Server│ │Server│ ... │Server│
│(stdio)│ │(SSE) │ │(HTTP)│     │ (WS) │
└──────┘ └──────┘ └──────┘     └──────┘
```

## Quick Install

Install ClaudeForge with a single command:

```bash
curl -sSL https://raw.githubusercontent.com/jpegg/claudeforge/main/install-remote.sh | bash
```

Or if you prefer wget:

```bash
wget -qO- https://raw.githubusercontent.com/jpegg/claudeforge/main/install-remote.sh | bash
```

This will:
- Check and install Node.js if needed (v18+)
- Download ClaudeForge to `~/claudeforge`
- Install all dependencies
- Build the project
- Set up as a user service (starts on login)
- Configure the web interface on port 8080

After installation, access the web interface at: http://localhost:8080

## Manual Installation

If you prefer to install manually:

```bash
# Clone the repository
git clone https://github.com/jpegg/claudeforge
cd claudeforge

# Run the installer
./install.sh
```

Or build from source:

```bash
# Clone the repository
git clone https://github.com/jpegg/claudeforge
cd claudeforge

# Install dependencies
npm install

# Build the TypeScript code
npm run build

# Start the server
npm start
```

## Configuration

1. Copy the example configuration:
```bash
cp config.example.json config.json
cp .env.example .env
```

2. Edit `config.json` to configure your MCP servers:

```json
{
  "port": 3000,
  "webPort": 8080,
  "defaultPermissions": "allow",
  "servers": [
    {
      "id": "filesystem",
      "name": "Filesystem Server",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      "transport": "stdio"
    },
    {
      "id": "github",
      "name": "GitHub Server",
      "command": "node",
      "args": ["mcp-servers/dist/github/index.js"],
      "env": {
        "GITHUB_TOKEN": "your-token-here"
      },
      "transport": "stdio"
    }
  ]
}
```

### Configuration Options

- `port`: Port for the ClaudeForge server (default: 3000)
- `webPort`: Port for the web management interface (default: 8080)
- `defaultPermissions`: Default permission policy ("allow" or "deny")
- `servers`: Array of MCP server configurations

### Server Configuration

Each server configuration supports:

- `id`: Unique identifier for the server
- `name`: Display name in the web interface
- `transport`: Connection type ("stdio", "sse", "websocket", or "http")
- `command`: Command to execute (for stdio transport)
- `args`: Command arguments (for stdio transport)
- `env`: Environment variables (for stdio transport)
- `endpoint`: Server URL (for SSE/WebSocket/HTTP transport)
- `disabled`: Optional boolean to disable a server without removing it

## Usage

### Starting the Proxy

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm run build
npm start
```

### Running as a User Service

ClaudeForge can be installed as a user service that starts automatically when you log in:

```bash
# Install as user service
systemctl --user enable claudeforge
systemctl --user start claudeforge

# Check service status
systemctl --user status claudeforge

# View logs
journalctl --user -u claudeforge -f

# Restart service
systemctl --user restart claudeforge

# Stop service
systemctl --user stop claudeforge

# Disable auto-start
systemctl --user disable claudeforge
```

The user service file is located at: `~/.config/systemd/user/claudeforge.service`

### Connecting MCP Clients

Configure your MCP client to connect to ClaudeForge:

```json
{
  "mcpServers": {
    "claudeforge": {
      "command": "node",
      "args": ["/path/to/claudeforge/dist/index.js"],
      "env": {
        "CLAUDEFORGE_CONFIG": "/path/to/config.json"
      }
    }
  }
}
```

Or for remote connections:

```json
{
  "mcpServers": {
    "claudeforge": {
      "transport": "sse",
      "endpoint": "http://localhost:3000/mcp"
    }
  }
}
```

### Web Management Interface

Open your browser to `http://localhost:8080` to access:

#### MCP Server Features (Left Tabs)
- **Tools**: Browse and manage available tools with permissions
- **Resources**: View available resources from connected servers
- **Prompts**: Access pre-defined prompt templates
- **Server Logs**: View logs from individual MCP servers

#### System Features (Right Tabs)
- **🔥 Firehose**: Real-time stream of ALL system activity
  - Smart auto-scroll (stops when you manually scroll)
  - Text filtering and category filtering
  - Noise reduction with customizable exclusions
  - Export capabilities for analysis
- **Debug Inspector**: Intercept and analyze MCP messages
  - Request-response pairing with timing
  - Server filtering
  - Export debug sessions
- **System Logs**: Global system logs with filtering

## Environment Variables

- `CLAUDEFORGE_CONFIG`: Path to configuration file
- `CLAUDEFORGE_PORT`: Override proxy server port
- `CLAUDEFORGE_WEB_PORT`: Override web interface port
- `CLAUDEFORGE_DEFAULT_PERMISSIONS`: Override default permissions

## Development

```bash
# Run in development mode
npm run dev

# Run tests
npm test

# Type checking
npx tsc --noEmit

# Build the project
npm run build
```

## API Endpoints

The web server exposes the following REST API:

### Server Management
- `GET /api/servers` - List all configured servers
- `POST /api/servers/:id/restart` - Restart a server
- `DELETE /api/servers/:id` - Stop a server
- `POST /api/config/reload` - Reload configuration

### Permission Management
- `GET /api/sessions` - List active sessions
- `GET /api/sessions/:id/permissions` - Get session permissions
- `POST /api/sessions/:id/permissions` - Update bulk permissions
- `POST /api/sessions/:id/permissions/:serverId/:toolName` - Update single permission

### Debugging & Monitoring
- `GET /api/debug/status` - Debug system status
- `POST /api/debug/enable` - Enable debugging
- `POST /api/debug/disable` - Disable debugging
- `GET /api/debug/messages` - Get debug messages
- `GET /api/debug/export` - Export debug data
- `GET /api/debug/stream` - SSE stream of debug messages

### Firehose
- `GET /api/firehose/status` - Firehose statistics
- `POST /api/firehose/pause` - Pause firehose
- `POST /api/firehose/resume` - Resume firehose
- `DELETE /api/firehose/clear` - Clear firehose buffer
- `GET /api/firehose/stream` - SSE stream of firehose events
- `GET /api/firehose/export` - Export firehose data

### Logs
- `GET /api/logs` - Get logs with filtering
- `DELETE /api/logs` - Clear logs
- `GET /api/logs/stream` - SSE stream of log entries

## WebSocket Events

The web interface maintains a WebSocket connection for real-time updates:

```javascript
// Server status updates
{
  "type": "status",
  "servers": [{
    "id": "server-id",
    "name": "Server Name",
    "status": "connected|connecting|disconnected|error",
    "error": "error message if any"
  }]
}

// Firehose events
{
  "type": "firehose",
  "event": {
    "timestamp": "2025-01-08T12:00:00.000Z",
    "category": "mcp|http|websocket|system",
    "type": "request|response|connect|disconnect",
    "source": "source-id",
    "data": {}
  }
}

// Firehose statistics
{
  "type": "firehose-stats",
  "stats": {
    "totalEvents": 1000,
    "eventsPerSecond": 10,
    "runtime": 120
  }
}
```

## Firehose CLI Viewer

A standalone CLI viewer is available for the firehose stream:

```bash
# Run the firehose viewer
node firehose-viewer.js

# Or with custom URL
CLAUDEFORGE_URL=http://localhost:8080 node firehose-viewer.js
```

## Security Considerations

- Run the proxy server in a trusted environment
- Use environment variables for sensitive information (tokens, passwords)
- Configure appropriate permissions for production use
- Consider using TLS/SSL for web interface in production
- Implement authentication for the web interface in production
- Secure your config.json file (contains API keys)

## Troubleshooting

### Server won't start
- Check that the command and arguments are correct
- Verify required environment variables are set
- Check server logs: `journalctl --user -u claudeforge -f`

### Tools not appearing
- Ensure the server is connected (check web interface)
- Verify the server exposes tools capability
- Check permissions in the web interface

### Permission denied errors
- Check tool permissions in the web interface
- Verify session permissions are configured correctly
- Check default permission policy

### Service issues
- Check service status: `systemctl --user status claudeforge`
- View logs: `journalctl --user -u claudeforge -f`
- Restart service: `systemctl --user restart claudeforge`
- Rebuild and restart: `npm run build && systemctl --user restart claudeforge`

## License

MIT

## Author

Jeff Pegg ([jpeggdev@gmail.com](mailto:jpeggdev@gmail.com))  
Website: [claudeforge.com](https://claudeforge.com)

## Contributing

Contributions are welcome! Please submit pull requests or open issues for bugs and feature requests.
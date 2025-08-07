# ClaudeForge

ClaudeForge is a powerful orchestration platform for Model Context Protocol (MCP) servers. It acts as a transparent proxy between MCP clients and multiple MCP servers, providing a sophisticated web-based interface for managing tool permissions, server lifecycle, and more.

**Website:** [claudeforge.com](https://claudeforge.com)  
**Author:** Jeff Pegg ([jpeggdev@gmail.com](mailto:jpeggdev@gmail.com))

## Features

- **Transparent Proxying**: Clients connect to the proxy as if it were a single MCP server
- **Multiple Server Support**: Connect to multiple MCP servers (stdio, SSE, WebSocket)
- **Web Management Interface**: Configure tool permissions through a web UI
- **Permission Management**: Control which tools are exposed to clients
- **Server Lifecycle Management**: Start, stop, and restart MCP servers
- **Graceful Shutdown**: Properly shuts down all connected servers on exit
- **Real-time Status Updates**: WebSocket-based status monitoring

## Architecture

```
┌─────────────┐
│  MCP Client │
└──────┬──────┘
       │ HTTP/SSE
       ▼
┌─────────────┐      ┌──────────────┐
│ ClaudeForge ├──────┤ Web Interface│
└──────┬──────┘      └──────────────┘
       │
   ┌───┴────┬────────┬────────┐
   ▼        ▼        ▼        ▼
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│Server│ │Server│ │Server│ │Server│
│(stdio)│ │(SSE) │ │(WS)  │ │...   │
└──────┘ └──────┘ └──────┘ └──────┘
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
    }
  ]
}
```

### Configuration Options

- `port`: Port for the MCP proxy server (default: 3000)
- `webPort`: Port for the web management interface (default: 8080)
- `defaultPermissions`: Default permission policy ("allow" or "deny")
- `servers`: Array of MCP server configurations

### Server Configuration

Each server configuration supports:

- `id`: Unique identifier for the server
- `name`: Display name in the web interface
- `transport`: Connection type ("stdio", "sse", or "websocket")
- `command`: Command to execute (for stdio transport)
- `args`: Command arguments (for stdio transport)
- `env`: Environment variables (for stdio transport)
- `endpoint`: Server URL (for SSE/WebSocket transport)

## Usage

### Starting the Proxy

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm run build
npm start
```

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

### Web Management Interface

Open your browser to `http://localhost:8080` to:

- View connected MCP servers and their status
- Browse available tools, resources, and prompts
- Enable/disable specific tools
- Set read/write/execute permissions
- Restart or stop individual servers
- Search and filter capabilities

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
```

## API Endpoints

The web server exposes the following REST API:

- `GET /api/servers` - List all configured servers
- `GET /api/sessions` - List active sessions
- `GET /api/sessions/:id/permissions` - Get session permissions
- `POST /api/sessions/:id/permissions` - Update bulk permissions
- `POST /api/sessions/:id/permissions/:serverId/:toolName` - Update single permission
- `POST /api/servers/:id/restart` - Restart a server
- `DELETE /api/servers/:id` - Stop a server

## WebSocket Events

The web interface maintains a WebSocket connection for real-time updates:

```javascript
{
  "type": "status",
  "servers": [
    {
      "id": "server-id",
      "name": "Server Name",
      "status": "connected|connecting|disconnected|error",
      "error": "error message if any"
    }
  ]
}
```

## Security Considerations

- The proxy server should be run in a trusted environment
- Use environment variables for sensitive information (tokens, passwords)
- Configure appropriate permissions for production use
- Consider using TLS/SSL for web interface in production
- Implement authentication for the web interface in production

## Troubleshooting

### Server won't start
- Check that the command and arguments are correct
- Verify required environment variables are set
- Check server logs for error messages

### Tools not appearing
- Ensure the server is connected (check web interface)
- Verify the server exposes tools capability
- Check permissions in the web interface

### Permission denied errors
- Check tool permissions in the web interface
- Verify session permissions are configured correctly
- Check default permission policy

## Running as a System Service

ClaudeForge can be installed as a system service to start automatically when your computer boots. This ensures the proxy is always available and survives system restarts.

### Quick Installation

```bash
# Universal installer (detects your OS)
./scripts/install-service.sh
```

### Linux (systemd)

Install as a systemd service:

```bash
# Install service (run as root)
sudo ./services/linux/install-service.sh

# Service will be installed to /opt/claudeforge
# Config file: /opt/claudeforge/config.json
# Logs: journalctl -u claudeforge -f

# Manage service
sudo systemctl status claudeforge
sudo systemctl start claudeforge
sudo systemctl stop claudeforge
sudo systemctl restart claudeforge
sudo systemctl enable claudeforge   # Start on boot
sudo systemctl disable claudeforge  # Don't start on boot

# Uninstall service
sudo ./services/linux/uninstall-service.sh
```

### macOS (launchd)

Install as a launchd daemon:

```bash
# Install service (run as root)
sudo ./services/macos/install-service.sh

# Service will be installed to /usr/local/opt/claudeforge
# Config file: /usr/local/opt/claudeforge/config.json
# Logs: /usr/local/var/log/claudeforge/

# Manage service
sudo launchctl list | grep claudeforge
sudo launchctl start com.claudeforge.server
sudo launchctl stop com.claudeforge.server

# View logs
tail -f /usr/local/var/log/claudeforge/stdout.log
tail -f /usr/local/var/log/claudeforge/stderr.log

# Uninstall service
sudo ./services/macos/uninstall-service.sh
```

### Windows (Service)

Install as a Windows Service:

```powershell
# Run PowerShell as Administrator
cd services\windows
.\install-service.ps1

# Service will be installed to C:\Program Files\claudeforge
# Config file: C:\Program Files\claudeforge\config.json

# Manage service
net start ClaudeForge
net stop ClaudeForge
sc query ClaudeForge

# Or use Services app (services.msc)

# Uninstall service
.\uninstall-service.ps1
```

### Service Configuration

When running as a service, the proxy uses these default settings:

- **Port**: 3000 (MCP proxy server)
- **Web Port**: 8080 (Management interface)
- **Config File**: Located in the installation directory
- **Auto-restart**: Enabled (restarts on crash)
- **Start on boot**: Enabled

#### Environment Variables for Services

You can customize service behavior by editing:

- **Linux**: Edit `/etc/systemd/system/claudeforge.service`
- **macOS**: Edit `/Library/LaunchDaemons/com.claudeforge.server.plist`
- **Windows**: Edit environment variables in `service-wrapper.js`

Common environment variables:
```bash
CLAUDEFORGE_CONFIG=/path/to/config.json
CLAUDEFORGE_PORT=3000
CLAUDEFORGE_WEB_PORT=8080
CLAUDEFORGE_DEFAULT_PERMISSIONS=allow
NODE_ENV=production
```

### Docker Alternative

You can also run the proxy in a Docker container:

```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
EXPOSE 3000 8080
CMD ["node", "dist/index.js"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  claudeforge:
    build: .
    ports:
      - "3000:3000"
      - "8080:8080"
    volumes:
      - ./config.json:/app/config.json
      - ./logs:/app/logs
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - CLAUDEFORGE_CONFIG=/app/config.json
```

### Security Considerations for Services

When running as a service:

1. **User Permissions**: Services run with limited user permissions by default
2. **Firewall**: Configure firewall rules for ports 3000 and 8080
3. **Config Protection**: Secure your config.json file (contains API keys)
4. **TLS/SSL**: Consider using a reverse proxy (nginx/Apache) for HTTPS
5. **Authentication**: Add authentication middleware for production deployments

### Monitoring

Monitor service health:

```bash
# Linux
systemctl status claudeforge
journalctl -u claudeforge -f

# macOS
sudo launchctl list | grep claudeforge
tail -f /usr/local/var/log/claudeforge/*.log

# Windows
sc query ClaudeForge
Get-EventLog -LogName Application -Source claudeforge
```

### Troubleshooting Services

If the service fails to start:

1. Check logs for error messages
2. Verify Node.js is installed and in PATH
3. Check config.json is valid JSON
4. Ensure ports 3000 and 8080 are not in use
5. Verify file permissions (service user must have read/write access)
6. For Windows, ensure node-windows is installed globally

## License

MIT

## Author

Jeff Pegg ([jpeggdev@gmail.com](mailto:jpeggdev@gmail.com))  
Website: [claudeforge.com](https://claudeforge.com)

## Contributing

Contributions are welcome! Please submit pull requests or open issues for bugs and feature requests.
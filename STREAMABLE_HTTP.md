# Streamable HTTP Implementation

The MCP Proxy now implements the Streamable HTTP transport specification as defined in the [MCP protocol specification](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http).

## Features

### Server Implementation (Port 3000)
- **GET /mcp** - Establishes SSE connection for server-to-client messages
- **POST /mcp** - Handles JSON-RPC requests from clients
- Supports notifications (202 Accepted response)
- Implements proper SSE event formatting
- Sanitizes tool/resource/prompt names for Claude API compatibility

### Client Implementation  
- Connects to SSE-based MCP servers (transport: "sse")
- Handles streamable HTTP servers (transport: "streamable-http")
- Maintains persistent SSE connections
- Proper error handling and reconnection

## Configuration

The proxy server now listens on two ports:

```json
{
  "port": 3000,        // Streamable HTTP endpoint
  "webPort": 8080,     // Web interface and legacy endpoints
  "servers": [...]
}
```

## Connecting from Claude Code

Since Claude Code doesn't natively support SSE transport configuration, use the provided stdio bridge:

```json
{
  "mcpServers": {
    "mcp-proxy": {
      "command": "node",
      "args": ["/home/jpegg/code/ai/mcp_proxy/scripts/http-stdio-bridge.js"]
    }
  }
}
```

The bridge automatically connects to the Streamable HTTP endpoint on port 3000.

## Tool Name Sanitization

The Streamable HTTP handler automatically sanitizes tool names to comply with Claude's API requirements:
- Replaces `::` with `_`
- Removes special characters
- Preserves original names in metadata for reverse lookup

Example:
- Original: `github::create_repository`
- Sanitized: `github_create_repository`

## Endpoints

### Port 3000 (Streamable HTTP)
- `GET /` - SSE connection
- `POST /` - JSON-RPC requests
- `GET /mcp` - SSE connection (compatibility)
- `POST /mcp` - JSON-RPC requests (compatibility)
- `GET /health` - Health check

### Port 8080 (Web Interface)
- `/` - Web dashboard
- `/api/*` - Admin API endpoints
- `/mcp` - Legacy MCP endpoint (still using old format)

## Testing

Test the Streamable HTTP endpoint:

```bash
# Initialize connection
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'

# List tools
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

## Implementation Details

The implementation consists of:
1. `StreamableHttpHandler` - Core handler implementing the protocol
2. `StreamableServer` - Express server setup for port 3000
3. Tool/resource/prompt name sanitization for API compatibility
4. Proper SSE event formatting and keep-alive
5. Session management with X-Session-Id headers
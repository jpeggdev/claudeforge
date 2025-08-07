import { Request, Response } from 'express';
import { ServerManager } from './server-manager.js';
import { PermissionManager } from './permission-manager.js';
import { LogManager } from './log-manager.js';
import { v4 as uuidv4 } from 'uuid';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: any;
  id?: string | number;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id?: string | number;
}

interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: any;
}

interface SSEClient {
  id: string;
  response: Response;
  sessionId: string;
  permSessionId: string;
}

/**
 * Streamable HTTP Handler for MCP Protocol
 * Implements the specification from https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http
 */
export class StreamableHttpHandler {
  private serverManager: ServerManager;
  private permissionManager: PermissionManager;
  private logManager: LogManager;
  private sseClients: Map<string, SSEClient> = new Map();
  private clientSessions: Map<string, string> = new Map(); // clientId -> permissionSessionId

  constructor(
    serverManager: ServerManager,
    permissionManager: PermissionManager,
    logManager: LogManager
  ) {
    this.serverManager = serverManager;
    this.permissionManager = permissionManager;
    this.logManager = logManager;
  }

  /**
   * Handle GET requests - establishes SSE connection for server-to-client messages
   */
  handleSSE(req: Request, res: Response): void {
    const clientId = uuidv4();
    const sessionId = req.headers['x-session-id'] as string || clientId;
    
    // Set up SSE headers per specification
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'X-Session-Id': sessionId
    });

    // Create permission session
    const permSession = this.permissionManager.createSession();
    
    // Store client information
    const client: SSEClient = {
      id: clientId,
      response: res,
      sessionId: sessionId,
      permSessionId: permSession.id
    };
    
    this.sseClients.set(clientId, client);
    this.clientSessions.set(sessionId, permSession.id);

    // Send initial endpoint event as per spec
    this.sendSSEEvent(res, 'endpoint', '/mcp');

    // Keep-alive ping every 30 seconds
    const keepAlive = setInterval(() => {
      res.write(':keepalive\n\n');
    }, 30000);

    // Clean up on disconnect
    req.on('close', () => {
      clearInterval(keepAlive);
      this.sseClients.delete(clientId);
      this.logManager.info(`SSE client disconnected: ${clientId}`, 'streamable-http');
    });

    this.logManager.info(`SSE client connected: ${clientId}`, 'streamable-http');
  }

  /**
   * Handle POST requests - receives JSON-RPC messages from client
   */
  async handleRequest(req: Request, res: Response): Promise<void> {
    try {
      const message = req.body as JsonRpcRequest | JsonRpcNotification;
      const sessionId = req.headers['x-session-id'] as string || 'default';
      
      // Get or create permission session
      let permSessionId = this.clientSessions.get(sessionId);
      if (!permSessionId) {
        const permSession = this.permissionManager.createSession();
        permSessionId = permSession.id;
        this.clientSessions.set(sessionId, permSession.id);
      }

      // Check if this is a notification (no id field)
      const isNotification = !('id' in message);

      if (isNotification) {
        // Handle notification - no response expected
        await this.handleNotification(message as JsonRpcNotification, permSessionId, sessionId);
        
        // Return 202 Accepted for notifications
        res.status(202).send();
        return;
      }

      // Handle request - response expected
      const request = message as JsonRpcRequest;
      let result: any;

      // Process different MCP methods
      switch (request.method) {
        case 'initialize':
          result = await this.handleInitialize(request.params);
          // Send initialized notification to SSE stream
          this.sendNotificationToClient(sessionId, 'notifications/initialized', {});
          break;
          
        case 'tools/list':
          result = await this.listTools(permSessionId);
          break;
        
        case 'tools/call':
          result = await this.callTool(permSessionId, request.params);
          break;
        
        case 'resources/list':
          result = await this.listResources(permSessionId);
          break;
        
        case 'resources/read':
          result = await this.readResource(permSessionId, request.params);
          break;
        
        case 'prompts/list':
          result = await this.listPrompts(permSessionId);
          break;
        
        case 'prompts/get':
          result = await this.getPrompt(permSessionId, request.params);
          break;
        
        case 'ping':
          result = { pong: true };
          break;
        
        default:
          throw new Error(`Unknown method: ${request.method}`);
      }

      // Send response
      const response: JsonRpcResponse = {
        jsonrpc: '2.0',
        result,
        id: request.id
      };

      res.status(200).json(response);
      
    } catch (error: any) {
      const errorResponse: JsonRpcResponse = {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: error.message,
          data: error.stack
        },
        id: req.body?.id
      };
      
      // JSON-RPC errors still return 200 status
      res.status(200).json(errorResponse);
    }
  }

  /**
   * Send SSE event to client
   */
  private sendSSEEvent(res: Response, event: string, data: any): void {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    res.write(message);
  }

  /**
   * Send SSE message (no event type)
   */
  private sendSSEMessage(res: Response, data: any): void {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    res.write(message);
  }

  /**
   * Send notification to specific client via SSE
   */
  private sendNotificationToClient(sessionId: string, method: string, params?: any): void {
    // Find all clients with this session ID
    for (const client of this.sseClients.values()) {
      if (client.sessionId === sessionId) {
        const notification: JsonRpcNotification = {
          jsonrpc: '2.0',
          method,
          params
        };
        this.sendSSEMessage(client.response, notification);
      }
    }
  }

  /**
   * Handle incoming notifications
   */
  private async handleNotification(notification: JsonRpcNotification, permSessionId: string, sessionId: string): Promise<void> {
    this.logManager.info(`Received notification: ${notification.method}`, 'streamable-http');
    
    // Handle specific notification types if needed
    switch (notification.method) {
      case 'notifications/cancelled':
        // Handle cancellation
        break;
      default:
        // Log unhandled notifications
        this.logManager.info(`Unhandled notification: ${notification.method}`, 'streamable-http');
    }
  }

  /**
   * Initialize handler
   */
  private async handleInitialize(params: any): Promise<any> {
    return {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
        resources: {},
        prompts: {}
      },
      serverInfo: {
        name: 'claudeforge',
        version: '1.0.0'
      }
    };
  }

  /**
   * List available tools with sanitized names
   */
  private async listTools(sessionId: string): Promise<any> {
    const allTools: any[] = [];
    const servers = this.serverManager.getAllServers();

    for (const server of servers) {
      if (server.status !== 'connected') continue;

      for (const [toolName, tool] of server.tools) {
        if (this.permissionManager.hasPermission(sessionId, server.id, toolName)) {
          // Sanitize tool name to comply with Claude's requirements
          const sanitizedName = `${server.id}_${tool.name}`.replace(/[^a-zA-Z0-9_-]/g, '_');
          
          allTools.push({
            ...tool,
            name: sanitizedName,
            description: `[${server.config.name}] ${tool.description || ''}`,
            // Store original name in metadata for reverse lookup
            _originalName: tool.name,
            _serverId: server.id
          });
        }
      }
    }

    return { tools: allTools };
  }

  /**
   * Call a tool
   */
  private async callTool(sessionId: string, params: any): Promise<any> {
    // Extract server ID and original tool name from sanitized name
    const toolName = params.name;
    
    // Try to find the tool by iterating through servers
    const servers = this.serverManager.getAllServers();
    
    for (const server of servers) {
      const sanitizedPrefix = `${server.id}_`;
      if (toolName.startsWith(sanitizedPrefix)) {
        const originalName = toolName.substring(sanitizedPrefix.length).replace(/_/g, '::');
        
        // Check if this server has a tool with a name that could match
        for (const [realToolName, tool] of server.tools) {
          const sanitizedToolName = `${server.id}_${realToolName}`.replace(/[^a-zA-Z0-9_-]/g, '_');
          
          if (sanitizedToolName === toolName) {
            if (!this.permissionManager.hasPermission(sessionId, server.id, realToolName, 'execute')) {
              throw new Error(`Permission denied for tool ${realToolName} on server ${server.id}`);
            }
            
            try {
              const result = await this.serverManager.callTool(server.id, realToolName, params.arguments);
              return result;
            } catch (error: any) {
              throw new Error(`Tool execution failed: ${error.message}`);
            }
          }
        }
      }
    }
    
    throw new Error(`Tool not found: ${toolName}`);
  }

  /**
   * List available resources
   */
  private async listResources(sessionId: string): Promise<any> {
    const allResources: any[] = [];
    const servers = this.serverManager.getAllServers();

    for (const server of servers) {
      if (server.status !== 'connected') continue;

      if (!server.resources) continue;
      
      for (const [resourceUri, resource] of server.resources) {
        // Sanitize resource URI
        const sanitizedUri = `${server.id}/${resourceUri}`.replace(/[^a-zA-Z0-9_\-/]/g, '_');
        
        allResources.push({
          ...resource,
          uri: sanitizedUri,
          name: `[${server.config.name}] ${resource.name || ''}`,
          _originalUri: resourceUri,
          _serverId: server.id
        });
      }
    }

    return { resources: allResources };
  }

  /**
   * Read a resource
   */
  private async readResource(sessionId: string, params: any): Promise<any> {
    const resourceUri = params.uri;
    
    // Extract server ID from sanitized URI
    const parts = resourceUri.split('/');
    if (parts.length < 2) {
      throw new Error(`Invalid resource URI: ${resourceUri}`);
    }
    
    const serverId = parts[0];
    const originalUri = parts.slice(1).join('/');
    
    try {
      const result = await this.serverManager.readResource(serverId, originalUri);
      return result;
    } catch (error: any) {
      throw new Error(`Resource read failed: ${error.message}`);
    }
  }

  /**
   * List available prompts
   */
  private async listPrompts(sessionId: string): Promise<any> {
    const allPrompts: any[] = [];
    const servers = this.serverManager.getAllServers();

    for (const server of servers) {
      if (server.status !== 'connected') continue;

      if (!server.prompts) continue;
      
      for (const [promptName, prompt] of server.prompts) {
        // Sanitize prompt name
        const sanitizedName = `${server.id}_${promptName}`.replace(/[^a-zA-Z0-9_-]/g, '_');
        
        allPrompts.push({
          ...prompt,
          name: sanitizedName,
          description: `[${server.config.name}] ${prompt.description || ''}`,
          _originalName: promptName,
          _serverId: server.id
        });
      }
    }

    return { prompts: allPrompts };
  }

  /**
   * Get a prompt
   */
  private async getPrompt(sessionId: string, params: any): Promise<any> {
    const promptName = params.name;
    
    // Extract server ID and original prompt name
    const servers = this.serverManager.getAllServers();
    
    for (const server of servers) {
      const sanitizedPrefix = `${server.id}_`;
      if (promptName.startsWith(sanitizedPrefix)) {
        const originalName = promptName.substring(sanitizedPrefix.length).replace(/_/g, '::');
        
        if (!server.prompts) continue;
        
        for (const [realPromptName, prompt] of server.prompts) {
          const sanitizedPromptName = `${server.id}_${realPromptName}`.replace(/[^a-zA-Z0-9_-]/g, '_');
          
          if (sanitizedPromptName === promptName) {
            try {
              const result = await this.serverManager.getPrompt(server.id, realPromptName, params.arguments);
              return result;
            } catch (error: any) {
              throw new Error(`Prompt retrieval failed: ${error.message}`);
            }
          }
        }
      }
    }
    
    throw new Error(`Prompt not found: ${promptName}`);
  }
}
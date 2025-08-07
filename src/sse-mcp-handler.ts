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

export class SSEMcpHandler {
  private serverManager: ServerManager;
  private permissionManager: PermissionManager;
  private logManager: LogManager;
  private sseClients: Map<string, Response> = new Map();
  private sessions: Map<string, string> = new Map(); // sessionId -> permissionSessionId

  constructor(
    serverManager: ServerManager,
    permissionManager: PermissionManager,
    logManager: LogManager
  ) {
    this.serverManager = serverManager;
    this.permissionManager = permissionManager;
    this.logManager = logManager;
  }

  // GET endpoint - establishes SSE connection
  handleSSE(req: Request, res: Response): void {
    const clientId = uuidv4();
    const sessionId = req.headers['mcp-session-id'] as string || clientId;
    
    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*'
    });

    // Store the client
    this.sseClients.set(clientId, res);

    // Create or get permission session
    if (!this.sessions.has(sessionId)) {
      const permSession = this.permissionManager.createSession();
      this.sessions.set(sessionId, permSession.id);
    }

    // Send initial connection notification
    this.sendSSEMessage(res, {
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    });

    // Send server capabilities
    this.sendSSEMessage(res, {
      jsonrpc: '2.0',
      method: 'notifications/capabilities',
      params: {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        }
      }
    });

    // Keep-alive ping
    const keepAlive = setInterval(() => {
      res.write(':ping\n\n');
    }, 30000);

    // Clean up on disconnect
    req.on('close', () => {
      clearInterval(keepAlive);
      this.sseClients.delete(clientId);
    });
  }

  // POST endpoint - handles JSON-RPC requests
  async handleRequest(req: Request, res: Response): Promise<void> {
    try {
      const request = req.body as JsonRpcRequest;
      const sessionId = req.headers['mcp-session-id'] as string || 'default';
      
      // Get or create permission session
      let permSessionId = this.sessions.get(sessionId);
      if (!permSessionId) {
        const permSession = this.permissionManager.createSession();
        permSessionId = permSession.id;
        this.sessions.set(sessionId, permSessionId);
      }

      let result: any;

      // Handle different MCP methods
      switch (request.method) {
        case 'initialize':
          result = await this.handleInitialize(request.params);
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
        
        default:
          throw new Error(`Unknown method: ${request.method}`);
      }

      const response: JsonRpcResponse = {
        jsonrpc: '2.0',
        result,
        id: request.id
      };

      res.json(response);
    } catch (error: any) {
      const errorResponse: JsonRpcResponse = {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: error.message
        },
        id: req.body.id
      };
      res.status(200).json(errorResponse); // JSON-RPC errors should still return 200
    }
  }

  private sendSSEMessage(res: Response, data: any): void {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    res.write(message);
  }

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

  private async listTools(sessionId: string): Promise<any> {
    const allTools: any[] = [];
    const servers = this.serverManager.getAllServers();

    for (const server of servers) {
      if (server.status !== 'connected') continue;

      for (const [toolName, tool] of server.tools) {
        if (this.permissionManager.hasPermission(sessionId, server.id, toolName)) {
          allTools.push({
            ...tool,
            name: `${server.id}::${tool.name}`,
            description: `[${server.config.name}] ${tool.description || ''}`
          });
        }
      }
    }

    return { tools: allTools };
  }

  private async callTool(sessionId: string, params: any): Promise<any> {
    const [serverId, ...toolNameParts] = params.name.split('::');
    const toolName = toolNameParts.join('::');

    if (!this.permissionManager.hasPermission(sessionId, serverId, toolName, 'execute')) {
      throw new Error(`Permission denied for tool ${toolName} on server ${serverId}`);
    }

    try {
      const result = await this.serverManager.callTool(serverId, toolName, params.arguments);
      return result;
    } catch (error: any) {
      this.logManager.error(`Tool execution failed: ${toolName}`, serverId, undefined, error);
      throw error;
    }
  }

  private async listResources(sessionId: string): Promise<any> {
    const allResources: any[] = [];
    const servers = this.serverManager.getAllServers();

    for (const server of servers) {
      if (server.status !== 'connected' || !server.resources) continue;

      for (const [uri, resource] of server.resources) {
        allResources.push({
          ...resource,
          uri: `${server.id}::${resource.uri}`,
          name: `[${server.config.name}] ${resource.name || ''}`
        });
      }
    }

    return { resources: allResources };
  }

  private async readResource(sessionId: string, params: any): Promise<any> {
    const [serverId, ...uriParts] = params.uri.split('::');
    const uri = uriParts.join('::');
    
    try {
      const result = await this.serverManager.readResource(serverId, uri);
      return result;
    } catch (error: any) {
      this.logManager.error(`Resource read failed: ${uri}`, serverId, undefined, error);
      throw error;
    }
  }

  private async listPrompts(sessionId: string): Promise<any> {
    const allPrompts: any[] = [];
    const servers = this.serverManager.getAllServers();

    for (const server of servers) {
      if (server.status !== 'connected' || !server.prompts) continue;

      for (const [name, prompt] of server.prompts) {
        allPrompts.push({
          ...prompt,
          name: `${server.id}::${prompt.name}`,
          description: `[${server.config.name}] ${prompt.description || ''}`
        });
      }
    }

    return { prompts: allPrompts };
  }

  private async getPrompt(sessionId: string, params: any): Promise<any> {
    const [serverId, ...promptParts] = params.name.split('::');
    const promptName = promptParts.join('::');
    
    try {
      const result = await this.serverManager.getPrompt(serverId, promptName, params.arguments);
      return result;
    } catch (error: any) {
      this.logManager.error(`Prompt retrieval failed: ${promptName}`, serverId, undefined, error);
      throw error;
    }
  }
}
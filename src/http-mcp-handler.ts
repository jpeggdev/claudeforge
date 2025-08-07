import { Request, Response } from 'express';
import { 
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  ReadResourceRequestSchema,
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { ServerManager } from './server-manager.js';
import { PermissionManager } from './permission-manager.js';
import { LogManager } from './log-manager.js';

export class HttpMcpHandler {
  private serverManager: ServerManager;
  private permissionManager: PermissionManager;
  private logManager: LogManager;
  private sessions: Map<string, string> = new Map(); // sessionId -> clientId

  constructor(
    serverManager: ServerManager,
    permissionManager: PermissionManager,
    logManager: LogManager
  ) {
    this.serverManager = serverManager;
    this.permissionManager = permissionManager;
    this.logManager = logManager;
  }

  // SSE endpoint for MCP protocol
  handleSSE(req: Request, res: Response): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

    // Keep connection alive
    const keepAlive = setInterval(() => {
      res.write(': ping\n\n');
    }, 30000);

    req.on('close', () => {
      clearInterval(keepAlive);
    });
  }

  // HTTP POST endpoint for MCP requests
  async handleRequest(req: Request, res: Response): Promise<void> {
    try {
      const { method, params, id } = req.body;
      const sessionId = req.headers['x-session-id'] as string || 'default';
      
      // Ensure session exists
      if (!this.permissionManager.getSession(sessionId)) {
        const session = this.permissionManager.createSession();
        this.sessions.set(session.id, sessionId);
      }

      let result: any;

      switch (method) {
        case 'tools/list':
          result = await this.listTools(sessionId);
          break;
        
        case 'tools/call':
          result = await this.callTool(sessionId, params);
          break;
        
        case 'resources/list':
          result = await this.listResources(sessionId);
          break;
        
        case 'resources/read':
          result = await this.readResource(sessionId, params);
          break;
        
        case 'prompts/list':
          result = await this.listPrompts(sessionId);
          break;
        
        case 'prompts/get':
          result = await this.getPrompt(sessionId, params);
          break;
        
        default:
          throw new Error(`Unknown method: ${method}`);
      }

      res.json({
        jsonrpc: '2.0',
        id,
        result
      });
    } catch (error: any) {
      res.status(500).json({
        jsonrpc: '2.0',
        id: req.body.id,
        error: {
          code: -32603,
          message: error.message
        }
      });
    }
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

    return await this.serverManager.callTool(serverId, toolName, params.arguments);
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
    
    return await this.serverManager.readResource(serverId, uri);
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
    
    return await this.serverManager.getPrompt(serverId, promptName, params.arguments);
  }
}
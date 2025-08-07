import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  ReadResourceRequestSchema,
  GetPromptRequestSchema,
  Tool,
  Resource,
  Prompt
} from '@modelcontextprotocol/sdk/types.js';
import { ServerManager } from './server-manager.js';
import { PermissionManager } from './permission-manager.js';
import { LogManager } from './log-manager.js';
import { ProxyConfig } from './types.js';
import fs from 'fs/promises';
import { watch } from 'fs';
import path from 'path';

export class ProxyServer {
  private server: Server;
  private serverManager: ServerManager;
  private permissionManager: PermissionManager;
  private logManager: LogManager;
  private config: ProxyConfig;
  private currentSessionId: string | null = null;
  private configPath: string;
  private configWatcher: any;

  constructor(config: ProxyConfig, logManager: LogManager, configPath?: string) {
    this.config = config;
    this.logManager = logManager;
    this.configPath = configPath || path.join(process.cwd(), 'config.json');
    this.serverManager = new ServerManager(logManager);
    this.permissionManager = new PermissionManager();
    this.permissionManager.setDefaultPolicy(config.defaultPermissions === 'allow');

    this.server = new Server({
      name: 'claudeforge',
      version: '1.0.0'
    }, {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {}
      }
    });

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const allTools: Tool[] = [];
      const servers = this.serverManager.getAllServers();

      for (const server of servers) {
        if (server.status !== 'connected') continue;

        for (const [toolName, tool] of server.tools) {
          if (this.currentSessionId && 
              this.permissionManager.hasPermission(this.currentSessionId, server.id, toolName)) {
            allTools.push({
              ...tool,
              name: `${server.id}::${tool.name}`,
              description: `[${server.config.name}] ${tool.description || ''}`
            });
          }
        }
      }

      return { tools: allTools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (!this.currentSessionId) {
        throw new Error('No active session');
      }

      const [serverId, ...toolNameParts] = request.params.name.split('::');
      const toolName = toolNameParts.join('::');

      if (!this.permissionManager.hasPermission(this.currentSessionId, serverId, toolName, 'execute')) {
        throw new Error(`Permission denied for tool ${toolName} on server ${serverId}`);
      }

      try {
        const result = await this.serverManager.callTool(serverId, toolName, request.params.arguments);
        return result;
      } catch (error: any) {
        this.logManager.error(`Tool execution failed: ${toolName}`, serverId, undefined, error);
        throw new Error(`Tool execution failed: ${error.message}`);
      }
    });

    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const allResources: Resource[] = [];
      const servers = this.serverManager.getAllServers();

      for (const server of servers) {
        if (server.status !== 'connected' || !server.resources) continue;

        for (const [uri, resource] of server.resources) {
          if (this.currentSessionId) {
            allResources.push({
              ...resource,
              uri: `${server.id}::${resource.uri}`,
              name: `[${server.config.name}] ${resource.name || resource.uri}`
            });
          }
        }
      }

      return { resources: allResources };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      if (!this.currentSessionId) {
        throw new Error('No active session');
      }

      const [serverId, ...uriParts] = request.params.uri.split('::');
      const uri = uriParts.join('::');

      try {
        const result = await this.serverManager.readResource(serverId, uri);
        return result;
      } catch (error: any) {
        throw new Error(`Resource read failed: ${error.message}`);
      }
    });

    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      const allPrompts: Prompt[] = [];
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
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      if (!this.currentSessionId) {
        throw new Error('No active session');
      }

      const [serverId, ...promptParts] = request.params.name.split('::');
      const promptName = promptParts.join('::');

      try {
        const result = await this.serverManager.getPrompt(serverId, promptName, request.params.arguments);
        return result;
      } catch (error: any) {
        throw new Error(`Prompt retrieval failed: ${error.message}`);
      }
    });
  }

  async start(): Promise<void> {
    this.logManager.info('Starting ClaudeForge Server');
    
    for (const serverConfig of this.config.servers) {
      // Check if server is disabled
      if ((serverConfig as any).disabled) {
        this.logManager.info(`Server disabled: ${serverConfig.name}`, serverConfig.id, serverConfig.name);
        // Still register the server but with disabled status
        this.serverManager.registerDisabledServer(serverConfig);
        continue;
      }
      
      try {
        const server = await this.serverManager.startServer(serverConfig);
        if (server.status === 'error') {
          this.logManager.error(`Server ${serverConfig.name} started with error: ${server.error}`, serverConfig.id, serverConfig.name);
        }
      } catch (error: any) {
        // This should not happen anymore, but keep as safety
        this.logManager.error(`Failed to start server ${serverConfig.name}: ${error.message}`, serverConfig.id, serverConfig.name);
      }
    }

    const session = this.permissionManager.createSession();
    this.currentSessionId = session.id;

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    this.logManager.info('ClaudeForge Server started successfully');
    
    // Set up config file watcher
    this.setupConfigWatcher();
  }

  private setupConfigWatcher(): void {
    try {
      this.configWatcher = watch(this.configPath, async (eventType) => {
        if (eventType === 'change') {
          this.logManager.info('Config file changed, reloading...');
          await this.reloadConfig();
        }
      });
      this.logManager.info('Config file watcher started');
    } catch (error: any) {
      this.logManager.warning('Failed to set up config watcher: ' + error.message);
    }
  }

  async reloadConfig(): Promise<void> {
    try {
      // Read new config
      const configData = await fs.readFile(this.configPath, 'utf-8');
      const newConfig = JSON.parse(configData) as ProxyConfig;
      
      this.logManager.info('Reloading configuration...');
      
      // Find servers that need to be stopped (removed or changed)
      const currentServerIds = new Set(this.config.servers.map(s => s.id));
      const newServerIds = new Set(newConfig.servers.map(s => s.id));
      
      // Stop removed servers
      for (const serverId of currentServerIds) {
        if (!newServerIds.has(serverId)) {
          this.logManager.info(`Stopping removed server: ${serverId}`);
          await this.serverManager.stopServer(serverId);
        }
      }
      
      // Check for changed servers (compare configs) or servers in error state
      for (const newServer of newConfig.servers) {
        const oldServer = this.config.servers.find(s => s.id === newServer.id);
        const currentServerState = this.serverManager.getServer(newServer.id);
        
        // Restart if config changed OR if server is in error/disconnected state
        const configChanged = oldServer && JSON.stringify(oldServer) !== JSON.stringify(newServer);
        const needsRestart = currentServerState && (
          currentServerState.status === 'error' || 
          currentServerState.status === 'disconnected'
        );
        
        if (configChanged || needsRestart) {
          if (configChanged) {
            this.logManager.info(`Restarting changed server: ${newServer.id}`);
          } else if (needsRestart) {
            this.logManager.info(`Retrying failed server: ${newServer.id}`);
          }
          
          await this.serverManager.stopServer(newServer.id);
          
          if (!(newServer as any).disabled) {
            try {
              const server = await this.serverManager.startServer(newServer);
              if (server.status === 'error') {
                this.logManager.error(`Server ${newServer.name} started with error: ${server.error}`, newServer.id, newServer.name);
              }
            } catch (error: any) {
              this.logManager.error(`Failed to restart server ${newServer.name}: ${error.message}`, newServer.id, newServer.name);
            }
          } else {
            this.serverManager.registerDisabledServer(newServer);
          }
        }
      }
      
      // Start new servers
      for (const newServer of newConfig.servers) {
        if (!currentServerIds.has(newServer.id)) {
          this.logManager.info(`Starting new server: ${newServer.id}`);
          
          if ((newServer as any).disabled) {
            this.serverManager.registerDisabledServer(newServer);
          } else {
            try {
              const server = await this.serverManager.startServer(newServer);
              if (server.status === 'error') {
                this.logManager.error(`Server ${newServer.name} started with error: ${server.error}`, newServer.id, newServer.name);
              }
            } catch (error: any) {
              this.logManager.error(`Failed to start server ${newServer.name}: ${error.message}`, newServer.id, newServer.name);
            }
          }
        }
      }
      
      // Update config
      this.config = newConfig;
      this.permissionManager.setDefaultPolicy(newConfig.defaultPermissions === 'allow');
      
      this.logManager.info('Configuration reloaded successfully');
    } catch (error: any) {
      this.logManager.error('Failed to reload configuration: ' + error.message);
    }
  }

  async stop(): Promise<void> {
    this.logManager.info('Shutting down ClaudeForge Server');
    
    // Stop config watcher
    if (this.configWatcher) {
      this.configWatcher.close();
    }
    
    if (this.currentSessionId) {
      this.permissionManager.removeSession(this.currentSessionId);
    }

    await this.serverManager.stopAllServers();
    await this.server.close();
    
    this.logManager.info('ClaudeForge Server stopped');
  }

  getServerManager(): ServerManager {
    return this.serverManager;
  }

  getPermissionManager(): PermissionManager {
    return this.permissionManager;
  }

  setCurrentSession(sessionId: string): void {
    this.currentSessionId = sessionId;
  }

  async triggerConfigReload(): Promise<void> {
    await this.reloadConfig();
  }
}
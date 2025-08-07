import { spawn, ChildProcess } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js';
import { HttpClientTransport } from './http-client-transport.js';
import { MCPServerConfig, ConnectedServer } from './types.js';
import type { Tool, Resource, Prompt } from '@modelcontextprotocol/sdk/types.js';
import { LogManager } from './log-manager.js';
// Polyfill for EventSource in Node.js
import { EventSource } from 'eventsource';
(global as any).EventSource = EventSource;

export class ServerManager {
  private servers: Map<string, ConnectedServer> = new Map();
  private shutdownHandlers: Set<() => Promise<void>> = new Set();
  private logManager: LogManager;

  constructor(logManager: LogManager) {
    this.logManager = logManager;
  }

  registerDisabledServer(config: MCPServerConfig): void {
    const server: ConnectedServer = {
      id: config.id,
      config,
      tools: new Map(),
      resources: new Map(),
      prompts: new Map(),
      status: 'disabled' as any,
      error: (config as any)._comment || 'Server is disabled',
      client: null as any
    };
    
    this.servers.set(config.id, server);
    this.logManager.info(`Registered disabled server: ${config.name}`, config.id, config.name);
  }

  async startServer(config: MCPServerConfig): Promise<ConnectedServer> {
    this.logManager.info(`Starting server: ${config.name}`, config.id, config.name);
    
    const server: ConnectedServer = {
      id: config.id,
      config,
      tools: new Map(),
      resources: new Map(),
      prompts: new Map(),
      status: 'connecting',
      client: new Client(
        {
          name: `proxy-client-${config.id}`,
          version: '1.0.0'
        },
        {
          capabilities: {}
        }
      )
    };

    try {
      let transport: any;

      switch (config.transport) {
        case 'stdio':
          if (!config.command) throw new Error('stdio transport requires command');
          const childProcess = spawn(config.command, config.args || [], {
            env: { ...process.env, ...config.env },
            stdio: ['pipe', 'pipe', 'pipe']
          }) as any;  // Type assertion to avoid complex type issues
          
          server.process = childProcess;
          transport = new StdioClientTransport({
            command: config.command,
            args: config.args,
            env: config.env
          });
          
          childProcess.on('error', (error: Error) => {
            this.logManager.error(`Process error: ${error.message}`, config.id, config.name, error);
            server.status = 'error';
            server.error = error.message;
          });

          childProcess.on('exit', (code: number | null) => {
            if (code !== 0) {
              this.logManager.warning(`Process exited with code ${code}`, config.id, config.name);
            } else {
              this.logManager.info(`Process exited normally`, config.id, config.name);
            }
            server.status = 'disconnected';
          });

          childProcess.stderr?.on('data', (data: Buffer) => {
            const message = data.toString().trim();
            if (message) {
              this.logManager.error(`stderr: ${message}`, config.id, config.name);
            }
          });
          break;

        case 'sse':
          if (!config.endpoint) throw new Error('SSE transport requires endpoint');
          this.logManager.info(`Connecting to SSE endpoint: ${config.endpoint}`, config.id, config.name);
          transport = new SSEClientTransport(new URL(config.endpoint));
          break;

        case 'websocket':
          if (!config.endpoint) throw new Error('WebSocket transport requires endpoint');
          transport = new WebSocketClientTransport(new URL(config.endpoint));
          break;

        case 'http':
        case 'streamable-http':
          if (!config.endpoint && !config.url) throw new Error('HTTP transport requires endpoint or url');
          const httpUrl = config.endpoint || config.url;
          if (!httpUrl) throw new Error('HTTP transport requires endpoint or url');
          this.logManager.info(`Connecting to HTTP endpoint: ${httpUrl}`, config.id, config.name);
          transport = new HttpClientTransport(new URL(httpUrl));
          break;

        default:
          throw new Error(`Unsupported transport: ${config.transport}`);
      }

      // Add timeout for connection
      const timeoutMs = 30000;
      let connectTimeout: NodeJS.Timeout | null = null;
      let timedOut = false;
      
      const connectPromise = new Promise<void>(async (resolve, reject) => {
        try {
          await server.client.connect(transport);
          if (!timedOut) {
            resolve();
          }
        } catch (error) {
          if (!timedOut) {
            reject(error);
          }
        }
      });
      
      const timeoutPromise = new Promise<never>((_, reject) => {
        connectTimeout = setTimeout(() => {
          timedOut = true;
          reject(new Error(`Connection timeout after ${timeoutMs / 1000} seconds`));
        }, timeoutMs);
      });
      
      try {
        await Promise.race([connectPromise, timeoutPromise]);
        if (connectTimeout) clearTimeout(connectTimeout);
      } catch (error) {
        if (connectTimeout) clearTimeout(connectTimeout);
        throw error;
      }
      
      const capabilities = await server.client.getServerCapabilities();
      
      if (capabilities.tools) {
        const tools = await server.client.listTools();
        tools.tools.forEach((tool: Tool) => {
          server.tools.set(tool.name, tool);
        });
      }

      if (capabilities.resources) {
        const resources = await server.client.listResources();
        resources.resources.forEach((resource: Resource) => {
          server.resources?.set(resource.uri, resource);
        });
      }

      if (capabilities.prompts) {
        const prompts = await server.client.listPrompts();
        prompts.prompts.forEach((prompt: Prompt) => {
          server.prompts?.set(prompt.name, prompt);
        });
      }

      server.status = 'connected';
      this.servers.set(config.id, server);
      
      this.logManager.info(
        `Connected successfully. Tools: ${server.tools.size}, Resources: ${server.resources?.size || 0}, Prompts: ${server.prompts?.size || 0}`,
        config.id,
        config.name
      );

      const shutdownHandler = async () => {
        await this.stopServer(config.id);
      };
      this.shutdownHandlers.add(shutdownHandler);

      return server;
    } catch (error: any) {
      this.logManager.error(`Failed to connect: ${error.message}`, config.id, config.name, error);
      server.status = 'error';
      server.error = error.message;
      this.servers.set(config.id, server);
      // Don't throw - just return the server with error status
      return server;
    }
  }

  async stopServer(serverId: string): Promise<void> {
    const server = this.servers.get(serverId);
    if (!server) return;

    this.logManager.info(`Stopping server`, serverId, server.config.name);

    try {
      if (server.client) {
        await server.client.close();
      }

      if (server.process) {
        server.process.kill('SIGTERM');
        
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            this.logManager.warning(`Force killing unresponsive process`, serverId, server.config.name);
            server.process.kill('SIGKILL');
            resolve();
          }, 5000);

          server.process.once('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        });
      }

      server.status = 'disconnected';
      this.logManager.info(`Stopped successfully`, serverId, server.config.name);
    } catch (error: any) {
      this.logManager.error(`Error stopping server: ${error.message}`, serverId, server.config.name, error);
    } finally {
      this.servers.delete(serverId);
    }
  }

  async stopAllServers(): Promise<void> {
    const stopPromises = Array.from(this.servers.keys()).map(id => 
      this.stopServer(id)
    );
    await Promise.all(stopPromises);
  }

  getServer(serverId: string): ConnectedServer | undefined {
    return this.servers.get(serverId);
  }

  getAllServers(): ConnectedServer[] {
    return Array.from(this.servers.values());
  }

  async callTool(serverId: string, toolName: string, args: any): Promise<any> {
    const server = this.servers.get(serverId);
    if (!server || server.status !== 'connected') {
      throw new Error(`Server ${serverId} not connected`);
    }

    return await server.client.callTool(toolName, args);
  }

  async readResource(serverId: string, uri: string): Promise<any> {
    const server = this.servers.get(serverId);
    if (!server || server.status !== 'connected') {
      throw new Error(`Server ${serverId} not connected`);
    }

    return await server.client.readResource(uri);
  }

  async getPrompt(serverId: string, promptName: string, args: any): Promise<any> {
    const server = this.servers.get(serverId);
    if (!server || server.status !== 'connected') {
      throw new Error(`Server ${serverId} not connected`);
    }

    return await server.client.getPrompt(promptName, args);
  }
}
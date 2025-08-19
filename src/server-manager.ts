import { spawn, ChildProcess } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js';
import { HttpClientTransport } from './http-client-transport.js';
import { MCPServerConfig, ConnectedServer } from './types.js';
import type { Tool, Resource, Prompt } from '@modelcontextprotocol/sdk/types.js';
import { LogManager } from './log-manager.js';
import { DebugManager } from './debug-manager.js';
import { FirehoseManager } from './firehose-manager.js';
import { DebugTransportWrapper } from './debug-transport-wrapper.js';
import { StdioToolHandler } from './stdio-tool-handler.js';
import { DockerManager, ContainerizedServer } from './docker-manager.js';
import { DockerTransport } from './transports/docker-transport.js';
// Polyfill for EventSource in Node.js
import { EventSource } from 'eventsource';
(global as any).EventSource = EventSource;

export class ServerManager {
  private servers: Map<string, ConnectedServer> = new Map();
  private shutdownHandlers: Set<() => Promise<void>> = new Set();
  private logManager: LogManager;
  private debugManager: DebugManager;
  private firehoseManager: FirehoseManager;
  private stdioToolHandler: StdioToolHandler;
  private dockerManager: DockerManager | null = null;
  private dockerConfig: any;

  constructor(logManager: LogManager, debugManager: DebugManager, firehoseManager: FirehoseManager, dockerConfig?: any) {
    this.logManager = logManager;
    this.debugManager = debugManager;
    this.firehoseManager = firehoseManager;
    this.stdioToolHandler = new StdioToolHandler(logManager);
    this.dockerConfig = dockerConfig;
    
    if (dockerConfig?.enabled) {
      this.initializeDocker();
    }
  }

  private async initializeDocker(): Promise<void> {
    try {
      this.dockerManager = new DockerManager(this.logManager, this.dockerConfig);
      await this.dockerManager.initialize();
      this.logManager.info('Docker support initialized', 'server-manager');
    } catch (error: any) {
      this.logManager.error('Failed to initialize Docker support', 'server-manager', undefined, error);
      this.dockerManager = null;
    }
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

      // Check if we should auto-containerize stdio servers
      if (config.transport === 'stdio' && 
          (config.docker?.enabled || (this.dockerConfig?.autoContainerize && this.dockerManager))) {
        config = { ...config, transport: 'docker' as any };
        this.logManager.info(`Auto-containerizing stdio server: ${config.name}`, config.id, config.name);
      }

      switch (config.transport) {
        case 'stdio':
          if (!config.command) throw new Error('stdio transport requires command');
          transport = new StdioClientTransport({
            command: config.command,
            args: config.args,
            env: config.env
          });
          // Store a reference to the transport for later process access
          server.transport = transport;
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
          transport = new HttpClientTransport(new URL(httpUrl), config.headers);
          break;

        case 'docker':
          // Check if Docker is enabled and available
          if (!this.dockerManager) {
            throw new Error('Docker support is not enabled or available');
          }
          
          this.logManager.info(`Containerizing server: ${config.name}`, config.id, config.name);
          
          // Containerize the server
          const containerInfo = await this.dockerManager.containerizeServer(config);
          
          // Create Docker transport
          transport = new DockerTransport(containerInfo, this.logManager);
          
          // Store container info on the server
          (server as any).containerInfo = containerInfo;
          break;

        default:
          throw new Error(`Unsupported transport: ${config.transport}`);
      }

      // Wrap transport with debug interceptor if debugging is enabled
      if (this.debugManager.isDebugEnabled()) {
        const wrapper = new DebugTransportWrapper(
          transport,
          this.debugManager,
          config.id,
          config.name,
          config.transport
        );
        transport = wrapper.getTransport();
        this.debugManager.startSession(config.id, config.name);
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

      // Clean up Docker container if this was a containerized server
      if ((server as any).containerInfo && this.dockerManager) {
        try {
          await this.dockerManager.stopContainer(serverId);
          this.logManager.info(`Docker container stopped for server`, serverId, server.config.name);
        } catch (error: any) {
          this.logManager.error(`Failed to stop Docker container`, serverId, server.config.name, error);
        }
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
    
    // Clean up stdio handler
    this.stdioToolHandler.cleanup();
  }

  getServer(serverId: string): ConnectedServer | undefined {
    return this.servers.get(serverId);
  }

  getAllServers(): ConnectedServer[] {
    return Array.from(this.servers.values());
  }

  getDockerManager(): DockerManager | null {
    return this.dockerManager;
  }

  async callTool(serverId: string, toolName: string, args: any): Promise<any> {
    const server = this.servers.get(serverId);
    if (!server || server.status !== 'connected') {
      const error = `Server ${serverId} not connected`;
      this.firehoseManager.captureMCPError(serverId, serverId, toolName, error);
      throw new Error(error);
    }

    const startTime = Date.now();
    this.logManager.info(`Calling tool ${toolName} on server ${serverId}`, serverId, server.config.name);
    this.firehoseManager.captureMCPRequest(serverId, server.config.name, toolName, args);
    
    try {
      const timeoutMs = server.config.timeout || 30000;
      let result: any;

      // Use custom stdio handler for stdio transport to work around SDK bug
      if (server.config.transport === 'stdio' && server.transport) {
        this.logManager.info(`Using custom stdio handler for tool call...`, serverId, server.config.name);
        
        // Access the private _process field from the transport
        const childProcess = (server.transport as any)._process;
        if (childProcess) {
          // Set up the process in the stdio handler if not already done
          if (!server.process) {
            server.process = childProcess;
            this.stdioToolHandler.setupProcess(childProcess, serverId, server.config.name);
          }
          
          result = await this.stdioToolHandler.callTool(
            childProcess,
            toolName,
            args,
            serverId,
            server.config.name,
            timeoutMs
          );
        } else {
          this.logManager.warning(`Stdio transport process not available, falling back to SDK`, serverId, server.config.name);
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
              this.logManager.error(`Tool call timeout for ${toolName}`, serverId, server.config.name);
              reject(new Error(`Tool call timeout after ${timeoutMs / 1000} seconds`));
            }, timeoutMs);
          });
          
          const callPromise = server.client.callTool(toolName, args);
          result = await Promise.race([callPromise, timeoutPromise]);
        }
      } else {
        // Use standard SDK client for other transports
        this.logManager.info(`Using standard MCP client for tool call...`, serverId, server.config.name);
        
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            this.logManager.error(`Tool call timeout for ${toolName}`, serverId, server.config.name);
            reject(new Error(`Tool call timeout after ${timeoutMs / 1000} seconds`));
          }, timeoutMs);
        });
        
        const callPromise = server.client.callTool(toolName, args);
        result = await Promise.race([callPromise, timeoutPromise]);
      }
      
      const duration = Date.now() - startTime;
      this.logManager.info(`Tool call completed in ${duration}ms`, serverId, server.config.name);
      this.firehoseManager.captureMCPResponse(serverId, server.config.name, toolName, result, duration);
      return result;
    } catch (error: any) {
      this.logManager.error(`Tool call failed: ${error.message}`, serverId, server.config.name);
      this.firehoseManager.captureMCPError(serverId, server.config.name, toolName, error);
      throw error;
    }
  }

  async readResource(serverId: string, uri: string): Promise<any> {
    const server = this.servers.get(serverId);
    if (!server || server.status !== 'connected') {
      throw new Error(`Server ${serverId} not connected`);
    }

    // Add timeout for resource reads
    const timeoutMs = server.config.timeout || 30000;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Resource read timeout after ${timeoutMs / 1000} seconds`));
      }, timeoutMs);
    });
    
    return await Promise.race([
      server.client.readResource(uri),
      timeoutPromise
    ]);
  }

  async getPrompt(serverId: string, promptName: string, args: any): Promise<any> {
    const server = this.servers.get(serverId);
    if (!server || server.status !== 'connected') {
      throw new Error(`Server ${serverId} not connected`);
    }

    // Add timeout for prompt operations
    const timeoutMs = server.config.timeout || 30000;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Prompt operation timeout after ${timeoutMs / 1000} seconds`));
      }, timeoutMs);
    });
    
    return await Promise.race([
      server.client.getPrompt(promptName, args),
      timeoutPromise
    ]);
  }
}
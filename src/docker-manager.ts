import Docker from 'dockerode';
import { LogManager } from './log-manager.js';
import { MCPServerConfig } from './types.js';
import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { Readable } from 'stream';
import tar from 'tar-stream';

export interface DockerConfig {
  enabled?: boolean;
  autoContainerize?: boolean;
  network?: string;
  registry?: string;
  baseImages?: {
    node?: string;
    python?: string;
    go?: string;
    rust?: string;
  };
  volumes?: string[];
  environment?: Record<string, string>;
  labels?: Record<string, string>;
  resources?: {
    memory?: string;
    cpus?: string;
  };
}

export interface ContainerizedServer {
  id: string;
  containerId: string;
  containerName: string;
  image: string;
  status: 'building' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  ports: { container: number; host: number }[];
  networks: string[];
  createdAt: Date;
  error?: string;
}

export class DockerManager {
  private docker: Docker;
  private logManager: LogManager;
  private containers: Map<string, ContainerizedServer> = new Map();
  private config: DockerConfig;
  private networkName = 'claudeforge-network';

  constructor(logManager: LogManager, config?: DockerConfig) {
    this.docker = new Docker();
    this.logManager = logManager;
    this.config = config || {
      enabled: true,
      autoContainerize: false,
      baseImages: {
        node: 'node:20-alpine',
        python: 'python:3.11-alpine',
        go: 'golang:1.21-alpine',
        rust: 'rust:1.75-alpine'
      }
    };
  }

  async initialize(): Promise<void> {
    try {
      // Check Docker availability
      await this.docker.ping();
      this.logManager.info('Docker is available', 'docker-manager');

      // Create network if it doesn't exist
      await this.ensureNetwork();
    } catch (error: any) {
      this.logManager.error('Docker initialization failed', 'docker-manager', undefined, error);
      throw error;
    }
  }

  private async ensureNetwork(): Promise<void> {
    try {
      const networks = await this.docker.listNetworks();
      const exists = networks.some(n => n.Name === this.networkName);
      
      if (!exists) {
        await this.docker.createNetwork({
          Name: this.networkName,
          Driver: 'bridge',
          Labels: {
            'claudeforge': 'true',
            'purpose': 'mcp-servers'
          }
        });
        this.logManager.info(`Created Docker network: ${this.networkName}`, 'docker-manager');
      }
    } catch (error: any) {
      this.logManager.error('Failed to ensure network', 'docker-manager', undefined, error);
    }
  }

  async containerizeServer(config: MCPServerConfig): Promise<ContainerizedServer> {
    const serverId = config.id;
    
    try {
      this.logManager.info(`Starting containerization for server: ${serverId}`, 'docker-manager');
      
      // Determine server type and base image
      const serverType = this.detectServerType(config);
      const baseImage = this.getBaseImage(serverType);
      
      // Generate container name and image name
      const containerName = `claudeforge-${serverId}-${Date.now()}`;
      const imageName = `claudeforge/${serverId}:latest`;
      
      // Create containerized server record
      const containerizedServer: ContainerizedServer = {
        id: serverId,
        containerId: '',
        containerName,
        image: imageName,
        status: 'building',
        ports: [],
        networks: [this.networkName],
        createdAt: new Date()
      };
      
      this.containers.set(serverId, containerizedServer);
      
      // Build Docker image
      await this.buildImage(config, imageName, baseImage, serverType);
      
      // Create and start container
      const container = await this.createContainer(config, imageName, containerName);
      containerizedServer.containerId = container.id;
      
      // Start the container
      await container.start();
      containerizedServer.status = 'running';
      
      // Get container info for ports
      const containerInfo = await container.inspect();
      containerizedServer.ports = this.extractPorts(containerInfo);
      
      this.logManager.info(`Successfully containerized server: ${serverId}`, 'docker-manager');
      return containerizedServer;
      
    } catch (error: any) {
      this.logManager.error(`Failed to containerize server ${serverId}`, 'docker-manager', undefined, error);
      const containerizedServer = this.containers.get(serverId);
      if (containerizedServer) {
        containerizedServer.status = 'error';
        containerizedServer.error = error.message;
      }
      throw error;
    }
  }

  private detectServerType(config: MCPServerConfig): 'node' | 'python' | 'go' | 'rust' | 'unknown' {
    if (!config.command) return 'unknown';
    
    const command = config.command.toLowerCase();
    const args = config.args?.join(' ').toLowerCase() || '';
    const combined = `${command} ${args}`;
    
    if (combined.includes('node') || combined.includes('npm') || combined.includes('npx') || combined.includes('.js')) {
      return 'node';
    }
    if (combined.includes('python') || combined.includes('pip') || combined.includes('.py')) {
      return 'python';
    }
    if (combined.includes('go run') || combined.includes('.go')) {
      return 'go';
    }
    if (combined.includes('cargo') || combined.includes('rust')) {
      return 'rust';
    }
    
    return 'unknown';
  }

  private getBaseImage(serverType: string): string {
    const baseImages = this.config.baseImages || {};
    
    switch (serverType) {
      case 'node':
        return baseImages.node || 'node:20-alpine';
      case 'python':
        return baseImages.python || 'python:3.11-alpine';
      case 'go':
        return baseImages.go || 'golang:1.21-alpine';
      case 'rust':
        return baseImages.rust || 'rust:1.75-alpine';
      default:
        return 'alpine:latest';
    }
  }

  private async buildImage(
    config: MCPServerConfig, 
    imageName: string, 
    baseImage: string,
    serverType: string
  ): Promise<void> {
    this.logManager.info(`Building Docker image: ${imageName} from ${baseImage}`, 'docker-manager');
    
    // Generate Dockerfile content
    const dockerfile = this.generateDockerfile(config, baseImage, serverType);
    
    // Create tar stream with Dockerfile
    const tarStream = tar.pack();
    tarStream.entry({ name: 'Dockerfile' }, dockerfile);
    
    // Add stdio-tcp-bridge.js script
    const bridgeScriptPath = path.join(path.dirname(import.meta.url.replace('file://', '')), '..', 'docker', 'stdio-tcp-bridge.js');
    try {
      const bridgeScript = await fs.readFile(bridgeScriptPath, 'utf-8');
      tarStream.entry({ name: 'stdio-tcp-bridge.js' }, bridgeScript);
    } catch (error: any) {
      this.logManager.error(`Failed to read stdio-tcp-bridge.js: ${error.message}`, 'docker-manager');
      // Use inline bridge script as fallback
      tarStream.entry({ name: 'stdio-tcp-bridge.js' }, this.getInlineBridgeScript());
    }
    
    // Add any additional files if needed (e.g., package.json for Node.js servers)
    if (serverType === 'node' && config.command?.includes('npx')) {
      const packageJson = JSON.stringify({
        name: `mcp-server-${config.id}`,
        version: '1.0.0',
        dependencies: this.extractNpmDependencies(config)
      }, null, 2);
      tarStream.entry({ name: 'package.json' }, packageJson);
    }
    
    tarStream.finalize();
    
    // Build the image
    const stream = await this.docker.buildImage(tarStream as any, {
      t: imageName,
      labels: {
        'claudeforge': 'true',
        'mcp-server': config.id,
        'created-by': 'claudeforge'
      }
    });
    
    // Wait for build to complete
    await new Promise((resolve, reject) => {
      this.docker.modem.followProgress(stream, (err: any, res: any) => {
        if (err) {
          this.logManager.error(`Image build failed: ${err.message}`, 'docker-manager');
          reject(err);
        } else {
          this.logManager.info(`Image built successfully: ${imageName}`, 'docker-manager');
          resolve(res);
        }
      }, (event: any) => {
        // Log build progress
        if (event.stream) {
          this.logManager.debug(`Build: ${event.stream.trim()}`, 'docker-manager');
        }
      });
    });
  }

  private generateDockerfile(config: MCPServerConfig, baseImage: string, serverType: string): string {
    const lines: string[] = [
      `FROM ${baseImage}`,
      '',
      '# Set working directory',
      'WORKDIR /app',
      ''
    ];

    // Copy the stdio-tcp bridge script
    lines.push('# Copy stdio-tcp bridge');
    lines.push('COPY stdio-tcp-bridge.js /app/stdio-tcp-bridge.js');
    lines.push('RUN chmod +x /app/stdio-tcp-bridge.js');
    lines.push('');

    // Add system dependencies based on server type
    if (serverType === 'node') {
      lines.push('# Install Node.js dependencies');
      if (config.command?.includes('npx')) {
        lines.push('COPY package.json .');
        lines.push('RUN npm install');
      }
    } else if (serverType === 'python') {
      lines.push('# Install Python dependencies');
      lines.push('RUN pip install --upgrade pip');
      
      // Extract Python packages from command
      const pythonPackages = this.extractPythonPackages(config);
      if (pythonPackages.length > 0) {
        lines.push(`RUN pip install ${pythonPackages.join(' ')}`);
      }
    }

    // Set environment variables
    lines.push('', '# Environment variables');
    lines.push('ENV BRIDGE_PORT=5000');
    if (config.env) {
      for (const [key, value] of Object.entries(config.env)) {
        // Don't include sensitive values in Dockerfile
        if (key.includes('TOKEN') || key.includes('KEY') || key.includes('SECRET')) {
          lines.push(`# ${key} will be set at runtime`);
        } else {
          lines.push(`ENV ${key}="${value}"`);
        }
      }
    }

    // Use stdio-tcp bridge as entrypoint for stdio transports
    lines.push('', '# MCP Server command');
    if (config.transport === 'stdio' || config.transport === 'docker') {
      lines.push('# Expose stdio over TCP');
      lines.push('EXPOSE 5000');
      
      if (config.command) {
        const args = config.args || [];
        const fullCommand = ['node', '/app/stdio-tcp-bridge.js', config.command, ...args];
        lines.push(`CMD [${fullCommand.map(c => `"${c}"`).join(', ')}]`);
      } else {
        lines.push('CMD ["node", "/app/stdio-tcp-bridge.js", "sh"]');
      }
    } else {
      // For non-stdio transports, run directly
      if (config.command) {
        const args = config.args || [];
        const fullCommand = [config.command, ...args];
        lines.push(`CMD [${fullCommand.map(c => `"${c}"`).join(', ')}]`);
      } else {
        lines.push('CMD ["sh"]');
      }
    }

    return lines.join('\n');
  }

  private extractNpmDependencies(config: MCPServerConfig): Record<string, string> {
    const deps: Record<string, string> = {};
    
    if (config.command?.includes('npx') && config.args) {
      // Extract package name from npx command
      const packageArg = config.args.find(arg => arg.startsWith('@') || !arg.startsWith('-'));
      if (packageArg) {
        // For packages like @modelcontextprotocol/server-filesystem
        deps[packageArg] = 'latest';
      }
    }
    
    return deps;
  }

  private extractPythonPackages(config: MCPServerConfig): string[] {
    const packages: string[] = [];
    
    if (config.args) {
      // Look for -m flag followed by package name
      const moduleIndex = config.args.indexOf('-m');
      if (moduleIndex !== -1 && moduleIndex < config.args.length - 1) {
        const moduleName = config.args[moduleIndex + 1];
        // Convert module name to package name (e.g., consult7 -> consult7)
        packages.push(moduleName);
      }
    }
    
    return packages;
  }

  private async createContainer(
    config: MCPServerConfig,
    imageName: string,
    containerName: string
  ): Promise<Docker.Container> {
    const createOptions: Docker.ContainerCreateOptions = {
      Image: imageName,
      name: containerName,
      Labels: {
        'claudeforge': 'true',
        'mcp-server': config.id
      },
      Env: [],
      HostConfig: {
        AutoRemove: false,
        RestartPolicy: {
          Name: 'unless-stopped'
        },
        NetworkMode: this.networkName
      }
    };

    // Add environment variables
    if (config.env) {
      for (const [key, value] of Object.entries(config.env)) {
        createOptions.Env!.push(`${key}=${value}`);
      }
    }

    // Add global environment variables
    if (this.config.environment) {
      for (const [key, value] of Object.entries(this.config.environment)) {
        createOptions.Env!.push(`${key}=${value}`);
      }
    }

    // For stdio transport, we need to expose it over TCP
    if (config.transport === 'stdio') {
      createOptions.ExposedPorts = { '5000/tcp': {} };
      createOptions.HostConfig!.PortBindings = {
        '5000/tcp': [{ HostPort: '0' }] // Let Docker assign a random port
      };
    }

    // Add resource limits if configured
    if (this.config.resources) {
      if (this.config.resources.memory) {
        createOptions.HostConfig!.Memory = this.parseMemory(this.config.resources.memory);
      }
      if (this.config.resources.cpus) {
        createOptions.HostConfig!.CpuQuota = parseFloat(this.config.resources.cpus) * 100000;
        createOptions.HostConfig!.CpuPeriod = 100000;
      }
    }

    // Add volumes if configured
    if (this.config.volumes) {
      createOptions.HostConfig!.Binds = this.config.volumes;
    }

    const container = await this.docker.createContainer(createOptions);
    this.logManager.info(`Created container: ${containerName}`, 'docker-manager');
    
    return container;
  }

  private parseMemory(memory: string): number {
    const units: Record<string, number> = {
      'b': 1,
      'k': 1024,
      'm': 1024 * 1024,
      'g': 1024 * 1024 * 1024
    };
    
    const match = memory.toLowerCase().match(/^(\d+)([bkmg])?$/);
    if (!match) {
      throw new Error(`Invalid memory format: ${memory}`);
    }
    
    const value = parseInt(match[1]);
    const unit = match[2] || 'b';
    
    return value * units[unit];
  }

  private extractPorts(containerInfo: any): { container: number; host: number }[] {
    const ports: { container: number; host: number }[] = [];
    
    if (containerInfo.NetworkSettings?.Ports) {
      for (const [containerPort, hostPorts] of Object.entries(containerInfo.NetworkSettings.Ports)) {
        if (Array.isArray(hostPorts) && hostPorts.length > 0) {
          const port = parseInt(containerPort.split('/')[0]);
          const hostPort = parseInt(hostPorts[0].HostPort);
          ports.push({ container: port, host: hostPort });
        }
      }
    }
    
    return ports;
  }

  async stopContainer(serverId: string): Promise<void> {
    const containerizedServer = this.containers.get(serverId);
    if (!containerizedServer) {
      throw new Error(`No container found for server: ${serverId}`);
    }

    try {
      containerizedServer.status = 'stopping';
      const container = this.docker.getContainer(containerizedServer.containerId);
      await container.stop();
      await container.remove();
      containerizedServer.status = 'stopped';
      this.containers.delete(serverId);
      this.logManager.info(`Stopped and removed container for server: ${serverId}`, 'docker-manager');
    } catch (error: any) {
      this.logManager.error(`Failed to stop container for server ${serverId}`, 'docker-manager', undefined, error);
      throw error;
    }
  }

  async getContainerInfo(serverId: string): Promise<ContainerizedServer | undefined> {
    return this.containers.get(serverId);
  }

  async listContainers(): Promise<ContainerizedServer[]> {
    return Array.from(this.containers.values());
  }

  async getContainerLogs(serverId: string, tail: number = 100): Promise<string> {
    const containerizedServer = this.containers.get(serverId);
    if (!containerizedServer) {
      throw new Error(`No container found for server: ${serverId}`);
    }

    try {
      const container = this.docker.getContainer(containerizedServer.containerId);
      const stream = await container.logs({
        stdout: true,
        stderr: true,
        tail,
        timestamps: true
      });
      
      return stream.toString();
    } catch (error: any) {
      this.logManager.error(`Failed to get logs for container ${serverId}`, 'docker-manager', undefined, error);
      throw error;
    }
  }

  async cleanupContainers(): Promise<void> {
    try {
      const containers = await this.docker.listContainers({
        all: true,
        filters: {
          label: ['claudeforge=true']
        }
      });

      for (const containerInfo of containers) {
        const container = this.docker.getContainer(containerInfo.Id);
        if (containerInfo.State !== 'running') {
          await container.remove();
          this.logManager.info(`Cleaned up container: ${containerInfo.Names[0]}`, 'docker-manager');
        }
      }
    } catch (error: any) {
      this.logManager.error('Failed to cleanup containers', 'docker-manager', undefined, error);
    }
  }

  async pruneImages(): Promise<void> {
    try {
      await this.docker.pruneImages({
        filters: {
          label: ['claudeforge=true']
        }
      });
      this.logManager.info('Pruned unused Docker images', 'docker-manager');
    } catch (error: any) {
      this.logManager.error('Failed to prune images', 'docker-manager', undefined, error);
    }
  }

  private getInlineBridgeScript(): string {
    return `#!/usr/bin/env node
const net = require('net');
const { spawn } = require('child_process');
const readline = require('readline');

const PORT = process.env.BRIDGE_PORT || 5000;
const COMMAND = process.argv[2];
const ARGS = process.argv.slice(3);

if (!COMMAND) {
  console.error('Usage: stdio-tcp-bridge.js <command> [args...]');
  process.exit(1);
}

console.log(\`Starting stdio-tcp bridge on port \${PORT}\`);
console.log(\`Command: \${COMMAND} \${ARGS.join(' ')}\`);

const server = net.createServer((socket) => {
  console.log('Client connected');
  
  const mcpProcess = spawn(COMMAND, ARGS, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env }
  });
  
  mcpProcess.on('error', (error) => {
    console.error('Failed to start MCP server:', error);
    socket.end();
  });
  
  mcpProcess.stderr.on('data', (data) => {
    console.error(\`MCP stderr: \${data}\`);
  });
  
  const rl = readline.createInterface({
    input: mcpProcess.stdout,
    crlfDelay: Infinity
  });
  
  rl.on('line', (line) => {
    if (line.trim()) {
      try {
        JSON.parse(line);
        socket.write(line + '\\n');
      } catch (error) {
        console.error('Invalid JSON from MCP server:', line);
      }
    }
  });
  
  let buffer = '';
  socket.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.trim()) {
        try {
          JSON.parse(line);
          mcpProcess.stdin.write(line + '\\n');
        } catch (error) {
          console.error('Invalid JSON from client:', line);
        }
      }
    }
  });
  
  socket.on('close', () => {
    console.log('Client disconnected');
    mcpProcess.kill();
  });
  
  socket.on('error', (error) => {
    console.error('Socket error:', error);
    mcpProcess.kill();
  });
  
  mcpProcess.on('exit', (code, signal) => {
    console.log(\`MCP server exited with code \${code}, signal \${signal}\`);
    socket.end();
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(\`Bridge listening on port \${PORT}\`);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...');
  server.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down...');
  server.close();
  process.exit(0);
});`;
  }
}
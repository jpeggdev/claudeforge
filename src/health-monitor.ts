import { ConnectedServer, MCPServerConfig } from './types.js';
import { LogManager } from './log-manager.js';
import { FirehoseManager } from './firehose-manager.js';
import { EventEmitter } from 'events';

interface HealthCheckResult {
  serverId: string;
  serverName: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  lastCheck: Date;
  responseTime?: number;
  error?: string;
  consecutiveFailures: number;
}

interface HealthMonitorConfig {
  enabled: boolean;
  interval: number;  // milliseconds between health checks
  timeout: number;   // milliseconds to wait for health check response
  maxRetries: number; // max consecutive failures before marking unhealthy
  autoRestart: boolean;
  restartDelay: number; // milliseconds to wait before restarting
  maxRestarts: number; // max restart attempts within restartWindow
  restartWindow: number; // milliseconds - window for counting restart attempts
}

export class HealthMonitor extends EventEmitter {
  private healthStatus: Map<string, HealthCheckResult> = new Map();
  private restartAttempts: Map<string, { count: number; windowStart: Date }> = new Map();
  private healthCheckIntervals: Map<string, NodeJS.Timeout> = new Map();
  private restartTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private config: HealthMonitorConfig;
  private logManager: LogManager;
  private firehoseManager: FirehoseManager;
  private serverManager: any; // Will be injected to avoid circular dependency

  constructor(
    config: Partial<HealthMonitorConfig>,
    logManager: LogManager,
    firehoseManager: FirehoseManager
  ) {
    super();
    this.config = {
      enabled: config.enabled ?? true,
      interval: config.interval ?? 30000, // 30 seconds
      timeout: config.timeout ?? 10000, // 10 seconds
      maxRetries: config.maxRetries ?? 3,
      autoRestart: config.autoRestart ?? true,
      restartDelay: config.restartDelay ?? 5000, // 5 seconds
      maxRestarts: config.maxRestarts ?? 5,
      restartWindow: config.restartWindow ?? 300000 // 5 minutes
    };
    this.logManager = logManager;
    this.firehoseManager = firehoseManager;
  }

  setServerManager(serverManager: any): void {
    this.serverManager = serverManager;
  }

  startMonitoring(server: ConnectedServer): void {
    if (!this.config.enabled) return;

    const serverId = server.id;
    this.stopMonitoring(serverId); // Clear any existing monitoring

    // Initialize health status
    this.healthStatus.set(serverId, {
      serverId,
      serverName: server.config.name,
      status: 'healthy',
      lastCheck: new Date(),
      consecutiveFailures: 0
    });

    // Set up periodic health checks
    const interval = setInterval(async () => {
      await this.performHealthCheck(server);
    }, this.config.interval);

    this.healthCheckIntervals.set(serverId, interval);
    
    this.logManager.info(`Health monitoring started for server`, serverId, server.config.name);
    this.firehoseManager.captureSystemEvent('health-monitor', `Started monitoring ${server.config.name}`);
  }

  stopMonitoring(serverId: string): void {
    const interval = this.healthCheckIntervals.get(serverId);
    if (interval) {
      clearInterval(interval);
      this.healthCheckIntervals.delete(serverId);
    }

    const restartTimeout = this.restartTimeouts.get(serverId);
    if (restartTimeout) {
      clearTimeout(restartTimeout);
      this.restartTimeouts.delete(serverId);
    }

    this.healthStatus.delete(serverId);
    this.restartAttempts.delete(serverId);
  }

  async performHealthCheck(server: ConnectedServer): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const serverId = server.id;
    let status = this.healthStatus.get(serverId) || {
      serverId,
      serverName: server.config.name,
      status: 'healthy',
      lastCheck: new Date(),
      consecutiveFailures: 0
    };

    try {
      // Different health check strategies based on transport type
      switch (server.config.transport) {
        case 'stdio':
        case 'docker':
          // For stdio/docker, check if the process is still running
          await this.checkStdioHealth(server);
          break;
        
        case 'sse':
        case 'websocket':
        case 'http':
        case 'streamable-http':
          // For network transports, try to list capabilities
          await this.checkNetworkHealth(server);
          break;
      }

      const responseTime = Date.now() - startTime;
      
      // Update health status
      status = {
        serverId,
        serverName: server.config.name,
        status: 'healthy',
        lastCheck: new Date(),
        responseTime,
        consecutiveFailures: 0
      };

      this.healthStatus.set(serverId, status);
      this.emit('health-check', status);
      
      // Log only if transitioning from unhealthy to healthy
      const previousStatus = this.healthStatus.get(serverId);
      if (previousStatus && previousStatus.status !== 'healthy') {
        this.logManager.info(`Server health restored`, serverId, server.config.name);
        this.firehoseManager.captureSystemEvent('health-monitor', `${server.config.name} is now healthy`);
      }

    } catch (error: any) {
      status.consecutiveFailures++;
      status.error = error.message;
      status.lastCheck = new Date();

      if (status.consecutiveFailures >= this.config.maxRetries) {
        status.status = 'unhealthy';
        this.logManager.error(`Server marked unhealthy after ${status.consecutiveFailures} failures`, serverId, server.config.name, error);
        this.firehoseManager.captureSystemEvent('health-monitor', `${server.config.name} is unhealthy: ${error.message}`);
        
        // Trigger auto-restart if enabled
        if (this.config.autoRestart) {
          await this.scheduleRestart(server);
        }
      } else {
        status.status = 'degraded';
        this.logManager.warning(`Health check failed (${status.consecutiveFailures}/${this.config.maxRetries})`, serverId, server.config.name);
      }

      this.healthStatus.set(serverId, status);
      this.emit('health-check', status);
    }

    return status;
  }

  private async checkStdioHealth(server: ConnectedServer): Promise<void> {
    // For stdio transports, check if the process is still alive
    if (server.process && server.process.killed) {
      throw new Error('Process has been killed');
    }

    if (server.transport && (server.transport as any)._process) {
      const process = (server.transport as any)._process;
      if (process.killed || process.exitCode !== null) {
        throw new Error('Process has exited');
      }
    }

    // Try to get server capabilities as a health check
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Health check timeout')), this.config.timeout);
    });

    try {
      await Promise.race([
        server.client.getServerCapabilities(),
        timeoutPromise
      ]);
    } catch (error) {
      throw new Error(`Failed to get server capabilities: ${error}`);
    }
  }

  private async checkNetworkHealth(server: ConnectedServer): Promise<void> {
    // For network transports, try to get server capabilities
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Health check timeout')), this.config.timeout);
    });

    try {
      await Promise.race([
        server.client.getServerCapabilities(),
        timeoutPromise
      ]);
    } catch (error) {
      throw new Error(`Failed to get server capabilities: ${error}`);
    }
  }

  private async scheduleRestart(server: ConnectedServer): Promise<void> {
    const serverId = server.id;
    
    // Check restart attempts within window
    const now = new Date();
    let attempts = this.restartAttempts.get(serverId);
    
    if (!attempts) {
      attempts = { count: 0, windowStart: now };
      this.restartAttempts.set(serverId, attempts);
    }

    // Reset window if expired
    if (now.getTime() - attempts.windowStart.getTime() > this.config.restartWindow) {
      attempts = { count: 0, windowStart: now };
      this.restartAttempts.set(serverId, attempts);
    }

    // Check if we've exceeded max restarts
    if (attempts.count >= this.config.maxRestarts) {
      this.logManager.error(
        `Max restart attempts (${this.config.maxRestarts}) reached within window`,
        serverId,
        server.config.name
      );
      this.firehoseManager.captureSystemEvent(
        'health-monitor',
        `Giving up on ${server.config.name} after ${attempts.count} restart attempts`
      );
      return;
    }

    // Clear any existing restart timeout
    const existingTimeout = this.restartTimeouts.get(serverId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Schedule restart with delay
    this.logManager.info(
      `Scheduling restart in ${this.config.restartDelay}ms (attempt ${attempts.count + 1}/${this.config.maxRestarts})`,
      serverId,
      server.config.name
    );

    const timeout = setTimeout(async () => {
      try {
        attempts!.count++;
        this.logManager.info(`Attempting to restart server`, serverId, server.config.name);
        this.firehoseManager.captureSystemEvent('health-monitor', `Restarting ${server.config.name}`);
        
        // Stop monitoring during restart
        this.stopMonitoring(serverId);
        
        // Restart the server
        await this.serverManager.stopServer(serverId);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Brief pause
        const newServer = await this.serverManager.startServer(server.config);
        
        // Resume monitoring if server started successfully
        if (newServer.status === 'connected') {
          this.startMonitoring(newServer);
          this.logManager.info(`Server restarted successfully`, serverId, server.config.name);
          this.firehoseManager.captureSystemEvent('health-monitor', `${server.config.name} restarted successfully`);
        } else {
          this.logManager.error(`Server failed to restart`, serverId, server.config.name);
          // Schedule another restart attempt
          await this.scheduleRestart(newServer);
        }
      } catch (error: any) {
        this.logManager.error(`Failed to restart server: ${error.message}`, serverId, server.config.name, error);
        this.firehoseManager.captureSystemEvent('health-monitor', `Failed to restart ${server.config.name}: ${error.message}`);
      }
      
      this.restartTimeouts.delete(serverId);
    }, this.config.restartDelay);

    this.restartTimeouts.set(serverId, timeout);
  }

  getHealthStatus(serverId?: string): HealthCheckResult | HealthCheckResult[] | undefined {
    if (serverId) {
      return this.healthStatus.get(serverId);
    }
    return Array.from(this.healthStatus.values());
  }

  async manualHealthCheck(serverId: string): Promise<HealthCheckResult> {
    const server = this.serverManager.getServer(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }
    
    return await this.performHealthCheck(server);
  }

  getConfig(): HealthMonitorConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<HealthMonitorConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Restart monitoring with new config if enabled state changed
    if ('enabled' in config) {
      const servers = this.serverManager.getAllServers();
      for (const server of servers) {
        if (config.enabled) {
          this.startMonitoring(server);
        } else {
          this.stopMonitoring(server.id);
        }
      }
    }
  }

  stopAll(): void {
    for (const serverId of this.healthCheckIntervals.keys()) {
      this.stopMonitoring(serverId);
    }
  }
}
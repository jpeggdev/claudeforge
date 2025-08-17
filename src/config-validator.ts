import { ProxyConfig, MCPServerConfig } from './types.js';
import fs from 'fs/promises';
import path from 'path';
import { URL } from 'url';

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export class ConfigValidator {
  private errors: ValidationError[] = [];
  private warnings: ValidationError[] = [];

  public async validateConfig(config: any): Promise<ValidationResult> {
    this.errors = [];
    this.warnings = [];

    if (!config || typeof config !== 'object') {
      this.addError('config', 'Configuration must be a valid object');
      return this.getResult();
    }

    this.validatePort('port', config.port, 3000, 65535);
    this.validatePort('webPort', config.webPort, 3000, 65535);
    
    if (config.port === config.webPort) {
      this.addError('port', 'Proxy port and web port must be different');
    }

    this.validateDefaultPermissions(config.defaultPermissions);
    
    if (config.servers) {
      await this.validateServers(config.servers);
    } else {
      this.addWarning('servers', 'No servers configured');
    }

    return this.getResult();
  }

  private validatePort(field: string, value: any, min: number, max: number): void {
    if (value === undefined || value === null) {
      this.addError(field, `${field} is required`);
      return;
    }

    const port = typeof value === 'string' ? parseInt(value, 10) : value;
    
    if (isNaN(port) || !Number.isInteger(port)) {
      this.addError(field, `${field} must be a valid integer`);
      return;
    }

    if (port < min || port > max) {
      this.addError(field, `${field} must be between ${min} and ${max}`);
      return;
    }

    if (port < 1024) {
      this.addWarning(field, `${field} is below 1024, may require elevated permissions`);
    }
  }

  private validateDefaultPermissions(value: any): void {
    if (value === undefined || value === null) {
      this.addWarning('defaultPermissions', 'defaultPermissions not set, defaulting to "allow"');
      return;
    }

    if (value !== 'allow' && value !== 'deny') {
      this.addError('defaultPermissions', 'defaultPermissions must be either "allow" or "deny"');
    }
  }

  private async validateServers(servers: any): Promise<void> {
    if (!Array.isArray(servers)) {
      this.addError('servers', 'servers must be an array');
      return;
    }

    const seenIds = new Set<string>();
    const seenNames = new Set<string>();

    for (let i = 0; i < servers.length; i++) {
      const server = servers[i];
      const prefix = `servers[${i}]`;

      if (!server || typeof server !== 'object') {
        this.addError(prefix, 'Server configuration must be an object');
        continue;
      }

      await this.validateServer(server, prefix, seenIds, seenNames);
    }
  }

  private async validateServer(
    server: any, 
    prefix: string, 
    seenIds: Set<string>, 
    seenNames: Set<string>
  ): Promise<void> {
    if (!server.id) {
      this.addError(`${prefix}.id`, 'Server ID is required');
    } else if (typeof server.id !== 'string') {
      this.addError(`${prefix}.id`, 'Server ID must be a string');
    } else if (seenIds.has(server.id)) {
      this.addError(`${prefix}.id`, `Duplicate server ID: ${server.id}`);
    } else {
      seenIds.add(server.id);
      
      if (!/^[a-zA-Z0-9_-]+$/.test(server.id)) {
        this.addError(`${prefix}.id`, 'Server ID must contain only alphanumeric characters, underscores, and hyphens');
      }
    }

    if (!server.name) {
      this.addError(`${prefix}.name`, 'Server name is required');
    } else if (typeof server.name !== 'string') {
      this.addError(`${prefix}.name`, 'Server name must be a string');
    } else if (seenNames.has(server.name)) {
      this.addWarning(`${prefix}.name`, `Duplicate server name: ${server.name}`);
    } else {
      seenNames.add(server.name);
    }

    this.validateTransport(server, prefix);
    
    if (server.timeout !== undefined) {
      const timeout = typeof server.timeout === 'string' ? parseInt(server.timeout, 10) : server.timeout;
      if (isNaN(timeout) || timeout <= 0) {
        this.addError(`${prefix}.timeout`, 'Timeout must be a positive number');
      } else if (timeout < 1000) {
        this.addWarning(`${prefix}.timeout`, 'Timeout is very short (< 1 second), may cause issues');
      }
    }

    if (server.disabled === true) {
      this.addWarning(`${prefix}`, `Server "${server.name}" is disabled`);
    }
  }

  private validateTransport(server: any, prefix: string): void {
    const validTransports = ['stdio', 'sse', 'websocket', 'http', 'streamable-http', 'docker'];
    
    if (!server.transport) {
      this.addError(`${prefix}.transport`, 'Server transport is required');
      return;
    }

    if (!validTransports.includes(server.transport)) {
      this.addError(`${prefix}.transport`, `Invalid transport: ${server.transport}. Must be one of: ${validTransports.join(', ')}`);
      return;
    }

    switch (server.transport) {
      case 'stdio':
        this.validateStdioTransport(server, prefix);
        break;
      case 'docker':
        this.validateDockerTransport(server, prefix);
        break;
      case 'sse':
        this.validateSSETransport(server, prefix);
        break;
      case 'websocket':
        this.validateWebSocketTransport(server, prefix);
        break;
      case 'http':
      case 'streamable-http':
        this.validateHTTPTransport(server, prefix);
        break;
    }
  }

  private validateStdioTransport(server: any, prefix: string): void {
    if (!server.command) {
      this.addError(`${prefix}.command`, 'Command is required for stdio transport');
    } else if (typeof server.command !== 'string') {
      this.addError(`${prefix}.command`, 'Command must be a string');
    }

    if (server.args) {
      if (!Array.isArray(server.args)) {
        this.addError(`${prefix}.args`, 'Args must be an array');
      } else {
        for (let i = 0; i < server.args.length; i++) {
          if (typeof server.args[i] !== 'string') {
            this.addError(`${prefix}.args[${i}]`, 'All args must be strings');
          }
        }
      }
    }

    if (server.env) {
      this.validateEnv(server.env, `${prefix}.env`);
    }
  }

  private validateDockerTransport(server: any, prefix: string): void {
    // Docker transport requires command like stdio
    if (!server.command) {
      this.addError(`${prefix}.command`, 'Command is required for docker transport');
    } else if (typeof server.command !== 'string') {
      this.addError(`${prefix}.command`, 'Command must be a string');
    }

    if (server.args) {
      if (!Array.isArray(server.args)) {
        this.addError(`${prefix}.args`, 'Args must be an array');
      } else {
        for (let i = 0; i < server.args.length; i++) {
          if (typeof server.args[i] !== 'string') {
            this.addError(`${prefix}.args[${i}]`, 'All args must be strings');
          }
        }
      }
    }

    if (server.env) {
      this.validateEnv(server.env, `${prefix}.env`);
    }

    // Validate docker-specific config if present
    if (server.docker) {
      this.validateDockerConfig(server.docker, `${prefix}.docker`);
    }
  }

  private validateDockerConfig(docker: any, prefix: string): void {
    if (docker.resources) {
      if (docker.resources.memory && typeof docker.resources.memory !== 'string') {
        this.addError(`${prefix}.resources.memory`, 'Memory must be a string (e.g., "512m", "1g")');
      }
      if (docker.resources.cpus && typeof docker.resources.cpus !== 'string') {
        this.addError(`${prefix}.resources.cpus`, 'CPUs must be a string (e.g., "0.5", "2")');
      }
    }

    if (docker.volumes && !Array.isArray(docker.volumes)) {
      this.addError(`${prefix}.volumes`, 'Volumes must be an array');
    }

    if (docker.ports && !Array.isArray(docker.ports)) {
      this.addError(`${prefix}.ports`, 'Ports must be an array');
    }
  }

  private validateSSETransport(server: any, prefix: string): void {
    if (!server.endpoint && !server.url) {
      this.addError(`${prefix}`, 'Either endpoint or url is required for SSE transport');
      return;
    }

    const url = server.endpoint || server.url;
    if (!this.isValidURL(url)) {
      this.addError(`${prefix}.${server.endpoint ? 'endpoint' : 'url'}`, 'Must be a valid URL');
    }
  }

  private validateWebSocketTransport(server: any, prefix: string): void {
    if (!server.endpoint && !server.url) {
      this.addError(`${prefix}`, 'Either endpoint or url is required for WebSocket transport');
      return;
    }

    const url = server.endpoint || server.url;
    if (!this.isValidWebSocketURL(url)) {
      this.addError(`${prefix}.${server.endpoint ? 'endpoint' : 'url'}`, 'Must be a valid WebSocket URL (ws:// or wss://)');
    }
  }

  private validateHTTPTransport(server: any, prefix: string): void {
    if (!server.endpoint && !server.url) {
      this.addError(`${prefix}`, 'Either endpoint or url is required for HTTP transport');
      return;
    }

    const url = server.endpoint || server.url;
    if (!this.isValidURL(url)) {
      this.addError(`${prefix}.${server.endpoint ? 'endpoint' : 'url'}`, 'Must be a valid HTTP/HTTPS URL');
    }
  }

  private validateEnv(env: any, prefix: string): void {
    if (typeof env !== 'object' || env === null || Array.isArray(env)) {
      this.addError(prefix, 'Environment variables must be an object');
      return;
    }

    for (const [key, value] of Object.entries(env)) {
      if (typeof value !== 'string') {
        this.addError(`${prefix}.${key}`, 'Environment variable values must be strings');
      }

      if (key.includes(' ')) {
        this.addError(`${prefix}.${key}`, 'Environment variable names cannot contain spaces');
      }

      const sensitiveKeys = ['TOKEN', 'KEY', 'SECRET', 'PASSWORD', 'API_KEY', 'ACCESS_TOKEN'];
      if (sensitiveKeys.some(sensitive => key.toUpperCase().includes(sensitive))) {
        if (value && typeof value === 'string' && value.length > 0) {
          this.addWarning(`${prefix}.${key}`, 'Contains sensitive information - ensure this is properly secured');
        }
      }
    }
  }

  private isValidURL(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private isValidWebSocketURL(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
    } catch {
      return false;
    }
  }

  private addError(field: string, message: string, value?: any): void {
    this.errors.push({ field, message, value });
  }

  private addWarning(field: string, message: string, value?: any): void {
    this.warnings.push({ field, message, value });
  }

  private getResult(): ValidationResult {
    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings
    };
  }
}

export async function validateConfigFile(configPath: string): Promise<ValidationResult> {
  const validator = new ConfigValidator();
  
  try {
    const configData = await fs.readFile(configPath, 'utf-8');
    let config: any;
    
    try {
      config = JSON.parse(configData);
    } catch (parseError: any) {
      return {
        valid: false,
        errors: [{
          field: 'config',
          message: `Invalid JSON: ${parseError.message}`
        }],
        warnings: []
      };
    }
    
    return await validator.validateConfig(config);
  } catch (error: any) {
    return {
      valid: false,
      errors: [{
        field: 'config',
        message: `Failed to read config file: ${error.message}`
      }],
      warnings: []
    };
  }
}

export async function validateAndLoadConfig(configPath: string): Promise<{ config?: ProxyConfig; validation: ValidationResult }> {
  const validation = await validateConfigFile(configPath);
  
  if (!validation.valid) {
    return { validation };
  }
  
  try {
    const configData = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configData) as ProxyConfig;
    return { config, validation };
  } catch (error: any) {
    return {
      validation: {
        valid: false,
        errors: [{
          field: 'config',
          message: `Failed to load config: ${error.message}`
        }],
        warnings: validation.warnings
      }
    };
  }
}
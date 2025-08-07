export interface MCPServerConfig {
  id: string;
  name: string;
  command?: string;  // Optional for HTTP transports
  args?: string[];
  env?: Record<string, string>;
  transport: 'stdio' | 'sse' | 'websocket' | 'http' | 'streamable-http';
  endpoint?: string;
  url?: string;  // Alternative to endpoint for HTTP transports
}

export interface ToolPermission {
  toolName: string;
  serverId: string;
  enabled: boolean;
  permissions: {
    read?: boolean;
    write?: boolean;
    execute?: boolean;
  };
}

export interface ProxyConfig {
  port: number;
  webPort: number;
  servers: MCPServerConfig[];
  defaultPermissions: 'allow' | 'deny';
}

export interface ConnectedServer {
  id: string;
  config: MCPServerConfig;
  process?: any;
  client: any;
  tools: Map<string, any>;
  resources?: Map<string, any>;
  prompts?: Map<string, any>;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  error?: string;
}

export interface ClientSession {
  id: string;
  permissions: Map<string, ToolPermission>;
  connectedAt: Date;
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'info' | 'warning' | 'error' | 'debug';
  serverId?: string;
  serverName?: string;
  message: string;
  details?: any;
}
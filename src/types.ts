export interface MCPServerConfig {
  id: string;
  name: string;
  command?: string;  // Optional for HTTP transports
  args?: string[];
  env?: Record<string, string>;
  transport: 'stdio' | 'sse' | 'websocket' | 'http' | 'streamable-http' | 'docker';
  endpoint?: string;
  url?: string;  // Alternative to endpoint for HTTP transports
  headers?: Record<string, string>;  // Optional headers for HTTP transports (e.g., Authorization)
  timeout?: number;  // Timeout in milliseconds for tool/resource/prompt calls (default: 30000)
  docker?: {
    enabled?: boolean;  // Enable Docker containerization for this server
    image?: string;     // Custom Docker image to use
    buildContext?: string; // Path to build context if custom Dockerfile
    dockerfile?: string;   // Path to custom Dockerfile
    volumes?: string[];    // Volume mounts
    ports?: string[];      // Additional port mappings
    networkMode?: string;  // Network mode
    resources?: {
      memory?: string;     // Memory limit (e.g., "512m", "1g")
      cpus?: string;       // CPU limit (e.g., "0.5", "2")
    };
  };
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
  ui?: {
    theme?: 'light' | 'dark' | 'system';
    accentColor?: string; // HSL values like "262 83% 58%"
    radius?: string; // Border radius like "0.5rem" or "0.75rem"
  };
  healthMonitor?: {
    enabled?: boolean;
    interval?: number;  // milliseconds between health checks
    timeout?: number;   // milliseconds to wait for health check response
    maxRetries?: number; // max consecutive failures before marking unhealthy
    autoRestart?: boolean;
    restartDelay?: number; // milliseconds to wait before restarting
    maxRestarts?: number; // max restart attempts within restartWindow
    restartWindow?: number; // milliseconds - window for counting restart attempts
  };
  docker?: {
    enabled?: boolean;           // Enable Docker support globally
    autoContainerize?: boolean;  // Automatically containerize stdio servers
    network?: string;            // Docker network name
    registry?: string;           // Docker registry for images
    baseImages?: {               // Base images for different languages
      node?: string;
      python?: string;
      go?: string;
      rust?: string;
    };
    defaultVolumes?: string[];   // Default volumes for all containers
    defaultEnvironment?: Record<string, string>; // Default env vars
    defaultLabels?: Record<string, string>;      // Default labels
    defaultResources?: {         // Default resource limits
      memory?: string;
      cpus?: string;
    };
  };
}

export interface ConnectedServer {
  id: string;
  config: MCPServerConfig;
  process?: any;
  transport?: any;
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
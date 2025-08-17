// Shared type definitions for ClaudeForge UI

export interface Server {
  id: string
  name: string
  transport?: string
  status?: 'connected' | 'connecting' | 'disconnected'
  connected?: boolean
  disabled?: boolean
  tools?: Tool[]
  resources?: Resource[]
  prompts?: Prompt[]
}

export interface Tool {
  name: string
  description: string
  inputSchema?: Record<string, unknown>
}

export interface Resource {
  name: string
  description: string
  uri: string
  mimeType?: string
}

export interface Prompt {
  name: string
  description: string
  arguments?: PromptArgument[]
}

export interface PromptArgument {
  name: string
  description?: string
  required?: boolean
}

export interface DebugMessage {
  type: 'request' | 'response' | 'notification'
  method: string
  timestamp: string
  serverId?: string
  data: Record<string, unknown>
  responseTime?: number
}

export interface DebugStats {
  totalMessages: number
  requests: number
  responses: number
  notifications: number
  avgResponseTime: number
}

export interface FirehoseEvent {
  type: string
  timestamp: string
  data: string | Record<string, unknown>
}

export interface LogEntry {
  timestamp: string
  level: 'error' | 'warning' | 'info' | 'debug'
  message: string
  source?: string
}

export interface WebSocketMessage {
  type: string
  data?: unknown
}

export interface ToolPermission {
  key?: string
  toolName: string
  serverId: string
  enabled: boolean
  permissions: {
    read: boolean
    write: boolean
    execute: boolean
  }
}

export interface SessionInfo {
  id: string
  createdAt: string
}

export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'
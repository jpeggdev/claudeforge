import { ToolPermission, ClientSession } from './types.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

export class PermissionManager {
  private sessions: Map<string, ClientSession> = new Map();
  private globalPermissions: Map<string, ToolPermission> = new Map();
  private defaultAllow: boolean = false;
  private permissionsFilePath: string;
  private initialized: boolean = false;

  constructor(configPath?: string) {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const defaultConfigPath = path.join(__dirname, '..', 'config.json');
    const baseDir = path.dirname(configPath || defaultConfigPath);
    this.permissionsFilePath = path.join(baseDir, 'permissions.json');
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.loadPermissions();
    this.initialized = true;
  }

  async savePermissions(): Promise<void> {
    // Don't save during initialization until permissions are loaded
    if (!this.initialized) {
      return;
    }
    
    try {
      const data = {
        defaultAllow: this.defaultAllow,
        globalPermissions: Array.from(this.globalPermissions.entries()).map(([key, perm]) => ({ key, ...perm })),
        sessions: Array.from(this.sessions.entries()).map(([id, session]) => ({
          id,
          connectedAt: session.connectedAt,
          permissions: Array.from(session.permissions.entries()).map(([key, perm]) => ({ key, ...perm }))
        }))
      };
      
      await fs.writeFile(this.permissionsFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.warn('Failed to save permissions:', error);
    }
  }

  async loadPermissions(): Promise<void> {
    try {
      const data = await fs.readFile(this.permissionsFilePath, 'utf-8');
      const parsed = JSON.parse(data);
      
      if (typeof parsed.defaultAllow === 'boolean') {
        this.defaultAllow = parsed.defaultAllow;
      }
      
      if (Array.isArray(parsed.globalPermissions)) {
        this.globalPermissions.clear();
        for (const perm of parsed.globalPermissions) {
          if (perm.key && perm.toolName && perm.serverId) {
            this.globalPermissions.set(perm.key, {
              toolName: perm.toolName,
              serverId: perm.serverId,
              enabled: perm.enabled ?? true,
              permissions: perm.permissions || {}
            });
          }
        }
      }
      
      if (Array.isArray(parsed.sessions)) {
        this.sessions.clear();
        for (const sessionData of parsed.sessions) {
          if (sessionData.id && Array.isArray(sessionData.permissions)) {
            const session: ClientSession = {
              id: sessionData.id,
              connectedAt: new Date(sessionData.connectedAt),
              permissions: new Map()
            };
            
            if (sessionData.permissions && sessionData.permissions.length > 0) {
              for (const perm of sessionData.permissions) {
                if (perm.key && perm.toolName && perm.serverId) {
                  session.permissions.set(perm.key, {
                    toolName: perm.toolName,
                    serverId: perm.serverId,
                    enabled: perm.enabled ?? true,
                    permissions: perm.permissions || {}
                  });
                }
              }
            }
            
            this.sessions.set(session.id, session);
          }
        }
      }
    } catch (error) {
      // File doesn't exist or is invalid - start with defaults
      console.log('[PermissionManager] No permissions file found or invalid format, starting with defaults');
    }
  }

  createSession(): ClientSession {
    const session: ClientSession = {
      id: uuidv4(),
      permissions: new Map(this.globalPermissions),
      connectedAt: new Date()
    };
    this.sessions.set(session.id, session);
    this.savePermissions().catch(console.warn);
    return session;
  }

  getSession(sessionId: string): ClientSession | undefined {
    return this.sessions.get(sessionId);
  }

  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.savePermissions().catch(console.warn);
  }

  setDefaultPolicy(allow: boolean): void {
    this.defaultAllow = allow;
    // Only save if initialized (to avoid overwriting during startup)
    if (this.initialized) {
      this.savePermissions().catch(console.warn);
    }
  }

  setGlobalToolPermission(serverId: string, toolName: string, permission: ToolPermission): void {
    const key = `${serverId}:${toolName}`;
    this.globalPermissions.set(key, permission);
    
    this.sessions.forEach(session => {
      session.permissions.set(key, { ...permission });
    });
    
    this.savePermissions().catch(console.warn);
  }

  setSessionToolPermission(sessionId: string, serverId: string, toolName: string, permission: ToolPermission): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    const key = `${serverId}:${toolName}`;
    session.permissions.set(key, permission);
    
    this.savePermissions().catch(console.warn);
  }

  hasPermission(sessionId: string, serverId: string, toolName: string, action: 'read' | 'write' | 'execute' = 'execute'): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const key = `${serverId}:${toolName}`;
    const permission = session.permissions.get(key);

    if (!permission) {
      return this.defaultAllow;
    }

    if (!permission.enabled) {
      return false;
    }

    return permission.permissions[action] ?? true;
  }

  getSessionPermissions(sessionId: string): Map<string, ToolPermission> | undefined {
    const session = this.sessions.get(sessionId);
    return session?.permissions;
  }

  getAllSessions(): ClientSession[] {
    return Array.from(this.sessions.values());
  }

  bulkUpdatePermissions(sessionId: string, permissions: ToolPermission[]): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    permissions.forEach(perm => {
      const key = `${perm.serverId}:${perm.toolName}`;
      session.permissions.set(key, perm);
    });
    
    this.savePermissions().catch(console.warn);
  }
}
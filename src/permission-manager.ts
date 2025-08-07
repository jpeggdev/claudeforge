import { ToolPermission, ClientSession } from './types.js';
import { v4 as uuidv4 } from 'uuid';

export class PermissionManager {
  private sessions: Map<string, ClientSession> = new Map();
  private globalPermissions: Map<string, ToolPermission> = new Map();
  private defaultAllow: boolean = false;

  createSession(): ClientSession {
    const session: ClientSession = {
      id: uuidv4(),
      permissions: new Map(this.globalPermissions),
      connectedAt: new Date()
    };
    this.sessions.set(session.id, session);
    return session;
  }

  getSession(sessionId: string): ClientSession | undefined {
    return this.sessions.get(sessionId);
  }

  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  setDefaultPolicy(allow: boolean): void {
    this.defaultAllow = allow;
  }

  setGlobalToolPermission(serverId: string, toolName: string, permission: ToolPermission): void {
    const key = `${serverId}:${toolName}`;
    this.globalPermissions.set(key, permission);
    
    this.sessions.forEach(session => {
      session.permissions.set(key, { ...permission });
    });
  }

  setSessionToolPermission(sessionId: string, serverId: string, toolName: string, permission: ToolPermission): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    const key = `${serverId}:${toolName}`;
    session.permissions.set(key, permission);
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
  }
}
import { EventEmitter } from 'events';
import { JSONRPCRequest, JSONRPCResponse, JSONRPCNotification } from '@modelcontextprotocol/sdk/types.js';

export interface DebugMessage {
  id: string;
  timestamp: Date;
  direction: 'client-to-server' | 'server-to-client';
  serverId: string;
  serverName: string;
  transport: string;
  messageType: 'request' | 'response' | 'notification' | 'error';
  method?: string;
  data: JSONRPCRequest | JSONRPCResponse | JSONRPCNotification | any;
  duration?: number; // For request-response pairs
  error?: any;
}

export interface DebugSession {
  id: string;
  startTime: Date;
  endTime?: Date;
  serverId: string;
  serverName: string;
  messages: DebugMessage[];
  stats: {
    totalRequests: number;
    totalResponses: number;
    totalNotifications: number;
    totalErrors: number;
    averageResponseTime: number;
  };
}

export class DebugManager extends EventEmitter {
  private messages: Map<string, DebugMessage[]> = new Map(); // Messages by serverId
  private sessions: Map<string, DebugSession> = new Map(); // Active debug sessions
  private pendingRequests: Map<string, DebugMessage> = new Map(); // Track request-response pairs
  private maxMessagesPerServer: number = 1000;
  private debugEnabled: boolean = false;

  constructor() {
    super();
  }

  enableDebugging(): void {
    this.debugEnabled = true;
    this.emit('debug-enabled');
  }

  disableDebugging(): void {
    this.debugEnabled = false;
    this.emit('debug-disabled');
  }

  isDebugEnabled(): boolean {
    return this.debugEnabled;
  }

  startSession(serverId: string, serverName: string): string {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const session: DebugSession = {
      id: sessionId,
      startTime: new Date(),
      serverId,
      serverName,
      messages: [],
      stats: {
        totalRequests: 0,
        totalResponses: 0,
        totalNotifications: 0,
        totalErrors: 0,
        averageResponseTime: 0
      }
    };
    this.sessions.set(sessionId, session);
    return sessionId;
  }

  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.endTime = new Date();
    }
  }

  interceptMessage(
    serverId: string,
    serverName: string,
    transport: string,
    direction: 'client-to-server' | 'server-to-client',
    message: any
  ): void {
    if (!this.debugEnabled) return;

    const debugMessage: DebugMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      direction,
      serverId,
      serverName,
      transport,
      messageType: this.getMessageType(message),
      method: message.method,
      data: message
    };

    // Track request-response pairs for timing
    if (direction === 'client-to-server' && this.isRequest(message)) {
      this.pendingRequests.set(`${serverId}-${message.id}`, debugMessage);
    } else if (direction === 'server-to-client' && this.isResponse(message)) {
      const requestKey = `${serverId}-${message.id}`;
      const request = this.pendingRequests.get(requestKey);
      if (request) {
        debugMessage.duration = Date.now() - request.timestamp.getTime();
        this.pendingRequests.delete(requestKey);
      }
    }

    // Store message
    if (!this.messages.has(serverId)) {
      this.messages.set(serverId, []);
    }
    const serverMessages = this.messages.get(serverId)!;
    serverMessages.push(debugMessage);

    // Limit stored messages per server
    if (serverMessages.length > this.maxMessagesPerServer) {
      serverMessages.shift();
    }

    // Update session if active
    for (const session of this.sessions.values()) {
      if (session.serverId === serverId && !session.endTime) {
        session.messages.push(debugMessage);
        this.updateSessionStats(session, debugMessage);
      }
    }

    // Emit for real-time updates
    this.emit('message', debugMessage);
  }

  private getMessageType(message: any): 'request' | 'response' | 'notification' | 'error' {
    if (message.error) return 'error';
    if (message.result !== undefined) return 'response';
    if (message.method && message.id !== undefined) return 'request';
    if (message.method && message.id === undefined) return 'notification';
    return 'error';
  }

  private isRequest(message: any): boolean {
    return message.method && message.id !== undefined;
  }

  private isResponse(message: any): boolean {
    return message.result !== undefined || message.error !== undefined;
  }

  private updateSessionStats(session: DebugSession, message: DebugMessage): void {
    switch (message.messageType) {
      case 'request':
        session.stats.totalRequests++;
        break;
      case 'response':
        session.stats.totalResponses++;
        if (message.duration) {
          const totalTime = session.stats.averageResponseTime * (session.stats.totalResponses - 1) + message.duration;
          session.stats.averageResponseTime = totalTime / session.stats.totalResponses;
        }
        break;
      case 'notification':
        session.stats.totalNotifications++;
        break;
      case 'error':
        session.stats.totalErrors++;
        break;
    }
  }

  getMessages(serverId?: string): DebugMessage[] {
    if (serverId) {
      return this.messages.get(serverId) || [];
    }
    // Return all messages
    const allMessages: DebugMessage[] = [];
    for (const messages of this.messages.values()) {
      allMessages.push(...messages);
    }
    return allMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  getSession(sessionId: string): DebugSession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): DebugSession[] {
    return Array.from(this.sessions.values());
  }

  clearMessages(serverId?: string): void {
    if (serverId) {
      this.messages.delete(serverId);
    } else {
      this.messages.clear();
    }
    this.emit('messages-cleared', serverId);
  }

  exportSession(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    return JSON.stringify(session, null, 2);
  }

  exportAllMessages(): string {
    const exportData = {
      timestamp: new Date().toISOString(),
      messages: this.getMessages(),
      sessions: this.getAllSessions()
    };
    return JSON.stringify(exportData, null, 2);
  }

  getStats(): any {
    const stats: any = {
      debugEnabled: this.debugEnabled,
      totalMessages: 0,
      messagesByServer: {},
      activeSessions: 0,
      totalSessions: this.sessions.size
    };

    for (const [serverId, messages] of this.messages.entries()) {
      stats.messagesByServer[serverId] = messages.length;
      stats.totalMessages += messages.length;
    }

    for (const session of this.sessions.values()) {
      if (!session.endTime) {
        stats.activeSessions++;
      }
    }

    return stats;
  }
}
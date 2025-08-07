import { LogEntry } from './types.js';
import { v4 as uuidv4 } from 'uuid';

export class LogManager {
  private logs: LogEntry[] = [];
  private maxLogs: number = 1000;
  private listeners: Set<(log: LogEntry) => void> = new Set();

  addLog(
    level: LogEntry['level'],
    message: string,
    serverId?: string,
    serverName?: string,
    details?: any
  ): LogEntry {
    const entry: LogEntry = {
      id: uuidv4(),
      timestamp: new Date(),
      level,
      serverId,
      serverName,
      message,
      details
    };

    this.logs.push(entry);
    
    // Keep only the latest maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Notify all listeners
    this.listeners.forEach(listener => listener(entry));

    // Also log to console for debugging
    const prefix = serverId ? `[${serverName || serverId}]` : '[Proxy]';
    const consoleMessage = `${prefix} ${message}`;
    
    switch (level) {
      case 'error':
        console.error(consoleMessage, details || '');
        break;
      case 'warning':
        console.warn(consoleMessage, details || '');
        break;
      case 'info':
        console.log(consoleMessage, details || '');
        break;
      case 'debug':
        console.debug(consoleMessage, details || '');
        break;
    }

    return entry;
  }

  info(message: string, serverId?: string, serverName?: string, details?: any): void {
    this.addLog('info', message, serverId, serverName, details);
  }

  warning(message: string, serverId?: string, serverName?: string, details?: any): void {
    this.addLog('warning', message, serverId, serverName, details);
  }

  error(message: string, serverId?: string, serverName?: string, details?: any): void {
    this.addLog('error', message, serverId, serverName, details);
  }

  debug(message: string, serverId?: string, serverName?: string, details?: any): void {
    this.addLog('debug', message, serverId, serverName, details);
  }

  getLogs(
    filter?: {
      level?: LogEntry['level'];
      serverId?: string;
      since?: Date;
      limit?: number;
    }
  ): LogEntry[] {
    let filtered = [...this.logs];

    if (filter) {
      if (filter.level) {
        filtered = filtered.filter(log => log.level === filter.level);
      }
      if (filter.serverId) {
        filtered = filtered.filter(log => log.serverId === filter.serverId);
      }
      if (filter.since) {
        filtered = filtered.filter(log => log.timestamp >= filter.since!);
      }
      if (filter.limit) {
        filtered = filtered.slice(-filter.limit);
      }
    }

    return filtered;
  }

  clearLogs(serverId?: string): void {
    if (serverId) {
      this.logs = this.logs.filter(log => log.serverId !== serverId);
    } else {
      this.logs = [];
    }
  }

  onLog(listener: (log: LogEntry) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setMaxLogs(max: number): void {
    this.maxLogs = max;
    if (this.logs.length > max) {
      this.logs = this.logs.slice(-max);
    }
  }
}
import { EventEmitter } from 'events';

export interface FirehoseEvent {
  id: string;
  timestamp: Date;
  category: 'mcp' | 'http' | 'websocket' | 'system' | 'debug' | 'log' | 'permission' | 'config';
  type: string;
  source: string;
  target?: string;
  data: any;
  metadata?: {
    size?: number;
    duration?: number;
    status?: string;
    error?: boolean;
    [key: string]: any;
  };
}

export class FirehoseManager extends EventEmitter {
  private events: FirehoseEvent[] = [];
  private maxEvents: number = 10000;
  private enabled: boolean = true;
  private filters: Set<string> = new Set();
  private paused: boolean = false;
  private eventCount: number = 0;
  private startTime: Date = new Date();

  constructor() {
    super();
    this.setMaxListeners(100); // Allow many listeners for the firehose
  }

  captureEvent(
    category: FirehoseEvent['category'],
    type: string,
    source: string,
    data: any,
    target?: string,
    metadata?: FirehoseEvent['metadata']
  ): void {
    if (!this.enabled || this.paused) return;
    if (this.filters.size > 0 && !this.filters.has(category)) return;

    const event: FirehoseEvent = {
      id: `fh-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      category,
      type,
      source,
      target,
      data: this.sanitizeData(data),
      metadata: {
        ...metadata,
        size: JSON.stringify(data).length
      }
    };

    this.events.push(event);
    this.eventCount++;

    // Maintain max events limit
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    // Emit for real-time streaming
    this.emit('event', event);
  }

  // MCP-specific capture methods
  captureMCPRequest(serverId: string, serverName: string, method: string, params: any): void {
    this.captureEvent('mcp', 'request', serverName, { method, params }, serverId, {
      status: 'pending'
    });
  }

  captureMCPResponse(serverId: string, serverName: string, method: string, result: any, duration?: number): void {
    this.captureEvent('mcp', 'response', serverName, { method, result }, serverId, {
      status: 'success',
      duration
    });
  }

  captureMCPError(serverId: string, serverName: string, method: string, error: any): void {
    this.captureEvent('mcp', 'error', serverName, { method, error }, serverId, {
      status: 'error',
      error: true
    });
  }

  // HTTP capture methods
  captureHTTPRequest(method: string, path: string, headers: any, body?: any): void {
    this.captureEvent('http', 'request', `${method} ${path}`, { headers, body }, undefined, {
      status: 'pending'
    });
  }

  captureHTTPResponse(method: string, path: string, status: number, headers: any, body?: any): void {
    this.captureEvent('http', 'response', `${method} ${path}`, { status, headers, body }, undefined, {
      status: status.toString()
    });
  }

  // WebSocket capture methods
  captureWebSocketConnect(clientId: string): void {
    this.captureEvent('websocket', 'connect', clientId, { event: 'connection' });
  }

  captureWebSocketMessage(clientId: string, direction: 'in' | 'out', data: any): void {
    this.captureEvent('websocket', `message-${direction}`, clientId, data);
  }

  captureWebSocketDisconnect(clientId: string, reason?: string): void {
    this.captureEvent('websocket', 'disconnect', clientId, { reason });
  }

  // System events
  captureSystemEvent(type: string, data: any): void {
    this.captureEvent('system', type, 'system', data);
  }

  // Log events
  captureLogEvent(level: string, message: string, serverId?: string, serverName?: string): void {
    this.captureEvent('log', level, serverName || 'system', { message }, serverId);
  }

  // Permission events
  capturePermissionEvent(sessionId: string, action: string, details: any): void {
    this.captureEvent('permission', action, sessionId, details);
  }

  // Config events
  captureConfigEvent(action: string, details: any): void {
    this.captureEvent('config', action, 'config', details);
  }

  private sanitizeData(data: any): any {
    try {
      const str = JSON.stringify(data);
      // Redact sensitive information
      return JSON.parse(str.replace(/(api[_-]?key|token|password|secret|auth|credentials)["']?\s*[:=]\s*["']([^"']+)["']/gi, 
        '$1":"[REDACTED]"'));
    } catch {
      return data;
    }
  }

  // Control methods
  enable(): void {
    this.enabled = true;
    this.captureSystemEvent('firehose-enabled', { timestamp: new Date() });
  }

  disable(): void {
    this.enabled = false;
    this.captureSystemEvent('firehose-disabled', { timestamp: new Date() });
  }

  pause(): void {
    this.paused = true;
    this.captureSystemEvent('firehose-paused', { timestamp: new Date() });
  }

  resume(): void {
    this.paused = false;
    this.captureSystemEvent('firehose-resumed', { timestamp: new Date() });
  }

  clear(): void {
    const count = this.events.length;
    this.events = [];
    this.captureSystemEvent('firehose-cleared', { eventsCleared: count });
  }

  setFilter(categories: string[]): void {
    this.filters = new Set(categories);
    this.captureSystemEvent('firehose-filter-set', { filters: categories });
  }

  clearFilter(): void {
    this.filters.clear();
    this.captureSystemEvent('firehose-filter-cleared', {});
  }

  // Query methods
  getEvents(limit?: number, category?: string): FirehoseEvent[] {
    let events = [...this.events];
    
    if (category) {
      events = events.filter(e => e.category === category);
    }
    
    if (limit) {
      events = events.slice(-limit);
    }
    
    return events;
  }

  getStats(): any {
    const categoryCounts: Record<string, number> = {};
    const typeCounts: Record<string, number> = {};
    let totalSize = 0;
    let errorCount = 0;

    for (const event of this.events) {
      categoryCounts[event.category] = (categoryCounts[event.category] || 0) + 1;
      typeCounts[`${event.category}:${event.type}`] = (typeCounts[`${event.category}:${event.type}`] || 0) + 1;
      totalSize += event.metadata?.size || 0;
      if (event.metadata?.error) errorCount++;
    }

    const runtime = Date.now() - this.startTime.getTime();
    const eventsPerSecond = this.eventCount / (runtime / 1000);

    return {
      enabled: this.enabled,
      paused: this.paused,
      totalEvents: this.eventCount,
      currentEvents: this.events.length,
      maxEvents: this.maxEvents,
      categoryCounts,
      typeCounts,
      totalSize,
      errorCount,
      eventsPerSecond: Math.round(eventsPerSecond * 100) / 100,
      runtime: Math.round(runtime / 1000),
      startTime: this.startTime.toISOString(),
      filters: Array.from(this.filters)
    };
  }

  // Export functionality
  export(): string {
    return JSON.stringify({
      metadata: {
        exported: new Date().toISOString(),
        stats: this.getStats()
      },
      events: this.events
    }, null, 2);
  }

  // Stream functionality for SSE
  streamToClient(res: any): void {
    const sendEvent = (event: FirehoseEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    // Send current stats
    res.write(`data: ${JSON.stringify({ type: 'stats', data: this.getStats() })}\n\n`);

    // Listen for new events
    this.on('event', sendEvent);

    // Clean up on disconnect
    res.on('close', () => {
      this.removeListener('event', sendEvent);
    });
  }
}
import express, { Express } from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { Server as HTTPServer } from 'http';
import { ServerManager } from './server-manager.js';
import { PermissionManager } from './permission-manager.js';
import { LogManager } from './log-manager.js';
import { DebugManager } from './debug-manager.js';
import { FirehoseManager } from './firehose-manager.js';
import { ProxyServer } from './proxy-server.js';
import { SSEMcpHandler } from './sse-mcp-handler.js';
import { StreamableHttpHandler } from './streamable-http-handler.js';
import { ToolPermission, LogEntry } from './types.js';

export class WebServer {
  private app: Express;
  private httpServer: HTTPServer;
  private wss: WebSocketServer;
  private serverManager: ServerManager;
  private permissionManager: PermissionManager;
  private logManager: LogManager;
  private debugManager: DebugManager;
  private firehoseManager: FirehoseManager;
  private proxyServer: ProxyServer | null = null;
  private sseMcpHandler: SSEMcpHandler;
  private streamableHttpHandler: StreamableHttpHandler;
  private port: number;

  constructor(
    port: number,
    serverManager: ServerManager,
    permissionManager: PermissionManager,
    logManager: LogManager,
    debugManager: DebugManager,
    firehoseManager: FirehoseManager,
    proxyServer?: ProxyServer
  ) {
    this.port = port;
    this.serverManager = serverManager;
    this.permissionManager = permissionManager;
    this.logManager = logManager;
    this.debugManager = debugManager;
    this.firehoseManager = firehoseManager;
    this.proxyServer = proxyServer || null;
    this.sseMcpHandler = new SSEMcpHandler(serverManager, permissionManager, logManager);
    this.streamableHttpHandler = new StreamableHttpHandler(serverManager, permissionManager, logManager);
    this.app = express();
    this.httpServer = this.app.listen(port);
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    
    // Capture all HTTP requests to firehose
    this.app.use((req, res, next) => {
      this.firehoseManager.captureHTTPRequest(req.method, req.path, req.headers, req.body);
      
      // Capture response
      const originalSend = res.send;
      res.send = function(data: any) {
        res.send = originalSend;
        res.send(data);
        firehoseManager.captureHTTPResponse(req.method, req.path, res.statusCode, res.getHeaders(), data);
        return res;
      }.bind(res);
      
      const firehoseManager = this.firehoseManager;
      next();
    });
    
    this.app.use(express.json());
    this.app.use(express.static('public'));
  }

  private setupRoutes(): void {
    // MCP Protocol endpoints
    this.app.get('/mcp', (req, res) => this.sseMcpHandler.handleSSE(req, res));
    this.app.post('/mcp', (req, res) => this.sseMcpHandler.handleRequest(req, res));
    
    // Admin API endpoints
    this.app.get('/api/servers', (req, res) => {
      const servers = this.serverManager.getAllServers();
      res.json(servers.map(s => ({
        id: s.id,
        name: s.config.name,
        status: s.status,
        error: s.error,
        tools: Array.from(s.tools.entries()).map(([name, tool]) => ({
          name,
          description: tool.description,
          inputSchema: tool.inputSchema
        })),
        resources: s.resources ? Array.from(s.resources.entries()).map(([uri, resource]) => ({
          uri,
          name: resource.name,
          description: resource.description,
          mimeType: resource.mimeType
        })) : [],
        prompts: s.prompts ? Array.from(s.prompts.entries()).map(([name, prompt]) => ({
          name,
          description: prompt.description,
          arguments: prompt.arguments
        })) : []
      })));
    });

    this.app.get('/api/sessions', (req, res) => {
      const sessions = this.permissionManager.getAllSessions();
      res.json(sessions.map(s => ({
        id: s.id,
        connectedAt: s.connectedAt,
        permissions: Array.from(s.permissions.entries()).map(([key, perm]) => ({
          key,
          ...perm
        }))
      })));
    });

    this.app.get('/api/sessions/:sessionId/permissions', (req, res) => {
      const permissions = this.permissionManager.getSessionPermissions(req.params.sessionId);
      if (!permissions) {
        return res.status(404).json({ error: 'Session not found' });
      }

      res.json(Array.from(permissions.entries()).map(([key, perm]) => ({
        key,
        ...perm
      })));
    });

    this.app.post('/api/sessions/:sessionId/permissions', (req, res) => {
      const { permissions } = req.body as { permissions: ToolPermission[] };
      this.permissionManager.bulkUpdatePermissions(req.params.sessionId, permissions);
      res.json({ success: true });
    });

    this.app.post('/api/sessions/:sessionId/permissions/:serverId/:toolName', (req, res) => {
      const { sessionId, serverId, toolName } = req.params;
      const permission = req.body as ToolPermission;
      
      this.permissionManager.setSessionToolPermission(
        sessionId,
        serverId,
        toolName,
        permission
      );
      
      res.json({ success: true });
    });

    this.app.post('/api/servers/:serverId/restart', async (req, res) => {
      const { serverId } = req.params;
      const server = this.serverManager.getServer(serverId);
      
      if (!server) {
        return res.status(404).json({ error: 'Server not found' });
      }

      try {
        await this.serverManager.stopServer(serverId);
        await this.serverManager.startServer(server.config);
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.delete('/api/servers/:serverId', async (req, res) => {
      const { serverId } = req.params;
      
      try {
        await this.serverManager.stopServer(serverId);
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Config reload endpoint
    this.app.post('/api/config/reload', async (req, res) => {
      try {
        if (this.proxyServer) {
          await this.proxyServer.triggerConfigReload();
          res.json({ success: true, message: 'Configuration reloaded successfully' });
        } else {
          res.status(500).json({ error: 'ProxyServer not available' });
        }
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Log endpoints
    this.app.get('/api/logs', (req, res) => {
      const { level, serverId, limit } = req.query;
      const logs = this.logManager.getLogs({
        level: level as LogEntry['level'],
        serverId: serverId as string,
        limit: limit ? parseInt(limit as string) : 100
      });
      res.json(logs);
    });

    this.app.delete('/api/logs', (req, res) => {
      const { serverId } = req.query;
      this.logManager.clearLogs(serverId as string);
      res.json({ success: true });
    });

    this.app.get('/api/logs/stream', (req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      const sendLog = (log: LogEntry) => {
        res.write(`data: ${JSON.stringify(log)}\n\n`);
      };

      const unsubscribe = this.logManager.onLog(sendLog);

      req.on('close', () => {
        unsubscribe();
      });
    });

    // Debug API endpoints
    this.app.get('/api/debug/status', (req, res) => {
      res.json({
        enabled: this.debugManager.isDebugEnabled(),
        stats: this.debugManager.getStats()
      });
    });

    this.app.post('/api/debug/enable', (req, res) => {
      this.debugManager.enableDebugging();
      res.json({ success: true, enabled: true });
    });

    this.app.post('/api/debug/disable', (req, res) => {
      this.debugManager.disableDebugging();
      res.json({ success: true, enabled: false });
    });

    this.app.get('/api/debug/messages', (req, res) => {
      const { serverId } = req.query;
      const messages = this.debugManager.getMessages(serverId as string);
      res.json(messages);
    });

    this.app.delete('/api/debug/messages', (req, res) => {
      const { serverId } = req.query;
      this.debugManager.clearMessages(serverId as string);
      res.json({ success: true });
    });

    this.app.get('/api/debug/sessions', (req, res) => {
      const sessions = this.debugManager.getAllSessions();
      res.json(sessions);
    });

    this.app.get('/api/debug/sessions/:sessionId', (req, res) => {
      const session = this.debugManager.getSession(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      res.json(session);
    });

    this.app.get('/api/debug/export', (req, res) => {
      const { sessionId } = req.query;
      let exportData: string;
      
      if (sessionId) {
        try {
          exportData = this.debugManager.exportSession(sessionId as string);
        } catch (error: any) {
          return res.status(404).json({ error: error.message });
        }
      } else {
        exportData = this.debugManager.exportAllMessages();
      }
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="mcp-debug-${Date.now()}.json"`);
      res.send(exportData);
    });

    this.app.get('/api/debug/stream', (req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      const sendMessage = (message: any) => {
        res.write(`data: ${JSON.stringify(message)}\n\n`);
      };

      this.debugManager.on('message', sendMessage);

      req.on('close', () => {
        this.debugManager.removeListener('message', sendMessage);
      });
    });

    // Firehose API endpoints
    this.app.get('/api/firehose/status', (req, res) => {
      res.json(this.firehoseManager.getStats());
    });

    this.app.post('/api/firehose/enable', (req, res) => {
      this.firehoseManager.enable();
      res.json({ success: true });
    });

    this.app.post('/api/firehose/disable', (req, res) => {
      this.firehoseManager.disable();
      res.json({ success: true });
    });

    this.app.post('/api/firehose/pause', (req, res) => {
      this.firehoseManager.pause();
      res.json({ success: true });
    });

    this.app.post('/api/firehose/resume', (req, res) => {
      this.firehoseManager.resume();
      res.json({ success: true });
    });

    this.app.delete('/api/firehose/clear', (req, res) => {
      this.firehoseManager.clear();
      res.json({ success: true });
    });

    this.app.post('/api/firehose/filter', (req, res) => {
      const { categories } = req.body;
      this.firehoseManager.setFilter(categories || []);
      res.json({ success: true });
    });

    this.app.get('/api/firehose/events', (req, res) => {
      const { limit, category } = req.query;
      const events = this.firehoseManager.getEvents(
        limit ? parseInt(limit as string) : undefined,
        category as string
      );
      res.json(events);
    });

    this.app.get('/api/firehose/export', (req, res) => {
      const exportData = this.firehoseManager.export();
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="firehose-${Date.now()}.json"`);
      res.send(exportData);
    });

    this.app.get('/api/firehose/stream', (req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      });

      // Send heartbeat immediately
      res.write(':heartbeat\n\n');

      // Set up heartbeat
      const heartbeat = setInterval(() => {
        res.write(':heartbeat\n\n');
      }, 30000);

      this.firehoseManager.streamToClient(res);

      req.on('close', () => {
        clearInterval(heartbeat);
      });
    });
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      console.log('WebSocket client connected');
      this.firehoseManager.captureWebSocketConnect(clientId);

      const interval = setInterval(() => {
        const servers = this.serverManager.getAllServers();
        ws.send(JSON.stringify({
          type: 'status',
          servers: servers.map(s => ({
            id: s.id,
            name: s.config.name,
            status: s.status,
            error: s.error
          }))
        }));
      }, 2000);

      // Send new logs to WebSocket clients
      const sendLog = (log: LogEntry) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'log',
            log
          }));
        }
      };

      // Send firehose events to WebSocket clients
      const sendFirehoseEvent = (event: any) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'firehose',
            event
          }));
          this.firehoseManager.captureWebSocketMessage(clientId, 'out', event);
        }
      };

      // Send firehose stats periodically
      const statsInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'firehose-stats',
            stats: this.firehoseManager.getStats()
          }));
        }
      }, 1000);

      const unsubscribe = this.logManager.onLog(sendLog);
      this.firehoseManager.on('event', sendFirehoseEvent);

      ws.on('message', (data) => {
        this.firehoseManager.captureWebSocketMessage(clientId, 'in', data.toString());
      });

      ws.on('close', () => {
        console.log('WebSocket client disconnected');
        this.firehoseManager.captureWebSocketDisconnect(clientId);
        clearInterval(interval);
        clearInterval(statsInterval);
        unsubscribe();
        this.firehoseManager.removeListener('event', sendFirehoseEvent);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.firehoseManager.captureWebSocketDisconnect(clientId, error.message);
        clearInterval(interval);
        clearInterval(statsInterval);
        unsubscribe();
        this.firehoseManager.removeListener('event', sendFirehoseEvent);
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.wss.close(() => {
        this.httpServer.close(() => {
          resolve();
        });
      });
    });
  }

  getPort(): number {
    return this.port;
  }
}
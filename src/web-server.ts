import express, { Express } from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { Server as HTTPServer } from 'http';
import { ServerManager } from './server-manager.js';
import { PermissionManager } from './permission-manager.js';
import { LogManager } from './log-manager.js';
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
  private proxyServer: ProxyServer | null = null;
  private sseMcpHandler: SSEMcpHandler;
  private streamableHttpHandler: StreamableHttpHandler;
  private port: number;

  constructor(
    port: number,
    serverManager: ServerManager,
    permissionManager: PermissionManager,
    logManager: LogManager,
    proxyServer?: ProxyServer
  ) {
    this.port = port;
    this.serverManager = serverManager;
    this.permissionManager = permissionManager;
    this.logManager = logManager;
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
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('WebSocket client connected');

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

      const unsubscribe = this.logManager.onLog(sendLog);

      ws.on('close', () => {
        console.log('WebSocket client disconnected');
        clearInterval(interval);
        unsubscribe();
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        clearInterval(interval);
        unsubscribe();
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
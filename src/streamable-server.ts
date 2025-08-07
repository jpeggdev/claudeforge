import express, { Express } from 'express';
import cors from 'cors';
import { Server as HTTPServer } from 'http';
import { ServerManager } from './server-manager.js';
import { PermissionManager } from './permission-manager.js';
import { LogManager } from './log-manager.js';
import { StreamableHttpHandler } from './streamable-http-handler.js';

/**
 * Streamable HTTP Server for MCP Protocol
 * This server implements the Streamable HTTP transport as specified in the MCP spec
 * It listens on a separate port (default 3000) dedicated to MCP protocol communication
 */
export class StreamableServer {
  private app: Express;
  private httpServer: HTTPServer;
  private streamableHttpHandler: StreamableHttpHandler;
  private port: number;

  constructor(
    port: number,
    serverManager: ServerManager,
    permissionManager: PermissionManager,
    logManager: LogManager
  ) {
    this.port = port;
    this.streamableHttpHandler = new StreamableHttpHandler(serverManager, permissionManager, logManager);
    this.app = express();
    
    this.setupMiddleware();
    this.setupRoutes();
    
    // Start the server
    this.httpServer = this.app.listen(port);
    logManager.info(`Streamable HTTP server started on port ${port}`, 'streamable-server');
  }

  private setupMiddleware(): void {
    // CORS for browser-based clients
    this.app.use(cors({
      origin: '*',
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-Session-Id', 'Accept'],
      exposedHeaders: ['X-Session-Id']
    }));
    
    // JSON body parser
    this.app.use(express.json());
  }

  private setupRoutes(): void {
    // Root endpoint for Streamable HTTP protocol
    // GET / - establishes SSE connection
    this.app.get('/', (req, res) => {
      this.streamableHttpHandler.handleSSE(req, res);
    });
    
    // POST / - handles JSON-RPC messages
    this.app.post('/', (req, res) => {
      this.streamableHttpHandler.handleRequest(req, res);
    });
    
    // Alternative endpoint at /mcp for compatibility
    this.app.get('/mcp', (req, res) => {
      this.streamableHttpHandler.handleSSE(req, res);
    });
    
    this.app.post('/mcp', (req, res) => {
      this.streamableHttpHandler.handleRequest(req, res);
    });
    
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        protocol: 'streamable-http',
        version: '2024-11-05'
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer.close(() => {
        resolve();
      });
    });
  }
}
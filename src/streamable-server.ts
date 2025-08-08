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
  private httpServer: HTTPServer | null = null;
  private streamableHttpHandler: StreamableHttpHandler;
  private port: number;
  private logManager: LogManager;

  constructor(
    port: number,
    serverManager: ServerManager,
    permissionManager: PermissionManager,
    logManager: LogManager
  ) {
    this.port = port;
    this.logManager = logManager;
    this.streamableHttpHandler = new StreamableHttpHandler(serverManager, permissionManager, logManager);
    this.app = express();
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.httpServer = this.app.listen(this.port);
        
        this.httpServer.on('listening', () => {
          this.logManager.info(`Streamable HTTP server started on port ${this.port}`, 'streamable-server');
          resolve();
        });
        
        this.httpServer.on('error', (error: any) => {
          if (error.code === 'EADDRINUSE') {
            this.logManager.error(`Port ${this.port} is already in use`, 'streamable-server');
          } else if (error.code === 'EACCES') {
            this.logManager.error(`Permission denied to bind to port ${this.port}`, 'streamable-server');
          } else {
            this.logManager.error(`Failed to start server on port ${this.port}`, 'streamable-server', undefined, error);
          }
          reject(error);
        });
      } catch (error) {
        this.logManager.error('Failed to create HTTP server', 'streamable-server', undefined, error);
        reject(error);
      }
    });
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
      if (this.httpServer) {
        this.httpServer.close(() => {
          this.logManager.info('Streamable HTTP server stopped', 'streamable-server');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
  
  isListening(): boolean {
    return this.httpServer !== null && this.httpServer.listening;
  }
  
  getPort(): number {
    return this.port;
  }
}
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import net from 'net';
import { EventEmitter } from 'events';
import { LogManager } from '../log-manager.js';
import { ContainerizedServer } from '../docker-manager.js';

/**
 * Docker transport that connects to containerized MCP servers via TCP
 * This converts stdio-based servers to TCP connections
 */
export class DockerTransport extends EventEmitter implements Transport {
  private socket: net.Socket | null = null;
  private buffer: string = '';
  private isClosed = false;
  private logManager: LogManager;
  private containerInfo: ContainerizedServer;
  private connectionAttempts = 0;
  private maxConnectionAttempts = 10;
  private connectionDelay = 1000; // Start with 1 second delay

  constructor(containerInfo: ContainerizedServer, logManager: LogManager) {
    super();
    this.containerInfo = containerInfo;
    this.logManager = logManager;
  }

  async start(): Promise<void> {
    if (this.isClosed) {
      throw new Error('Transport is closed');
    }

    // Find the exposed port for the container
    const portMapping = this.containerInfo.ports.find(p => p.container === 5000);
    if (!portMapping) {
      throw new Error(`No port mapping found for container ${this.containerInfo.id}`);
    }

    await this.connectWithRetry(portMapping.host);
  }

  private async connectWithRetry(port: number): Promise<void> {
    while (this.connectionAttempts < this.maxConnectionAttempts && !this.isClosed) {
      try {
        await this.connect(port);
        this.logManager.info(`Connected to Docker container on port ${port}`, 'docker-transport');
        return;
      } catch (error: any) {
        this.connectionAttempts++;
        this.logManager.warning(
          `Connection attempt ${this.connectionAttempts}/${this.maxConnectionAttempts} failed: ${error.message}`,
          'docker-transport'
        );
        
        if (this.connectionAttempts >= this.maxConnectionAttempts) {
          throw new Error(`Failed to connect after ${this.maxConnectionAttempts} attempts`);
        }
        
        // Exponential backoff with jitter
        const jitter = Math.random() * 500;
        const delay = Math.min(this.connectionDelay * Math.pow(1.5, this.connectionAttempts - 1) + jitter, 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  private connect(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();
      
      const onConnect = () => {
        this.socket!.removeListener('error', onError);
        this.setupSocketHandlers();
        resolve();
      };
      
      const onError = (err: Error) => {
        this.socket!.removeListener('connect', onConnect);
        reject(err);
      };
      
      this.socket.once('connect', onConnect);
      this.socket.once('error', onError);
      
      this.socket.connect(port, 'localhost');
    });
  }

  private setupSocketHandlers(): void {
    if (!this.socket) return;

    this.socket.on('data', (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.socket.on('error', (error: Error) => {
      this.logManager.error('Docker transport socket error', 'docker-transport', undefined, error);
      this.emit('error', error);
    });

    this.socket.on('close', () => {
      this.logManager.info('Docker transport socket closed', 'docker-transport');
      if (!this.isClosed) {
        this.close();
      }
    });
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    
    // Keep the last incomplete line in the buffer
    this.buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line) as JSONRPCMessage;
          this.emit('message', message);
        } catch (error: any) {
          this.logManager.error(`Failed to parse message: ${line}`, 'docker-transport', undefined, error);
        }
      }
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.isClosed || !this.socket) {
      throw new Error('Transport is not connected');
    }

    const data = JSON.stringify(message) + '\n';
    
    return new Promise((resolve, reject) => {
      this.socket!.write(data, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async close(): Promise<void> {
    if (this.isClosed) return;
    
    this.isClosed = true;
    
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    
    this.emit('close');
  }
}
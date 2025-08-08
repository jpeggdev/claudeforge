import { DebugManager } from './debug-manager.js';

export class DebugTransportWrapper {
  private originalTransport: any;
  private debugManager: DebugManager;
  private serverId: string;
  private serverName: string;
  private transportType: string;

  constructor(
    transport: any,
    debugManager: DebugManager,
    serverId: string,
    serverName: string,
    transportType: string
  ) {
    this.originalTransport = transport;
    this.debugManager = debugManager;
    this.serverId = serverId;
    this.serverName = serverName;
    this.transportType = transportType;
    
    this.wrapTransport();
  }

  private wrapTransport(): void {
    const originalSend = this.originalTransport.send?.bind(this.originalTransport);
    let originalOnMessage = this.originalTransport.onmessage;
    
    // Wrap the send method to intercept outgoing messages
    if (originalSend) {
      this.originalTransport.send = (message: any) => {
        this.debugManager.interceptMessage(
          this.serverId,
          this.serverName,
          this.transportType,
          'client-to-server',
          message
        );
        return originalSend(message);
      };
    }

    // Wrap the onmessage handler to intercept incoming messages
    Object.defineProperty(this.originalTransport, 'onmessage', {
      get: () => originalOnMessage,
      set: (handler: any) => {
        const wrappedHandler = (message: any) => {
          this.debugManager.interceptMessage(
            this.serverId,
            this.serverName,
            this.transportType,
            'server-to-client',
            message
          );
          if (handler) {
            handler(message);
          }
        };
        originalOnMessage = wrappedHandler;
      }
    });
  }

  getTransport(): any {
    return this.originalTransport;
  }
}
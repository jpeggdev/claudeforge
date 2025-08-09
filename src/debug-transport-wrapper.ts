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
    
    // Wrap the send method to intercept outgoing messages
    if (originalSend) {
      this.originalTransport.send = async (message: any) => {
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

    // Store original onmessage setter if it exists
    const originalDescriptor = Object.getOwnPropertyDescriptor(this.originalTransport, 'onmessage');
    let currentHandler: any = null;
    
    // Wrap the onmessage handler to intercept incoming messages
    Object.defineProperty(this.originalTransport, 'onmessage', {
      configurable: true,
      enumerable: true,
      get: () => currentHandler,
      set: (handler: any) => {
        currentHandler = (message: any) => {
          this.debugManager.interceptMessage(
            this.serverId,
            this.serverName,
            this.transportType,
            'server-to-client',
            message
          );
          if (handler) {
            return handler(message);
          }
        };
        
        // If there was an original setter, call it with the wrapped handler
        if (originalDescriptor && originalDescriptor.set) {
          originalDescriptor.set.call(this.originalTransport, currentHandler);
        } else {
          // Otherwise just assign it directly
          this.originalTransport._onmessage = currentHandler;
        }
      }
    });
  }

  getTransport(): any {
    return this.originalTransport;
  }
}
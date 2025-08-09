import { ChildProcess } from 'child_process';
import { LogManager } from './log-manager.js';

interface JSONRPCRequest {
  jsonrpc: string;
  method: string;
  params: {
    name: string;
    arguments: any;
  };
  id: string;
}

interface JSONRPCResponse {
  jsonrpc: string;
  id: string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export class StdioToolHandler {
  private pendingRequests: Map<string, {
    resolve: (result: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  private requestIdCounter = 0;
  private logManager: LogManager;
  private responseBuffer = '';

  constructor(logManager: LogManager) {
    this.logManager = logManager;
  }

  setupProcess(process: ChildProcess, serverId: string, serverName: string): void {
    if (!process.stdout) {
      throw new Error('Process stdout is not available');
    }

    // Handle stdout data for responses
    process.stdout.on('data', (data: Buffer) => {
      this.handleStdoutData(data, serverId, serverName);
    });

    // Handle process errors
    process.on('error', (error) => {
      this.logManager.error(`Stdio process error: ${error.message}`, serverId, serverName, error);
      this.rejectAllPending(new Error(`Process error: ${error.message}`));
    });

    process.on('exit', (code, signal) => {
      this.logManager.info(`Stdio process exited with code ${code}, signal ${signal}`, serverId, serverName);
      this.rejectAllPending(new Error(`Process exited unexpectedly`));
    });
  }

  private handleStdoutData(data: Buffer, serverId: string, serverName: string): void {
    this.responseBuffer += data.toString();
    
    // Process complete lines
    const lines = this.responseBuffer.split('\n');
    this.responseBuffer = lines.pop() || ''; // Keep incomplete line in buffer
    
    for (const line of lines) {
      if (line.trim()) {
        try {
          const response: JSONRPCResponse = JSON.parse(line.trim());
          this.handleResponse(response, serverId, serverName);
        } catch (error) {
          this.logManager.error(`Failed to parse JSON response: ${line}`, serverId, serverName, error);
        }
      }
    }
  }

  private handleResponse(response: JSONRPCResponse, serverId: string, serverName: string): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      this.logManager.warning(`Received response for unknown request ID: ${response.id}`, serverId, serverName);
      return;
    }

    // Clear timeout and remove from pending
    clearTimeout(pending.timeout);
    this.pendingRequests.delete(response.id);

    if (response.error) {
      const error = new Error(response.error.message);
      (error as any).code = response.error.code;
      (error as any).data = response.error.data;
      pending.reject(error);
    } else {
      pending.resolve(response.result);
    }
  }

  async callTool(
    process: ChildProcess,
    toolName: string,
    args: any,
    serverId: string,
    serverName: string,
    timeoutMs = 30000
  ): Promise<any> {
    if (!process.stdin) {
      throw new Error('Process stdin is not available');
    }

    const requestId = `${serverId}-${++this.requestIdCounter}`;
    
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      },
      id: requestId
    };

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Stdio tool call timeout after ${timeoutMs / 1000} seconds`));
      }, timeoutMs);

      // Store pending request
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout
      });

      try {
        // Send request
        const requestLine = JSON.stringify(request) + '\n';
        this.logManager.debug(`Sending stdio request: ${requestLine.trim()}`, serverId, serverName);
        
        process.stdin!.write(requestLine, 'utf8', (error) => {
          if (error) {
            clearTimeout(timeout);
            this.pendingRequests.delete(requestId);
            reject(new Error(`Failed to write request: ${error.message}`));
          }
        });
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        reject(error);
      }
    });
  }

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  cleanup(): void {
    this.rejectAllPending(new Error('Handler cleanup'));
  }
}
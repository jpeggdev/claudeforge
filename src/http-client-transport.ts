import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import fetch from 'node-fetch';

/**
 * HTTP client transport for MCP servers that use simple HTTP POST requests
 * (like streamable-mcp-server)
 */
export class HttpClientTransport implements Transport {
  private url: URL;
  private closed = false;
  private customHeaders: Record<string, string>;
  sessionId: string | undefined = undefined;
  
  // Transport interface properties
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(url: URL, customHeaders?: Record<string, string>) {
    this.url = url;
    this.customHeaders = customHeaders || {};
  }

  async start(): Promise<void> {
    // HTTP transport doesn't need to maintain a persistent connection
    // But we should verify the endpoint is reachable
    try {
      // Test with a simple ping or OPTIONS request
      const response = await fetch(this.url.toString(), {
        method: 'OPTIONS',
        headers: {
          'Accept': 'application/json, text/event-stream',
          ...this.customHeaders,
        },
      });
      
      // Some servers might not support OPTIONS, so we don't fail on non-200
      // The important thing is that the server is reachable
    } catch (error) {
      // Even if OPTIONS fails, we don't throw here
      // The actual requests might still work
      console.log(`HttpClientTransport: OPTIONS request failed (this is often normal): ${error}`);
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.closed) {
      throw new Error('Transport is closed');
    }

    try {
      // Send the JSON-RPC message as a POST request
      const headers: any = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        ...this.customHeaders,
      };
      
      // Include session ID if we have one
      if (this.sessionId) {
        headers['mcp-session-id'] = this.sessionId;
      }
      
      const response = await fetch(this.url.toString(), {
        method: 'POST',
        headers,
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      // Capture session ID from response headers if present
      const sessionIdHeader = response.headers.get('mcp-session-id');
      if (sessionIdHeader && !this.sessionId) {
        this.sessionId = sessionIdHeader;
        console.log(`HttpClientTransport: Captured session ID: ${this.sessionId}`);
      }

      const responseText = await response.text();
      
      // Skip empty responses (like 202 Accepted for notifications)
      if (!responseText || responseText.trim() === '') {
        // For notifications (no id in message), this is expected
        if (!('id' in message)) {
          return; // Notifications don't expect a response
        }
        // For requests, empty response is unexpected
        throw new Error('Empty response for request');
      }
      
      // Check if response is SSE format
      let responseData: JSONRPCMessage;
      if (responseText.startsWith('event:')) {
        // Parse SSE format: extract data after "data: " line
        const lines = responseText.split('\n');
        const dataLine = lines.find(line => line.startsWith('data: '));
        if (dataLine) {
          const jsonStr = dataLine.substring(6); // Remove "data: " prefix
          responseData = JSON.parse(jsonStr) as JSONRPCMessage;
        } else {
          throw new Error('Invalid SSE response format');
        }
      } else {
        // Regular JSON response
        responseData = JSON.parse(responseText) as JSONRPCMessage;
      }
      
      // Notify message handler with the response
      if (this.onmessage) {
        this.onmessage(responseData);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (this.onerror) {
        this.onerror(err);
      }
      throw err;
    }
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    
    this.closed = true;
    
    // Notify close handler
    if (this.onclose) {
      this.onclose();
    }
  }
}
#!/usr/bin/env node

/**
 * MCP SSE Client Wrapper for Claude Code
 * This script acts as a stdio bridge to an SSE-based MCP server
 */

const http = require('http');
const readline = require('readline');

const MCP_URL = process.env.MCP_PROXY_URL || 'http://localhost:8080/mcp';

// Parse URL
const url = new URL(MCP_URL);

// Setup readline for stdio communication
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

let sseConnection = null;
let requestId = 0;

// Connect to SSE endpoint
function connectSSE() {
  const options = {
    hostname: url.hostname,
    port: url.port,
    path: url.pathname,
    method: 'GET',
    headers: {
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  };

  const req = http.request(options, (res) => {
    if (res.statusCode !== 200) {
      console.error(`SSE connection failed with status ${res.statusCode}`);
      process.exit(1);
    }

    res.setEncoding('utf8');
    
    let buffer = '';
    
    res.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data.trim()) {
            try {
              const parsed = JSON.parse(data);
              // Send to stdout for Claude Code
              console.log(JSON.stringify(parsed));
            } catch (e) {
              // Not JSON, skip
            }
          }
        }
      }
    });
    
    res.on('end', () => {
      console.error('SSE connection closed');
      process.exit(1);
    });
  });
  
  req.on('error', (e) => {
    console.error(`SSE connection error: ${e.message}`);
    process.exit(1);
  });
  
  req.end();
  sseConnection = req;
}

// Send request to server
function sendRequest(data) {
  const postData = JSON.stringify(data);
  
  const options = {
    hostname: url.hostname,
    port: url.port,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };
  
  const req = http.request(options, (res) => {
    res.setEncoding('utf8');
    let responseBody = '';
    
    res.on('data', (chunk) => {
      responseBody += chunk;
    });
    
    res.on('end', () => {
      if (res.statusCode === 200 && responseBody) {
        try {
          const response = JSON.parse(responseBody);
          console.log(JSON.stringify(response));
        } catch (e) {
          // Not JSON response
        }
      }
    });
  });
  
  req.on('error', (e) => {
    console.error(`Request error: ${e.message}`);
  });
  
  req.write(postData);
  req.end();
}

// Handle input from Claude Code
rl.on('line', (line) => {
  try {
    const data = JSON.parse(line);
    sendRequest(data);
  } catch (e) {
    console.error(`Invalid JSON input: ${e.message}`);
  }
});

// Handle shutdown
process.on('SIGINT', () => {
  if (sseConnection) {
    sseConnection.destroy();
  }
  rl.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  if (sseConnection) {
    sseConnection.destroy();
  }
  rl.close();
  process.exit(0);
});

// Start SSE connection
connectSSE();
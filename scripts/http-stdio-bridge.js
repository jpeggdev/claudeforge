#!/usr/bin/env node

/**
 * HTTP to STDIO Bridge for MCP Proxy
 * This bridges HTTP-based MCP proxy to stdio for Claude Code
 */

const http = require('http');
const readline = require('readline');

const PROXY_URL = process.env.MCP_PROXY_URL || 'http://localhost:3000/mcp';

// Parse URL
const url = new URL(PROXY_URL);

// Create readline interface for stdio
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// Handle incoming messages from Claude Code
rl.on('line', async (line) => {
  try {
    const request = JSON.parse(line);
    
    // Send request to HTTP proxy
    const postData = JSON.stringify(request);
    
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = http.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        try {
          // Send response back to Claude Code
          if (body) {
            const response = JSON.parse(body);
            console.log(JSON.stringify(response));
          }
        } catch (e) {
          // Send error response
          console.log(JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal error: ' + e.message
            },
            id: request.id
          }));
        }
      });
    });
    
    req.on('error', (e) => {
      // Send error response
      console.log(JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'HTTP request failed: ' + e.message
        },
        id: request.id
      }));
    });
    
    req.write(postData);
    req.end();
    
  } catch (e) {
    // Invalid JSON input
    console.log(JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32700,
        message: 'Parse error: ' + e.message
      },
      id: null
    }));
  }
});

// Handle shutdown gracefully
process.on('SIGINT', () => {
  rl.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  rl.close();
  process.exit(0);
});

// Log startup (only if DEBUG is set)
if (process.env.DEBUG) {
  process.stderr.write('HTTP-STDIO Bridge started for ' + PROXY_URL + '\n');
}
#!/usr/bin/env node

const http = require('http');

console.log('Testing Chrome MCP detailed flow...\n');

let sessionId = null;

// Step 1: Send initialize
function sendInitialize() {
  return new Promise((resolve, reject) => {
    const message = {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '1.0.0'
        }
      },
      id: 1
    };
    
    const data = JSON.stringify(message);
    
    const options = {
      hostname: '127.0.0.1',
      port: 12306,
      path: '/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Content-Length': Buffer.byteLength(data),
        ...(sessionId ? { 'mcp-session-id': sessionId } : {})
      }
    };

    console.log('Sending initialize request...');
    const req = http.request(options, (res) => {
      console.log(`Response status: ${res.statusCode}`);
      console.log(`Response headers:`, res.headers);
      
      // Capture session ID
      if (res.headers['mcp-session-id']) {
        sessionId = res.headers['mcp-session-id'];
        console.log(`Captured session ID: ${sessionId}`);
      }
      
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
        console.log(`Received chunk: ${chunk}`);
      });
      
      res.on('end', () => {
        console.log(`Full response: ${responseData}\n`);
        resolve(responseData);
      });
    });

    req.on('error', (e) => {
      console.error(`Request error: ${e}`);
      reject(e);
    });
    
    req.write(data);
    req.end();
  });
}

// Step 2: Send notifications/initialized
function sendInitialized() {
  return new Promise((resolve, reject) => {
    const message = {
      jsonrpc: '2.0',
      method: 'notifications/initialized'
      // No id for notifications
    };
    
    const data = JSON.stringify(message);
    
    const options = {
      hostname: '127.0.0.1',
      port: 12306,
      path: '/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Content-Length': Buffer.byteLength(data),
        ...(sessionId ? { 'mcp-session-id': sessionId } : {})
      }
    };

    console.log('Sending notifications/initialized...');
    const req = http.request(options, (res) => {
      console.log(`Response status: ${res.statusCode}`);
      
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        console.log(`Response: ${responseData}\n`);
        resolve(responseData);
      });
    });

    req.on('error', (e) => {
      console.error(`Request error: ${e}`);
      reject(e);
    });
    
    req.write(data);
    req.end();
  });
}

// Step 3: Try listing tools
function listTools() {
  return new Promise((resolve, reject) => {
    const message = {
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
      id: 2
    };
    
    const data = JSON.stringify(message);
    
    const options = {
      hostname: '127.0.0.1',
      port: 12306,
      path: '/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Content-Length': Buffer.byteLength(data),
        ...(sessionId ? { 'mcp-session-id': sessionId } : {})
      }
    };

    console.log('Sending tools/list request...');
    const req = http.request(options, (res) => {
      console.log(`Response status: ${res.statusCode}`);
      
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        console.log(`Response: ${responseData}\n`);
        resolve(responseData);
      });
    });

    req.on('error', (e) => {
      console.error(`Request error: ${e}`);
      reject(e);
    });
    
    req.write(data);
    req.end();
  });
}

async function runTests() {
  try {
    // Test the initialization sequence
    await sendInitialize();
    await sendInitialized();
    await listTools();
    
    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

runTests();
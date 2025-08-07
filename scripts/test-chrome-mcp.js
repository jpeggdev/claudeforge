#!/usr/bin/env node

const http = require('http');

// Test Chrome MCP connection
async function testChromeMCP() {
  console.log('Testing Chrome MCP at http://127.0.0.1:12306/mcp');
  
  const messages = [
    {
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
    },
    {
      jsonrpc: '2.0',
      method: 'initialized',
      params: {},
      id: 2
    }
  ];

  for (const message of messages) {
    console.log(`\nSending: ${message.method}`);
    
    const response = await sendRequest(message);
    console.log('Response:', response);
  }
}

function sendRequest(message) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(message);
    
    const options = {
      hostname: '127.0.0.1',
      port: 12306,
      path: '/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        // Parse SSE format if needed
        if (responseData.startsWith('event:')) {
          const lines = responseData.split('\n');
          const dataLine = lines.find(line => line.startsWith('data: '));
          if (dataLine) {
            const json = JSON.parse(dataLine.substring(6));
            resolve(json);
          } else {
            resolve(responseData);
          }
        } else {
          try {
            resolve(JSON.parse(responseData));
          } catch (e) {
            resolve(responseData);
          }
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

testChromeMCP().catch(console.error);
#!/usr/bin/env node

/**
 * Stdio to TCP Bridge for MCP Servers
 * This bridges stdio-based MCP servers to TCP connections
 * Runs inside Docker containers to expose MCP servers over network
 */

const net = require('net');
const { spawn } = require('child_process');
const readline = require('readline');

const PORT = process.env.BRIDGE_PORT || 5000;
const COMMAND = process.argv[2];
const ARGS = process.argv.slice(3);

if (!COMMAND) {
  console.error('Usage: stdio-tcp-bridge.js <command> [args...]');
  process.exit(1);
}

console.log(`Starting stdio-tcp bridge on port ${PORT}`);
console.log(`Command: ${COMMAND} ${ARGS.join(' ')}`);

// Track active connections
const connections = new Set();

// Create TCP server
const server = net.createServer((socket) => {
  console.log('Client connected');
  connections.add(socket);
  
  // Spawn the MCP server process for this connection
  const mcpProcess = spawn(COMMAND, ARGS, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env }
  });
  
  // Handle process errors
  mcpProcess.on('error', (error) => {
    console.error('Failed to start MCP server:', error);
    socket.write(JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: `Failed to start MCP server: ${error.message}`
      }
    }) + '\n');
    socket.end();
  });
  
  // Pipe stderr to console for debugging
  mcpProcess.stderr.on('data', (data) => {
    console.error(`MCP stderr: ${data}`);
  });
  
  // Create readline interface for parsing JSON-RPC messages from stdout
  const rl = readline.createInterface({
    input: mcpProcess.stdout,
    crlfDelay: Infinity
  });
  
  // Forward MCP server output to TCP client
  rl.on('line', (line) => {
    if (line.trim()) {
      try {
        // Validate it's valid JSON before sending
        JSON.parse(line);
        socket.write(line + '\n');
      } catch (error) {
        console.error('Invalid JSON from MCP server:', line);
      }
    }
  });
  
  // Forward TCP client input to MCP server
  let buffer = '';
  socket.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.trim()) {
        try {
          // Validate it's valid JSON before sending
          JSON.parse(line);
          mcpProcess.stdin.write(line + '\n');
        } catch (error) {
          console.error('Invalid JSON from client:', line);
          socket.write(JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32700,
              message: 'Parse error'
            }
          }) + '\n');
        }
      }
    }
  });
  
  // Handle socket close
  socket.on('close', () => {
    console.log('Client disconnected');
    connections.delete(socket);
    mcpProcess.kill();
  });
  
  // Handle socket errors
  socket.on('error', (error) => {
    console.error('Socket error:', error);
    connections.delete(socket);
    mcpProcess.kill();
  });
  
  // Handle process exit
  mcpProcess.on('exit', (code, signal) => {
    console.log(`MCP server exited with code ${code}, signal ${signal}`);
    socket.end();
  });
});

// Start listening
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Bridge listening on port ${PORT}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...');
  server.close();
  connections.forEach(socket => socket.end());
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down...');
  server.close();
  connections.forEach(socket => socket.end());
  process.exit(0);
});
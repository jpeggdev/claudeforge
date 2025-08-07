#!/usr/bin/env node

const EventSource = require('eventsource');
const readline = require('readline');

const url = process.argv[2] || 'http://localhost:8080/mcp';

// Create SSE connection
const eventSource = new EventSource(url, {
  headers: {
    'Accept': 'text/event-stream'
  }
});

// Set up readline for stdin
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// Handle incoming SSE messages
eventSource.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    console.log(JSON.stringify(data));
  } catch (e) {
    // If not JSON, just pass through
    console.log(event.data);
  }
};

eventSource.onerror = (error) => {
  console.error('SSE Error:', error);
  process.exit(1);
};

eventSource.onopen = () => {
  console.error('Connected to MCP proxy');
};

// Handle stdin input and forward to server via POST
rl.on('line', async (line) => {
  try {
    const data = JSON.parse(line);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      console.error('Error sending request:', response.status);
    }
  } catch (e) {
    console.error('Error processing input:', e);
  }
});

// Handle shutdown
process.on('SIGINT', () => {
  eventSource.close();
  rl.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  eventSource.close();
  rl.close();
  process.exit(0);
});
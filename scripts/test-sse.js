const https = require('https');

const url = 'https://mcp.context7.com/sse';

console.log('Connecting to:', url);

https.get(url, {
  headers: {
    'Accept': 'text/event-stream',
    'Cache-Control': 'no-cache'
  }
}, (res) => {
  console.log('Status Code:', res.statusCode);
  console.log('Headers:', res.headers);
  
  let buffer = '';
  
  res.on('data', (chunk) => {
    buffer += chunk.toString();
    
    // Process complete events
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer
    
    for (const line of lines) {
      if (line.trim()) {
        console.log('Received:', line);
      }
    }
  });
  
  res.on('end', () => {
    console.log('Connection closed');
  });
  
  res.on('error', (err) => {
    console.error('Error:', err);
  });
});

// Timeout after 10 seconds
setTimeout(() => {
  console.log('Timeout - closing connection');
  process.exit(0);
}, 10000);
const { EventSource } = require('eventsource');

console.log('Testing SSE connection to Context7...');

const source = new EventSource('https://mcp.context7.com/mcp');

source.onopen = () => {
  console.log('Connected!');
};

source.onerror = (error) => {
  console.error('Error:', error);
};

source.onmessage = (event) => {
  console.log('Message:', event.data);
};

// Give it 10 seconds then exit
setTimeout(() => {
  console.log('Closing connection...');
  source.close();
  process.exit(0);
}, 10000);
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client(
  { name: 'test-client', version: '1.0.0' },
  { capabilities: {} }
);

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/']
});

console.log('Connecting...');
await client.connect(transport);
console.log('Connected!');

// Get server capabilities first
console.log('Getting capabilities...');
const capabilities = await client.getServerCapabilities();
console.log('Capabilities:', capabilities);

console.log('Listing tools...');
const tools = await client.listTools();
console.log('Tools:', tools.tools.map(t => t.name));

console.log('Calling list_allowed_directories...');

// Add explicit timeout
const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => reject(new Error('Timeout after 5 seconds')), 5000);
});

try {
  const result = await Promise.race([
    client.callTool('list_allowed_directories', {}),
    timeoutPromise
  ]);
  console.log('Result:', result);
} catch (error) {
  console.error('Error:', error.message);
}

await client.close();
process.exit(0);
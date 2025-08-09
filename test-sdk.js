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

console.log('Listing tools...');
const tools = await client.listTools();
console.log('Tools:', tools.tools.map(t => t.name));

console.log('Calling list_allowed_directories...');
try {
  const result = await client.callTool('list_allowed_directories', {});
  console.log('Result:', result);
} catch (error) {
  console.error('Error:', error);
}

await client.close();
process.exit(0);
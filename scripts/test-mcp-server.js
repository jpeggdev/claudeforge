#!/usr/bin/env node

/**
 * MCP Server Connection Tester
 * Tests different transport types and helps debug connection issues
 */

const { spawn } = require('child_process');
const https = require('https');
const http = require('http');
const { EventSource } = require('eventsource');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testStdioServer(command, args = [], env = {}) {
  log(`\nTesting STDIO server: ${command} ${args.join(' ')}`, 'cyan');
  
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let timeout;

    // Send initialization message
    const initMessage = JSON.stringify({
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
    });

    child.stdin.write(initMessage + '\n');

    child.stdout.on('data', (data) => {
      stdout += data.toString();
      log(`  ✓ Received response from server`, 'green');
      clearTimeout(timeout);
      child.kill();
      resolve({ success: true, response: stdout });
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
      log(`  ⚠ stderr: ${data.toString().trim()}`, 'yellow');
    });

    child.on('error', (error) => {
      log(`  ✗ Failed to start: ${error.message}`, 'red');
      clearTimeout(timeout);
      resolve({ success: false, error: error.message });
    });

    child.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        log(`  ✗ Process exited with code ${code}`, 'red');
        if (stderr) {
          log(`  stderr output: ${stderr}`, 'yellow');
        }
      }
      clearTimeout(timeout);
      resolve({ success: false, error: `Exit code: ${code}`, stderr });
    });

    // Timeout after 5 seconds
    timeout = setTimeout(() => {
      log(`  ✗ Timeout - no response within 5 seconds`, 'red');
      child.kill();
      resolve({ success: false, error: 'Timeout' });
    }, 5000);
  });
}

async function testSSEServer(url) {
  log(`\nTesting SSE server: ${url}`, 'cyan');
  
  return new Promise((resolve) => {
    let timeout;
    
    try {
      const es = new EventSource(url);
      
      es.onopen = () => {
        log(`  ✓ SSE connection opened`, 'green');
      };
      
      es.addEventListener('endpoint', (event) => {
        log(`  ✓ Received endpoint event: ${event.data}`, 'green');
        es.close();
        clearTimeout(timeout);
        resolve({ success: true, endpoint: event.data });
      });
      
      es.onerror = (error) => {
        log(`  ✗ SSE error: ${JSON.stringify(error)}`, 'red');
        es.close();
        clearTimeout(timeout);
        resolve({ success: false, error: 'SSE connection error' });
      };
      
      // Timeout after 10 seconds
      timeout = setTimeout(() => {
        log(`  ✗ Timeout - no endpoint event within 10 seconds`, 'red');
        es.close();
        resolve({ success: false, error: 'No endpoint event received' });
      }, 10000);
      
    } catch (error) {
      log(`  ✗ Failed to create EventSource: ${error.message}`, 'red');
      resolve({ success: false, error: error.message });
    }
  });
}

async function testHTTPServer(url) {
  log(`\nTesting HTTP/Streamable-HTTP server: ${url}`, 'cyan');
  
  return new Promise((resolve) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    const initMessage = JSON.stringify({
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
    });

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(initMessage)
      }
    };

    const req = client.request(url, options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          log(`  ✓ Received response (status ${res.statusCode})`, 'green');
          try {
            const parsed = JSON.parse(data);
            log(`  Response: ${JSON.stringify(parsed, null, 2)}`, 'blue');
            resolve({ success: true, response: parsed });
          } catch (e) {
            log(`  Response (non-JSON): ${data}`, 'blue');
            resolve({ success: true, response: data });
          }
        } else {
          log(`  ✗ HTTP error: ${res.statusCode}`, 'red');
          log(`  Response: ${data}`, 'yellow');
          resolve({ success: false, error: `HTTP ${res.statusCode}` });
        }
      });
    });

    req.on('error', (error) => {
      log(`  ✗ Request failed: ${error.message}`, 'red');
      resolve({ success: false, error: error.message });
    });

    req.on('timeout', () => {
      log(`  ✗ Request timeout`, 'red');
      req.destroy();
      resolve({ success: false, error: 'Timeout' });
    });

    req.setTimeout(10000);
    req.write(initMessage);
    req.end();
  });
}

async function runTests() {
  log('MCP Server Connection Tester', 'blue');
  log('============================', 'blue');

  // Test examples - uncomment to run
  
  // Test filesystem server (should work)
  await testStdioServer('node', [
    '/home/jpegg/code/ai/mcp_proxy/mcp-servers/node_modules/@modelcontextprotocol/server-filesystem/dist/index.js',
    '/home/jpegg'
  ]);

  // Test chrome-mcp with correct binary
  await testStdioServer('node', [
    '/home/jpegg/.npm-global/lib/node_modules/mcp-chrome-bridge/dist/mcp/mcp-server-stdio.js'
  ]);

  // Test 21stdev (this should fail as it's not an MCP server)
  await testStdioServer('node', [
    '/home/jpegg/.npm-global/lib/node_modules/@21st-dev/cli/dist/index.js'
  ], {
    API_KEY: '04dea47ae3414c111c35c402f099d5de5fa59a40cb6a1c2649b866c4bd5e5df'
  });

  // Test Context7 SSE
  await testSSEServer('https://mcp.context7.com/sse');

  // Test a hypothetical HTTP server
  // await testHTTPServer('http://127.0.0.1:12306/mcp');

  log('\n✅ All tests completed', 'green');
}

// Run tests if executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { testStdioServer, testSSEServer, testHTTPServer };
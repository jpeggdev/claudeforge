#!/usr/bin/env node

const EventSource = require('eventsource');
const chalk = require('chalk');

const CLAUDEFORGE_URL = process.env.CLAUDEFORGE_URL || 'http://localhost:8080';

console.clear();
console.log(chalk.bold.cyan('🔥 ClaudeForge Firehose Viewer'));
console.log(chalk.gray('=' .repeat(80)));
console.log(chalk.yellow('Connecting to ' + CLAUDEFORGE_URL + '/api/firehose/stream...'));
console.log(chalk.gray('=' .repeat(80)));

const categoryColors = {
  'mcp': chalk.blue,
  'http': chalk.green,
  'websocket': chalk.magenta,
  'system': chalk.yellow,
  'debug': chalk.cyan,
  'log': chalk.white,
  'permission': chalk.red,
  'config': chalk.gray
};

const typeColors = {
  'request': chalk.bold.green,
  'response': chalk.bold.blue,
  'error': chalk.bold.red,
  'notification': chalk.yellow,
  'connect': chalk.green,
  'disconnect': chalk.red
};

function formatTimestamp(date) {
  const d = new Date(date);
  return chalk.gray(`[${d.toLocaleTimeString()}.${d.getMilliseconds().toString().padStart(3, '0')}]`);
}

function formatEvent(event) {
  const timestamp = formatTimestamp(event.timestamp);
  const category = (categoryColors[event.category] || chalk.white)(event.category.toUpperCase().padEnd(10));
  const type = (typeColors[event.type] || chalk.white)(event.type.padEnd(15));
  const source = chalk.cyan(event.source.padEnd(20));
  
  let details = '';
  if (event.data) {
    if (typeof event.data === 'object') {
      if (event.data.method) details += chalk.yellow(` ${event.data.method}`);
      if (event.data.status) details += chalk.green(` [${event.data.status}]`);
      if (event.data.message) details += chalk.white(` ${event.data.message}`);
    } else {
      details = chalk.white(` ${event.data}`);
    }
  }
  
  if (event.metadata) {
    if (event.metadata.duration) details += chalk.gray(` (${event.metadata.duration}ms)`);
    if (event.metadata.error) details += chalk.red(' ❌');
    if (event.metadata.size) details += chalk.gray(` ${event.metadata.size}b`);
  }
  
  return `${timestamp} ${category} ${type} ${source}${details}`;
}

const eventSource = new EventSource(`${CLAUDEFORGE_URL}/api/firehose/stream`);

eventSource.onopen = () => {
  console.log(chalk.green('✓ Connected to firehose stream'));
  console.log(chalk.gray('=' .repeat(80)));
};

eventSource.onmessage = (e) => {
  try {
    const data = JSON.parse(e.data);
    
    if (data.type === 'stats') {
      // Display stats in header
      process.stdout.write('\033[s'); // Save cursor position
      process.stdout.write('\033[2;0H'); // Move to line 2
      process.stdout.write('\033[K'); // Clear line
      console.log(chalk.gray(`Events: ${data.data.totalEvents} | Rate: ${data.data.eventsPerSecond}/s | Runtime: ${data.data.runtime}s`));
      process.stdout.write('\033[u'); // Restore cursor position
    } else {
      // Regular event
      console.log(formatEvent(data));
    }
  } catch (error) {
    console.error(chalk.red('Parse error:'), error.message);
  }
};

eventSource.onerror = (error) => {
  console.error(chalk.red('❌ Connection error:'), error.message || 'Unknown error');
  console.log(chalk.yellow('Attempting to reconnect...'));
};

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\nClosing firehose connection...'));
  eventSource.close();
  process.exit(0);
});

// Show help
console.log(chalk.gray('\nPress Ctrl+C to exit\n'));
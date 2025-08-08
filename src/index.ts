import { ProxyServer } from './proxy-server.js';
import { WebServer } from './web-server.js';
import { StreamableServer } from './streamable-server.js';
import { LogManager } from './log-manager.js';
import { DebugManager } from './debug-manager.js';
import { FirehoseManager } from './firehose-manager.js';
import { ProxyConfig } from './types.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadConfig(): Promise<ProxyConfig> {
  const configPath = process.env.CLAUDEFORGE_CONFIG || path.join(__dirname, '..', 'config.json');
  
  try {
    const configData = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(configData);
  } catch (error) {
    console.log('No config file found, using default configuration');
    return {
      port: parseInt(process.env.CLAUDEFORGE_PORT || '3000'),
      webPort: parseInt(process.env.CLAUDEFORGE_WEB_PORT || '8080'),
      defaultPermissions: (process.env.CLAUDEFORGE_DEFAULT_PERMISSIONS as 'allow' | 'deny') || 'allow',
      servers: []
    };
  }
}

async function main() {
  try {
    const configPath = process.env.CLAUDEFORGE_CONFIG || path.join(__dirname, '..', 'config.json');
    const config = await loadConfig();
    const logManager = new LogManager();
    const debugManager = new DebugManager();
    const firehoseManager = new FirehoseManager();
    
    console.log('Starting ClaudeForge Server...');
    console.log(`Web interface will be available at http://localhost:${config.webPort}`);
    console.log(`Streamable HTTP endpoint will be available at http://localhost:${config.port}`);
    
    const proxyServer = new ProxyServer(config, logManager, debugManager, firehoseManager, configPath);
    
    const webServer = new WebServer(
      config.webPort,
      proxyServer.getServerManager(),
      proxyServer.getPermissionManager(),
      logManager,
      debugManager,
      firehoseManager,
      proxyServer
    );
    
    const streamableServer = new StreamableServer(
      config.port,
      proxyServer.getServerManager(),
      proxyServer.getPermissionManager(),
      logManager
    );

    const shutdown = async (signal: string) => {
      logManager.info(`Received ${signal}, shutting down gracefully`);
      
      try {
        await streamableServer.stop();
        await webServer.stop();
        await proxyServer.stop();
        process.exit(0);
      } catch (error) {
        logManager.error('Error during shutdown', undefined, undefined, error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGHUP', () => shutdown('SIGHUP'));

    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled rejection at:', promise, 'reason:', reason);
      shutdown('unhandledRejection');
    });

    await proxyServer.start();
    
    console.log('ClaudeForge Server is running');
    console.log(`Web interface: http://localhost:${config.webPort}`);
    console.log(`Streamable HTTP: http://localhost:${config.port}/mcp`);
    console.log('Press Ctrl+C to stop');
    
  } catch (error) {
    console.error('Failed to start ClaudeForge Server:', error);
    process.exit(1);
  }
}

main();
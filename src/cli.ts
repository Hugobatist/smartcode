#!/usr/bin/env node
import { Command } from 'commander';
import { getVersion } from './utils/version.js';

const program = new Command();

program
  .name('smartb')
  .description('AI observability diagrams -- see what your AI is thinking')
  .version(getVersion());

program
  .command('serve')
  .description('Start the diagram viewer server')
  .option('-p, --port <number>', 'port number', '3333')
  .option('-d, --dir <path>', 'project directory', '.')
  .option('--no-open', 'do not open browser automatically')
  .action(async (options: { port: string; dir: string; open: boolean }) => {
    const { startServer } = await import('./server/server.js');
    await startServer({
      port: parseInt(options.port, 10),
      dir: options.dir,
      openBrowser: options.open,
    });
  });

program
  .command('init')
  .description('Initialize a SmartB Diagrams project')
  .option('-d, --dir <path>', 'project directory', '.')
  .option('-f, --force', 'overwrite existing config')
  .action(async (options: { dir: string; force?: boolean }) => {
    const { initProject } = await import('./cli/init.js');
    await initProject(options.dir, options.force);
  });

program
  .command('status')
  .description('Show status of the running SmartB server')
  .option('-p, --port <number>', 'server port to check', '3333')
  .action(async (options: { port: string }) => {
    const { showStatus } = await import('./cli/status.js');
    await showStatus(parseInt(options.port, 10));
  });

program
  .command('mcp')
  .description('Start the MCP server for AI tool integration (stdio transport)')
  .option('-d, --dir <path>', 'project directory', '.')
  .option('-s, --serve', 'also start HTTP+WS server for browser viewing')
  .option('-p, --port <number>', 'HTTP server port (requires --serve)', '3333')
  .action(async (options: { dir: string; serve?: boolean; port: string }) => {
    const { startMcpServer } = await import('./mcp/server.js');
    await startMcpServer({
      dir: options.dir,
      serve: options.serve,
      port: parseInt(options.port, 10),
    });
  });

program.parse();

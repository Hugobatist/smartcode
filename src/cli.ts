#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
  .name('smartb')
  .description('AI observability diagrams -- see what your AI is thinking')
  .version('0.1.0');

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
  .command('mcp')
  .description('Start the MCP server for AI tool integration (stdio transport)')
  .option('-d, --dir <path>', 'project directory', '.')
  .action(async (options: { dir: string }) => {
    const { startMcpServer } = await import('./mcp/server.js');
    await startMcpServer(options.dir);
  });

program.parse();

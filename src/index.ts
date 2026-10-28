#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import { relayCommands } from './relay/commands.js';

const { version } = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8'));

const program = new Command();
program
  .name('campus')
  .description('Cliente del relay de Campus: consultas sujetas al plan y cupo de tu cuenta')
  .version(version)
  .addHelpText('beforeAll', '\n  campus-cli · cliente del relay de Campus\n');

// Every executable data command goes through the authenticated hosted relay.
relayCommands(program);

// MCP server mode
program
  .command('mcp')
  .description('Conecta tu cliente MCP al relay de Campus por stdio')
  .action(async () => {
    const { startMcpServer } = await import('./mcp/server.js');
    await startMcpServer();
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(chalk.red(err.message));
  process.exit(1);
});

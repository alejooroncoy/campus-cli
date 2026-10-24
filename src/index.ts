#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import { loginCommand } from './providers/blackboard/commands/login.js';
import { coursesCommand, messagesCommand } from './providers/blackboard/commands/courses.js';
import { apiDocsCommand } from './providers/blackboard/commands/api-docs.js';
import { downloadCommand } from './providers/blackboard/commands/download.js';
import { assignmentsCommand } from './providers/blackboard/commands/assignments.js';
import { miupcCommands } from './providers/miupc/commands.js';
import { upnCommands } from './providers/upn/commands.js';
import { accountCommand } from './account/command.js';
import { loadSession, loadOrRefreshSession, saveSession, isSessionValid } from './providers/blackboard/auth/session.js';
import { assertPublicApiUrl, createClient } from './providers/blackboard/api/client.js';
import { getMe, getSystemVersion } from './providers/blackboard/api/courses.js';
import { resolveDisplayName, getSsoExpiry } from './providers/blackboard/auth/login.js';
import { BANNER, ok, fail, hint, formatSessionLifetime } from './ui/theme.js';
import { track } from './analytics.js';

const { version } = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8'));

const program = new Command();
track('cli_started', {
  command: process.argv.slice(2, 4).filter((arg) => !arg.startsWith('-')).join(' ') || 'help',
});

// Commander hooks give every CLI command the same success/error/latency
// coverage, including commands that do not call Blackboard directly here.
program.hook('preAction', (thisCommand, actionCommand) => {
  (actionCommand as any).__analyticsStartedAt = Date.now();
  (actionCommand as any).__analyticsName = actionCommand.name();
  track('cli_command_started', {
    command: actionCommand.name(),
    parent_command: thisCommand.name(),
  });
});
program.hook('postAction', (thisCommand, actionCommand) => {
  track('cli_command_completed', {
    command: actionCommand.name(),
    parent_command: thisCommand.name(),
    success: true,
    duration_ms: Date.now() - ((actionCommand as any).__analyticsStartedAt ?? Date.now()),
  });
});

program
  .name('campus')
  .description('CLI no oficial para tu campus universitario (Blackboard, Canvas, Moodle...)')
  .version(version)
  .addHelpText('beforeAll', BANNER);

// Auth commands
loginCommand(program);

// Course commands
coursesCommand(program);
messagesCommand(program);

// Status / ping
program
  .command('status')
  .description('Estado de sesión y versión del servidor')
  .option('--json', 'Output raw JSON')
  .action(async (opts) => {
    let session = await loadOrRefreshSession();
    const valid = isSessionValid(session);

    const client = createClient(session ?? { cookies: [], xsrfToken: '', expiresAt: 0 });
    const sysVersion = await getSystemVersion(client).catch(() => null);

    // Self-heal old sessions with userName=null.
    if (valid && !session!.userName) {
      try {
        const me = await getMe(client);
        const name = resolveDisplayName(me);
        if (name) {
          session = { ...session!, userId: session!.userId ?? me?.id, userName: name };
          saveSession(session!);
        }
      } catch {}
    }

    const ssoExpiresAt = valid ? (session!.ssoExpiresAt ?? getSsoExpiry(session!.cookies)) : undefined;

    const result = {
      loggedIn: valid,
      user: valid ? { id: session!.userId, name: session!.userName } : null,
      sessionExpiresAt: valid ? new Date(session!.expiresAt).toISOString() : null,
      ssoExpiresAt: ssoExpiresAt ? new Date(ssoExpiresAt).toISOString() : null,
      server: sysVersion?.learn ?? null,
    };

    if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }

    const v = sysVersion?.learn;
    console.log(`\n  Servidor: ${chalk.cyan(`Blackboard Learn ${v?.major}.${v?.minor}.${v?.patch} (${v?.build})`)}`);
    if (valid) {
      const { summary, note } = formatSessionLifetime(session!.expiresAt, ssoExpiresAt);
      console.log(`  Sesión:   ${ok(`autenticado como ${chalk.bold(session!.userName || session!.userId || 'unknown')}`)}`);
      console.log(`            ${chalk.gray(summary)}`);
      console.log(`            ${chalk.gray(note)}`);
    } else {
      console.log(`  Sesión:   ${fail('no autenticado')} — ejecuta: ${hint('campus login')}`);
    }
    console.log('');
  });

// Endpoint docs
apiDocsCommand(program);

// Download commands
downloadCommand(program);

// Assignment commands
assignmentsCommand(program);

// Cuenta Campus (Google) — identidad compartida entre apps del ecosistema
accountCommand(program);
upnCommands(program);
miupcCommands(program);

// API passthrough para LLMs / power users
program
  .command('api <method> <path>')
  .description('Llamada directa a la REST API (útil para LLMs y scripts)')
  .option('-b, --body <json>', 'Cuerpo JSON para POST/PUT')
  .option('-q, --query <params>', 'Query params (ej: "limit=10&offset=0")')
  .action(async (method: string, apiPath: string, opts) => {
    const normalizedMethod = method.toUpperCase();
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(normalizedMethod)) {
      throw new Error('Method must be GET, POST, PUT, PATCH, or DELETE');
    }
    assertPublicApiUrl(apiPath);
    const session = await loadOrRefreshSession();
    if (!isSessionValid(session)) {
      console.error(JSON.stringify({ error: 'Not authenticated. Run: campus login' }));
      process.exit(1);
    }

    const client = createClient(session!);
    const params = opts.query ? Object.fromEntries(new URLSearchParams(opts.query)) : undefined;
    const data = opts.body ? JSON.parse(opts.body) : undefined;

    try {
      const r = await client.request({ method: normalizedMethod.toLowerCase() as any, url: apiPath, params, data });
      console.log(JSON.stringify(r.data, null, 2));
    } catch (err: any) {
      console.error(JSON.stringify({ error: err.message, status: err.response?.status, body: err.response?.data }, null, 2));
      process.exit(1);
    }
  });

// MCP server mode
program
  .command('mcp')
  .description('Inicia el servidor MCP para usar con Claude (stdio)')
  .action(async () => {
    const { startMcpServer } = await import('./mcp/server.js');
    await startMcpServer();
  });

program.parseAsync(process.argv).catch((err) => {
  track('cli_error', { error_type: err instanceof Error ? err.name : 'CommandError', command: process.argv[2] ?? 'unknown' });
  console.error(chalk.red(err.message));
  process.exit(1);
});

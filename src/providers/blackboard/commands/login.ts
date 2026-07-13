import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { login, resolveDisplayName, getSsoExpiry } from '../auth/login.js';
import { loadSession, loadOrRefreshSession, saveSession, clearSession, isSessionValid } from '../auth/session.js';
import { createClient } from '../api/client.js';
import { getMe } from '../api/courses.js';
import { ok, fail, warn, whatNext, formatSessionLifetime } from '../../../ui/theme.js';

export function loginCommand(program: Command) {
  program
    .command('login')
    .description('Authenticate with UPC Aula Virtual via Microsoft SSO')
    .option('--headless', 'Run browser in headless mode (no window)')
    .option('-u, --username <email>', 'UPC email (optional, can type in browser)')
    .option('-p, --password <password>', 'Password (optional, can type in browser)')
    .action(async (opts) => {
      // Check if already logged in
      const existing = loadSession();
      if (isSessionValid(existing)) {
        console.log(chalk.yellow(`Already logged in as ${chalk.bold(existing!.userName || 'unknown')}`));
        const { relogin } = await inquirer.prompt([
          { type: 'confirm', name: 'relogin', message: 'Re-authenticate?', default: false },
        ]);
        if (!relogin) return;
      }

      console.log(chalk.cyan('\nOpening browser for Microsoft login...'));
      console.log(chalk.gray('A browser window will open. Complete the login and it will close automatically.\n'));

      try {
        const session = await login({
          headless: opts.headless ?? false,
          username: opts.username,
          password: opts.password,
        });

        const ssoExpiresAt = getSsoExpiry(session.cookies);
        const { summary, note } = formatSessionLifetime(session.expiresAt, ssoExpiresAt);
        console.log(ok(`Sesión guardada`));
        console.log(chalk.gray(`  ${summary}`));
        console.log(chalk.gray(`  ${note}`));
        if (session.userName) console.log(chalk.gray(`  Usuario: ${session.userName}`));
        if (session.userId)   console.log(chalk.gray(`  ID:      ${session.userId}`));
        whatNext();
      } catch (err: any) {
        console.error(chalk.red(`\n✗ Login failed: ${err.message}`));
        process.exit(1);
      }
    });

  program
    .command('logout')
    .description('Borra la sesión y las cookies SSO para poder cambiar de cuenta')
    .option('--keep-profile', 'Conservar las cookies SSO del navegador (no permite cambiar de cuenta)')
    .action((opts) => {
      clearSession({ keepProfile: !!opts.keepProfile });
      if (opts.keepProfile) {
        console.log(chalk.green('✓ Sesión borrada') + chalk.gray(' (profile SSO conservado)'));
      } else {
        console.log(chalk.green('✓ Sesión y profile SSO borrados'));
        console.log(chalk.gray('  El próximo `campus login` te pedirá credenciales de nuevo.'));
      }
    });

  program
    .command('whoami')
    .description('Show current logged-in user')
    .action(async () => {
      let session = await loadOrRefreshSession();
      if (!isSessionValid(session)) {
        console.log(chalk.red('Not logged in. Run: campus login'));
        process.exit(1);
      }

      // Self-heal old sessions that were stored with userName=null.
      if (!session!.userName) {
        try {
          const me = await getMe(createClient(session!));
          const name = resolveDisplayName(me);
          if (name) {
            session = { ...session!, userId: session!.userId ?? me?.id, userName: name };
            saveSession(session!);
          }
        } catch {}
      }

      console.log(chalk.green(`Logged in as: ${chalk.bold(session!.userName || session!.userId || 'unknown')}`));
      const ssoExpiresAt = getSsoExpiry(session!.cookies);
      const { summary, note } = formatSessionLifetime(session!.expiresAt, ssoExpiresAt);
      console.log(chalk.gray(summary));
      console.log(chalk.gray(note));
    });
}

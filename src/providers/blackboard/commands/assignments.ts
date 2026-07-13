import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import fs from 'fs';
import { loadSession, isSessionValid } from '../auth/session.js';
import { createClient } from '../api/client.js';
import { getMe } from '../api/courses.js';
import {
  listAssignments,
  listAttempts,
  getAttempt,
  uploadFile,
  submitAttempt,
} from '../api/assignments.js';

function requireSession() {
  const session = loadSession();
  if (!isSessionValid(session)) {
    console.error(chalk.red('Not logged in. Run: blackboard login'));
    process.exit(1);
  }
  return session!;
}

function formatDate(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function dueStatus(due?: string) {
  if (!due) return '';
  const diff = new Date(due).getTime() - Date.now();
  const days = Math.ceil(diff / 86400000);
  if (diff < 0) return chalk.red(` (vencida hace ${Math.abs(days)}d)`);
  if (days <= 1) return chalk.red(` (vence HOY)`);
  if (days <= 3) return chalk.yellow(` (vence en ${days}d)`);
  return chalk.gray(` (vence en ${days}d)`);
}

export function assignmentsCommand(program: Command) {
  const assignments = program
    .command('assignments')
    .description('Assignment and submission operations');

  // ── LIST ──────────────────────────────────────────────────────────────────
  assignments
    .command('list <courseId>')
    .description('List assignments and tasks in a course')
    .option('--json', 'Output raw JSON')
    .option('--pending', 'Show only assignments without a submission')
    .action(async (courseId, opts) => {
      const session = requireSession();
      const client = createClient(session);
      const spinner = ora({ text: 'Fetching assignments...', stream: process.stderr }).start();

      try {
        let userId = session.userId;
        if (!userId) { const me = await getMe(client); userId = me.id; }

        const [columns, gradesRes] = await Promise.all([
          listAssignments(client, courseId),
          client
            .get(`/learn/api/public/v1/courses/${courseId}/gradebook/users/${userId}`, {
              params: { limit: 200 },
            })
            .then((r) => r.data.results as any[])
            .catch(() => [] as any[]),
        ]);

        spinner.succeed(`${columns.length} assignments found`);

        if (opts.json) { console.log(JSON.stringify(columns, null, 2)); return; }

        if (columns.length === 0) {
          console.log(chalk.yellow('No assignments found in this course.'));
          return;
        }

        const gradeMap = new Map(gradesRes.map((g: any) => [g.columnId, g]));

        console.log('');
        columns.forEach((col) => {
          const grade = gradeMap.get(col.id) ?? null;
          const possible = col.score?.possible ?? '?';
          const due = col.grading?.due;
          const attemptsAllowed = col.grading?.attemptsAllowed === 0
            ? 'ilimitados'
            : `${col.grading?.attemptsAllowed ?? '?'} intento(s)`;
          const type = col.grading?.type === 'Manual' ? chalk.gray('[manual]') : '';

          // Grade display
          let gradeStr = chalk.gray('sin entregar');
          if (grade?.displayGrade?.score != null) {
            const score = grade.displayGrade.score;
            const pct = possible !== '?' ? Math.round((score / Number(possible)) * 100) : null;
            const color = pct == null ? chalk.white : pct >= 60 ? chalk.green : chalk.red;
            gradeStr = color(`${score} / ${possible}${pct != null ? ` (${pct}%)` : ''}`);
          } else if (grade?.status === 'NeedsGrading') {
            gradeStr = chalk.yellow('entregada — pendiente de nota');
          }

          if (opts.pending && grade?.displayGrade?.score != null) return;

          console.log(
            `  ${chalk.bold(col.id)} ${chalk.cyan(col.name)} ${type}`
          );
          console.log(
            `    Nota: ${gradeStr}  ·  Máx: ${possible} pts  ·  ${attemptsAllowed}` +
            (due ? `  ·  Entrega: ${formatDate(due)}${dueStatus(due)}` : '')
          );
          console.log('');
        });
      } catch (err: any) {
        spinner.fail(err.message);
        process.exit(1);
      }
    });

  // ── ATTEMPTS LIST ─────────────────────────────────────────────────────────
  assignments
    .command('attempts <courseId> <columnId>')
    .description('List your submission attempts for an assignment')
    .option('--json', 'Output raw JSON')
    .action(async (courseId, columnId, opts) => {
      const session = requireSession();
      const client = createClient(session);
      const spinner = ora({ text: 'Fetching attempts...', stream: process.stderr }).start();

      try {
        const attempts = await listAttempts(client, courseId, columnId);
        spinner.succeed(`${attempts.length} attempt(s)`);

        if (opts.json) { console.log(JSON.stringify(attempts, null, 2)); return; }

        if (attempts.length === 0) {
          console.log(chalk.yellow('No submissions found for this assignment.'));
          return;
        }

        console.log('');
        attempts.forEach((att, i) => {
          const score = att.displayGrade?.score ?? att.score;
          const scoreStr = score != null ? chalk.green(String(score)) : chalk.gray('sin nota');
          const statusColor =
            att.status === 'NeedsGrading' ? chalk.yellow :
            att.status === 'Completed' ? chalk.green :
            att.status === 'InProgress' ? chalk.blue :
            chalk.gray;

          console.log(`  ${chalk.bold(`#${i + 1}`)} ${chalk.gray(att.id)}`);
          console.log(`    Estado:  ${statusColor(att.status)}`);
          console.log(`    Nota:    ${scoreStr}`);
          if (att.attemptDate || att.created) {
            console.log(`    Fecha:   ${formatDate(att.attemptDate ?? att.created)}`);
          }
          if (att.studentComments) {
            console.log(`    Comentarios: ${chalk.gray(att.studentComments.slice(0, 120))}`);
          }
          if (att.files?.length) {
            att.files.forEach((f) => console.log(`    Archivo: ${chalk.cyan(f.fileName)}`));
          }
          console.log('');
        });
      } catch (err: any) {
        spinner.fail(err.message);
        process.exit(1);
      }
    });

  // ── SUBMIT ────────────────────────────────────────────────────────────────
  assignments
    .command('submit <courseId> <columnId>')
    .description('Submit an attempt for an assignment')
    .option('-f, --file <path>', 'File to attach (PDF, DOCX, ZIP, etc.)')
    .option('-t, --text <content>', 'Submission text body')
    .option('-c, --comments <text>', 'Student comments')
    .option('--draft', 'Save as draft (InProgress) instead of submitting')
    .option('--json', 'Output raw JSON')
    .action(async (courseId, columnId, opts) => {
      const session = requireSession();
      const client = createClient(session);

      if (!opts.file && !opts.text && !opts.comments) {
        console.error(chalk.red('Provide at least --file, --text, or --comments'));
        process.exit(1);
      }

      try {
        // Upload file first if provided
        let fileUploadIds: string[] | undefined;
        if (opts.file) {
          const filePath = path.resolve(opts.file);
          if (!fs.existsSync(filePath)) {
            console.error(chalk.red(`File not found: ${filePath}`));
            process.exit(1);
          }
          const uploadSpinner = ora({ text: `Uploading ${path.basename(filePath)}...`, stream: process.stderr }).start();
          try {
            const uploadId = await uploadFile(client, filePath);
            fileUploadIds = [uploadId];
            uploadSpinner.succeed(`File uploaded (id: ${uploadId})`);
          } catch (e: any) {
            uploadSpinner.fail(`Upload failed: ${e.message}`);
            process.exit(1);
          }
        }

        const status = opts.draft ? 'InProgress' : 'NeedsGrading';
        const submitSpinner = ora({ text: `Submitting attempt (${status})...`, stream: process.stderr }).start();

        const attempt = await submitAttempt(client, courseId, columnId, {
          studentComments: opts.comments,
          studentSubmission: opts.text,
          fileUploadIds,
          status,
        });

        submitSpinner.succeed(`Submitted! Attempt ID: ${attempt.id}`);

        if (opts.json) { console.log(JSON.stringify(attempt, null, 2)); return; }

        console.log('');
        console.log(`  ${chalk.bold('Attempt ID:')} ${chalk.cyan(attempt.id)}`);
        console.log(`  ${chalk.bold('Status:')}     ${chalk.yellow(attempt.status)}`);
        if (attempt.created) console.log(`  ${chalk.bold('Date:')}       ${formatDate(attempt.created)}`);
        console.log('');
      } catch (err: any) {
        const body = err.response?.data;
        console.error(chalk.red(`\n✗ ${err.message}`));
        if (body?.message) console.error(chalk.gray(`  ${body.message}`));
        process.exit(1);
      }
    });
}

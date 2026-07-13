import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import { loadSession, isSessionValid } from '../auth/session.js';
import { createClient } from '../api/client.js';

function requireSession() {
  const session = loadSession();
  if (!isSessionValid(session)) {
    console.error(chalk.red('Not logged in. Run: blackboard login'));
    process.exit(1);
  }
  return session!;
}

async function getAttachments(client: any, courseId: string, contentId: string) {
  const r = await client.get(
    `/learn/api/public/v1/courses/${courseId}/contents/${contentId}/attachments`
  );
  return r.data.results as Array<{ id: string; fileName: string; mimeType: string }>;
}

async function downloadAttachment(
  client: any,
  courseId: string,
  contentId: string,
  attachmentId: string,
  destPath: string
) {
  const r = await client.get(
    `/learn/api/public/v1/courses/${courseId}/contents/${contentId}/attachments/${attachmentId}/download`,
    { responseType: 'arraybuffer' }
  );
  fs.writeFileSync(destPath, Buffer.from(r.data));
}

// Recursively collect all file-type content items
async function collectFiles(
  client: any,
  courseId: string,
  parentId?: string,
  depth = 0
): Promise<Array<{ id: string; title: string; parentTitle: string }>> {
  if (depth > 6) return [];
  const url = parentId
    ? `/learn/api/public/v1/courses/${courseId}/contents/${parentId}/children`
    : `/learn/api/public/v1/courses/${courseId}/contents`;

  const r = await client.get(url, { params: { limit: 100 } });
  const items: any[] = r.data.results;
  const files: Array<{ id: string; title: string; parentTitle: string }> = [];

  await Promise.all(
    items.map(async (item) => {
      if (item.contentHandler?.id === 'resource/x-bb-file') {
        files.push({ id: item.id, title: item.title, parentTitle: '' });
      } else if (item.hasChildren) {
        const children = await collectFiles(client, courseId, item.id, depth + 1);
        children.forEach((c) => {
          if (!c.parentTitle) c.parentTitle = item.title;
        });
        files.push(...children);
      }
    })
  );

  return files;
}

export function downloadCommand(program: Command) {
  program
    .command('download <courseId> <contentId>')
    .description('Download a file attachment from a course content item')
    .option('-o, --out <dir>', 'Output directory', '.')
    .action(async (courseId, contentId, opts) => {
      const session = requireSession();
      const client = createClient(session);

      const spinner = ora({ text: 'Getting attachment info...', stream: process.stderr }).start();
      try {
        const attachments = await getAttachments(client, courseId, contentId);
        if (attachments.length === 0) {
          spinner.fail('No attachments found for this content item');
          process.exit(1);
        }

        const outDir = path.resolve(opts.out);
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

        for (const att of attachments) {
          spinner.text = `Downloading ${att.fileName}...`;
          const dest = path.join(outDir, att.fileName);
          await downloadAttachment(client, courseId, contentId, att.id, dest);
          spinner.succeed(`Saved: ${dest}`);
        }
      } catch (err: any) {
        spinner.fail(err.message);
        process.exit(1);
      }
    });

  program
    .command('download-folder <courseId> <folderId>')
    .description('Download all PDFs inside a content folder')
    .option('-o, --out <dir>', 'Output directory', './downloads')
    .option('--filter <keyword>', 'Only download files matching keyword (case-insensitive)')
    .action(async (courseId, folderId, opts) => {
      const session = requireSession();
      const client = createClient(session);

      const spinner = ora({ text: 'Scanning folder...', stream: process.stderr }).start();
      try {
        const files = await collectFiles(client, courseId, folderId);
        let filtered = files;
        if (opts.filter) {
          const kw = opts.filter.toLowerCase();
          filtered = files.filter((f) => f.title.toLowerCase().includes(kw));
        }

        spinner.succeed(`Found ${filtered.length} files`);
        if (filtered.length === 0) return;

        const outDir = path.resolve(opts.out);
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

        let done = 0;
        for (const file of filtered) {
          const spin = ora({ text: `[${++done}/${filtered.length}] ${file.title}`, stream: process.stderr }).start();
          try {
            const attachments = await getAttachments(client, courseId, file.id);
            for (const att of attachments) {
              const dest = path.join(outDir, att.fileName);
              await downloadAttachment(client, courseId, file.id, att.id, dest);
            }
            spin.succeed(`${file.title}`);
          } catch (e: any) {
            spin.fail(`${file.title} — ${e.message}`);
          }
        }

        console.log(chalk.green(`\n✓ Downloads saved to: ${outDir}`));
      } catch (err: any) {
        spinner.fail(err.message);
        process.exit(1);
      }
    });
}

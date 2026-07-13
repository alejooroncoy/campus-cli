import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { loadSession, isSessionValid } from '../auth/session.js';
import { createClient } from '../api/client.js';
import {
  getMe,
  getMyCourses,
  getCourse,
  getCourseContents,
  getCourseAnnouncements,
  getGradeColumns,
  getGrades,
} from '../api/courses.js';

function requireSession() {
  const session = loadSession();
  if (!isSessionValid(session)) {
    console.error(chalk.red('Not logged in. Run: blackboard login'));
    process.exit(1);
  }
  return session!;
}

function outputJson(data: any, json: boolean) {
  if (json) {
    console.log(JSON.stringify(data, null, 2));
  }
  return !json;
}

export function coursesCommand(program: Command) {
  const courses = program
    .command('courses')
    .description('Course operations');

  // List enrolled courses
  courses
    .command('list')
    .description('List your enrolled courses')
    .option('--json', 'Output raw JSON')
    .option('--limit <n>', 'Max results', '50')
    .action(async (opts) => {
      const session = requireSession();
      const client = createClient(session);
      const spinner = ora({ text: 'Fetching courses...', stream: process.stderr }).start();

      try {
        let userId = session.userId;
        if (!userId) {
          const me = await getMe(client);
          userId = me.id;
        }

        const data = await getMyCourses(client, userId!, { limit: parseInt(opts.limit) });
        spinner.succeed(`Found ${data.results.length} courses`);

        if (opts.json) {
          console.log(JSON.stringify(data, null, 2));
          return;
        }

        const items = data.results;
        if (items.length === 0) {
          console.log(chalk.yellow('No courses found.'));
          return;
        }

        console.log('');
        for (const uc of items) {
          const c = (uc as any).course;
          const name = c?.name || uc.courseId;
          const id = c?.id || uc.courseId;
          const role = uc.courseRoleId?.replace('P_', '') || '';
          const status = c?.availability?.available || '';
          const ultra = c?.ultraStatus === 'Ultra' ? chalk.blue(' [Ultra]') : '';
          const lastAccess = uc.lastAccessDate
            ? chalk.gray(` — last: ${new Date(uc.lastAccessDate).toLocaleDateString()}`)
            : '';

          console.log(
            `  ${chalk.bold(id)} ${chalk.cyan(name)}${ultra}` +
            `\n    ${chalk.gray(`role: ${role}  status: ${status}`)}${lastAccess}\n`
          );
        }

        if (data.paging?.nextPage) {
          console.log(chalk.gray('(More courses available — use --limit to increase)'));
        }
      } catch (err: any) {
        spinner.fail(err.message);
        process.exit(1);
      }
    });

  // Get a single course
  courses
    .command('get <courseId>')
    .description('Get details of a specific course')
    .option('--json', 'Output raw JSON')
    .action(async (courseId, opts) => {
      const session = requireSession();
      const client = createClient(session);
      const spinner = ora({ text: 'Fetching course...', stream: process.stderr }).start();

      try {
        const data = await getCourse(client, courseId);
        spinner.stop();

        if (opts.json) {
          console.log(JSON.stringify(data, null, 2));
          return;
        }

        console.log(`\n  ${chalk.bold(data.courseId)} — ${chalk.cyan(data.name)}`);
        if (data.description) console.log(`  ${chalk.gray(data.description)}`);
        if (data.term) console.log(`  Term: ${data.term.name}`);
        if (data.availability) console.log(`  Status: ${data.availability.available}`);
        if ((data as any).ultraStatus) console.log(`  Interface: ${(data as any).ultraStatus}`);
        console.log(`  ID: ${data.id}`);
        console.log('');
      } catch (err: any) {
        spinner.fail(err.message);
        process.exit(1);
      }
    });

  // List course contents
  courses
    .command('contents <courseId>')
    .description('List content/modules inside a course')
    .option('--parent <parentId>', 'Parent content ID for nested navigation')
    .option('--type <type>', 'Filter by type: folder, file, assignment, document, externallink')
    .option('--json', 'Output raw JSON')
    .action(async (courseId, opts) => {
      const session = requireSession();
      const client = createClient(session);
      const spinner = ora({ text: 'Fetching course content...', stream: process.stderr }).start();

      try {
        const data = await getCourseContents(client, courseId, opts.parent);

        // Filter by content type if requested
        const HANDLER_MAP: Record<string, string> = {
          folder: 'resource/x-bb-folder',
          file: 'resource/x-bb-file',
          assignment: 'resource/x-bb-assignment',
          document: 'resource/x-bb-document',
          externallink: 'resource/x-bb-externallink',
        };
        let items = data.results;
        if (opts.type) {
          const handler = HANDLER_MAP[opts.type.toLowerCase()];
          if (!handler) {
            console.error(chalk.red(`Unknown type "${opts.type}". Valid: ${Object.keys(HANDLER_MAP).join(', ')}`));
            process.exit(1);
          }
          items = items.filter((i: any) => i.contentHandler?.id === handler);
        }

        spinner.succeed(`${items.length} items${opts.type ? ` (type: ${opts.type})` : ''}`);

        if (opts.json) {
          console.log(JSON.stringify({ results: items }, null, 2));
          return;
        }

        if (items.length === 0) {
          console.log(chalk.yellow('No content found.'));
          return;
        }

        console.log('');
        for (const item of items) {
          const hasChildren = item.hasChildren ? chalk.gray(' [folder]') : '';
          const handler = item.contentHandler?.id?.replace('resource/x-bb-', '') || '';
          const handlerStr = handler ? chalk.gray(` (${handler})`) : '';
          const avail = item.availability?.available === 'Yes' ? '' : chalk.red(' [hidden]');

          console.log(`  ${chalk.bold(item.id)} ${chalk.cyan(item.title)}${hasChildren}${handlerStr}${avail}`);

          if (item.hasChildren) {
            console.log(chalk.gray(`    → blackboard courses contents ${courseId} --parent ${item.id}`));
          }
          if (item.contentHandler?.url) {
            console.log(chalk.gray(`    url: ${item.contentHandler.url}`));
          }
        }
        console.log('');
      } catch (err: any) {
        spinner.fail(err.message);
        process.exit(1);
      }
    });

  // Announcements
  courses
    .command('announcements <courseId>')
    .description('List course announcements')
    .option('--json', 'Output raw JSON')
    .action(async (courseId, opts) => {
      const session = requireSession();
      const client = createClient(session);
      const spinner = ora({ text: 'Fetching announcements...', stream: process.stderr }).start();

      try {
        const data = await getCourseAnnouncements(client, courseId);
        spinner.succeed(`${data.results.length} announcements`);

        if (opts.json) {
          console.log(JSON.stringify(data, null, 2));
          return;
        }

        if (data.results.length === 0) {
          console.log(chalk.yellow('No announcements.'));
          return;
        }

        console.log('');
        for (const ann of data.results) {
          const date = ann.created ? new Date(ann.created).toLocaleString() : '';
          console.log(`  ${chalk.bold(ann.title)} ${chalk.gray(date)}`);
          const body = ann.body?.replace(/<[^>]+>/g, '').slice(0, 200) || '';
          if (body) console.log(`  ${chalk.gray(body)}`);
          console.log('');
        }
      } catch (err: any) {
        spinner.fail(err.message);
        process.exit(1);
      }
    });

  // Members
  courses
    .command('members <courseId>')
    .description('List students and instructors in a course')
    .option('--json', 'Output raw JSON')
    .option('--role <role>', 'Filter by role: Student, Instructor')
    .action(async (courseId, opts) => {
      const session = requireSession();
      const client = createClient(session);
      const spinner = ora({ text: 'Fetching course members...', stream: process.stderr }).start();

      try {
        const res = await client.get(
          `/learn/api/public/v1/courses/${courseId}/users?expand=user&limit=200`
        );
        let members: any[] = res.data.results ?? [];

        if (opts.role) {
          const roleFilter = opts.role.toLowerCase();
          members = members.filter((m: any) => m.courseRoleId?.toLowerCase() === roleFilter);
        }

        spinner.succeed(`${members.length} members`);

        if (opts.json) {
          console.log(JSON.stringify({ results: members }, null, 2));
          return;
        }

        const students = members.filter((m: any) => m.courseRoleId === 'Student');
        const instructors = members.filter((m: any) => m.courseRoleId !== 'Student');

        console.log('');
        if (instructors.length > 0) {
          console.log(chalk.bold('  Instructores'));
          for (const m of instructors) {
            const name = m.user ? `${m.user.name.given} ${m.user.name.family}` : m.userId;
            console.log(`  ${chalk.yellow(name)}`);
          }
          console.log('');
        }

        if (students.length > 0) {
          console.log(chalk.bold(`  Estudiantes (${students.length})`));
          students.forEach((m: any, i: number) => {
            const name = m.user ? `${m.user.name.given} ${m.user.name.family}` : m.userId;
            const num = chalk.gray(`${String(i + 1).padStart(2, ' ')}.`);
            console.log(`  ${num} ${name}`);
          });
        }
        console.log('');
      } catch (err: any) {
        spinner.fail(err.message);
        process.exit(1);
      }
    });

  // Grades
  courses
    .command('grades <courseId>')
    .description('List your grades for a course')
    .option('--json', 'Output raw JSON')
    .action(async (courseId, opts) => {
      const session = requireSession();
      const client = createClient(session);
      const spinner = ora({ text: 'Fetching grades...', stream: process.stderr }).start();

      try {
        let userId = session.userId;
        if (!userId) {
          const me = await getMe(client);
          userId = me.id;
        }

        const [columns, grades] = await Promise.all([
          getGradeColumns(client, courseId),
          getGrades(client, courseId, userId!),
        ]);

        spinner.succeed('Grades loaded');

        if (opts.json) {
          console.log(JSON.stringify({ columns: columns.results, grades: grades.results }, null, 2));
          return;
        }

        const gradeMap = new Map(
          (grades.results as any[]).map((g) => [g.columnId, g])
        );

        console.log('');
        for (const col of columns.results as any[]) {
          const grade = gradeMap.get(col.id);
          const possible = col.score?.possible ?? '?';
          const score = grade?.score ?? chalk.gray('N/A');
          const status = grade?.status || '';
          const scoreStr = grade?.score != null
            ? `${chalk.green(grade.score)} / ${possible}`
            : chalk.gray(`— / ${possible}`);
          console.log(`  ${chalk.cyan(col.name || col.displayName)} ${scoreStr} ${chalk.gray(status)}`);
        }
        console.log('');
      } catch (err: any) {
        spinner.fail(err.message);
        process.exit(1);
      }
    });
}

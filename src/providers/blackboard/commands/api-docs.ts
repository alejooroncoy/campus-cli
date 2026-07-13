import { Command } from 'commander';
import chalk from 'chalk';

interface EndpointDoc {
  method: string;
  path: string;
  description: string;
  params?: string;
}

const ENDPOINTS: EndpointDoc[] = [
  // Auth / Session
  { method: 'GET', path: '/learn/api/public/v1/system/version', description: 'Server version (no auth needed)' },
  { method: 'GET', path: '/learn/api/public/v1/users/me', description: 'Current authenticated user' },

  // Courses
  { method: 'GET', path: '/learn/api/public/v1/courses', description: 'List all courses', params: 'limit, offset, name, courseId' },
  { method: 'GET', path: '/learn/api/public/v1/courses/{courseId}', description: 'Get a single course' },
  { method: 'GET', path: '/learn/api/public/v1/users/{userId}/courses', description: 'Courses for a user', params: 'limit, offset' },

  // Course Contents
  { method: 'GET', path: '/learn/api/public/v1/courses/{courseId}/contents', description: 'Root-level content items' },
  { method: 'GET', path: '/learn/api/public/v1/courses/{courseId}/contents/{contentId}', description: 'Single content item' },
  { method: 'GET', path: '/learn/api/public/v1/courses/{courseId}/contents/{contentId}/children', description: 'Children of a content folder' },

  // Announcements
  { method: 'GET', path: '/learn/api/public/v1/courses/{courseId}/announcements', description: 'Course announcements', params: 'limit, offset' },
  { method: 'GET', path: '/learn/api/public/v1/courses/{courseId}/announcements/{announcementId}', description: 'Single announcement' },

  // Gradebook
  { method: 'GET', path: '/learn/api/public/v1/courses/{courseId}/gradebook/columns', description: 'Grade columns/assignments', params: 'limit, offset' },
  { method: 'GET', path: '/learn/api/public/v1/courses/{courseId}/gradebook/columns/{columnId}', description: 'Single grade column' },
  { method: 'GET', path: '/learn/api/public/v1/courses/{courseId}/gradebook/columns/{columnId}/attempts', description: 'Submission attempts for a column' },
  { method: 'GET', path: '/learn/api/public/v1/courses/{courseId}/gradebook/users/{userId}', description: 'All grades for a user in a course' },
  { method: 'GET', path: '/learn/api/public/v1/courses/{courseId}/gradebook/users/{userId}/columns/{columnId}', description: 'Specific grade for a user+column' },

  // Users / Memberships
  { method: 'GET', path: '/learn/api/public/v1/courses/{courseId}/users', description: 'Course members', params: 'limit, offset, role' },
  { method: 'GET', path: '/learn/api/public/v1/users/{userId}', description: 'User profile' },

  // Terms
  { method: 'GET', path: '/learn/api/public/v1/terms', description: 'Academic terms', params: 'limit, offset' },
  { method: 'GET', path: '/learn/api/public/v1/terms/{termId}', description: 'Single term' },

  // Data Sources
  { method: 'GET', path: '/learn/api/public/v1/dataSources', description: 'Data sources', params: 'limit, offset' },

  // Attendance
  { method: 'GET', path: '/learn/api/public/v2/courses/{courseId}/coursemeetings', description: 'Course meetings/attendance (v2)' },

  // Messages
  { method: 'GET', path: '/learn/api/public/v1/users/{userId}/messages/inbox', description: 'User inbox messages' },
];

export function apiDocsCommand(program: Command) {
  program
    .command('endpoints')
    .description('List all known Blackboard REST API endpoints')
    .option('--json', 'Output as JSON')
    .option('--filter <keyword>', 'Filter by keyword')
    .action((opts) => {
      let docs = ENDPOINTS;
      if (opts.filter) {
        const kw = opts.filter.toLowerCase();
        docs = docs.filter(
          (e) => e.path.toLowerCase().includes(kw) || e.description.toLowerCase().includes(kw)
        );
      }

      if (opts.json) {
        console.log(JSON.stringify(docs, null, 2));
        return;
      }

      console.log(`\n  ${chalk.bold('Blackboard Learn REST API')} — ${chalk.gray('https://aulavirtual.upc.edu.pe')}\n`);
      console.log(chalk.gray('  Base: /learn/api/public/v{1,2,3}/\n'));

      let lastGroup = '';
      for (const ep of docs) {
        const group = ep.path.split('/').slice(0, 6).join('/');
        if (group !== lastGroup) {
          console.log('');
          lastGroup = group;
        }
        const method = chalk.bold(
          ep.method === 'GET' ? chalk.green(ep.method) :
          ep.method === 'POST' ? chalk.yellow(ep.method) :
          ep.method === 'PUT' ? chalk.blue(ep.method) :
          chalk.red(ep.method)
        );
        console.log(`  ${method.padEnd(14)} ${chalk.cyan(ep.path)}`);
        console.log(`               ${chalk.gray(ep.description)}`);
        if (ep.params) console.log(`               ${chalk.gray('params: ' + ep.params)}`);
      }
      console.log('');
      console.log(chalk.gray('  Use: blackboard api GET /learn/api/public/v1/<endpoint>'));
      console.log(chalk.gray('  Or:  blackboard api GET /learn/api/public/v1/<endpoint> -q "limit=10"'));
      console.log('');
    });
}

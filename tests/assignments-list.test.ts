import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { getCurrentGroupAttempt, isPendingAssignment } from '../src/providers/blackboard/commands/assignments.js';
import { listAssignments, listPublishedAssignments } from '../src/providers/blackboard/api/assignments.js';
import { getGradeColumns, getGrades } from '../src/providers/blackboard/api/courses.js';

test('assignments list accepts an optional courseId', () => {
  const output = execFileSync(
    process.execPath,
    ['run.js', 'assignments', 'list', '--help'],
    { cwd: process.cwd(), encoding: 'utf8' }
  );

  assert.match(output, /Usage: campus assignments list \[options\] \[courseId\]/);
  assert.match(output, /List assignments and tasks in a course, or across all courses/);
});

test('messages command exposes inbox filtering and pagination options', () => {
  const output = execFileSync(
    process.execPath,
    ['run.js', 'messages', '--help'],
    { cwd: process.cwd(), encoding: 'utf8' }
  );

  assert.match(output, /List messages from your Blackboard inbox/);
  assert.match(output, /--course <courseId>/);
  assert.match(output, /--limit <n>/);
  assert.match(output, /--offset <n>/);
});

test('courses command exposes discussion readers', () => {
  const output = execFileSync(
    process.execPath,
    ['run.js', 'courses', '--help'],
    { cwd: process.cwd(), encoding: 'utf8' }
  );

  assert.match(output, /discussions \[options\] <courseId>/);
  assert.match(output, /discussion-messages \[options\] <courseId> <discussionId>/);
  assert.match(output, /discussion-replies \[options\] <courseId> <discussionId> <messageId>/);
});

test('pending filter includes only assignments without a score or submitted attempt pending grading', () => {
  assert.equal(isPendingAssignment(null), true);
  assert.equal(isPendingAssignment({}), true);
  assert.equal(isPendingAssignment({ displayGrade: { score: 15 } }), false);
  assert.equal(isPendingAssignment({ score: 15 }), false);
  assert.equal(isPendingAssignment({ status: 'NeedsGrading' }), false);
  assert.equal(isPendingAssignment(null, 'NeedsGrading'), false);
  assert.equal(isPendingAssignment(null, 'Completed'), false);
  assert.equal(isPendingAssignment(null, 'InProgress'), true);
});

test('current group attempt is the most recently created one', () => {
  const current = getCurrentGroupAttempt([
    { created: '2026-09-01T10:00:00.000Z', status: 'InProgress' },
    { created: '2026-09-02T10:00:00.000Z', status: 'NeedsGrading' },
  ]);

  assert.equal((current as any)?.status, 'NeedsGrading');
  assert.equal(isPendingAssignment(null, (current as any)?.status), false);
});

test('assignment listing follows every gradebook column page', async () => {
  const client = {
    get: async (url: string) => {
      if (url.endsWith('/gradebook/columns')) {
        return {
          data: {
            results: [{ id: '_column_1', name: 'First', grading: { type: 'Attempts' } }],
            paging: { nextPage: '/learn/api/public/v2/courses/_course_1/gradebook/columns?offset=100' },
          },
        };
      }
      if (url.endsWith('/gradebook/columns?offset=100')) {
        return { data: { results: [{ id: '_column_2', name: 'Second', grading: { type: 'Manual' } }] } };
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  } as any;

  const assignments = await listAssignments(client, '_course_1');

  assert.deepEqual(assignments.map((assignment) => assignment.id), ['_column_1', '_column_2']);
});

test('grade listing follows every student grade page', async () => {
  const client = {
    get: async (url: string) => {
      if (url.endsWith('/gradebook/users/_student_1')) {
        return {
          data: {
            results: [{ columnId: '_column_1' }],
            paging: { nextPage: '/learn/api/public/v1/courses/_course_1/gradebook/users/_student_1?offset=200' },
          },
        };
      }
      if (url.endsWith('/gradebook/users/_student_1?offset=200')) {
        return { data: { results: [{ columnId: '_column_2' }] } };
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  } as any;

  const grades = await getGrades(client, '_course_1', '_student_1', { limit: 200 });

  assert.deepEqual(grades.results.map((grade) => grade.columnId), ['_column_1', '_column_2']);
});

test('grade column listing follows every page', async () => {
  const client = {
    get: async (url: string) => {
      if (url.endsWith('/gradebook/columns')) {
        return {
          data: {
            results: [{ id: '_column_1' }],
            paging: { nextPage: '/learn/api/public/v1/courses/_course_1/gradebook/columns?offset=50' },
          },
        };
      }
      if (url.endsWith('/gradebook/columns?offset=50')) return { data: { results: [{ id: '_column_2' }] } };
      throw new Error(`Unexpected request: ${url}`);
    },
  } as any;

  const columns = await getGradeColumns(client, '_course_1');

  assert.deepEqual(columns.results.map((column) => column.id), ['_column_1', '_column_2']);
});

test('published group assessment is listed when its gradebook column is restricted', async () => {
  const requested: string[] = [];
  const client = {
    get: async (url: string) => {
      requested.push(url);
      if (url.endsWith('/gradebook/columns')) return { data: { results: [] } };
      if (url.endsWith('/contents')) return { data: { results: [{ id: '_folder_1', title: 'Week 2', hasChildren: true }] } };
      if (url.endsWith('/contents/_folder_1/children')) {
        return { data: { results: [{
          id: '_content_1', title: 'Actividad grupal', hasGradebookColumns: true,
          hasAssociatedGroups: true, availability: { available: 'Yes' },
          contentHandler: { gradeColumnId: '_restricted_column_1' },
        }] } };
      }
      if (url.endsWith('/gradebook/columns/_restricted_column_1/groupAttempts')) {
        return { data: { results: [{ id: '_attempt_1', groupId: '_group_1', status: 'InProgress' }] } };
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  } as any;

  const assignments = await listPublishedAssignments(client, '_course_1');

  assert.deepEqual(assignments, [{
    id: '_restricted_column_1', name: 'Actividad grupal', contentId: '_content_1',
    grading: { type: 'Attempts' }, gradebookAccess: 'restricted', hasAssociatedGroups: true,
    groupAttempts: [{ id: '_attempt_1', groupId: '_group_1', status: 'InProgress' }],
    groupAttemptsAccess: 'available',
  }]);
  assert.equal(requested.filter((url) => url.includes('_restricted_column_1')).length, 1);
});

test('published group assessment discovery preserves a session-expired error', async () => {
  const expired = Object.assign(new Error('Session expired. Run: campus login'), { code: 'SESSION_EXPIRED' });
  const client = {
    get: async (url: string) => {
      if (url.endsWith('/gradebook/columns')) return { data: { results: [] } };
      if (url.endsWith('/contents')) {
        return { data: { results: [{
          id: '_content_1', title: 'Actividad grupal', hasGradebookColumns: true,
          availability: { available: 'Yes' }, contentHandler: { gradeColumnId: '_restricted_column_1' },
        }] } };
      }
      if (url.endsWith('/gradebook/columns/_restricted_column_1/groupAttempts')) throw expired;
      throw new Error(`Unexpected request: ${url}`);
    },
  } as any;

  await assert.rejects(() => listPublishedAssignments(client, '_course_1'), { code: 'SESSION_EXPIRED' });
});

test('published assessment discovery follows content pages and ignores hidden folders', async () => {
  const client = {
    get: async (url: string) => {
      if (url.endsWith('/gradebook/columns')) return { data: { results: [] } };
      if (url.endsWith('/contents')) {
        return {
          data: {
            results: [{ id: '_hidden_1', title: 'Hidden', hasChildren: true, availability: { available: 'No' } }],
            paging: { nextPage: '/learn/api/public/v1/courses/_course_1/contents?offset=100' },
          },
        };
      }
      if (url.endsWith('/contents?offset=100')) {
        return {
          data: {
            results: [{
              id: '_content_2', title: 'Later activity', hasGradebookColumns: true,
              availability: { available: 'Yes' }, contentHandler: { gradeColumnId: '_column_2' },
            }],
          },
        };
      }
      if (url.endsWith('/gradebook/columns/_column_2/groupAttempts')) return { data: { results: [] } };
      if (url.endsWith('/contents/_hidden_1/children')) throw new Error('Hidden folder must not be visited');
      throw new Error(`Unexpected request: ${url}`);
    },
  } as any;

  const assignments = await listPublishedAssignments(client, '_course_1');

  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].name, 'Later activity');
});

test('published group assessment is listed when its gradebook column is restricted', async () => {
  const requested: string[] = [];
  const client = {
    get: async (url: string) => {
      requested.push(url);
      if (url.endsWith('/gradebook/columns')) {
        return { data: { results: [] } };
      }
      if (url.endsWith('/contents')) {
        return {
          data: {
            results: [{
              id: '_folder_1', title: 'Week 2', hasChildren: true,
            }],
          },
        };
      }
      if (url.endsWith('/contents/_folder_1/children')) {
        return {
          data: {
            results: [{
              id: '_content_1', title: 'Actividad grupal', hasGradebookColumns: true,
              hasAssociatedGroups: true, availability: { available: 'Yes' },
              contentHandler: { gradeColumnId: '_restricted_column_1' },
            }],
          },
        };
      }
      if (url.endsWith('/gradebook/columns/_restricted_column_1/groupAttempts')) {
        return { data: { results: [{ id: '_attempt_1', groupId: '_group_1', status: 'InProgress' }] } };
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  } as any;

  const assignments = await listPublishedAssignments(client, '_course_1');

  assert.deepEqual(assignments, [{
    id: '_restricted_column_1', name: 'Actividad grupal', contentId: '_content_1',
    grading: { type: 'Attempts' }, gradebookAccess: 'restricted', hasAssociatedGroups: true,
    groupAttempts: [{ id: '_attempt_1', groupId: '_group_1', status: 'InProgress' }],
    groupAttemptsAccess: 'available',
  }]);
  assert.equal(requested.filter((url) => url.includes('_restricted_column_1')).length, 1);
});

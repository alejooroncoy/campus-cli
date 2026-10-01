import assert from 'node:assert/strict';
import test from 'node:test';
import { getAttemptFeedback } from '../src/providers/blackboard/api/feedback.js';

const courseId = '_1_1', columnId = '_2_1';
const attempt = { id: '_3_1', status: 'Completed', text: '15.8', feedback: 'Comentario general' };
const association = {
  id: '_4_1', displayGraded: true,
  rubricDefinition: {
    id: '_5_1', title: 'Introducción', rubricType: 'NUMERIC_RANGE',
    rows: [
      { id: '_6_1', header: 'Título', position: 0, rowPoints: 3, percentage: 15,
        cells: [{ id: '_7_1', rubricColumnId: '_8_1', description: 'Título claro' }] },
      { id: '_9_1', header: 'Contexto', position: 1, rowPoints: 3, percentage: 15, cells: [] },
    ],
    columnHeaders: [{ id: '_8_1', header: 'Logrado' }],
  },
};
const evaluation = {
  id: '_10_1', rubricAssociationId: '_4_1', completed: true, published: false,
  totalScore: 15.8, maxScore: 20,
  // Blackboard returns evaluations out of rubric row order.
  cells: [
    { rubricRowId: '_9_1', selectedPercent: 0, feedback: { rawText: null } },
    { rubricRowId: '_6_1', rubricCellId: '_7_1', selectedPercent: 0.8333333333333,
      feedback: { rawText: '<p>Especificar la institución &amp; población.</p><p>Declarar el caso.</p>', webLocation: 'secret', fileLocation: 'secret' } },
  ],
};
function clientFor(individual: any, group?: any, column: any = { rubricAssociations: [association], gradesReleased: true }) {
  const paths: string[] = [];
  return { paths, client: { get: async (path: string) => {
    paths.push(path);
    if (path.endsWith('/attempts/_3_1')) return { data: individual };
    if (path.endsWith('/groupAttempts/_11_1')) return { data: group };
    if (path.endsWith('/columns/_2_1')) return { data: column };
    throw new Error(`Unexpected request ${path}`);
  } } as any };
}

test('group rubric feedback maps comments, achievement levels and fractional criterion scores without session metadata', async () => {
  const { client, paths } = clientFor(
    { id: '_3_1', groupAttemptId: '_11_1', displayGrade: { score: 15.8 }, attemptDate: '2026-09-21T03:43:37Z' },
    { id: '_11_1', rubricEvaluation: evaluation },
  );
  const result = await getAttemptFeedback(client, courseId, columnId, attempt);
  assert.equal(result.score, 15.8);
  assert.equal(result.submittedAt, '2026-09-21T03:43:37Z');
  assert.equal(result.instructorFeedback, 'Comentario general');
  assert.equal(result.rubricFeedback.status, 'available');
  const rubric = result.rubricFeedback.rubrics[0];
  assert.equal(rubric.scope, 'group');
  assert.deepEqual(rubric.criteria[0], {
    id: '_6_1', name: 'Título', score: 2.5, maxScore: 3, weightPercent: 15,
    achievementLevel: 'Logrado', achievementDescription: 'Título claro',
    criterionComments: 'Especificar la institución & población.\nDeclarar el caso.',
  });
  assert.equal(rubric.criteria[1].score, 0);
  assert.equal(rubric.criteria[1].criterionComments, null);
  assert.ok(!JSON.stringify(result).includes('secret'));
  assert.equal(paths.length, 3);
});

test('individual rubric feedback works without fetching a group and preserves zero grades', async () => {
  const { client, paths } = clientFor({ id: '_3_1', displayGrade: { score: 0 }, rubricEvaluation: evaluation,
    feedbackToUser: { rawText: '<p>Revisar introducción.</p>' } });
  const result = await getAttemptFeedback(client, courseId, columnId, attempt);
  assert.equal(result.score, 0);
  assert.equal(result.instructorFeedback, 'Revisar introducción.');
  assert.equal(result.rubricFeedback.rubrics[0].scope, 'individual');
  assert.equal(paths.length, 2);
});

test('missing and ungraded rubrics have distinct states and do not invent comments', async () => {
  const noRubric = clientFor({ id: '_3_1' }, undefined, { rubricAssociations: [] });
  assert.deepEqual((await getAttemptFeedback(noRubric.client, courseId, columnId, attempt)).rubricFeedback,
    { status: 'no_rubric', rubrics: [] });
  const ungraded = clientFor({ id: '_3_1', rubricEvaluation: { ...evaluation, completed: false } });
  assert.deepEqual((await getAttemptFeedback(ungraded.client, courseId, columnId, attempt)).rubricFeedback,
    { status: 'not_graded', rubrics: [] });
});

test('hidden rubric evaluations are not returned', async () => {
  for (const column of [
    { rubricAssociations: [{ ...association, displayGraded: false }] },
    { rubricAssociations: [association], gradesReleased: false },
  ]) {
    const { client } = clientFor({ id: '_3_1', rubricEvaluation: evaluation }, undefined, column);
    assert.deepEqual((await getAttemptFeedback(client, courseId, columnId, attempt)).rubricFeedback,
      { status: 'restricted', rubrics: [] });
  }
});

test('access errors preserve existing feedback, while session errors propagate', async () => {
  for (const status of [403, 404, 500]) {
    const client = { get: async () => { throw { response: { status } }; } } as any;
    const result = await getAttemptFeedback(client, courseId, columnId, attempt);
    assert.equal(result.instructorFeedback, 'Comentario general');
    assert.deepEqual(result.rubricFeedback, { status: status === 403 ? 'restricted' : 'unavailable', rubrics: [] });
  }
  const error = Object.assign(new Error('Session expired. Run: campus login'), { code: 'SESSION_EXPIRED' });
  await assert.rejects(getAttemptFeedback({ get: async () => { throw error; } } as any, courseId, columnId, attempt), /Session expired/);
});

test('rejects path injection before making any request', async () => {
  const { client, paths } = clientFor({});
  await assert.rejects(getAttemptFeedback(client, '../other', columnId, attempt), /courseId/);
  await assert.rejects(getAttemptFeedback(client, courseId, columnId, { ...attempt, id: '../other' }), /attemptId/);
  assert.equal(paths.length, 0);
});

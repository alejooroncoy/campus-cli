import type { AxiosInstance } from 'axios';
import { decodeHTML } from 'entities';
import type { Attempt } from './assignments.js';

interface RichText { rawText?: string | null; displayText?: string | null }
interface RubricCell { id: string; rubricColumnId: string; description?: string }
interface RubricRow { id: string; header: string; position?: number; rowPoints?: number; percentage?: number; cells?: RubricCell[] }
interface RubricAssociation {
  id: string;
  displayGraded?: boolean;
  rubricDefinition: { id: string; title: string; rubricType?: string; rows?: RubricRow[]; columnHeaders?: Array<{ id: string; header: string }> };
}
interface Evaluation {
  id: string;
  rubricAssociationId: string;
  completed?: boolean;
  totalScore?: number;
  maxScore?: number;
  cells?: Array<{ rubricRowId: string; rubricCellId?: string; selectedPercent?: number; selectedScore?: number; feedback?: RichText }>;
}
interface UltraAttempt {
  id: string;
  groupAttemptId?: string;
  attemptDate?: string;
  modifiedDate?: string;
  displayGrade?: { score?: number; text?: string };
  feedbackToUser?: RichText;
  rubricEvaluation?: Evaluation;
}

/** Return only readable feedback, never rich-text session/file locations. */
function readableText(value?: RichText): string | null {
  const html = value?.rawText || value?.displayText;
  if (!html) return null;
  const text = decodeHTML(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?\s*>|<\/p>|<\/div>|<\/li>/gi, '\n')
    .replace(/<[^>]*>/g, '')).replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n\s*\n/g, '\n').trim();
  return text || null;
}

export interface RubricFeedback {
  status: 'available' | 'no_rubric' | 'not_graded' | 'restricted' | 'unavailable';
  rubrics: Array<{
    id: string;
    title: string;
    evaluationId: string;
    scope: 'individual' | 'group';
    totalScore?: number;
    maxScore?: number;
    criteria: Array<{
      id: string;
      name: string;
      score: number | null;
      maxScore: number | null;
      weightPercent: number | null;
      achievementLevel: string | null;
      achievementDescription: string | null;
      criterionComments: string | null;
    }>;
  }>;
}

function mapEvaluation(association: RubricAssociation, evaluation: Evaluation, scope: 'individual' | 'group'): RubricFeedback['rubrics'][number] {
  const rubric = association.rubricDefinition;
  return {
    id: rubric.id, title: rubric.title, evaluationId: evaluation.id, scope,
    totalScore: evaluation.totalScore, maxScore: evaluation.maxScore,
    criteria: [...(rubric.rows ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((row) => {
      const graded = evaluation.cells?.find((cell) => cell.rubricRowId === row.id);
      const cell = row.cells?.find((cell) => cell.id === graded?.rubricCellId);
      // Ultra stores the fraction of this row's points, including numeric ranges.
      // Percentage rubrics derive row points from the evaluation's maximum.
      const maxScore = row.rowPoints ?? (row.percentage != null && evaluation.maxScore != null
        ? row.percentage / 100 * evaluation.maxScore : null);
      const score = graded?.selectedScore ?? (graded?.selectedPercent != null && maxScore != null
        ? Number((graded.selectedPercent * maxScore).toFixed(10)) : null);
      return {
        id: row.id, name: row.header, score, maxScore, weightPercent: row.percentage ?? null,
        achievementLevel: rubric.columnHeaders?.find((level) => level.id === cell?.rubricColumnId)?.header ?? null,
        achievementDescription: cell?.description ?? null,
        criterionComments: readableText(graded?.feedback),
      };
    }),
  };
}

/** Ultra's student-facing APIs expose criterion feedback (the public rubric
 * evaluation endpoint requires instructor privileges). These are read-only
 * requests using the same student's session as the rest of Campus. */
export async function getAttemptFeedback(client: AxiosInstance, courseId: string, columnId: string, attempt: Attempt) {
  for (const [name, id] of Object.entries({ courseId, columnId, attemptId: attempt.id })) {
    if (!/^_\d+_\d+$/.test(id)) throw new Error(`${name} must look like a Blackboard ID`);
  }
  const rubricFeedback: RubricFeedback = { status: 'unavailable', rubrics: [] };
  let individual: UltraAttempt | undefined;
  let group: UltraAttempt | undefined;
  try {
    individual = (await client.get(`/learn/api/v1/courses/${courseId}/gradebook/attempts/${attempt.id}`, {
      params: { expand: 'rubricEvaluation,feedbackToUser' },
    })).data;
    if (individual?.groupAttemptId) {
      if (!/^_\d+_\d+$/.test(individual.groupAttemptId)) throw new Error('Invalid Blackboard group attempt ID');
      group = (await client.get(`/learn/api/v1/courses/${courseId}/gradebook/groupAttempts/${individual.groupAttemptId}`, {
        params: { expand: 'rubricEvaluation,feedbackToUser' },
      })).data;
    }
    const column: { gradesReleased?: boolean; rubricAssociations?: RubricAssociation[] } = (await client.get(
      `/learn/api/v1/courses/${courseId}/gradebook/columns/${columnId}`, { params: { expand: 'associatedRubrics' } },
    )).data;
    const associations = column.rubricAssociations ?? [];
    rubricFeedback.status = associations.length ? 'not_graded' : 'no_rubric';
    for (const [scope, data] of [['individual', individual], ['group', group]] as const) {
      const evaluation = data?.rubricEvaluation;
      if (!evaluation) continue;
      const association = associations.find((item) => item.id === evaluation.rubricAssociationId);
      if (!association) { rubricFeedback.status = 'unavailable'; continue; }
      if (association.displayGraded === false || column.gradesReleased === false) {
        rubricFeedback.status = 'restricted'; continue;
      }
      if (evaluation.completed === false) continue;
      rubricFeedback.rubrics.push(mapEvaluation(association, evaluation, scope));
    }
    if (rubricFeedback.rubrics.length) rubricFeedback.status = 'available';
  } catch (error: any) {
    if (error.code === 'SESSION_EXPIRED' || error.response?.status === 401) throw error;
    rubricFeedback.status = error.response?.status === 403 ? 'restricted' : 'unavailable';
  }
  return {
    score: individual?.displayGrade?.score ?? group?.displayGrade?.score ?? attempt.displayGrade?.score ?? attempt.score,
    grade: individual?.displayGrade?.text ?? attempt.displayGrade?.text,
    submittedAt: individual?.attemptDate ?? group?.attemptDate ?? attempt.attemptDate ?? attempt.modified,
    instructorFeedback: readableText(individual?.feedbackToUser) ?? readableText(group?.feedbackToUser)
      ?? attempt.instructorFeedback ?? attempt.feedback ?? attempt.text ?? null,
    rubricFeedback,
  };
}

/**
 * Quiz / Assessment support for Blackboard Ultra.
 *
 * All endpoints discovered by intercepting the Ultra SPA network traffic:
 *
 *  GET  /learn/api/v1/courses/{courseId}/gradebook/attempts/{attemptId}
 *       ?columnId={columnId}&expand=toolAttemptDetail,alignedGoals
 *       → Returns full question data in toolAttemptDetail["resource/x-bb-assessment"].questionAttempts
 *
 *  PATCH /learn/api/v1/courses/{courseId}/gradebook/attempts/{attemptId}/assessment/answers/{questionAttemptId}
 *       → Saves a single answer (eitherOr or multipleanswer)
 *
 *  PATCH /learn/api/v1/courses/{courseId}/gradebook/attempts/{attemptId}
 *       ?autoSubmitted=false&expand=attemptReceipt.lateSubmission
 *       → Final submit
 */

import type { AxiosInstance } from 'axios';

// ── Types ────────────────────────────────────────────────────────────────────

export interface QuizOption {
  id: string;
  text: string;
  index: number;
}

export type QuizQuestionType = 'eitherOr' | 'multipleanswer' | 'fimb' | 'presentation' | string;

export interface QuizQuestion {
  /** Question attempt ID — used as the URL segment for saving answers */
  questionAttemptId: string;
  /** Question definition ID */
  questionId: string;
  /** Position within the quiz (1-based visible number) */
  position: number;
  /** 'eitherOr' = true/false, 'multipleanswer' = MC, 'fimb' = fill-in-multiple-blanks, 'presentation' = text only */
  type: QuizQuestionType;
  /** Plain text of the question (HTML stripped) */
  text: string;
  points: number;
  /** Answer options (present for eitherOr and multipleanswer) */
  options?: QuizOption[];
  /** Blank names in order (present for fimb), e.g. ['BLANK-1', 'BLANK-2'] */
  blanks?: string[];
  /** Currently saved answer:
   *   - eitherOr:       true | false | null
   *   - multipleanswer: boolean[] (one per option, in options order)
   *   - fimb:           Record<string, string|null> (one per blank)
   */
  currentAnswer?: boolean | boolean[] | Record<string, string | null> | null;
  /** Raw question object from API (needed when saving eitherOr answers) */
  _raw: any;
}

export interface QuizInfo {
  attemptId: string;
  courseId: string;
  columnId: string;
  title: string;
  status: string;
  totalPoints: number;
  questions: QuizQuestion[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<!--[^>]*-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseQuestionAttempt(qa: any, idx: number): QuizQuestion {
  const q = qa.question || {};
  const text = stripHtml(q.questionText?.rawText || q.questionText?.displayText || '');

  let options: QuizOption[] | undefined;
  let blanks: string[] | undefined;
  let currentAnswer: QuizQuestion['currentAnswer'] = qa.givenAnswer ?? null;

  if (qa.questionType === 'eitherOr') {
    // True/False — always two options
    options = [
      { id: 'true', text: 'Verdadero', index: 0 },
      { id: 'false', text: 'Falso', index: 1 },
    ];
  } else if (qa.questionType === 'multipleanswer' && Array.isArray(q.answers)) {
    options = q.answers.map((a: any, i: number) => ({
      id: a.id,
      text: stripHtml(a.answerText?.rawText || a.answerText?.displayText || ''),
      index: i,
    }));
  } else if (qa.questionType === 'fimb' && qa.givenAnswers && typeof qa.givenAnswers === 'object') {
    // Fill-in-multiple-blanks — blank names come from givenAnswers keys (e.g. BLANK-1, BLANK-2)
    blanks = Object.keys(qa.givenAnswers);
    currentAnswer = qa.givenAnswers as Record<string, string | null>;
  }

  return {
    questionAttemptId: qa.id,
    questionId: qa.questionId || q.id,
    position: qa.visibleQuestionNumber ?? idx + 1,
    type: qa.questionType,
    text,
    points: q.points ?? 0,
    options,
    blanks,
    currentAnswer,
    _raw: qa,
  };
}

// ── Get quiz questions ────────────────────────────────────────────────────────

/**
 * Fetch all questions for a quiz attempt via the internal Blackboard API.
 *
 * @param courseId  e.g. _529533_1
 * @param columnId  Gradebook column ID — from content item contentHandler.gradeColumnId
 * @param attemptId e.g. _94898825_1
 */
export async function getQuizQuestions(
  client: AxiosInstance,
  courseId: string,
  columnId: string,
  attemptId: string
): Promise<QuizInfo> {
  const r = await client.get(
    `/learn/api/v1/courses/${courseId}/gradebook/attempts/${attemptId}`,
    { params: { columnId, expand: 'toolAttemptDetail,alignedGoals' } }
  );

  const data = r.data;
  const detail = data.toolAttemptDetail?.['resource/x-bb-assessment'];

  if (!detail) {
    throw new Error(
      `No toolAttemptDetail found for attempt ${attemptId}. ` +
      `Make sure the columnId (${columnId}) and courseId are correct.`
    );
  }

  const rawQuestions: any[] = detail.questionAttempts || [];
  // Filter out presentation-only questions (no points, no interaction)
  const answerableQuestions = rawQuestions.filter(
    (qa) => qa.questionType !== 'presentation'
  );

  const questions = answerableQuestions.map(parseQuestionAttempt);

  return {
    attemptId,
    courseId,
    columnId,
    title: detail.assessment?.title || 'Quiz',
    status: detail.status || data.status || 'IN_PROGRESS',
    totalPoints: detail.possiblePoints || detail.assessment?.totalPoints || 0,
    questions,
  };
}

// ── Save a single answer ──────────────────────────────────────────────────────

/**
 * Save one answer for a quiz question.
 *
 * @param courseId          Course ID
 * @param attemptId         Quiz attempt ID
 * @param question          The question object from getQuizQuestions
 * @param answer
 *   - eitherOr:       boolean  (true = Verdadero, false = Falso)
 *   - multipleanswer: number   (0-based index of the selected option)
 *                    OR boolean[] (one per option)
 *   - fimb:           Record<string, string>  (one value per blank name, e.g. { "BLANK-1": "1438.62", "BLANK-2": "140.62" })
 */
export async function saveQuizAnswer(
  client: AxiosInstance,
  courseId: string,
  attemptId: string,
  question: QuizQuestion,
  answer: boolean | number | boolean[] | Record<string, string>
): Promise<any> {
  const url = `/learn/api/v1/courses/${courseId}/gradebook/attempts/${attemptId}/assessment/answers/${question.questionAttemptId}`;

  let body: any;

  if (question.type === 'eitherOr') {
    const givenAnswer = typeof answer === 'boolean' ? answer : Boolean(answer);
    body = {
      questionType: 'eitherOr',
      givenAnswer,
      question: question._raw.question,
    };
  } else if (question.type === 'multipleanswer') {
    const optionCount = question.options?.length ?? 0;
    let givenAnswer: boolean[];

    if (Array.isArray(answer)) {
      givenAnswer = answer as boolean[];
    } else {
      // Convert index to boolean array
      const idx = typeof answer === 'number' ? answer : 0;
      givenAnswer = Array.from({ length: optionCount }, (_, i) => i === idx);
    }

    body = {
      questionType: 'multipleanswer',
      givenAnswer,
      lookupOrder: question._raw.lookupOrder || [],
      order: question._raw.order || [],
      question: question._raw.question,
    };
  } else if (question.type === 'fimb') {
    if (typeof answer !== 'object' || Array.isArray(answer) || answer === null) {
      throw new Error(
        `fimb answers must be a Record<string, string> mapping blank name to value. ` +
        `Expected blanks: ${question.blanks?.join(', ') || '(unknown)'}`
      );
    }

    // Build givenAnswers using the question's known blank names — preserves order and
    // ensures any blank not provided ends up as null (consistent with Blackboard behavior).
    const blanks = question.blanks ?? Object.keys(answer);
    const givenAnswers: Record<string, string | null> = {};
    for (const name of blanks) {
      const val = (answer as Record<string, string>)[name];
      givenAnswers[name] = val !== undefined ? String(val) : null;
    }

    body = {
      questionType: 'fimb',
      givenAnswers,
      question: question._raw.question,
    };
  } else {
    throw new Error(`Unsupported question type: ${question.type}`);
  }

  const r = await client.patch(url, body);
  return r.data;
}

// ── Submit the quiz attempt ────────────────────────────────────────────────────

/**
 * Finalize and submit a quiz attempt.
 * ALWAYS ask the user to confirm before calling this.
 */
export async function submitQuizAttempt(
  client: AxiosInstance,
  courseId: string,
  attemptId: string
): Promise<any> {
  const url = `/learn/api/v1/courses/${courseId}/gradebook/attempts/${attemptId}`;
  const r = await client.patch(url, {
    toolAttemptDetail: { 'resource/x-bb-assessment': { type: 'Test' } },
    status: 'NEEDS_GRADING',
    studentSubmission: null,
  }, {
    params: {
      autoSubmitted: 'false',
      expand: 'attemptReceipt.lateSubmission',
    },
  });
  return r.data;
}

// ── Get quiz column ID + attempt limits ───────────────────────────────────────

export interface QuizAttemptPolicy {
  columnId: string;
  assessmentId: string;
  title: string;
  /** Max attempts allowed. 0 = unlimited. */
  attemptsAllowed: number;
  /** Attempts left for this student. -1 = unlimited, 0 = none left. */
  attemptsLeft: number;
  /** Human-readable summary, e.g. "Ilimitados" or "2 de 3 restantes" */
  attemptSummary: string;
  /** true = safe to proceed, false = no attempts left */
  canAttempt: boolean;
}

/**
 * Resolve the gradebook column ID for a quiz content item AND fetch
 * the attempt policy (max attempts + attempts left) for the current user.
 */
export async function getQuizColumnId(
  client: AxiosInstance,
  courseId: string,
  contentId: string,
  userId?: string
): Promise<QuizAttemptPolicy> {
  // 1. Content item → columnId + assessmentId
  const contentR = await client.get(
    `/learn/api/public/v1/courses/${courseId}/contents/${contentId}`
  );
  const content = contentR.data;
  const handler = content.contentHandler;

  if (!handler?.gradeColumnId) {
    throw new Error(
      `Content item ${contentId} does not have a gradeColumnId. ` +
      `Is it a quiz (resource/x-bb-asmt-test-link)?`
    );
  }

  const columnId: string = handler.gradeColumnId;
  const assessmentId: string = handler.assessmentId;
  const title: string = content.title || 'Quiz';

  // 2. Gradebook column → attemptsAllowed (0 = unlimited)
  const colR = await client.get(
    `/learn/api/public/v2/courses/${courseId}/gradebook/columns/${columnId}`
  );
  const attemptsAllowed: number = colR.data?.grading?.attemptsAllowed ?? 0;

  // 3. Student grade → attemptsLeft (-1 = unlimited)
  let attemptsLeft = -1;
  if (userId) {
    try {
      const gradeR = await client.get(
        `/learn/api/v1/courses/${courseId}/gradebook/columns/${columnId}/grades`,
        { params: { expand: 'attemptsLeft', userId } }
      );
      const grade = gradeR.data?.results?.[0];
      if (grade?.attemptsLeft !== undefined) {
        attemptsLeft = grade.attemptsLeft;
      }
    } catch {
      // non-fatal: fall back to attemptsAllowed logic
    }
  }

  // 4. Derive human-readable summary and canAttempt flag
  const unlimited = attemptsAllowed === 0 || attemptsLeft === -1;
  const canAttempt = unlimited || attemptsLeft > 0;

  let attemptSummary: string;
  if (unlimited) {
    attemptSummary = 'Ilimitados';
  } else if (attemptsLeft === 0) {
    attemptSummary = `Sin intentos restantes (máximo: ${attemptsAllowed})`;
  } else {
    const used = attemptsAllowed - attemptsLeft;
    attemptSummary = `${attemptsLeft} de ${attemptsAllowed} restantes (${used} enviados)`;
  }

  return {
    columnId,
    assessmentId,
    title,
    attemptsAllowed,
    attemptsLeft,
    attemptSummary,
    canAttempt,
  };
}

// ── Parse URL helper ──────────────────────────────────────────────────────────

/**
 * Parse a Blackboard Ultra quiz URL into its component IDs.
 *
 * Handles:
 *   /ultra/stream/assessment/{contentId}/overview/attempt/{attemptId}?courseId={courseId}
 *   /ultra/stream/assessment/{contentId}/take/attempt/{attemptId}?courseId={courseId}
 */
export function parseQuizUrl(urlStr: string): {
  contentId?: string;
  attemptId?: string;
  courseId?: string;
} {
  try {
    const u = new URL(
      urlStr.startsWith('http')
        ? urlStr
        : `https://aulavirtual.upc.edu.pe${urlStr}`
    );
    const parts = u.pathname.split('/');
    const assessmentIdx = parts.indexOf('assessment');
    const attemptIdx = parts.indexOf('attempt');

    return {
      contentId: assessmentIdx >= 0 ? parts[assessmentIdx + 1] : undefined,
      attemptId: attemptIdx >= 0 ? parts[attemptIdx + 1] : undefined,
      courseId: u.searchParams.get('courseId') ?? undefined,
    };
  } catch {
    return {};
  }
}

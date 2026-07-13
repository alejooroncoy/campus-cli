import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { loadOrRefreshSession, isSessionValid } from './auth/session.js';
import { createClient } from './api/client.js';
import {
  getMe,
  getMyCourses,
  getCourse,
  getCourseContents,
  getCourseAnnouncements,
  getGrades,
  getGradeColumns,
  getSystemVersion,
} from './api/courses.js';
import { listAssignments, listAttempts, submitAttempt, uploadFile, getAttemptFiles } from './api/assignments.js';
import {
  getQuizQuestions,
  saveQuizAnswer,
  submitQuizAttempt,
  getQuizColumnId,
  parseQuizUrl,
  type QuizQuestion,
} from './api/quiz.js';

async function getClient() {
  const session = await loadOrRefreshSession();
  if (!isSessionValid(session)) {
    throw new Error('Not authenticated. Ask the user to run: blackboard login');
  }
  return { client: createClient(session!), session: session! };
}

export function registerBlackboardTools(server: McpServer) {
  // ── whoami ─────────────────────────────────────────────────────────────────
  server.registerTool('whoami', { description: 'Get the currently authenticated UPC student info' }, async () => {
    const { client } = await getClient();
    const me = await getMe(client);
    return { content: [{ type: 'text', text: JSON.stringify(me, null, 2) }] };
  });

  // ── system_version ─────────────────────────────────────────────────────────
  server.registerTool('system_version', { description: 'Get Blackboard Learn server version' }, async () => {
    const { client } = await getClient();
    const v = await getSystemVersion(client);
    return { content: [{ type: 'text', text: JSON.stringify(v, null, 2) }] };
  });

  // ── list_courses ────────────────────────────────────────────────────────────
  server.registerTool('list_courses', { description: 'List all enrolled courses for the current student' }, async () => {
    const { client, session } = await getClient();
    let userId = session.userId;
    if (!userId) { const me = await getMe(client); userId = me.id; }
    const data = await getMyCourses(client, userId!, { limit: 50 });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  });

  // ── get_course ──────────────────────────────────────────────────────────────
  server.registerTool(
    'get_course',
    {
      description: 'Get details of a specific course by its Blackboard ID (e.g. _529580_1)',
      inputSchema: { courseId: z.string().describe('Blackboard course ID like _529580_1') },
    },
    async ({ courseId }) => {
      const { client } = await getClient();
      const data = await getCourse(client, courseId);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── list_contents ───────────────────────────────────────────────────────────
  server.registerTool(
    'list_contents',
    {
      description: 'List content items inside a course or folder. Use parentId to navigate into subfolders.',
      inputSchema: {
        courseId: z.string().describe('Blackboard course ID'),
        parentId: z.string().optional().describe('Parent folder content ID (omit for root level)'),
      },
    },
    async ({ courseId, parentId }) => {
      const { client } = await getClient();
      const data = await getCourseContents(client, courseId, parentId);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── list_announcements ──────────────────────────────────────────────────────
  server.registerTool(
    'list_announcements',
    {
      description: 'List recent announcements for a course',
      inputSchema: { courseId: z.string().describe('Blackboard course ID') },
    },
    async ({ courseId }) => {
      const { client } = await getClient();
      const data = await getCourseAnnouncements(client, courseId);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── list_assignments ────────────────────────────────────────────────────────
  server.registerTool(
    'list_assignments',
    {
      description: 'List assignments and tasks in a course with due dates, scores and submission status',
      inputSchema: { courseId: z.string().describe('Blackboard course ID') },
    },
    async ({ courseId }) => {
      const { client } = await getClient();
      const data = await listAssignments(client, courseId);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── list_attempts ───────────────────────────────────────────────────────────
  server.registerTool(
    'list_attempts',
    {
      description: 'List submission attempts for a specific assignment (gradebook column)',
      inputSchema: {
        courseId: z.string().describe('Blackboard course ID'),
        columnId: z.string().describe('Gradebook column ID (assignment ID)'),
      },
    },
    async ({ courseId, columnId }) => {
      const { client } = await getClient();
      const data = await listAttempts(client, courseId, columnId);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── get_grades ──────────────────────────────────────────────────────────────
  server.registerTool(
    'get_grades',
    {
      description: 'Get all grades for the current student in a course',
      inputSchema: { courseId: z.string().describe('Blackboard course ID') },
    },
    async ({ courseId }) => {
      const { client, session } = await getClient();
      let userId = session.userId;
      if (!userId) { const me = await getMe(client); userId = me.id; }
      const [columns, grades] = await Promise.all([
        getGradeColumns(client, courseId),
        getGrades(client, courseId, userId!),
      ]);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ columns: columns.results, grades: grades.results }, null, 2),
        }],
      };
    }
  );

  // ── download_attachment ─────────────────────────────────────────────────────
  server.registerTool(
    'download_attachment',
    {
      description: 'Download a file from a course content item and save it to disk. attachmentId can be a Blackboard attachment ID (for x-bb-file) or a full bbcswebdav URL (for x-bb-document embedded files). Saves to outputDir (default: current working directory).',
      inputSchema: {
        courseId: z.string().describe('Blackboard course ID'),
        contentId: z.string().describe('Content item ID'),
        attachmentId: z.string().describe('Attachment ID from list_attachments, or a full bbcswebdav URL for embedded files'),
        filename: z.string().optional().describe('Filename to save as (e.g. displayName from list_attachments). Falls back to Content-Disposition header.'),
        outputDir: z.string().optional().describe('Directory to save the file (default: current working directory)'),
      },
    },
    async ({ courseId, contentId, attachmentId, filename, outputDir }) => {
      const { client } = await getClient();

      const url = attachmentId.startsWith('http')
        ? attachmentId
        : `/learn/api/public/v1/courses/${courseId}/contents/${contentId}/attachments/${attachmentId}/download`;

      const r = await client.get(url, { responseType: 'arraybuffer', headers: { Accept: '*/*' } });

      const contentDisposition = r.headers['content-disposition'] as string | undefined;
      const detectedName = contentDisposition
        ? (contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/))?.[1]?.replace(/['"]/g, '').trim()
        : undefined;
      const finalName = filename ?? detectedName ?? 'download';

      const dir = path.resolve(outputDir ?? process.cwd());
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const dest = path.join(dir, finalName);
      fs.writeFileSync(dest, Buffer.from(r.data));

      const mimeType = (r.headers['content-type'] as string | undefined) ?? 'application/octet-stream';
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ saved: dest, size: r.data.byteLength, mimeType }, null, 2),
        }],
      };
    }
  );

  // ── list_attachments ────────────────────────────────────────────────────────
  server.registerTool(
    'list_attachments',
    {
      description: 'List file attachments for a course content item. Works for x-bb-file (REST API) and x-bb-document (embedded files in body HTML).',
      inputSchema: {
        courseId: z.string().describe('Blackboard course ID'),
        contentId: z.string().describe('Content item ID'),
      },
    },
    async ({ courseId, contentId }) => {
      const { client } = await getClient();

      // Try standard REST attachments endpoint first (works for x-bb-file)
      try {
        const r = await client.get(
          `/learn/api/public/v1/courses/${courseId}/contents/${contentId}/attachments`
        );
        return { content: [{ type: 'text', text: JSON.stringify(r.data, null, 2) }] };
      } catch (err: any) {
        if (err.response?.status !== 400 && err.response?.status !== 404) throw err;
      }

      // Fallback: fetch content and parse embedded files from body HTML (x-bb-document, x-bb-lesson)
      const r = await client.get(
        `/learn/api/public/v1/courses/${courseId}/contents/${contentId}`
      );
      const body: string = r.data?.body ?? '';

      // Extract <a> tags with data-bbfile — capture both the JSON metadata and the href (signed download URL)
      // Handle both attribute orderings: data-bbfile...href and href...data-bbfile
      const filePattern = /data-bbfile="([^"]+)"[^<]*?href="([^"]+)"|href="([^"]+)"[^<]*?data-bbfile="([^"]+)"/g;
      const anchorMatches = [...body.matchAll(filePattern)];
      const files = anchorMatches.map((m) => {
        const bbfileRaw = m[1] ?? m[4];
        const hrefRaw   = m[2] ?? m[3];
        try {
          const meta = JSON.parse(bbfileRaw.replace(/&quot;/g, '"'));
          const downloadUrl = hrefRaw ? hrefRaw.replace(/&amp;/g, '&') : (meta.resourceUrl ?? null);
          return {
            type: 'embedded',
            displayName: meta.displayName ?? meta.linkName ?? 'unknown',
            mimeType: meta.mimeType ?? 'application/octet-stream',
            downloadUrl,
          };
        } catch {
          return null;
        }
      }).filter(Boolean);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(
            { type: 'embedded_files', note: 'Pass downloadUrl as attachmentId to download_attachment', results: files },
            null, 2
          ),
        }],
      };
    }
  );

  // ── download_file_url ───────────────────────────────────────────────────────
  server.registerTool(
    'download_file_url',
    {
      description: 'Download a file directly from a Blackboard bbcswebdav URL and save it to disk. Saves to outputDir (default: current working directory).',
      inputSchema: {
        url: z.string().describe('Direct file URL from bbcswebdav (downloadUrl from list_attachments)'),
        filename: z.string().optional().describe('Filename to save as (e.g. displayName from list_attachments)'),
        outputDir: z.string().optional().describe('Directory to save the file (default: current working directory)'),
      },
    },
    async ({ url, filename, outputDir }) => {
      const { client } = await getClient();
      const r = await client.get(url, { responseType: 'arraybuffer', headers: { Accept: '*/*' } });

      const contentDisposition = r.headers['content-disposition'] as string | undefined;
      const detectedName = contentDisposition
        ? (contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/))?.[1]?.replace(/['"]/g, '').trim()
        : undefined;
      const finalName = filename ?? detectedName ?? 'download';

      const dir = path.resolve(outputDir ?? process.cwd());
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const dest = path.join(dir, finalName);
      fs.writeFileSync(dest, Buffer.from(r.data));

      const mimeType = (r.headers['content-type'] as string | undefined) ?? 'application/octet-stream';
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ saved: dest, size: r.data.byteLength, mimeType }, null, 2),
        }],
      };
    }
  );

  // ── submit_attempt ──────────────────────────────────────────────────────────
  server.registerTool(
    'submit_attempt',
    {
      description: 'Submit an assignment attempt. ALWAYS confirm with the user before submitting.',
      inputSchema: {
        courseId: z.string().describe('Blackboard course ID'),
        columnId: z.string().describe('Assignment (gradebook column) ID'),
        studentComments: z.string().optional().describe('Comment to the instructor'),
        studentSubmission: z.string().optional().describe('Text body of the submission'),
      },
    },
    async ({ courseId, columnId, studentComments, studentSubmission }) => {
      const { client } = await getClient();
      const attempt = await submitAttempt(client, courseId, columnId, {
        studentComments,
        studentSubmission,
        status: 'NeedsGrading',
      });
      return { content: [{ type: 'text', text: JSON.stringify(attempt, null, 2) }] };
    }
  );

  // ── get_quiz_questions ──────────────────────────────────────────────────────
  server.registerTool(
    'get_quiz_questions',
    {
      description:
        'Fetch all questions and answer options from a Blackboard Ultra quiz attempt. ' +
        'Provide either a full quiz URL, or courseId + contentId + attemptId. ' +
        'Returns each question with its type, text, options, and current saved answer.',
      inputSchema: {
        url: z
          .string()
          .optional()
          .describe(
            'Full Ultra quiz URL, e.g. https://aulavirtual.upc.edu.pe/ultra/stream/assessment/_69146765_1/overview/attempt/_94898825_1?courseId=_529533_1'
          ),
        courseId: z.string().optional().describe('Course ID (e.g. _529533_1) — required if url not given'),
        contentId: z.string().optional().describe('Quiz content item ID (e.g. _69146765_1) — required if url not given'),
        attemptId: z.string().optional().describe('Attempt ID (e.g. _94898825_1) — required if url not given'),
      },
    },
    async ({ url, courseId, contentId, attemptId }) => {
      const { client, session } = await getClient();

      // Resolve IDs from URL or direct params
      let resolvedCourseId = courseId;
      let resolvedContentId = contentId;
      let resolvedAttemptId = attemptId;

      if (url) {
        const parsed = parseQuizUrl(url);
        resolvedCourseId = resolvedCourseId || parsed.courseId;
        resolvedContentId = resolvedContentId || parsed.contentId;
        resolvedAttemptId = resolvedAttemptId || parsed.attemptId;
      }

      if (!resolvedCourseId || !resolvedContentId || !resolvedAttemptId) {
        throw new Error(
          'Provide either a full quiz URL or all three of: courseId, contentId, attemptId'
        );
      }

      // Get columnId + attempt policy — reuse session already obtained above
      const policy = await getQuizColumnId(client, resolvedCourseId, resolvedContentId, session.userId);

      if (!policy.canAttempt) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'NO_ATTEMPTS_LEFT',
              message: `No quedan intentos para este cuestionario. ${policy.attemptSummary}`,
              policy,
            }, null, 2),
          }],
        };
      }

      const info = await getQuizQuestions(client, resolvedCourseId, policy.columnId, resolvedAttemptId);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ attemptPolicy: policy, ...info }, null, 2),
        }],
      };
    }
  );

  // ── save_quiz_answer ────────────────────────────────────────────────────────
  server.registerTool(
    'save_quiz_answer',
    {
      description:
        'Save a single answer for a quiz question (does NOT submit — use submit_quiz to finalize). ' +
        'question is the full question object from get_quiz_questions. ' +
        'answer format depends on question.type:\n' +
        '  - eitherOr (true/false):       boolean (true = Verdadero)\n' +
        '  - multipleanswer (MC):         number (0-based index of the chosen option)\n' +
        '  - fimb (fill-in-multi-blanks): JSON string of an object mapping blank names to values, ' +
        'e.g. \'{"BLANK-1":"1438.62","BLANK-2":"140.62"}\' (read blank names from question.blanks)',
      inputSchema: {
        courseId: z.string().describe('Course ID'),
        attemptId: z.string().describe('Quiz attempt ID (e.g. _94898825_1)'),
        question: z.string().describe('JSON string of the question object from get_quiz_questions'),
        answer: z.union([z.boolean(), z.number(), z.string()]).describe(
          'eitherOr: true/false. multipleanswer: 0-based index. ' +
          'fimb: JSON string of {blankName: value} (e.g. \'{"BLANK-1":"1438.62"}\').'
        ),
      },
    },
    async ({ courseId, attemptId, question: questionJson, answer }) => {
      const { client } = await getClient();
      const question: QuizQuestion = JSON.parse(questionJson);

      // For fimb, the MCP transport gives us a JSON string — parse it into the Record<string, string>
      // saveQuizAnswer expects. boolean / number pass through as-is.
      let parsedAnswer: boolean | number | Record<string, string>;
      if (typeof answer === 'string') {
        try {
          const obj = JSON.parse(answer);
          if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
            throw new Error('fimb answer string must parse to a JSON object');
          }
          parsedAnswer = obj as Record<string, string>;
        } catch (e: any) {
          throw new Error(
            `Invalid fimb answer: expected a JSON object string like '{"BLANK-1":"value"}'. ${e.message}`
          );
        }
      } else {
        parsedAnswer = answer;
      }

      const result = await saveQuizAnswer(client, courseId, attemptId, question, parsedAnswer);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── submit_quiz ─────────────────────────────────────────────────────────────
  server.registerTool(
    'submit_quiz',
    {
      description:
        'Finalize and submit a quiz attempt. ALWAYS confirm with the user before calling this. ' +
        'All individual answers should be saved first via save_quiz_answer.',
      inputSchema: {
        courseId: z.string().describe('Course ID'),
        attemptId: z.string().describe('Quiz attempt ID to submit'),
      },
    },
    async ({ courseId, attemptId }) => {
      const { client } = await getClient();
      const result = await submitQuizAttempt(client, courseId, attemptId);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── get_assignment_feedback ─────────────────────────────────────────────────
  server.registerTool(
    'get_assignment_feedback',
    {
      description:
        'Get professor feedback and scores for all assignments in a course. ' +
        'For each graded submission, shows score, instructor comments, and any feedback files attached by the professor.',
      inputSchema: { courseId: z.string().describe('Blackboard course ID') },
    },
    async ({ courseId }) => {
      const { client, session } = await getClient();

      const assignments = await listAssignments(client, courseId);

      const results = await Promise.all(
        assignments.map(async (col) => {
          try {
            const attempts = await listAttempts(client, courseId, col.id);
            if (!attempts.length) {
              return { assignment: col.name, columnId: col.id, status: 'no_attempts' };
            }

            // Most recent attempt first
            const latest = attempts.sort((a, b) =>
              (b.attemptDate ?? b.modified ?? '').localeCompare(a.attemptDate ?? a.modified ?? '')
            )[0];

            // Try to get feedback files (professor may have attached annotated docs)
            let feedbackFiles: any[] = [];
            try {
              feedbackFiles = await getAttemptFiles(client, courseId, col.id, latest.id);
            } catch {}

            return {
              assignment: col.name,
              columnId: col.id,
              contentId: col.contentId,
              due: col.grading?.due,
              maxScore: col.score?.possible,
              attempt: {
                id: latest.id,
                status: latest.status,
                score: latest.score,
                grade: latest.displayGrade?.text,
                submittedAt: latest.attemptDate ?? latest.modified,
                // Professor feedback — field name varies by BB version
                instructorFeedback:
                  latest.text ?? latest.instructorFeedback ?? latest.feedback ?? null,
                studentComments: latest.studentComments ?? null,
                feedbackFiles: feedbackFiles.map((f) => ({
                  id: f.id,
                  name: f.name,
                  mimeType: f.mimeType,
                  size: f.size,
                })),
              },
            };
          } catch {
            return { assignment: col.name, columnId: col.id, status: 'error_fetching' };
          }
        })
      );

      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    }
  );

  // ── download_feedback_file ───────────────────────────────────────────────────
  server.registerTool(
    'download_feedback_file',
    {
      description:
        '[EXPERIMENTAL] Download a feedback file that a professor attached to a graded attempt. ' +
        'Use the fileId from get_assignment_feedback → attempt.feedbackFiles. ' +
        'The download endpoint may not be available on all Blackboard versions.',
      inputSchema: {
        courseId: z.string().describe('Blackboard course ID'),
        columnId: z.string().describe('Gradebook column (assignment) ID'),
        attemptId: z.string().describe('Attempt ID from get_assignment_feedback'),
        fileId: z.string().describe('File ID from get_assignment_feedback → attempt.feedbackFiles'),
        filename: z.string().optional().describe('Filename to save as (defaults to the name from feedbackFiles)'),
        outputDir: z.string().optional().describe('Directory to save the file (default: current working directory)'),
      },
    },
    async ({ courseId, columnId, attemptId, fileId, filename, outputDir }) => {
      const { client } = await getClient();

      const url = `/learn/api/public/v2/courses/${courseId}/gradebook/columns/${columnId}/attempts/${attemptId}/files/${fileId}/download`;
      const r = await client.get(url, { responseType: 'arraybuffer', headers: { Accept: '*/*' } });

      const contentDisposition = r.headers['content-disposition'] as string | undefined;
      const detectedName = contentDisposition
        ? (contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/))?.[1]?.replace(/['"]/g, '').trim()
        : undefined;
      const finalName = filename ?? detectedName ?? `feedback_${fileId}`;

      const dir = path.resolve(outputDir ?? process.cwd());
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const dest = path.join(dir, finalName);
      fs.writeFileSync(dest, Buffer.from(r.data));

      const mimeType = (r.headers['content-type'] as string | undefined) ?? 'application/octet-stream';
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ saved: dest, size: r.data.byteLength, mimeType }, null, 2),
        }],
      };
    }
  );

  // ── raw_api ─────────────────────────────────────────────────────────────────
  server.registerTool(
    'raw_api',
    {
      description: 'Make a raw REST API call to Blackboard Learn. Use for any endpoint not covered by other tools.',
      inputSchema: {
        method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).describe('HTTP method'),
        path: z.string().describe('API path, e.g. /learn/api/public/v1/users/me'),
        query: z.string().optional().describe('Query string, e.g. limit=10&offset=0'),
        body: z.string().optional().describe('JSON body string for POST/PUT/PATCH'),
      },
    },
    async ({ method, path, query, body }) => {
      const { client } = await getClient();
      const params = query ? Object.fromEntries(new URLSearchParams(query)) : undefined;
      const data = body ? JSON.parse(body) : undefined;
      const r = await client.request({ method: method.toLowerCase() as any, url: path, params, data });
      return { content: [{ type: 'text', text: JSON.stringify(r.data, null, 2) }] };
    }
  );
}

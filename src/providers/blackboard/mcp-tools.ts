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

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB

async function getClient() {
  const session = await loadOrRefreshSession();
  if (!isSessionValid(session)) {
    throw new Error('Not authenticated. Ask the user to run: campus login');
  }
  return { client: createClient(session!), session: session! };
}

export function registerBlackboardTools(server: McpServer) {
  // ── blackboard_whoami ─────────────────────────────────────────────────────────────────
  server.registerTool('blackboard_whoami', { description: 'Get the currently authenticated UPC student info' }, async () => {
    const { client } = await getClient();
    const me = await getMe(client);
    return { content: [{ type: 'text', text: JSON.stringify(me, null, 2) }] };
  });

  // ── blackboard_system_version ─────────────────────────────────────────────────────────
  server.registerTool('blackboard_system_version', { description: 'Get Blackboard Learn server version' }, async () => {
    const { client } = await getClient();
    const v = await getSystemVersion(client);
    return { content: [{ type: 'text', text: JSON.stringify(v, null, 2) }] };
  });

  // ── blackboard_list_courses ────────────────────────────────────────────────────────────
  server.registerTool('blackboard_list_courses', { description: 'List all enrolled courses for the current student' }, async () => {
    const { client, session } = await getClient();
    let userId = session.userId;
    if (!userId) { const me = await getMe(client); userId = me.id; }
    const data = await getMyCourses(client, userId!, { limit: 50 });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  });

  // ── blackboard_get_course ──────────────────────────────────────────────────────────────
  server.registerTool(
    'blackboard_get_course',
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

  // ── blackboard_list_contents ───────────────────────────────────────────────────────────
  server.registerTool(
    'blackboard_list_contents',
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

  // ── blackboard_list_announcements ──────────────────────────────────────────────────────
  server.registerTool(
    'blackboard_list_announcements',
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

  // ── blackboard_list_assignments ────────────────────────────────────────────────────────
  server.registerTool(
    'blackboard_list_assignments',
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

  // ── blackboard_list_attempts ───────────────────────────────────────────────────────────
  server.registerTool(
    'blackboard_list_attempts',
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

  // ── blackboard_get_grades ──────────────────────────────────────────────────────────────
  server.registerTool(
    'blackboard_get_grades',
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

  // ── blackboard_download_attachment ─────────────────────────────────────────────────────
  server.registerTool(
    'blackboard_download_attachment',
    {
      description: 'Download a file from a course content item and save it to disk. attachmentId can be a Blackboard attachment ID (for x-bb-file) or a full bbcswebdav URL (for x-bb-document embedded files). Saves to outputDir (default: current working directory).',
      inputSchema: {
        courseId: z.string().describe('Blackboard course ID'),
        contentId: z.string().describe('Content item ID'),
        attachmentId: z.string().describe('Attachment ID from blackboard_list_attachments, or a full bbcswebdav URL for embedded files'),
        filename: z.string().optional().describe('Filename to save as (e.g. displayName from blackboard_list_attachments). Falls back to Content-Disposition header.'),
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

  // ── blackboard_list_attachments ────────────────────────────────────────────────────────
  server.registerTool(
    'blackboard_list_attachments',
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
            { type: 'embedded_files', note: 'Pass downloadUrl as attachmentId to blackboard_download_attachment', results: files },
            null, 2
          ),
        }],
      };
    }
  );

  // ── blackboard_download_file_url ───────────────────────────────────────────────────────
  server.registerTool(
    'blackboard_download_file_url',
    {
      description: 'Download a file directly from a Blackboard bbcswebdav URL and save it to disk. Saves to outputDir (default: current working directory).',
      inputSchema: {
        url: z.string().describe('Direct file URL from bbcswebdav (downloadUrl from blackboard_list_attachments)'),
        filename: z.string().optional().describe('Filename to save as (e.g. displayName from blackboard_list_attachments)'),
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

  // ── blackboard_upload_attempt_file ─────────────────────────────────────────────────────
  server.registerTool(
    'blackboard_upload_attempt_file',
    {
      description:
        'Upload a local file (image, PDF, doc, etc.) to Blackboard and get back a fileUploadId. ' +
        'This only uploads the file — it does NOT attach it to an attempt yet. ' +
        'Pass the returned fileUploadId(s) into blackboard_save_attempt_draft or blackboard_submit_attempt via fileUploadIds.',
      inputSchema: {
        filePath: z.string().describe('Absolute path to the local file to upload'),
      },
    },
    async ({ filePath }) => {
      const { client } = await getClient();
      const resolved = path.resolve(filePath);
      if (!fs.existsSync(resolved)) {
        throw new Error(`File not found: ${resolved}`);
      }
      const { size } = fs.statSync(resolved);
      if (size > MAX_UPLOAD_BYTES) {
        throw new Error(`File too large (${size} bytes). Max is ${MAX_UPLOAD_BYTES} bytes.`);
      }
      const fileUploadId = await uploadFile(client, resolved);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ fileUploadId, fileName: path.basename(resolved), size }, null, 2),
        }],
      };
    }
  );

  // ── blackboard_save_attempt_draft ──────────────────────────────────────────────────────
  server.registerTool(
    'blackboard_save_attempt_draft',
    {
      description:
        'Save progress on an assignment attempt WITHOUT submitting it — text, attached files, or both. ' +
        'The attempt stays open (status InProgress) so the student can keep editing it later. ' +
        'This does NOT send it to the instructor for grading — use blackboard_submit_attempt for that, ' +
        'and always confirm with the user before calling that one.',
      inputSchema: {
        courseId: z.string().describe('Blackboard course ID'),
        columnId: z.string().describe('Assignment (gradebook column) ID'),
        studentComments: z.string().optional().describe('Comment to the instructor'),
        studentSubmission: z.string().optional().describe('Text body of the submission'),
        fileUploadIds: z.array(z.string()).optional().describe(
          'fileUploadId(s) from blackboard_upload_attempt_file to attach to this draft'
        ),
      },
    },
    async ({ courseId, columnId, studentComments, studentSubmission, fileUploadIds }) => {
      const { client } = await getClient();
      const attempt = await submitAttempt(client, courseId, columnId, {
        studentComments,
        studentSubmission,
        fileUploadIds,
        status: 'InProgress',
      });
      return { content: [{ type: 'text', text: JSON.stringify(attempt, null, 2) }] };
    }
  );

  // ── blackboard_submit_attempt ──────────────────────────────────────────────────────────
  server.registerTool(
    'blackboard_submit_attempt',
    {
      description:
        'Submit (finalize) an assignment attempt for grading — text, attached files, or both. ' +
        'ALWAYS confirm with the user before submitting, showing exactly what will be sent. ' +
        'Once submitted the instructor can grade it; use blackboard_save_attempt_draft instead ' +
        'if the student just wants to save progress without sending it yet.',
      inputSchema: {
        courseId: z.string().describe('Blackboard course ID'),
        columnId: z.string().describe('Assignment (gradebook column) ID'),
        studentComments: z.string().optional().describe('Comment to the instructor'),
        studentSubmission: z.string().optional().describe('Text body of the submission'),
        fileUploadIds: z.array(z.string()).optional().describe(
          'fileUploadId(s) from blackboard_upload_attempt_file to attach to this submission'
        ),
      },
    },
    async ({ courseId, columnId, studentComments, studentSubmission, fileUploadIds }) => {
      const { client } = await getClient();
      const attempt = await submitAttempt(client, courseId, columnId, {
        studentComments,
        studentSubmission,
        fileUploadIds,
        status: 'NeedsGrading',
      });
      return { content: [{ type: 'text', text: JSON.stringify(attempt, null, 2) }] };
    }
  );

  // ── blackboard_get_assignment_feedback ─────────────────────────────────────────────────
  server.registerTool(
    'blackboard_get_assignment_feedback',
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

  // ── blackboard_download_feedback_file ───────────────────────────────────────────────────
  server.registerTool(
    'blackboard_download_feedback_file',
    {
      description:
        '[EXPERIMENTAL] Download a feedback file that a professor attached to a graded attempt. ' +
        'Use the fileId from blackboard_get_assignment_feedback → attempt.feedbackFiles. ' +
        'The download endpoint may not be available on all Blackboard versions.',
      inputSchema: {
        courseId: z.string().describe('Blackboard course ID'),
        columnId: z.string().describe('Gradebook column (assignment) ID'),
        attemptId: z.string().describe('Attempt ID from blackboard_get_assignment_feedback'),
        fileId: z.string().describe('File ID from blackboard_get_assignment_feedback → attempt.feedbackFiles'),
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

  // ── blackboard_raw_api ─────────────────────────────────────────────────────────────────
  server.registerTool(
    'blackboard_raw_api',
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

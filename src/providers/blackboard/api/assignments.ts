import type { AxiosInstance } from 'axios';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';

export interface GradeColumn {
  id: string;
  name: string;
  contentId?: string;
  score?: { possible: number };
  availability?: { available: string };
  grading?: {
    type: 'Attempts' | 'Manual' | 'Calculated';
    due?: string;
    attemptsAllowed?: number;
    scoringModel?: string;
  };
  gradebookCategoryId?: string;
  scoreProviderHandle?: string;
  includeInCalculations?: boolean;
}

export interface Attempt {
  id: string;
  userId?: string;
  status: string;
  displayGrade?: { score?: number; text?: string };
  score?: number;
  text?: string;
  studentComments?: string;
  studentSubmission?: string;
  created?: string;
  modified?: string;
  attemptDate?: string;
  files?: Array<{ id: string; fileName: string; mimeType: string }>;
  // Instructor feedback fields
  instructorFeedback?: string;
  feedback?: string;
}

export interface AttemptFile {
  id: string;
  name: string;
  mimeType?: string;
  size?: number;
  href?: string;
}

export interface SubmitAttemptBody {
  studentComments?: string;
  studentSubmission?: string;
  fileUploadIds?: string[];
  status?: string;
}

export async function listAssignments(
  client: AxiosInstance,
  courseId: string
): Promise<GradeColumn[]> {
  const r = await client.get(`/learn/api/public/v2/courses/${courseId}/gradebook/columns`, {
    params: { limit: 100 },
  });
  // Only return Attempts and Manual columns (student-relevant)
  return (r.data.results as GradeColumn[]).filter(
    (c) => c.grading?.type === 'Attempts' || c.grading?.type === 'Manual'
  );
}

export async function getAssignment(
  client: AxiosInstance,
  courseId: string,
  columnId: string
): Promise<GradeColumn> {
  const r = await client.get(`/learn/api/public/v2/courses/${courseId}/gradebook/columns/${columnId}`);
  return r.data;
}

export async function listAttempts(
  client: AxiosInstance,
  courseId: string,
  columnId: string
): Promise<Attempt[]> {
  const r = await client.get(
    `/learn/api/public/v2/courses/${courseId}/gradebook/columns/${columnId}/attempts`,
    { params: { limit: 20 } }
  );
  return r.data.results;
}

export async function getAttempt(
  client: AxiosInstance,
  courseId: string,
  columnId: string,
  attemptId: string
): Promise<Attempt> {
  const r = await client.get(
    `/learn/api/public/v2/courses/${courseId}/gradebook/columns/${columnId}/attempts/${attemptId}`
  );
  return r.data;
}

export async function uploadFile(
  client: AxiosInstance,
  filePath: string
): Promise<string> {
  const fileName = path.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);

  const form = new FormData();
  form.append('file', fileBuffer, {
    filename: fileName,
    contentType: 'application/octet-stream',
  });

  const r = await client.post('/learn/api/public/v1/uploads', form, {
    headers: {
      ...form.getHeaders(),
    },
  });
  return r.data.id as string;
}

export async function submitAttempt(
  client: AxiosInstance,
  courseId: string,
  columnId: string,
  body: SubmitAttemptBody
): Promise<Attempt> {
  const r = await client.post(
    `/learn/api/public/v2/courses/${courseId}/gradebook/columns/${columnId}/attempts`,
    { ...body, status: body.status ?? 'NeedsGrading' }
  );
  return r.data;
}

export async function getAttemptFiles(
  client: AxiosInstance,
  courseId: string,
  columnId: string,
  attemptId: string
): Promise<AttemptFile[]> {
  const r = await client.get(
    `/learn/api/public/v2/courses/${courseId}/gradebook/columns/${columnId}/attempts/${attemptId}/files`
  );
  return r.data.results ?? [];
}

export async function getMyGrade(
  client: AxiosInstance,
  courseId: string,
  columnId: string,
  userId: string
): Promise<any> {
  const r = await client.get(
    `/learn/api/public/v1/courses/${courseId}/gradebook/users/${userId}/columns/${columnId}`
  );
  return r.data;
}

import type { AxiosInstance } from 'axios';
import type { Course, UserCourse, PaginatedResponse } from '../types.js';

export async function getMe(client: AxiosInstance): Promise<any> {
  const r = await client.get('/learn/api/public/v1/users/me');
  return r.data;
}

export async function getMyCourses(
  client: AxiosInstance,
  userId: string,
  opts: { limit?: number; offset?: number } = {}
): Promise<PaginatedResponse<UserCourse & { course?: Course }>> {
  const params: Record<string, any> = { limit: opts.limit ?? 50 };
  if (opts.offset) params.offset = opts.offset;

  params.expand = 'course';
  const r = await client.get(`/learn/api/public/v1/users/${userId}/courses`, { params });
  return { results: r.data.results, paging: r.data.paging };
}

export async function getCourse(client: AxiosInstance, courseId: string): Promise<Course> {
  const r = await client.get(`/learn/api/public/v1/courses/${courseId}`);
  return r.data;
}

export async function listCourses(
  client: AxiosInstance,
  opts: { limit?: number; offset?: number } = {}
): Promise<PaginatedResponse<Course>> {
  const r = await client.get('/learn/api/public/v1/courses', {
    params: { limit: opts.limit ?? 50, offset: opts.offset ?? 0 },
  });
  return r.data;
}

export async function getCourseContents(
  client: AxiosInstance,
  courseId: string,
  parentId?: string
): Promise<PaginatedResponse<any>> {
  const path = parentId
    ? `/learn/api/public/v1/courses/${courseId}/contents/${parentId}/children`
    : `/learn/api/public/v1/courses/${courseId}/contents`;
  const r = await client.get(path, {
    params: {
      limit: 100,
      fields: 'id,parentId,title,body,created,modified,position,hasChildren,launchInNewWindow,availability,contentHandler',
    },
  });
  return r.data;
}

export async function getCourseAnnouncements(
  client: AxiosInstance,
  courseId: string
): Promise<PaginatedResponse<any>> {
  const r = await client.get(`/learn/api/public/v1/courses/${courseId}/announcements`, {
    params: { limit: 20 },
  });
  return r.data;
}

export async function getGradeColumns(
  client: AxiosInstance,
  courseId: string
): Promise<PaginatedResponse<any>> {
  const r = await client.get(`/learn/api/public/v1/courses/${courseId}/gradebook/columns`, {
    params: { limit: 50 },
  });
  return r.data;
}

export async function getGrades(
  client: AxiosInstance,
  courseId: string,
  userId: string
): Promise<PaginatedResponse<any>> {
  const r = await client.get(
    `/learn/api/public/v1/courses/${courseId}/gradebook/users/${userId}`,
    { params: { limit: 50 } }
  );
  return r.data;
}

export async function getCourseMemberships(
  client: AxiosInstance,
  courseId: string
): Promise<PaginatedResponse<any>> {
  const r = await client.get(`/learn/api/public/v1/courses/${courseId}/users`, {
    params: { limit: 100 },
  });
  return r.data;
}

export async function getSystemVersion(client: AxiosInstance): Promise<any> {
  const r = await client.get('/learn/api/public/v1/system/version');
  return r.data;
}

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
      fields: 'id,parentId,title,body,created,modified,position,hasChildren,hasGradebookColumns,hasAssociatedGroups,launchInNewWindow,availability,contentHandler',
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

function compactParams(params: Record<string, any>): Record<string, any> {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined));
}

export async function getCourseDiscussions(
  client: AxiosInstance,
  courseId: string,
  opts: { limit?: number; offset?: number; title?: string; gradable?: boolean; sort?: string } = {}
): Promise<PaginatedResponse<any>> {
  const r = await client.get(`/learn/api/public/v1/courses/${courseId}/discussions`, {
    params: compactParams({
      limit: opts.limit ?? 100,
      offset: opts.offset,
      title: opts.title,
      gradable: opts.gradable,
      sort: opts.sort,
    }),
  });
  return r.data;
}

export async function getCourseDiscussion(
  client: AxiosInstance,
  courseId: string,
  discussionId: string
): Promise<any> {
  const r = await client.get(`/learn/api/public/v1/courses/${courseId}/discussions/${discussionId}`);
  return r.data;
}

export async function getDiscussionMessages(
  client: AxiosInstance,
  courseId: string,
  discussionId: string,
  opts: {
    limit?: number;
    offset?: number;
    groupId?: string;
    userId?: string;
    status?: 'Published' | 'Deleted' | 'Draft';
    isRead?: boolean;
    sort?: string;
  } = {}
): Promise<PaginatedResponse<any>> {
  const r = await client.get(`/learn/api/public/v1/courses/${courseId}/discussions/${discussionId}/messages`, {
    params: compactParams({
      limit: opts.limit ?? 100,
      offset: opts.offset,
      groupId: opts.groupId,
      userId: opts.userId,
      status: opts.status,
      isRead: opts.isRead,
      sort: opts.sort,
    }),
  });
  return r.data;
}

export async function getDiscussionMessageReplies(
  client: AxiosInstance,
  courseId: string,
  discussionId: string,
  messageId: string,
  opts: {
    limit?: number;
    offset?: number;
    groupId?: string;
    userId?: string;
    status?: 'Published' | 'Deleted' | 'Draft';
    isRead?: boolean;
    sort?: string;
  } = {}
): Promise<PaginatedResponse<any>> {
  const r = await client.get(
    `/learn/api/public/v1/courses/${courseId}/discussions/${discussionId}/messages/${messageId}/replies`,
    {
      params: compactParams({
        limit: opts.limit ?? 100,
        offset: opts.offset,
        groupId: opts.groupId,
        userId: opts.userId,
        status: opts.status,
        isRead: opts.isRead,
        sort: opts.sort,
      }),
    }
  );
  return r.data;
}

/** Blackboard Ultra's authenticated inbox summary (not part of the public REST API). */
export async function getMessageCourseSummaries(
  client: AxiosInstance,
  opts: { limit?: number; offset?: number } = {}
): Promise<PaginatedResponse<any>> {
  const params: Record<string, number> = { limit: opts.limit ?? 50 };
  if (opts.offset !== undefined) params.offset = opts.offset;
  const r = await client.get('/learn/api/v1/messages/summary', { params });
  return r.data;
}

/** Conversations for one course in Blackboard Ultra's authenticated UI API. */
export async function getCourseConversations(
  client: AxiosInstance,
  courseId: string,
  opts: { limit?: number; offset?: number } = {}
): Promise<PaginatedResponse<any>> {
  if (!/^_\d+_\d+$/.test(courseId)) {
    throw new Error(`courseId must look like a Blackboard ID, e.g. _529580_1`);
  }
  const params: Record<string, number> = { limit: opts.limit ?? 100 };
  if (opts.offset !== undefined) params.offset = opts.offset;
  const r = await client.get(`/learn/api/v1/courses/${courseId}/conversations`, { params });
  return r.data;
}

/**
 * Read additional Ultra conversation pages without allowing one inbox request
 * to grow without bound. Callers surface `truncated` so an assistant never
 * mistakes the bounded result for a complete long-running conversation list.
 */
export async function getCourseConversationsPageSet(
  client: AxiosInstance,
  courseId: string,
  opts: { limit?: number; maxPages?: number } = {}
): Promise<{ results: any[]; truncated: boolean }> {
  const maxPages = opts.maxPages ?? 5;
  let page = await getCourseConversations(client, courseId, { limit: opts.limit ?? 100 });
  const results = [...page.results];
  let nextPage = page.paging?.nextPage;
  for (let pageNumber = 1; nextPage && pageNumber < maxPages; pageNumber += 1) {
    if (!nextPage.startsWith(`/learn/api/v1/courses/${courseId}/conversations?`)) {
      throw new Error('Refusing an unexpected Blackboard conversation page');
    }
    const response = await client.get(nextPage);
    page = response.data;
    results.push(...(page.results ?? []));
    nextPage = page.paging?.nextPage;
  }
  return { results, truncated: Boolean(nextPage) };
}

export async function getGradeColumns(
  client: AxiosInstance,
  courseId: string
): Promise<PaginatedResponse<any>> {
  const path = `/learn/api/public/v1/courses/${courseId}/gradebook/columns`;
  let page = await client.get(path, {
    params: { limit: 50 },
  });
  const results: any[] = [];

  while (true) {
    results.push(...(page.data.results ?? []));
    const nextPage = page.data.paging?.nextPage as string | undefined;
    if (!nextPage) break;
    if (!nextPage.startsWith(path)) {
      throw new Error('Refusing an unexpected Blackboard gradebook columns page');
    }
    page = await client.get(nextPage);
  }

  return { results, paging: page.data.paging };
}

export async function getGrades(
  client: AxiosInstance,
  courseId: string,
  userId: string,
  opts: { limit?: number } = {}
): Promise<PaginatedResponse<any>> {
  const path = `/learn/api/public/v1/courses/${courseId}/gradebook/users/${userId}`;
  let page = await client.get(path, { params: { limit: opts.limit ?? 50 } });
  const results: any[] = [];

  while (true) {
    results.push(...(page.data.results ?? []));
    const nextPage = page.data.paging?.nextPage as string | undefined;
    if (!nextPage) break;
    if (!nextPage.startsWith(path)) {
      throw new Error('Refusing an unexpected Blackboard grades page');
    }
    page = await client.get(nextPage);
  }

  return { results, paging: page.data.paging };
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

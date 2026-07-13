export interface Session {
  cookies: Cookie[];
  xsrfToken: string;
  userId?: string;
  userName?: string;
  expiresAt: number; // unix ms
}

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

export interface Course {
  id: string;
  courseId: string;
  name: string;
  description?: string;
  externalId?: string;
  created?: string;
  modified?: string;
  term?: { id: string; name: string };
  availability?: { available: string };
  enrollment?: { type: string };
  ultraStatus?: string;
}

export interface UserCourse {
  userId: string;
  courseId: string;
  dataSourceId?: string;
  created?: string;
  modified?: string;
  availability?: { available: string };
  courseRoleId?: string;
  lastAccessDate?: string;
  childCourseId?: string;
  course?: Course;
}

export interface CourseContent {
  id: string;
  parentId?: string;
  title: string;
  body?: string;
  created?: string;
  modified?: string;
  position?: number;
  hasChildren?: boolean;
  launchInNewWindow?: boolean;
  availability?: { available: string; adaptiveRelease?: object };
  contentHandler?: {
    id: string;
    url?: string;
    file?: { uploadId: string; fileName: string; mimeType: string; size: number };
  };
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  creator?: string;
  created?: string;
  modified?: string;
  availability?: { available: string; duration?: { type: string; start?: string; end?: string } };
  showReorder?: boolean;
}

export interface GradeColumn {
  id: string;
  externalId?: string;
  name: string;
  displayName?: string;
  description?: string;
  externalGrade?: boolean;
  created?: string;
  score?: { possible: number; decimalPlaces: number };
  availability?: { available: string };
  gradingPeriodId?: string;
  contentId?: string;
  formula?: { formulaType: string };
  includeInCalculations?: boolean;
  showStatisticsToStudents?: boolean;
}

export interface PaginatedResponse<T> {
  results: T[];
  paging?: {
    nextPage?: string;
  };
}

export interface BBError {
  status: number;
  message: string;
  extraInfo?: string;
}

export type RoleKey = "platform_admin" | "school_admin" | "teacher" | "student" | "parent" | "tutor";

export type TenantType = "institution" | "individual";

export type AssignmentType = "practice" | "assessment";

export type AssignmentSource = "manual" | "subject_auto";

export type EnrollmentStatus = "active" | "completed";

export interface AuthContext {
  membershipId: string;
  tenantId: string;
  tenantName: string;
  tenantType: TenantType;
  role: RoleKey;
}

export interface MeResponse {
  id: string;
  email: string;
  role: RoleKey;
  displayRole: string;
  isPlatformAdmin: boolean;
  activeContext: AuthContext;
  contexts: AuthContext[];
  permissions: string[];
}

export interface SubjectRef {
  id: string;
  tenantId?: string;
  name: string;
  teacherOwnerId: string;
}

export interface SubjectSummary extends SubjectRef {
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  teacherOwner?: {
    id: string;
    email: string;
  };
  _count?: {
    lessons: number;
    exams: number;
    enrollments: number;
  };
}

export interface SubjectRosterItem {
  id: string;
  subjectId: string;
  studentId: string;
  status: EnrollmentStatus;
  autoAssignFuture: boolean;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  student: {
    id: string;
    email: string;
    isActive: boolean;
  };
}

export interface TeacherListItem {
  id: string;
  email: string;
  role: "teacher";
  isActive: boolean;
  createdAt: string;
}

export interface LessonSummary {
  id: string;
  title: string;
  gradeLevel?: string | null;
  subjectId: string;
  subject: SubjectRef;
}

export interface ExamSummary {
  id: string;
  title: string;
  subjectId: string;
  subject: SubjectRef;
}

export interface Assignment {
  id: string;
  examId?: string;
  lessonId?: string;
  dueAt?: string;
  assignmentType: AssignmentType;
  assignmentSource: AssignmentSource;
  maxAttempts: number;
  attemptsUsed: number;
  subjectEnrollmentStatus?: EnrollmentStatus | null;
  subject?: SubjectRef | null;
  exam?: {
    id: string;
    title: string;
    subject: SubjectRef;
  } | null;
  lesson?: {
    id: string;
    title: string;
    subject: SubjectRef;
    gradeLevel?: string | null;
  } | null;
}

export interface ExamQuestion {
  id: string;
  type: "multiple-choice" | "true-false" | "short-answer" | "long-answer";
  prompt: string;
  choices?: string[];
}

export interface ExamDetails {
  id: string;
  title: string;
  subjectId: string;
  subject: SubjectRef;
  questions: ExamQuestion[];
}

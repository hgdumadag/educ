export type RoleKey =
  | "platform_admin"
  | "school_admin"
  | "teacher"
  | "student"
  | "parent"
  | "tutor";

export type TenantType = "institution" | "individual";

export type MembershipStatus = "active" | "invited" | "disabled";

export type AttemptStatus =
  | "in_progress"
  | "submitted"
  | "graded"
  | "needs_review";

export type AssignmentType = "practice" | "assessment";
export type AssignmentSource = "manual" | "subject_auto";
export type EnrollmentStatus = "active" | "completed";

export type QuestionType =
  | "multiple-choice"
  | "true-false"
  | "short-answer"
  | "long-answer";

export interface AuthContext {
  membershipId: string;
  tenantId: string;
  tenantName: string;
  tenantType: TenantType;
  role: RoleKey;
}

export interface MembershipSummary {
  id: string;
  tenantId: string;
  userId: string;
  role: RoleKey;
  status: MembershipStatus;
}

export interface AuthUser {
  id: string;
  email: string;
  role: RoleKey;
  displayRole: string;
  isPlatformAdmin: boolean;
  activeContext: AuthContext;
  contexts: AuthContext[];
}

export interface AuthResponse {
  user: AuthUser;
}

export interface UploadValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  normalizedPreview: unknown | null;
}

export interface NormalizedQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  choices?: string[];
  correctAnswer?: string | boolean;
  rubric?: string;
  points?: number;
}

export interface NormalizedExam {
  title: string;
  subject: string;
  settings: {
    timeLimitMinutes: number;
    passingScorePercent: number;
  };
  questions: NormalizedQuestion[];
}

export interface GradedQuestion {
  questionId: string;
  scorePercent: number;
  feedback?: string;
  needsReview?: boolean;
}

export interface GradingResult {
  scorePercent: number;
  perQuestion: GradedQuestion[];
  status: AttemptStatus;
}

export interface AssignmentCreatePayload {
  studentIds: string[];
  lessonId?: string;
  examId?: string;
  dueAt?: string;
  assignmentType?: AssignmentType;
  maxAttempts?: number;
}

export interface AttemptResponsePayload {
  questionId: string;
  answer: unknown;
}

export interface AttemptSubmitSummary {
  objectiveCount: number;
  llmCount: number;
  reviewCount: number;
}

export interface CreateAttemptPayload {
  assignmentId: string;
}

export interface SubjectSummary {
  id: string;
  tenantId: string;
  teacherOwnerId: string;
  name: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SubjectEnrollment {
  id: string;
  tenantId: string;
  subjectId: string;
  studentId: string;
  status: EnrollmentStatus;
  autoAssignFuture: boolean;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubjectRosterItem {
  enrollment: SubjectEnrollment;
  student: {
    id: string;
    email: string;
    isActive: boolean;
  };
}

export interface BillingAccountSummary {
  id: string;
  ownerType: "tenant" | "user";
  ownerId: string;
  plan: string;
  status: "active" | "trialing" | "past_due" | "canceled";
}

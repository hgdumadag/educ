export type RoleKey = "admin" | "teacher" | "student";

export type AttemptStatus =
  | "in_progress"
  | "submitted"
  | "graded"
  | "needs_review";

export type AssignmentType = "practice" | "assessment";

export type QuestionType =
  | "multiple-choice"
  | "true-false"
  | "short-answer"
  | "long-answer";

export interface AuthUser {
  id: string;
  role: RoleKey;
  displayRole: string;
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

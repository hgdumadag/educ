export type RoleKey = "admin" | "teacher" | "student";

export interface MeResponse {
  id: string;
  email: string;
  role: RoleKey;
  displayRole: string;
  permissions: string[];
}

export interface Assignment {
  id: string;
  examId?: string;
  lessonId?: string;
  dueAt?: string;
  assignmentType: "practice" | "assessment";
  maxAttempts: number;
  attemptsUsed: number;
  exam?: {
    id: string;
    title: string;
    subject: string;
  } | null;
  lesson?: {
    id: string;
    title: string;
    subject: string;
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
  subject: string;
  questions: ExamQuestion[];
}

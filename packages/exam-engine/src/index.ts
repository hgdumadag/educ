import type {
  GradedQuestion,
  GradingResult,
  NormalizedExam,
  NormalizedQuestion,
  QuestionType,
} from "@educ/shared-types";

type RawExam = Record<string, unknown>;

type ValidationResult = {
  normalized: NormalizedExam | null;
  errors: string[];
  warnings: string[];
};

const TYPE_ALIASES: Record<string, QuestionType> = {
  mcq: "multiple-choice",
  "multiple-choice": "multiple-choice",
  multiple_choice: "multiple-choice",
  tf: "true-false",
  "true-false": "true-false",
  true_false: "true-false",
  short: "short-answer",
  "short-answer": "short-answer",
  short_answer: "short-answer",
  long: "long-answer",
  "long-answer": "long-answer",
  long_answer: "long-answer",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function normalizeQuestionType(type: unknown): QuestionType | null {
  if (typeof type !== "string") {
    return null;
  }

  return TYPE_ALIASES[type.trim().toLowerCase()] ?? null;
}

function slugSafeId(candidate: string, fallbackIndex: number): string {
  const normalized = candidate
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!normalized) {
    return `q${fallbackIndex}`;
  }

  return normalized;
}

function normalizeQuestion(
  question: RawExam,
  index: number,
  seenIds: Set<string>,
): { value: NormalizedQuestion | null; error?: string } {
  const type = normalizeQuestionType(question.type);
  if (!type) {
    return { value: null, error: `Unsupported question type at index ${index}` };
  }

  const promptValue = question.prompt ?? question.questionText;
  if (typeof promptValue !== "string" || !promptValue.trim()) {
    return { value: null, error: `Missing prompt at question index ${index}` };
  }

  const sourceId = typeof question.id === "string" ? question.id : `q${index}`;
  let questionId = slugSafeId(sourceId, index);
  if (seenIds.has(questionId)) {
    questionId = `q${index}`;
  }

  if (seenIds.has(questionId)) {
    return { value: null, error: `Duplicate question id after normalization: ${questionId}` };
  }
  seenIds.add(questionId);

  const normalized: NormalizedQuestion = {
    id: questionId,
    type,
    prompt: promptValue.trim(),
    points: typeof question.points === "number" && question.points > 0 ? question.points : 1,
  };

  if (type === "multiple-choice") {
    const choices = Array.isArray(question.options) ? question.options : question.choices;
    if (!Array.isArray(choices) || choices.some((item) => typeof item !== "string")) {
      return { value: null, error: `Malformed answer schema for ${questionId}` };
    }
    normalized.choices = choices as string[];
    normalized.correctAnswer =
      typeof question.correctAnswer === "string" ? question.correctAnswer : undefined;
  }

  if (type === "true-false") {
    const answer = question.correctAnswer;
    if (typeof answer === "boolean") {
      normalized.correctAnswer = answer;
    } else if (answer === "true" || answer === "false") {
      normalized.correctAnswer = answer === "true";
    }
  }

  if (type === "short-answer" || type === "long-answer") {
    if (typeof question.rubric === "string" && question.rubric.trim()) {
      normalized.rubric = question.rubric;
    }
  }

  return { value: normalized };
}

export function normalizeExamPayload(input: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const root = asRecord(input);
  if (!root) {
    return { normalized: null, errors: ["Malformed exam payload"], warnings };
  }

  const metadata = asRecord(root.examMetadata) ?? root;
  const title =
    typeof metadata.title === "string"
      ? metadata.title.trim()
      : typeof root.title === "string"
        ? root.title.trim()
        : "";

  if (!title) {
    errors.push("missing title or question set");
  }

  const subject =
    typeof metadata.subject === "string"
      ? metadata.subject.trim()
      : typeof root.subject === "string"
        ? root.subject.trim()
        : "General";

  const rawQuestions = Array.isArray(root.questions) ? root.questions : null;
  if (!rawQuestions || rawQuestions.length === 0) {
    errors.push("missing title or question set");
  }

  const settings = asRecord(root.settings) ?? {};
  const timeLimitMinutes =
    typeof settings.timeLimitMinutes === "number" && settings.timeLimitMinutes > 0
      ? settings.timeLimitMinutes
      : 30;
  const passingScorePercent =
    typeof settings.passingScorePercent === "number" && settings.passingScorePercent > 0
      ? settings.passingScorePercent
      : 70;

  const normalizedQuestions: NormalizedQuestion[] = [];
  const seenIds = new Set<string>();

  for (let index = 0; index < (rawQuestions?.length ?? 0); index += 1) {
    const raw = asRecord(rawQuestions?.[index]);
    if (!raw) {
      errors.push(`Malformed question entry at index ${index}`);
      continue;
    }

    const result = normalizeQuestion(raw, index + 1, seenIds);
    if (result.error) {
      errors.push(result.error);
      continue;
    }

    if (result.value) {
      normalizedQuestions.push(result.value);
    }
  }

  if (errors.length > 0) {
    return { normalized: null, errors, warnings };
  }

  return {
    normalized: {
      title,
      subject,
      settings: {
        timeLimitMinutes,
        passingScorePercent,
      },
      questions: normalizedQuestions,
    },
    errors,
    warnings,
  };
}

export function gradeObjectiveQuestion(
  question: NormalizedQuestion,
  answer: unknown,
): GradedQuestion {
  if (question.type === "multiple-choice") {
    const isCorrect = typeof answer === "string" && answer === question.correctAnswer;
    return {
      questionId: question.id,
      scorePercent: isCorrect ? 100 : 0,
      feedback: isCorrect ? "Correct" : "Incorrect",
    };
  }

  if (question.type === "true-false") {
    const normalizedAnswer =
      typeof answer === "boolean" ? answer : answer === "true" ? true : answer === "false" ? false : null;
    const isCorrect = normalizedAnswer !== null && normalizedAnswer === question.correctAnswer;
    return {
      questionId: question.id,
      scorePercent: isCorrect ? 100 : 0,
      feedback: isCorrect ? "Correct" : "Incorrect",
    };
  }

  return {
    questionId: question.id,
    scorePercent: 0,
    feedback: "Requires LLM/manual grading",
    needsReview: true,
  };
}

export function gradeObjectiveAttempt(
  exam: NormalizedExam,
  responseMap: Map<string, unknown>,
): GradingResult {
  const perQuestion: GradedQuestion[] = exam.questions.map((question) => {
    const answer = responseMap.get(question.id);
    return gradeObjectiveQuestion(question, answer);
  });

  const total = perQuestion.reduce((sum, item) => sum + item.scorePercent, 0);
  const objectiveCount = perQuestion.length || 1;
  const scorePercent = Math.round(total / objectiveCount);
  const hasReviewItems = perQuestion.some((item) => item.needsReview);

  return {
    scorePercent,
    perQuestion,
    status: hasReviewItems ? "needs_review" : "graded",
  };
}

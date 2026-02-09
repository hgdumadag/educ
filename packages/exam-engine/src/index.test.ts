import { describe, expect, it } from "vitest";

import { normalizeExamPayload } from "./index.js";

describe("normalizeExamPayload", () => {
  it("rejects multiple-choice questions without a correct answer", () => {
    const result = normalizeExamPayload({
      title: "Math Quiz",
      subject: "Math",
      questions: [
        {
          id: "q1",
          type: "multiple-choice",
          prompt: "2 + 2 = ?",
          choices: ["3", "4", "5"],
        },
      ],
    });

    expect(result.normalized).toBeNull();
    expect(result.errors.some((entry) => entry.includes("missing a correctAnswer"))).toBe(true);
  });

  it("rejects true-false questions without valid correct answer", () => {
    const result = normalizeExamPayload({
      title: "Science Quiz",
      subject: "Science",
      questions: [
        {
          id: "q2",
          type: "true-false",
          prompt: "Water boils at 100C",
          correctAnswer: "maybe",
        },
      ],
    });

    expect(result.normalized).toBeNull();
    expect(result.errors.some((entry) => entry.includes("missing a valid correctAnswer"))).toBe(true);
  });

  it("accepts valid objective answer keys", () => {
    const result = normalizeExamPayload({
      title: "History Quiz",
      subject: "History",
      questions: [
        {
          id: "q3",
          type: "multiple-choice",
          prompt: "Capital of France?",
          choices: ["Paris", "Rome", "Berlin"],
          correctAnswer: "Paris",
        },
        {
          id: "q4",
          type: "true-false",
          prompt: "The sky is blue.",
          correctAnswer: true,
        },
      ],
    });

    expect(result.errors).toEqual([]);
    expect(result.normalized?.questions).toHaveLength(2);
  });
});

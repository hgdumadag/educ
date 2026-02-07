import { Injectable } from "@nestjs/common";
import OpenAI from "openai";

import { env } from "../env.js";

export interface OpenAiGradeResult {
  scorePercent: number;
  feedback: string;
  needsReview?: boolean;
}

@Injectable()
export class OpenAiService {
  private readonly client: OpenAI | null;

  constructor() {
    this.client = env.openAiApiKey ? new OpenAI({ apiKey: env.openAiApiKey }) : null;
  }

  async gradeTextAnswer(args: {
    prompt: string;
    rubric?: string;
    answer: string;
  }): Promise<OpenAiGradeResult> {
    if (!this.client) {
      throw new Error("OpenAI API key is not configured");
    }

    const response = await this.client.chat.completions.create({
      model: env.openAiModel,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You are a strict exam grader. Return JSON only: {\"scorePercent\":number,\"feedback\":string}",
        },
        {
          role: "user",
          content: `Question: ${args.prompt}\nRubric: ${args.rubric ?? "N/A"}\nAnswer: ${args.answer}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("OpenAI returned non-JSON grading response");
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      scorePercent?: number;
      feedback?: string;
    };

    const scorePercent =
      typeof parsed.scorePercent === "number"
        ? Math.max(0, Math.min(100, Math.round(parsed.scorePercent)))
        : 0;

    return {
      scorePercent,
      feedback:
        typeof parsed.feedback === "string" && parsed.feedback.trim()
          ? parsed.feedback
          : "Needs manual review.",
    };
  }
}

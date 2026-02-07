import type { Assignment, ExamDetails, MeResponse, Session } from "../types";

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api";

async function request<T>(
  path: string,
  options: RequestInit = {},
  accessToken?: string,
): Promise<T> {
  const headers = new Headers(options.headers ?? {});
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with status ${response.status}`);
  }

  if (response.headers.get("content-type")?.includes("application/json")) {
    return (await response.json()) as T;
  }

  return (await response.text()) as T;
}

export const api = {
  async login(identifier: string, password: string): Promise<{ user: MeResponse } & Session> {
    return request<{ user: MeResponse } & Session>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    });
  },

  async me(accessToken: string): Promise<MeResponse> {
    return request<MeResponse>("/auth/me", { method: "GET" }, accessToken);
  },

  async logout(accessToken: string): Promise<void> {
    await request("/auth/logout", { method: "POST" }, accessToken);
  },

  async createUser(
    accessToken: string,
    payload: { email: string; password: string; role: "teacher" | "student" },
  ) {
    return request("/admin/users", {
      method: "POST",
      body: JSON.stringify(payload),
    }, accessToken);
  },

  async getAuditEvents(accessToken: string) {
    return request<Array<{ id: string; action: string; createdAt: string }>>(
      "/admin/audit-events",
      { method: "GET" },
      accessToken,
    );
  },

  async uploadLesson(accessToken: string, file: File) {
    const body = new FormData();
    body.append("file", file);
    return request("/lessons/upload", { method: "POST", body }, accessToken);
  },

  async uploadExam(accessToken: string, file: File) {
    const body = new FormData();
    body.append("file", file);
    return request("/exams/upload", { method: "POST", body }, accessToken);
  },

  async listExams(accessToken: string) {
    return request<Array<{ id: string; title: string; subject: string }>>(
      "/exams",
      { method: "GET" },
      accessToken,
    );
  },

  async createAssignment(
    accessToken: string,
    payload: { studentIds: string[]; examId?: string; lessonId?: string; dueAt?: string },
  ) {
    return request("/assignments", {
      method: "POST",
      body: JSON.stringify(payload),
    }, accessToken);
  },

  async myAssignments(accessToken: string): Promise<Assignment[]> {
    return request<Assignment[]>("/assignments/my", { method: "GET" }, accessToken);
  },

  async examDetails(accessToken: string, examId: string): Promise<ExamDetails> {
    return request<ExamDetails>(`/exams/${examId}`, { method: "GET" }, accessToken);
  },

  async createAttempt(accessToken: string, examId: string): Promise<{ id: string }> {
    return request<{ id: string }>(
      "/attempts",
      {
        method: "POST",
        body: JSON.stringify({ examId }),
      },
      accessToken,
    );
  },

  async saveResponses(
    accessToken: string,
    attemptId: string,
    responses: Array<{ questionId: string; answer: unknown }>,
  ) {
    return request(`/attempts/${attemptId}/responses`, {
      method: "PATCH",
      body: JSON.stringify({ responses }),
    }, accessToken);
  },

  async submitAttempt(accessToken: string, attemptId: string) {
    return request<{ id: string; status: string; scorePercent: number }>(
      `/attempts/${attemptId}/submit`,
      { method: "POST" },
      accessToken,
    );
  },

  async attemptResult(accessToken: string, attemptId: string) {
    return request(`/attempts/${attemptId}/result`, { method: "GET" }, accessToken);
  },
};

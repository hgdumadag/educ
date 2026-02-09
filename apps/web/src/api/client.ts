import type { Assignment, ExamDetails, MeResponse } from "../types";

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api";
const CSRF_COOKIE = "educ_csrf_token";

let refreshInFlight: Promise<boolean> | null = null;

function isMutatingMethod(method: string): boolean {
  const normalized = method.toUpperCase();
  return normalized === "POST" || normalized === "PATCH" || normalized === "PUT" || normalized === "DELETE";
}

function readCookie(name: string): string | null {
  const cookie = document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`));
  if (!cookie) {
    return null;
  }

  return decodeURIComponent(cookie.slice(name.length + 1));
}

async function parseError(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await response.json() as { message?: string | string[] };
    if (Array.isArray(body.message)) {
      return body.message.join(", ");
    }
    if (typeof body.message === "string") {
      return body.message;
    }
  }

  const text = await response.text();
  return text || `Request failed with status ${response.status}`;
}

async function tryRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const response = await fetch(`${baseUrl}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      return response.ok;
    })();
  }

  const result = await refreshInFlight;
  refreshInFlight = null;
  return result;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  shouldRetry = true,
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = new Headers(options.headers ?? {});
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (isMutatingMethod(method)) {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) {
      headers.set("x-csrf-token", csrf);
    }
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    method,
    credentials: "include",
    headers,
  });

  if (response.status === 401 && shouldRetry && path !== "/auth/login" && path !== "/auth/refresh") {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return request<T>(path, options, false);
    }
  }

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  if (response.headers.get("content-type")?.includes("application/json")) {
    return (await response.json()) as T;
  }

  return (await response.text()) as T;
}

export const api = {
  async login(identifier: string, password: string): Promise<{ user: MeResponse }> {
    return request<{ user: MeResponse }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    });
  },

  async me(): Promise<MeResponse> {
    return request<MeResponse>("/auth/me", { method: "GET" });
  },

  async logout(): Promise<void> {
    await request("/auth/logout", { method: "POST" });
  },

  async createUser(payload: { email: string; password: string; role: "teacher" | "student" }) {
    return request("/admin/users", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async getAuditEvents() {
    return request<{ items: Array<{ id: string; action: string; createdAt: string }> }>(
      "/admin/audit-events?page=1&pageSize=10",
      { method: "GET" },
    );
  },

  async uploadLesson(file: File) {
    const body = new FormData();
    body.append("file", file);
    return request("/lessons/upload", { method: "POST", body });
  },

  async uploadExam(file: File) {
    const body = new FormData();
    body.append("file", file);
    return request("/exams/upload", { method: "POST", body });
  },

  async listExams() {
    return request<Array<{ id: string; title: string; subject: string }>>(
      "/exams",
      { method: "GET" },
    );
  },

  async createAssignment(payload: {
    studentIds: string[];
    examId?: string;
    lessonId?: string;
    dueAt?: string;
    assignmentType?: "practice" | "assessment";
    maxAttempts?: number;
  }) {
    return request("/assignments", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async myAssignments(): Promise<Assignment[]> {
    return request<Assignment[]>("/assignments/my", { method: "GET" });
  },

  async examDetails(examId: string): Promise<ExamDetails> {
    return request<ExamDetails>(`/exams/${examId}`, { method: "GET" });
  },

  async createAttempt(assignmentId: string): Promise<{ id: string }> {
    return request<{ id: string }>(
      "/attempts",
      {
        method: "POST",
        body: JSON.stringify({ assignmentId }),
      },
    );
  },

  async saveResponses(
    attemptId: string,
    responses: Array<{ questionId: string; answer: unknown }>,
  ) {
    return request(`/attempts/${attemptId}/responses`, {
      method: "PATCH",
      body: JSON.stringify({ responses }),
    });
  },

  async submitAttempt(attemptId: string) {
    return request<{ id: string; status: string; scorePercent: number }>(
      `/attempts/${attemptId}/submit`,
      { method: "POST" },
    );
  },

  async attemptResult(attemptId: string) {
    return request(`/attempts/${attemptId}/result`, { method: "GET" });
  },
};

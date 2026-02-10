import type {
  Assignment,
  ExamDetails,
  ExamSummary,
  LessonSummary,
  MeResponse,
  SubjectRosterItem,
  SubjectSummary,
  TeacherListItem,
} from "../types";

// Prefer same-origin `/api` so Vite's dev proxy can handle local/LAN access cleanly.
// Override with `VITE_API_BASE_URL` when running without the proxy (or in prod).
const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";
const CSRF_COOKIE = "educ_csrf_token";

let refreshInFlight: Promise<boolean> | null = null;
let tenantScopeId: string | null = null;

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

  if (tenantScopeId) {
    headers.set("x-tenant-id", tenantScopeId);
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      method,
      credentials: "include",
      headers,
    });
  } catch {
    throw new Error(
      `Unable to reach the API at ${baseUrl}. Start the backend server (npm run dev --workspace @educ/api) and try again.`,
    );
  }

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
  setTenantScope(tenantId: string | null): void {
    tenantScopeId = tenantId?.trim() ? tenantId.trim() : null;
  },

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

  async switchContext(membershipId: string): Promise<{ user: MeResponse }> {
    return request<{ user: MeResponse }>("/auth/switch-context", {
      method: "POST",
      body: JSON.stringify({ membershipId }),
    });
  },

  async createUser(payload: { email: string; password: string; role: "teacher" | "student" | "parent" | "tutor" }) {
    return request("/admin/users", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async resetUserPassword(userId: string, password: string) {
    return request(`/admin/users/${userId}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ password }),
    });
  },

  async listUsers(role?: "teacher" | "student" | "school_admin" | "parent" | "tutor") {
    const suffix = role ? `?role=${encodeURIComponent(role)}` : "";
    return request<Array<{ id: string; email: string; role: "teacher" | "student" | "school_admin" | "parent" | "tutor"; isActive: boolean; createdAt: string }>>(
      `/admin/users${suffix}`,
      { method: "GET" },
    );
  },

  async listTeachers(): Promise<TeacherListItem[]> {
    const users = await this.listUsers("teacher");
    return users
      .filter((user) => user.role === "teacher" && user.isActive)
      .map((user) => ({
        ...user,
        role: "teacher",
      }));
  },

  async getAuditEvents() {
    return request<{ items: Array<{ id: string; action: string; createdAt: string }> }>(
      "/admin/audit-events?page=1&pageSize=10",
      { method: "GET" },
    );
  },

  async createSubject(payload: { name: string; teacherOwnerId?: string }) {
    return request<SubjectSummary>("/subjects", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async listSubjects(params?: { teacherId?: string; includeArchived?: boolean }) {
    const search = new URLSearchParams();
    if (params?.teacherId) {
      search.set("teacherId", params.teacherId);
    }
    if (params?.includeArchived !== undefined) {
      search.set("includeArchived", String(params.includeArchived));
    }
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return request<SubjectSummary[]>(`/subjects${suffix}`, { method: "GET" });
  },

  async updateSubject(subjectId: string, payload: { name?: string; isArchived?: boolean }) {
    return request<SubjectSummary>(`/subjects/${subjectId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  async listSubjectStudents(subjectId: string) {
    return request<SubjectRosterItem[]>(`/subjects/${subjectId}/students`, { method: "GET" });
  },

  async enrollSubjectStudent(
    subjectId: string,
    payload: { email: string; temporaryPassword?: string; autoAssignFuture?: boolean },
  ) {
    return request(`/subjects/${subjectId}/students`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async updateSubjectStudent(
    subjectId: string,
    studentId: string,
    payload: { status?: "active" | "completed"; autoAssignFuture?: boolean },
  ) {
    return request(`/subjects/${subjectId}/students/${studentId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  async uploadLesson(file: File, subjectId: string) {
    const body = new FormData();
    body.append("file", file);
    body.append("subjectId", subjectId);
    return request("/lessons/upload", { method: "POST", body });
  },

  async importTenant(kind: string, file: File) {
    const body = new FormData();
    body.append("kind", kind);
    body.append("file", file);
    return request<{
      ok: true;
      kind: string;
      tenantId: string;
      defaultPassword: string;
      totals: Record<string, number>;
      warnings: string[];
      errors: Array<{ row: number; message: string }>;
    }>("/imports/tenant", { method: "POST", body });
  },

  async importPlatform(kind: string, file: File) {
    const body = new FormData();
    body.append("kind", kind);
    body.append("file", file);
    return request<{
      ok: true;
      kind: string;
      defaultPassword: string;
      totals: Record<string, number>;
      warnings: string[];
      errors: Array<{ row: number; message: string }>;
    }>("/platform/imports", { method: "POST", body });
  },

  async listLessons() {
    return request<LessonSummary[]>("/lessons", { method: "GET" });
  },

  async lessonContent(lessonId: string): Promise<{ lessonId: string; title: string; subject: { id: string; name: string }; markdown: string }> {
    return request<{ lessonId: string; title: string; subject: { id: string; name: string }; markdown: string }>(
      `/lessons/${lessonId}/content`,
      { method: "GET" },
    );
  },

  async uploadExam(file: File, subjectId: string) {
    const body = new FormData();
    body.append("file", file);
    body.append("subjectId", subjectId);
    return request("/exams/upload", { method: "POST", body });
  },

  async listExams() {
    return request<ExamSummary[]>(
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

  async createInstitution(payload: {
    name: string;
    slug?: string;
    legalName?: string;
    domain?: string;
    country?: string;
  }) {
    return request("/platform/institutions", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async listInstitutions() {
    return request("/platform/institutions", { method: "GET" });
  },

  async updateInstitution(
    institutionId: string,
    payload: {
      name?: string;
      slug?: string;
      legalName?: string;
      domain?: string;
      country?: string;
      status?: "active" | "suspended" | "archived";
    },
  ) {
    return request(`/platform/institutions/${institutionId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  async addInstitutionAdmin(
    institutionId: string,
    payload: { email: string; temporaryPassword?: string },
  ) {
    return request(`/platform/institutions/${institutionId}/admins`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async listMemberships(tenantId: string) {
    return request(`/tenants/${tenantId}/memberships`, { method: "GET" });
  },

  async createMembership(
    tenantId: string,
    payload: { email: string; role: "school_admin" | "teacher" | "student" | "parent" | "tutor"; temporaryPassword?: string },
  ) {
    return request(`/tenants/${tenantId}/memberships`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async updateMembership(
    tenantId: string,
    membershipId: string,
    payload: { role?: "school_admin" | "teacher" | "student" | "parent" | "tutor"; status?: "active" | "invited" | "disabled" },
  ) {
    return request(`/tenants/${tenantId}/memberships/${membershipId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  async createBillingAccount(payload: { ownerType: "tenant" | "user"; ownerId: string; plan: string }) {
    return request("/billing/accounts", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async createSubscription(payload: {
    billingAccountId: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd?: boolean;
  }) {
    return request("/billing/subscriptions", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async getBillingAccount(billingAccountId: string) {
    return request(`/billing/accounts/${billingAccountId}`, { method: "GET" });
  },
};

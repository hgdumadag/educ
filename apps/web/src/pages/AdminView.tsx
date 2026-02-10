import { FormEvent, useEffect, useMemo, useState } from "react";

import { api } from "../api/client";
import axiometryLogo from "../assets/axiometry-logo.png";
import axiometryOpenLogo from "../assets/axiometry-open.png";
import type { TeacherListItem } from "../types";
import { TeacherView } from "./TeacherView";

type AdminTab = "overview" | "tenants" | "tenant_admins" | "directory" | "workspace" | "audit";

const BASE_ADMIN_TABS: Array<{ key: AdminTab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "directory", label: "Directory" },
  { key: "workspace", label: "Workspace" },
  { key: "audit", label: "Audit" },
];

const ADMIN_RESOURCE_ITEMS = [
  "About Us",
  "Help",
  "Privacy Policy",
  "Terms of Service",
  "Contact Support",
  "System Status",
] as const;
const BRAND_TAGLINE = "Where learning happens, and progress is measured.";

interface TeacherSummary {
  subjects: number;
  archivedSubjects: number;
  lessons: number;
  exams: number;
  enrollments: number;
}

interface AdminViewProps {
  currentUserEmail: string;
  currentUserRoleLabel: string;
  isPlatformAdmin: boolean;
  activeTenantId: string;
  onLogout: () => void | Promise<void>;
}

type InstitutionSummary = {
  id: string;
  name: string;
  slug: string;
  status: string;
  _count?: {
    memberships?: number;
    subjects?: number;
  };
  institutionProfile?: {
    domain?: string | null;
    country?: string | null;
  } | null;
};

type TenantMembershipItem = {
  id: string;
  role: string;
  status: string;
  createdAt?: string;
  user: {
    id: string;
    email: string;
    isActive: boolean;
  };
};

export function AdminView({
  currentUserEmail,
  currentUserRoleLabel,
  isPlatformAdmin,
  activeTenantId,
  onLogout,
}: AdminViewProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [menuOpen, setMenuOpen] = useState(false);

  const adminTabs = useMemo(() => {
    if (!isPlatformAdmin) {
      return BASE_ADMIN_TABS;
    }

    return [
      { key: "overview", label: "Overview" },
      { key: "tenants", label: "Tenants" },
      { key: "tenant_admins", label: "Tenant Admins" },
      { key: "directory", label: "Directory" },
      { key: "workspace", label: "Workspace" },
      { key: "audit", label: "Audit" },
    ] satisfies Array<{ key: AdminTab; label: string }>;
  }, [isPlatformAdmin]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"teacher" | "student">("teacher");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [audit, setAudit] = useState<Array<{ id: string; action: string; createdAt: string }>>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [teacherFilter, setTeacherFilter] = useState("");
  const [institutions, setInstitutions] = useState<InstitutionSummary[]>([]);
  const [tenantScopeId, setTenantScopeId] = useState<string>(activeTenantId);
  const [tenantSearch, setTenantSearch] = useState("");

  const [institutionName, setInstitutionName] = useState("");
  const [institutionSlug, setInstitutionSlug] = useState("");
  const [institutionDomain, setInstitutionDomain] = useState("");
  const [institutionCountry, setInstitutionCountry] = useState("");
  const [savingInstitution, setSavingInstitution] = useState(false);

  const [tenantAdminEmail, setTenantAdminEmail] = useState("");
  const [tenantAdminPassword, setTenantAdminPassword] = useState("");
  const [tenantAdmins, setTenantAdmins] = useState<TenantMembershipItem[]>([]);
  const [loadingTenantAdmins, setLoadingTenantAdmins] = useState(false);
  const [updatingTenant, setUpdatingTenant] = useState(false);
  const [allMemberships, setAllMemberships] = useState<TenantMembershipItem[]>([]);
  const [membershipSearch, setMembershipSearch] = useState("");
  const [membershipRoleFilter, setMembershipRoleFilter] = useState<
    "" | "school_admin" | "teacher" | "student" | "parent" | "tutor"
  >("");
  const [resetUserId, setResetUserId] = useState<string>("");
  const [resetUserEmail, setResetUserEmail] = useState<string>("");
  const [resetPassword, setResetPassword] = useState<string>("");
  const [resettingPassword, setResettingPassword] = useState(false);

  const [teachers, setTeachers] = useState<TeacherListItem[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [teacherSummaries, setTeacherSummaries] = useState<Record<string, TeacherSummary>>({});

  const selectedTeacher = useMemo(
    () => teachers.find((teacher) => teacher.id === selectedTeacherId) ?? null,
    [teachers, selectedTeacherId],
  );

  const scopedInstitution = useMemo(
    () => institutions.find((institution) => institution.id === tenantScopeId) ?? null,
    [institutions, tenantScopeId],
  );

  const filteredTeachers = useMemo(() => {
    const needle = teacherFilter.trim().toLowerCase();
    if (!needle) {
      return teachers;
    }

    return teachers.filter((teacher) => teacher.email.toLowerCase().includes(needle));
  }, [teacherFilter, teachers]);

  const selectedTeacherSummary = selectedTeacherId ? teacherSummaries[selectedTeacherId] : undefined;
  const globalSummary = useMemo(() => {
    return Object.values(teacherSummaries).reduce(
      (acc, current) => ({
        subjects: acc.subjects + current.subjects,
        lessons: acc.lessons + current.lessons,
        exams: acc.exams + current.exams,
        enrollments: acc.enrollments + current.enrollments,
      }),
      {
        subjects: 0,
        lessons: 0,
        exams: 0,
        enrollments: 0,
      },
    );
  }, [teacherSummaries]);

  function switchTab(tab: AdminTab) {
    setActiveTab(tab);
    setMenuOpen(false);
  }

  async function refreshInstitutions() {
    if (!isPlatformAdmin) {
      return;
    }

    try {
      const results = await api.listInstitutions() as Array<InstitutionSummary>;
      setInstitutions(results);
    } catch (error) {
      setMessageTone("error");
      setMessage(String(error));
    }
  }

  async function refreshTenantAdmins() {
    if (!isPlatformAdmin) {
      return;
    }

    setLoadingTenantAdmins(true);
    try {
      const memberships = await api.listMemberships(tenantScopeId) as TenantMembershipItem[];
      const admins = memberships.filter((membership) => membership.role === "school_admin");
      setTenantAdmins(admins);
      setAllMemberships(memberships);
    } catch (error) {
      setMessageTone("error");
      setMessage(String(error));
    } finally {
      setLoadingTenantAdmins(false);
    }
  }

  async function refreshTeachers() {
    try {
      const [list, subjects] = await Promise.all([
        api.listTeachers(),
        api.listSubjects({ includeArchived: true }),
      ]);
      setTeachers(list);
      setSelectedTeacherId((current) => {
        if (current && list.some((teacher) => teacher.id === current)) {
          return current;
        }
        return list[0]?.id ?? "";
      });
      const summaries: Record<string, TeacherSummary> = {};
      for (const subject of subjects) {
        const teacherOwnerId = subject.teacherOwnerId;
        if (!summaries[teacherOwnerId]) {
          summaries[teacherOwnerId] = {
            subjects: 0,
            archivedSubjects: 0,
            lessons: 0,
            exams: 0,
            enrollments: 0,
          };
        }

        summaries[teacherOwnerId].subjects += 1;
        summaries[teacherOwnerId].archivedSubjects += subject.isArchived ? 1 : 0;
        summaries[teacherOwnerId].lessons += subject._count?.lessons ?? 0;
        summaries[teacherOwnerId].exams += subject._count?.exams ?? 0;
        summaries[teacherOwnerId].enrollments += subject._count?.enrollments ?? 0;
      }
      setTeacherSummaries(summaries);
    } catch (error) {
      setMessageTone("error");
      setMessage(String(error));
    }
  }

  useEffect(() => {
    api.setTenantScope(isPlatformAdmin ? tenantScopeId : null);
    void refreshTeachers();
    void loadAudit();
    void refreshInstitutions();
    void refreshTenantAdmins();
  }, []);

  useEffect(() => {
    api.setTenantScope(isPlatformAdmin ? tenantScopeId : null);
    void refreshTeachers();
    void loadAudit();
    void refreshInstitutions();
    void refreshTenantAdmins();
  }, [isPlatformAdmin, tenantScopeId]);

  useEffect(() => {
    if (!isPlatformAdmin || !scopedInstitution) {
      return;
    }

    setInstitutionName(scopedInstitution.name ?? "");
    setInstitutionSlug(scopedInstitution.slug ?? "");
    setInstitutionDomain(scopedInstitution.institutionProfile?.domain ?? "");
    setInstitutionCountry(scopedInstitution.institutionProfile?.country ?? "");
  }, [isPlatformAdmin, scopedInstitution]);

  async function handleCreateUser(event: FormEvent) {
    event.preventDefault();
    try {
      await api.createUser({ email, password, role });
      setMessageTone("success");
      setMessage("User created.");
      setEmail("");
      setPassword("");
      await refreshTeachers();
    } catch (error) {
      setMessageTone("error");
      setMessage(String(error));
    }
  }

  async function loadAudit() {
    setLoadingAudit(true);
    try {
      const response = await api.getAuditEvents();
      setAudit(response.items);
    } catch (error) {
      setMessageTone("error");
      setMessage(String(error));
    } finally {
      setLoadingAudit(false);
    }
  }

  const filteredInstitutions = useMemo(() => {
    const needle = tenantSearch.trim().toLowerCase();
    if (!needle) {
      return institutions;
    }

    return institutions.filter((institution) =>
      [institution.name, institution.slug, institution.status]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(needle))
    );
  }, [institutions, tenantSearch]);

  async function handleCreateInstitution(event: FormEvent) {
    event.preventDefault();
    if (!isPlatformAdmin) {
      return;
    }

    setSavingInstitution(true);
    try {
      await api.createInstitution({
        name: institutionName,
        slug: institutionSlug.trim() ? institutionSlug.trim() : undefined,
        domain: institutionDomain.trim() ? institutionDomain.trim() : undefined,
        country: institutionCountry.trim() ? institutionCountry.trim() : undefined,
      });

      setMessageTone("success");
      setMessage("Tenant created.");
      setInstitutionName("");
      setInstitutionSlug("");
      setInstitutionDomain("");
      setInstitutionCountry("");
      await refreshInstitutions();
    } catch (error) {
      setMessageTone("error");
      setMessage(String(error));
    } finally {
      setSavingInstitution(false);
    }
  }

  async function handleUpdateInstitution(event: FormEvent) {
    event.preventDefault();
    if (!isPlatformAdmin || !scopedInstitution) {
      return;
    }

    setUpdatingTenant(true);
    try {
      await api.updateInstitution(scopedInstitution.id, {
        name: institutionName.trim() ? institutionName.trim() : undefined,
        slug: institutionSlug.trim() ? institutionSlug.trim() : undefined,
        domain: institutionDomain.trim() ? institutionDomain.trim() : undefined,
        country: institutionCountry.trim() ? institutionCountry.trim() : undefined,
        // status is handled separately via the quick actions below to prevent accidental suspends.
      });

      setMessageTone("success");
      setMessage("Tenant updated.");
      await refreshInstitutions();
    } catch (error) {
      setMessageTone("error");
      setMessage(String(error));
    } finally {
      setUpdatingTenant(false);
    }
  }

  async function handleSetInstitutionStatus(status: "active" | "suspended" | "archived") {
    if (!isPlatformAdmin || !scopedInstitution) {
      return;
    }

    setUpdatingTenant(true);
    try {
      await api.updateInstitution(scopedInstitution.id, { status });
      setMessageTone("success");
      setMessage(`Tenant status set to ${status}.`);
      await refreshInstitutions();
    } catch (error) {
      setMessageTone("error");
      setMessage(String(error));
    } finally {
      setUpdatingTenant(false);
    }
  }

  async function handleAddTenantAdmin(event: FormEvent) {
    event.preventDefault();
    if (!isPlatformAdmin) {
      return;
    }

    try {
      await api.addInstitutionAdmin(tenantScopeId, {
        email: tenantAdminEmail,
        temporaryPassword: tenantAdminPassword.trim() ? tenantAdminPassword : undefined,
      });
      setMessageTone("success");
      setMessage("Tenant admin added.");
      setTenantAdminEmail("");
      setTenantAdminPassword("");
      await refreshTenantAdmins();
    } catch (error) {
      setMessageTone("error");
      setMessage(String(error));
    }
  }

  async function handleToggleTenantAdmin(membership: TenantMembershipItem) {
    if (!isPlatformAdmin) {
      return;
    }

    const nextStatus = membership.status === "active" ? "disabled" : "active";
    try {
      await api.updateMembership(tenantScopeId, membership.id, { status: nextStatus });
      setMessageTone("success");
      setMessage(`Tenant admin ${membership.user.email} set to ${nextStatus}.`);
      await refreshTenantAdmins();
    } catch (error) {
      setMessageTone("error");
      setMessage(String(error));
    }
  }

  async function handleStartResetPassword(membership: TenantMembershipItem) {
    setResetUserId(membership.user.id);
    setResetUserEmail(membership.user.email);
    setResetPassword("");
    setMessageTone("success");
    setMessage(`Resetting password for ${membership.user.email}.`);
  }

  async function handleSubmitResetPassword(event: FormEvent) {
    event.preventDefault();
    if (!isPlatformAdmin || !resetUserId) {
      return;
    }

    setResettingPassword(true);
    try {
      await api.resetUserPassword(resetUserId, resetPassword);
      setMessageTone("success");
      setMessage(`Password reset for ${resetUserEmail}.`);
      setResetUserId("");
      setResetUserEmail("");
      setResetPassword("");
    } catch (error) {
      setMessageTone("error");
      setMessage(String(error));
    } finally {
      setResettingPassword(false);
    }
  }

  const filteredMemberships = useMemo(() => {
    const needle = membershipSearch.trim().toLowerCase();
    return allMemberships
      .filter((membership) => {
        if (membershipRoleFilter && membership.role !== membershipRoleFilter) {
          return false;
        }
        if (!needle) {
          return true;
        }
        return (
          membership.user.email.toLowerCase().includes(needle) ||
          membership.role.toLowerCase().includes(needle) ||
          membership.status.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => a.user.email.localeCompare(b.user.email));
  }, [allMemberships, membershipRoleFilter, membershipSearch]);

  return (
    <div className="stack admin-dashboard admin-shell">
      <header className="admin-top-layer">
        <div className="admin-top-brand">
          <div className="admin-menu-anchor">
            <button
              type="button"
              className="admin-top-button admin-logo-toggle-button"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((current) => !current)}
            >
              <img
                src={menuOpen ? axiometryOpenLogo : axiometryLogo}
                alt={menuOpen ? "Axiometry open menu logo" : "Axiometry logo"}
                className="admin-menu-toggle-logo"
              />
            </button>
            {menuOpen ? (
              <aside className="admin-quick-menu">
                <p className="admin-quick-menu-title">Resources</p>
                <div className="admin-quick-links">
                  {ADMIN_RESOURCE_ITEMS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className="admin-menu-link"
                      onClick={() => {
                        setMessageTone("success");
                        setMessage(`${item} section placeholder added. We can wire this to full pages next.`);
                        setMenuOpen(false);
                      }}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </aside>
            ) : null}
          </div>
          <div className="admin-brand-text">
            <strong>Axiometry</strong>
            <span>{BRAND_TAGLINE}</span>
          </div>
        </div>
        <div className="row-wrap">
          <span className="admin-top-chip">{currentUserRoleLabel}</span>
          <span className="admin-top-chip">{currentUserEmail}</span>
          <button
            type="button"
            className="admin-top-button admin-signout-button"
            onClick={() => void onLogout()}
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="panel admin-hero">
        <div>
          <p className="admin-eyebrow">Administration Console</p>
          <h2>Scalable overview of teachers, subjects, content, and operations</h2>
          <p className="muted">
            Use tabs to separate domains and keep large data sets manageable.
          </p>
          {isPlatformAdmin ? (
            <p className="muted">
              Platform Admin Mode: select an institution scope below to manage that tenant’s directory and workspace.
            </p>
          ) : null}
        </div>
      </section>

      <div className="stack admin-main-content">
        {activeTab === "overview" ? (
          <>
            <section className="panel admin-guide-panel">
              <details>
                <summary>Getting started</summary>
                <ol className="steps">
                  {isPlatformAdmin ? (
                    <li>Create tenants (schools) and add tenant admins.</li>
                  ) : null}
                  <li>Create at least one teacher and one student account.</li>
                  <li>Share credentials with users so they can sign in.</li>
                  <li>Select a teacher in Workspace to manage subjects and enrollments.</li>
                  <li>Use Audit to confirm key actions are being recorded.</li>
                </ol>
              </details>
            </section>

            <section className="admin-kpi-grid">
              {isPlatformAdmin ? (
                <article className="panel admin-kpi-card">
                  <p className="admin-kpi-label">Tenants</p>
                  <p className="admin-kpi-value">{institutions.length}</p>
                  <p className="muted">Institution tenants managed by platform admin.</p>
                </article>
              ) : null}
              <article className="panel admin-kpi-card">
                <p className="admin-kpi-label">Active Teachers</p>
                <p className="admin-kpi-value">{teachers.length}</p>
                <p className="muted">Teachers available for workspace management.</p>
              </article>
              <article className="panel admin-kpi-card">
                <p className="admin-kpi-label">Total Subjects</p>
                <p className="admin-kpi-value">{globalSummary.subjects}</p>
                <p className="muted">Across all teacher scopes.</p>
              </article>
              <article className="panel admin-kpi-card">
                <p className="admin-kpi-label">Total Content</p>
                <p className="admin-kpi-value">{globalSummary.lessons + globalSummary.exams}</p>
                <p className="muted">
                  Lessons {globalSummary.lessons} | Exams {globalSummary.exams}
                </p>
              </article>
              <article className="panel admin-kpi-card">
                <p className="admin-kpi-label">Recent Audit Records</p>
                <p className="admin-kpi-value">{audit.length}</p>
                <p className="muted">Loaded from latest system event stream.</p>
              </article>
            </section>
          </>
        ) : null}

        {activeTab === "tenants" ? (
          <section className="admin-layout-grid">
            <article className="panel stack">
              <div className="row-wrap">
                <h3>Tenants</h3>
                <span className="admin-chip">{filteredInstitutions.length} shown</span>
              </div>
              <p className="muted">
                Select a tenant to scope Directory, Workspace, and Audit. Tenant scoping does not affect platform-only endpoints.
              </p>
              {scopedInstitution ? (
                <p className="muted">
                  Current tenant scope: <strong>{scopedInstitution.name}</strong> (<code>{scopedInstitution.slug}</code>)
                </p>
              ) : (
                <p className="muted">Current tenant scopeId: <code>{tenantScopeId}</code></p>
              )}
              <label>
                Search tenants
                <input
                  type="search"
                  value={tenantSearch}
                  onChange={(event) => setTenantSearch(event.target.value)}
                  placeholder="Search by tenant name, slug, or status..."
                />
              </label>
              {filteredInstitutions.length === 0 ? (
                <p className="muted">No tenants match the current filter.</p>
              ) : (
                <div className="admin-teacher-grid">
                  {filteredInstitutions.map((tenant) => (
                    <button
                      type="button"
                      key={tenant.id}
                      className={`admin-teacher-card ${tenant.id === tenantScopeId ? "active" : ""}`}
                      onClick={() => {
                        setTenantScopeId(tenant.id);
                        setMessageTone("success");
                        setMessage(`Tenant scope set to ${tenant.name}.`);
                      }}
                    >
                      <div className="admin-teacher-card-head">
                        <h4>{tenant.name}</h4>
                        <span className="admin-chip">{tenant.id === tenantScopeId ? "Scoped" : "Scope"}</span>
                      </div>
                      <p className="muted">{tenant.slug} | {tenant.status}</p>
                      <p className="admin-mini-metrics">
                        Members: {tenant._count?.memberships ?? "?"} | Subjects: {tenant._count?.subjects ?? "?"}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </article>

            <article className="panel stack">
              <h3>Create Tenant</h3>
              <p className="muted">Create an institution tenant (school) for a new customer.</p>
              <form onSubmit={handleCreateInstitution} className="stack">
                <div className="admin-form-grid">
                  <label>
                    Name
                    <input
                      value={institutionName}
                      onChange={(event) => setInstitutionName(event.target.value)}
                      placeholder="Acme High School"
                      required
                    />
                  </label>
                  <label>
                    Slug (optional)
                    <input
                      value={institutionSlug}
                      onChange={(event) => setInstitutionSlug(event.target.value)}
                      placeholder="acme-high-school"
                    />
                  </label>
                </div>
                <div className="admin-form-grid">
                  <label>
                    Domain (optional)
                    <input
                      value={institutionDomain}
                      onChange={(event) => setInstitutionDomain(event.target.value)}
                      placeholder="acme.edu"
                    />
                  </label>
                  <label>
                    Country (optional)
                    <input
                      value={institutionCountry}
                      onChange={(event) => setInstitutionCountry(event.target.value)}
                      placeholder="US"
                    />
                  </label>
                </div>
                <button type="submit" disabled={savingInstitution}>
                  {savingInstitution ? "Creating..." : "Create Tenant"}
                </button>
              </form>
              <button
                type="button"
                className="button-secondary"
                onClick={() => void refreshInstitutions()}
              >
                Refresh Tenants
              </button>

              {scopedInstitution ? (
                <>
                  <hr />
                  <h3>Edit Tenant</h3>
                  <p className="muted">Updates name/slug/metadata for the currently scoped tenant.</p>
                  <form onSubmit={handleUpdateInstitution} className="stack">
                    <div className="admin-form-grid">
                      <label>
                        Name
                        <input
                          value={institutionName}
                          onChange={(event) => setInstitutionName(event.target.value)}
                          required
                        />
                      </label>
                      <label>
                        Slug
                        <input
                          value={institutionSlug}
                          onChange={(event) => setInstitutionSlug(event.target.value)}
                          required
                        />
                      </label>
                    </div>
                    <div className="admin-form-grid">
                      <label>
                        Domain
                        <input
                          value={institutionDomain}
                          onChange={(event) => setInstitutionDomain(event.target.value)}
                          placeholder="school.edu"
                        />
                      </label>
                      <label>
                        Country
                        <input
                          value={institutionCountry}
                          onChange={(event) => setInstitutionCountry(event.target.value)}
                          placeholder="US"
                        />
                      </label>
                    </div>
                    <button type="submit" disabled={updatingTenant}>
                      {updatingTenant ? "Updating..." : "Save Tenant"}
                    </button>
                  </form>
                  <div className="row-wrap">
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={updatingTenant}
                      onClick={() => void handleSetInstitutionStatus("active")}
                    >
                      Set Active
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={updatingTenant}
                      onClick={() => void handleSetInstitutionStatus("suspended")}
                    >
                      Suspend
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={updatingTenant}
                      onClick={() => void handleSetInstitutionStatus("archived")}
                    >
                      Archive
                    </button>
                  </div>
                </>
              ) : null}
            </article>
          </section>
        ) : null}

        {activeTab === "tenant_admins" ? (
          <section className="admin-layout-grid">
            <article className="panel stack">
              <div className="row-wrap">
                <h3>Tenant Memberships</h3>
                <span className="admin-chip">Scoped tenant</span>
              </div>
              <p className="muted">
                All memberships (admins, teachers, students, parents, tutors) for this tenant scope.
              </p>
              <p className="muted">
                Current scope:{" "}
                <strong>{scopedInstitution?.name ?? "Unknown tenant"}</strong>{" "}
                {scopedInstitution?.slug ? <>(<code>{scopedInstitution.slug}</code>)</> : null}{" "}
                <span className="muted">tenantId</span>: <code>{tenantScopeId}</code>
              </p>
              <div className="row-wrap">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => void refreshTenantAdmins()}
                >
                  {loadingTenantAdmins ? "Refreshing..." : "Refresh Tenant Admins"}
                </button>
              </div>

              <div className="admin-form-grid">
                <label>
                  Search members
                  <input
                    type="search"
                    value={membershipSearch}
                    onChange={(event) => setMembershipSearch(event.target.value)}
                    placeholder="Search by email, role, status..."
                  />
                </label>
                <label>
                  Role filter
                  <select
                    value={membershipRoleFilter}
                    onChange={(event) =>
                      setMembershipRoleFilter(event.target.value as typeof membershipRoleFilter)
                    }
                  >
                    <option value="">All roles</option>
                    <option value="school_admin">school_admin</option>
                    <option value="teacher">teacher</option>
                    <option value="student">student</option>
                    <option value="parent">parent</option>
                    <option value="tutor">tutor</option>
                  </select>
                </label>
              </div>

              {filteredMemberships.length === 0 ? (
                <p className="muted">{loadingTenantAdmins ? "Loading..." : "No memberships found."}</p>
              ) : (
                <div className="stack">
                  {filteredMemberships.map((membership) => (
                    <article key={membership.id} className="panel row-wrap" style={{ justifyContent: "space-between" }}>
                      <div>
                        <strong>{membership.user.email}</strong>
                        <p className="muted" style={{ marginTop: 6 }}>
                          role: {membership.role} | membership: {membership.status} | user: {membership.user.isActive ? "active" : "inactive"}
                        </p>
                      </div>
                      <div className="row-wrap">
                        <button
                          type="button"
                          className="button-secondary"
                          onClick={() => void handleToggleTenantAdmin(membership)}
                        >
                          {membership.status === "active" ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          className="button-secondary"
                          onClick={() => void handleStartResetPassword(membership)}
                        >
                          Reset password
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </article>

            <article className="panel stack">
              <h3>Add Tenant Admin</h3>
              <p className="muted">
                Creates a new user if email is unused; otherwise links an existing user into this tenant as a school admin.
              </p>
              <p className="muted">
                Target tenant scope: <strong>{scopedInstitution?.name ?? "Unknown tenant"}</strong>{" "}
                (<code>{tenantScopeId}</code>)
              </p>
              <form onSubmit={handleAddTenantAdmin} className="stack">
                <label>
                  Email
                  <input
                    type="email"
                    value={tenantAdminEmail}
                    onChange={(event) => setTenantAdminEmail(event.target.value)}
                    placeholder="school.admin@acme.edu"
                    required
                  />
                </label>
                <label>
                  Temporary password (required only for new users)
                  <input
                    type="password"
                    value={tenantAdminPassword}
                    onChange={(event) => setTenantAdminPassword(event.target.value)}
                    minLength={8}
                    placeholder="At least 8 characters"
                  />
                </label>
                <button type="submit">Add Admin</button>
              </form>

              <hr />

              <h3>Reset Password (Platform Admin)</h3>
              <p className="muted">Select a user from the membership directory, then set a new password here.</p>
              {resetUserId ? (
                <form onSubmit={handleSubmitResetPassword} className="stack">
                  <label>
                    User
                    <input value={resetUserEmail} readOnly />
                  </label>
                  <label>
                    New password
                    <input
                      type="password"
                      value={resetPassword}
                      onChange={(event) => setResetPassword(event.target.value)}
                      minLength={8}
                      placeholder="At least 8 characters"
                      required
                    />
                  </label>
                  <div className="row-wrap">
                    <button type="submit" disabled={resettingPassword}>
                      {resettingPassword ? "Resetting..." : "Reset password"}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => {
                        setResetUserId("");
                        setResetUserEmail("");
                        setResetPassword("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <p className="muted">No user selected.</p>
              )}
            </article>
          </section>
        ) : null}

        {activeTab === "directory" ? (
          <section className="admin-layout-grid">
            <article className="panel stack">
              <div className="row-wrap">
                <h3>Teacher Directory</h3>
                <span className="admin-chip">{filteredTeachers.length} shown</span>
              </div>
              {filteredTeachers.length === 0 ? (
                <p className="muted">No teachers match the current filter.</p>
              ) : (
                <div className="admin-teacher-grid">
                  {filteredTeachers.map((teacher) => {
                    const summary = teacherSummaries[teacher.id];
                    return (
                      <button
                        type="button"
                        key={teacher.id}
                        className={`admin-teacher-card ${teacher.id === selectedTeacherId ? "active" : ""}`}
                        onClick={() => setSelectedTeacherId(teacher.id)}
                      >
                        <div className="admin-teacher-card-head">
                          <h4>{teacher.email}</h4>
                          <span className="admin-chip">{teacher.id === selectedTeacherId ? "Selected" : "Open"}</span>
                        </div>
                        <p className="muted">Created {new Date(teacher.createdAt).toLocaleDateString()}</p>
                        <p className="admin-mini-metrics">
                          Subjects: {summary?.subjects ?? 0} | Lessons: {summary?.lessons ?? 0} | Exams: {summary?.exams ?? 0}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </article>

            <article className="panel stack">
              <h3>Create User</h3>
              <p className="muted">Create teacher and student accounts. Email becomes their login username.</p>
              <form onSubmit={handleCreateUser} className="stack">
                <div className="admin-form-grid">
                  <label>
                    Email
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="teacher1@example.com"
                      required
                    />
                  </label>
                  <label>
                    Temporary Password
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      minLength={8}
                      placeholder="At least 8 characters"
                      required
                    />
                  </label>
                </div>
                <label>
                  Role
                  <select value={role} onChange={(event) => setRole(event.target.value as "teacher" | "student")}>
                    <option value="teacher">teacher</option>
                    <option value="student">student</option>
                  </select>
                </label>
                <button type="submit">Create User</button>
              </form>
            </article>
          </section>
        ) : null}

        {activeTab === "workspace" ? (
          <section className="panel stack admin-workspace-shell">
            <div className="row-wrap admin-workspace-header">
              <div>
                <h3>Teacher Workspace</h3>
                <p className="muted">
                  {selectedTeacher
                    ? `Now managing: ${selectedTeacher.email}`
                    : "Select a teacher to open the scoped workspace."}
                </p>
              </div>
              {selectedTeacherSummary ? (
                <div className="row-wrap">
                  <span className="admin-chip">Subjects {selectedTeacherSummary.subjects}</span>
                  <span className="admin-chip">Students {selectedTeacherSummary.enrollments}</span>
                  <span className="admin-chip">Exams {selectedTeacherSummary.exams}</span>
                </div>
              ) : null}
            </div>
            <TeacherView adminMode teacherScopeId={selectedTeacherId || undefined} />
          </section>
        ) : null}

        {activeTab === "audit" ? (
          <section className="panel stack admin-audit-shell">
            <div className="row-wrap">
              <h3>Audit Events</h3>
              <button type="button" className="button-secondary" onClick={() => void loadAudit()}>
                {loadingAudit ? "Refreshing..." : "Refresh"}
              </button>
            </div>
            <p className="muted">
              Recent system actions for subjects, enrollment, uploads, assignments, and submission events.
            </p>
            {audit.length === 0 ? (
              <p className="muted">{loadingAudit ? "Loading audit events..." : "No audit events loaded yet."}</p>
            ) : (
              <ul className="admin-audit-list">
                {audit.map((event) => (
                  <li key={event.id} className="admin-audit-item">
                    <strong>{event.action}</strong>
                    <span>{new Date(event.createdAt).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {message ? <p className={`admin-feedback ${messageTone}`}>{message}</p> : null}
      </div>

      <section className="panel admin-toolbar admin-toolbar-bottom">
        <div className="admin-toolbar-grid">
          {isPlatformAdmin ? (
            <label>
              Institution scope
              <select
                value={tenantScopeId}
                onChange={(event) => setTenantScopeId(event.target.value)}
              >
                <option value={activeTenantId}>Use active context tenant</option>
                {institutions.map((institution) => (
                  <option key={institution.id} value={institution.id}>
                    {institution.name} ({institution.slug})
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            Teacher scope
            <select
              value={selectedTeacherId}
              onChange={(event) => setSelectedTeacherId(event.target.value)}
            >
              <option value="">Select a teacher</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.email}
                </option>
              ))}
            </select>
          </label>
          <label>
            Search teachers
            <input
              type="search"
              value={teacherFilter}
              onChange={(event) => setTeacherFilter(event.target.value)}
              placeholder="Search teacher email..."
            />
          </label>
          <div className="row-wrap">
            <button type="button" className="button-secondary" onClick={() => void refreshTeachers()}>
              Refresh Directory
            </button>
            <button type="button" className="button-secondary" onClick={() => void loadAudit()}>
              Refresh Audit
            </button>
          </div>
        </div>
      </section>

      <nav className="admin-bottom-layer" aria-label="Admin sections">
        {adminTabs.map((tab) => (
          <button
            type="button"
            key={tab.key}
            className={`admin-bottom-tab ${activeTab === tab.key ? "active" : ""}`}
            onClick={() => switchTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

import { useEffect, useState } from "react";

import { api } from "./api/client";
import axiometryLogo from "./assets/axiometry-logo.png";
import { LoginForm } from "./components/LoginForm";
import { AdminView } from "./pages/AdminView";
import { StudentView } from "./pages/StudentView";
import { TeacherView } from "./pages/TeacherView";
import type { MeResponse } from "./types";

import "./styles.css";

const BRAND_TAGLINE = "Where learning happens, and progress is measured.";

function RoleGuide({ role }: { role: MeResponse["role"] }) {
  if (role === "teacher" || role === "parent" || role === "tutor") {
    return (
      <section className="panel help-card">
        <h3>Axiometry Teacher Quickstart</h3>
        <ol className="steps">
          <li>Create one or more subjects.</li>
          <li>Enroll students into a subject (creates whole-subject assignment flow).</li>
          <li>Upload lesson ZIP and exam JSON under that subject.</li>
          <li>Assign specific items when you need targeted work.</li>
        </ol>
      </section>
    );
  }

  return (
    <section className="panel help-card">
      <h3>Axiometry Student Quickstart</h3>
      <ol className="steps">
        <li>Open one assigned exam from your list.</li>
        <li>Click Start Attempt to begin.</li>
        <li>Answer questions and click Autosave Responses regularly.</li>
        <li>Click Submit Attempt when done, then review your result.</li>
      </ol>
    </section>
  );
}

export function App() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      try {
        const currentUser = await api.me();
        if (mounted) {
          setMe(currentUser);
        }
      } catch {
        // User may not be logged in yet.
      } finally {
        if (mounted) {
          setBootstrapping(false);
        }
      }
    }

    void bootstrap();

    return () => {
      mounted = false;
    };
  }, []);

  async function handleLogin(identifier: string, password: string) {
    setLoading(true);
    setMessage("");

    try {
      const result = await api.login(identifier, password);
      setMe(result.user);
    } catch (error) {
      setMessage(String(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await api.logout();
    } catch {
      // Ignore logout errors and clear local state regardless.
    }

    setMe(null);
  }

  async function handleSwitchContext(membershipId: string) {
    if (!me || me.activeContext.membershipId === membershipId) {
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const result = await api.switchContext(membershipId);
      setMe(result.user);
    } catch (error) {
      setMessage(String(error));
    } finally {
      setLoading(false);
    }
  }

  if (bootstrapping) {
    return (
      <main className="app-shell">
        <div className="brand-identity">
          <img src={axiometryLogo} alt="Axiometry logo" className="brand-logo" />
          <div className="brand-text">
            <h1>Axiometry</h1>
            <p className="brand-tagline">{BRAND_TAGLINE}</p>
          </div>
        </div>
        <p>Loading session...</p>
      </main>
    );
  }

  if (!me) {
    return (
      <main className="app-shell">
        <div className="brand-identity">
          <img src={axiometryLogo} alt="Axiometry logo" className="brand-logo" />
          <div className="brand-text">
            <h1>Axiometry</h1>
            <p className="brand-tagline">{BRAND_TAGLINE}</p>
          </div>
        </div>
        <section className="panel help-card">
          <h3>Sign-in help</h3>
          <p className="muted">
            Use credentials created by your Axiometry admin. Teachers and students each see a different workflow after
            login.
          </p>
        </section>
        <LoginForm onLogin={handleLogin} loading={loading} />
        {message ? <p className="error">{message}</p> : null}
      </main>
    );
  }

  if (me.role === "school_admin" || me.role === "platform_admin") {
    return (
      <main className="app-shell">
        {me.contexts.length > 1 ? (
          <section className="panel row-wrap">
            <label>
              Active workspace
              <select
                value={me.activeContext.membershipId}
                onChange={(event) => {
                  void handleSwitchContext(event.target.value);
                }}
                disabled={loading}
              >
                {me.contexts.map((context) => (
                  <option key={context.membershipId} value={context.membershipId}>
                    {context.tenantName} ({context.role})
                  </option>
                ))}
              </select>
            </label>
          </section>
        ) : null}
        <AdminView
          currentUserEmail={me.email}
          currentUserRoleLabel={me.displayRole}
          isPlatformAdmin={me.isPlatformAdmin}
          activeTenantId={me.activeContext.tenantId}
          onLogout={handleLogout}
        />
        {message ? <p className="error">{message}</p> : null}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="panel row">
        <div className="brand-identity">
          <img src={axiometryLogo} alt="Axiometry logo" className="brand-logo" />
          <div className="brand-text">
            <h1>Axiometry</h1>
            <p className="brand-tagline">{BRAND_TAGLINE}</p>
            <p>
              {me.email} ({me.displayRole})
            </p>
          </div>
        </div>
        <button onClick={handleLogout}>Sign out</button>
      </header>

      {me.contexts.length > 1 ? (
        <section className="panel row-wrap">
          <label>
            Active workspace
            <select
              value={me.activeContext.membershipId}
              onChange={(event) => {
                void handleSwitchContext(event.target.value);
              }}
              disabled={loading}
            >
              {me.contexts.map((context) => (
                <option key={context.membershipId} value={context.membershipId}>
                  {context.tenantName} ({context.role})
                </option>
              ))}
            </select>
          </label>
        </section>
      ) : null}

      <RoleGuide role={me.role} />
      {me.role === "teacher" || me.role === "parent" || me.role === "tutor" ? <TeacherView /> : null}
      {me.role === "student" ? <StudentView /> : null}

      {message ? <p className="error">{message}</p> : null}
    </main>
  );
}

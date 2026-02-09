import { useEffect, useState } from "react";

import { api } from "./api/client";
import { LoginForm } from "./components/LoginForm";
import { AdminView } from "./pages/AdminView";
import { StudentView } from "./pages/StudentView";
import { TeacherView } from "./pages/TeacherView";
import type { MeResponse } from "./types";

import "./styles.css";

function RoleGuide({ role }: { role: MeResponse["role"] }) {
  if (role === "admin") {
    return (
      <section className="panel help-card">
        <h3>What to do first (Admin)</h3>
        <ol className="steps">
          <li>Create at least one teacher and one student account.</li>
          <li>Share credentials with users so they can sign in.</li>
          <li>Use Audit Events to confirm key actions are being recorded.</li>
        </ol>
      </section>
    );
  }

  if (role === "teacher") {
    return (
      <section className="panel help-card">
        <h3>What to do first (Teacher)</h3>
        <ol className="steps">
          <li>Upload lesson ZIP files (optional) and exam JSON files.</li>
          <li>Create assignments for students using student IDs.</li>
          <li>Choose assignment type: practice or assessment.</li>
          <li>Students can then start and submit attempts.</li>
        </ol>
      </section>
    );
  }

  return (
    <section className="panel help-card">
      <h3>How to complete an exam (Student)</h3>
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

  if (bootstrapping) {
    return (
      <main className="app-shell">
        <h1>Educ Platform</h1>
        <p>Loading session...</p>
      </main>
    );
  }

  if (!me) {
    return (
      <main className="app-shell">
        <h1>Educ Platform</h1>
        <section className="panel help-card">
          <h3>Sign-in help</h3>
          <p className="muted">
            Use credentials created by your admin. Teachers and students each see a different workflow after login.
          </p>
        </section>
        <LoginForm onLogin={handleLogin} loading={loading} />
        {message ? <p className="error">{message}</p> : null}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="panel row">
        <div>
          <h1>Educ Platform</h1>
          <p>
            {me.email} ({me.displayRole})
          </p>
        </div>
        <button onClick={handleLogout}>Sign out</button>
      </header>

      <RoleGuide role={me.role} />

      {me.role === "admin" ? <AdminView /> : null}
      {me.role === "teacher" ? <TeacherView /> : null}
      {me.role === "student" ? <StudentView /> : null}

      {message ? <p className="error">{message}</p> : null}
    </main>
  );
}

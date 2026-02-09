import { useEffect, useState } from "react";

import { api } from "./api/client";
import { LoginForm } from "./components/LoginForm";
import { AdminView } from "./pages/AdminView";
import { StudentView } from "./pages/StudentView";
import { TeacherView } from "./pages/TeacherView";
import type { MeResponse } from "./types";

import "./styles.css";

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

      {me.role === "admin" ? <AdminView /> : null}
      {me.role === "teacher" ? <TeacherView /> : null}
      {me.role === "student" ? <StudentView /> : null}

      {message ? <p className="error">{message}</p> : null}
    </main>
  );
}

import { useEffect, useState } from "react";

import { api } from "./api/client";
import { LoginForm } from "./components/LoginForm";
import { AdminView } from "./pages/AdminView";
import { StudentView } from "./pages/StudentView";
import { TeacherView } from "./pages/TeacherView";
import type { MeResponse, Session } from "./types";

import "./styles.css";

const SESSION_KEY = "educ_session";

function readStoredSession(): Session | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function App() {
  const [session, setSession] = useState<Session | null>(() => readStoredSession());
  const [me, setMe] = useState<MeResponse | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(identifier: string, password: string) {
    setLoading(true);
    setMessage("");

    try {
      const result = await api.login(identifier, password);
      const stored: Session = {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      };

      localStorage.setItem(SESSION_KEY, JSON.stringify(stored));
      setSession(stored);
      setMe(await api.me(stored.accessToken));
    } catch (error) {
      setMessage(String(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    if (session) {
      try {
        await api.logout(session.accessToken);
      } catch {
        // Ignore logout errors and clear local state regardless.
      }
    }

    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setMe(null);
  }

  async function refreshMe() {
    if (!session) {
      return;
    }

    try {
      setMe(await api.me(session.accessToken));
    } catch (error) {
      setMessage(String(error));
    }
  }

  useEffect(() => {
    if (session && !me) {
      void refreshMe();
    }
  }, [session, me]);

  if (!session || !me) {
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

      {me.role === "admin" ? <AdminView accessToken={session.accessToken} /> : null}
      {me.role === "teacher" ? <TeacherView accessToken={session.accessToken} /> : null}
      {me.role === "student" ? <StudentView accessToken={session.accessToken} /> : null}

      {message ? <p className="error">{message}</p> : null}
    </main>
  );
}

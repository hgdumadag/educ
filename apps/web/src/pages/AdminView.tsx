import { FormEvent, useState } from "react";

import { api } from "../api/client";

interface Props {
  accessToken: string;
}

export function AdminView({ accessToken }: Props) {
  const [email, setEmail] = useState("teacher1@example.com");
  const [password, setPassword] = useState("Teacher123!");
  const [role, setRole] = useState<"teacher" | "student">("teacher");
  const [message, setMessage] = useState("");
  const [audit, setAudit] = useState<Array<{ id: string; action: string; createdAt: string }>>([]);

  async function handleCreateUser(event: FormEvent) {
    event.preventDefault();
    try {
      await api.createUser(accessToken, { email, password, role });
      setMessage("User created.");
    } catch (error) {
      setMessage(String(error));
    }
  }

  async function loadAudit() {
    try {
      const events = await api.getAuditEvents(accessToken);
      setAudit(events.slice(0, 10));
    } catch (error) {
      setMessage(String(error));
    }
  }

  return (
    <div className="stack">
      <section className="panel">
        <h3>Create User</h3>
        <form onSubmit={handleCreateUser} className="stack">
          <input value={email} onChange={(event) => setEmail(event.target.value)} />
          <input value={password} onChange={(event) => setPassword(event.target.value)} />
          <select value={role} onChange={(event) => setRole(event.target.value as "teacher" | "student")}>
            <option value="teacher">teacher</option>
            <option value="student">student</option>
          </select>
          <button type="submit">Create</button>
        </form>
      </section>

      <section className="panel">
        <h3>Audit Events</h3>
        <button onClick={loadAudit}>Refresh</button>
        <ul>
          {audit.map((event) => (
            <li key={event.id}>
              {event.action} - {new Date(event.createdAt).toLocaleString()}
            </li>
          ))}
        </ul>
      </section>

      {message ? <p>{message}</p> : null}
    </div>
  );
}

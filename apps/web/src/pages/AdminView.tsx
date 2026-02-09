import { FormEvent, useState } from "react";

import { api } from "../api/client";

export function AdminView() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"teacher" | "student">("teacher");
  const [message, setMessage] = useState("");
  const [audit, setAudit] = useState<Array<{ id: string; action: string; createdAt: string }>>([]);

  async function handleCreateUser(event: FormEvent) {
    event.preventDefault();
    try {
      await api.createUser({ email, password, role });
      setMessage("User created.");
    } catch (error) {
      setMessage(String(error));
    }
  }

  async function loadAudit() {
    try {
      const response = await api.getAuditEvents();
      setAudit(response.items);
    } catch (error) {
      setMessage(String(error));
    }
  }

  return (
    <div className="stack">
      <section className="panel">
        <h3>Create User</h3>
        <form onSubmit={handleCreateUser} className="stack">
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
          />
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

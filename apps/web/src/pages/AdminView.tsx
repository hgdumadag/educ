import { FormEvent, useEffect, useState } from "react";

import { api } from "../api/client";
import type { TeacherListItem } from "../types";
import { TeacherView } from "./TeacherView";

export function AdminView() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"teacher" | "student">("teacher");
  const [message, setMessage] = useState("");
  const [audit, setAudit] = useState<Array<{ id: string; action: string; createdAt: string }>>([]);

  const [teachers, setTeachers] = useState<TeacherListItem[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");

  async function refreshTeachers() {
    try {
      const list = await api.listTeachers();
      setTeachers(list);
      setSelectedTeacherId((current) => {
        if (current && list.some((teacher) => teacher.id === current)) {
          return current;
        }
        return list[0]?.id ?? "";
      });
    } catch (error) {
      setMessage(String(error));
    }
  }

  useEffect(() => {
    void refreshTeachers();
  }, []);

  async function handleCreateUser(event: FormEvent) {
    event.preventDefault();
    try {
      await api.createUser({ email, password, role });
      setMessage("User created.");
      setEmail("");
      setPassword("");
      if (role === "teacher") {
        await refreshTeachers();
      }
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
        <p className="muted">
          Create teacher and student accounts here. The email is their username for login.
        </p>
        <form onSubmit={handleCreateUser} className="stack">
          <label>
            Email (login username)
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
          <label>
            Role
            <select value={role} onChange={(event) => setRole(event.target.value as "teacher" | "student")}>
              <option value="teacher">teacher</option>
              <option value="student">student</option>
            </select>
          </label>
          <button type="submit">Create</button>
        </form>
      </section>

      <section className="panel stack">
        <h3>Teacher Workspace (Admin)</h3>
        <p className="muted">
          Select a teacher to manage subjects, students, uploads, and assignments in that teacher scope.
        </p>
        <label>
          Teacher
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
        <TeacherView adminMode teacherScopeId={selectedTeacherId || undefined} />
      </section>

      <section className="panel">
        <h3>Audit Events</h3>
        <p className="muted">
          Click Refresh to view recent system actions (subject, enrollment, uploads, assignments, submissions).
        </p>
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

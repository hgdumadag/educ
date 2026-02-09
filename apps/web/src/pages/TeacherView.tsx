import { FormEvent, useEffect, useMemo, useState } from "react";

import { api } from "../api/client";
import type { ExamSummary, LessonSummary, SubjectRosterItem, SubjectSummary } from "../types";

type TeacherTile = "students" | "upload" | "assignment";

const TILE_CONTENT: Record<TeacherTile, { title: string; summary: string }> = {
  students: {
    title: "Subject Students",
    summary: "Create/link students and control enrollment completion.",
  },
  upload: {
    title: "Upload Content",
    summary: "Upload lessons and exams under the selected subject.",
  },
  assignment: {
    title: "Assign Content",
    summary: "Assign specific lesson/exam items to selected students.",
  },
};

interface TeacherViewProps {
  adminMode?: boolean;
  teacherScopeId?: string;
}

export function TeacherView({ adminMode = false, teacherScopeId }: TeacherViewProps) {
  const [subjects, setSubjects] = useState<SubjectSummary[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [roster, setRoster] = useState<SubjectRosterItem[]>([]);
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [exams, setExams] = useState<ExamSummary[]>([]);

  const [newSubjectName, setNewSubjectName] = useState("");
  const [enrollEmail, setEnrollEmail] = useState("");
  const [enrollPassword, setEnrollPassword] = useState("");
  const [enrollAutoAssignFuture, setEnrollAutoAssignFuture] = useState(true);

  const [lessonFile, setLessonFile] = useState<File | null>(null);
  const [examFile, setExamFile] = useState<File | null>(null);

  const [selectedTile, setSelectedTile] = useState<TeacherTile>("students");
  const [assignmentKind, setAssignmentKind] = useState<"lesson" | "exam">("exam");
  const [assignmentItemId, setAssignmentItemId] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [assignmentType, setAssignmentType] = useState<"practice" | "assessment">("practice");
  const [maxAttempts, setMaxAttempts] = useState("");

  const [message, setMessage] = useState("");

  const selectedSubject = useMemo(
    () => subjects.find((subject) => subject.id === selectedSubjectId) ?? null,
    [subjects, selectedSubjectId],
  );

  const visibleLessons = useMemo(
    () => lessons.filter((lesson) => lesson.subject.id === selectedSubjectId),
    [lessons, selectedSubjectId],
  );

  const visibleExams = useMemo(
    () => exams.filter((exam) => exam.subject.id === selectedSubjectId),
    [exams, selectedSubjectId],
  );

  const assignmentItems = assignmentKind === "exam" ? visibleExams : visibleLessons;

  async function refreshSubjects() {
    if (adminMode && !teacherScopeId) {
      setSubjects([]);
      setSelectedSubjectId("");
      return;
    }

    try {
      const data = await api.listSubjects(
        adminMode
          ? {
              teacherId: teacherScopeId,
            }
          : undefined,
      );
      setSubjects(data);
      setSelectedSubjectId((current) => {
        if (current && data.some((subject) => subject.id === current)) {
          return current;
        }
        return data[0]?.id ?? "";
      });
    } catch (error) {
      setMessage(String(error));
    }
  }

  async function refreshContent() {
    if (adminMode && !teacherScopeId) {
      setLessons([]);
      setExams([]);
      return;
    }

    try {
      const [lessonData, examData] = await Promise.all([api.listLessons(), api.listExams()]);
      setLessons(lessonData);
      setExams(examData);
    } catch (error) {
      setMessage(String(error));
    }
  }

  async function refreshRoster(subjectId: string) {
    if (!subjectId) {
      setRoster([]);
      return;
    }

    try {
      const data = await api.listSubjectStudents(subjectId);
      setRoster(data);
    } catch (error) {
      setMessage(String(error));
    }
  }

  useEffect(() => {
    void refreshSubjects();
    void refreshContent();
  }, [adminMode, teacherScopeId]);

  useEffect(() => {
    if (!selectedSubjectId) {
      setRoster([]);
      return;
    }

    void refreshRoster(selectedSubjectId);
    setAssignmentItemId("");
    setSelectedStudentIds([]);
  }, [selectedSubjectId]);

  async function handleCreateSubject(event: FormEvent) {
    event.preventDefault();
    if (!newSubjectName.trim()) {
      setMessage("Subject name is required.");
      return;
    }

    try {
      const created = await api.createSubject({
        name: newSubjectName,
        ...(adminMode ? { teacherOwnerId: teacherScopeId } : {}),
      });
      setNewSubjectName("");
      setMessage(`Subject created: ${created.name}`);
      await refreshSubjects();
      setSelectedSubjectId(created.id);
    } catch (error) {
      setMessage(String(error));
    }
  }

  async function handleEnrollStudent(event: FormEvent) {
    event.preventDefault();

    if (!selectedSubjectId) {
      setMessage("Select a subject first.");
      return;
    }

    if (!enrollEmail.trim()) {
      setMessage("Student email is required.");
      return;
    }

    try {
      await api.enrollSubjectStudent(selectedSubjectId, {
        email: enrollEmail,
        temporaryPassword: enrollPassword || undefined,
        autoAssignFuture: enrollAutoAssignFuture,
      });
      setEnrollEmail("");
      setEnrollPassword("");
      setEnrollAutoAssignFuture(true);
      setMessage("Student enrolled to subject.");
      await refreshRoster(selectedSubjectId);
    } catch (error) {
      setMessage(String(error));
    }
  }

  async function handleSetEnrollmentStatus(studentId: string, status: "active" | "completed") {
    if (!selectedSubjectId) {
      return;
    }

    try {
      await api.updateSubjectStudent(selectedSubjectId, studentId, { status });
      setMessage(status === "completed" ? "Enrollment marked completed." : "Enrollment reactivated.");
      await refreshRoster(selectedSubjectId);
    } catch (error) {
      setMessage(String(error));
    }
  }

  async function handleToggleAutoAssignFuture(studentId: string, autoAssignFuture: boolean) {
    if (!selectedSubjectId) {
      return;
    }

    try {
      await api.updateSubjectStudent(selectedSubjectId, studentId, { autoAssignFuture });
      setMessage("Enrollment updated.");
      await refreshRoster(selectedSubjectId);
    } catch (error) {
      setMessage(String(error));
    }
  }

  async function handleLessonUpload(event: FormEvent) {
    event.preventDefault();
    if (!selectedSubjectId) {
      setMessage("Select a subject first.");
      return;
    }
    if (!lessonFile) {
      setMessage("Select a lesson ZIP first.");
      return;
    }

    try {
      await api.uploadLesson(lessonFile, selectedSubjectId);
      setLessonFile(null);
      setMessage("Lesson uploaded.");
      await refreshContent();
    } catch (error) {
      setMessage(String(error));
    }
  }

  async function handleExamUpload(event: FormEvent) {
    event.preventDefault();
    if (!selectedSubjectId) {
      setMessage("Select a subject first.");
      return;
    }
    if (!examFile) {
      setMessage("Select an exam JSON file first.");
      return;
    }

    try {
      await api.uploadExam(examFile, selectedSubjectId);
      setExamFile(null);
      setMessage("Exam uploaded.");
      await refreshContent();
    } catch (error) {
      setMessage(String(error));
    }
  }

  async function handleManualAssignment(event: FormEvent) {
    event.preventDefault();

    if (!selectedSubjectId) {
      setMessage("Select a subject first.");
      return;
    }

    if (!assignmentItemId) {
      setMessage("Select a lesson or exam to assign.");
      return;
    }

    if (selectedStudentIds.length === 0) {
      setMessage("Select at least one student.");
      return;
    }

    try {
      await api.createAssignment({
        studentIds: selectedStudentIds,
        ...(assignmentKind === "exam" ? { examId: assignmentItemId } : { lessonId: assignmentItemId }),
        assignmentType,
        maxAttempts: maxAttempts ? Number(maxAttempts) : undefined,
      });
      setMessage("Assignments created.");
    } catch (error) {
      setMessage(String(error));
    }
  }

  function toggleStudentSelection(studentId: string) {
    setSelectedStudentIds((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId],
    );
  }

  if (adminMode && !teacherScopeId) {
    return (
      <section className="panel">
        <h3>Teacher Scope Required</h3>
        <p className="muted">Select a teacher to manage subjects, students, uploads, and assignments.</p>
      </section>
    );
  }

  return (
    <div className="stack">
      <section className="panel">
        <h3>Subjects</h3>
        <p className="muted">
          Create subjects for this teacher, then manage students and content inside each subject.
        </p>
        <form onSubmit={handleCreateSubject} className="row-wrap">
          <input
            value={newSubjectName}
            onChange={(event) => setNewSubjectName(event.target.value)}
            placeholder="e.g. Grade 7 Mathematics"
          />
          <button type="submit">Create Subject</button>
        </form>
        {subjects.length === 0 ? (
          <p className="muted">No subjects yet.</p>
        ) : (
          <div className="tile-grid">
            {subjects.map((subject) => (
              <button
                type="button"
                key={subject.id}
                className={`tile-card ${subject.id === selectedSubjectId ? "active" : ""}`}
                onClick={() => setSelectedSubjectId(subject.id)}
              >
                <h3>{subject.name}</h3>
                <p>
                  Lessons: {subject._count?.lessons ?? 0} | Exams: {subject._count?.exams ?? 0}
                </p>
                <span className="tile-cta">
                  {subject.id === selectedSubjectId ? "Selected" : "Open subject"}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedSubject ? (
        <section className="panel">
          <h3>Selected Subject: {selectedSubject.name}</h3>
          <p className="muted">Teacher owner: {selectedSubject.teacherOwner?.email ?? selectedSubject.teacherOwnerId}</p>
        </section>
      ) : null}

      <section className="tile-grid">
        {(Object.keys(TILE_CONTENT) as TeacherTile[]).map((tile) => (
          <button
            key={tile}
            type="button"
            className={`tile-card ${selectedTile === tile ? "active" : ""}`}
            onClick={() => setSelectedTile(tile)}
          >
            <h3>{TILE_CONTENT[tile].title}</h3>
            <p>{TILE_CONTENT[tile].summary}</p>
            <span className="tile-cta">
              {selectedTile === tile ? "Viewing details below" : "Click to view details"}
            </span>
          </button>
        ))}
      </section>

      {selectedTile === "students" ? (
        <section className="panel stack">
          <h3>Enroll or Link Student</h3>
          <p className="muted">
            Enter student email. If account exists, it is linked to this subject. If not, a new student account is created.
          </p>
          <form onSubmit={handleEnrollStudent} className="stack">
            <label>
              Student Email
              <input
                type="email"
                value={enrollEmail}
                onChange={(event) => setEnrollEmail(event.target.value)}
                placeholder="student@example.com"
              />
            </label>
            <label>
              Temporary Password (required only for new students)
              <input
                type="password"
                value={enrollPassword}
                onChange={(event) => setEnrollPassword(event.target.value)}
                minLength={8}
                placeholder="At least 8 characters"
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={enrollAutoAssignFuture}
                onChange={(event) => setEnrollAutoAssignFuture(event.target.checked)}
              />
              Auto-assign future content for this subject
            </label>
            <button type="submit" disabled={!selectedSubjectId}>Enroll Student</button>
          </form>

          <h4>Subject Roster</h4>
          {roster.length === 0 ? (
            <p className="muted">No students enrolled yet.</p>
          ) : (
            <div className="assignment-grid">
              {roster.map((item) => (
                <article className="assignment-card" key={item.id}>
                  <div className="assignment-head">
                    <h4>{item.student.email}</h4>
                    <span className={`badge ${item.status === "active" ? "practice" : "assessment"}`}>
                      {item.status}
                    </span>
                  </div>
                  <p className="assignment-meta">Student ID: {item.student.id}</p>
                  <p className="assignment-meta">
                    Auto-assign future: {item.autoAssignFuture ? "enabled" : "disabled"}
                  </p>
                  <div className="row-wrap">
                    <button
                      type="button"
                      onClick={() => handleSetEnrollmentStatus(item.studentId, item.status === "active" ? "completed" : "active")}
                    >
                      {item.status === "active" ? "Mark Completed" : "Set Active"}
                    </button>
                    <label className="checkbox-row compact">
                      <input
                        type="checkbox"
                        checked={item.autoAssignFuture}
                        onChange={(event) => handleToggleAutoAssignFuture(item.studentId, event.target.checked)}
                      />
                      Auto future
                    </label>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {selectedTile === "upload" ? (
        <section className="panel stack">
          <h3>Upload Content Under Subject</h3>
          <p className="muted">All uploads here are attached to the selected subject and can auto-assign to active enrollments.</p>
          <div className="row-wrap">
            <span className="muted">Lessons in subject: {visibleLessons.length}</span>
            <span className="muted">Exams in subject: {visibleExams.length}</span>
          </div>

          <form onSubmit={handleLessonUpload} className="stack">
            <label>
              Lesson ZIP
              <input
                type="file"
                accept=".zip"
                onChange={(event) => setLessonFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <button type="submit" disabled={!selectedSubjectId}>Upload Lesson</button>
          </form>

          <form onSubmit={handleExamUpload} className="stack">
            <label>
              Exam JSON
              <input
                type="file"
                accept=".json,application/json"
                onChange={(event) => setExamFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <button type="submit" disabled={!selectedSubjectId}>Upload Exam</button>
          </form>
        </section>
      ) : null}

      {selectedTile === "assignment" ? (
        <section className="panel stack">
          <h3>Assign Specific Content</h3>
          <p className="muted">
            Use this for targeted assignment. Whole-subject assignment is handled through enrollment with auto-assign.
          </p>
          <form onSubmit={handleManualAssignment} className="stack">
            <label>
              Content Type
              <select
                value={assignmentKind}
                onChange={(event) => {
                  const value = event.target.value as "lesson" | "exam";
                  setAssignmentKind(value);
                  setAssignmentItemId("");
                }}
              >
                <option value="exam">exam</option>
                <option value="lesson">lesson</option>
              </select>
            </label>

            <label>
              {assignmentKind === "exam" ? "Exam" : "Lesson"}
              <select value={assignmentItemId} onChange={(event) => setAssignmentItemId(event.target.value)}>
                <option value="">Select {assignmentKind}</option>
                {assignmentItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>

            <div className="stack">
              <p className="muted">Students</p>
              {roster.length === 0 ? (
                <p className="muted">No enrolled students in this subject yet.</p>
              ) : (
                <div className="checkbox-grid">
                  {roster.map((item) => (
                    <label key={item.studentId} className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={selectedStudentIds.includes(item.studentId)}
                        onChange={() => toggleStudentSelection(item.studentId)}
                      />
                      <span>
                        {item.student.email} ({item.status})
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <label>
              Assignment Type
              <select
                value={assignmentType}
                onChange={(event) => setAssignmentType(event.target.value as "practice" | "assessment")}
              >
                <option value="practice">practice</option>
                <option value="assessment">assessment</option>
              </select>
            </label>

            <label>
              Max Attempts (optional override)
              <input
                type="number"
                min={1}
                max={20}
                value={maxAttempts}
                onChange={(event) => setMaxAttempts(event.target.value)}
              />
            </label>

            <p className="muted">
              Manual defaults: practice = 3 attempts, assessment = 1 attempt (unless overridden).
            </p>

            <button type="submit" disabled={!selectedSubjectId}>Assign Selected Content</button>
          </form>
        </section>
      ) : null}

      {message ? <p>{message}</p> : null}
    </div>
  );
}

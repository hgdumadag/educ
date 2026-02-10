import { FormEvent, useEffect, useMemo, useState } from "react";

import { api } from "../api/client";
import type { ExamSummary, LessonSummary, SubjectRosterItem, SubjectSummary } from "../types";

type TeacherFocus = "students" | "subjects" | "lessons" | "subject_assignments" | "exams";

const FOCUS_ITEMS: Array<{ key: TeacherFocus; label: string; summary: string }> = [
  {
    key: "students",
    label: "My Students",
    summary: "View all students across subjects and manage enrollment.",
  },
  {
    key: "subjects",
    label: "My Subjects",
    summary: "Create subjects and switch context quickly.",
  },
  {
    key: "lessons",
    label: "Lessons Per Subject",
    summary: "Upload and review lessons under each subject.",
  },
  {
    key: "subject_assignments",
    label: "Students Assigned Per Subject",
    summary: "Assign specific lessons or exams to students in the selected subject.",
  },
  {
    key: "exams",
    label: "Exams",
    summary: "Upload exams and assign them as practice or assessment.",
  },
];

interface TeacherViewProps {
  adminMode?: boolean;
  teacherScopeId?: string;
}

interface StudentOverview {
  studentId: string;
  email: string;
  isActive: boolean;
  subjects: Array<{ id: string; name: string; status: "active" | "completed" }>;
}

export function TeacherView({ adminMode = false, teacherScopeId }: TeacherViewProps) {
  const [subjects, setSubjects] = useState<SubjectSummary[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [rosterBySubject, setRosterBySubject] = useState<Record<string, SubjectRosterItem[]>>({});
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [exams, setExams] = useState<ExamSummary[]>([]);

  const [newSubjectName, setNewSubjectName] = useState("");
  const [enrollEmail, setEnrollEmail] = useState("");
  const [enrollPassword, setEnrollPassword] = useState("");
  const [enrollAutoAssignFuture, setEnrollAutoAssignFuture] = useState(true);

  const [lessonFile, setLessonFile] = useState<File | null>(null);
  const [examFile, setExamFile] = useState<File | null>(null);

  const [activeFocus, setActiveFocus] = useState<TeacherFocus>("students");
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

  const selectedRoster = useMemo(
    () => rosterBySubject[selectedSubjectId] ?? [],
    [rosterBySubject, selectedSubjectId],
  );

  const visibleLessons = useMemo(
    () => lessons.filter((lesson) => lesson.subject.id === selectedSubjectId),
    [lessons, selectedSubjectId],
  );

  const visibleExams = useMemo(
    () => exams.filter((exam) => exam.subject.id === selectedSubjectId),
    [exams, selectedSubjectId],
  );

  const allStudents = useMemo<StudentOverview[]>(() => {
    const map = new Map<string, StudentOverview>();

    for (const subject of subjects) {
      const subjectRoster = rosterBySubject[subject.id] ?? [];
      for (const enrollment of subjectRoster) {
        const existing = map.get(enrollment.studentId);
        const subjectInfo = {
          id: subject.id,
          name: subject.name,
          status: enrollment.status,
        };

        if (!existing) {
          map.set(enrollment.studentId, {
            studentId: enrollment.studentId,
            email: enrollment.student.email,
            isActive: enrollment.student.isActive,
            subjects: [subjectInfo],
          });
          continue;
        }

        if (!existing.subjects.some((item) => item.id === subject.id)) {
          existing.subjects.push(subjectInfo);
        }
      }
    }

    return [...map.values()].sort((a, b) => a.email.localeCompare(b.email));
  }, [subjects, rosterBySubject]);

  const assignmentItems = assignmentKind === "exam" ? visibleExams : visibleLessons;

  async function refreshSubjects() {
    if (adminMode && !teacherScopeId) {
      setSubjects([]);
      setSelectedSubjectId("");
      setRosterBySubject({});
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

      if (data.length === 0) {
        setRosterBySubject({});
      }
    } catch (error) {
      setMessage(String(error));
    }
  }

  async function refreshAllRosters(subjectList?: SubjectSummary[]) {
    const targetSubjects = subjectList ?? subjects;
    if (targetSubjects.length === 0) {
      setRosterBySubject({});
      return;
    }

    try {
      const entries = await Promise.all(
        targetSubjects.map(async (subject) => [subject.id, await api.listSubjectStudents(subject.id)] as const),
      );
      setRosterBySubject(Object.fromEntries(entries));
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

  useEffect(() => {
    async function bootstrap() {
      if (adminMode && !teacherScopeId) {
        setSubjects([]);
        setSelectedSubjectId("");
        setRosterBySubject({});
        setLessons([]);
        setExams([]);
        return;
      }

      try {
        const subjectData = await api.listSubjects(
          adminMode
            ? {
                teacherId: teacherScopeId,
              }
            : undefined,
        );
        setSubjects(subjectData);
        setSelectedSubjectId((current) => {
          if (current && subjectData.some((subject) => subject.id === current)) {
            return current;
          }
          return subjectData[0]?.id ?? "";
        });

        const [lessonData, examData, rosterEntries] = await Promise.all([
          api.listLessons(),
          api.listExams(),
          Promise.all(subjectData.map(async (subject) => [subject.id, await api.listSubjectStudents(subject.id)] as const)),
        ]);

        setLessons(lessonData);
        setExams(examData);
        setRosterBySubject(Object.fromEntries(rosterEntries));
      } catch (error) {
        setMessage(String(error));
      }
    }

    void bootstrap();
  }, [adminMode, teacherScopeId]);

  useEffect(() => {
    setAssignmentItemId("");
    setSelectedStudentIds([]);
  }, [selectedSubjectId, assignmentKind]);

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
      await refreshContent();
      const newSubjects = await api.listSubjects(
        adminMode
          ? {
              teacherId: teacherScopeId,
            }
          : undefined,
      );
      setSubjects(newSubjects);
      setSelectedSubjectId(created.id);
      await refreshAllRosters(newSubjects);
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
      await refreshAllRosters();
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
      await refreshAllRosters();
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
      await refreshAllRosters();
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
        <p className="muted">Select a teacher to open the Axiometry teacher workspace.</p>
      </section>
    );
  }

  return (
    <div className="stack">
      <section className="panel stack">
        <h3>Axiometry Teacher Workspace</h3>
        <p className="muted">Navigate by your top priorities and manage classroom relationships from one screen.</p>
        <div className="focus-nav">
          {FOCUS_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`focus-pill ${activeFocus === item.key ? "active" : ""}`}
              onClick={() => setActiveFocus(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel stack">
        <div className="row-wrap">
          <h3>Current Subject</h3>
          <select
            value={selectedSubjectId}
            onChange={(event) => setSelectedSubjectId(event.target.value)}
          >
            <option value="">Select subject</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </div>
        {selectedSubject ? (
          <div className="summary-grid">
            <article className="summary-card">
              <h4>Students in Subject</h4>
              <p>{selectedRoster.length}</p>
            </article>
            <article className="summary-card">
              <h4>Lessons</h4>
              <p>{visibleLessons.length}</p>
            </article>
            <article className="summary-card">
              <h4>Exams</h4>
              <p>{visibleExams.length}</p>
            </article>
          </div>
        ) : (
          <p className="muted">Select a subject to see related students, lessons, exams, and assignments.</p>
        )}
      </section>

      {activeFocus === "subjects" ? (
        <section className="panel stack">
          <h3>My Subjects</h3>
          <p className="muted">Create and organize subjects you manage.</p>
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
                    Students: {(rosterBySubject[subject.id] ?? []).length} | Lessons: {lessons.filter((lesson) => lesson.subject.id === subject.id).length} | Exams: {exams.filter((exam) => exam.subject.id === subject.id).length}
                  </p>
                  <span className="tile-cta">
                    {subject.id === selectedSubjectId ? "Selected" : "Switch to this subject"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {activeFocus === "students" ? (
        <section className="panel stack">
          <h3>My Students</h3>
          <p className="muted">All students across your Axiometry subjects, plus enrollment controls for the selected subject.</p>

          <div className="student-overview-grid">
            {allStudents.length === 0 ? (
              <p className="muted">No enrolled students yet.</p>
            ) : (
              allStudents.map((student) => (
                <article key={student.studentId} className="assignment-card">
                  <div className="assignment-head">
                    <h4>{student.email}</h4>
                    <span className={`badge ${student.isActive ? "practice" : "assessment"}`}>
                      {student.isActive ? "active" : "inactive"}
                    </span>
                  </div>
                  <p className="assignment-meta">Student ID: {student.studentId}</p>
                  <p className="assignment-meta">
                    Subjects: {student.subjects.map((subject) => `${subject.name} (${subject.status})`).join(", ")}
                  </p>
                </article>
              ))
            )}
          </div>

          <h4>Enroll Student Into Selected Subject</h4>
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

          <h4>Students Assigned Per Subject ({selectedSubject?.name ?? "No subject selected"})</h4>
          {selectedRoster.length === 0 ? (
            <p className="muted">No students enrolled in selected subject.</p>
          ) : (
            <div className="assignment-grid">
              {selectedRoster.map((item) => (
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

      {activeFocus === "lessons" ? (
        <section className="panel stack">
          <h3>Lessons Per Subject</h3>
          <p className="muted">Upload new lessons and review all lessons under the selected subject.</p>
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

          {visibleLessons.length === 0 ? (
            <p className="muted">No lessons under selected subject yet.</p>
          ) : (
            <div className="assignment-grid">
              {visibleLessons.map((lesson) => (
                <article key={lesson.id} className="assignment-card">
                  <h4>{lesson.title}</h4>
                  <p className="assignment-meta">Subject: {lesson.subject.name}</p>
                  <p className="assignment-meta">Lesson ID: {lesson.id}</p>
                  <p className="assignment-meta">Grade Level: {lesson.gradeLevel ?? "n/a"}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {activeFocus === "exams" ? (
        <section className="panel stack">
          <h3>Exams (Practice or Assessment)</h3>
          <p className="muted">Upload exams for selected subject. Use assignment section to assign as practice or assessment.</p>

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

          {visibleExams.length === 0 ? (
            <p className="muted">No exams under selected subject yet.</p>
          ) : (
            <div className="assignment-grid">
              {visibleExams.map((exam) => (
                <article key={exam.id} className="assignment-card">
                  <h4>{exam.title}</h4>
                  <p className="assignment-meta">Subject: {exam.subject.name}</p>
                  <p className="assignment-meta">Exam ID: {exam.id}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {activeFocus === "subject_assignments" ? (
        <section className="panel stack">
          <h3>Students Assigned Per Subject</h3>
          <p className="muted">Assign one selected lesson/exam to selected students in this subject.</p>
          <form onSubmit={handleManualAssignment} className="stack">
            <label>
              Content Type
              <select
                value={assignmentKind}
                onChange={(event) => setAssignmentKind(event.target.value as "lesson" | "exam")}
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
              <p className="muted">Students in selected subject</p>
              {selectedRoster.length === 0 ? (
                <p className="muted">No enrolled students in this subject yet.</p>
              ) : (
                <div className="checkbox-grid">
                  {selectedRoster.map((item) => (
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
              Defaults: practice = 3 attempts, assessment = 1 attempt (unless overridden).
            </p>

            <button type="submit" disabled={!selectedSubjectId}>Assign Selected Content</button>
          </form>
        </section>
      ) : null}

      {message ? <p>{message}</p> : null}
    </div>
  );
}

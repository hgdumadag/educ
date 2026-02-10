import { FormEvent, useEffect, useMemo, useState } from "react";

import { api } from "../api/client";
import axiometryLogo from "../assets/axiometry-logo.png";
import axiometryOpenLogo from "../assets/axiometry-open.png";
import type { ExamSummary, LessonSummary, SubjectRosterItem, SubjectSummary } from "../types";

type TeacherFocus = "students" | "subjects" | "lessons" | "subject_assignments" | "exams";
type TeacherTab = "overview" | TeacherFocus;

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
  showChrome?: boolean;
  currentUserEmail?: string;
  currentUserRoleLabel?: string;
  contexts?: Array<{ membershipId: string; tenantName: string; role: string }>;
  activeMembershipId?: string;
  loadingContext?: boolean;
  onSwitchContext?: (membershipId: string) => void | Promise<void>;
  onLogout?: () => void | Promise<void>;
}

interface StudentOverview {
  studentId: string;
  email: string;
  isActive: boolean;
  subjects: Array<{ id: string; name: string; status: "active" | "completed" }>;
}

export function TeacherView(props: TeacherViewProps) {
  // Note: this component is also used embedded inside the admin console. `showChrome`
  // enables the fixed top/bottom console layout for teachers/parents/tutors.
  const {
    adminMode = false,
    teacherScopeId,
    showChrome = false,
    currentUserEmail,
    currentUserRoleLabel,
    contexts,
    activeMembershipId,
    loadingContext,
    onSwitchContext,
    onLogout,
  } = props;

  const BRAND_TAGLINE = "Where learning happens, and progress is measured.";
  const RESOURCE_ITEMS = [
    "About Us",
    "Help",
    "Privacy Policy",
    "Terms of Service",
    "Contact Support",
    "System Status",
  ] as const;

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

  const [activeTab, setActiveTab] = useState<TeacherTab>(() => (showChrome ? "overview" : "students"));
  const [menuOpen, setMenuOpen] = useState(false);
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

  const teacherTabs = useMemo(
    () =>
      [
        { key: "overview" as const, label: "Overview" },
        { key: "subjects" as const, label: "Subjects" },
        { key: "students" as const, label: "Students" },
        { key: "lessons" as const, label: "Lessons" },
        { key: "exams" as const, label: "Exams" },
        { key: "subject_assignments" as const, label: "Assign" },
      ] satisfies Array<{ key: TeacherTab; label: string }>,
    [],
  );

  function switchTab(tab: TeacherTab) {
    setActiveTab(tab);
    setMenuOpen(false);
  }

  if (adminMode && !teacherScopeId) {
    return (
      <section className="panel">
        <h3>Teacher Scope Required</h3>
        <p className="muted">Select a teacher to open the Axiometry teacher workspace.</p>
      </section>
    );
  }

  const workspaceHeader = (
    <section className="panel stack">
      <h3>Axiometry Teacher Workspace</h3>
      <p className="muted">Navigate by your top priorities and manage classroom relationships from one screen.</p>
      <div className="focus-nav">
        {FOCUS_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`focus-pill ${activeTab === item.key ? "active" : ""}`}
            onClick={() => switchTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </section>
  );

  const currentSubjectPanel = (
    <section className="panel stack">
      <div className="row-wrap">
        <h3>Current Subject</h3>
        <select value={selectedSubjectId} onChange={(event) => setSelectedSubjectId(event.target.value)}>
          <option value="">Select subject</option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </select>
        <button type="button" className="button-secondary" onClick={() => void refreshSubjects()}>
          Refresh Subjects
        </button>
        <button type="button" className="button-secondary" onClick={() => void refreshContent()}>
          Refresh Content
        </button>
        <button type="button" className="button-secondary" onClick={() => void refreshAllRosters()}>
          Refresh Rosters
        </button>
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
  );

  const overviewPanel = (
    <>
      <section className="panel help-card">
        <h3>What to do first (Teacher)</h3>
        <ol className="steps">
          <li>Create one or more subjects.</li>
          <li>Enroll students into a subject (whole-subject assignment flow).</li>
          <li>Upload lesson ZIP and exam JSON under that subject.</li>
          <li>Assign specific items when you need targeted work.</li>
        </ol>
      </section>

      <section className="panel stack">
        <h3>My Subjects (Quick Pick)</h3>
        <p className="muted">Select a subject to manage its students, lessons, exams, and assignments.</p>
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
                  Students: {(rosterBySubject[subject.id] ?? []).length} | Lessons:{" "}
                  {lessons.filter((lesson) => lesson.subject.id === subject.id).length} | Exams:{" "}
                  {exams.filter((exam) => exam.subject.id === subject.id).length}
                </p>
                <span className="tile-cta">{subject.id === selectedSubjectId ? "Selected" : "Open subject"}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  );

  const coreContent = (
    <div className={`stack ${showChrome ? "admin-main-content" : ""}`}>
      {!showChrome ? workspaceHeader : null}
      {currentSubjectPanel}

      {activeTab === "overview" ? overviewPanel : null}

      {activeTab === "subjects" ? (
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

      {activeTab === "students" ? (
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

      {activeTab === "lessons" ? (
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

      {activeTab === "exams" ? (
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

      {activeTab === "subject_assignments" ? (
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

      {message ? <p className={showChrome ? "admin-feedback success" : ""}>{message}</p> : null}
    </div>
  );

  if (!showChrome) {
    return <div className="stack">{coreContent}</div>;
  }

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
                  {RESOURCE_ITEMS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className="admin-menu-link"
                      onClick={() => {
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
          {currentUserRoleLabel ? <span className="admin-top-chip">{currentUserRoleLabel}</span> : null}
          {currentUserEmail ? <span className="admin-top-chip">{currentUserEmail}</span> : null}
          {onLogout ? (
            <button
              type="button"
              className="admin-top-button admin-signout-button"
              onClick={() => void onLogout()}
            >
              Sign out
            </button>
          ) : null}
        </div>
      </header>

      <section className="panel admin-hero">
        <div>
          <p className="admin-eyebrow">Teacher Console</p>
          <h2>Manage students, subjects, lessons, and exams without losing the thread</h2>
          <p className="muted">Use the tabs below to switch between your core tasks quickly.</p>
        </div>
      </section>

      {contexts && contexts.length > 1 && activeMembershipId && onSwitchContext ? (
        <section className="panel admin-toolbar">
          <div className="admin-toolbar-grid">
            <label>
              Active workspace
              <select
                value={activeMembershipId}
                onChange={(event) => void onSwitchContext(event.target.value)}
                disabled={!!loadingContext}
              >
                {contexts.map((context) => (
                  <option key={context.membershipId} value={context.membershipId}>
                    {context.tenantName} ({context.role})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Jump to subject
              <select value={selectedSubjectId} onChange={(event) => setSelectedSubjectId(event.target.value)}>
                <option value="">Select subject</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="row-wrap">
              <button type="button" className="button-secondary" onClick={() => void refreshSubjects()}>
                Refresh
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {coreContent}

      <nav className="admin-bottom-layer" aria-label="Teacher sections">
        {teacherTabs.map((tab) => (
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

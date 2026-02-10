import { FormEvent, useEffect, useMemo, useState } from "react";

import { api } from "../api/client";
import axiometryLogo from "../assets/axiometry-logo.png";
import axiometryOpenLogo from "../assets/axiometry-open.png";
import { LessonViewerModal } from "../components/LessonViewerModal";
import type { Assignment, ExamDetails, LessonSummary } from "../types";

interface SubjectGroup {
  subjectId: string;
  subjectName: string;
  count: number;
}

type StudentTab = "overview" | "subjects" | "lessons" | "exams";

interface StudentViewProps {
  showChrome?: boolean;
  currentUserEmail?: string;
  currentUserRoleLabel?: string;
  contexts?: Array<{ membershipId: string; tenantName: string; role: string }>;
  activeMembershipId?: string;
  loadingContext?: boolean;
  onSwitchContext?: (membershipId: string) => void | Promise<void>;
  onLogout?: () => void | Promise<void>;
}

export function StudentView({
  showChrome = false,
  currentUserEmail,
  currentUserRoleLabel,
  contexts,
  activeMembershipId,
  loadingContext,
  onSwitchContext,
  onLogout,
}: StudentViewProps) {
  const BRAND_TAGLINE = "Where learning happens, and progress is measured.";
  const RESOURCE_ITEMS = [
    "About Us",
    "Help",
    "Privacy Policy",
    "Terms of Service",
    "Contact Support",
    "System Status",
  ] as const;

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedExam, setSelectedExam] = useState<ExamDetails | null>(null);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [selectedAssignmentExamId, setSelectedAssignmentExamId] = useState("");
  const [attemptId, setAttemptId] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<unknown>(null);
  const [message, setMessage] = useState("");
  const [lessonPreview, setLessonPreview] = useState<{
    open: boolean;
    title: string;
    subtitle: string;
    markdown: string;
  }>({ open: false, title: "", subtitle: "", markdown: "" });
  const [loadingLessonPreview, setLoadingLessonPreview] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<StudentTab>("overview");

  async function refreshAssignments() {
    try {
      const data = await api.myAssignments();
      setAssignments(data);
    } catch (error) {
      setMessage(String(error));
    }
  }

  async function refreshLessons() {
    try {
      const data = await api.listLessons();
      setLessons(data);
    } catch (error) {
      setMessage(String(error));
    }
  }

  useEffect(() => {
    void refreshAssignments();
    void refreshLessons();
  }, []);

  const subjectGroups = useMemo<SubjectGroup[]>(() => {
    const map = new Map<string, SubjectGroup>();
    for (const assignment of assignments) {
      const subjectId = assignment.subject?.id ?? "unknown";
      const subjectName = assignment.subject?.name ?? "Ungrouped";
      const existing = map.get(subjectId);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(subjectId, {
          subjectId,
          subjectName,
          count: 1,
        });
      }
    }

    return [...map.values()].sort((a, b) => a.subjectName.localeCompare(b.subjectName));
  }, [assignments]);

  const lessonSubjectGroups = useMemo<SubjectGroup[]>(() => {
    const map = new Map<string, SubjectGroup>();
    for (const lesson of lessons) {
      const subjectId = lesson.subject?.id ?? "unknown";
      const subjectName = lesson.subject?.name ?? "Ungrouped";
      const existing = map.get(subjectId);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(subjectId, { subjectId, subjectName, count: 1 });
      }
    }
    return [...map.values()].sort((a, b) => a.subjectName.localeCompare(b.subjectName));
  }, [lessons]);

  const allSubjectGroups = useMemo<SubjectGroup[]>(() => {
    const map = new Map<string, SubjectGroup>();
    for (const group of [...subjectGroups, ...lessonSubjectGroups]) {
      const existing = map.get(group.subjectId);
      if (existing) {
        existing.count += group.count;
      } else {
        map.set(group.subjectId, { ...group });
      }
    }
    return [...map.values()].sort((a, b) => a.subjectName.localeCompare(b.subjectName));
  }, [subjectGroups, lessonSubjectGroups]);

  useEffect(() => {
    if (allSubjectGroups.length === 0) {
      setSelectedSubjectId("");
      return;
    }

    setSelectedSubjectId((current) => {
      if (current && allSubjectGroups.some((group) => group.subjectId === current)) {
        return current;
      }
      return allSubjectGroups[0].subjectId;
    });
  }, [allSubjectGroups]);

  const examAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.examId && assignment.exam),
    [assignments],
  );

  const visibleExamAssignments = useMemo(() => {
    if (!selectedSubjectId) {
      return examAssignments;
    }
    return examAssignments.filter((assignment) => (assignment.subject?.id ?? "unknown") === selectedSubjectId);
  }, [examAssignments, selectedSubjectId]);

  const visibleLessons = useMemo(() => {
    if (!selectedSubjectId) {
      return lessons;
    }
    return lessons.filter((lesson) => (lesson.subject?.id ?? "unknown") === selectedSubjectId);
  }, [lessons, selectedSubjectId]);

  async function openLesson(lesson: LessonSummary) {
    try {
      setLoadingLessonPreview(true);
      const data = await api.lessonContent(lesson.id);
      setLessonPreview({
        open: true,
        title: data.title,
        subtitle: data.subject.name,
        markdown: data.markdown,
      });
      setActiveTab("lessons");
    } catch (error) {
      setMessage(String(error));
    } finally {
      setLoadingLessonPreview(false);
    }
  }

  const selectedAssignment = useMemo(
    () => visibleExamAssignments.find((assignment) => assignment.id === selectedAssignmentId) ?? null,
    [visibleExamAssignments, selectedAssignmentId],
  );

  const answeredCount = useMemo(() => {
    if (!selectedExam) {
      return 0;
    }

    return selectedExam.questions.filter((question) => (answers[question.id] ?? "").trim().length > 0).length;
  }, [selectedExam, answers]);
  const totalQuestions = selectedExam?.questions.length ?? 0;

  async function loadExam(assignmentId: string, examId: string) {
    setSelectedAssignmentId(assignmentId);
    setSelectedAssignmentExamId(examId);
    try {
      const details = await api.examDetails(examId);
      setSelectedExam(details);
      setAnswers({});
      setAttemptId("");
      setResult(null);
      setActiveTab("exams");
    } catch (error) {
      setMessage(String(error));
    }
  }

  async function startAttempt(event: FormEvent) {
    event.preventDefault();
    if (!selectedExam || !selectedAssignmentId) {
      return;
    }

    try {
      const attempt = await api.createAttempt(selectedAssignmentId);
      setAttemptId(attempt.id);
      setMessage("Attempt started.");
    } catch (error) {
      setMessage(String(error));
    }
  }

  async function saveAnswers(event: FormEvent) {
    event.preventDefault();
    if (!attemptId) {
      setMessage("Start an attempt first.");
      return;
    }

    try {
      await api.saveResponses(
        attemptId,
        Object.entries(answers).map(([questionId, answer]) => ({ questionId, answer })),
      );
      setMessage("Responses saved.");
    } catch (error) {
      setMessage(String(error));
    }
  }

  async function submitAttempt() {
    if (!attemptId) {
      setMessage("Start an attempt first.");
      return;
    }

    try {
      await api.submitAttempt(attemptId);
      const details = await api.attemptResult(attemptId);
      setResult(details);
      setMessage("Attempt submitted.");
      await refreshAssignments();
    } catch (error) {
      setMessage(String(error));
    }
  }

  function switchTab(tab: StudentTab) {
    setActiveTab(tab);
    setMenuOpen(false);
  }

  const bottomTabs = useMemo(
    () =>
      [
        { key: "overview" as const, label: "Overview" },
        { key: "subjects" as const, label: "Subjects" },
        { key: "lessons" as const, label: "Lessons" },
        { key: "exams" as const, label: "Exams" },
      ] satisfies Array<{ key: StudentTab; label: string }>,
    [],
  );

  const overviewPanel = (
    <>
      <section className="panel help-card">
        <h3>What to do first (Student)</h3>
        <ol className="steps">
          <li>Open a subject and pick an assigned exam.</li>
          <li>Click Start Attempt to begin.</li>
          <li>Answer questions and click Autosave Responses regularly.</li>
          <li>Submit Attempt when done, then review your result.</li>
        </ol>
      </section>

      <section className="panel stack">
        <h3>At a glance</h3>
        <div className="summary-grid">
          <article className="summary-card">
            <h4>Subjects</h4>
            <p>{subjectGroups.length}</p>
          </article>
          <article className="summary-card">
            <h4>Exam assignments</h4>
            <p>{examAssignments.length}</p>
          </article>
          <article className="summary-card">
            <h4>Total assignments</h4>
            <p>{assignments.length}</p>
          </article>
        </div>
      </section>
    </>
  );

  const subjectsPanel = (
    <section className="panel">
      <h3>Subjects</h3>
      <p className="muted">Choose a subject to view assigned exams.</p>
      {allSubjectGroups.length === 0 ? (
        <p className="muted">No assigned content yet. Contact your Axiometry teacher if you expected one.</p>
      ) : (
        <div className="tile-grid">
          {allSubjectGroups.map((group) => (
            <button
              key={group.subjectId}
              type="button"
              className={`tile-card ${group.subjectId === selectedSubjectId ? "active" : ""}`}
              onClick={() => {
                setSelectedSubjectId(group.subjectId);
                setActiveTab("exams");
              }}
            >
              <h3>{group.subjectName}</h3>
              <p>{group.count} assignment(s)</p>
              <span className="tile-cta">Open exams</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );

  const lessonsPanel = (
    <section className="panel stack">
      <h3>Lessons</h3>
      <p className="muted">Open a lesson to read it the same way your teacher preview sees it.</p>

      {visibleLessons.length === 0 ? (
        <p className="muted">No assigned lessons in this subject yet.</p>
      ) : (
        <div className="assignment-grid">
          {visibleLessons.map((lesson) => (
            <button
              type="button"
              key={lesson.id}
              className="assignment-card"
              onClick={() => void openLesson(lesson)}
              disabled={loadingLessonPreview}
            >
              <div className="assignment-head">
                <h4>{lesson.title}</h4>
                <span className="tile-cta">Open</span>
              </div>
              <p className="assignment-meta">Subject: {lesson.subject?.name ?? "Ungrouped"}</p>
              <p className="assignment-meta">Grade Level: {lesson.gradeLevel ?? "n/a"}</p>
            </button>
          ))}
        </div>
      )}
    </section>
  );

  const examsPanel = (
    <>
      <section className="panel">
        <h3>Assigned Exams</h3>
        <p className="muted">
          Pick an exam below, start an attempt, save responses during work, then submit when finished.
        </p>
        {visibleExamAssignments.length === 0 ? <p className="muted">No assigned exams in this subject yet.</p> : null}
        <div className="assignment-grid">
          {visibleExamAssignments.map((assignment) => {
            const isActive = assignment.id === selectedAssignmentId;
            const remainingAttempts = Math.max(assignment.maxAttempts - assignment.attemptsUsed, 0);

            return (
              <button
                key={assignment.id}
                type="button"
                className={`assignment-card ${isActive ? "active" : ""}`}
                onClick={() => loadExam(assignment.id, assignment.examId!)}
              >
                <div className="assignment-head">
                  <h4>{assignment.exam?.title}</h4>
                  <span className={`badge ${assignment.assignmentType}`}>{assignment.assignmentType}</span>
                </div>
                <p className="muted">
                  Source: {assignment.assignmentSource === "subject_auto" ? "Subject auto" : "Manual"}
                </p>
                <p className="muted">Subject enrollment: {assignment.subjectEnrollmentStatus ?? "n/a"}</p>
                <p className="assignment-meta">
                  Attempts used: {assignment.attemptsUsed}/{assignment.maxAttempts}
                </p>
                <p className="assignment-meta">Remaining attempts: {remainingAttempts}</p>
                <span className="tile-cta">{isActive ? "Viewing below" : "Open details"}</span>
              </button>
            );
          })}
        </div>
      </section>

      {selectedExam ? (
        <section className="panel stack">
          <div className="row">
            <div>
              <h3>{selectedExam.title}</h3>
              <p className="muted">{selectedExam.subject.name}</p>
              <p className="muted">Assignment ID: {selectedAssignmentId}</p>
              <p className="muted">Exam ID: {selectedAssignmentExamId}</p>
            </div>
            <div>
              <p className="muted">
                Answered: {answeredCount}/{totalQuestions}
              </p>
              {selectedAssignment ? (
                <p className="muted">
                  Attempts: {selectedAssignment.attemptsUsed}/{selectedAssignment.maxAttempts}
                </p>
              ) : null}
            </div>
          </div>
          <p className="muted">Step 1: Start attempt. Step 2: Answer and autosave. Step 3: Submit.</p>

          <form onSubmit={startAttempt}>
            <button type="submit" disabled={!selectedAssignment || !!attemptId}>
              {attemptId ? "Attempt Started" : "Start Attempt"}
            </button>
          </form>

          <form onSubmit={saveAnswers} className="stack">
            <div className="question-list">
              {selectedExam.questions.map((question, index) => (
                <div className="question-card" key={question.id}>
                  <label>
                    <span className="question-title">
                      Q{index + 1}. {question.prompt}
                    </span>
                    <span className="muted">Question ID: {question.id}</span>
                    {question.choices && question.choices.length > 0 ? (
                      <select
                        value={answers[question.id] ?? ""}
                        onChange={(event) => setAnswers((prev) => ({ ...prev, [question.id]: event.target.value }))}
                      >
                        <option value="">Select</option>
                        {question.choices.map((choice) => (
                          <option key={choice} value={choice}>
                            {choice}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <textarea
                        value={answers[question.id] ?? ""}
                        onChange={(event) => setAnswers((prev) => ({ ...prev, [question.id]: event.target.value }))}
                        placeholder="Type your answer"
                      />
                    )}
                  </label>
                </div>
              ))}
            </div>
            <button type="submit" disabled={!attemptId}>
              Autosave Responses
            </button>
          </form>

          <div className="row-wrap">
            <button type="button" onClick={() => void submitAttempt()} disabled={!attemptId}>
              Submit Attempt
            </button>
          </div>
        </section>
      ) : (
        <section className="panel">
          <p className="muted">Choose an exam assignment above to begin.</p>
        </section>
      )}

      {result ? (
        <section className="panel">
          <h3>Result</h3>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </section>
      ) : null}
    </>
  );

  const mainContent = (
    <div className={`stack ${showChrome ? "admin-main-content" : ""}`}>
      {activeTab === "overview" ? overviewPanel : null}
      {activeTab === "subjects" ? subjectsPanel : null}
      {activeTab === "lessons" ? lessonsPanel : null}
      {activeTab === "exams" ? examsPanel : null}
      <LessonViewerModal
        open={lessonPreview.open}
        title={lessonPreview.title}
        subtitle={lessonPreview.subtitle}
        markdown={lessonPreview.markdown}
        onClose={() => setLessonPreview({ open: false, title: "", subtitle: "", markdown: "" })}
      />
      {message ? <p className={showChrome ? "admin-feedback success" : ""}>{message}</p> : null}
    </div>
  );

  if (!showChrome) {
    return <div className="stack">{mainContent}</div>;
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
            <button type="button" className="admin-top-button admin-signout-button" onClick={() => void onLogout()}>
              Sign out
            </button>
          ) : null}
        </div>
      </header>

      <section className="panel admin-hero">
        <div>
          <p className="admin-eyebrow">Student Console</p>
          <h2>Learn, practice, and see what you have left to finish</h2>
          <p className="muted">Use the tabs below to move between subjects and assigned exams.</p>
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
	              Subject filter
	              <select value={selectedSubjectId} onChange={(event) => setSelectedSubjectId(event.target.value)}>
	                <option value="">All subjects</option>
	                {allSubjectGroups.map((group) => (
	                  <option key={group.subjectId} value={group.subjectId}>
	                    {group.subjectName}
	                  </option>
	                ))}
	              </select>
	            </label>
	            <div className="row-wrap">
	              <button
                  type="button"
                  className="button-secondary"
                  onClick={() => {
                    void refreshAssignments();
                    void refreshLessons();
                  }}
                >
	                Refresh
	              </button>
	            </div>
          </div>
        </section>
      ) : null}

      {mainContent}

      <nav className="admin-bottom-layer" aria-label="Student sections">
        {bottomTabs.map((tab) => (
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

import { FormEvent, useEffect, useMemo, useState } from "react";

import { api } from "../api/client";
import type { Assignment, ExamDetails } from "../types";

interface SubjectGroup {
  subjectId: string;
  subjectName: string;
  count: number;
}

export function StudentView() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedExam, setSelectedExam] = useState<ExamDetails | null>(null);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [selectedAssignmentExamId, setSelectedAssignmentExamId] = useState("");
  const [attemptId, setAttemptId] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<unknown>(null);
  const [message, setMessage] = useState("");

  async function refreshAssignments() {
    try {
      const data = await api.myAssignments();
      setAssignments(data);
    } catch (error) {
      setMessage(String(error));
    }
  }

  useEffect(() => {
    void refreshAssignments();
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

    return [...map.values()];
  }, [assignments]);

  useEffect(() => {
    if (subjectGroups.length === 0) {
      setSelectedSubjectId("");
      return;
    }

    setSelectedSubjectId((current) => {
      if (current && subjectGroups.some((group) => group.subjectId === current)) {
        return current;
      }
      return subjectGroups[0].subjectId;
    });
  }, [subjectGroups]);

  const examAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.examId && assignment.exam),
    [assignments],
  );

  const visibleExamAssignments = useMemo(
    () =>
      selectedSubjectId
        ? examAssignments.filter((assignment) => (assignment.subject?.id ?? "unknown") === selectedSubjectId)
        : examAssignments,
    [examAssignments, selectedSubjectId],
  );

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
      setMessage(`Attempt started: ${attempt.id}`);
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

  return (
    <div className="stack">
      <section className="panel">
        <h3>Subjects</h3>
        <p className="muted">Choose a subject to view assigned exams and continue attempts.</p>
        {subjectGroups.length === 0 ? (
          <p className="muted">No assigned content yet. Contact your teacher if you expected one.</p>
        ) : (
          <div className="tile-grid">
            {subjectGroups.map((group) => (
              <button
                key={group.subjectId}
                type="button"
                className={`tile-card ${group.subjectId === selectedSubjectId ? "active" : ""}`}
                onClick={() => setSelectedSubjectId(group.subjectId)}
              >
                <h3>{group.subjectName}</h3>
                <p>{group.count} assignment(s)</p>
                <span className="tile-cta">
                  {group.subjectId === selectedSubjectId ? "Viewing assignments below" : "Open subject"}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h3>Assigned Exams</h3>
        <p className="muted">
          Pick an exam below, start an attempt, save responses during work, then submit when finished.
        </p>
        {visibleExamAssignments.length === 0 ? (
          <p className="muted">No assigned exams in this subject yet.</p>
        ) : null}
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
                  <span className={`badge ${assignment.assignmentType}`}>
                    {assignment.assignmentType}
                  </span>
                </div>
                <p className="muted">Source: {assignment.assignmentSource === "subject_auto" ? "Subject auto" : "Manual"}</p>
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
        <section className="panel">
          <div className="row">
            <div>
              <h3>{selectedExam.title}</h3>
              <p className="muted">{selectedExam.subject.name}</p>
              <p className="muted">Assignment ID: {selectedAssignmentId}</p>
              <p className="muted">Exam ID: {selectedAssignmentExamId}</p>
            </div>
            <div>
              <p className="muted">Answered: {answeredCount}/{totalQuestions}</p>
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

          <button onClick={submitAttempt} disabled={!attemptId}>
            Submit Attempt
          </button>
        </section>
      ) : null}

      {result ? (
        <section className="panel">
          <h3>Result</h3>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </section>
      ) : null}

      {message ? <p>{message}</p> : null}
    </div>
  );
}

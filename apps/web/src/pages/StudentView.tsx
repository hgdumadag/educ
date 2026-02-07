import { FormEvent, useEffect, useMemo, useState } from "react";

import { api } from "../api/client";
import type { Assignment, ExamDetails } from "../types";

interface Props {
  accessToken: string;
}

export function StudentView({ accessToken }: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedExam, setSelectedExam] = useState<ExamDetails | null>(null);
  const [selectedAssignmentExamId, setSelectedAssignmentExamId] = useState("");
  const [attemptId, setAttemptId] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<unknown>(null);
  const [message, setMessage] = useState("");

  async function refreshAssignments() {
    try {
      const data = await api.myAssignments(accessToken);
      setAssignments(data);
    } catch (error) {
      setMessage(String(error));
    }
  }

  useEffect(() => {
    refreshAssignments();
  }, []);

  const examAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.examId && assignment.exam),
    [assignments],
  );

  async function loadExam(examId: string) {
    setSelectedAssignmentExamId(examId);
    try {
      const details = await api.examDetails(accessToken, examId);
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
    if (!selectedExam) {
      return;
    }

    try {
      const attempt = await api.createAttempt(accessToken, selectedExam.id);
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
        accessToken,
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
      await api.submitAttempt(accessToken, attemptId);
      const details = await api.attemptResult(accessToken, attemptId);
      setResult(details);
      setMessage("Attempt submitted.");
    } catch (error) {
      setMessage(String(error));
    }
  }

  return (
    <div className="stack">
      <section className="panel">
        <h3>Assigned Exams</h3>
        <ul>
          {examAssignments.map((assignment) => (
            <li key={assignment.id}>
              <button onClick={() => loadExam(assignment.examId!)}>
                {assignment.exam?.title} ({assignment.exam?.subject})
              </button>
            </li>
          ))}
        </ul>
      </section>

      {selectedExam ? (
        <section className="panel">
          <h3>{selectedExam.title}</h3>
          <p>Exam ID: {selectedAssignmentExamId}</p>
          <form onSubmit={startAttempt}>
            <button type="submit">Start Attempt</button>
          </form>

          <form onSubmit={saveAnswers} className="stack">
            {selectedExam.questions.map((question) => (
              <label key={question.id}>
                {question.id}: {question.prompt}
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
                  />
                )}
              </label>
            ))}
            <button type="submit">Autosave Responses</button>
          </form>

          <button onClick={submitAttempt}>Submit Attempt</button>
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

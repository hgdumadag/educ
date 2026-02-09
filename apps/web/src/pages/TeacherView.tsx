import { FormEvent, useEffect, useMemo, useState } from "react";

import { api } from "../api/client";

export function TeacherView() {
  const [lessonFile, setLessonFile] = useState<File | null>(null);
  const [examFile, setExamFile] = useState<File | null>(null);
  const [studentIds, setStudentIds] = useState("");
  const [examId, setExamId] = useState("");
  const [assignmentType, setAssignmentType] = useState<"practice" | "assessment">("practice");
  const [maxAttempts, setMaxAttempts] = useState("");
  const [message, setMessage] = useState("");
  const [exams, setExams] = useState<Array<{ id: string; title: string; subject: string }>>([]);

  async function refreshExams() {
    try {
      setExams(await api.listExams());
    } catch (error) {
      setMessage(String(error));
    }
  }

  useEffect(() => {
    refreshExams();
  }, []);

  const studentIdList = useMemo(
    () => studentIds.split(",").map((item) => item.trim()).filter(Boolean),
    [studentIds],
  );

  async function handleLessonUpload(event: FormEvent) {
    event.preventDefault();
    if (!lessonFile) {
      setMessage("Select a lesson ZIP first.");
      return;
    }

    try {
      await api.uploadLesson(lessonFile);
      setMessage("Lesson uploaded.");
    } catch (error) {
      setMessage(String(error));
    }
  }

  async function handleExamUpload(event: FormEvent) {
    event.preventDefault();
    if (!examFile) {
      setMessage("Select an exam JSON file first.");
      return;
    }

    try {
      await api.uploadExam(examFile);
      setMessage("Exam uploaded.");
      await refreshExams();
    } catch (error) {
      setMessage(String(error));
    }
  }

  async function handleAssignment(event: FormEvent) {
    event.preventDefault();

    if (!examId || studentIdList.length === 0) {
      setMessage("Exam and at least one student id are required.");
      return;
    }

    try {
      await api.createAssignment({
        examId,
        studentIds: studentIdList,
        assignmentType,
        maxAttempts: maxAttempts ? Number(maxAttempts) : undefined,
      });
      setMessage("Assignments created.");
    } catch (error) {
      setMessage(String(error));
    }
  }

  return (
    <div className="stack">
      <section className="panel">
        <h3>Upload Lesson ZIP</h3>
        <p className="muted">
          Upload a lesson package ZIP containing <code>metadata.json</code> and <code>content.md</code>.
        </p>
        <form onSubmit={handleLessonUpload} className="stack">
          <input type="file" accept=".zip" onChange={(event) => setLessonFile(event.target.files?.[0] ?? null)} />
          <button type="submit">Upload Lesson</button>
        </form>
      </section>

      <section className="panel">
        <h3>Upload Exam JSON</h3>
        <p className="muted">
          Upload an exam JSON file with valid objective answer keys and question metadata.
        </p>
        <form onSubmit={handleExamUpload} className="stack">
          <input type="file" accept=".json,application/json" onChange={(event) => setExamFile(event.target.files?.[0] ?? null)} />
          <button type="submit">Upload Exam</button>
        </form>
      </section>

      <section className="panel">
        <h3>Create Assignment</h3>
        <p className="muted">
          Assign one uploaded exam to one or more students. Student IDs come from your admin.
        </p>
        <form onSubmit={handleAssignment} className="stack">
          <label>
            Exam
            <select value={examId} onChange={(event) => setExamId(event.target.value)}>
              <option value="">Select an exam</option>
              {exams.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.title} ({exam.subject})
                </option>
              ))}
            </select>
          </label>
          <label>
            Student IDs (comma separated)
            <input
              value={studentIds}
              onChange={(event) => setStudentIds(event.target.value)}
              placeholder="clx123..., clx456..."
            />
          </label>
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
            If blank, defaults are applied automatically: practice = 3 attempts, assessment = 1 attempt.
          </p>
          <button type="submit">Assign</button>
        </form>
      </section>

      {message ? <p>{message}</p> : null}
    </div>
  );
}

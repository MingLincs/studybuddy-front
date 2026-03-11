"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  generateClassQuiz,
  getClassStudyMaterials,
  getClassQuizzes,
  getQuizById,
} from "@/lib/api";
import type { MCQ } from "@/lib/types";

type QuizMeta = {
  id: string;
  title: string;
  num_questions: number;
  created_at: string;
  doc_title?: string;
  quiz_json?: string;
};

type ActiveQuiz = {
  id: string;
  title: string;
  doc_title?: string;
  questions: MCQ[];
};

export default function ClassQuizPage() {
  const { id: classId } = useParams<{ id: string }>();
  const router = useRouter();

  const [className, setClassName] = useState("");
  const [quizzes, setQuizzes] = useState<QuizMeta[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<ActiveQuiz | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/");
        return;
      }
      const token = session.access_token;

      const { data: cls } = await supabase
        .from("classes")
        .select("name")
        .eq("id", classId)
        .maybeSingle();
      if (alive) setClassName(cls?.name || "Class");

      try {
        const [docQuizzes, classMats] = await Promise.all([
          getClassQuizzes(classId, token).catch(() => [] as QuizMeta[]),
          getClassStudyMaterials(classId, token).catch(() => ({
            quizzes: [] as QuizMeta[],
            has_quizzes: false,
          })),
        ]);
        if (!alive) return;

        const classLevelQuizzes = (classMats.quizzes || []).filter(
          (cq) => !docQuizzes.some((dq: QuizMeta) => dq.id === cq.id)
        );
        setQuizzes([...docQuizzes, ...classLevelQuizzes]);
      } catch {
        // non-critical
      }

      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [classId, router]);

  const answered = useMemo(() => answers.filter((a) => a !== -1).length, [answers]);
  const correct = useMemo(
    () =>
      activeQuiz
        ? answers.reduce(
            (sum, a, i) =>
              sum + (a !== -1 && a === activeQuiz.questions[i]?.answer_index ? 1 : 0),
            0
          )
        : 0,
    [answers, activeQuiz]
  );

  const goNext = useCallback(() => {
    if (activeQuiz && currentIndex < activeQuiz.questions.length - 1) {
      setCurrentIndex((i) => i + 1);
    }
  }, [activeQuiz, currentIndex]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  }, [currentIndex]);

  const selectAnswer = useCallback(
    (choiceIndex: number) => {
      if (answers[currentIndex] !== -1) return;
      setAnswers((prev) => {
        const next = [...prev];
        next[currentIndex] = choiceIndex;
        return next;
      });
    },
    [answers, currentIndex]
  );

  // Keyboard navigation
  useEffect(() => {
    if (!activeQuiz) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") {
        if (answers[currentIndex] !== -1) goNext();
      } else if (e.key === "ArrowLeft") {
        goPrev();
      } else if (e.key >= "1" && e.key <= "4") {
        selectAnswer(parseInt(e.key) - 1);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeQuiz, currentIndex, answers, goNext, goPrev, selectAnswer]);

  async function openSavedQuiz(quiz: QuizMeta) {
    setLoadingQuiz(true);
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/");
        return;
      }

      let quizJsonSource: string | null = quiz.quiz_json ?? null;

      if (!quizJsonSource && quiz.id !== "class_quiz") {
        const full = await getQuizById(quiz.id, session.access_token);
        quizJsonSource = full.quiz_json;
      }

      if (!quizJsonSource) {
        setError("Could not load quiz content.");
        return;
      }

      const parsed =
        typeof quizJsonSource === "string"
          ? JSON.parse(quizJsonSource)
          : quizJsonSource;
      const qs: MCQ[] = parsed.questions || [];

      setActiveQuiz({
        id: quiz.id,
        title: quiz.title,
        doc_title: quiz.doc_title,
        questions: qs,
      });
      setCurrentIndex(0);
      setAnswers(new Array(qs.length).fill(-1));
    } catch {
      setError("Could not load quiz.");
    } finally {
      setLoadingQuiz(false);
    }
  }

  async function handleGenerate() {
    setError("");
    setGenerating(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/");
        return;
      }

      const result = await generateClassQuiz(classId, session.access_token);
      const parsed =
        typeof result.quiz_json === "string"
          ? JSON.parse(result.quiz_json)
          : result.quiz_json;
      const qs: MCQ[] = parsed.questions || [];

      const newMeta: QuizMeta = {
        id: result.id,
        title: result.title,
        num_questions: result.num_questions,
        created_at: new Date().toISOString(),
        quiz_json: result.quiz_json,
      };

      setQuizzes((prev) => [newMeta, ...prev.filter((q) => q.id !== "class_quiz")]);
      setActiveQuiz({ id: result.id, title: result.title, questions: qs });
      setCurrentIndex(0);
      setAnswers(new Array(qs.length).fill(-1));
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Failed to generate quiz. Please try again."
      );
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="quiz-wrap loading-wrap">
        <div className="spinner" />
        <p>Loading…</p>
        <style jsx>{`
          .quiz-wrap {
            min-height: 100vh;
            background: linear-gradient(160deg, #f0f4ff 0%, #f8f9ff 60%, #f0f7ff 100%);
          }
          .loading-wrap {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 16px;
            color: #64748b;
          }
          .spinner {
            width: 40px;
            height: 40px;
            border: 4px solid #e2e8f0;
            border-top-color: #3b82f6;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </div>
    );
  }

  // ── QUIZ TAKING VIEW ──────────────────────────────────────────────
  if (activeQuiz) {
    const q = activeQuiz.questions[currentIndex];
    const pickedAnswer = answers[currentIndex];
    const hasAnswered = pickedAnswer !== -1;
    const isCorrect = hasAnswered && pickedAnswer === q.answer_index;
    const progressPercent = Math.round(
      ((currentIndex + (hasAnswered ? 1 : 0)) / activeQuiz.questions.length) * 100
    );
    const isLast = currentIndex === activeQuiz.questions.length - 1;

    return (
      <>
        <div className="quiz-page">
          {/* Sticky top bar */}
          <div className="quiz-topbar">
            <button className="back-btn" onClick={() => setActiveQuiz(null)}>
              ← Quizzes
            </button>
            <div className="topbar-center">
              <span className="quiz-title-bar">{activeQuiz.title}</span>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
            <div className="topbar-right">
              <span className="stat-chip stat-chip--blue">
                {currentIndex + 1} / {activeQuiz.questions.length}
              </span>
              {answered > 0 && (
                <span className="stat-chip stat-chip--green">
                  {Math.round((correct / answered) * 100)}%
                </span>
              )}
            </div>
          </div>

          {/* Body: sidebar + question */}
          <div className="quiz-body">
            {/* Stats sidebar */}
            <aside className="quiz-sidebar">
              <div className="sidebar-stat-group">
                <div className="sidebar-stat">
                  <div className="sb-num sb-num--blue">{currentIndex + 1}</div>
                  <div className="sb-label">of {activeQuiz.questions.length}</div>
                </div>
                <div className="sidebar-divider" />
                <div className="sidebar-stat">
                  <div className="sb-num sb-num--green">{correct}</div>
                  <div className="sb-label">Correct</div>
                </div>
                <div className="sidebar-stat">
                  <div className="sb-num sb-num--red">{answered - correct}</div>
                  <div className="sb-label">Wrong</div>
                </div>
                <div className="sidebar-stat">
                  <div className="sb-num sb-num--slate">{activeQuiz.questions.length - answered}</div>
                  <div className="sb-label">Remaining</div>
                </div>
              </div>

              <div className="sidebar-map-label">Question map</div>
              <div className="sidebar-map">
                {activeQuiz.questions.map((qq, i) => {
                  const a = answers[i];
                  let dotClass = "smap-dot";
                  if (i === currentIndex) dotClass += " smap-dot--current";
                  else if (a === -1) dotClass += " smap-dot--unanswered";
                  else if (a === qq.answer_index) dotClass += " smap-dot--correct";
                  else dotClass += " smap-dot--wrong";
                  return (
                    <div
                      key={i}
                      className={dotClass}
                      onClick={() => setCurrentIndex(i)}
                      title={`Q${i + 1}`}
                    />
                  );
                })}
              </div>

              <p className="kb-hint">1–4 to answer · ← → to navigate</p>
            </aside>

            {/* Main question area */}
            <main className="quiz-main">
              <div className="question-card">
                <div className="q-index-pill">{currentIndex + 1}</div>
                <h2 className="q-text">{q.question}</h2>
                {q.source && <p className="q-source">📚 {q.source}</p>}

                <div className="choices-grid">
                  {q.choices.map((choice, ci) => {
                    let state: "default" | "correct" | "wrong" | "dim" = "default";
                    if (hasAnswered) {
                      if (ci === q.answer_index) state = "correct";
                      else if (ci === pickedAnswer) state = "wrong";
                      else state = "dim";
                    }
                    return (
                      <button
                        key={ci}
                        className={`choice-btn choice-${state}`}
                        onClick={() => selectAnswer(ci)}
                        disabled={hasAnswered}
                      >
                        <span className="choice-letter">
                          {String.fromCharCode(65 + ci)}
                        </span>
                        <span className="choice-text">{choice}</span>
                        {hasAnswered && ci === q.answer_index && (
                          <span className="choice-check">✓</span>
                        )}
                        {hasAnswered && ci === pickedAnswer && ci !== q.answer_index && (
                          <span className="choice-cross">✗</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Feedback */}
                {hasAnswered && (
                  <div className={`feedback ${isCorrect ? "feedback-correct" : "feedback-wrong"}`}>
                    <div className="feedback-title">
                      {isCorrect ? "🎉 Correct!" : "❌ Incorrect"}
                    </div>
                    <p className="feedback-explanation">{q.explanation}</p>
                    {!isCorrect && (
                      <p className="feedback-correct-note">
                        Correct answer:{" "}
                        <strong>
                          {String.fromCharCode(65 + q.answer_index)}.{" "}
                          {q.choices[q.answer_index]}
                        </strong>
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Navigation */}
              <div className="nav-row">
                <button
                  className="nav-btn prev-btn"
                  onClick={goPrev}
                  disabled={currentIndex === 0}
                >
                  ← Prev
                </button>

                {!hasAnswered ? (
                  <span className="nav-hint">Select an answer to continue</span>
                ) : isLast ? (
                  <div className="finish-badge">
                    🏁 {correct}/{activeQuiz.questions.length} correct
                  </div>
                ) : (
                  <button className="nav-btn next-btn" onClick={goNext}>
                    Next →
                  </button>
                )}
              </div>
            </main>
          </div>
        </div>

        <style jsx>{`
          .quiz-page {
            min-height: 100vh;
            background: linear-gradient(160deg, #f0f4ff 0%, #f8f9ff 60%, #f0f7ff 100%);
            display: flex;
            flex-direction: column;
          }

          /* ─ Sticky top bar ─ */
          .quiz-topbar {
            position: sticky;
            top: 0;
            z-index: 10;
            background: rgba(255, 255, 255, 0.92);
            backdrop-filter: blur(12px);
            border-bottom: 1px solid #e8edf5;
            padding: 0 32px;
            height: 64px;
            display: flex;
            align-items: center;
            gap: 20px;
          }

          .back-btn {
            background: none;
            border: none;
            color: #64748b;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            padding: 8px 14px;
            border-radius: 10px;
            transition: all 0.2s;
            white-space: nowrap;
            flex-shrink: 0;
          }

          .back-btn:hover {
            background: #f1f5f9;
            color: #3b82f6;
          }

          .topbar-center {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 4px;
            min-width: 0;
          }

          .quiz-title-bar {
            font-size: 14px;
            font-weight: 600;
            color: #334155;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .progress-track {
            height: 5px;
            background: #e2e8f0;
            border-radius: 3px;
            overflow: hidden;
          }

          .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #3b82f6, #8b5cf6);
            border-radius: 3px;
            transition: width 0.4s ease;
          }

          .topbar-right {
            display: flex;
            gap: 8px;
            flex-shrink: 0;
          }

          .stat-chip {
            padding: 5px 12px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 700;
          }

          .stat-chip--blue {
            background: #eff6ff;
            color: #2563eb;
          }

          .stat-chip--green {
            background: #ecfdf5;
            color: #059669;
          }

          /* ─ Body layout ─ */
          .quiz-body {
            flex: 1;
            display: flex;
            gap: 0;
            max-width: 1400px;
            width: 100%;
            margin: 0 auto;
            padding: 32px 24px 48px;
            align-items: flex-start;
          }

          /* ─ Sidebar ─ */
          .quiz-sidebar {
            width: 220px;
            flex-shrink: 0;
            position: sticky;
            top: 88px;
            background: white;
            border-radius: 20px;
            padding: 24px 20px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
            margin-right: 28px;
          }

          .sidebar-stat-group {
            display: flex;
            flex-direction: column;
            gap: 4px;
            margin-bottom: 20px;
          }

          .sidebar-stat {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            padding: 10px 12px;
            border-radius: 10px;
            background: #f8fafc;
          }

          .sidebar-divider {
            height: 1px;
            background: #f1f5f9;
            margin: 4px 0;
          }

          .sb-num {
            font-size: 24px;
            font-weight: 800;
            line-height: 1;
          }

          .sb-num--blue { color: #2563eb; }
          .sb-num--green { color: #059669; }
          .sb-num--red { color: #dc2626; }
          .sb-num--slate { color: #64748b; }

          .sb-label {
            font-size: 12px;
            color: #94a3b8;
            font-weight: 500;
          }

          .sidebar-map-label {
            font-size: 11px;
            font-weight: 600;
            color: #94a3b8;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            margin-bottom: 10px;
          }

          .sidebar-map {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-bottom: 20px;
          }

          .smap-dot {
            width: 20px;
            height: 20px;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.15s;
          }

          .smap-dot--unanswered { background: #e2e8f0; }
          .smap-dot--current {
            background: #3b82f6;
            box-shadow: 0 0 0 3px #bfdbfe;
            transform: scale(1.15);
          }
          .smap-dot--correct { background: #10b981; }
          .smap-dot--wrong { background: #ef4444; }

          .kb-hint {
            font-size: 11px;
            color: #cbd5e1;
            margin: 0;
            line-height: 1.5;
          }

          /* ─ Main question area ─ */
          .quiz-main {
            flex: 1;
            min-width: 0;
          }

          .question-card {
            background: white;
            border-radius: 24px;
            padding: 44px 52px;
            box-shadow: 0 8px 40px rgba(0, 0, 0, 0.07);
            margin-bottom: 24px;
          }

          .q-index-pill {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            background: linear-gradient(135deg, #3b82f6, #8b5cf6);
            color: white;
            border-radius: 50%;
            font-size: 15px;
            font-weight: 700;
            margin-bottom: 20px;
          }

          .q-text {
            font-size: 22px;
            font-weight: 700;
            color: #0f172a;
            line-height: 1.55;
            margin: 0 0 10px 0;
          }

          .q-source {
            font-size: 13px;
            color: #94a3b8;
            margin: 0 0 28px 0;
          }

          .choices-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px;
            margin-bottom: 24px;
          }

          .choice-btn {
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 18px 22px;
            border-radius: 16px;
            border: 2px solid #e2e8f0;
            background: #f8fafc;
            cursor: pointer;
            text-align: left;
            transition: all 0.18s;
            width: 100%;
          }

          .choice-btn:not(:disabled):hover.choice-default {
            border-color: #3b82f6;
            background: #eff6ff;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(59, 130, 246, 0.12);
          }

          .choice-correct {
            border-color: #10b981;
            background: #ecfdf5;
          }

          .choice-wrong {
            border-color: #ef4444;
            background: #fef2f2;
          }

          .choice-dim {
            border-color: #f1f5f9;
            background: #f8fafc;
            opacity: 0.4;
          }

          .choice-letter {
            width: 34px;
            height: 34px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            background: #e2e8f0;
            font-size: 13px;
            font-weight: 700;
            color: #475569;
            flex-shrink: 0;
            transition: all 0.18s;
          }

          .choice-correct .choice-letter {
            background: #10b981;
            color: white;
          }

          .choice-wrong .choice-letter {
            background: #ef4444;
            color: white;
          }

          .choice-text {
            flex: 1;
            font-size: 15px;
            font-weight: 500;
            color: #0f172a;
            line-height: 1.4;
            text-align: left;
          }

          .choice-check {
            font-size: 18px;
            color: #10b981;
            font-weight: 700;
          }

          .choice-cross {
            font-size: 18px;
            color: #ef4444;
            font-weight: 700;
          }

          .feedback {
            border-radius: 16px;
            padding: 22px 26px;
            margin-top: 8px;
          }

          .feedback-correct {
            background: linear-gradient(135deg, #ecfdf5, #d1fae5);
            border: 1.5px solid #10b981;
          }

          .feedback-wrong {
            background: linear-gradient(135deg, #fef2f2, #fee2e2);
            border: 1.5px solid #ef4444;
          }

          .feedback-title {
            font-size: 16px;
            font-weight: 700;
            margin-bottom: 8px;
          }

          .feedback-correct .feedback-title { color: #065f46; }
          .feedback-wrong .feedback-title { color: #991b1b; }

          .feedback-explanation {
            font-size: 14px;
            line-height: 1.7;
            margin: 0 0 8px 0;
          }

          .feedback-correct .feedback-explanation { color: #065f46; }
          .feedback-wrong .feedback-explanation { color: #7f1d1d; }

          .feedback-correct-note {
            font-size: 13px;
            color: #991b1b;
            margin: 0;
          }

          /* ─ Navigation ─ */
          .nav-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            padding: 0 4px;
          }

          .nav-btn {
            padding: 13px 28px;
            border-radius: 14px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            border: 2px solid #e2e8f0;
            background: white;
            color: #374151;
          }

          .nav-btn:hover:not(:disabled) {
            background: #f8fafc;
            border-color: #94a3b8;
          }

          .nav-btn:disabled {
            opacity: 0.3;
            cursor: not-allowed;
          }

          .next-btn {
            background: linear-gradient(135deg, #3b82f6, #2563eb);
            border-color: transparent;
            color: white;
          }

          .next-btn:hover:not(:disabled) {
            box-shadow: 0 8px 24px rgba(59, 130, 246, 0.4);
            transform: translateY(-1px);
          }

          .nav-hint {
            font-size: 13px;
            color: #94a3b8;
          }

          .finish-badge {
            padding: 13px 28px;
            background: linear-gradient(135deg, #10b981, #059669);
            color: white;
            border-radius: 14px;
            font-size: 15px;
            font-weight: 700;
          }

          @media (max-width: 900px) {
            .quiz-sidebar {
              display: none;
            }
            .quiz-body {
              padding: 20px 16px 40px;
            }
          }

          @media (max-width: 700px) {
            .choices-grid {
              grid-template-columns: 1fr;
            }
            .question-card {
              padding: 28px 24px;
            }
            .q-text {
              font-size: 18px;
            }
            .quiz-topbar {
              padding: 0 16px;
            }
          }
        `}</style>
      </>
    );
  }

  // ── QUIZ PICKER VIEW ──────────────────────────────────────────────
  return (
    <>
      <div className="quiz-wrap">
        <div className="picker-shell">
          {/* Header */}
          <header className="picker-header">
            <div>
              <Link href={`/class/${classId}`} className="back-link">
                ← Back to {className}
              </Link>
              <h1>📝 Practice Quizzes</h1>
              <p className="subtitle">
                {quizzes.length > 0
                  ? `${quizzes.length} quiz${quizzes.length !== 1 ? "zes" : ""} available`
                  : "No quizzes yet — generate one to get started"}
              </p>
            </div>

            <button
              onClick={handleGenerate}
              disabled={generating}
              className="generate-btn"
            >
              {generating ? (
                <>
                  <span className="btn-spinner" /> Generating…
                </>
              ) : (
                "✨ Generate Class Quiz"
              )}
            </button>
          </header>

          {error && <div className="error-box">{error}</div>}

          {loadingQuiz && (
            <div className="loading-quiz">
              <div className="mini-spinner" />
              <span>Loading quiz…</span>
            </div>
          )}

          {quizzes.length > 0 ? (
            <section className="quiz-list">
              <h2 className="list-title">Saved Quizzes</h2>
              <div className="quiz-cards-grid">
                {quizzes.map((q) => (
                  <button
                    key={q.id}
                    onClick={() => openSavedQuiz(q)}
                    className="quiz-card"
                    disabled={loadingQuiz}
                  >
                    <div className="qcard-icon">📝</div>
                    <div className="qcard-body">
                      <strong className="qcard-title">{q.title}</strong>
                      {q.doc_title && (
                        <span className="qcard-source">from: {q.doc_title}</span>
                      )}
                      <div className="qcard-meta">
                        <span className="qcard-pill">{q.num_questions} questions</span>
                        <span className="qcard-date">
                          {new Date(q.created_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                    </div>
                    <span className="qcard-arrow">→</span>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">📝</div>
              <h2>No Quizzes Yet</h2>
              <p>
                Generate a comprehensive quiz from your class materials, or visit a
                document page to create a document-specific quiz.
              </p>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="generate-btn"
              >
                {generating ? "Generating…" : "✨ Generate Class Quiz"}
              </button>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .quiz-wrap {
          min-height: 100vh;
          background: linear-gradient(160deg, #f0f4ff 0%, #f8f9ff 60%, #f0f7ff 100%);
          padding: 40px max(24px, 5vw) 60px;
        }

        .picker-shell {
          width: 100%;
          max-width: 1400px;
          margin: 0 auto;
        }

        .picker-header {
          background: white;
          border-radius: 24px;
          padding: 36px 40px;
          margin-bottom: 28px;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
        }

        .back-link {
          display: inline-block;
          color: #64748b;
          text-decoration: none;
          margin-bottom: 12px;
          font-size: 14px;
          transition: color 0.2s;
        }

        .back-link:hover {
          color: #3b82f6;
        }

        .picker-header h1 {
          margin: 0 0 8px;
          font-size: 28px;
          font-weight: 800;
          color: #0f172a;
        }

        .subtitle {
          margin: 0;
          color: #64748b;
          font-size: 15px;
        }

        .generate-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 12px 24px;
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          color: white;
          border: none;
          border-radius: 14px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .generate-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(59, 130, 246, 0.35);
        }

        .generate-btn:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .error-box {
          background: #fef2f2;
          border: 1.5px solid #fca5a5;
          border-radius: 14px;
          padding: 16px;
          margin-bottom: 20px;
          color: #dc2626;
          font-size: 14px;
        }

        .loading-quiz {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 20px;
          background: #eff6ff;
          border-radius: 14px;
          margin-bottom: 20px;
          color: #2563eb;
          font-weight: 600;
          font-size: 14px;
        }

        .quiz-list {
          background: white;
          border-radius: 24px;
          padding: 36px 40px;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
        }

        .list-title {
          font-size: 18px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 24px;
        }

        .quiz-cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
          gap: 14px;
        }

        .quiz-card {
          display: flex;
          align-items: center;
          gap: 16px;
          width: 100%;
          padding: 20px 22px;
          background: #f8fafc;
          border: 2px solid #f1f5f9;
          border-radius: 16px;
          cursor: pointer;
          text-align: left;
          transition: all 0.2s;
        }

        .quiz-card:hover:not(:disabled) {
          background: #eff6ff;
          border-color: #3b82f6;
          transform: translateX(4px);
          box-shadow: 0 4px 14px rgba(59, 130, 246, 0.12);
        }

        .quiz-card:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .qcard-icon {
          font-size: 32px;
          flex-shrink: 0;
        }

        .qcard-body {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }

        .qcard-title {
          font-size: 16px;
          font-weight: 700;
          color: #0f172a;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .qcard-source {
          font-size: 13px;
          color: #64748b;
        }

        .qcard-meta {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 4px;
        }

        .qcard-pill {
          background: #eff6ff;
          color: #2563eb;
          padding: 3px 10px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
        }

        .qcard-date {
          font-size: 12px;
          color: #94a3b8;
        }

        .qcard-arrow {
          color: #cbd5e1;
          font-size: 18px;
          flex-shrink: 0;
        }

        .empty-state {
          background: white;
          border-radius: 24px;
          padding: 60px 40px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
          text-align: center;
        }

        .empty-icon {
          font-size: 64px;
          margin-bottom: 16px;
        }

        .empty-state h2 {
          font-size: 24px;
          font-weight: 800;
          color: #0f172a;
          margin: 0 0 12px;
        }

        .empty-state p {
          color: #64748b;
          margin: 0 auto 28px;
          font-size: 15px;
          line-height: 1.6;
          max-width: 420px;
        }

        .btn-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255, 255, 255, 0.4);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          display: inline-block;
          flex-shrink: 0;
        }

        .mini-spinner {
          width: 20px;
          height: 20px;
          border: 3px solid #bfdbfe;
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          flex-shrink: 0;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 640px) {
          .picker-header {
            flex-direction: column;
          }
          .generate-btn {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </>
  );
}

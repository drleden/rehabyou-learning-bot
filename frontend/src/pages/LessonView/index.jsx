import { useState, useCallback } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../api";
import "./LessonView.css";

// ── Data hook ─────────────────────────────────────────────────────────────────

const useLesson = (id) =>
  useQuery({
    queryKey: ["lesson", id],
    queryFn: () => api.get(`/api/learning/lessons/${id}`).then(r => r.data),
    enabled: id != null,
    retry: false,
  });

// ── HTML content renderer ─────────────────────────────────────────────────────

function HtmlContent({ html }) {
  if (!html) return null;
  return (
    <div
      className="lv-html-content"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ── Video player ──────────────────────────────────────────────────────────────

function VideoPlayer({ url }) {
  if (!url) return null;

  // YouTube
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/);
  if (yt) {
    return (
      <div className="lv-video-wrap">
        <iframe
          className="lv-video-iframe"
          src={`https://www.youtube.com/embed/${yt[1]}`}
          allowFullScreen
          title="video"
        />
      </div>
    );
  }

  // Direct video file
  return (
    <div className="lv-video-wrap">
      <video className="lv-video" controls playsInline src={url}>
        Ваш браузер не поддерживает видео.
      </video>
    </div>
  );
}

// ── Step 1: Lesson content ────────────────────────────────────────────────────

function ContentStep({ lesson, onNext }) {
  const hasNext = lesson.has_test || lesson.has_assignment;

  const completeMut = useMutation({
    mutationFn: () => api.post(`/api/learning/lessons/${lesson.id}/complete`).then(r => r.data),
  });

  const navigate = useNavigate();

  const handleFinish = useCallback(() => {
    if (hasNext) {
      onNext();
    } else {
      completeMut.mutate(undefined, {
        onSuccess: (data) => {
          if (data.next_lesson_id) {
            navigate(`/lessons/${data.next_lesson_id}`, { replace: true });
          } else {
            navigate(`/courses/${lesson.course_id}`, { replace: true });
          }
        },
      });
    }
  }, [hasNext, lesson, onNext, completeMut, navigate]);

  return (
    <div className="lv-step">
      <VideoPlayer url={lesson.video_url} />

      <div className="lv-content">
        {lesson.content
          ? <HtmlContent html={lesson.content} />
          : <p className="lv-no-content">Текст урока не добавлен.</p>
        }
      </div>

      <div className="lv-footer">
        {completeMut.isError && (
          <p className="lv-err">Ошибка: {completeMut.error?.response?.data?.detail ?? "Попробуйте снова"}</p>
        )}
        <button
          className="lv-btn-primary"
          onClick={handleFinish}
          disabled={completeMut.isPending}
        >
          {completeMut.isPending ? <span className="lv-spinner" /> : hasNext ? "Далее →" : "Завершить урок ✓"}
        </button>
      </div>
    </div>
  );
}

// ── Step 2: Test ──────────────────────────────────────────────────────────────

function TestStep({ lesson, onNext }) {
  const { test } = lesson;
  const [selected, setSelected] = useState({}); // {questionId: chosenIndex}
  const [result, setResult] = useState(null);
  const navigate = useNavigate();

  const allAnswered = test.questions.every(q => selected[q.id] !== undefined);

  const submitMut = useMutation({
    mutationFn: (answers) => api.post(`/api/learning/lessons/${lesson.id}/test`, { answers }).then(r => r.data),
    onSuccess: (data) => setResult(data),
  });

  const handleSubmit = () => {
    const answers = test.questions
      .sort((a, b) => a.position - b.position)
      .map(q => selected[q.id]);
    submitMut.mutate(answers);
  };

  const handleNext = () => {
    if (lesson.has_assignment) {
      onNext("assignment");
    } else if (lesson.next_lesson_id) {
      navigate(`/lessons/${lesson.next_lesson_id}`, { replace: true });
    } else {
      navigate(`/courses/${lesson.course_id}`, { replace: true });
    }
  };

  const sortedQ = [...test.questions].sort((a, b) => a.position - b.position);

  if (result) {
    const passed = result.passed;
    return (
      <div className="lv-step">
        <div className={`lv-result-card ${passed ? "lv-result-card--pass" : "lv-result-card--fail"}`}>
          <div className="lv-result-icon">{passed ? "🎉" : "😕"}</div>
          <div className="lv-result-score">{result.score.toFixed(0)}%</div>
          <div className="lv-result-label">
            {passed ? "Тест пройден!" : "Недостаточно баллов"}
          </div>
          <div className="lv-result-detail">
            {result.correct} из {result.total} верных ответов
            {!passed && ` · Нужно ${result.threshold.toFixed(0)}%`}
          </div>
        </div>

        <div className="lv-footer">
          {passed
            ? (
              <button className="lv-btn-primary" onClick={handleNext}>
                Далее →
              </button>
            )
            : (
              <button className="lv-btn-secondary" onClick={() => { setResult(null); setSelected({}); }}>
                Пересдать
              </button>
            )
          }
        </div>
      </div>
    );
  }

  return (
    <div className="lv-step">
      <div className="lv-test-intro">
        <div className="lv-test-icon">📝</div>
        <div className="lv-test-title">Тест</div>
        <div className="lv-test-subtitle">
          {sortedQ.length} {sortedQ.length === 1 ? "вопрос" : sortedQ.length < 5 ? "вопроса" : "вопросов"} · Порог {(test.pass_threshold * 100).toFixed(0)}%
        </div>
      </div>

      <div className="lv-questions">
        {sortedQ.map((q, qi) => (
          <div key={q.id} className="lv-question">
            <div className="lv-question-num">Вопрос {qi + 1}</div>
            <div className="lv-question-text">{q.question}</div>
            <div className="lv-options">
              {q.options.map((opt, idx) => (
                <label key={idx} className={`lv-option ${selected[q.id] === idx ? "lv-option--on" : ""}`}>
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    checked={selected[q.id] === idx}
                    onChange={() => setSelected(s => ({ ...s, [q.id]: idx }))}
                    className="lv-radio"
                  />
                  <span className="lv-option-mark" />
                  <span className="lv-option-text">{opt}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="lv-footer">
        {submitMut.isError && (
          <p className="lv-err">{submitMut.error?.response?.data?.detail ?? "Ошибка отправки"}</p>
        )}
        <button
          className="lv-btn-primary"
          onClick={handleSubmit}
          disabled={!allAnswered || submitMut.isPending}
        >
          {submitMut.isPending ? <span className="lv-spinner" /> : "Отправить ответы"}
        </button>
      </div>
    </div>
  );
}

// ── Step 3: Assignment ────────────────────────────────────────────────────────

function AssignmentStep({ lesson }) {
  const { assignment } = lesson;
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const navigate = useNavigate();

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const minWords = assignment.min_words ?? 50;
  const enough = wordCount >= minWords;

  const submitMut = useMutation({
    mutationFn: (text) => api.post(`/api/learning/lessons/${lesson.id}/assignment`, { text }).then(r => r.data),
    onSuccess: (data) => {
      setReviewing(false);
      setResult(data);
    },
    onError: () => setReviewing(false),
  });

  const handleSubmit = () => {
    setReviewing(true);
    // Small delay to show "reviewing" state for UX
    setTimeout(() => submitMut.mutate(text), 1500);
  };

  const handleNext = () => {
    if (lesson.next_lesson_id) {
      navigate(`/lessons/${lesson.next_lesson_id}`, { replace: true });
    } else {
      navigate(`/courses/${lesson.course_id}`, { replace: true });
    }
  };

  if (reviewing) {
    return (
      <div className="lv-step lv-step--center">
        <div className="lv-reviewing">
          <div className="lv-reviewing-spinner" />
          <div className="lv-reviewing-title">На проверке у ИИ</div>
          <div className="lv-reviewing-sub">Анализируем ваш ответ…</div>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="lv-step">
        <div className="lv-result-card lv-result-card--pass">
          <div className="lv-result-icon">✅</div>
          <div className="lv-result-score">Принято</div>
          <div className="lv-result-label">Задание выполнено</div>
          <div className="lv-result-words">{result.word_count} слов</div>
        </div>

        {result.ai_comment && (
          <div className="lv-ai-comment">
            <div className="lv-ai-comment-label">Комментарий ИИ</div>
            <p className="lv-ai-comment-text">{result.ai_comment}</p>
          </div>
        )}

        <div className="lv-footer">
          <button className="lv-btn-primary" onClick={handleNext}>
            Далее →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="lv-step">
      <div className="lv-hw-intro">
        <div className="lv-hw-icon">📋</div>
        <div className="lv-hw-title">Практическое задание</div>
      </div>

      <div className="lv-hw-desc">{assignment.description}</div>

      <div className="lv-hw-area">
        <textarea
          className="lv-textarea"
          placeholder="Напишите ваш ответ здесь…"
          value={text}
          onChange={e => setText(e.target.value)}
          rows={8}
        />
        <div className={`lv-word-count ${enough ? "lv-word-count--ok" : ""}`}>
          {wordCount} / {minWords} слов
        </div>
      </div>

      <div className="lv-footer">
        {submitMut.isError && (
          <p className="lv-err">{submitMut.error?.response?.data?.detail ?? "Ошибка отправки"}</p>
        )}
        <button
          className="lv-btn-primary"
          onClick={handleSubmit}
          disabled={!enough}
        >
          Отправить на проверку
        </button>
      </div>
    </div>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────

function StepBar({ steps, current }) {
  if (steps.length <= 1) return null;
  return (
    <div className="lv-stepbar">
      {steps.map((s, i) => (
        <div
          key={s}
          className={`lv-stepbar-dot ${s === current ? "lv-stepbar-dot--active" : i < steps.indexOf(current) ? "lv-stepbar-dot--done" : ""}`}
        />
      ))}
    </div>
  );
}

const STEP_LABEL = {
  content:    "Урок",
  test:       "Тест",
  assignment: "Задание",
};

// ── Page root ─────────────────────────────────────────────────────────────────

export default function LessonView() {
  const { id } = useParams();
  const { data: lesson, isLoading, isError } = useLesson(Number(id));
  const [step, setStep] = useState("content");

  // Reset step when lesson changes
  const lessonId = lesson?.id;
  const prevIdRef = useState(lessonId);
  if (prevIdRef[0] !== lessonId) {
    prevIdRef[0] = lessonId;
    if (step !== "content") setStep("content");
  }

  const steps = lesson
    ? ["content", ...(lesson.has_test ? ["test"] : []), ...(lesson.has_assignment ? ["assignment"] : [])]
    : ["content"];

  const advanceTo = (next) => {
    if (next) setStep(next);
    else if (lesson?.has_assignment && step === "test") setStep("assignment");
    else if (lesson?.has_test && step === "content") setStep("test");
  };

  if (isLoading) {
    return (
      <div className="lv-page">
        <header className="lv-header">
          <span className="lv-back-placeholder" />
          <span className="lv-header-title">Загрузка…</span>
        </header>
        <div className="lv-skeleton" />
      </div>
    );
  }

  if (isError || !lesson) {
    return (
      <div className="lv-page">
        <header className="lv-header">
          <Link to="/courses" className="lv-back">‹</Link>
          <span className="lv-header-title">Ошибка</span>
        </header>
        <p className="lv-empty">Урок не найден или ещё заблокирован.</p>
      </div>
    );
  }

  return (
    <div className="lv-page">
      <header className="lv-header">
        <Link to={`/courses/${lesson.course_id}`} className="lv-back">‹</Link>
        <div className="lv-header-info">
          <span className="lv-header-title">{lesson.title}</span>
          {steps.length > 1 && (
            <span className="lv-header-step">{STEP_LABEL[step]}</span>
          )}
        </div>
        {lesson.is_completed && <span className="lv-done-mark">✅</span>}
      </header>

      <StepBar steps={steps} current={step} />

      {step === "content" && (
        <ContentStep
          lesson={lesson}
          onNext={() => advanceTo(lesson.has_test ? "test" : "assignment")}
        />
      )}

      {step === "test" && lesson.test && (
        <TestStep
          lesson={lesson}
          onNext={(next) => advanceTo(next)}
        />
      )}

      {step === "assignment" && lesson.assignment && (
        <AssignmentStep lesson={lesson} />
      )}
    </div>
  );
}

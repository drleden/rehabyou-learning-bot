/**
 * PsychTests — psychological tests for staff members
 *
 * Routes handled here:
 *   /psych-tests          — list of available tests
 *   /psych-tests/:id      — take a test (questions flow)
 *   /psych-tests/results  — own results history
 */
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../api";
import "./PsychTests.css";

// ── API hooks ─────────────────────────────────────────────────────────────────

function useTestList() {
  return useQuery({
    queryKey: ["psych-tests"],
    queryFn: () => api.get("/api/psych-tests").then((r) => r.data),
    placeholderData: [],
  });
}

function useTest(id) {
  return useQuery({
    queryKey: ["psych-test", id],
    queryFn: () => api.get(`/api/psych-tests/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

function useMyResults() {
  return useQuery({
    queryKey: ["psych-results-me"],
    queryFn: () => api.get("/api/psych-tests/results/me").then((r) => r.data),
    placeholderData: [],
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TEST_ICONS = {
  "Белбин": "🎭",
  "MBTI": "🧠",
  "Выгорание": "🔥",
};

const TEST_COLORS = {
  "Белбин": "var(--orange)",
  "MBTI": "#6c8ebf",
  "Выгорание": "#c4694f",
};

function formatDate(iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric", month: "long", year: "numeric",
  }).format(new Date(iso));
}

function ScoreBadge({ testName, rawScore }) {
  if (!rawScore) return null;

  if (testName === "MBTI") {
    return <span className="pt-score-badge pt-score-badge--mbti">{rawScore.type}</span>;
  }
  if (testName === "Выгорание") {
    const levelColor = {
      "Низкий": "#50c878",
      "Умеренный": "#f0c040",
      "Высокий": "var(--orange)",
      "Критический": "#e05050",
    }[rawScore.level] ?? "var(--orange)";
    return (
      <span className="pt-score-badge" style={{ background: levelColor + "22", color: levelColor }}>
        {rawScore.level} · {rawScore.percent}%
      </span>
    );
  }
  // Белбин — show top role
  if (typeof rawScore === "object") {
    const top = Object.entries(rawScore).sort((a, b) => b[1] - a[1])[0];
    if (top) return <span className="pt-score-badge">{top[0]}</span>;
  }
  return null;
}

// ── Test List Page ────────────────────────────────────────────────────────────

export function PsychTestList() {
  const { data: tests = [], isLoading } = useTestList();
  const { data: results = [] } = useMyResults();

  // Build map: test_id → latest result
  const latestResult = results.reduce((acc, r) => {
    if (!acc[r.test_id] || new Date(r.created_at) > new Date(acc[r.test_id].created_at)) {
      acc[r.test_id] = r;
    }
    return acc;
  }, {});

  return (
    <div className="pt-page">
      <header className="pt-header">
        <Link to="/" className="pt-back">←</Link>
        <div className="pt-header-info">
          <span className="pt-header-title">Психологические тесты</span>
          <span className="pt-header-sub">Самодиагностика и развитие</span>
        </div>
        <Link to="/psych-tests/results" className="pt-results-link">История</Link>
      </header>

      <div className="pt-content">
        <p className="pt-intro">
          Пройдите тесты, чтобы лучше понять свои сильные стороны и зоны роста.
          Результаты сохраняются и доступны вашему руководителю.
        </p>

        {isLoading ? (
          <div className="pt-loading">
            <div className="pt-spinner" />
          </div>
        ) : (
          <div className="pt-test-list">
            {tests.map((test) => {
              const last = latestResult[test.id];
              const icon = TEST_ICONS[test.name] ?? "🧪";
              const color = TEST_COLORS[test.name] ?? "var(--orange)";
              return (
                <Link key={test.id} to={`/psych-tests/${test.id}`} className="pt-test-card">
                  <div className="pt-test-icon" style={{ background: color + "22", color }}>
                    {icon}
                  </div>
                  <div className="pt-test-info">
                    <div className="pt-test-name">{test.name}</div>
                    <div className="pt-test-desc">{test.description}</div>
                    {last && (
                      <div className="pt-test-last">
                        <span>Последний: {formatDate(last.created_at)}</span>
                        <ScoreBadge testName={test.name} rawScore={last.raw_score} />
                      </div>
                    )}
                  </div>
                  <span className="pt-test-arrow">›</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Test Taking Page ──────────────────────────────────────────────────────────

export function PsychTestTake() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: test, isLoading } = useTest(id);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [showIntro, setShowIntro] = useState(true);

  const submitMut = useMutation({
    mutationFn: (answersList) =>
      api.post(`/api/psych-tests/${id}/submit`, { answers: answersList }).then((r) => r.data),
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ["psych-results-me"] });
    },
  });

  if (isLoading) {
    return (
      <div className="pt-page">
        <div className="pt-loading"><div className="pt-spinner" /></div>
      </div>
    );
  }

  if (!test) {
    return (
      <div className="pt-page">
        <header className="pt-header">
          <Link to="/psych-tests" className="pt-back">←</Link>
          <div className="pt-header-info">
            <span className="pt-header-title">Тест не найден</span>
          </div>
        </header>
      </div>
    );
  }

  const questions = test.questions ?? [];
  const total = questions.length;
  const answered = Object.keys(answers).length;
  const progress = total > 0 ? Math.round((currentQ / total) * 100) : 0;

  function handleAnswer(option) {
    const next = { ...answers, [currentQ]: option };
    setAnswers(next);
    if (currentQ < total - 1) {
      setCurrentQ(currentQ + 1);
    } else {
      // All answered — submit
      const orderedAnswers = questions.map((_, i) => next[i] ?? null);
      submitMut.mutate(orderedAnswers);
    }
  }

  function handleBack() {
    if (currentQ > 0) setCurrentQ(currentQ - 1);
  }

  // ── Result screen ──
  if (result) {
    const icon = TEST_ICONS[test.name] ?? "🧪";
    const color = TEST_COLORS[test.name] ?? "var(--orange)";
    return (
      <div className="pt-page">
        <header className="pt-header">
          <Link to="/psych-tests" className="pt-back">←</Link>
          <div className="pt-header-info">
            <span className="pt-header-title">Результат</span>
          </div>
        </header>

        <div className="pt-result-screen">
          <div className="pt-result-icon" style={{ background: color + "22", color }}>{icon}</div>
          <h2 className="pt-result-name">{test.name}</h2>
          <ScoreBadge testName={test.name} rawScore={result.raw_score} />

          {test.name === "Белбин" && (
            <div className="pt-belbin-scores">
              {Object.entries(result.raw_score).map(([role, score]) => (
                <div key={role} className="pt-belbin-row">
                  <span className="pt-belbin-role">{role}</span>
                  <div className="pt-belbin-bar-wrap">
                    <div className="pt-belbin-bar" style={{ width: `${(score / 5) * 100}%`, background: color }} />
                  </div>
                  <span className="pt-belbin-score">{score}/5</span>
                </div>
              ))}
            </div>
          )}

          {test.name === "MBTI" && (
            <div className="pt-mbti-result">
              <div className="pt-mbti-type" style={{ color }}>{result.raw_score.type}</div>
            </div>
          )}

          {test.name === "Выгорание" && (
            <div className="pt-burnout-result">
              <div className="pt-burnout-meter">
                <div
                  className="pt-burnout-fill"
                  style={{ width: `${result.raw_score.percent}%`, background: color }}
                />
              </div>
              <div className="pt-burnout-label">
                {result.raw_score.percent}% · {result.raw_score.level}
              </div>
            </div>
          )}

          {result.ai_interpretation && (
            <div className="pt-ai-interp">
              <div className="pt-ai-interp-header">
                <span className="pt-ai-icon">🤖</span>
                <span className="pt-ai-label">ИИ-интерпретация</span>
              </div>
              <div className="pt-ai-text">{result.ai_interpretation}</div>
            </div>
          )}

          <button className="pt-done-btn" onClick={() => navigate("/psych-tests")}>
            Завершить
          </button>
        </div>
      </div>
    );
  }

  // ── Submitting screen ──
  if (submitMut.isPending) {
    return (
      <div className="pt-page">
        <div className="pt-loading">
          <div className="pt-spinner" />
          <div className="pt-loading-text">ИИ анализирует результаты…</div>
        </div>
      </div>
    );
  }

  // ── Intro screen ──
  if (showIntro) {
    const icon = TEST_ICONS[test.name] ?? "🧪";
    const color = TEST_COLORS[test.name] ?? "var(--orange)";
    return (
      <div className="pt-page">
        <header className="pt-header">
          <Link to="/psych-tests" className="pt-back">←</Link>
          <div className="pt-header-info">
            <span className="pt-header-title">{test.name}</span>
          </div>
        </header>
        <div className="pt-intro-screen">
          <div className="pt-result-icon" style={{ background: color + "22", color }}>{icon}</div>
          <h2 className="pt-intro-title">{test.name}</h2>
          <p className="pt-intro-body">{test.description}</p>
          <div className="pt-intro-meta">
            <span>📋 {total} вопросов</span>
            <span>⏱ ~{Math.ceil(total * 0.5)} мин</span>
          </div>
          <button className="pt-start-btn" style={{ background: color }} onClick={() => setShowIntro(false)}>
            Начать тест
          </button>
          <Link to="/psych-tests" className="pt-cancel-link">Отмена</Link>
        </div>
      </div>
    );
  }

  // ── Question screen ──
  const q = questions[currentQ];
  const selectedAnswer = answers[currentQ];
  const color = TEST_COLORS[test.name] ?? "var(--orange)";

  return (
    <div className="pt-page">
      <header className="pt-header">
        <button className="pt-back" onClick={handleBack} disabled={currentQ === 0}>←</button>
        <div className="pt-header-info">
          <span className="pt-header-title">{test.name}</span>
          <span className="pt-header-sub">Вопрос {currentQ + 1} из {total}</span>
        </div>
      </header>

      <div className="pt-progress-bar">
        <div className="pt-progress-fill" style={{ width: `${progress}%`, background: color }} />
      </div>

      <div className="pt-question-screen">
        <div className="pt-question-num">Вопрос {currentQ + 1}</div>
        <h2 className="pt-question-text">{q.question}</h2>

        <div className="pt-options">
          {(q.options ?? []).map((opt, i) => (
            <button
              key={i}
              className={`pt-option ${selectedAnswer === opt ? "pt-option--selected" : ""}`}
              style={selectedAnswer === opt ? { borderColor: color, background: color + "18" } : {}}
              onClick={() => handleAnswer(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── My Results Page ───────────────────────────────────────────────────────────

export function PsychTestResults() {
  const { data: results = [], isLoading } = useMyResults();

  return (
    <div className="pt-page">
      <header className="pt-header">
        <Link to="/psych-tests" className="pt-back">←</Link>
        <div className="pt-header-info">
          <span className="pt-header-title">История тестов</span>
        </div>
      </header>

      <div className="pt-content">
        {isLoading ? (
          <div className="pt-loading"><div className="pt-spinner" /></div>
        ) : results.length === 0 ? (
          <div className="pt-empty">
            <div className="pt-empty-icon">📋</div>
            <div className="pt-empty-text">Вы ещё не проходили ни одного теста</div>
            <Link to="/psych-tests" className="pt-empty-link">Пройти тест</Link>
          </div>
        ) : (
          <div className="pt-result-list">
            {results.map((r) => {
              const icon = TEST_ICONS[r.test_name] ?? "🧪";
              const color = TEST_COLORS[r.test_name] ?? "var(--orange)";
              return (
                <div key={r.id} className="pt-result-card">
                  <div className="pt-result-head">
                    <span className="pt-result-card-icon" style={{ background: color + "22", color }}>{icon}</span>
                    <div>
                      <div className="pt-result-card-name">{r.test_name}</div>
                      <div className="pt-result-card-date">{formatDate(r.created_at)}</div>
                    </div>
                    <ScoreBadge testName={r.test_name} rawScore={r.raw_score} />
                  </div>
                  {r.ai_interpretation && (
                    <details className="pt-result-details">
                      <summary>ИИ-интерпретация</summary>
                      <div className="pt-result-interp">{r.ai_interpretation}</div>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Default export — list page ─────────────────────────────────────────────────
export default PsychTestList;

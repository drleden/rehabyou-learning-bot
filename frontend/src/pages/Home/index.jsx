import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import "../../styles/tokens.css";
import "./Home.css";
import api from "../../api";

// ── Helpers ───────────────────────────────────────────────────────────────

function getTelegramUser() {
  try {
    return window?.Telegram?.WebApp?.initDataUnsafe?.user ?? null;
  } catch {
    return null;
  }
}

function getStoredUser() {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function useCurrentUser() {
  const tg = getTelegramUser();
  if (tg) return tg;
  return getStoredUser();
}

function formatDate() {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

function getInitials(user) {
  if (!user) return "?";
  const f = user.first_name?.[0] ?? "";
  const l = user.last_name?.[0] ?? "";
  return (f + l).toUpperCase() || "?";
}

// ── API queries ───────────────────────────────────────────────────────────

function useCourseProgress() {
  return useQuery({
    queryKey: ["course-progress"],
    queryFn: () => api.get("/api/courses/progress/me").then((r) => r.data),
    // Placeholders so UI renders immediately — replaced when API responds
    placeholderData: {
      course_title: "Базовый курс мастера",
      module_title: "Модуль 2 — Техники массажа",
      completed: 0,
      total: 1,
      percent: 0,
      next_lesson_title: null,
    },
    retry: false,
  });
}

function useAcademyNext() {
  return useQuery({
    queryKey: ["academy-next"],
    queryFn: () => api.get("/api/academy/schedule?limit=1&upcoming=true").then((r) => r.data?.[0] ?? null),
    placeholderData: null,
    retry: false,
  });
}

function useAcademyStats() {
  return useQuery({
    queryKey: ["academy-stats"],
    queryFn: () => api.get("/api/academy/stats/me").then((r) => r.data),
    placeholderData: { completed_classes: 0, total_classes: 0, skips: 0 },
    retry: false,
  });
}

// ── Sub-components ────────────────────────────────────────────────────────

function ProgressBar({ percent }) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className="progress-wrap">
      <div className="progress-meta">
        <span className="progress-label">Прогресс курса</span>
        <span className="progress-pct">{clamped}%</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

function CourseCard({ progress, isLoading }) {
  if (isLoading) return <div className="skeleton" />;

  const { course_title, module_title, completed, total, percent, next_lesson_title } = progress;
  const done = completed >= total && total > 0;

  return (
    <Link to="/course" className="card">
      <div className="card-head">
        <div className="card-icon card-icon--orange">📚</div>
        <span className={`card-badge ${done ? "card-badge--done" : "card-badge--active"}`}>
          {done ? "Завершён" : "В процессе"}
        </span>
      </div>

      <div className="card-title">{course_title}</div>
      <div className="card-subtitle">{module_title}</div>

      <ProgressBar percent={percent} />

      <div className="lesson-chips">
        <span className="chip">📖 {completed} из {total} уроков</span>
        {next_lesson_title && (
          <span className="chip">▶ {next_lesson_title}</span>
        )}
      </div>

      <div className="arrow-row">
        <span className="arrow-btn">
          {done ? "Повторить" : "Продолжить"}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </Link>
  );
}

function formatClassDate(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  const day = new Intl.DateTimeFormat("ru-RU", {
    weekday: "short", day: "numeric", month: "short",
  }).format(d);
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${time}`;
}

function AcademyCard({ nextClass, stats, isLoading }) {
  if (isLoading) return <div className="skeleton" />;

  const hasNext = !!nextClass;
  const { completed_classes = 0, total_classes = 0, skips = 0 } = stats ?? {};

  return (
    <Link to="/academy" className="card">
      <div className="card-head">
        <div className="card-icon card-icon--terracotta">🎓</div>
        <span className={`card-badge ${hasNext ? "card-badge--upcoming" : "card-badge--done"}`}>
          {hasNext ? "Запись есть" : "Нет занятий"}
        </span>
      </div>

      <div className="card-title">Академия</div>
      <div className="card-subtitle">Практические занятия и аттестация</div>

      {hasNext ? (
        <div className="next-class">
          <div className="next-class-when">Следующее занятие</div>
          <div className="next-class-topic">{nextClass.topic}</div>
          <div className="next-class-meta">{formatClassDate(nextClass.starts_at)}</div>
        </div>
      ) : (
        <div className="no-class">Занятия не запланированы</div>
      )}

      <div className="lesson-chips" style={{ marginTop: 14 }}>
        <span className="chip">✅ {completed_classes} занятий</span>
        {skips > 0 && <span className="chip">⚠ {skips} пропуска</span>}
      </div>

      <div className="arrow-row">
        <span className="arrow-btn">
          Расписание
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </Link>
  );
}

function QuickNav() {
  const items = [
    { to: "/leaderboard", icon: "🏆", label: "Рейтинг" },
    { to: "/questions",   icon: "💬", label: "Вопросы" },
    { to: "/profile",     icon: "👤", label: "Профиль" },
  ];
  return (
    <nav className="quick-nav">
      {items.map(({ to, icon, label }) => (
        <Link key={to} to={to} className="quick-nav-item">
          <span className="quick-nav-icon">{icon}</span>
          <span className="quick-nav-label">{label}</span>
        </Link>
      ))}
    </nav>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function Home() {
  const user = useCurrentUser();
  const { data: progress, isLoading: progressLoading } = useCourseProgress();
  const { data: nextClass, isLoading: academyLoading }  = useAcademyNext();
  const { data: stats }                                  = useAcademyStats();

  const firstName = user?.first_name ?? "Привет";
  const initials  = getInitials(user);

  return (
    <div className="home">
      {/* ── Header ── */}
      <header className="header">
        <span className="logo">Rehab.You</span>
        <Link to="/profile" className="avatar" aria-label="Профиль">
          {initials}
        </Link>
      </header>

      {/* ── Greeting ── */}
      <section className="greeting">
        <div className="greeting-label">Добро пожаловать</div>
        <h1 className="greeting-name">{firstName}</h1>
        <div className="greeting-date">{formatDate()}</div>
      </section>

      {/* ── Learning blocks ── */}
      <div className="section-label">Обучение</div>
      <div className="cards">
        <CourseCard progress={progress} isLoading={progressLoading} />
        <AcademyCard nextClass={nextClass} stats={stats} isLoading={academyLoading} />
      </div>

      {/* ── Quick navigation ── */}
      <QuickNav />
    </div>
  );
}

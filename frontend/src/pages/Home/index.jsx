import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import "../../styles/tokens.css";
import "./Home.css";
import api from "../../api";

// ── Role helpers ──────────────────────────────────────────────────────────────

const LEARNING_ROLES = ["master", "senior_master", "teacher"];
const MANAGE_ROLES   = ["admin", "manager"];
const SUPER_ROLES    = ["superadmin", "owner"];

function getPrimaryRole(roles = []) {
  if (roles.some((r) => SUPER_ROLES.includes(r)))   return "superadmin";
  if (roles.some((r) => MANAGE_ROLES.includes(r)))  return "manager";
  if (roles.some((r) => LEARNING_ROLES.includes(r))) return "master";
  return "trial";
}

// ── Shared utilities ──────────────────────────────────────────────────────────

function formatDate() {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long", day: "numeric", month: "long",
  }).format(new Date());
}

function getInitials(user) {
  if (!user) return "?";
  return ((user.first_name?.[0] ?? "") + (user.last_name?.[0] ?? "")).toUpperCase() || "?";
}

function Avatar({ user }) {
  return (
    <Link to="/profile" className="avatar" aria-label="Профиль">
      {getInitials(user)}
    </Link>
  );
}

function LogoutIcon() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <button
      className="home-logout-btn"
      onClick={() => { logout(); navigate("/login", { replace: true }); }}
      aria-label="Выйти"
      title="Выйти"
    >
      🚪
    </button>
  );
}

// ── API queries ───────────────────────────────────────────────────────────────

function useCourseProgress() {
  return useQuery({
    queryKey: ["home-course-progress"],
    queryFn: async () => {
      const courses = await api.get("/api/learning/courses").then(r => r.data);
      if (!courses.length) return null;
      // Show the first in-progress or first course
      const active = courses.find(c => c.course_status === "in_progress") ?? courses[0];
      return {
        course_title: active.title,
        module_title: "",
        completed: active.completed,
        total: active.total,
        percent: active.percent,
        next_lesson_title: null,
      };
    },
    placeholderData: {
      course_title: "Базовый курс мастера",
      module_title: "",
      completed: 0, total: 1, percent: 0, next_lesson_title: null,
    },
    retry: false,
  });
}

function useAcademyNext() {
  return useQuery({
    queryKey: ["academy-next"],
    queryFn: () =>
      api.get("/api/academy/schedule?filter=upcoming").then((r) => r.data?.[0] ?? null),
    placeholderData: null,
    retry: false,
  });
}

function useAcademyStats() {
  return useQuery({
    queryKey: ["academy-stats"],
    queryFn: () => api.get("/api/academy/my-progress").then((r) => ({
      completed_classes: r.data.classes_attended,
      total_classes: r.data.classes_attended,
      skips: r.data.skip_count,
    })),
    placeholderData: { completed_classes: 0, total_classes: 0, skips: 0 },
    retry: false,
  });
}

// ── Shared sub-components ─────────────────────────────────────────────────────

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
    <Link to="/courses" className="card">
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
        {next_lesson_title && <span className="chip">▶ {next_lesson_title}</span>}
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

function formatClassDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "short" }).format(d)} · ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
}

function AcademyCard({ nextClass, stats, isLoading }) {
  if (isLoading) return <div className="skeleton" />;
  const hasNext = !!nextClass;
  const { completed_classes = 0, skips = 0 } = stats ?? {};
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
    { to: "/courses",      icon: "📚", label: "Мои курсы" },
    { to: "/psych-tests",  icon: "🧠", label: "Тесты" },
    { to: "/questions",    icon: "💬", label: "Вопросы" },
    { to: "/profile",      icon: "👤", label: "Профиль" },
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

// ── Role dashboards ───────────────────────────────────────────────────────────

/** Master / senior_master / teacher — learning-focused */
function MasterDashboard({ user }) {
  const { data: progress, isLoading: pLoading } = useCourseProgress();
  const { data: nextClass, isLoading: aLoading }  = useAcademyNext();
  const { data: stats }                            = useAcademyStats();

  return (
    <div className="home">
      <header className="header">
        <span className="logo">Rehab.You</span>
        <div className="header-right">
          <Avatar user={user} />
          <LogoutIcon />
        </div>
      </header>

      <section className="greeting">
        <div className="greeting-label">Добро пожаловать</div>
        <h1 className="greeting-name">{user?.first_name ?? "Мастер"}</h1>
        <div className="greeting-date">{formatDate()}</div>
      </section>

      <div className="role-chip role-chip--master">Мастер</div>

      <div className="section-label">Обучение</div>
      <div className="cards">
        <CourseCard progress={progress} isLoading={pLoading} />
        <AcademyCard nextClass={nextClass} stats={stats} isLoading={aLoading} />
      </div>

      <QuickNav />
    </div>
  );
}

/** Admin / manager — management dashboard */
function ManagerDashboard({ user }) {
  const mgmtLinks = [
    { to: "/admin/staff",     icon: "👥", label: "Сотрудники", desc: "Управление командой" },
    { to: "/admin/courses",   icon: "📚", label: "Курсы",      desc: "Контент и назначение" },
    { to: "/admin/academy",   icon: "🎓", label: "Академия",   desc: "Расписание занятий" },
    { to: "/admin/analytics", icon: "📊", label: "Аналитика",  desc: "Прогресс и статистика" },
    { to: "/ai-assistant",    icon: "🤖", label: "ИИ-ассист.", desc: "Анализ и рекомендации" },
    { to: "/psych-tests",     icon: "🧠", label: "Психотесты", desc: "Диагностика команды" },
  ];

  return (
    <div className="home">
      <header className="header">
        <span className="logo">Rehab.You</span>
        <div className="header-right">
          <Avatar user={user} />
          <LogoutIcon />
        </div>
      </header>

      <section className="greeting">
        <div className="greeting-label">Панель управления</div>
        <h1 className="greeting-name">{user?.first_name ?? "Менеджер"}</h1>
        <div className="greeting-date">{formatDate()}</div>
      </section>

      <div className="role-chip role-chip--manager">
        {user?.roles?.includes("admin") ? "Администратор" : "Менеджер"}
      </div>

      <div className="section-label">Управление</div>
      <div className="mgmt-grid">
        {mgmtLinks.map(({ to, icon, label, desc }) => (
          <Link key={label} to={to} className="mgmt-card">
            <span className="mgmt-icon">{icon}</span>
            <span className="mgmt-label">{label}</span>
            <span className="mgmt-desc">{desc}</span>
          </Link>
        ))}
      </div>

      <div className="section-label" style={{ marginTop: 24 }}>Быстрые действия</div>
      <div className="cards">
        <Link to="/admin/staff" className="card card--action">
          <div className="card-icon card-icon--orange">➕</div>
          <div className="card-title">Сотрудники</div>
          <div className="card-subtitle">Управление командой и приглашения</div>
        </Link>
        <Link to="/admin/courses" className="card card--action">
          <div className="card-icon card-icon--terracotta">📚</div>
          <div className="card-title">Курсы</div>
          <div className="card-subtitle">Контент, модули и уроки</div>
        </Link>
      </div>
    </div>
  );
}

/** Superadmin / owner — full control */
function SuperadminDashboard({ user }) {
  const adminLinks = [
    { to: "/admin/staff",        icon: "👥", label: "Сотрудники"  },
    { to: "/admin/courses",      icon: "📚", label: "Курсы"       },
    { to: "/admin/academy",      icon: "🎓", label: "Академия"    },
    { to: "/admin/analytics",    icon: "📊", label: "Аналитика"   },
    { to: "/admin/subscriptions",icon: "💳", label: "Подписки"    },
    { to: "/ai-assistant",       icon: "🤖", label: "ИИ-ассистент"},
    { to: "/admin/settings",     icon: "🏢", label: "Организации" },
    { to: "/admin/audit",        icon: "📋", label: "Аудит"       },
  ];

  const quickLinks = [
    { to: "/psych-tests",     icon: "🧠", label: "Психотесты" },
    { to: "/admin/analytics", icon: "📊", label: "Дайджест"   },
    { to: "/profile",         icon: "👤", label: "Профиль"    },
  ];

  return (
    <div className="home">
      <header className="header">
        <span className="logo">Rehab.You</span>
        <div className="header-right">
          <Avatar user={user} />
          <LogoutIcon />
        </div>
      </header>

      <section className="greeting">
        <div className="greeting-label">Суперадминистратор</div>
        <h1 className="greeting-name">{user?.first_name ?? "Admin"}</h1>
        <div className="greeting-date">{formatDate()}</div>
      </section>

      <div className="role-chip role-chip--super">
        {user?.roles?.includes("owner") ? "Владелец" : "Суперадмин"}
      </div>

      <div className="section-label">Управление платформой</div>
      <div className="admin-grid">
        {adminLinks.map(({ to, icon, label }) => (
          <Link key={to} to={to} className="admin-tile">
            <span className="admin-tile-icon">{icon}</span>
            <span className="admin-tile-label">{label}</span>
          </Link>
        ))}
      </div>

      <nav className="quick-nav quick-nav--scroll">
        {quickLinks.map(({ to, icon, label }) => (
          <Link key={to} to={to} className="quick-nav-item">
            <span className="quick-nav-icon">{icon}</span>
            <span className="quick-nav-label">{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** Trial / no role assigned yet */
function TrialDashboard({ user }) {
  return (
    <div className="home">
      <header className="header">
        <span className="logo">Rehab.You</span>
        <div className="header-right">
          <Avatar user={user} />
          <LogoutIcon />
        </div>
      </header>

      <div className="trial-screen">
        <div className="trial-icon">⏳</div>
        <h2 className="trial-title">Ожидание доступа</h2>
        <p className="trial-text">
          Ваш аккаунт зарегистрирован. Администратор должен назначить вам роль
          для получения доступа к обучению.
        </p>
        <div className="trial-info">
          <span className="trial-info-row">
            <span className="trial-info-key">Telegram</span>
            <span className="trial-info-val">@{user?.username ?? "—"}</span>
          </span>
          <span className="trial-info-row">
            <span className="trial-info-key">Статус</span>
            <span className="trial-info-val">Ожидание</span>
          </span>
        </div>
        <p className="login-hint">
          Обратитесь к менеджеру или администратору вашего филиала.
        </p>
      </div>
    </div>
  );
}

// ── Page root — picks dashboard by role ──────────────────────────────────────

export default function Home() {
  const { user } = useAuth();
  const role = getPrimaryRole(user?.roles ?? []);

  if (role === "superadmin") return <SuperadminDashboard user={user} />;
  if (role === "manager")    return <ManagerDashboard user={user} />;
  if (role === "master")     return <MasterDashboard user={user} />;
  return <TrialDashboard user={user} />;
}

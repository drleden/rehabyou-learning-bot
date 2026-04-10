/**
 * /profile — Own profile page
 *
 * Shows: name, role/status, service permission chips (green/grey),
 * brief learning progress summary.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import api from "../../api";
import "./Profile.css";

// ── Role / status labels ──────────────────────────────────────────────────────

const ROLE_LABELS = {
  superadmin:    "Суперадмин",
  owner:         "Владелец",
  admin:         "Администратор",
  manager:       "Менеджер",
  senior_master: "Старший мастер",
  teacher:       "Преподаватель",
  master:        "Мастер",
};

const STATUS_LABELS = {
  active:  "Активен",
  trial:   "Ожидание",
  blocked: "Заблокирован",
  fired:   "Уволен",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(user) {
  if (!user) return "?";
  return ((user.first_name?.[0] ?? "") + (user.last_name?.[0] ?? "")).toUpperCase() || "?";
}

function fullName(user) {
  const n = [user?.first_name, user?.last_name].filter(Boolean).join(" ");
  return n || user?.username || "—";
}

function primaryRole(roles = []) {
  if (!roles.length) return null;
  const order = ["owner", "superadmin", "admin", "manager", "teacher", "senior_master", "master"];
  return order.find(r => roles.includes(r)) ?? roles[0];
}

// ── Data hooks ────────────────────────────────────────────────────────────────

function usePermissions(userId) {
  return useQuery({
    queryKey: ["my-permissions", userId],
    queryFn: () => api.get(`/api/services/permissions/${userId}`).then(r => r.data),
    enabled: !!userId,
    placeholderData: [],
    retry: false,
  });
}

function useCourseProgress() {
  return useQuery({
    queryKey: ["profile-course-progress"],
    queryFn: async () => {
      const courses = await api.get("/api/learning/courses").then(r => r.data);
      if (!courses.length) return null;
      const total = courses.length;
      const done = courses.filter(c => c.course_status === "completed").length;
      const inProg = courses.filter(c => c.course_status === "in_progress").length;
      // Find next lesson across all in-progress courses
      const active = courses.find(c => c.course_status === "in_progress") ?? courses[0];
      return { total, done, inProg, activePercent: active?.percent ?? 0, activeTitle: active?.title ?? "" };
    },
    placeholderData: null,
    retry: false,
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AvatarBig({ user }) {
  return (
    <div className="pf-avatar">{getInitials(user)}</div>
  );
}

function PermissionChips({ permissions, isLoading }) {
  if (isLoading) return <div className="pf-chips-skeleton" />;
  if (!permissions?.length) return <p className="pf-empty">Нет данных о допусках</p>;
  return (
    <div className="pf-chips">
      {permissions.map(p => (
        <span
          key={p.service_id}
          className={`pf-chip ${p.status === "permitted" ? "pf-chip--ok" : "pf-chip--no"}`}
        >
          {p.status === "permitted" ? "✓" : "✗"} {p.service_name}
        </span>
      ))}
    </div>
  );
}

function ProgressSummary({ progress, isLoading }) {
  if (isLoading || !progress) return null;
  return (
    <div className="pf-progress-card">
      <div className="pf-progress-row">
        <span className="pf-progress-label">Всего курсов</span>
        <span className="pf-progress-val">{progress.total}</span>
      </div>
      <div className="pf-progress-row">
        <span className="pf-progress-label">Завершено</span>
        <span className="pf-progress-val pf-progress-val--ok">{progress.done}</span>
      </div>
      {progress.inProg > 0 && (
        <div className="pf-progress-row">
          <span className="pf-progress-label">В процессе</span>
          <span className="pf-progress-val">{progress.inProg}</span>
        </div>
      )}
      {progress.activeTitle && (
        <>
          <div className="pf-divider" />
          <div className="pf-progress-active-label">{progress.activeTitle}</div>
          <div className="pf-bar-wrap">
            <div className="pf-bar-fill" style={{ width: `${progress.activePercent}%` }} />
          </div>
          <div className="pf-bar-pct">{progress.activePercent}%</div>
        </>
      )}
    </div>
  );
}

// ── Change password modal ─────────────────────────────────────────────────────

function ChangePasswordModal({ onClose }) {
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(false);

  const mut = useMutation({
    mutationFn: () => api.post("/api/auth/set-password", {
      old_password: oldPwd || undefined,
      new_password: newPwd,
    }),
    onSuccess: () => setDone(true),
    onError: (e) => setErr(e?.response?.data?.detail ?? "Ошибка сохранения"),
  });

  function submit(e) {
    e.preventDefault();
    setErr(null);
    if (newPwd.length < 6) { setErr("Минимум 6 символов"); return; }
    if (newPwd !== confirm) { setErr("Пароли не совпадают"); return; }
    mut.mutate();
  }

  return (
    <div className="pf-modal-overlay" onClick={onClose}>
      <div className="pf-modal" onClick={e => e.stopPropagation()}>
        <div className="pf-modal-hd">
          <span className="pf-modal-title">Изменить пароль</span>
          <button className="pf-modal-close" onClick={onClose}>✕</button>
        </div>

        {done ? (
          <div className="pf-modal-done">
            <div className="pf-modal-done-icon">✅</div>
            <p className="pf-modal-done-text">Пароль успешно изменён</p>
            <button className="pf-modal-btn" onClick={onClose}>Закрыть</button>
          </div>
        ) : (
          <form className="pf-modal-form" onSubmit={submit} noValidate>
            <label className="pf-modal-label">Текущий пароль</label>
            <input
              className="pf-modal-input"
              type="password"
              placeholder="Оставьте пустым, если ещё не задан"
              value={oldPwd}
              onChange={e => setOldPwd(e.target.value)}
              autoComplete="current-password"
            />

            <label className="pf-modal-label">Новый пароль</label>
            <div className="pf-modal-pwd-wrap">
              <input
                className="pf-modal-input pf-modal-input--pwd"
                type={showNew ? "text" : "password"}
                placeholder="Минимум 6 символов"
                value={newPwd}
                onChange={e => setNewPwd(e.target.value)}
                autoComplete="new-password"
                autoFocus
              />
              <button type="button" className="pf-modal-eye" onClick={() => setShowNew(v => !v)}>
                {showNew ? "🙈" : "👁"}
              </button>
            </div>

            <label className="pf-modal-label">Повторите новый пароль</label>
            <input
              className="pf-modal-input"
              type="password"
              placeholder="Повторите пароль"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              autoComplete="new-password"
            />

            {err && <p className="pf-modal-err">{err}</p>}

            <button className="pf-modal-btn" type="submit" disabled={mut.isPending}>
              {mut.isPending ? "Сохранение…" : "Сохранить пароль"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Profile() {
  const { user } = useAuth();
  const [changePwdOpen, setChangePwdOpen] = useState(false);
  const { data: permissions, isLoading: permLoading } = usePermissions(user?.id);
  const { data: progress, isLoading: progLoading } = useCourseProgress();

  const role = primaryRole(user?.roles ?? []);
  const roleName = role ? (ROLE_LABELS[role] ?? role) : "Нет роли";
  const statusName = STATUS_LABELS[user?.status] ?? user?.status ?? "";

  return (
    <div className="pf-page">
      <header className="pf-header">
        <Link to="/" className="pf-back">‹</Link>
        <span className="pf-header-title">Мой профиль</span>
      </header>

      {/* Identity */}
      <section className="pf-identity">
        <AvatarBig user={user} />
        <h1 className="pf-name">{fullName(user)}</h1>
        {user?.username && (
          <div className="pf-username">@{user.username}</div>
        )}
        <div className="pf-badges">
          <span className="pf-badge pf-badge--role">{roleName}</span>
          <span className={`pf-badge pf-badge--status pf-badge--${user?.status}`}>{statusName}</span>
        </div>
        {user?.phone && (
          <div className="pf-phone">{user.phone}</div>
        )}
      </section>

      {/* Service permissions */}
      <div className="pf-section-label">Допуски к услугам</div>
      <PermissionChips permissions={permissions} isLoading={permLoading} />

      {/* Learning progress */}
      <div className="pf-section-label">Обучение</div>
      {!progLoading && !progress && (
        <p className="pf-empty">Курсы не назначены</p>
      )}
      <ProgressSummary progress={progress} isLoading={progLoading} />

      <Link to="/courses" className="pf-link-btn">
        Перейти к курсам →
      </Link>

      <button className="pf-change-pwd-btn" onClick={() => setChangePwdOpen(true)}>
        🔑 Изменить пароль
      </button>

      <LogoutButton />

      {changePwdOpen && <ChangePasswordModal onClose={() => setChangePwdOpen(false)} />}
    </div>
  );
}

function LogoutButton() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <button className="pf-logout-btn" onClick={handleLogout}>
      🚪 Выйти
    </button>
  );
}

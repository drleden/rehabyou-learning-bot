import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../api";
import "./Staff.css";

// ── Constants ─────────────────────────────────────────────────────────────────

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

const STATUS_FILTERS = [
  { key: null,      label: "Все" },
  { key: "active",  label: "Активные" },
  { key: "trial",   label: "Ожидают" },
  { key: "blocked", label: "Заблок." },
  { key: "fired",   label: "Уволены" },
];

const ROLE_OPTIONS = Object.entries(ROLE_LABELS);

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(u) {
  return ((u.first_name?.[0] ?? "") + (u.last_name?.[0] ?? "")).toUpperCase() || "?";
}

function fullName(u) {
  const n = [u.first_name, u.last_name].filter(Boolean).join(" ");
  return n || u.username || u.phone || "—";
}

function roleBadge(roles) {
  if (!roles?.length) return "Нет роли";
  return roles.map((r) => ROLE_LABELS[r] ?? r).join(", ");
}

// ── API hooks ─────────────────────────────────────────────────────────────────

function useStaff(filters) {
  const params = {};
  if (filters.status) params.status = filters.status;
  if (filters.role)   params.role   = filters.role;
  if (filters.search) params.search = filters.search;

  return useQuery({
    queryKey: ["staff", filters],
    queryFn: () => api.get("/api/users/", { params }).then((r) => r.data),
    placeholderData: [],
    retry: false,
  });
}

// ── Invite modal ──────────────────────────────────────────────────────────────

function InviteModal({ onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    telegram_id: "", phone: "", first_name: "", last_name: "", roles: [],
  });
  const [error, setError] = useState(null);

  const mutation = useMutation({
    mutationFn: (data) => api.post("/api/users/invite", data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      onClose();
    },
    onError: (e) => setError(e?.response?.data?.detail ?? "Ошибка при добавлении"),
  });

  function toggle(role) {
    setForm((f) => ({
      ...f,
      roles: f.roles.includes(role) ? f.roles.filter((r) => r !== role) : [...f.roles, role],
    }));
  }

  function submit(e) {
    e.preventDefault();
    setError(null);
    const data = {
      first_name: form.first_name || undefined,
      last_name:  form.last_name  || undefined,
      roles: form.roles,
    };
    if (form.telegram_id) data.telegram_id = Number(form.telegram_id);
    if (form.phone)       data.phone = form.phone;
    mutation.mutate(data);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Добавить сотрудника</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={submit} className="invite-form">
          <label className="sf-label">Telegram ID <span className="sf-hint">(или номер телефона)</span></label>
          <input className="sf-input" placeholder="123456789"
            value={form.telegram_id}
            onChange={(e) => setForm((f) => ({ ...f, telegram_id: e.target.value }))} />

          <label className="sf-label">Телефон</label>
          <input className="sf-input" placeholder="+79001234567" type="tel"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />

          <div className="sf-row">
            <div className="sf-col">
              <label className="sf-label">Имя</label>
              <input className="sf-input" placeholder="Имя"
                value={form.first_name}
                onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} />
            </div>
            <div className="sf-col">
              <label className="sf-label">Фамилия</label>
              <input className="sf-input" placeholder="Фамилия"
                value={form.last_name}
                onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} />
            </div>
          </div>

          <label className="sf-label">Роль</label>
          <div className="sf-role-grid">
            {ROLE_OPTIONS.map(([key, label]) => (
              <button
                key={key} type="button"
                className={`sf-role-btn ${form.roles.includes(key) ? "sf-role-btn--on" : ""}`}
                onClick={() => toggle(key)}
              >{label}</button>
            ))}
          </div>

          {error && <p className="sf-error">{error}</p>}

          <button className="sf-submit" type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? <span className="spinner-sm" /> : "Добавить"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Action sheet ──────────────────────────────────────────────────────────────

function ActionSheet({ user, onClose }) {
  const qc = useQueryClient();
  const [roleMode, setRoleMode] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState(user.roles ?? []);
  const [error, setError] = useState(null);

  function mutate(fn) {
    setError(null);
    fn()
      .then(() => { qc.invalidateQueries({ queryKey: ["staff"] }); onClose(); })
      .catch((e) => setError(e?.response?.data?.detail ?? "Ошибка"));
  }

  function toggleRole(r) {
    setSelectedRoles((rs) => rs.includes(r) ? rs.filter((x) => x !== r) : [...rs, r]);
  }

  if (roleMode) {
    return (
      <div className="sheet-overlay" onClick={onClose}>
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <div className="sheet-handle" />
          <p className="sheet-name">Роль: {fullName(user)}</p>
          <div className="sf-role-grid">
            {ROLE_OPTIONS.map(([key, label]) => (
              <button key={key} type="button"
                className={`sf-role-btn ${selectedRoles.includes(key) ? "sf-role-btn--on" : ""}`}
                onClick={() => toggleRole(key)}>{label}</button>
            ))}
          </div>
          {error && <p className="sf-error">{error}</p>}
          <button className="sheet-action sheet-action--primary" onClick={() =>
            mutate(() => api.patch(`/api/users/${user.id}/role`, { roles: selectedRoles }))
          }>Сохранить</button>
          <button className="sheet-action sheet-action--ghost" onClick={() => setRoleMode(false)}>Назад</button>
        </div>
      </div>
    );
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <p className="sheet-name">{fullName(user)}</p>
        <p className="sheet-meta">{roleBadge(user.roles)} · {STATUS_LABELS[user.status] ?? user.status}</p>

        <button className="sheet-action" onClick={() => setRoleMode(true)}>
          👤 Назначить роль
        </button>

        {user.status !== "fired" && (
          <button className="sheet-action sheet-action--danger" onClick={() =>
            mutate(() => api.patch(`/api/users/${user.id}/fire`))
          }>🚫 Уволить</button>
        )}

        {user.status === "blocked" ? (
          <button className="sheet-action" onClick={() =>
            mutate(() => api.patch(`/api/users/${user.id}/unblock`))
          }>🔓 Разблокировать</button>
        ) : user.status !== "fired" && (
          <button className="sheet-action sheet-action--warn" onClick={() =>
            mutate(() => api.patch(`/api/users/${user.id}/block`))
          }>🔒 Заблокировать</button>
        )}

        {error && <p className="sf-error" style={{ margin: "12px 0 0" }}>{error}</p>}
        <button className="sheet-action sheet-action--ghost" onClick={onClose}>Отмена</button>
      </div>
    </div>
  );
}

// ── Employee card ─────────────────────────────────────────────────────────────

function EmployeeCard({ user, onClick }) {
  const statusCls = {
    active:  "sc-status--active",
    trial:   "sc-status--trial",
    blocked: "sc-status--blocked",
    fired:   "sc-status--fired",
  }[user.status] ?? "";

  return (
    <button className="sc" onClick={() => onClick(user)}>
      <div className="sc-avatar">{initials(user)}</div>
      <div className="sc-body">
        <span className="sc-name">{fullName(user)}</span>
        <span className="sc-role">{roleBadge(user.roles)}</span>
        {user.phone && <span className="sc-phone">{user.phone}</span>}
      </div>
      <span className={`sc-status ${statusCls}`}>
        {STATUS_LABELS[user.status] ?? user.status}
      </span>
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Staff() {
  const [filters, setFilters] = useState({ status: null, role: null, search: "" });
  const [selected, setSelected] = useState(null);
  const [inviting, setInviting] = useState(false);

  const { data: staff = [], isLoading } = useStaff(filters);

  function setStatus(s) { setFilters((f) => ({ ...f, status: f.status === s ? null : s })); }
  function setRole(r)   { setFilters((f) => ({ ...f, role:   f.role   === r ? null : r })); }

  return (
    <div className="staff-page">
      {/* Header */}
      <header className="staff-header">
        <Link to="/admin" className="back-btn">‹</Link>
        <span className="staff-title">Сотрудники</span>
        <button className="add-btn" onClick={() => setInviting(true)}>＋</button>
      </header>

      {/* Search */}
      <div className="search-wrap">
        <input
          className="search-input"
          type="search"
          placeholder="Поиск по имени или телефону…"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
        />
      </div>

      {/* Status filters */}
      <div className="filter-scroll">
        {STATUS_FILTERS.map(({ key, label }) => (
          <button
            key={String(key)}
            className={`filter-chip ${filters.status === key ? "filter-chip--on" : ""}`}
            onClick={() => setStatus(key)}
          >{label}</button>
        ))}
      </div>

      {/* Role filters */}
      <div className="filter-scroll filter-scroll--roles">
        {ROLE_OPTIONS.map(([key, label]) => (
          <button
            key={key}
            className={`filter-chip filter-chip--sm ${filters.role === key ? "filter-chip--on" : ""}`}
            onClick={() => setRole(key)}
          >{label}</button>
        ))}
      </div>

      {/* Count */}
      <div className="staff-count">
        {isLoading ? "Загрузка…" : `${staff.length} сотрудников`}
      </div>

      {/* List */}
      <div className="staff-list">
        {isLoading
          ? [0, 1, 2, 3].map((i) => <div key={i} className="sc sc--skeleton" />)
          : staff.length === 0
            ? <p className="staff-empty">Никого не найдено</p>
            : staff.map((u) => (
                <EmployeeCard key={u.id} user={u} onClick={setSelected} />
              ))
        }
      </div>

      {/* Modals */}
      {selected && <ActionSheet user={selected} onClose={() => setSelected(null)} />}
      {inviting  && <InviteModal onClose={() => setInviting(false)} />}
    </div>
  );
}

/**
 * /admin/staff/:id — Staff member detail
 *
 * Shows: name, role, status, service permission toggles (all 7),
 * history of permission changes.
 */
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../api";
import "./StaffDetail.css";

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(u) {
  return ((u?.first_name?.[0] ?? "") + (u?.last_name?.[0] ?? "")).toUpperCase() || "?";
}

function fullName(u) {
  const n = [u?.first_name, u?.last_name].filter(Boolean).join(" ");
  return n || u?.username || u?.phone || "—";
}

function roleBadge(roles) {
  if (!roles?.length) return "Нет роли";
  return roles.map(r => ROLE_LABELS[r] ?? r).join(", ");
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Data hooks ────────────────────────────────────────────────────────────────

function useStaffUser(userId) {
  return useQuery({
    queryKey: ["staff-user", userId],
    queryFn: () => api.get(`/api/users/${userId}`).then(r => r.data),
    enabled: !!userId,
    retry: false,
  });
}

function usePermissions(userId) {
  return useQuery({
    queryKey: ["staff-permissions", userId],
    queryFn: () => api.get(`/api/services/permissions/${userId}`).then(r => r.data),
    enabled: !!userId,
    placeholderData: [],
    retry: false,
  });
}

function usePsychResults(userId) {
  return useQuery({
    queryKey: ["staff-psych-results", userId],
    queryFn: () => api.get(`/api/psych-tests/results/${userId}`).then(r => r.data),
    enabled: !!userId,
    placeholderData: [],
    retry: false,
  });
}

function useHistory(userId) {
  return useQuery({
    queryKey: ["staff-perm-history", userId],
    queryFn: () => api.get(`/api/services/permissions/${userId}/history`).then(r => r.data),
    enabled: !!userId,
    placeholderData: [],
    retry: false,
  });
}

// ── Permission toggle row ─────────────────────────────────────────────────────

function PermissionRow({ perm, userId }) {
  const qc = useQueryClient();
  const isGranted = perm.status === "permitted";

  const grantMut = useMutation({
    mutationFn: () => api.post("/api/services/permissions", {
      user_id: Number(userId),
      service_id: perm.service_id,
    }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-permissions", userId] });
      qc.invalidateQueries({ queryKey: ["staff-perm-history", userId] });
    },
  });

  const revokeMut = useMutation({
    mutationFn: () => api.delete(`/api/services/permissions/${userId}/${perm.service_id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-permissions", userId] });
      qc.invalidateQueries({ queryKey: ["staff-perm-history", userId] });
    },
  });

  const isPending = grantMut.isPending || revokeMut.isPending;

  function toggle() {
    if (isPending) return;
    if (isGranted) {
      revokeMut.mutate();
    } else {
      grantMut.mutate();
    }
  }

  return (
    <div className="sd-perm-row" onClick={toggle}>
      <span className="sd-perm-name">{perm.service_name}</span>
      <div className={`sd-toggle ${isGranted ? "sd-toggle--on" : ""} ${isPending ? "sd-toggle--pending" : ""}`}>
        <div className="sd-toggle-knob" />
      </div>
    </div>
  );
}

// ── History table ─────────────────────────────────────────────────────────────

function HistorySection({ userId }) {
  const { data: history = [], isLoading } = useHistory(userId);

  if (isLoading) return <p className="sd-loading">Загрузка…</p>;
  if (!history.length) return <p className="sd-empty">История изменений пуста</p>;

  return (
    <div className="sd-history-list">
      {history.map(h => (
        <div key={h.id} className="sd-hist-row">
          <div className="sd-hist-svc">{h.service_name}</div>
          <div className="sd-hist-change">
            <span className={`sd-hist-badge sd-hist-badge--${h.new_status === "permitted" ? "ok" : "no"}`}>
              {h.new_status === "permitted" ? "Выдан" : "Отозван"}
            </span>
            <span className="sd-hist-date">{fmtDate(h.created_at)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TEST_ICONS = { "Белбин": "🎭", "MBTI": "🧠", "Выгорание": "🔥" };
const TEST_COLORS = { "Белбин": "var(--orange)", "MBTI": "#6c8ebf", "Выгорание": "#c4694f" };

function PsychSection({ userId }) {
  const { data: results = [], isLoading } = usePsychResults(userId);
  if (isLoading) return <div className="sd-skeleton sd-skeleton--sm" />;
  if (!results.length) return <p className="sd-empty">Тесты не пройдены</p>;
  return (
    <div className="sd-psych-list">
      {results.map((r) => {
        const color = TEST_COLORS[r.test_name] ?? "var(--orange)";
        const icon = TEST_ICONS[r.test_name] ?? "🧪";
        let scoreLabel = "";
        if (r.test_name === "MBTI") scoreLabel = r.raw_score?.type ?? "";
        else if (r.test_name === "Выгорание") scoreLabel = `${r.raw_score?.level ?? ""} · ${r.raw_score?.percent ?? 0}%`;
        else if (r.test_name === "Белбин") {
          const top = Object.entries(r.raw_score ?? {}).sort((a, b) => b[1] - a[1])[0];
          scoreLabel = top ? top[0] : "";
        }
        return (
          <details key={r.id} className="sd-psych-card">
            <summary className="sd-psych-summary">
              <span className="sd-psych-icon" style={{ background: color + "22", color }}>{icon}</span>
              <span className="sd-psych-name">{r.test_name}</span>
              {scoreLabel && <span className="sd-psych-badge" style={{ background: color + "22", color }}>{scoreLabel}</span>}
              <span className="sd-psych-date">{fmtDate(r.created_at)}</span>
            </summary>
            {r.ai_interpretation && (
              <div className="sd-psych-interp">{r.ai_interpretation}</div>
            )}
          </details>
        );
      })}
    </div>
  );
}

export default function StaffDetail() {
  const { id } = useParams();
  const { data: user, isLoading: userLoading, isError } = useStaffUser(id);
  const { data: permissions = [], isLoading: permLoading } = usePermissions(id);

  if (userLoading) {
    return (
      <div className="sd-page">
        <header className="sd-header">
          <Link to="/admin/staff" className="sd-back">‹</Link>
          <span className="sd-header-title">Сотрудник</span>
        </header>
        <div className="sd-skeleton-list">
          {[0,1,2].map(i => <div key={i} className="sd-skeleton" />)}
        </div>
      </div>
    );
  }

  if (isError || !user) {
    return (
      <div className="sd-page">
        <header className="sd-header">
          <Link to="/admin/staff" className="sd-back">‹</Link>
          <span className="sd-header-title">Не найдено</span>
        </header>
        <p className="sd-empty" style={{ padding: 24 }}>Сотрудник не найден</p>
      </div>
    );
  }

  return (
    <div className="sd-page">
      <header className="sd-header">
        <Link to="/admin/staff" className="sd-back">‹</Link>
        <span className="sd-header-title">Сотрудник</span>
      </header>

      {/* Identity */}
      <section className="sd-identity">
        <div className="sd-avatar">{initials(user)}</div>
        <div className="sd-info">
          <div className="sd-name">{fullName(user)}</div>
          <div className="sd-role">{roleBadge(user.roles)}</div>
          {user.phone && <div className="sd-phone">{user.phone}</div>}
        </div>
        <span className={`sd-status sd-status--${user.status}`}>
          {STATUS_LABELS[user.status] ?? user.status}
        </span>
      </section>

      {/* Service permissions */}
      <div className="sd-section-label">Допуски к услугам</div>
      <div className="sd-perm-card">
        {permLoading
          ? [0,1,2].map(i => <div key={i} className="sd-skeleton sd-skeleton--sm" />)
          : permissions.length === 0
            ? <p className="sd-empty">Услуги не загружены</p>
            : permissions.map(p => (
                <PermissionRow key={p.service_id} perm={p} userId={id} />
              ))
        }
      </div>

      {/* Psych test results */}
      <div className="sd-section-label">Психологические тесты</div>
      <div className="sd-perm-card">
        <PsychSection userId={id} />
      </div>

      {/* History */}
      <div className="sd-section-label">История изменений</div>
      <HistorySection userId={id} />
    </div>
  );
}

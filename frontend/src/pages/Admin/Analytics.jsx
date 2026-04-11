/**
 * /admin/analytics — Platform analytics dashboard
 *
 * - 4 metric cards (users, avg progress, completed, inactive)
 * - Staff activity table with progress bars
 * - Top-5 problematic tests
 * - Academy stats (attendance, status distribution)
 * - Inactive users list
 */
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import api from "../../api";
import "./Analytics.css";

// ── Data hooks ────────────────────────────────────────────────────────────────

const useOverview    = () => useQuery({ queryKey: ["an-overview"],  queryFn: () => api.get("/api/analytics/overview").then(r => r.data),  placeholderData: null, retry: false });
const useCourses     = () => useQuery({ queryKey: ["an-courses"],   queryFn: () => api.get("/api/analytics/courses").then(r => r.data),   placeholderData: [], retry: false });
const useStaff       = () => useQuery({ queryKey: ["an-staff"],     queryFn: () => api.get("/api/analytics/staff").then(r => r.data),     placeholderData: [], retry: false });
const useTests       = () => useQuery({ queryKey: ["an-tests"],     queryFn: () => api.get("/api/analytics/tests").then(r => r.data),     placeholderData: [], retry: false });
const useInactive    = () => useQuery({ queryKey: ["an-inactive"],  queryFn: () => api.get("/api/analytics/inactive").then(r => r.data),  placeholderData: [], retry: false });
const useAcademy     = () => useQuery({ queryKey: ["an-academy"],   queryFn: () => api.get("/api/analytics/academy").then(r => r.data),   placeholderData: null, retry: false });

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_LABELS = {
  superadmin: "Суперадмин", owner: "Владелец", admin: "Администратор",
  manager: "Менеджер", senior_master: "Ст. мастер", teacher: "Преп.", master: "Мастер",
};

function fullName(u) {
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || "—";
}

function roleBadge(roles = []) {
  if (!roles.length) return "Нет роли";
  return roles.map(r => ROLE_LABELS[r] ?? r).join(", ");
}

function fmtDate(iso) {
  if (!iso) return "Никогда";
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, accent }) {
  return (
    <div className={`an-stat ${accent ? `an-stat--${accent}` : ""}`}>
      <div className="an-stat-icon">{icon}</div>
      <div className="an-stat-body">
        <div className="an-stat-value">{value ?? "—"}</div>
        <div className="an-stat-label">{label}</div>
        {sub && <div className="an-stat-sub">{sub}</div>}
      </div>
    </div>
  );
}

// ── Progress bar mini ─────────────────────────────────────────────────────────

function PctBar({ pct }) {
  const clamped = Math.min(100, Math.max(0, pct ?? 0));
  const cls = clamped >= 80 ? "an-bar--ok" : clamped >= 40 ? "an-bar--mid" : "an-bar--low";
  return (
    <div className="an-bar-wrap">
      <div className={`an-bar-fill ${cls}`} style={{ width: `${clamped}%` }} />
      <span className="an-bar-lbl">{clamped}%</span>
    </div>
  );
}

// ── Staff table ───────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { key: "progress", label: "По прогрессу" },
  { key: "active", label: "По активности" },
  { key: "name", label: "По имени" },
];

function StaffTable({ data, isLoading }) {
  const [sort, setSort] = useState("progress");

  const sorted = [...(data ?? [])].sort((a, b) => {
    if (sort === "progress") return b.progress_pct - a.progress_pct;
    if (sort === "active") {
      if (!a.last_active_at) return -1;
      if (!b.last_active_at) return 1;
      return new Date(b.last_active_at) - new Date(a.last_active_at);
    }
    return fullName(a).localeCompare(fullName(b), "ru");
  });

  if (isLoading) return <div className="an-skeleton" style={{ height: 180 }} />;
  if (!sorted.length) return <p className="an-empty">Нет данных</p>;

  return (
    <>
      <div className="an-sort-row">
        {SORT_OPTIONS.map(o => (
          <button key={o.key}
            className={`an-sort-btn ${sort === o.key ? "an-sort-btn--on" : ""}`}
            onClick={() => setSort(o.key)}
          >{o.label}</button>
        ))}
      </div>
      <div className="an-table-wrap">
        <table className="an-table">
          <thead>
            <tr>
              <th>Имя</th>
              <th>Роль</th>
              <th>Прогресс</th>
              <th>Последний вход</th>
              <th>Тесты</th>
              <th>Академия</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(u => (
              <tr key={u.user_id} className={u.is_inactive ? "an-row--inactive" : ""}>
                <td>
                  <Link to={`/admin/staff/${u.user_id}`} className="an-name-link">
                    {fullName(u)}
                  </Link>
                </td>
                <td className="an-role-cell">{roleBadge(u.roles)}</td>
                <td><PctBar pct={u.progress_pct} /></td>
                <td className={u.is_inactive ? "an-cell--warn" : ""}>
                  {fmtDate(u.last_active_at)}
                </td>
                <td className="an-center">{u.test_attempts}</td>
                <td>
                  {u.academy_status
                    ? <span className={`an-acad-badge an-acad-${u.academy_status}`}>
                        {ACAD_LABELS[u.academy_status] ?? u.academy_status}
                      </span>
                    : <span className="an-acad-badge an-acad-none">—</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const ACAD_LABELS = {
  in_training:    "В обучении",
  base_certified: "Базов. ✓",
  full_certified: "Полн. ✓",
  blocked:        "Заблок.",
  failed:         "Провал",
};

// ── Courses section ───────────────────────────────────────────────────────────

function CoursesSection({ data, isLoading }) {
  if (isLoading) return <div className="an-skeleton" style={{ height: 120 }} />;
  if (!data?.length) return <p className="an-empty">Нет активных курсов</p>;
  return (
    <div className="an-course-list">
      {data.map(c => (
        <div key={c.course_id} className="an-course-row">
          <div className="an-course-title">{c.title}</div>
          <div className="an-course-stats">
            <span className="an-course-pill">📚 {c.total_lessons} ур.</span>
            <span className="an-course-pill">▶ {c.started} начали</span>
            <span className="an-course-pill an-pill--ok">✅ {c.completed} завершили</span>
            <span className="an-course-pill an-pill--pct">{c.conversion}% конверсия</span>
          </div>
          <div className="an-course-bar">
            <div className="an-course-bar-fill" style={{ width: `${c.avg_progress}%` }} />
            <span className="an-course-bar-lbl">Ср. прогресс {c.avg_progress}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Problem tests section ─────────────────────────────────────────────────────

function ProblemTests({ data, isLoading }) {
  if (isLoading) return <div className="an-skeleton" style={{ height: 120 }} />;
  if (!data?.length) return <p className="an-empty">Нет данных о тестах</p>;
  return (
    <div className="an-test-list">
      {data.map((t, i) => (
        <div key={t.test_id} className="an-test-row">
          <div className="an-test-rank">{i + 1}</div>
          <div className="an-test-body">
            <div className="an-test-name">{t.lesson_title}</div>
            <div className="an-test-meta">
              <span className="an-test-pill">{t.total_attempts} попыток</span>
              <span className={`an-test-pill ${t.pass_rate < 50 ? "an-pill--warn" : "an-pill--ok"}`}>
                {t.pass_rate}% сдали
              </span>
              <span className="an-test-pill">Ср. балл {t.avg_score}%</span>
            </div>
          </div>
          <div className={`an-test-pct ${t.pass_rate < 50 ? "an-pct--bad" : "an-pct--ok"}`}>
            {t.pass_rate}%
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Academy section ───────────────────────────────────────────────────────────

function AcademySection({ data, isLoading }) {
  if (isLoading) return <div className="an-skeleton" style={{ height: 140 }} />;
  if (!data) return <p className="an-empty">Нет данных</p>;

  const { attendance_pct, avg_score, status_distribution: sd, attestations: at } = data;
  return (
    <div className="an-academy-wrap">
      <div className="an-acad-row">
        <div className="an-acad-metric">
          <div className="an-acad-val">{attendance_pct}%</div>
          <div className="an-acad-lbl">Посещаемость</div>
        </div>
        <div className="an-acad-metric">
          <div className="an-acad-val">{avg_score}</div>
          <div className="an-acad-lbl">Средняя оценка</div>
        </div>
        <div className="an-acad-metric">
          <div className="an-acad-val">{at?.passed ?? 0}</div>
          <div className="an-acad-lbl">Аттестаций сдано</div>
        </div>
        <div className="an-acad-metric">
          <div className="an-acad-val">{at?.pending ?? 0}</div>
          <div className="an-acad-lbl">Ожидают аттестации</div>
        </div>
      </div>

      <div className="an-status-dist">
        {[
          { key: "in_training",    label: "В обучении",  cls: "dist--training" },
          { key: "base_certified", label: "Базов. атт.", cls: "dist--cert" },
          { key: "full_certified", label: "Полн. атт.",  cls: "dist--full" },
          { key: "blocked",        label: "Заблок.",     cls: "dist--blocked" },
        ].map(({ key, label, cls }) => (
          <div key={key} className={`an-dist-chip ${cls}`}>
            <span className="an-dist-val">{sd?.[key] ?? 0}</span>
            <span className="an-dist-lbl">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Inactive users ────────────────────────────────────────────────────────────

function InactiveSection({ data, isLoading }) {
  if (isLoading) return <div className="an-skeleton" style={{ height: 80 }} />;
  if (!data?.length) return (
    <div className="an-inactive-empty">
      ✅ Все активны — нет сотрудников без входа 3+ дней
    </div>
  );

  return (
    <div className="an-inactive-list">
      {data.map(u => (
        <Link key={u.user_id} to={`/admin/staff/${u.user_id}`} className="an-inactive-row">
          <div className="an-inactive-name">{fullName(u)}</div>
          <div className="an-inactive-role">{roleBadge(u.roles)}</div>
          <div className="an-inactive-days">
            {u.days_inactive === null ? "Никогда не входил" : `${u.days_inactive} дн. назад`}
          </div>
        </Link>
      ))}
    </div>
  );
}

// ── Digest modal ──────────────────────────────────────────────────────────────

function DigestModal({ onClose }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);
  const [text, setText] = useState(null);
  const [copied, setCopied] = useState(false);

  const mut = useMutation({
    mutationFn: () => api.post("/api/ai/digest").then(r => r.data.digest),
    onSuccess: (digest) => setText(digest),
  });

  // Trigger automatically when modal opens
  useState(() => { mut.mutate(); }, []);

  function copy() {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="an-overlay" onClick={onClose}>
      <div className="an-digest-modal" onClick={e => e.stopPropagation()}>
        <div className="an-digest-hd">
          <span className="an-digest-title">📊 ИИ-сводка</span>
          <button className="an-digest-close" onClick={onClose}>✕</button>
        </div>

        {mut.isPending && (
          <div className="an-digest-loading">
            <div className="an-digest-spinner" />
            <p>Генерирую сводку…</p>
          </div>
        )}

        {mut.isError && (
          <div className="an-digest-error">
            <p>Не удалось сгенерировать сводку.</p>
            <button className="an-digest-retry" onClick={() => mut.mutate()}>Повторить</button>
          </div>
        )}

        {text && (
          <>
            <div className="an-digest-body">{text}</div>
            <button className="an-digest-copy" onClick={copy}>
              {copied ? "✅ Скопировано" : "📋 Скопировать"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Analytics() {
  const [digestOpen, setDigestOpen] = useState(false);
  const { data: overview, isLoading: ovLoading } = useOverview();
  const { data: courses,  isLoading: crsLoading }  = useCourses();
  const { data: staff,    isLoading: stfLoading }   = useStaff();
  const { data: tests,    isLoading: tstLoading }   = useTests();
  const { data: inactive, isLoading: inLoading }    = useInactive();
  const { data: academy,  isLoading: acLoading }    = useAcademy();

  return (
    <div className="an-page">
      <header className="an-header">
        <Link to="/" className="an-back">‹</Link>
        <span className="an-header-title">Аналитика</span>
        <button className="an-digest-btn" onClick={() => setDigestOpen(true)}>
          🤖 ИИ-сводка
        </button>
      </header>

      {digestOpen && <DigestModal onClose={() => setDigestOpen(false)} />}

      {/* Overview cards */}
      <div className="an-cards">
        <StatCard icon="👥" label="Сотрудников" value={ovLoading ? "…" : overview?.total_users} />
        <StatCard icon="📚" label="Ср. прогресс" value={ovLoading ? "…" : `${overview?.avg_progress ?? 0}%`} sub="по всем урокам" />
        <StatCard icon="🎓" label="Завершили курс" value={ovLoading ? "…" : overview?.fully_completed_users} />
        <StatCard
          icon="⚠"
          label="Не заходили 3+ дн."
          value={ovLoading ? "…" : overview?.inactive_count ?? 0}
          accent={(overview?.inactive_count ?? 0) > 0 ? "warn" : null}
        />
      </div>

      {/* Courses */}
      <div className="an-section-label">Курсы — конверсия</div>
      <CoursesSection data={courses} isLoading={crsLoading} />

      {/* Staff table */}
      <div className="an-section-label">Активность сотрудников</div>
      <StaffTable data={staff} isLoading={stfLoading} />

      {/* Problem tests */}
      <div className="an-section-label">Проблемные тесты — топ 5</div>
      <ProblemTests data={tests} isLoading={tstLoading} />

      {/* Academy */}
      <div className="an-section-label">Академия новичков</div>
      <AcademySection data={academy} isLoading={acLoading} />

      {/* Inactive */}
      <div className="an-section-label" style={{ color: inactive?.length ? "#ff6b35" : undefined }}>
        {inactive?.length ? `⚠ Не заходили давно (${inactive.length})` : "Не заходили давно"}
      </div>
      <InactiveSection data={inactive} isLoading={inLoading} />
    </div>
  );
}

import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../api";
import "./Courses.css";

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_LABELS = {
  superadmin: "Суперадмин", owner: "Владелец",
  admin: "Администратор", manager: "Менеджер",
  senior_master: "Старший мастер", teacher: "Преподаватель", master: "Мастер",
};
const ALL_ROLES = Object.keys(ROLE_LABELS);

// ── API hooks ─────────────────────────────────────────────────────────────────

const useCourses = () =>
  useQuery({
    queryKey: ["courses"],
    queryFn: () => api.get("/api/courses/").then(r => r.data),
    placeholderData: [],
    retry: false,
  });

function useMut(fn, keys) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => keys.forEach(k => qc.invalidateQueries({ queryKey: k })),
  });
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function Err({ msg }) {
  return msg ? <p className="c-err">{msg}</p> : null;
}

function Spinner() {
  return <span className="c-spinner" />;
}

function RolePicker({ selected, onChange }) {
  const toggle = r => onChange(selected.includes(r) ? selected.filter(x => x !== r) : [...selected, r]);
  return (
    <div className="c-role-grid">
      {ALL_ROLES.map(r => (
        <button key={r} type="button"
          className={`c-chip ${selected.includes(r) ? "c-chip--on" : ""}`}
          onClick={() => toggle(r)}>{ROLE_LABELS[r]}</button>
      ))}
    </div>
  );
}

// ── Modal: import course from JSON ───────────────────────────────────────────

function ImportCourseModal({ onClose }) {
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [parseErr, setParseErr] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  function onFileChange(e) {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setParsed(null);
    setParseErr(null);
    setErr(null);
    setResult(null);
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        setParsed(JSON.parse(ev.target.result));
      } catch {
        setParseErr("Не удалось разобрать JSON файл. Проверьте формат.");
      }
    };
    reader.readAsText(f);
  }

  async function submit() {
    if (!parsed) return;
    setLoading(true);
    setErr(null);
    try {
      const { data } = await api.post("/api/courses/import", parsed);
      setResult(data);
      qc.invalidateQueries({ queryKey: ["courses"] });
    } catch (e) {
      setErr(e?.response?.data?.detail ?? "Ошибка при импорте");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="c-overlay" onClick={onClose}>
      <div className="c-modal c-modal--sm" onClick={e => e.stopPropagation()}>
        <div className="c-modal-hd">
          <span className="c-modal-title">Импорт курса</span>
          <button className="c-close" onClick={onClose}>✕</button>
        </div>
        <div className="c-form">
          {result ? (
            <div className="ci-result">
              <div className="ci-result-icon">✓</div>
              <p className="ci-result-title">{result.title}</p>
              <div className="ci-result-stats">
                <span>{result.modules} модул.</span>
                <span>{result.lessons} уроков</span>
                <span>{result.tests} тестов</span>
              </div>
              <button className="c-btn-primary" onClick={onClose}>Готово</button>
            </div>
          ) : (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                style={{ display: "none" }}
                onChange={onFileChange}
              />
              <div
                className={`ci-drop ${file ? "ci-drop--has-file" : ""}`}
                onClick={() => fileRef.current?.click()}
              >
                {file ? (
                  <>
                    <span className="ci-file-icon">📄</span>
                    <span className="ci-file-name">{file.name}</span>
                    {parsed && (
                      <span className="ci-file-hint">
                        {parsed.modules?.length ?? 0} модул. ·{" "}
                        {parsed.modules?.reduce((s, m) => s + (m.lessons?.length ?? 0), 0)} уроков
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="ci-drop-icon">📥</span>
                    <span className="ci-drop-text">Нажмите чтобы выбрать JSON файл</span>
                  </>
                )}
              </div>
              {parseErr && <p className="c-err">{parseErr}</p>}
              {err && <p className="c-err">{err}</p>}
              <button
                className="c-btn-primary"
                onClick={submit}
                disabled={!parsed || loading}
              >
                {loading ? <Spinner /> : "Импортировать"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Modal: create course ──────────────────────────────────────────────────────

function CreateCourseModal({ onClose }) {
  const [form, setForm] = useState({ title: "", description: "", roles: [] });
  const [err, setErr] = useState(null);
  const mut = useMut(
    data => api.post("/api/courses/", data).then(r => r.data),
    [["courses"]]
  );

  const submit = e => {
    e.preventDefault();
    if (!form.title.trim()) { setErr("Введите название курса"); return; }
    setErr(null);
    mut.mutate(form, { onSuccess: onClose, onError: e => setErr(e?.response?.data?.detail ?? "Ошибка") });
  };

  return (
    <div className="c-overlay" onClick={onClose}>
      <div className="c-modal" onClick={e => e.stopPropagation()}>
        <div className="c-modal-hd">
          <span className="c-modal-title">Новый курс</span>
          <button className="c-close" onClick={onClose}>✕</button>
        </div>
        <form className="c-form" onSubmit={submit}>
          <label className="c-label">Название</label>
          <input className="c-input" placeholder="Базовый курс мастера"
            value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <label className="c-label">Описание</label>
          <textarea className="c-input c-textarea" rows={3} placeholder="Краткое описание…"
            value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <label className="c-label">Доступ для ролей</label>
          <RolePicker selected={form.roles} onChange={roles => setForm(f => ({ ...f, roles }))} />
          <Err msg={err} />
          <button className="c-btn-primary" type="submit" disabled={mut.isPending}>
            {mut.isPending ? <Spinner /> : "Создать курс"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Confirm delete dialog ─────────────────────────────────────────────────────

function ConfirmDeleteModal({ title, onConfirm, onClose, loading }) {
  return (
    <div className="c-overlay" onClick={onClose}>
      <div className="c-modal c-modal--sm" onClick={e => e.stopPropagation()}>
        <div className="c-modal-hd">
          <span className="c-modal-title">Удалить курс?</span>
          <button className="c-close" onClick={onClose}>✕</button>
        </div>
        <div className="c-form">
          <p className="c-confirm-text">
            Удалить <strong>«{title}»</strong>?<br />
            Это действие нельзя отменить — все модули, уроки и тесты будут удалены.
          </p>
          <button className="c-btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? <Spinner /> : "Да, удалить"}
          </button>
          <button className="c-btn-ghost" onClick={onClose} disabled={loading}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Course list card ──────────────────────────────────────────────────────────

function CourseListCard({ course }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/api/courses/${course.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses"] }),
  });

  return (
    <div className="course-card">
      <div className="course-card-top">
        <div className="course-card-info">
          <div className="course-name">{course.title}</div>
          <div className="course-meta">
            {course.module_count} мод. ·{" "}
            {course.roles?.map(r => ROLE_LABELS[r] ?? r).join(", ") || "Все роли"}
          </div>
        </div>
        <span className={`course-status ${course.is_active ? "cs--active" : "cs--off"}`}>
          {course.is_active ? "Активен" : "Архив"}
        </span>
      </div>
      <div className="course-card-footer">
        <button className="course-del-btn" onClick={() => setConfirming(true)}>
          🗑 Удалить
        </button>
        <Link to={`/admin/courses/${course.id}`} className="course-open-btn">
          Открыть →
        </Link>
      </div>
      {confirming && (
        <ConfirmDeleteModal
          title={course.title}
          onConfirm={() => deleteMut.mutate(null, { onSuccess: () => setConfirming(false) })}
          onClose={() => setConfirming(false)}
          loading={deleteMut.isPending}
        />
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Courses() {
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const { data: courses = [], isLoading } = useCourses();

  return (
    <div className="courses-page">
      <header className="courses-header">
        <Link to="/" className="back-btn">‹</Link>
        <span className="courses-title">Курсы</span>
        <div className="courses-header-actions">
          <button className="import-btn" onClick={() => setImporting(true)} title="Импортировать курс">
            📥
          </button>
          <button className="add-btn" onClick={() => setCreating(true)}>＋</button>
        </div>
      </header>

      <div className="courses-list">
        {isLoading
          ? [0, 1, 2].map(i => <div key={i} className="course-card course-card--skeleton" />)
          : courses.length === 0
            ? (
              <div className="courses-empty">
                <p>Курсов пока нет</p>
                <button className="c-btn-primary" onClick={() => setCreating(true)}>
                  Создать первый курс
                </button>
              </div>
            )
            : courses.map(c => <CourseListCard key={c.id} course={c} />)
        }
      </div>

      {creating && <CreateCourseModal onClose={() => setCreating(false)} />}
      {importing && <ImportCourseModal onClose={() => setImporting(false)} />}
    </div>
  );
}

import { useState, useEffect } from "react";
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

// ── Modal: create course ──────────────────────────────────────────────────────

function CreateCourseModal({ onClose }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);
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

// ── Course list card ──────────────────────────────────────────────────────────

function CourseListCard({ course }) {
  return (
    <Link to={`/admin/courses/${course.id}`} className="course-card course-card--link">
      <div className="course-card-hd">
        <div className="course-card-left">
          <span className="course-arrow">▸</span>
          <div>
            <div className="course-name">{course.title}</div>
            <div className="course-meta">
              {course.module_count} модул. ·{" "}
              {course.roles?.map(r => ROLE_LABELS[r] ?? r).join(", ") || "Нет ролей"}
            </div>
          </div>
        </div>
        <span className={`course-status ${course.is_active ? "cs--active" : "cs--off"}`}>
          {course.is_active ? "Активен" : "Архив"}
        </span>
      </div>
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Courses() {
  const [creating, setCreating] = useState(false);
  const { data: courses = [], isLoading } = useCourses();

  return (
    <div className="courses-page">
      <header className="courses-header">
        <Link to="/" className="back-btn">‹</Link>
        <span className="courses-title">Курсы</span>
        <button className="add-btn" onClick={() => setCreating(true)}>＋</button>
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
    </div>
  );
}

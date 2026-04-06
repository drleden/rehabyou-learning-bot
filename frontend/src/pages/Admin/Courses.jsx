import { useState } from "react";
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
  useQuery({ queryKey: ["courses"], queryFn: () => api.get("/api/courses/").then(r => r.data), placeholderData: [], retry: false });

const useCourse = (id) =>
  useQuery({ queryKey: ["course", id], queryFn: () => api.get(`/api/courses/${id}`).then(r => r.data), enabled: id != null, retry: false });

function useMut(fn, keys) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => keys.forEach(k => qc.invalidateQueries({ queryKey: k })) });
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

// ── Modal: create module ──────────────────────────────────────────────────────

function CreateModuleModal({ courseId, onClose }) {
  const [title, setTitle] = useState("");
  const [err, setErr] = useState(null);
  const mut = useMut(
    data => api.post(`/api/courses/${courseId}/modules`, data).then(r => r.data),
    [["course", courseId]]
  );

  const submit = e => {
    e.preventDefault();
    if (!title.trim()) { setErr("Введите название модуля"); return; }
    setErr(null);
    mut.mutate({ title }, { onSuccess: onClose, onError: e => setErr(e?.response?.data?.detail ?? "Ошибка") });
  };

  return (
    <div className="c-overlay" onClick={onClose}>
      <div className="c-modal c-modal--sm" onClick={e => e.stopPropagation()}>
        <div className="c-modal-hd">
          <span className="c-modal-title">Новый модуль</span>
          <button className="c-close" onClick={onClose}>✕</button>
        </div>
        <form className="c-form" onSubmit={submit}>
          <label className="c-label">Название модуля</label>
          <input className="c-input" placeholder="Модуль 1 — Введение"
            value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          <Err msg={err} />
          <button className="c-btn-primary" type="submit" disabled={mut.isPending}>
            {mut.isPending ? <Spinner /> : "Создать"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Modal: create / edit lesson ───────────────────────────────────────────────

function LessonModal({ moduleId, lesson, courseId, onClose }) {
  const editing = !!lesson;
  const [form, setForm] = useState({
    title:     lesson?.title     ?? "",
    content:   lesson?.content   ?? "",
    video_url: lesson?.video_url ?? "",
    status:    lesson?.status    ?? "draft",
  });
  const [err, setErr] = useState(null);

  const createMut = useMut(
    data => api.post(`/api/courses/modules/${moduleId}/lessons`, data).then(r => r.data),
    [["course", courseId]]
  );
  const editMut = useMut(
    data => api.patch(`/api/courses/lessons/${lesson?.id}`, data).then(r => r.data),
    [["course", courseId]]
  );
  const mut = editing ? editMut : createMut;

  const submit = e => {
    e.preventDefault();
    if (!form.title.trim()) { setErr("Введите название урока"); return; }
    setErr(null);
    mut.mutate(
      { ...form, video_url: form.video_url || null, content: form.content || null },
      { onSuccess: onClose, onError: e => setErr(e?.response?.data?.detail ?? "Ошибка") }
    );
  };

  return (
    <div className="c-overlay" onClick={onClose}>
      <div className="c-modal" onClick={e => e.stopPropagation()}>
        <div className="c-modal-hd">
          <span className="c-modal-title">{editing ? "Редактировать урок" : "Новый урок"}</span>
          <button className="c-close" onClick={onClose}>✕</button>
        </div>
        <form className="c-form" onSubmit={submit}>
          <label className="c-label">Название</label>
          <input className="c-input" placeholder="Название урока"
            value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />

          <label className="c-label">Текст урока</label>
          <textarea className="c-input c-textarea" rows={5} placeholder="Содержимое урока…"
            value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} />

          <label className="c-label">URL видео</label>
          <input className="c-input" placeholder="https://…"
            value={form.video_url} onChange={e => setForm(f => ({ ...f, video_url: e.target.value }))} />

          {editing && (
            <>
              <label className="c-label">Статус</label>
              <div className="c-status-row">
                {["draft", "published"].map(s => (
                  <button key={s} type="button"
                    className={`c-chip ${form.status === s ? "c-chip--on" : ""}`}
                    onClick={() => setForm(f => ({ ...f, status: s }))}>
                    {s === "draft" ? "Черновик" : "Опубликован"}
                  </button>
                ))}
              </div>
            </>
          )}

          <Err msg={err} />
          <button className="c-btn-primary" type="submit" disabled={mut.isPending}>
            {mut.isPending ? <Spinner /> : editing ? "Сохранить" : "Создать урок"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Lesson row ────────────────────────────────────────────────────────────────

function LessonRow({ lesson, courseId, moduleId, lessons, index }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const deleteMut = useMut(
    () => api.delete(`/api/courses/lessons/${lesson.id}`),
    [["course", courseId]]
  );

  const reorder = async (dir) => {
    const ordered = [...lessons].sort((a, b) => a.position - b.position);
    const idx = ordered.findIndex(l => l.id === lesson.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= ordered.length) return;
    const ids = ordered.map(l => l.id);
    [ids[idx], ids[swapIdx]] = [ids[swapIdx], ids[idx]];
    await api.patch(`/api/courses/modules/${moduleId}/reorder`, { lesson_ids: ids });
    qc.invalidateQueries({ queryKey: ["course", courseId] });
  };

  return (
    <>
      <div className="lesson-row">
        <div className="lesson-order">
          <button className="order-btn" onClick={() => reorder(-1)} title="Вверх">↑</button>
          <button className="order-btn" onClick={() => reorder(1)}  title="Вниз">↓</button>
        </div>
        <div className="lesson-body">
          <span className="lesson-title">{lesson.title}</span>
          {lesson.video_url && <span className="lesson-has-video">▶ видео</span>}
        </div>
        <span className={`lesson-status ${lesson.status === "published" ? "ls--pub" : "ls--draft"}`}>
          {lesson.status === "published" ? "Опубликован" : "Черновик"}
        </span>
        <div className="lesson-actions">
          <button className="la-btn la-btn--edit" onClick={() => setEditing(true)}>✎</button>
          <button className="la-btn la-btn--del"
            onClick={() => { if (window.confirm(`Удалить урок «${lesson.title}»?`)) deleteMut.mutate(); }}>
            {deleteMut.isPending ? "…" : "✕"}
          </button>
        </div>
      </div>
      {editing && (
        <LessonModal lesson={lesson} moduleId={moduleId} courseId={courseId} onClose={() => setEditing(false)} />
      )}
    </>
  );
}

// ── Module block ──────────────────────────────────────────────────────────────

function ModuleBlock({ module, courseId }) {
  const [open, setOpen] = useState(true);
  const [addingLesson, setAddingLesson] = useState(false);
  const sorted = [...(module.lessons ?? [])].sort((a, b) => a.position - b.position);

  return (
    <div className="mod-block">
      <button className="mod-header" onClick={() => setOpen(o => !o)}>
        <span className="mod-arrow">{open ? "▾" : "▸"}</span>
        <span className="mod-title">{module.title}</span>
        <span className="mod-count">{module.lessons?.length ?? 0} ур.</span>
      </button>

      {open && (
        <div className="mod-body">
          {sorted.length === 0
            ? <p className="mod-empty">Уроков нет — добавьте первый</p>
            : sorted.map((l, i) => (
                <LessonRow
                  key={l.id} lesson={l} lessons={sorted}
                  courseId={courseId} moduleId={module.id} index={i}
                />
              ))
          }
          <button className="c-btn-ghost mod-add-lesson" onClick={() => setAddingLesson(true)}>
            ＋ Добавить урок
          </button>
        </div>
      )}

      {addingLesson && (
        <LessonModal moduleId={module.id} courseId={courseId} onClose={() => setAddingLesson(false)} />
      )}
    </div>
  );
}

// ── Course card ───────────────────────────────────────────────────────────────

function CourseCard({ course }) {
  const [expanded, setExpanded] = useState(false);
  const [addingModule, setAddingModule] = useState(false);

  const { data: detail, isLoading } = useCourse(expanded ? course.id : null);

  return (
    <div className="course-card">
      <button className="course-card-hd" onClick={() => setExpanded(e => !e)}>
        <div className="course-card-left">
          <span className="course-arrow">{expanded ? "▾" : "▸"}</span>
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
      </button>

      {expanded && (
        <div className="course-body">
          {isLoading
            ? <div className="c-loading">Загрузка…</div>
            : detail && (
              <>
                {detail.description && (
                  <p className="course-desc">{detail.description}</p>
                )}
                {(detail.modules ?? [])
                  .sort((a, b) => a.position - b.position)
                  .map(m => <ModuleBlock key={m.id} module={m} courseId={course.id} />)
                }
                <button className="c-btn-ghost course-add-mod" onClick={() => setAddingModule(true)}>
                  ＋ Добавить модуль
                </button>
              </>
            )
          }
        </div>
      )}

      {addingModule && (
        <CreateModuleModal courseId={course.id} onClose={() => setAddingModule(false)} />
      )}
    </div>
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
            : courses.map(c => <CourseCard key={c.id} course={c} />)
        }
      </div>

      {creating && <CreateCourseModal onClose={() => setCreating(false)} />}
    </div>
  );
}

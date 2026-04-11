import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../api";
import "./CourseDetail.css";

// ── API hooks ─────────────────────────────────────────────────────────────────

const useCourse = (id) =>
  useQuery({
    queryKey: ["course", id],
    queryFn: () => api.get(`/api/courses/${id}`).then(r => r.data),
    enabled: id != null,
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
  return msg ? <p className="cd-err">{msg}</p> : null;
}

function Spinner() {
  return <span className="cd-spinner" />;
}

// ── Modal: create module ──────────────────────────────────────────────────────

function CreateModuleModal({ courseId, onClose }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);
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
    <div className="cd-overlay" onClick={onClose}>
      <div className="cd-modal" onClick={e => e.stopPropagation()}>
        <div className="cd-modal-hd">
          <span className="cd-modal-title">Новый модуль</span>
          <button className="cd-close" onClick={onClose}>✕</button>
        </div>
        <form className="cd-form" onSubmit={submit}>
          <label className="cd-label">Название модуля</label>
          <input className="cd-input" placeholder="Модуль 1 — Введение"
            value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          <Err msg={err} />
          <button className="cd-btn-primary" type="submit" disabled={mut.isPending}>
            {mut.isPending ? <Spinner /> : "Создать"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Modal: create / edit lesson ───────────────────────────────────────────────

function LessonModal({ moduleId, lesson, courseId, onClose }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);
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
    <div className="cd-overlay" onClick={onClose}>
      <div className="cd-modal" onClick={e => e.stopPropagation()}>
        <div className="cd-modal-hd">
          <span className="cd-modal-title">{editing ? "Редактировать урок" : "Новый урок"}</span>
          <button className="cd-close" onClick={onClose}>✕</button>
        </div>
        <form className="cd-form" onSubmit={submit}>
          <label className="cd-label">Название</label>
          <input className="cd-input" placeholder="Название урока"
            value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} autoFocus />

          <label className="cd-label">Текст урока</label>
          <textarea className="cd-input cd-textarea" rows={5} placeholder="Содержимое урока…"
            value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} />

          <label className="cd-label">URL видео</label>
          <input className="cd-input" placeholder="https://…"
            value={form.video_url} onChange={e => setForm(f => ({ ...f, video_url: e.target.value }))} />

          <label className="cd-label">Статус</label>
          <div className="cd-status-row">
            {["draft", "published"].map(s => (
              <button key={s} type="button"
                className={`cd-chip ${form.status === s ? "cd-chip--on" : ""}`}
                onClick={() => setForm(f => ({ ...f, status: s }))}>
                {s === "draft" ? "Черновик" : "Опубликован"}
              </button>
            ))}
          </div>

          <Err msg={err} />
          <button className="cd-btn-primary" type="submit" disabled={mut.isPending}>
            {mut.isPending ? <Spinner /> : editing ? "Сохранить" : "Создать урок"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Lesson row ────────────────────────────────────────────────────────────────

function LessonRow({ lesson, courseId, moduleId, lessons }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const deleteMut = useMut(
    () => api.delete(`/api/courses/lessons/${lesson.id}`),
    [["course", courseId]]
  );

  const publishMut = useMut(
    () => api.patch(`/api/courses/lessons/${lesson.id}/publish`).then(r => r.data),
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

  const isPublished = lesson.status === "published";

  return (
    <>
      <div className="cd-lesson-row">
        <div className="cd-lesson-order">
          <button className="cd-order-btn" onClick={() => reorder(-1)} title="Вверх">↑</button>
          <button className="cd-order-btn" onClick={() => reorder(1)} title="Вниз">↓</button>
        </div>

        <div className="cd-lesson-body">
          <span className="cd-lesson-title">{lesson.title}</span>
          <div className="cd-lesson-meta">
            {lesson.video_url && <span className="cd-lesson-tag cd-lesson-tag--video">▶ видео</span>}
            {lesson.content   && <span className="cd-lesson-tag">📄 текст</span>}
          </div>
        </div>

        <span className={`cd-badge ${isPublished ? "cd-badge--pub" : "cd-badge--draft"}`}>
          {isPublished ? "Опубликован" : "Черновик"}
        </span>

        <div className="cd-lesson-actions">
          <button
            className={`cd-action-btn cd-action-btn--pub ${publishMut.isPending ? "cd-action-btn--loading" : ""}`}
            onClick={() => publishMut.mutate()}
            title={isPublished ? "Снять с публикации" : "Опубликовать"}
            disabled={publishMut.isPending}
          >
            {publishMut.isPending ? "…" : isPublished ? "↓" : "↑"}
          </button>
          <button className="cd-action-btn cd-action-btn--edit" onClick={() => setEditing(true)} title="Редактировать">
            ✎
          </button>
          <button
            className="cd-action-btn cd-action-btn--del"
            title="Удалить"
            disabled={deleteMut.isPending}
            onClick={() => {
              if (window.confirm(`Удалить урок «${lesson.title}»?`)) deleteMut.mutate();
            }}
          >
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
    <div className="cd-module">
      <button className="cd-module-hd" onClick={() => setOpen(o => !o)}>
        <span className="cd-module-arrow">{open ? "▾" : "▸"}</span>
        <span className="cd-module-title">{module.title}</span>
        <span className="cd-module-count">{module.lessons?.length ?? 0} ур.</span>
      </button>

      {open && (
        <div className="cd-module-body">
          {sorted.length === 0
            ? <p className="cd-module-empty">Уроков нет — добавьте первый</p>
            : sorted.map(l => (
                <LessonRow
                  key={l.id} lesson={l} lessons={sorted}
                  courseId={courseId} moduleId={module.id}
                />
              ))
          }
          <button className="cd-btn-ghost cd-add-lesson" onClick={() => setAddingLesson(true)}>
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CourseDetail() {
  const { id } = useParams();
  const courseId = Number(id);
  const { data: course, isLoading, isError } = useCourse(courseId);
  const [addingModule, setAddingModule] = useState(false);

  if (isLoading) {
    return (
      <div className="cd-page">
        <header className="cd-header">
          <Link to="/admin/courses" className="cd-back">‹</Link>
          <span className="cd-header-title">Загрузка…</span>
        </header>
        <div className="cd-skeleton-list">
          {[0, 1, 2].map(i => <div key={i} className="cd-module-skeleton" />)}
        </div>
      </div>
    );
  }

  if (isError || !course) {
    return (
      <div className="cd-page">
        <header className="cd-header">
          <Link to="/admin/courses" className="cd-back">‹</Link>
          <span className="cd-header-title">Ошибка</span>
        </header>
        <p className="cd-err-page">Курс не найден</p>
      </div>
    );
  }

  const sortedModules = [...(course.modules ?? [])].sort((a, b) => a.position - b.position);

  return (
    <div className="cd-page">
      <header className="cd-header">
        <Link to="/admin/courses" className="cd-back">‹</Link>
        <span className="cd-header-title">{course.title}</span>
        <span className={`cd-status-badge ${course.is_active ? "cd-status-badge--active" : "cd-status-badge--off"}`}>
          {course.is_active ? "Активен" : "Архив"}
        </span>
      </header>

      {course.description && (
        <p className="cd-course-desc">{course.description}</p>
      )}

      <div className="cd-section-label">Модули и уроки</div>

      <div className="cd-modules">
        {sortedModules.length === 0
          ? <p className="cd-empty">Модулей пока нет — добавьте первый</p>
          : sortedModules.map(m => <ModuleBlock key={m.id} module={m} courseId={courseId} />)
        }
      </div>

      <div className="cd-footer">
        <button className="cd-btn-ghost" onClick={() => setAddingModule(true)}>
          ＋ Добавить модуль
        </button>
      </div>

      {addingModule && (
        <CreateModuleModal courseId={courseId} onClose={() => setAddingModule(false)} />
      )}
    </div>
  );
}

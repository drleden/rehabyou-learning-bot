import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import api from "../../api";
import "./CourseDetail.css";

const QUILL_MODULES = {
  toolbar: [
    [{ header: [2, 3, false] }],
    ["bold", "italic"],
    [{ list: "ordered" }, { list: "bullet" }],
    ["blockquote"],
  ],
};

const QUILL_FORMATS = ["header", "bold", "italic", "list", "blockquote"];

// ── API hooks ─────────────────────────────────────────────────────────────────

const useCourse = (id) =>
  useQuery({
    queryKey: ["course", id],
    queryFn: () => api.get(`/api/courses/${id}`).then(r => r.data),
    enabled: id != null,
    retry: false,
  });

const useLessonTest = (lessonId) =>
  useQuery({
    queryKey: ["lesson-test", lessonId],
    queryFn: () => api.get(`/api/courses/lessons/${lessonId}/test`).then(r => r.data),
    enabled: !!lessonId,
    retry: false,
  });

const useLessonAssignment = (lessonId) =>
  useQuery({
    queryKey: ["lesson-assignment", lessonId],
    queryFn: () => api.get(`/api/courses/lessons/${lessonId}/assignment`).then(r => r.data),
    enabled: !!lessonId,
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
          <div className="cd-quill-wrap">
            <ReactQuill
              theme="snow"
              value={form.content}
              onChange={(val) => setForm(f => ({ ...f, content: val }))}
              modules={QUILL_MODULES}
              formats={QUILL_FORMATS}
              placeholder="Содержимое урока…"
            />
          </div>

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

// ── Modal: Test ───────────────────────────────────────────────────────────────

const EMPTY_Q = () => ({ text: "", options: ["", "", "", ""], correct_index: 0 });

function TestModal({ lesson, courseId, onClose }) {
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const { data: existingTest, isLoading } = useLessonTest(lesson.id);

  const [questions, setQuestions] = useState([]);   // staging area
  const [jsonError, setJsonError]  = useState(null);
  const [saving, setSaving]        = useState(false);
  const [saveErr, setSaveErr]      = useState(null);

  // ensure/get test, then add all staged questions
  async function handleSave() {
    if (questions.length === 0) { setSaveErr("Добавьте хотя бы один вопрос"); return; }
    setSaving(true);
    setSaveErr(null);
    try {
      // create or reuse test
      const testRes = await api.post(`/api/courses/lessons/${lesson.id}/test`, { pass_threshold: 0.95 });
      const testId = testRes.data.id;
      for (const q of questions) {
        if (!q.text.trim()) continue;
        await api.post(`/api/courses/tests/${testId}/questions`, {
          question: q.text,
          options: q.options,
          correct_index: q.correct_index,
        });
      }
      qc.invalidateQueries({ queryKey: ["lesson-test", lesson.id] });
      qc.invalidateQueries({ queryKey: ["course", courseId] });
      onClose();
    } catch (e) {
      setSaveErr(e?.response?.data?.detail ?? "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteQuestion(questionId) {
    await api.delete(`/api/courses/tests/questions/${questionId}`);
    qc.invalidateQueries({ queryKey: ["lesson-test", lesson.id] });
  }

  function addBlankQuestion() {
    setQuestions(qs => [...qs, EMPTY_Q()]);
  }

  function updateQ(idx, field, val) {
    setQuestions(qs => qs.map((q, i) => i === idx ? { ...q, [field]: val } : q));
  }

  function updateOption(qIdx, optIdx, val) {
    setQuestions(qs => qs.map((q, i) => {
      if (i !== qIdx) return q;
      const opts = [...q.options];
      opts[optIdx] = val;
      return { ...q, options: opts };
    }));
  }

  function removeStaged(idx) {
    setQuestions(qs => qs.filter((_, i) => i !== idx));
  }

  function handleFileLoad(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setJsonError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!Array.isArray(parsed.questions)) throw new Error("Ожидается поле questions[]");
        const loaded = parsed.questions.map(q => ({
          text: q.text ?? "",
          options: Array.isArray(q.options) && q.options.length === 4
            ? q.options
            : ["", "", "", ""],
          correct_index: typeof q.correct_index === "number" ? q.correct_index : 0,
        }));
        setQuestions(qs => [...qs, ...loaded]);
      } catch (err) {
        setJsonError("Неверный формат JSON: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const existingQs = existingTest?.questions ?? [];

  return (
    <div className="cd-overlay" onClick={onClose}>
      <div className="cd-modal cd-modal--wide" onClick={e => e.stopPropagation()}>
        <div className="cd-modal-hd">
          <span className="cd-modal-title">🧪 Тест — {lesson.title}</span>
          <button className="cd-close" onClick={onClose}>✕</button>
        </div>

        <div className="cd-modal-scroll">
          {/* Existing saved questions */}
          {isLoading ? (
            <div className="cd-test-loading">Загрузка…</div>
          ) : existingQs.length > 0 ? (
            <div className="cd-test-section">
              <div className="cd-test-section-title">Сохранённые вопросы ({existingQs.length})</div>
              {existingQs.map((q, i) => (
                <div key={q.id} className="cd-saved-q">
                  <div className="cd-saved-q-text">{i + 1}. {q.question}</div>
                  <div className="cd-saved-q-opts">
                    {q.options.map((opt, oi) => (
                      <span key={oi} className={`cd-saved-q-opt ${oi === q.correct_index ? "cd-saved-q-opt--correct" : ""}`}>
                        {oi === q.correct_index ? "✓ " : ""}{opt}
                      </span>
                    ))}
                  </div>
                  <button className="cd-saved-q-del" onClick={() => handleDeleteQuestion(q.id)}>✕</button>
                </div>
              ))}
            </div>
          ) : !isLoading && (
            <p className="cd-test-empty">Вопросов пока нет</p>
          )}

          {/* Staged new questions */}
          {questions.length > 0 && (
            <div className="cd-test-section">
              <div className="cd-test-section-title">Новые вопросы ({questions.length})</div>
              {questions.map((q, qi) => (
                <div key={qi} className="cd-new-q">
                  <div className="cd-new-q-hd">
                    <span className="cd-new-q-num">Вопрос {qi + 1}</span>
                    <button className="cd-close cd-close--sm" onClick={() => removeStaged(qi)}>✕</button>
                  </div>
                  <input
                    className="cd-input"
                    placeholder="Текст вопроса"
                    value={q.text}
                    onChange={e => updateQ(qi, "text", e.target.value)}
                  />
                  <div className="cd-options-grid">
                    {q.options.map((opt, oi) => (
                      <div key={oi} className="cd-option-row">
                        <input
                          type="radio"
                          name={`correct-${qi}`}
                          checked={q.correct_index === oi}
                          onChange={() => updateQ(qi, "correct_index", oi)}
                          className="cd-radio"
                        />
                        <input
                          className={`cd-input cd-input--opt ${q.correct_index === oi ? "cd-input--correct" : ""}`}
                          placeholder={`Вариант ${oi + 1}`}
                          value={opt}
                          onChange={e => updateOption(qi, oi, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="cd-correct-hint">
                    ● = правильный ответ (сейчас: вариант {q.correct_index + 1})
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="cd-test-actions">
          <button className="cd-btn-ghost" onClick={addBlankQuestion}>＋ Добавить вопрос</button>
          <button className="cd-btn-ghost" onClick={() => fileRef.current?.click()}>
            📂 Загрузить из JSON
          </button>
          <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleFileLoad} />
        </div>

        {jsonError && <p className="cd-err" style={{ margin: "0 0 8px" }}>{jsonError}</p>}
        {saveErr   && <p className="cd-err" style={{ margin: "0 0 8px" }}>{saveErr}</p>}

        <button
          className="cd-btn-primary cd-btn-primary--full"
          onClick={handleSave}
          disabled={saving || questions.length === 0}
        >
          {saving ? <Spinner /> : `Сохранить ${questions.length} вопр.`}
        </button>
      </div>
    </div>
  );
}

// ── Modal: Assignment ─────────────────────────────────────────────────────────

function AssignmentModal({ lesson, courseId, onClose }) {
  const qc = useQueryClient();
  const { data: existing } = useLessonAssignment(lesson.id);
  const [description, setDescription] = useState(existing?.description ?? "");
  const [minWords, setMinWords]        = useState(existing?.min_words ?? 50);
  const [err, setErr]                  = useState(null);

  // sync once existing loads
  const [synced, setSynced] = useState(false);
  if (existing && !synced) {
    setDescription(existing.description ?? "");
    setMinWords(existing.min_words ?? 50);
    setSynced(true);
  }

  const mut = useMutation({
    mutationFn: () =>
      api.post(`/api/courses/lessons/${lesson.id}/assignment`, {
        description,
        min_words: Number(minWords),
      }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lesson-assignment", lesson.id] });
      onClose();
    },
    onError: e => setErr(e?.response?.data?.detail ?? "Ошибка"),
  });

  return (
    <div className="cd-overlay" onClick={onClose}>
      <div className="cd-modal" onClick={e => e.stopPropagation()}>
        <div className="cd-modal-hd">
          <span className="cd-modal-title">📝 Задание — {lesson.title}</span>
          <button className="cd-close" onClick={onClose}>✕</button>
        </div>
        <div className="cd-form">
          {existing && (
            <div className="cd-assign-existing">✅ Задание уже есть — сохраните, чтобы обновить</div>
          )}
          <label className="cd-label">Описание задания</label>
          <textarea
            className="cd-input cd-textarea"
            rows={5}
            placeholder="Напишите подробное описание практического задания…"
            value={description}
            onChange={e => setDescription(e.target.value)}
            autoFocus
          />
          <label className="cd-label">Минимум слов</label>
          <input
            className="cd-input"
            type="number"
            min={10}
            value={minWords}
            onChange={e => setMinWords(e.target.value)}
          />
          <Err msg={err} />
          <button
            className="cd-btn-primary"
            onClick={() => {
              if (!description.trim()) { setErr("Введите описание задания"); return; }
              setErr(null);
              mut.mutate();
            }}
            disabled={mut.isPending}
          >
            {mut.isPending ? <Spinner /> : existing ? "Обновить задание" : "Сохранить задание"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Lesson row ────────────────────────────────────────────────────────────────

function LessonRow({ lesson, courseId, moduleId, lessons }) {
  const qc = useQueryClient();
  const [editing,    setEditing]    = useState(false);
  const [testOpen,   setTestOpen]   = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

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
          {/* Test & assignment buttons */}
          <div className="cd-lesson-extras">
            <button
              className="cd-extra-btn cd-extra-btn--test"
              onClick={() => setTestOpen(true)}
              title="Тест к уроку"
            >
              🧪 Тест
            </button>
            <button
              className="cd-extra-btn cd-extra-btn--assign"
              onClick={() => setAssignOpen(true)}
              title="Практическое задание"
            >
              📝 Задание
            </button>
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

      {editing    && <LessonModal lesson={lesson} moduleId={moduleId} courseId={courseId} onClose={() => setEditing(false)} />}
      {testOpen   && <TestModal lesson={lesson} courseId={courseId} onClose={() => setTestOpen(false)} />}
      {assignOpen && <AssignmentModal lesson={lesson} courseId={courseId} onClose={() => setAssignOpen(false)} />}
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

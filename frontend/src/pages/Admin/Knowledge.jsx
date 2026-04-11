import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import api from "../../api";
import "./Knowledge.css";

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = {
  standards:    { label: "Стандарты",   icon: "📋" },
  instructions: { label: "Инструкции",  icon: "📝" },
  useful:       { label: "Полезное",    icon: "💡" },
};

const QUILL_MODULES = {
  toolbar: [
    [{ header: [2, 3, false] }],
    ["bold", "italic", "underline"],
    [{ list: "ordered" }, { list: "bullet" }],
    ["blockquote", "link"],
    ["clean"],
  ],
};

const QUILL_FORMATS = [
  "header", "bold", "italic", "underline",
  "list", "bullet", "blockquote", "link",
];

// ── Hooks ─────────────────────────────────────────────────────────────────────

const useDocuments = () =>
  useQuery({
    queryKey: ["admin-knowledge"],
    queryFn: () => api.get("/api/knowledge/").then(r => r.data),
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric", month: "long", year: "numeric",
  }).format(new Date(iso));
}

// ── Confirm delete modal ──────────────────────────────────────────────────────

function ConfirmModal({ title, message, loading, onConfirm, onClose }) {
  return (
    <div className="ak-overlay" onClick={onClose}>
      <div className="ak-modal" onClick={e => e.stopPropagation()}>
        <div className="ak-modal-hd">
          <span className="ak-modal-title">{title}</span>
          <button className="ak-close" onClick={onClose}>✕</button>
        </div>
        <p className="ak-confirm-text">{message}</p>
        <div className="ak-form-actions">
          <button className="ak-btn ak-btn--danger" onClick={onConfirm} disabled={loading}>
            {loading ? "Удаление…" : "Удалить"}
          </button>
          <button className="ak-btn ak-btn--ghost" onClick={onClose} disabled={loading}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Document form modal (create / edit) ───────────────────────────────────────

const EMPTY_FORM = { title: "", description: "", category: "useful", content: "" };

function DocFormModal({ doc, onClose }) {
  const [form, setForm] = useState(
    doc
      ? { title: doc.title, description: doc.description ?? "", category: doc.category, content: doc.content }
      : EMPTY_FORM
  );
  const [err, setErr] = useState(null);

  const createMut = useMut(
    body => api.post("/api/knowledge/", body).then(r => r.data),
    [["admin-knowledge"], ["knowledge"]],
  );
  const updateMut = useMut(
    ({ id, body }) => api.put(`/api/knowledge/${id}`, body).then(r => r.data),
    [["admin-knowledge"], ["knowledge"]],
  );

  const loading = createMut.isPending || updateMut.isPending;

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    if (!form.title.trim()) { setErr("Введите название"); return; }
    if (!form.content.trim() || form.content === "<p><br></p>") { setErr("Введите содержимое"); return; }
    try {
      if (doc) {
        await updateMut.mutateAsync({ id: doc.id, body: form });
      } else {
        await createMut.mutateAsync(form);
      }
      onClose();
    } catch (e) {
      setErr(e?.response?.data?.detail ?? "Ошибка сохранения");
    }
  }

  return (
    <div className="ak-overlay" onClick={onClose}>
      <div className="ak-modal ak-modal--wide" onClick={e => e.stopPropagation()}>
        <div className="ak-modal-hd">
          <span className="ak-modal-title">{doc ? "Редактировать документ" : "Новый документ"}</span>
          <button className="ak-close" onClick={onClose}>✕</button>
        </div>
        <form className="ak-form" onSubmit={submit}>
          <label className="ak-label">Название</label>
          <input
            className="ak-input"
            placeholder="Название документа"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            autoFocus
          />

          <label className="ak-label">Описание (краткое)</label>
          <input
            className="ak-input"
            placeholder="Необязательно"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />

          <label className="ak-label">Категория</label>
          <div className="ak-cat-row">
            {Object.entries(CATEGORIES).map(([key, { label, icon }]) => (
              <button
                key={key}
                type="button"
                className={`ak-cat-btn ${form.category === key ? "ak-cat-btn--on" : ""}`}
                onClick={() => setForm(f => ({ ...f, category: key }))}
              >
                {icon} {label}
              </button>
            ))}
          </div>

          <label className="ak-label">Содержимое</label>
          <div className="ak-quill-wrap">
            <ReactQuill
              theme="snow"
              value={form.content}
              onChange={val => setForm(f => ({ ...f, content: val }))}
              modules={QUILL_MODULES}
              formats={QUILL_FORMATS}
              placeholder="Текст документа…"
            />
          </div>

          {err && <p className="ak-err">{err}</p>}

          <div className="ak-form-actions">
            <button className="ak-btn ak-btn--primary" type="submit" disabled={loading}>
              {loading ? "Сохранение…" : doc ? "Сохранить" : "Создать"}
            </button>
            <button className="ak-btn ak-btn--ghost" type="button" onClick={onClose} disabled={loading}>
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminKnowledge() {
  const { data: docs = [], isLoading } = useDocuments();
  const [search, setSearch] = useState("");
  const [formDoc, setFormDoc] = useState(undefined); // undefined=closed, null=new, doc=edit
  const [deleteTarget, setDeleteTarget] = useState(null);

  const deleteMut = useMut(
    id => api.delete(`/api/knowledge/${id}`),
    [["admin-knowledge"], ["knowledge"]],
  );

  async function confirmDelete() {
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // swallow — list will be stale at worst
    }
  }

  const q = search.toLowerCase();
  const filtered = docs.filter(d => d.title.toLowerCase().includes(q));

  return (
    <div className="ak-page">
      <header className="ak-header">
        <Link to="/" className="ak-back">‹</Link>
        <span className="ak-title">База знаний</span>
        <button className="ak-add-btn" onClick={() => setFormDoc(null)}>+ Добавить</button>
      </header>

      <div className="ak-search-wrap">
        <input
          className="ak-search"
          type="search"
          placeholder="Поиск документов…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="ak-loading">Загрузка…</div>
      ) : filtered.length === 0 ? (
        <div className="ak-empty">
          {search ? "Ничего не найдено" : "Документов пока нет"}
        </div>
      ) : (
        Object.entries(CATEGORIES).map(([cat, { label, icon }]) => {
          const catDocs = filtered.filter(d => d.category === cat);
          if (catDocs.length === 0) return null;
          return (
            <section key={cat} className="ak-section">
              <div className="ak-section-label">{icon} {label}</div>
              <div className="ak-cards">
                {catDocs.map(doc => (
                  <div key={doc.id} className="ak-card">
                    <div className="ak-card-body">
                      <div className="ak-card-title">{doc.title}</div>
                      {doc.description && (
                        <div className="ak-card-desc">{doc.description}</div>
                      )}
                      <div className="ak-card-date">{formatDate(doc.created_at)}</div>
                    </div>
                    <div className="ak-card-actions">
                      <button
                        className="ak-action-btn ak-action-btn--edit"
                        onClick={() => setFormDoc(doc)}
                        title="Редактировать"
                      >✏️</button>
                      <button
                        className="ak-action-btn ak-action-btn--del"
                        onClick={() => setDeleteTarget(doc)}
                        title="Удалить"
                      >🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })
      )}

      {formDoc !== undefined && (
        <DocFormModal
          doc={formDoc}
          onClose={() => setFormDoc(undefined)}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Удалить документ?"
          message={`«${deleteTarget.title}» будет удалён без возможности восстановления.`}
          loading={deleteMut.isPending}
          onConfirm={confirmDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

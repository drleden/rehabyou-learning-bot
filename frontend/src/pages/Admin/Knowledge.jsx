import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../api";
import "./Knowledge.css";

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = {
  standards:    { label: "Стандарты",   icon: "📋" },
  instructions: { label: "Инструкции",  icon: "📝" },
  useful:       { label: "Полезное",    icon: "💡" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric", month: "long", year: "numeric",
  }).format(new Date(iso));
}

function fmtSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function fileIcon(type) {
  if (type === "pdf")  return "📄";
  if (type === "docx") return "📝";
  if (type === "png" || type === "jpg") return "🖼️";
  return "📎";
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

const useDocuments = () =>
  useQuery({
    queryKey: ["admin-knowledge"],
    queryFn: () => api.get("/api/knowledge/").then(r => r.data),
    placeholderData: [],
    retry: false,
  });

// ── Confirm delete modal ──────────────────────────────────────────────────────

function ConfirmModal({ title, message, loading, onConfirm, onClose }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
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

// ── Image modal ───────────────────────────────────────────────────────────────

function ImgModal({ src, alt, onClose }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  return (
    <div className="ak-img-overlay" onClick={onClose}>
      <img className="ak-img-modal" src={src} alt={alt} onClick={e => e.stopPropagation()} />
      <button className="ak-img-close" onClick={onClose}>✕</button>
    </div>
  );
}

// ── Document form modal (create / edit) ───────────────────────────────────────

const EMPTY_FORM = { title: "", description: "", category: "useful" };

function DocFormModal({ doc, onClose }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const [form, setForm] = useState(
    doc
      ? { title: doc.title, description: doc.description ?? "", category: doc.category }
      : EMPTY_FORM
  );
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState(null);
  const fileRef = useRef(null);
  const qc = useQueryClient();

  function onFileChange(e) {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.title.trim()) { setErr("Введите название"); return; }
    if (!doc && !file) { setErr("Выберите файл"); return; }

    const fd = new FormData();
    fd.append("title", form.title.trim());
    if (form.description.trim()) fd.append("description", form.description.trim());
    fd.append("category", form.category);
    if (file) fd.append("file", file);

    setErr(null);
    setUploading(true);
    setProgress(0);

    try {
      if (doc) {
        await api.put(`/api/knowledge/${doc.id}`, fd, {
          timeout: 120_000,
          onUploadProgress: ev => {
            if (ev.total) setProgress(Math.round((ev.loaded / ev.total) * 100));
          },
        });
      } else {
        await api.post("/api/knowledge/", fd, {
          timeout: 120_000,
          onUploadProgress: ev => {
            if (ev.total) setProgress(Math.round((ev.loaded / ev.total) * 100));
          },
        });
      }
      qc.invalidateQueries({ queryKey: ["admin-knowledge"] });
      qc.invalidateQueries({ queryKey: ["knowledge"] });
      onClose();
    } catch (ex) {
      setErr(ex?.response?.data?.detail ?? "Ошибка сохранения");
    } finally {
      setUploading(false);
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

          <label className="ak-label">
            {doc ? "Файл (оставьте пустым, чтобы не менять)" : "Файл"}
          </label>

          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.png,.jpg,.jpeg"
            style={{ display: "none" }}
            onChange={onFileChange}
          />

          <div
            className={`ak-file-drop ${file ? "ak-file-drop--has" : ""}`}
            onClick={() => fileRef.current?.click()}
          >
            {file ? (
              <>
                <span className="ak-file-drop-icon">{fileIcon(file.name.split(".").pop())}</span>
                <div className="ak-file-drop-info">
                  <span className="ak-file-drop-name">{file.name}</span>
                  <span className="ak-file-drop-size">{fmtSize(file.size)}</span>
                </div>
              </>
            ) : doc?.file_url ? (
              <>
                <span className="ak-file-drop-icon">{fileIcon(doc.file_type)}</span>
                <div className="ak-file-drop-info">
                  <span className="ak-file-drop-name">Текущий файл: {doc.file_type?.toUpperCase()}</span>
                  {doc.file_size && <span className="ak-file-drop-size">{fmtSize(doc.file_size)}</span>}
                </div>
                <span className="ak-file-drop-hint">Нажмите для замены</span>
              </>
            ) : (
              <>
                <span className="ak-file-drop-icon">📥</span>
                <span className="ak-file-drop-text">Нажмите для выбора файла</span>
                <span className="ak-file-drop-sub">PDF, DOCX, PNG, JPG · до 20 МБ</span>
              </>
            )}
          </div>

          {uploading && (
            <div className="ak-progress-wrap">
              <div className="ak-progress-bar" style={{ width: `${progress}%` }} />
              <span className="ak-progress-pct">{progress}%</span>
            </div>
          )}

          {err && <p className="ak-err">{err}</p>}

          <div className="ak-form-actions">
            <button className="ak-btn ak-btn--primary" type="submit" disabled={uploading}>
              {uploading ? "Загрузка…" : doc ? "Сохранить" : "Создать"}
            </button>
            <button className="ak-btn ak-btn--ghost" type="button" onClick={onClose} disabled={uploading}>
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Document card ─────────────────────────────────────────────────────────────

function DocCard({ doc, onEdit, onDelete }) {
  const [viewLoading, setViewLoading] = useState(false);
  const [imgModal, setImgModal] = useState(null);

  async function handleView() {
    setViewLoading(true);
    try {
      const { data } = await api.get(`/api/knowledge/${doc.id}`);
      if (!data.view_url) return;
      if (data.file_type === "pdf") {
        window.open(data.view_url, "_blank", "noopener");
      } else if (data.file_type === "docx") {
        window.open(
          `https://docs.google.com/viewer?url=${encodeURIComponent(data.view_url)}&embedded=true`,
          "_blank",
          "noopener",
        );
      } else {
        setImgModal(data.view_url);
      }
    } catch { /* ignore */ }
    finally { setViewLoading(false); }
  }

  return (
    <div className="ak-card">
      <div className="ak-card-file-icon">{fileIcon(doc.file_type)}</div>
      <div className="ak-card-body">
        <div className="ak-card-title">{doc.title}</div>
        {doc.description && <div className="ak-card-desc">{doc.description}</div>}
        <div className="ak-card-meta">
          {doc.file_size ? <span className="ak-card-size">{fmtSize(doc.file_size)}</span> : null}
          <span className="ak-card-date">{formatDate(doc.created_at)}</span>
        </div>
      </div>
      <div className="ak-card-actions">
        {doc.file_url && (
          <button
            className="ak-action-btn ak-action-btn--view"
            onClick={handleView}
            disabled={viewLoading}
            title="Читать"
          >
            {viewLoading ? "⏳" : "👁️"}
          </button>
        )}
        <button
          className="ak-action-btn ak-action-btn--edit"
          onClick={() => onEdit(doc)}
          title="Редактировать"
        >
          ✏️
        </button>
        <button
          className="ak-action-btn ak-action-btn--del"
          onClick={() => onDelete(doc)}
          title="Удалить"
        >
          🗑
        </button>
      </div>

      {imgModal && (
        <ImgModal src={imgModal} alt={doc.title} onClose={() => setImgModal(null)} />
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminKnowledge() {
  const { data: docs = [], isLoading } = useDocuments();
  const [search, setSearch] = useState("");
  const [formDoc, setFormDoc] = useState(undefined); // undefined=closed, null=new, doc=edit
  const [deleteTarget, setDeleteTarget] = useState(null);
  const qc = useQueryClient();

  async function confirmDelete() {
    try {
      await api.delete(`/api/knowledge/${deleteTarget.id}`);
      qc.invalidateQueries({ queryKey: ["admin-knowledge"] });
      qc.invalidateQueries({ queryKey: ["knowledge"] });
      setDeleteTarget(null);
    } catch { /* swallow */ }
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
                  <DocCard
                    key={doc.id}
                    doc={doc}
                    onEdit={setFormDoc}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}

      {formDoc !== undefined && (
        <DocFormModal doc={formDoc} onClose={() => setFormDoc(undefined)} />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Удалить документ?"
          message={`«${deleteTarget.title}» будет удалён без возможности восстановления.`}
          loading={false}
          onConfirm={confirmDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

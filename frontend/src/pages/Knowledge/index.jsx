import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "../../api";
import "./Knowledge.css";

const CATEGORIES = {
  standards:    { label: "Стандарты",   icon: "📋" },
  instructions: { label: "Инструкции",  icon: "📝" },
  useful:       { label: "Полезное",    icon: "💡" },
};

const useDocuments = () =>
  useQuery({
    queryKey: ["knowledge"],
    queryFn: () => api.get("/api/knowledge/").then(r => r.data),
    placeholderData: [],
    retry: false,
  });

const useDocument = (id) =>
  useQuery({
    queryKey: ["knowledge-doc", id],
    queryFn: () => api.get(`/api/knowledge/${id}`).then(r => r.data),
    enabled: id != null,
    retry: false,
  });

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
  return "📄";
}

// ── Image viewer modal ────────────────────────────────────────────────────────

function ImgModal({ src, alt, onClose }) {
  return (
    <div className="kn-img-overlay" onClick={onClose}>
      <img className="kn-img-modal" src={src} alt={alt} onClick={e => e.stopPropagation()} />
      <button className="kn-img-close" onClick={onClose}>✕</button>
    </div>
  );
}

// ── Document reader (for legacy text-content docs) ────────────────────────────

function DocReader({ docId, onBack }) {
  const { data: doc, isLoading } = useDocument(docId);
  const cat = doc ? CATEGORIES[doc.category] : null;

  return (
    <div className="kn-reader">
      <header className="kn-reader-hd">
        <button className="kn-reader-back" onClick={onBack}>‹ Назад</button>
        <span className="kn-reader-hd-title">{doc?.title ?? ""}</span>
      </header>

      {isLoading ? (
        <div className="kn-reader-loading">Загрузка…</div>
      ) : doc ? (
        <div className="kn-reader-body">
          <h1 className="kn-reader-title">{doc.title}</h1>
          {doc.description && <p className="kn-reader-desc">{doc.description}</p>}
          <div className="kn-reader-meta">
            {cat && <span className="kn-reader-cat">{cat.icon} {cat.label}</span>}
            <span>{formatDate(doc.created_at)}</span>
          </div>
          <div className="kn-reader-content" dangerouslySetInnerHTML={{ __html: doc.content }} />
        </div>
      ) : (
        <div className="kn-empty">Документ не найден</div>
      )}
    </div>
  );
}

// ── Document card ─────────────────────────────────────────────────────────────

function KnCard({ doc, onOpenReader }) {
  const [loading, setLoading] = useState(false);
  const [imgModal, setImgModal] = useState(null);

  async function handleView() {
    setLoading(true);
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
    finally { setLoading(false); }
  }

  function handleClick() {
    if (doc.file_url) {
      handleView();
    } else {
      onOpenReader(doc.id);
    }
  }

  return (
    <>
      <button className="kn-card" onClick={handleClick}>
        <span className="kn-card-icon">{fileIcon(doc.file_type)}</span>
        <div className="kn-card-body">
          <div className="kn-card-title">{doc.title}</div>
          {doc.description && (
            <div className="kn-card-desc">{doc.description}</div>
          )}
          <div className="kn-card-meta">
            {doc.file_size ? (
              <span className="kn-file-size">{fmtSize(doc.file_size)}</span>
            ) : null}
            <span className="kn-card-date">{formatDate(doc.created_at)}</span>
          </div>
        </div>
        <span className="kn-card-arrow">
          {loading ? "⏳" : doc.file_url ? "👁️" : "›"}
        </span>
      </button>

      {imgModal && (
        <ImgModal src={imgModal} alt={doc.title} onClose={() => setImgModal(null)} />
      )}
    </>
  );
}

// ── List view ─────────────────────────────────────────────────────────────────

export default function Knowledge() {
  const { data: docs = [], isLoading } = useDocuments();
  const [search, setSearch] = useState("");
  const [openDocId, setOpenDocId] = useState(null);

  if (openDocId != null) {
    return <DocReader docId={openDocId} onBack={() => setOpenDocId(null)} />;
  }

  const q = search.toLowerCase();
  const filtered = docs.filter(d => d.title.toLowerCase().includes(q));

  return (
    <div className="kn-page">
      <header className="kn-header">
        <Link to="/" className="kn-back">‹</Link>
        <span className="kn-title">База знаний</span>
      </header>

      <div className="kn-search-wrap">
        <input
          className="kn-search"
          type="search"
          placeholder="Поиск документов…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="kn-loading">Загрузка…</div>
      ) : filtered.length === 0 ? (
        <div className="kn-empty">
          {search ? "Ничего не найдено" : "Документов пока нет"}
        </div>
      ) : (
        Object.entries(CATEGORIES).map(([cat, { label, icon }]) => {
          const catDocs = filtered.filter(d => d.category === cat);
          if (catDocs.length === 0) return null;
          return (
            <section key={cat} className="kn-section">
              <div className="kn-section-label">{icon} {label}</div>
              <div className="kn-cards">
                {catDocs.map(doc => (
                  <KnCard key={doc.id} doc={doc} onOpenReader={setOpenDocId} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

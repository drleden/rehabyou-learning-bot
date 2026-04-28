import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDocuments } from '../api/documents';

var CATEGORY_LABELS = {
  master: { title: 'Для мастеров', icon: '💆' },
  admin: { title: 'Для администраторов', icon: '🗂' },
  brand: { title: 'Бренд', icon: '✨' },
};

export default function Documents() {
  var navigate = useNavigate();
  var _d = useState([]); var docs = _d[0]; var setDocs = _d[1];
  var _l = useState(true); var loading = _l[0]; var setLoading = _l[1];

  useEffect(function() {
    getDocuments().then(setDocs).catch(function(){}).finally(function() { setLoading(false); });
  }, []);

  var grouped = {};
  docs.forEach(function(d) {
    if (!grouped[d.category]) grouped[d.category] = [];
    grouped[d.category].push(d);
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen pb-20">
      <header className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-3">
          <button onClick={function() { navigate('/knowledge'); }} className="text-gray-400">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-extrabold text-gray-900">Документы</h1>
        </div>
      </header>

      <div className="px-4 mt-3 space-y-5">
        {Object.keys(CATEGORY_LABELS).map(function(cat) {
          var items = grouped[cat];
          if (!items || items.length === 0) return null;
          var label = CATEGORY_LABELS[cat];
          return (
            <section key={cat}>
              <h2 className="font-bold text-sm text-gray-900 mb-2">
                {label.icon} {label.title}
              </h2>
              <div className="space-y-2">
                {items.map(function(doc) {
                  return (
                    <button
                      key={doc.id}
                      onClick={function() { navigate('/documents/' + doc.id); }}
                      className="w-full flex items-center gap-3 p-3 bg-surface rounded-2xl text-left hover:bg-gray-100 transition-colors active:scale-[0.99]"
                    >
                      <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                        <span className="text-lg">📄</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm text-gray-900 line-clamp-2">{doc.title}</h3>
                      </div>
                      <svg className="w-5 h-5 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
        {docs.length === 0 && (
          <p className="text-center text-gray-400 py-12 text-sm">Нет доступных документов</p>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getDocument } from '../api/documents';

export default function DocumentView() {
  var params = useParams();
  var id = params.id;
  var navigate = useNavigate();
  var _d = useState(null); var doc = _d[0]; var setDoc = _d[1];
  var _l = useState(true); var loading = _l[0]; var setLoading = _l[1];

  useEffect(function() {
    setLoading(true);
    getDocument(id).then(setDoc).catch(function() { navigate('/documents'); }).finally(function() { setLoading(false); });
  }, [id]);

  if (loading || !doc) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen flex flex-col">
      <header className="flex-shrink-0 sticky top-0 z-30 bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={function() { navigate('/documents'); }} className="text-gray-400">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="font-bold text-sm text-gray-900 truncate flex-1">{doc.title}</h1>
        </div>
      </header>
      <iframe
        src={doc.url}
        title={doc.title}
        sandbox="allow-same-origin allow-scripts"
        className="flex-1 w-full border-0"
        style={{ minHeight: 'calc(100vh - 56px)' }}
      />
    </div>
  );
}

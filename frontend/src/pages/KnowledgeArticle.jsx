import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Markdown from 'react-markdown';
import { getArticle } from '../api/knowledge';

export default function KnowledgeArticle() {
  var params = useParams();
  var id = params.id;
  var navigate = useNavigate();
  var _s = useState(null); var article = _s[0]; var setArticle = _s[1];
  var _l = useState(true); var loading = _l[0]; var setLoading = _l[1];

  useEffect(function() {
    setLoading(true);
    getArticle(id).then(setArticle).catch(function() { navigate('/knowledge'); }).finally(function() { setLoading(false); });
  }, [id]);

  if (loading || !article) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen pb-20">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={function() { navigate('/knowledge'); }} className="text-gray-400">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="font-bold text-sm text-gray-900 truncate flex-1">{article.title}</h1>
        </div>
      </header>

      <div className="px-4 pt-4">
        <h2 className="text-xl font-extrabold text-gray-900 leading-tight">{article.title}</h2>

        {article.tags && article.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {article.tags.map(function(t) {
              return <span key={t} className="text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded-full font-medium">{t}</span>;
            })}
          </div>
        )}

        <p className="text-xs text-gray-400 mt-2">
          Обновлено {new Date(article.updated_at).toLocaleDateString('ru-RU')}
        </p>

        {article.video_url && (
          <div className="rounded-2xl overflow-hidden bg-black mt-4">
            <video src={article.video_url} controls playsInline className="w-full aspect-video" />
          </div>
        )}

        {article.content && (
          <div className="prose prose-sm prose-gray max-w-none mt-4">
            <Markdown>{article.content}</Markdown>
          </div>
        )}
      </div>
    </div>
  );
}
